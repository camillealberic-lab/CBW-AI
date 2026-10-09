// Router LLM : essaie les fournisseurs dans l'ordre, saute ceux indisponibles / en pause,
// et retombe sur un nettoyage déterministe (fallbackClean) si tout échoue.

import type { CleanOptions, CleanResult, ProviderErrorKind, ProviderId } from '../shared/types.ts';
import { ProviderError } from '../shared/types.ts';
import { ALL_PROVIDERS, loadConfig } from './config.ts';
import type { LLMConfig } from './config.ts';
import { GENERATION, buildMessages, fallbackClean, isEmptyDictation, postProcess, shouldSkipLLM } from './prompt.ts';
import { isUserAbort } from './providers/common.ts';
import type { DictaProvider, DictaProviderError } from './providers/common.ts';
import { createGeminiProvider } from './providers/gemini.ts';
import { createGroqProvider } from './providers/groq.ts';
import { createOllamaProvider, warmupOllama } from './providers/ollama.ts';
import { createOpenRouterProvider } from './providers/openrouter.ts';
import { createZaiProvider } from './providers/zai.ts';
import { createMistralProvider } from './providers/mistral.ts';
import { createCloudflareProvider } from './providers/cloudflare.ts';
import * as quota from './quota.ts';
import { redact } from '../shared/redact.ts';
import type { QuotaInfo } from './quota.ts';

export type { DictaProvider } from './providers/common.ts';

const FACTORIES: Record<ProviderId, (cfg: LLMConfig) => DictaProvider> = {
  gemini: createGeminiProvider,
  groq: createGroqProvider,
  zai: createZaiProvider,
  mistral: createMistralProvider,
  cloudflare: createCloudflareProvider,
  openrouter: createOpenRouterProvider,
  ollama: createOllamaProvider,
};

/** Instance d'un fournisseur avec la config courante (clés, modèle). Utilisable seul (bench). */
export function getProvider(id: ProviderId, cfg: LLMConfig = loadConfig()): DictaProvider {
  return FACTORIES[id](cfg);
}

export interface Attempt {
  provider: ProviderId;
  outcome: 'ok' | 'skipped' | ProviderErrorKind;
  message?: string;
  latencyMs?: number;
}

export type DetailedCleanResult = CleanResult & { attempts: Attempt[]; promptVersion?: string };

const now = () => performance.now();

/**
 * Nettoie une transcription brute.
 * - dictée vide → { text: '' , provider: 'passthrough' }
 * - dictée courte et propre → fallbackClean() sans appel LLM
 * - sinon essaie les fournisseurs ; si tous échouent → fallbackClean(raw) en passthrough.
 * Si opts.signal est annulé par l'appelant, la promesse est rejetée (AbortError).
 */
export async function cleanTranscript(raw: string, opts: CleanOptions = {}): Promise<CleanResult> {
  const { attempts: _a, ...res } = await cleanTranscriptDetailed(raw, opts);
  return res;
}

/** Comme cleanTranscript, avec le détail des tentatives (CLI, logs, bench). */
export async function cleanTranscriptDetailed(raw: string, opts: CleanOptions = {}): Promise<DetailedCleanResult> {
  const t0 = now();
  const attempts: Attempt[] = [];
  const done = (text: string, provider: CleanResult['provider'], model: string): DetailedCleanResult => ({
    text,
    provider,
    model,
    latencyMs: Math.round(now() - t0),
    attempts,
  });

  const input = raw ?? '';
  if (isEmptyDictation(input)) return done('', 'passthrough', 'empty');
  if (shouldSkipLLM(input)) return done(fallbackClean(input), 'passthrough', 'skip-short');

  const cfg = loadConfig();
  const order = (opts.providers?.length ? opts.providers : cfg.providers).filter((p) => ALL_PROVIDERS.includes(p));
  const { system, user } = buildMessages(input, {
    language: opts.language ?? 'fr',
    level: opts.level ?? cfg.cleanup.level,
    vocabulary: opts.vocabulary ?? cfg.cleanup.vocabulary,
  });
  const maxTokens = GENERATION.maxTokens(input);

  // Course « hedgée » : on lance le 1er fournisseur ; s'il n'a pas répondu après
  // hedgeMs, ou dès qu'il échoue, le suivant part EN PARALLÈLE. Première sortie
  // valide gagnante, les autres requêtes sont annulées. Latence ≈ min(fournisseurs).
  const queue = [...order];
  const running = new Map<ProviderId, AbortController>();
  const abortAll = () => { for (const c of running.values()) c.abort(); running.clear(); };

  const attempt = async (id: ProviderId, ctrl: AbortController): Promise<DetailedCleanResult> => {
    const p = getProvider(id, cfg);
    const t1 = now();
    try {
      if (id !== 'ollama') quota.recordRequest(id);
      const signal = opts.signal ? AbortSignal.any([opts.signal, ctrl.signal]) : ctrl.signal;
      const out = await p.complete({ system, user, temperature: GENERATION.temperature, maxTokens, signal });
      let text: string;
      try {
        text = postProcess(out.text, input);
      } catch (e: any) {
        // OutOfRoleError (réponse hors rôle) ou autre rejet du post-traitement.
        throw new ProviderError(id, 'bad_output', `${e?.name ?? 'Error'} : ${e?.message ?? e}`);
      }
      // Dictée non vide (vérifiée plus haut) mais sortie vide → suspect.
      if (!text.trim()) throw new ProviderError(id, 'bad_output', 'sortie vide après post-traitement');
      quota.recordSuccess(id);
      attempts.push({ provider: id, outcome: 'ok', latencyMs: Math.round(now() - t1) });
      return done(text, id, out.model);
    } catch (e: any) {
      if (isUserAbort(e, opts.signal)) throw e;
      if (ctrl.signal.aborted) throw e; // perdant de la course : rien à enregistrer
      const err = e as DictaProviderError;
      const kind: ProviderErrorKind = e instanceof ProviderError ? err.kind : 'unknown';
      const message = e?.message ?? String(e);
      attempts.push({ provider: id, outcome: kind, message, latencyMs: Math.round(now() - t1) });
      if (kind !== 'bad_output') quota.recordFailure(id, kind, message, { retryAfterMs: err.retryAfterMs, daily: err.daily });
      throw e;
    }
  };

  // Prochain fournisseur utilisable (vérifs de disponibilité rapides, en cache côté providers).
  const nextAvailable = async (): Promise<ProviderId | undefined> => {
    while (queue.length) {
      const id = queue.shift()!;
      const blocked = quota.blockedReason(id);
      if (blocked) { attempts.push({ provider: id, outcome: 'skipped', message: blocked }); continue; }
      const av = await getProvider(id, cfg).availability();
      if (!av.ok) { attempts.push({ provider: id, outcome: 'skipped', message: av.reason }); continue; }
      return id;
    }
    return undefined;
  };

  const winner = await new Promise<DetailedCleanResult | undefined>((resolve, reject) => {
    let settled = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: DetailedCleanResult | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      abortAll();
      resolve(r);
    };
    const launchNext = async (): Promise<void> => {
      clearTimeout(hedgeTimer);
      if (settled) return;
      const id = await nextAvailable();
      if (settled) return;
      if (!id) { if (running.size === 0) finish(undefined); return; }
      const ctrl = new AbortController();
      running.set(id, ctrl);
      hedgeTimer = setTimeout(() => void launchNext(), cfg.hedgeMs);
      attempt(id, ctrl).then(finish, (e) => {
        running.delete(id);
        if (settled) return;
        if (isUserAbort(e, opts.signal)) { settled = true; abortAll(); reject(e); return; }
        void launchNext(); // échec → on n'attend pas le délai de hedge
      });
    };
    void launchNext();
  });
  if (winner) return winner;

  return done(fallbackClean(input), 'passthrough', 'fallbackClean');
}

export type ProviderUiStatus = 'available' | 'missing_key' | 'quota' | 'offline';

export interface ProviderStatus extends QuotaInfo {
  id: ProviderId;
  /** Rang dans l'ordre effectif (0 = premier), -1 si non utilisé. */
  rank: number;
  model: string;
  available: boolean;
  /** Valeur directement utilisable par window.dicta.setProviderStatus(). */
  uiStatus: ProviderUiStatus;
  reason?: string;
}

/** État de chaque fournisseur pour l'écran Réglages (clé, joignabilité, quotas, pauses). */
export async function providerStatuses(): Promise<ProviderStatus[]> {
  const cfg = loadConfig();
  return Promise.all(
    ALL_PROVIDERS.map(async (id) => {
      const p = getProvider(id, cfg);
      const av = await p.availability();
      const q = quota.quotaInfo(id);
      const blocked = quota.blockedReason(id);
      let uiStatus: ProviderUiStatus;
      if (!av.ok) uiStatus = id === 'ollama' ? 'offline' : 'missing_key';
      else if (blocked && (q.cooldownKind === 'quota' || (q.dailyLimit !== null && q.usedToday >= q.dailyLimit))) uiStatus = 'quota';
      else if (blocked && q.cooldownKind === 'auth') uiStatus = 'missing_key'; // clé refusée
      else if (blocked) uiStatus = 'offline';
      else uiStatus = 'available';
      return {
        id,
        rank: cfg.providers.indexOf(id),
        model: p.model,
        available: av.ok && !blocked,
        uiStatus,
        reason: av.reason ?? blocked ?? undefined,
        ...q,
      };
    }),
  );
}

/** Test « Tester » de l'UI : un vrai appel minimal, sans post-traitement. */
export async function testProvider(id: ProviderId): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const t0 = now();
  quota.clearCooldowns(id); // test explicite (ex. après saisie d'une nouvelle clé)
  const p = getProvider(id);
  const av = await p.availability();
  if (!av.ok) return { ok: false, message: av.reason ?? 'indisponible', latencyMs: 0 };
  try {
    if (id !== 'ollama') quota.recordRequest(id);
    const { system, user } = buildMessages('euh bonjour bonjour je teste la dictée');
    const out = await p.complete({ system, user, temperature: 0, maxTokens: 64 });
    quota.recordSuccess(id);
    return { ok: true, message: `OK (${out.model}) : ${out.text.slice(0, 80)}`, latencyMs: Math.round(now() - t0) };
  } catch (e: any) {
    const kind = e instanceof ProviderError ? e.kind : 'unknown';
    if (kind !== 'bad_output') quota.recordFailure(id, kind, e?.message ?? String(e), { retryAfterMs: e?.retryAfterMs, daily: e?.daily });
    return { ok: false, message: redact(`${kind} : ${e?.message ?? e}`), latencyMs: Math.round(now() - t0) };
  }
}

/** Précharge le modèle Ollama si Ollama fait partie de l'ordre (à appeler au démarrage de l'app). */
export async function warmup(): Promise<void> {
  const cfg = loadConfig();
  // Ne précharge le modèle local (~10 Go) que s'il est le moteur principal.
  if (cfg.providers[0] === 'ollama') await warmupOllama(cfg);
}

export { clearCooldowns } from './quota.ts';
export { setConfigOverrides, setSecretAccessor } from './config.ts';

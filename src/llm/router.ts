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

/** Options du router en plus de CleanOptions (passent telles quelles par src/main/cleaner.ts). */
export interface RouterCleanOptions extends CleanOptions {
  /**
   * Nettoyage spéculatif (pendant une pause de la dictée) : pas de course parallèle ni de
   * dernier recours sur les fournisseurs en pause — on garde le quota pour l'appel final.
   */
  speculative?: boolean;
}

type RouterLogger = (msg: string, data?: unknown) => void;
const defaultLogger: RouterLogger = (msg, data) => console.warn(`[dicta-ai] ${msg}`, data === undefined ? '' : JSON.stringify(data));
let logger: RouterLogger = defaultLogger;
/** Branche le journal de l'app (dicta.log) sur le router. */
export function setRouterLogger(fn: RouterLogger | null): void {
  logger = typeof fn === 'function' ? fn : defaultLogger;
}

const now = () => performance.now();

/**
 * Nettoie une transcription brute.
 * - dictée vide → { text: '' , provider: 'passthrough' }
 * - dictée courte et propre → fallbackClean() sans appel LLM
 * - sinon essaie les fournisseurs ; si tous échouent → fallbackClean(raw) en passthrough.
 * Si opts.signal est annulé par l'appelant, la promesse est rejetée (AbortError).
 */
export async function cleanTranscript(raw: string, opts: RouterCleanOptions = {}): Promise<CleanResult> {
  const { attempts: _a, ...res } = await cleanTranscriptDetailed(raw, opts);
  return res;
}

/** Fournisseurs mis de côté (quota connu comme épuisé / pause) : candidats au dernier recours. */
interface Deferred { id: ProviderId; until: number; guess: boolean }
/** Au dernier recours, on retente un fournisseur en pause si sa pause est estimée ou finit bientôt. */
const LAST_RESORT_WINDOW_MS = 120_000;

/** Comme cleanTranscript, avec le détail des tentatives (CLI, logs, bench). */
export async function cleanTranscriptDetailed(raw: string, opts: RouterCleanOptions = {}): Promise<DetailedCleanResult> {
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
  const estTokens = quota.estimateTokens({ system, user, maxTokens });
  const speculative = !!opts.speculative;

  // Course « hedgée » : on lance le 1er fournisseur ; s'il n'a pas répondu après
  // hedgeMs, ou dès qu'il échoue, le suivant part EN PARALLÈLE. Première sortie
  // valide gagnante, les autres requêtes sont annulées. Latence ≈ min(fournisseurs).
  // Les fournisseurs dont TOUS les modèles sont connus comme épuisés (en-têtes x-ratelimit-*,
  // 429 précédents) sont sautés sans requête ; s'il ne reste rien, dernier recours sur eux.
  const queue: { id: ProviderId; forced: boolean }[] = order.map((id) => ({ id, forced: false }));
  const deferred: Deferred[] = [];
  let lastResort = false;
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
      if (kind === 'quota') {
        // Le 429 est déjà mémorisé PAR MODÈLE (providers/common.ts → quota.observe). Pause du fournisseur
        // entier seulement pour un plafond journalier de compte (OpenRouter free-models-per-day).
        if (err.daily && id === 'openrouter') quota.recordFailure(id, kind, message, { daily: true });
        else quota.recordError(id, kind, message);
      } else if (kind !== 'bad_output') {
        quota.recordFailure(id, kind, message, { retryAfterMs: err.retryAfterMs, daily: err.daily });
      }
      throw e;
    }
  };

  const defer = (id: ProviderId, until: number, guess: boolean) => {
    if (id !== 'ollama') deferred.push({ id, until, guess });
  };

  // Prochain fournisseur utilisable (vérifs de disponibilité rapides, en cache côté providers).
  const nextAvailable = async (): Promise<ProviderId | undefined> => {
    for (;;) {
      if (!queue.length && !lastResort && !speculative) {
        // Plus rien de « connu bon » : dernier recours sur les fournisseurs mis de côté dont la pause
        // est une estimation ou se termine bientôt (le 429 coûte ~200 ms, le texte brut coûte la dictée).
        lastResort = true;
        const t = Date.now();
        const again = deferred
          .filter((d) => d.guess || d.until - t <= LAST_RESORT_WINDOW_MS)
          .sort((a, b) => a.until - b.until);
        for (const d of again) if (!running.has(d.id)) queue.push({ id: d.id, forced: true });
      }
      const next = queue.shift();
      if (!next) return undefined;
      const { id, forced } = next;
      const p = getProvider(id, cfg);
      if (!forced) {
        const blocked = quota.blockedReason(id);
        if (blocked) {
          attempts.push({ provider: id, outcome: 'skipped', message: blocked });
          const q = quota.quotaInfo(id);
          if (q.cooldownKind !== 'auth') defer(id, q.cooldownUntil ?? Date.now(), q.cooldownUntil === null || q.cooldownKind !== 'quota');
          continue;
        }
        if (id !== 'ollama') {
          const mb = quota.modelsBlockedReason(id, p.candidates ?? [p.model], estTokens);
          if (mb) {
            attempts.push({ provider: id, outcome: 'skipped', message: mb.reason });
            defer(id, mb.until, mb.guess);
            continue;
          }
        }
      }
      const av = await p.availability();
      if (!av.ok) { attempts.push({ provider: id, outcome: 'skipped', message: av.reason }); continue; }
      if (forced) attempts.push({ provider: id, outcome: 'skipped', message: 'dernier recours : nouvel essai malgré la pause' });
      return id;
    }
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
      // Spéculatif : pas de requête parallèle (économise le quota), bascule seulement sur échec.
      if (!speculative) hedgeTimer = setTimeout(() => void launchNext(), cfg.hedgeMs);
      attempt(id, ctrl).then(finish, (e) => {
        running.delete(id);
        if (settled) return;
        if (isUserAbort(e, opts.signal)) { settled = true; abortAll(); reject(e); return; }
        void launchNext(); // échec → on n'attend pas le délai de hedge
      });
    };
    void launchNext();
  });

  const summary = () =>
    attempts.map((a) => `${a.provider}: ${a.outcome}${a.latencyMs !== undefined ? ` ${a.latencyMs} ms` : ''}${a.message ? ` — ${redact(a.message).slice(0, 160)}` : ''}`);
  if (winner) {
    if (attempts.some((a) => a.outcome !== 'ok' && a.outcome !== 'skipped')) {
      logger(`router: nettoyé par ${winner.provider} (${winner.model}) après bascule${speculative ? ' [spéculatif]' : ''}`, summary());
    }
    return winner;
  }

  logger(
    `router: ÉCHEC du nettoyage${speculative ? ' [spéculatif]' : ''} — AUCUN fournisseur n'a répondu → texte brut (fallbackClean)`,
    summary(),
  );
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
  /** Quotas connus par modèle (en-têtes x-ratelimit-*, 429). */
  models: Record<string, quota.ModelLimit>;
}

/** État de chaque fournisseur pour l'écran Réglages (clé, joignabilité, quotas, pauses). */
export async function providerStatuses(): Promise<ProviderStatus[]> {
  const cfg = loadConfig();
  return Promise.all(
    ALL_PROVIDERS.map(async (id) => {
      const p = getProvider(id, cfg);
      const av = await p.availability();
      const q = quota.quotaInfo(id);
      const mb = id === 'ollama' ? null : quota.modelsBlockedReason(id, p.candidates ?? [p.model]);
      const blocked = quota.blockedReason(id) ?? mb?.reason ?? null;
      let uiStatus: ProviderUiStatus;
      if (!av.ok) uiStatus = id === 'ollama' ? 'offline' : 'missing_key';
      else if (mb || (blocked && (q.cooldownKind === 'quota' || (q.dailyLimit !== null && q.usedToday >= q.dailyLimit)))) uiStatus = 'quota';
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
        models: id === 'ollama' ? {} : quota.modelLimits(id),
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
    if (kind === 'quota') quota.recordError(id, kind, e?.message ?? String(e));
    else if (kind !== 'bad_output') quota.recordFailure(id, kind, e?.message ?? String(e), { retryAfterMs: e?.retryAfterMs, daily: e?.daily });
    return { ok: false, message: redact(`${kind} : ${e?.message ?? e}`), latencyMs: Math.round(now() - t0) };
  }
}

/**
 * À appeler au démarrage de l'app ET au début de chaque dictée (src/main/pipeline.ts, limité à 1×/10 s) :
 * - précharge Ollama s'il est le moteur principal ;
 * - rafraîchit en arrière-plan l'état de quota des premiers fournisseurs cloud (voir refreshQuotas),
 *   ce qui ouvre aussi la connexion TLS avant l'appel réel.
 */
export async function warmup(): Promise<void> {
  const cfg = loadConfig();
  // Ne précharge le modèle local (~10 Go) que s'il est le moteur principal.
  const jobs: Promise<unknown>[] = [refreshQuotas(cfg)];
  if (cfg.providers[0] === 'ollama') jobs.push(warmupOllama(cfg));
  await Promise.allSettled(jobs);
}

/**
 * Nombre de fournisseurs cloud (clé présente) qui ne sont PAS connus comme épuisés / en pause.
 * Synchrone et local (usage.json) : sert à la dictée pour décider si un nettoyage spéculatif
 * vaut la dépense de quota (en pénurie, on garde le quota pour l'appel final).
 */
export function usableCloudProviders(cfg: LLMConfig = loadConfig()): ProviderId[] {
  return cfg.providers.filter((id) => {
    if (id === 'ollama') return false;
    const p = getProvider(id, cfg);
    if (!(cfg.keys as Record<string, string | undefined>)[id] || (id === 'cloudflare' && !cfg.cloudflare.accountId)) return false;
    return !quota.blockedReason(id) && !quota.modelsBlockedReason(id, p.candidates ?? [p.model]);
  });
}

const lastProbe = new Map<ProviderId, number>();
/** Un fournisseur dont le quota n'a pas été observé depuis ce délai est sondé (1 mini requête). */
const PROBE_STALE_MS = 5 * 60_000;
/** Jamais sondés : OpenRouter (50 req/jour) et Ollama (local). */
const NO_PROBE: ProviderId[] = ['openrouter', 'ollama'];

/**
 * Sonde légère des 2 premiers fournisseurs cloud « a priori bons » dont l'état de quota est inconnu
 * ou périmé : une requête de quelques tokens dont les en-têtes x-ratelimit-* (et un éventuel 429)
 * sont mémorisés par quota.observe. La dictée suivante saute alors un fournisseur épuisé sans l'essayer.
 * Renvoie les fournisseurs sondés.
 */
export async function refreshQuotas(cfg: LLMConfig = loadConfig()): Promise<ProviderId[]> {
  const probed: ProviderId[] = [];
  const jobs: Promise<unknown>[] = [];
  const t = Date.now();
  let considered = 0;
  for (const id of cfg.providers) {
    if (considered >= 2) break;
    if (NO_PROBE.includes(id)) continue;
    const p = getProvider(id, cfg);
    if (!(await p.availability()).ok || quota.blockedReason(id)) continue;
    const cands = p.candidates ?? [p.model];
    const { usable } = quota.orderModels(id, cands);
    if (!usable.length) continue;
    considered++;
    const seen = quota.modelLimits(id)[usable[0]]?.at ?? 0;
    if (t - seen < PROBE_STALE_MS || t - (lastProbe.get(id) ?? 0) < PROBE_STALE_MS) continue;
    lastProbe.set(id, t);
    probed.push(id);
    quota.recordRequest(id);
    jobs.push(
      p
        .complete({ system: 'Réponds uniquement « ok ».', user: 'ok', temperature: 0, maxTokens: 16, signal: AbortSignal.timeout(5000) })
        .catch((e: any) => {
          if (e?.kind === 'quota') logger(`router: sonde de quota — ${id} épuisé, il sera sauté`, redact(String(e?.message ?? e)).slice(0, 200));
        }),
    );
  }
  await Promise.allSettled(jobs);
  return probed;
}

export { clearCooldowns } from './quota.ts';
export { setConfigOverrides, setSecretAccessor } from './config.ts';
export { modelLimits } from './quota.ts';

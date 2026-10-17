// Router LLM : essaie les fournisseurs dans l'ordre, saute ceux indisponibles / en pause,
// et retombe sur un nettoyage déterministe (fallbackClean) si tout échoue.

import type { CleanOptions, CleanResult, ProviderErrorKind, ProviderId } from '../shared/types.ts';
import { ProviderError } from '../shared/types.ts';
import { ALL_PROVIDERS, loadConfig } from './config.ts';
import type { LLMConfig } from './config.ts';
import { GENERATION, autoParagraphs, buildMessages, fallbackClean, isEmptyDictation, postProcess, shouldSkipLLM } from './prompt.ts';
import { appProfile, applyReplacements, frenchTypography, joinWithBefore, stripInventedBreaks } from './format.ts';
import { isUserAbort } from './providers/common.ts';
import type { DictaProvider, DictaProviderError } from './providers/common.ts';
import { createGeminiProvider } from './providers/gemini.ts';
import { GROQ_ROTATION, createGroqProvider } from './providers/groq.ts';
import { createOllamaProvider, warmupOllama } from './providers/ollama.ts';
import { createOpenRouterProvider } from './providers/openrouter.ts';
import { createZaiProvider } from './providers/zai.ts';
import * as quota from './quota.ts';
import { redact } from '../shared/redact.ts';
import type { QuotaInfo } from './quota.ts';

export type { DictaProvider } from './providers/common.ts';

const FACTORIES: Record<ProviderId, (cfg: LLMConfig) => DictaProvider> = {
  gemini: createGeminiProvider,
  groq: createGroqProvider,
  zai: createZaiProvider,
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

/**
 * Dernière passe déterministe sur le texte final (LLM ou repli) : remplacements du dictionnaire (f4),
 * aucun retour inventé en terminal/éditeur (m11), typographie française (m6), raccord avec le texte
 * déjà écrit (m14). Pure : aucun appel réseau.
 * `lastResort` : aucun LLM n'a répondu (fallbackClean) → paragraphes de secours (autoParagraphs). v1.11 : jamais
 * sur une sortie de LLM (le filet coupait seulement devant « ensuite », voir chantiers/audit-prompt §5 bis).
 */
export function finalizeText(text: string, raw: string, opts: RouterCleanOptions = {}, lastResort = false): string {
  if (!text) return text;
  let t = text;
  const profile = appProfile(opts.context);
  const codeLike = profile === 'terminal' || profile === 'code';
  if (codeLike && opts.promptMode !== 'on') t = stripInventedBreaks(t, raw);
  // Dernier recours seulement (aucun LLM) : long bloc sans retour → paragraphes de secours. Jamais en terminal / code.
  else if (!codeLike && lastResort) t = autoParagraphs(t);
  t = applyReplacements(t, opts.replacements);
  if (opts.frenchTypography !== false && (opts.language ?? 'fr') === 'fr' && !codeLike) t = frenchTypography(t);
  t = joinWithBefore(t, opts.context?.before);
  return t;
}

/** Fournisseurs mis de côté (quota connu comme épuisé / pause) : candidats au dernier recours. */
interface Deferred { id: ProviderId; until: number; guess: boolean }
/** Au dernier recours, on retente un fournisseur en pause si sa pause est estimée ou finit bientôt. */
const LAST_RESORT_WINDOW_MS = 120_000;

/** Comme cleanTranscript, avec le détail des tentatives (CLI, logs, bench). */
export async function cleanTranscriptDetailed(raw: string, opts: RouterCleanOptions = {}): Promise<DetailedCleanResult> {
  const t0 = now();
  const input = raw ?? '';
  const fin = (text: string) => finalizeText(text, input, opts);
  const quick = (text: string, model: string): DetailedCleanResult => ({
    text: fin(text), provider: 'passthrough', model, latencyMs: Math.round(now() - t0), attempts: [],
  });
  if (isEmptyDictation(input)) return quick('', 'empty');
  // b1 : une dictée courte qui contient une commande (« virgule », « à la ligne »…) ne saute plus le LLM.
  if (shouldSkipLLM(input)) return quick(fallbackClean(input), 'skip-short');

  const cfg = loadConfig();
  const { system, user } = buildMessages(input, {
    language: opts.language ?? 'fr',
    level: opts.level ?? cfg.cleanup.level,
    vocabulary: opts.vocabulary ?? cfg.cleanup.vocabulary,
    priorityVocabulary: opts.priorityVocabulary,
    promptMode: opts.promptMode,
    toneByApp: opts.toneByApp,
    context: opts.context,
  });
  const job: RouteJob = {
    system, user,
    maxTokens: GENERATION.maxTokens(input),
    temperature: GENERATION.temperature,
    post: (text) => postProcess(text, input),
    fallback: () => fallbackClean(input),
    label: 'nettoyage',
  };
  let res = await routeCompletion(job, opts);
  if (res.provider !== 'passthrough' && needsParagraphRetry(res.text, opts)) {
    res = await retryForParagraphs(res, job, opts, cfg, t0);
  }
  return { ...res, text: finalizeText(res.text, input, opts, res.provider === 'passthrough') };
}

// ───────────────────────────────────────────── relance « pas de paragraphe » (v1.11)

/** Seuil (mots) au-delà duquel une sortie de LLM sans aucun retour à la ligne est jugée incomplète. */
export const PARAGRAPH_RETRY_MIN_WORDS = 80;
/** Budget de latence de la relance (elle s'ajoute à la dictée). */
const PARAGRAPH_RETRY_TIMEOUT_MS = 6000;

/**
 * Une sortie de LLM de 80 mots ou plus sans aucun retour à la ligne mérite-t-elle une relance ?
 * Jamais en nettoyage spéculatif (quota), ni en terminal / code hors mode prompt (une seule ligne voulue).
 */
export function needsParagraphRetry(text: string, opts: RouterCleanOptions = {}): boolean {
  if (opts.speculative || !text || /\n/.test(text)) return false;
  const profile = appProfile(opts.context);
  if (profile === 'terminal' || profile === 'code') return false;
  return text.split(/\s+/).filter(Boolean).length >= PARAGRAPH_RETRY_MIN_WORDS;
}

/**
 * Modèle de relance : un modèle qui sait découper par le sens (qwen sur Groq, ou Gemini), différent de celui qui
 * vient de répondre, activé, avec une clé, hors pause et avec assez de quota pour cette requête. Pur côté réseau
 * (usage.json seulement). Gemini d'abord (ne prend pas le quota Groq des dictées suivantes), sauf s'il vient de répondre.
 */
export function paragraphRetryTarget(
  winner: { provider: CleanResult['provider']; model: string },
  estTokens: number,
  cfg: LLMConfig = loadConfig(),
): { id: ProviderId; model: string } | undefined {
  const qwen = GROQ_ROTATION.find((m) => /qwen/.test(m)) ?? GROQ_ROTATION[0];
  const options: { id: ProviderId; model: string }[] = [
    { id: 'gemini', model: cfg.models.gemini },
    { id: 'groq', model: qwen },
  ];
  if (winner.provider === 'gemini') options.reverse();
  return options.find(({ id, model }) => {
    if (!cfg.providers.includes(id)) return false;
    if (!(cfg.keys as Record<string, string | undefined>)[id]) return false;
    if (id === winner.provider && (winner.model === model || id === 'gemini')) return false;
    if (id === 'groq' && /qwen/.test(winner.model)) return false;
    if (quota.blockedReason(id)) return false;
    return quota.orderModels(id, [model], estTokens).usable.length > 0;
  });
}

/**
 * Relance UNE fois, sur un autre modèle, une sortie longue rendue sans paragraphe (gpt-oss-20b le fait toujours).
 * La nouvelle sortie n'est gardée que si elle passe les mêmes garde-fous ET contient un retour à la ligne ;
 * sinon on garde la première, telle quelle (pas de filet par mot déclencheur).
 */
async function retryForParagraphs(
  first: DetailedCleanResult,
  job: RouteJob,
  opts: RouterCleanOptions,
  cfg: LLMConfig,
  t0: number,
): Promise<DetailedCleanResult> {
  const est = quota.estimateTokens(job);
  const target = paragraphRetryTarget(first, est, cfg);
  if (!target) {
    first.attempts.push({ provider: first.provider as ProviderId, outcome: 'skipped', message: 'relance paragraphes : aucun modèle disponible' });
    return first;
  }
  const p = getProvider(target.id, { ...cfg, models: { ...cfg.models, [target.id]: target.model } });
  const t1 = now();
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(PARAGRAPH_RETRY_TIMEOUT_MS)]) : AbortSignal.timeout(PARAGRAPH_RETRY_TIMEOUT_MS);
  try {
    if (!(await p.availability()).ok) return first;
    quota.recordRequest(target.id);
    const out = await p.complete({ system: job.system, user: job.user, temperature: job.temperature, maxTokens: job.maxTokens, signal });
    const text = job.post(out.text);
    quota.recordSuccess(target.id);
    const ms = Math.round(now() - t1);
    if (!/\n/.test(text)) {
      first.attempts.push({ provider: target.id, outcome: 'bad_output', message: `relance paragraphes (${out.model}) : toujours sans retour à la ligne`, latencyMs: ms });
      return { ...first, latencyMs: Math.round(now() - t0) };
    }
    first.attempts.push({ provider: target.id, outcome: 'ok', message: `relance paragraphes (sortie de ${first.model} sans retour à la ligne)`, latencyMs: ms });
    logger(`router: relance paragraphes — ${first.provider} (${first.model}) sans retour à la ligne → ${target.id} (${out.model})`);
    return { text, provider: target.id, model: out.model, latencyMs: Math.round(now() - t0), attempts: first.attempts };
  } catch (e: any) {
    if (isUserAbort(e, opts.signal)) throw e;
    const kind: ProviderErrorKind = e instanceof ProviderError ? (e as DictaProviderError).kind : 'bad_output';
    first.attempts.push({ provider: target.id, outcome: kind, message: `relance paragraphes : ${e?.message ?? e}`, latencyMs: Math.round(now() - t1) });
    if (kind === 'quota') quota.recordError(target.id, kind, e?.message ?? String(e));
    return { ...first, latencyMs: Math.round(now() - t0) };
  }
}

/** Une requête à router : messages, garde-fous de sortie et repli. */
export interface RouteJob {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  /** Valide / nettoie la sortie du modèle ; lève pour passer au fournisseur suivant. */
  post: (modelText: string) => string;
  /** Texte de repli si aucun fournisseur n'a répondu ; absent = la promesse est rejetée. */
  fallback?: () => string;
  /** Libellé pour le journal (« nettoyage », « réécriture »). */
  label?: string;
}

/**
 * Course hedgée entre fournisseurs (quotas, pauses, dernier recours, Ollama en ultime recours),
 * commune au nettoyage de dictée et à la réécriture de sélection.
 */
export async function routeCompletion(job: RouteJob, opts: RouterCleanOptions = {}): Promise<DetailedCleanResult> {
  const t0 = now();
  const attempts: Attempt[] = [];
  const done = (text: string, provider: CleanResult['provider'], model: string): DetailedCleanResult => ({
    text,
    provider,
    model,
    latencyMs: Math.round(now() - t0),
    attempts,
  });
  const { system, user, maxTokens } = job;

  const cfg = loadConfig();
  const order = (opts.providers?.length ? opts.providers : cfg.providers).filter((p) => ALL_PROVIDERS.includes(p));
  const estTokens = quota.estimateTokens({ system, user, maxTokens });
  const speculative = !!opts.speculative;

  // Course « hedgée » : on lance le 1er fournisseur ; s'il n'a pas répondu après
  // hedgeMs, ou dès qu'il échoue, le suivant part EN PARALLÈLE. Première sortie
  // valide gagnante, les autres requêtes sont annulées. Latence ≈ min(fournisseurs).
  // Les fournisseurs dont TOUS les modèles sont connus comme épuisés (en-têtes x-ratelimit-*,
  // 429 précédents) sont sautés sans requête ; s'il ne reste rien, dernier recours sur eux.
  // Modèle local (Ollama) : jamais dans la course normale (il chargerait ~4 Go en mémoire) ; seulement
  // « Local d'abord », ou en ULTIME recours quand plus aucun fournisseur cloud n'a répondu (pas pour un
  // nettoyage spéculatif). Absent de la machine → simplement sauté.
  const localEmergency = !cfg.localFirst && order.includes('ollama');
  const queue: { id: ProviderId; forced: boolean }[] = order
    .filter((id) => !(localEmergency && id === 'ollama'))
    .map((id) => ({ id, forced: false }));
  let localTried = !localEmergency || speculative;
  const providerFor = (id: ProviderId) => getProvider(id, id === 'ollama' && localEmergency ? { ...cfg, localFirst: true } : cfg);
  const deferred: Deferred[] = [];
  let lastResort = false;
  const running = new Map<ProviderId, AbortController>();
  const abortAll = () => { for (const c of running.values()) c.abort(); running.clear(); };

  const attempt = async (id: ProviderId, ctrl: AbortController): Promise<DetailedCleanResult> => {
    const p = providerFor(id);
    const t1 = now();
    try {
      if (id !== 'ollama') quota.recordRequest(id);
      const signal = opts.signal ? AbortSignal.any([opts.signal, ctrl.signal]) : ctrl.signal;
      const out = await p.complete({ system, user, temperature: job.temperature, maxTokens, signal });
      let text: string;
      try {
        text = job.post(out.text);
      } catch (e: any) {
        // OutOfRoleError (réponse hors rôle) ou autre rejet du post-traitement.
        throw new ProviderError(id, 'bad_output', `${e?.name ?? 'Error'} : ${e?.message ?? e}`);
      }
      // Entrée non vide (vérifiée plus haut) mais sortie vide → suspect.
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
      if (!queue.length && lastResort && !localTried && running.size === 0) {
        localTried = true;
        queue.push({ id: 'ollama', forced: true });
        attempts.push({ provider: 'ollama', outcome: 'skipped', message: 'ultime recours : tous les quotas cloud épuisés → modèle local' });
      }
      const next = queue.shift();
      if (!next) return undefined;
      const { id, forced } = next;
      const p = providerFor(id);
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
    `router: ÉCHEC du ${job.label ?? 'traitement'}${speculative ? ' [spéculatif]' : ''} — AUCUN fournisseur n'a répondu${job.fallback ? ' → texte brut (fallbackClean)' : ''}`,
    summary(),
  );
  if (!job.fallback) throw new Error(`Aucun fournisseur n'a répondu (${job.label ?? 'traitement'})`);
  return done(job.fallback(), 'passthrough', 'fallbackClean');
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
    if (!(cfg.keys as Record<string, string | undefined>)[id]) return false;
    return !quota.blockedReason(id) && !quota.modelsBlockedReason(id, p.candidates ?? [p.model]);
  });
}

/** Marge pour le bloc <contexte>/<avant> que la spéculation ne connaît pas encore (≤ 300 car. + noms). */
const SPEC_CONTEXT_MARGIN_TOKENS = 200;

/**
 * Un nettoyage spéculatif (pendant une pause de la dictée) peut-il partir sans priver l'appel final ?
 * Oui seulement si le PREMIER fournisseur cloud utilisable a encore, sur au moins un de ses modèles,
 * des tokens/minute pour la spéculation ET l'appel final (≥ 2 × l'estimation d'une requête). Quota
 * inconnu (pas encore observé) = autorisé. Synchrone et local (usage.json) : aucune requête.
 */
export function canSpeculate(
  raw: string,
  opts: Pick<RouterCleanOptions, 'language' | 'level' | 'vocabulary' | 'priorityVocabulary' | 'promptMode' | 'toneByApp'> = {},
  cfg: LLMConfig = loadConfig(),
): { ok: boolean; provider?: ProviderId; estTokens: number; reason?: string } {
  const first = usableCloudProviders(cfg)[0];
  const { system, user } = buildMessages(raw ?? '', {
    language: opts.language ?? 'fr',
    level: opts.level ?? cfg.cleanup.level,
    vocabulary: opts.vocabulary ?? cfg.cleanup.vocabulary,
    priorityVocabulary: opts.priorityVocabulary,
    promptMode: opts.promptMode,
    toneByApp: opts.toneByApp,
  });
  const estTokens = quota.estimateTokens({ system, user, maxTokens: GENERATION.maxTokens(raw ?? '') }) + SPEC_CONTEXT_MARGIN_TOKENS;
  if (!first) return { ok: false, estTokens, reason: 'aucun fournisseur cloud disponible' };
  const p = getProvider(first, cfg);
  const { usable } = quota.orderModels(first, p.candidates ?? [p.model], 2 * estTokens);
  if (usable.length) return { ok: true, provider: first, estTokens };
  return { ok: false, provider: first, estTokens, reason: `${first} : moins de 2 × ~${estTokens} tokens/min restants` };
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

// ───────────────────────────────────────────────────── appels longs (comptes rendus, questions)

export interface LongJob {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** Valide / nettoie la sortie ; lève pour passer au fournisseur suivant. */
  post: (modelText: string) => string;
  /** Streaming : texte cumulé (brut, avant `post`) à chaque morceau ; réinitialisé si on change de fournisseur. */
  onDelta?: (textSoFar: string) => void;
  /** Ordre de préférence (grands contextes d'abord) ; filtré par les fournisseurs activés dans la config. */
  order?: ProviderId[];
  label?: string;
  signal?: AbortSignal;
}

export interface LongResult { text: string; provider: ProviderId; model: string; attempts: Attempt[] }

/**
 * Un appel long (compte rendu, réponse sur plusieurs réunions) à travers les mêmes fournisseurs, quotas et pauses
 * que la dictée, mais SÉQUENTIEL (pas de course hedgée : un prompt de 10 000 tokens ne se double pas) et avec
 * des délais longs. Un fournisseur en pause / sans quota suffisant est sauté ; si tous le sont, dernier recours
 * sur eux. Aucun texte de réunion n'est journalisé.
 */
export async function routeLong(job: LongJob): Promise<LongResult> {
  const cfg = loadConfig();
  cfg.timeouts = { cloudMs: 180_000, localMs: 300_000 };
  const wanted = job.order ?? ALL_PROVIDERS;
  const order = wanted.filter((id) => cfg.providers.includes(id));
  const temperature = job.temperature ?? 0.1;
  const est = quota.estimateTokens({ system: job.system, user: job.user, maxTokens: job.maxTokens });
  const attempts: Attempt[] = [];
  const skipped: ProviderId[] = [];

  const tryProvider = async (id: ProviderId): Promise<LongResult | undefined> => {
    job.signal?.throwIfAborted();
    const p = getProvider(id, cfg);
    const av = await p.availability();
    if (!av.ok) { attempts.push({ provider: id, outcome: 'skipped', message: av.reason }); return undefined; }
    const t1 = now();
    try {
      if (id !== 'ollama') quota.recordRequest(id);
      const out = await p.complete({ system: job.system, user: job.user, temperature, maxTokens: job.maxTokens, signal: job.signal, onDelta: job.onDelta });
      let text: string;
      try { text = job.post(out.text); } catch (e: any) { throw new ProviderError(id, 'bad_output', `${e?.name ?? 'Error'} : ${e?.message ?? e}`); }
      if (!text.trim()) throw new ProviderError(id, 'bad_output', 'sortie vide après post-traitement');
      quota.recordSuccess(id);
      attempts.push({ provider: id, outcome: 'ok', latencyMs: Math.round(now() - t1) });
      return { text, provider: id, model: out.model, attempts };
    } catch (e: any) {
      if (isUserAbort(e, job.signal)) throw e;
      const err = e as DictaProviderError;
      const kind: ProviderErrorKind = e instanceof ProviderError ? err.kind : 'unknown';
      const message = e?.message ?? String(e);
      attempts.push({ provider: id, outcome: kind, message, latencyMs: Math.round(now() - t1) });
      if (kind === 'quota') quota.recordError(id, kind, message);
      else if (kind !== 'bad_output') quota.recordFailure(id, kind, message, { retryAfterMs: err.retryAfterMs, daily: err.daily });
      job.onDelta?.(''); // le fournisseur suivant repart de zéro : l'interface efface le texte partiel
      return undefined;
    }
  };

  for (const id of order) {
    if (id !== 'ollama') {
      const blocked = quota.blockedReason(id);
      const mb = blocked ? null : quota.modelsBlockedReason(id, getProvider(id, cfg).candidates ?? [], est);
      if (blocked || mb) { attempts.push({ provider: id, outcome: 'skipped', message: blocked ?? mb!.reason }); skipped.push(id); continue; }
    }
    const r = await tryProvider(id);
    if (r) return r;
  }
  // Dernier recours : les fournisseurs mis de côté (une estimation de pause se trompe parfois).
  for (const id of skipped) {
    const r = await tryProvider(id);
    if (r) return r;
  }
  logger(`router: ÉCHEC du ${job.label ?? 'appel long'} — aucun fournisseur n'a répondu`, attempts.map((a) => `${a.provider}: ${a.outcome}${a.message ? ` — ${redact(a.message).slice(0, 160)}` : ''}`));
  throw new Error(`Aucun moteur n'a pu répondre (${job.label ?? 'appel long'}).\n${attempts.filter((a) => a.message).map((a) => `${a.provider}: ${redact(a.message ?? '').slice(0, 160)}`).join('\n')}`);
}

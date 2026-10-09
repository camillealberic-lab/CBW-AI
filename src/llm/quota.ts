// Suivi local des quotas : compte de requêtes par fournisseur et par jour,
// + "cooldown" (mise à l'écart temporaire) après 429 / erreur d'auth / timeout.
// Persisté dans ~/.dicta-ai/usage.json. Ce n'est qu'un garde-fou : la vérité
// reste la réponse du fournisseur (HTTP 429).

import { redact } from '../shared/redact.ts';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderErrorKind, ProviderId } from '../shared/types.ts';
import { configDir, loadConfig } from './config.ts';

/**
 * Plafonds quotidiens par défaut (requêtes/jour, offre gratuite).
 * - gemini : Google ne publie plus de tableau ; la limite réelle est visible dans AI Studio
 *   (onglet Rate limits). 250 est une valeur prudente, à ajuster via config.dailyLimits.gemini.
 * - groq : llama-3.1-8b-instant = 14 400 RPD (30 RPM, 6 000 TPM).
 * - openrouter : modèles ":free" = 50 req/jour (<10 crédits achetés), 1 000 sinon ; 20 RPM.
 * - ollama : local, illimité.
 */
export const KNOWN_DAILY_LIMITS: Record<ProviderId, number> = {
  gemini: 250,
  groq: 14400,
  zai: 1000, // non officiel
  mistral: 5000, // ~1 req/s, plafond local prudent
  cloudflare: 450, // 10 000 neurons/jour ≈ 460 dictées
  openrouter: 50,
  ollama: Infinity,
};

/** Fuseau du reset quotidien : Gemini = minuit heure du Pacifique ; autres : UTC. */
const RESET_TZ: Record<ProviderId, string> = {
  gemini: 'America/Los_Angeles',
  groq: 'UTC',
  zai: 'Asia/Shanghai',
  mistral: 'UTC',
  cloudflare: 'UTC',
  openrouter: 'UTC',
  ollama: 'UTC',
};

const MIN = 60_000;
/** Durée de mise à l'écart par défaut selon le type d'erreur. */
const COOLDOWN_MS: Partial<Record<ProviderErrorKind, number>> = {
  quota: 2 * MIN, // si pas de Retry-After ni de quota journalier détecté
  auth: 30 * MIN,
  timeout: 1 * MIN,
  network: 30_000,
};

interface DayCount { date: string; count: number }
interface Cooldown { until: number; kind: string; message?: string }
/**
 * État de quota connu pour un modèle, déduit des en-têtes de réponse (x-ratelimit-*, retry-after)
 * et des 429. Permet de sauter un modèle épuisé AVANT d'envoyer la dictée.
 */
export interface ModelLimit {
  /** Dernière observation (ms). */
  at: number;
  remReq?: number;
  remTok?: number;
  limReq?: number;
  limTok?: number;
  /** Instant (ms) où les compteurs requêtes / tokens repartent. */
  resetReqAt?: number;
  resetTokAt?: number;
  /** Mis à l'écart jusqu'à (ms), après un 429 / modèle introuvable. */
  blockedUntil?: number;
  blockedWhy?: string;
  /** true si la durée de mise à l'écart est une estimation (aucune info serveur). */
  guess?: boolean;
}

interface UsageFile {
  version: 1;
  days: Partial<Record<ProviderId, DayCount>>;
  cooldowns: Partial<Record<ProviderId, Cooldown>>;
  lastError: Partial<Record<ProviderId, { at: number; kind: string; message: string }>>;
  models: Partial<Record<ProviderId, Record<string, ModelLimit>>>;
}

const usagePath = () => join(configDir(), 'usage.json');

function emptyUsage(): UsageFile {
  return { version: 1, days: {}, cooldowns: {}, lastError: {}, models: {} };
}

function load(): UsageFile {
  try {
    const u = JSON.parse(readFileSync(usagePath(), 'utf8'));
    return { ...emptyUsage(), ...u };
  } catch {
    return emptyUsage();
  }
}

function save(u: UsageFile): void {
  try {
    mkdirSync(configDir(), { recursive: true });
    const tmp = usagePath() + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(u, null, 2), { mode: 0o600 });
    renameSync(tmp, usagePath());
  } catch (e: any) {
    console.warn(`[dicta-ai] impossible d'écrire usage.json : ${e?.message ?? e}`);
  }
}

/** Date 'YYYY-MM-DD' dans le fuseau de reset du fournisseur. */
export function dayKey(id: ProviderId, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RESET_TZ[id], year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Timestamp (ms) du prochain reset quotidien pour ce fournisseur. */
export function nextResetAt(id: ProviderId, now = Date.now()): number {
  const today = dayKey(id, now);
  // Avance par pas de 15 min jusqu'au changement de date (gère l'heure d'été sans lib).
  let t = now - (now % (15 * MIN)) + 15 * MIN;
  while (dayKey(id, t) === today) t += 15 * MIN;
  // Affine à la minute près.
  let lo = t - 15 * MIN;
  while (lo < t && dayKey(id, lo) === today) lo += MIN;
  return lo;
}

export function dailyLimit(id: ProviderId): number {
  return loadConfig().dailyLimits[id] ?? KNOWN_DAILY_LIMITS[id];
}

export function usedToday(id: ProviderId, u = load()): number {
  const d = u.days[id];
  return d && d.date === dayKey(id) ? d.count : 0;
}

/** Raison de mise à l'écart, ou null si le fournisseur peut être essayé. */
export function blockedReason(id: ProviderId): string | null {
  const u = load();
  const cd = u.cooldowns[id];
  if (cd && cd.until > Date.now()) {
    const mins = Math.ceil((cd.until - Date.now()) / MIN);
    return `en pause (${cd.kind}) encore ~${mins} min`;
  }
  const lim = dailyLimit(id);
  if (usedToday(id, u) >= lim) return `plafond quotidien local atteint (${lim}/jour)`;
  return null;
}

export function recordRequest(id: ProviderId): void {
  const u = load();
  const today = dayKey(id);
  const d = u.days[id];
  u.days[id] = { date: today, count: d && d.date === today ? d.count + 1 : 1 };
  save(u);
}

/** Enregistre la dernière erreur sans mettre le fournisseur en pause (ex. 429 d'un seul modèle). */
export function recordError(id: ProviderId, kind: ProviderErrorKind, message: string): void {
  const u = load();
  u.lastError[id] = { at: Date.now(), kind, message: redact(String(message ?? '')).slice(0, 300) };
  save(u);
}

export function recordSuccess(id: ProviderId): void {
  const u = load();
  if (u.cooldowns[id]) {
    delete u.cooldowns[id];
    save(u);
  }
}

/**
 * Enregistre un échec et, selon le type, met le fournisseur en pause.
 * @param retryAfterMs délai indiqué par le serveur (Retry-After), si connu
 * @param daily true si le serveur indique un quota *journalier* épuisé → pause jusqu'au reset
 */
export function recordFailure(
  id: ProviderId,
  kind: ProviderErrorKind,
  message: string,
  extra: { retryAfterMs?: number; daily?: boolean } = {},
): void {
  const u = load();
  const now = Date.now();
  message = redact(String(message ?? ''));
  u.lastError[id] = { at: now, kind, message: message.slice(0, 300) };
  let until = 0;
  if (kind === 'quota') {
    if (extra.daily) until = nextResetAt(id, now);
    else if (extra.retryAfterMs && extra.retryAfterMs > 0) until = now + Math.min(extra.retryAfterMs, 24 * 60 * MIN);
    else until = now + (COOLDOWN_MS.quota ?? 0);
  } else if (COOLDOWN_MS[kind] && id !== 'ollama') {
    until = now + (COOLDOWN_MS[kind] ?? 0);
  } else if (kind === 'network' && id === 'ollama') {
    until = 0; // isAvailable() le détecte déjà en <300 ms
  }
  if (until > now) u.cooldowns[id] = { until, kind, message: message.slice(0, 300) };
  save(u);
}

export interface QuotaInfo {
  usedToday: number;
  dailyLimit: number | null; // null = illimité
  resetAt: number | null;
  cooldownUntil: number | null;
  cooldownKind: string | null;
  lastError: { at: number; kind: string; message: string } | null;
}

export function quotaInfo(id: ProviderId): QuotaInfo {
  const u = load();
  const lim = dailyLimit(id);
  const cd = u.cooldowns[id];
  const active = cd && cd.until > Date.now() ? cd : null;
  return {
    usedToday: usedToday(id, u),
    dailyLimit: Number.isFinite(lim) ? lim : null,
    resetAt: Number.isFinite(lim) ? nextResetAt(id) : null,
    cooldownUntil: active ? active.until : null,
    cooldownKind: active ? active.kind : null,
    lastError: u.lastError[id] ?? null,
  };
}

/** Efface les pauses (ex. après avoir saisi une nouvelle clé dans les réglages). */
export function clearCooldowns(id?: ProviderId): void {
  const u = load();
  if (id) {
    delete u.cooldowns[id];
    for (const m of Object.values(u.models[id] ?? {})) delete m.blockedUntil;
  } else {
    u.cooldowns = {};
    for (const per of Object.values(u.models)) for (const m of Object.values(per ?? {})) delete m.blockedUntil;
  }
  save(u);
}

// ───────────────────────── Quotas par modèle (en-têtes de rate limit) ─────────────────────────

/** « 2m59.56s », « 7.66s », « 1h2m », « 120ms », « 30 » (s) → ms. */
export function parseDuration(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 1000;
  let ms = 0;
  let matched = false;
  for (const [, n, unit] of s.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    const x = Number(n);
    ms += unit === 'h' ? x * 3_600_000 : unit === 'm' ? x * MIN : unit === 's' ? x * 1000 : x;
  }
  return matched ? Math.round(ms) : undefined;
}

/** Valeur de reset : durée relative (« 7.66s ») ou horodatage absolu (s ou ms epoch) → instant ms. */
function resetAt(v: string | null, now: number): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return n; // epoch ms (OpenRouter)
  if (Number.isFinite(n) && n > 1e9) return n * 1000; // epoch s
  const d = parseDuration(v);
  return d === undefined ? undefined : now + d;
}

const int = (v: string | null): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Lit les en-têtes de limite de débit, toutes conventions confondues :
 * - Groq / OpenAI : x-ratelimit-{limit,remaining,reset}-{requests,tokens} (requests = quota JOURNALIER chez Groq) ;
 * - OpenRouter : x-ratelimit-{limit,remaining,reset} (reset en epoch ms) ;
 * - Mistral : x-ratelimit-remaining-tokens-minute / -month, x-ratelimit-remaining-req-minute… ;
 * - retry-after (s ou date).
 */
export function parseRateHeaders(h: Headers, now = Date.now()): Partial<ModelLimit> & { retryAfterMs?: number } {
  const out: Partial<ModelLimit> & { retryAfterMs?: number } = {};
  const g = (k: string) => h.get(k);
  const minDef = (a: number | undefined, b: number | undefined) => (a === undefined ? b : b === undefined ? a : Math.min(a, b));
  out.remReq = minDef(int(g('x-ratelimit-remaining-requests')), minDef(int(g('x-ratelimit-remaining')), minDef(int(g('x-ratelimit-remaining-req-minute')), int(g('x-ratelimit-remaining-requests-day')))));
  out.limReq = int(g('x-ratelimit-limit-requests')) ?? int(g('x-ratelimit-limit')) ?? int(g('x-ratelimit-limit-req-minute'));
  out.remTok = minDef(int(g('x-ratelimit-remaining-tokens')), minDef(int(g('x-ratelimit-remaining-tokens-minute')), int(g('x-ratelimit-remaining-tokens-month'))));
  out.limTok = int(g('x-ratelimit-limit-tokens')) ?? int(g('x-ratelimit-limit-tokens-minute'));
  out.resetReqAt = resetAt(g('x-ratelimit-reset-requests') ?? g('x-ratelimit-reset'), now);
  out.resetTokAt = resetAt(g('x-ratelimit-reset-tokens'), now);
  const ra = g('retry-after');
  if (ra) {
    const s = Number(ra);
    const d = Number.isFinite(s) ? s * 1000 : Date.parse(ra) - now;
    if (Number.isFinite(d) && d >= 0) out.retryAfterMs = d;
  }
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Estimation grossière des tokens facturés par une requête (prompt ≈ 3 car./token + sortie max). */
export function estimateTokens(req: { system: string; user: string; maxTokens: number }, extraOut = 0): number {
  return Math.ceil(((req.system?.length ?? 0) + (req.user?.length ?? 0)) / 3) + req.maxTokens + extraOut;
}

/**
 * Enregistre ce qu'une réponse HTTP apprend du quota d'un modèle (succès ou erreur).
 * Sur 429/402 : mise à l'écart du modèle jusqu'au reset indiqué (Retry-After, x-ratelimit-reset-*),
 * sinon `fallbackMs` (estimation).
 */
export function observe(
  id: ProviderId,
  model: string,
  headers: Headers | undefined,
  status: number,
  extra: { retryAfterMs?: number; daily?: boolean; message?: string; fallbackMs?: number } = {},
): void {
  if (id === 'ollama' || !model) return;
  const now = Date.now();
  const parsed = headers ? parseRateHeaders(headers, now) : {};
  const { retryAfterMs: hdrRetry, ...lim } = parsed;
  const u = load();
  const per = (u.models[id] ??= {});
  const cur: ModelLimit = { ...(per[model] ?? {}), ...lim, at: now };
  if (status === 429 || status === 402) {
    const retry = hdrRetry ?? extra.retryAfterMs;
    let until: number | undefined;
    let guess = false;
    // Quota journalier : jusqu'au reset (Gemini : minuit Pacifique, son retryDelay n'en tient pas compte) ;
    // ailleurs le Retry-After du serveur (fenêtre glissante chez Groq) prime s'il est donné.
    if (extra.daily && (id === 'gemini' || !(retry && retry > 0))) until = Math.max(nextResetAt(id, now), cur.resetReqAt ?? 0);
    else if (retry !== undefined && retry > 0) until = now + Math.min(retry, 24 * 60 * MIN);
    else if (cur.remReq === 0 && cur.resetReqAt && cur.resetReqAt > now) until = cur.resetReqAt;
    else if (cur.remTok !== undefined && cur.resetTokAt && cur.resetTokAt > now) until = cur.resetTokAt;
    if (!until) {
      until = now + (extra.fallbackMs ?? MIN);
      guess = true;
    }
    cur.blockedUntil = Math.max(until, now + 1000);
    cur.blockedWhy = redact(String(extra.message ?? `HTTP ${status}`)).slice(0, 160);
    cur.guess = guess;
  } else if (status >= 200 && status < 300) {
    // Réponse OK : le modèle répond, toute mise à l'écart antérieure est caduque.
    delete cur.blockedUntil;
    delete cur.blockedWhy;
    delete cur.guess;
  }
  per[model] = cur;
  save(u);
}

/** Met un modèle à l'écart (ex. 404 modèle retiré, surcharge). */
export function blockModel(id: ProviderId, model: string, ms: number, why: string, guess = true): void {
  if (id === 'ollama' || !model) return;
  const u = load();
  const per = (u.models[id] ??= {});
  const now = Date.now();
  per[model] = { ...(per[model] ?? { at: now }), blockedUntil: now + ms, blockedWhy: redact(why).slice(0, 160), guess };
  save(u);
}

export interface ModelBlock {
  until: number;
  why: string;
  /** true = durée estimée (pas d'info serveur) → vaut la peine d'être retenté en dernier recours. */
  guess: boolean;
}

/** Le modèle est-il connu comme épuisé pour une requête d'environ `estTokens` tokens ? */
export function modelBlock(id: ProviderId, model: string, estTokens = 0, now = Date.now(), u = load()): ModelBlock | null {
  const m = u.models[id]?.[model];
  if (!m) return null;
  if (m.blockedUntil && m.blockedUntil > now) return { until: m.blockedUntil, why: m.blockedWhy ?? '429', guess: !!m.guess };
  if (m.remReq !== undefined && m.remReq <= 0 && m.resetReqAt && m.resetReqAt > now) {
    return { until: m.resetReqAt, why: `requêtes épuisées (${m.limReq ?? '?'})`, guess: false };
  }
  if (estTokens > 0 && m.remTok !== undefined && m.remTok < estTokens && m.resetTokAt && m.resetTokAt > now) {
    return { until: m.resetTokAt, why: `tokens restants ${m.remTok} < ~${estTokens}`, guess: false };
  }
  return null;
}

/**
 * Ordonne les modèles candidats : d'abord ceux qui ne sont pas connus comme épuisés (ordre conservé),
 * puis — dernier recours, seulement si aucun n'est libre — celui qui se libère le plus tôt.
 */
export function orderModels(id: ProviderId, candidates: string[], estTokens = 0): { usable: string[]; forced?: string; soonest?: ModelBlock & { model: string } } {
  const u = load();
  const now = Date.now();
  const usable: string[] = [];
  let soonest: (ModelBlock & { model: string }) | undefined;
  for (const m of [...new Set(candidates)]) {
    const b = modelBlock(id, m, estTokens, now, u);
    if (!b) usable.push(m);
    else if (!soonest || b.until < soonest.until) soonest = { ...b, model: m };
  }
  return { usable, forced: usable.length ? undefined : soonest?.model, soonest };
}

/** Raison lisible si TOUS les modèles candidats sont connus comme épuisés, sinon null. */
export function modelsBlockedReason(id: ProviderId, candidates: string[], estTokens = 0): { reason: string; until: number; guess: boolean } | null {
  if (!candidates.length) return null;
  const { usable, soonest } = orderModels(id, candidates, estTokens);
  if (usable.length || !soonest) return null;
  const s = Math.max(1, Math.ceil((soonest.until - Date.now()) / 1000));
  const when = s >= 120 ? `~${Math.ceil(s / 60)} min` : `${s} s`;
  return { reason: `quota épuisé sur ${candidates.length > 1 ? `ses ${candidates.length} modèles` : soonest.model} (${soonest.why}) — libre dans ${when}`, until: soonest.until, guess: soonest.guess };
}

/** Instantané des quotas connus par modèle (écran Réglages, --status). */
export function modelLimits(id: ProviderId): Record<string, ModelLimit> {
  return load().models[id] ?? {};
}

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
interface UsageFile {
  version: 1;
  days: Partial<Record<ProviderId, DayCount>>;
  cooldowns: Partial<Record<ProviderId, Cooldown>>;
  lastError: Partial<Record<ProviderId, { at: number; kind: string; message: string }>>;
}

const usagePath = () => join(configDir(), 'usage.json');

function emptyUsage(): UsageFile {
  return { version: 1, days: {}, cooldowns: {}, lastError: {} };
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
  if (id) delete u.cooldowns[id];
  else u.cooldowns = {};
  save(u);
}

// Configuration LLM de Dicta AI.
// Sources (priorité croissante) : défauts < ~/.dicta-ai/config.json < setConfigOverrides() < variables d'env.
// Clés lues (mêmes noms que l'UI Réglages, design/settings/NOTES.md), forme plate ou imbriquée :
//   providers.order, providers.localFirst, providers.{gemini,groq,openrouter}.apiKey, providers.ollama.model,
//   cleaning.level, cleaning.vocabulary
// Clés avancées (optionnelles) : providers.{id}.model, providers.{id}.dailyLimit, providers.ollama.url,
//   providers.ollama.keepAlive, providers.gemini.thinkingLevel, providers.openrouter.dataCollection,
//   providers.timeouts.cloudMs / localMs
// Node built-ins uniquement (compatible `node --experimental-strip-types`).

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderId } from '../shared/types.ts';

export type CleanLevel = 'light' | 'standard';

export const ALL_PROVIDERS: readonly ProviderId[] = ['gemini', 'groq', 'zai', 'openrouter', 'ollama'];
// Ordre « vitesse sans saturer la RAM » : Groq ≈ 0,4–0,7 s, Gemini ≈ 1 s, puis le local (gemma4 ≈ 10 Go
// de mémoire unifiée : trop lourd à garder chargé sur un Mac 16 Go), OpenRouter en dernier recours.
export const DEFAULT_ORDER: ProviderId[] = ['groq', 'gemini', 'zai', 'ollama', 'openrouter'] // Z.ai gratuit : souvent surchargé (3–40 s), en secours;

/** Modèles par défaut (ids vérifiés dans les docs officielles, oct. 2026). */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-3.5-flash-lite',
  groq: 'qwen/qwen3.8-27b', // llama-3.1-8b-instant retiré du catalogue Groq (404)
  zai: 'glm-4.5-flash', // gratuit ; glm-4.7-flash en bascule (surchargé le 08/10)
  openrouter: 'google/gemma-4-31b-it:free', // openrouter/free renvoyait des réponses vides
  ollama: 'qwen3.5:4b', // 4 Go : ultime recours quand tous les quotas cloud sont épuisés (gemma4:e4b, 9,5 Go, gelait un Mac 16 Go)
};

export interface LLMConfig {
  /** Ordre de fallback (après application de localFirst). */
  providers: ProviderId[];
  /** Si vrai, Ollama passe en tête (confidentialité / hors-ligne). */
  localFirst: boolean;
  models: Record<ProviderId, string>;
  keys: { gemini?: string; groq?: string; zai?: string; openrouter?: string };
  ollama: { url: string; keepAlive: string };
  gemini: {
    /** Force un niveau de réflexion ('minimal' | 'low' | ...). Défaut : auto selon le modèle. */
    thinkingLevel?: string;
  };
  openrouter: {
    /** 'deny' = n'utiliser que des fournisseurs qui ne collectent pas les données (peut ne laisser aucun modèle gratuit). */
    dataCollection: 'allow' | 'deny';
  };
  timeouts: { cloudMs: number; localMs: number };
  /** Délai avant de lancer le fournisseur suivant en parallèle (course « hedgée »). */
  hedgeMs: number;
  /** Plafonds quotidiens locaux (providers.{id}.dailyLimit). Remplace les valeurs connues de quota.ts. */
  dailyLimits: Partial<Record<ProviderId, number>>;
  /** Réglages UI `cleaning.level` / `cleaning.vocabulary`. */
  cleanup: { level: CleanLevel; vocabulary: string[] };
}

/** Dossier de config/état. `DICTA_AI_HOME` permet de le surcharger (tests). */
export function configDir(): string {
  return process.env.DICTA_AI_HOME || join(homedir(), '.dicta-ai');
}
export function configPath(): string {
  return join(configDir(), 'config.json');
}

type Json = Record<string, any>;

let cache: { path: string; mtimeMs: number; data: Json } | null = null;

function readConfigFile(): Json {
  const p = configPath();
  try {
    const st = statSync(p);
    if (cache && cache.path === p && cache.mtimeMs === st.mtimeMs) return cache.data;
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const obj = data && typeof data === 'object' ? (data as Json) : {};
    cache = { path: p, mtimeMs: st.mtimeMs, data: obj };
    return obj;
  } catch (e: any) {
    if (e?.code !== 'ENOENT') console.warn(`[dicta-ai] config.json illisible (${p}) : ${e?.message ?? e}`);
    return {};
  }
}

const isProvider = (x: unknown): x is ProviderId => typeof x === 'string' && (ALL_PROVIDERS as string[]).includes(x);

function parseProviders(v: unknown): ProviderId[] | undefined {
  const list = typeof v === 'string' ? v.split(',').map((s) => s.trim()) : Array.isArray(v) ? v : undefined;
  if (!list) return undefined;
  const out = [...new Set(list.filter(isProvider))];
  return out.length ? out : undefined;
}

function parseBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (/^(1|true|yes|on|oui)$/i.test(v)) return true;
    if (/^(0|false|no|off|non)$/i.test(v)) return false;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Applique localFirst : Ollama en tête (ajouté s'il manquait). */
export function applyLocalFirst(order: ProviderId[], localFirst: boolean): ProviderId[] {
  if (!localFirst) return order;
  return ['ollama', ...order.filter((p) => p !== 'ollama')];
}

/**
 * Lit une clé de réglage en acceptant les deux formes de config.json :
 * plate ({"providers.gemini.apiKey": "..."}, comme l'UI Réglages) ou imbriquée
 * ({"providers": {"gemini": {"apiKey": "..."}}}). La forme plate gagne.
 */
export function getSetting(f: Json, path: string): any {
  if (Object.prototype.hasOwnProperty.call(f, path)) return f[path];
  let cur: any = f;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Surcharges en mémoire, prioritaires sur config.json (mais pas sur les variables d'env).
 * Usage typique : le process main Electron injecte les clés déchiffrées depuis safeStorage :
 *   setConfigOverrides({ 'providers.gemini.apiKey': '...' })
 */
let overrides: Json = {};
export function setConfigOverrides(o: Json): void {
  overrides = { ...overrides, ...o };
}

/**
 * Accès aux clés API déchiffrées (process main Electron : src/main/secrets.ts, trousseau macOS via safeStorage).
 * Installé, il est la SEULE source des clés après les variables d'env : les valeurs `providers.*.apiKey`
 * venant des surcharges ou de config.json sont ignorées (l'UI ne reçoit et ne renvoie que des clés masquées).
 * Sans accesseur (CLI, bench) : variables d'env, puis config.json en clair (usage développeur).
 */
type SecretAccessor = (key: string) => string | undefined;
let secretAccessor: SecretAccessor | null = null;
export function setSecretAccessor(fn: SecretAccessor | null): void {
  secretAccessor = typeof fn === 'function' ? fn : null;
}

/** Charge la config effective. Relit le fichier seulement s'il a changé (mtime). */
export function loadConfig(): LLMConfig {
  const file = readConfigFile();
  const g = (path: string) => {
    const o = getSetting(overrides, path);
    return o !== undefined ? o : getSetting(file, path);
  };
  const env = process.env;
  const secret = (path: string): string | undefined => {
    if (secretAccessor) {
      try {
        return str(secretAccessor(path));
      } catch {
        return undefined;
      }
    }
    const v = str(g(path));
    return v && !/…|•••/.test(v) ? v : undefined; // jamais une valeur masquée
  };

  const localFirst = parseBool(env.DICTA_LOCAL_FIRST) ?? parseBool(g('providers.localFirst')) ?? false;
  const baseOrder = parseProviders(env.DICTA_PROVIDERS) ?? parseProviders(g('providers.order')) ?? DEFAULT_ORDER;

  const dailyLimits: Partial<Record<ProviderId, number>> = {};
  for (const id of ALL_PROVIDERS) {
    const n = num(g(`providers.${id}.dailyLimit`));
    if (n) dailyLimits[id] = n;
  }

  const level = str(g('cleaning.level'));
  const rawVocab = g('cleaning.vocabulary');
  const vocab: string[] = (Array.isArray(rawVocab) ? rawVocab : typeof rawVocab === 'string' ? rawVocab.split('\n') : [])
    .filter((s: unknown): s is string => typeof s === 'string' && !!s.trim())
    .map((s: string) => s.trim());

  const model = (id: ProviderId, envName: string) => str(env[envName]) ?? str(g(`providers.${id}.model`)) ?? DEFAULT_MODELS[id];

  return {
    providers: applyLocalFirst(baseOrder, localFirst),
    localFirst,
    models: {
      gemini: model('gemini', 'DICTA_GEMINI_MODEL'),
      groq: model('groq', 'DICTA_GROQ_MODEL'),
      zai: model('zai', 'DICTA_ZAI_MODEL'),
      openrouter: model('openrouter', 'DICTA_OPENROUTER_MODEL'),
      ollama: model('ollama', 'DICTA_OLLAMA_MODEL'),
    },
    keys: {
      gemini: str(env.GEMINI_API_KEY) ?? str(env.GOOGLE_API_KEY) ?? secret('providers.gemini.apiKey'),
      groq: str(env.GROQ_API_KEY) ?? secret('providers.groq.apiKey'),
      zai: str(env.ZAI_API_KEY) ?? secret('providers.zai.apiKey'),
      openrouter: str(env.OPENROUTER_API_KEY) ?? secret('providers.openrouter.apiKey'),
    },
    ollama: {
      url: (str(env.OLLAMA_HOST) ?? str(g('providers.ollama.url')) ?? 'http://localhost:11434')
        .replace(/\/+$/, '')
        .replace(/^(?!https?:\/\/)/, 'http://'),
      keepAlive: str(g('providers.ollama.keepAlive')) ?? '2m', // ultime recours : libère la mémoire 2 min après la dernière dictée (« -1m » = permanent : a saturé la RAM d'un Mac 16 Go)
    },
    gemini: { thinkingLevel: str(env.DICTA_GEMINI_THINKING) ?? str(g('providers.gemini.thinkingLevel')) },
    openrouter: { dataCollection: g('providers.openrouter.dataCollection') === 'deny' ? 'deny' : 'allow' },
    timeouts: {
      cloudMs: num(env.DICTA_CLOUD_TIMEOUT_MS) ?? num(g('providers.timeouts.cloudMs')) ?? 8000,
      localMs: num(env.DICTA_LOCAL_TIMEOUT_MS) ?? num(g("providers.timeouts.localMs")) ?? 25000, // chargement à froid de qwen3.5:4b ≈ 8–12 s
    },
    hedgeMs: num(env.DICTA_HEDGE_MS) ?? num(g('providers.hedgeMs')) ?? 700,
    dailyLimits,
    cleanup: {
      level: level === 'light' || level === 'standard' ? level : 'standard',
      vocabulary: vocab,
    },
  };
}

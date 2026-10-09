import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CleanOptions,
  CleanResult,
} from '../shared/types';
import { distDir, log } from './paths';

/**
 * Charge dynamiquement src/llm/router.ts (compilé en dist/llm/router.js s'il existe)
 * pour ne pas dépendre de sa présence au build. Repli : passthrough.
 */
type CleanFn = (raw: string, opts?: CleanOptions) => Promise<CleanResult>;
export interface RouterModule {
  cleanTranscript: CleanFn;
  testProvider?: (id: string) => Promise<{ ok: boolean; message: string; latencyMs: number }>;
  providerStatuses?: () => Promise<
    { id: string; uiStatus: string; usedToday: number; dailyLimit: number | null }[]
  >;
  warmup?: () => Promise<void>;
  setConfigOverrides?: (o: Record<string, unknown>) => void;
  /** Clés API déchiffrées (src/main/secrets.ts) : seule source des clés après les variables d'env. */
  setSecretAccessor?: (fn: ((key: string) => string | undefined) | null) => void;
  /** src/llm/notes.ts (même bundle) — prise de notes. */
  organizeNotes?: (
    transcript: string,
    opts: { signal?: AbortSignal; onProgress?: (step: number, total: number) => void },
  ) => Promise<{ markdown: string; title: string; provider: string; model: string; parts: number; latencyMs: number }>;
}
let cached: CleanFn | null | undefined;
let mod: RouterModule | null = null;

/** Module router complet (testProvider, providerStatuses, warmup…), ou null. */
export function routerModule(): RouterModule | null {
  load();
  return mod;
}

function load(): CleanFn | null {
  if (cached !== undefined) return cached;
  const p = path.join(distDir(), 'llm', 'router.js');
  cached = null;
  if (fs.existsSync(p)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const m = require(p);
      if (typeof m.cleanTranscript === 'function') {
        mod = m as RouterModule;
        cached = m.cleanTranscript as CleanFn;
      }
      else log('cleaner: router.js sans export cleanTranscript');
    } catch (e) {
      log('cleaner: échec du chargement du router', e);
    }
  } else log('cleaner: pas de router LLM compilé → passthrough');
  return cached;
}

export const routerAvailable = (): boolean => load() != null;

export async function clean(raw: string, opts: CleanOptions & { timeoutMs?: number } = {}): Promise<CleanResult> {
  const fn = load();
  const t0 = Date.now();
  const passthrough = (): CleanResult => ({ text: raw, provider: 'passthrough', model: '', latencyMs: Date.now() - t0 });
  if (!fn) return passthrough();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 10000);
  try {
    const r = await fn(raw, { ...opts, signal: ac.signal });
    return r && typeof r.text === 'string' && r.text.trim() ? r : passthrough();
  } catch (e) {
    log('cleaner: erreur router → passthrough', e);
    return passthrough();
  } finally {
    clearTimeout(timer);
  }
}

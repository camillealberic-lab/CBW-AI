import { app } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { redact } from '../shared/redact';

/** Racine de l'app (dossier contenant package.json / dist). */
export const appRoot = (): string => app.getAppPath();
/** Resources/ du bundle .app (binaires whisper, icônes) quand l'app est packagée, sinon la racine du projet. */
export const resourcesDir = (): string => (app.isPackaged ? process.resourcesPath : appRoot());
/** dist/ compilé. */
export const distDir = (): string => path.join(appRoot(), 'dist');
/** ~/.dicta-ai (`DICTA_AI_HOME` le remplace : tests « nouvel utilisateur »). */
export const dataDir = (): string => {
  const d = process.env.DICTA_AI_HOME || path.join(os.homedir(), '.dicta-ai');
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};
export const modelsDir = (): string => path.join(dataDir(), 'models');
export const logFile = (): string => path.join(dataDir(), 'dicta.log');

export function firstExisting(cands: (string | undefined)[]): string | undefined {
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return undefined;
}

/**
 * Texte dicté / transcrit dans le journal : seulement avec DICTA_LOG_TEXT=1 (débogage local).
 * Par défaut le journal ne contient que des longueurs, durées et identifiants.
 */
export const LOG_TEXT = process.env.DICTA_LOG_TEXT === '1';
/** « 42 car. » (ou le texte entre guillemets si DICTA_LOG_TEXT=1). */
export const textForLog = (t: unknown): string => {
  const s = String(t ?? '');
  return LOG_TEXT ? JSON.stringify(s) : `${s.length} car.`;
};

const MAX_LOG_BYTES = 2 * 1024 * 1024;
let checkedSize = 0;

export function log(...args: unknown[]): void {
  let line = `[${new Date().toISOString()}] ${args
    .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : safeJson(a)))
    .join(' ')}`;
  line = redact(line); // jamais de clé API / jeton dans le journal ni la console
  console.log(line);
  try {
    // Rotation simple : au-delà de 2 Mo, l'ancien journal devient dicta.log.1 (un seul gardé).
    if (Date.now() - checkedSize > 60_000) {
      checkedSize = Date.now();
      const st = fs.statSync(logFile(), { throwIfNoEntry: false });
      if (st && st.size > MAX_LOG_BYTES) fs.renameSync(logFile(), logFile() + '.1');
    }
    fs.appendFileSync(logFile(), line + '\n', { mode: 0o600 });
  } catch {
    /* ignore */
  }
}

function safeJson(a: unknown): string {
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

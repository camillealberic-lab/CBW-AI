import { ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { dataDir, firstExisting, log } from './paths';
import { settings } from './settings';

/**
 * Cycle de vie d'Ollama : si le serveur (:11434) ne répond pas au démarrage et qu'un binaire
 * est trouvé, on lance `ollama serve` lié à l'app (tué à la sortie seulement si c'est nous qui l'avons lancé).
 */
// OLLAMA_HOST (même variable que le router / Ollama lui-même) permet de changer de port.
const HOST = (process.env.OLLAMA_HOST || '127.0.0.1:11434').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const BASE = `http://${HOST}`;
export const DEFAULT_OLLAMA_MODEL = 'gemma4:e4b';

let proc: ChildProcess | null = null;

export function ollamaBin(): string | undefined {
  const pathDirs = (process.env.PATH || '').split(':').filter(Boolean);
  return firstExisting([
    process.env.DICTA_OLLAMA_BIN,
    path.join(os.homedir(), '.local', 'ollama', 'ollama'),
    '/Applications/Ollama.app/Contents/Resources/ollama',
    ...pathDirs.map((d) => path.join(d, 'ollama')),
    '/usr/local/bin/ollama',
    '/opt/homebrew/bin/ollama',
  ]);
}

export const ollamaModel = (): string => String(settings.get('providers.ollama.model') || DEFAULT_OLLAMA_MODEL);

async function getJson(p: string, timeoutMs = 1500): Promise<any | null> {
  try {
    const r = await fetch(BASE + p, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export const ollamaRunning = async (): Promise<boolean> => (await getJson('/api/version')) != null;

const sameModel = (a: string, b: string): boolean => {
  const n = (s: string) => (s.includes(':') ? s : `${s}:latest`);
  return n(a) === n(b);
};

export async function ollamaStatus(): Promise<{ installed: boolean; running: boolean; model: string; modelPresent: boolean }> {
  const model = ollamaModel();
  const tags = await getJson('/api/tags');
  const names: string[] = (tags?.models ?? []).map((m: any) => String(m?.name ?? m?.model ?? ''));
  return { installed: !!ollamaBin(), running: tags != null, model, modelPresent: names.some((n) => sameModel(n, model)) };
}

/** Lance `ollama serve` si nécessaire. Renvoie true si le serveur répond. */
export async function ensureOllama(): Promise<boolean> {
  if (await ollamaRunning()) {
    if (!proc) log('ollama: déjà en marche sur', HOST);
    return true;
  }
  const bin = ollamaBin();
  if (!bin) {
    log('ollama: binaire introuvable (Ollama non installé)');
    return false;
  }
  if (!proc) {
    log('ollama: démarrage', bin, 'serve');
    const out = fs.openSync(path.join(dataDir(), 'ollama.log'), 'a');
    // Serveur lancé par l'app : écoute locale seulement, CORS par défaut d'Ollama (pas d'OLLAMA_ORIGINS
    // hérité, qui pourrait l'ouvrir à « * » et laisser n'importe quel site web interroger le modèle).
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(HOST)) log('ollama: attention, OLLAMA_HOST n’est pas local :', HOST);
    const { OLLAMA_ORIGINS: _origins, ...env } = process.env;
    const p = spawn(bin, ['serve'], {
      env: { ...env, OLLAMA_KEEP_ALIVE: '5m', OLLAMA_HOST: HOST },
      stdio: ['ignore', out, out],
    });
    fs.closeSync(out);
    proc = p;
    p.on('error', (e) => log('ollama: échec du lancement', e));
    p.on('exit', (code) => {
      log('ollama: arrêté', code);
      if (proc === p) proc = null;
    });
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (await ollamaRunning()) {
      log(`ollama: prêt en ${Date.now() - t0} ms`);
      return true;
    }
    if (!proc) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
  log('ollama: pas de réponse après 15 s');
  return false;
}

/** Arrête Ollama seulement si c'est l'app qui l'a lancé. */
export function stopOllama(): void {
  if (proc) {
    log('ollama: arrêt (lancé par CBW AI)');
    proc.kill();
    proc = null;
  }
}

/** POST /api/pull en streaming (NDJSON) ; onProgress reçoit { status, percent? }. */
export async function pullOllamaModel(onProgress: (p: { status: string; percent?: number }) => void): Promise<void> {
  if (!(await ensureOllama())) {
    onProgress({ status: 'error: Ollama n’est pas installé ou ne démarre pas' });
    throw new Error('Ollama indisponible');
  }
  const model = ollamaModel();
  log('ollama: pull', model);
  const res = await fetch(`${BASE}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok || !res.body) {
    onProgress({ status: `error: HTTP ${res.status}` });
    throw new Error(`ollama pull HTTP ${res.status}`);
  }
  const dec = new TextDecoder();
  let buf = '';
  let lastKey = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let o: any;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.error) {
        onProgress({ status: `error: ${o.error}` });
        throw new Error(String(o.error));
      }
      const percent = o.total ? Math.floor(((o.completed ?? 0) / o.total) * 100) : undefined;
      const key = `${o.status}|${percent}`;
      if (key !== lastKey) {
        lastKey = key;
        onProgress({ status: String(o.status ?? ''), percent });
      }
    }
  }
  log('ollama: pull terminé', model);
}

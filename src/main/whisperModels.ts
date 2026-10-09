import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { log, modelsDir } from './paths';

/**
 * Téléchargement des modèles Whisper au premier lancement (dépôt officiel whisper.cpp sur Hugging Face).
 * Reprise : fichier `.part` + en-tête Range ; vérification taille + SHA-256 (x-linked-etag HF = sha256 LFS).
 */
const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

export interface ModelInfo {
  file: string;
  size: number;
  sha256: string;
}

/** Valeurs relevées sur Hugging Face (x-linked-size / x-linked-etag), oct. 2026. */
export const CATALOG: Record<string, ModelInfo> = {
  'large-v3-turbo': { file: 'ggml-large-v3-turbo-q5_0.bin', size: 574041195, sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2' },
  small: { file: 'ggml-small-q5_1.bin', size: 190085487, sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb' },
  medium: { file: 'ggml-medium-q5_0.bin', size: 539212467, sha256: '19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f' },
  base: { file: 'ggml-base-q5_1.bin', size: 59707625, sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898' },
  tiny: { file: 'ggml-tiny-q5_1.bin', size: 32152673, sha256: '818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7' },
};
export const DEFAULT_DOWNLOAD = 'large-v3-turbo';

export interface DownloadProgress {
  model: string;
  received: number;
  total: number;
  percent: number;
  state: 'downloading' | 'verifying' | 'done' | 'error';
  error?: string;
}

class ModelDownloader extends EventEmitter {
  current: DownloadProgress | null = null;
  private job: Promise<string> | null = null;

  get downloading(): boolean {
    return !!this.job;
  }

  /** Télécharge `name` (clé du catalogue). Un seul téléchargement à la fois : un 2e appel rejoint le 1er. */
  download(name: string = DEFAULT_DOWNLOAD): Promise<string> {
    if (this.job) return this.job;
    const info = CATALOG[name] ?? CATALOG[DEFAULT_DOWNLOAD];
    if (!CATALOG[name]) name = DEFAULT_DOWNLOAD;
    this.job = this.run(name, info).finally(() => (this.job = null));
    return this.job;
  }

  private emitP(p: DownloadProgress): void {
    this.current = p;
    this.emit('progress', p);
  }

  private async run(name: string, info: ModelInfo): Promise<string> {
    const dir = modelsDir();
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, info.file);
    const part = dest + '.part';
    if (fs.existsSync(dest) && fs.statSync(dest).size === info.size) return dest;
    try {
      await downloadVerified(HF + info.file, part, info.size, info.sha256, (received) =>
        this.emitP({ model: name, received, total: info.size, percent: Math.floor((received / info.size) * 100), state: 'downloading' }),
        () => this.emitP({ model: name, received: info.size, total: info.size, percent: 100, state: 'verifying' }),
      );
      fs.renameSync(part, dest);
      log('whisper-dl: modèle prêt', dest);
      this.emitP({ model: name, received: info.size, total: info.size, percent: 100, state: 'done' });
      return dest;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('whisper-dl: échec', msg);
      this.emitP({ model: name, received: 0, total: info.size, percent: this.current?.percent ?? 0, state: 'error', error: msg });
      throw e;
    }
  }
}

/**
 * Téléchargement générique vers `part` (reprise Range, 4 tentatives) puis vérification taille + SHA-256.
 * Le fichier `.part` reste en place (renommage par l'appelant) ; supprimé si l'empreinte est invalide.
 */
export async function downloadVerified(
  url: string,
  part: string,
  size: number,
  sha256: string,
  onProgress: (received: number) => void,
  onVerify?: () => void,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fetchTo(url, part, size, onProgress);
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      log(`dl: tentative ${attempt} échouée (${path.basename(part)}), reprise dans ${attempt * 2} s`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  onVerify?.();
  const got = await sha256File(part);
  if (got !== sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(`empreinte SHA-256 invalide (${got.slice(0, 12)}…) — fichier supprimé, réessayez`);
  }
}

async function fetchTo(url: string, part: string, size: number, onProgress: (received: number) => void): Promise<void> {
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (have > size) {
    fs.rmSync(part);
    have = 0;
  }
  if (have === size) return;
  log(`dl: ${url} (${have ? `reprise à ${have} o` : 'début'})`);
  const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: 'follow' });
  if (res.status === 200 && have) have = 0; // Range ignoré : on repart de zéro
  else if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error('réponse vide');
  const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
  let received = have;
  let lastEmit = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length;
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
      const now = Date.now();
      if (now - lastEmit > 250) {
        lastEmit = now;
        onProgress(received);
      }
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  if (received !== size) throw new Error(`taille inattendue ${received} / ${size}`);
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

export const modelDownloader = new ModelDownloader();

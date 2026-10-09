import { utilityProcess } from 'electron';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { distDir, log, modelsDir } from './paths';
import type { Turn } from './diarize-worker';
import { downloadVerified } from './whisperModels';

/**
 * Diarisation locale (« qui a dit quoi ») : sherpa-onnx (addon Node prébâti darwin-arm64) avec
 *  - segmentation pyannote 3.0 (ONNX, 6 Mo) ;
 *  - empreintes vocales NeMo TitaNet small (ONNX, 40 Mo).
 * Choix mesuré sur une conversation synthétique FR à 3 voix (2 min) : TitaNet small 3,6 % d'erreur
 * de trames, ~5 % de la durée audio sur M4 (4 threads) ; eres2net / CAM++ / ResNet34 séparaient moins bien.
 * Modèles téléchargés au premier usage dans ~/.dicta-ai/models/diarization/ (Hugging Face, SHA-256 vérifié).
 */
const HF = 'https://huggingface.co/csukuangfj/';
export const DIA_MODELS = {
  segmentation: {
    file: 'pyannote-segmentation-3.0.onnx',
    url: HF + 'sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx',
    size: 5992913,
    sha256: '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079',
  },
  embedding: {
    file: 'nemo_en_titanet_small.onnx',
    url: HF + 'speaker-embedding-models/resolve/main/nemo_en_titanet_small.onnx',
    size: 40257283,
    sha256: 'ad4a1802485d8b34c722d2a9d04249662f2ece5d28a7a039063ca22f515a789e',
  },
} as const;
/** Seuil de regroupement (distance cosinus) : 0,8 sépare 2–4 voix sans éclater une voix en deux (0,5–0,75 sur-segmentait). */
export const DIA_THRESHOLD = 0.8;

export const diaModelsDir = (): string => path.join(modelsDir(), 'diarization');
const modelPath = (k: keyof typeof DIA_MODELS): string => path.join(diaModelsDir(), DIA_MODELS[k].file);
export const diarizationModelsReady = (): boolean =>
  (Object.keys(DIA_MODELS) as (keyof typeof DIA_MODELS)[]).every((k) => {
    try {
      return fs.statSync(modelPath(k)).size === DIA_MODELS[k].size;
    } catch {
      return false;
    }
  });

export interface DiaDownloadProgress {
  received: number;
  total: number;
  percent: number;
  state: 'downloading' | 'verifying' | 'done' | 'error';
  error?: string;
}

class DiaModels extends EventEmitter {
  current: DiaDownloadProgress | null = null;
  private job: Promise<boolean> | null = null;

  /** Télécharge les modèles manquants (un seul téléchargement à la fois). Résout false en cas d'échec (journalisé). */
  ensure(): Promise<boolean> {
    if (diarizationModelsReady()) return Promise.resolve(true);
    if (!this.job) this.job = this.run().finally(() => (this.job = null));
    return this.job;
  }

  get downloading(): boolean {
    return !!this.job;
  }

  private emitP(p: DiaDownloadProgress): void {
    this.current = p;
    this.emit('progress', p);
  }

  private async run(): Promise<boolean> {
    const keys = Object.keys(DIA_MODELS) as (keyof typeof DIA_MODELS)[];
    const total = keys.reduce((a, k) => a + DIA_MODELS[k].size, 0);
    fs.mkdirSync(diaModelsDir(), { recursive: true });
    let base = 0;
    try {
      for (const k of keys) {
        const m = DIA_MODELS[k];
        const dest = modelPath(k);
        if (!(fs.existsSync(dest) && fs.statSync(dest).size === m.size)) {
          const part = dest + '.part';
          await downloadVerified(m.url, part, m.size, m.sha256, (r) =>
            this.emitP({ received: base + r, total, percent: Math.floor(((base + r) / total) * 100), state: 'downloading' }),
          );
          fs.renameSync(part, dest);
        }
        base += m.size;
      }
      log('diarisation: modèles prêts', diaModelsDir());
      this.emitP({ received: total, total, percent: 100, state: 'done' });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('diarisation: téléchargement des modèles impossible', msg);
      this.emitP({ received: base, total, percent: Math.floor((base / total) * 100), state: 'error', error: msg });
      return false;
    }
  }
}
export const diaModels = new DiaModels();

export interface DiarizationResult {
  mode: 'two-track' | 'mix';
  turns: Turn[];
  audioSec: number;
  ms: number;
  rssMB?: number;
}

/**
 * Diarise le WAV complet d'une note dans un processus utilitaire (UI fluide, mémoire rendue à la fin).
 * Renvoie null si indisponible / en échec (la note est alors faite sans locuteurs).
 */
export async function diarize(files: { mix: string; mic?: string; sys?: string }, signal?: AbortSignal): Promise<DiarizationResult | null> {
  if (!(await diaModels.ensure())) return null;
  if (signal?.aborted) return null;
  const script = path.join(distDir(), 'main', 'diarize-worker.js');
  const audioSec = Math.max(1, (fs.statSync(files.mix).size - 44) / 32000);
  return new Promise((resolve) => {
    let done = false;
    const child = utilityProcess.fork(script, [], { serviceName: 'CBW AI — séparation des voix', stdio: 'pipe' });
    let errTail = '';
    child.stderr?.on('data', (d) => (errTail = (errTail + d).slice(-1000)));
    const finish = (r: DiarizationResult | null, why?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (why) log('diarisation: échec →', why, errTail.trim().split('\n').slice(-2).join(' '));
      child.kill();
      resolve(r);
    };
    // Garde-fou : jamais plus de la moitié de la durée audio (≥ 60 s) ; mesuré ~5 % sur M4.
    const timer = setTimeout(() => finish(null, 'délai dépassé'), Math.max(60000, audioSec * 500));
    const onAbort = () => finish(null, 'annulée');
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('message', (m: { ok: boolean; error?: string; refineError?: string } & DiarizationResult) => {
      if (m.refineError) log('diarisation: affinage ignoré', m.refineError);
      if (m.ok) finish({ mode: m.mode, turns: m.turns, audioSec: m.audioSec, ms: m.ms, rssMB: m.rssMB });
      else finish(null, m.error);
    });
    child.on('exit', (code) => finish(null, `processus terminé (${code})`));
    child.postMessage({
      ...files,
      segmentation: modelPath('segmentation'),
      embedding: modelPath('embedding'),
      threads: 4,
      threshold: DIA_THRESHOLD,
    });
  });
}

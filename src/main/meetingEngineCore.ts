import { spawn } from 'node:child_process';

// Cœur pur (sans Electron) du moteur de réunion « dicta-meeting » (FluidAudio + Parakeet TDT v3) :
// choix du moteur, analyse des sorties JSON du binaire, exécution d'une commande. Testable avec
// node --experimental-strip-types src/main/meetingEngineCore.test.ts

export type EngineId = 'fluid' | 'whisper';

/** Parakeet / FluidAudio à partir de macOS 15 (bug Core ML/BNNS de macOS 14, corrigé en 15). */
export const FLUID_MIN_MACOS = 15;

export interface EngineEnv {
  platform: string;
  /** Version majeure de macOS (15, 26…) ; 0 si inconnue. */
  macMajor: number;
  /** Tous les fichiers de modèles présents (taille conforme, vérifiés au téléchargement). */
  modelsReady: boolean;
  /** Binaire dicta-meeting trouvé. */
  binPresent: boolean;
  /** Réglage `notes.engine` : 'auto' (défaut) ou 'whisper' (forcer l'ancienne chaîne). */
  setting?: string;
  /** Le moteur a échoué dans cette session (repli déjà décidé). */
  failed?: boolean;
}
export interface EngineChoice {
  engine: EngineId;
  reason: string;
}

/** macOS ≥ 15 ET modèles présents ET binaire présent → nouveau moteur ; sinon Whisper + sherpa, sans réglage à toucher. */
export function chooseEngine(e: EngineEnv): EngineChoice {
  if (e.setting === 'whisper') return { engine: 'whisper', reason: 'réglage : moteur classique' };
  if (e.platform !== 'darwin') return { engine: 'whisper', reason: 'système non pris en charge' };
  if (e.failed) return { engine: 'whisper', reason: 'moteur en erreur : repli sur la chaîne classique' };
  if (!(e.macMajor >= FLUID_MIN_MACOS)) return { engine: 'whisper', reason: `macOS ${e.macMajor || '?'} < ${FLUID_MIN_MACOS}` };
  if (!e.binPresent) return { engine: 'whisper', reason: 'binaire dicta-meeting absent' };
  if (!e.modelsReady) return { engine: 'whisper', reason: 'modèles pas encore téléchargés' };
  return { engine: 'fluid', reason: 'ok' };
}

/** « 15.4.1 » → 15 ; « 26.0 » → 26 ; illisible → 0. */
export function parseMacMajor(productVersion: string): number {
  const m = /^(\d+)/.exec(String(productVersion).trim());
  return m ? Number(m[1]) : 0;
}
/** os.release() (noyau Darwin) → version de macOS approchée (Darwin 23 = 14, 24 = 15, ≥ 25 = 26+) ; repli si sw_vers échoue. */
export function macMajorFromDarwin(release: string): number {
  const d = Number(/^(\d+)/.exec(release)?.[1]);
  if (!Number.isFinite(d) || d < 20) return 0;
  return d >= 25 ? 26 : d === 24 ? 15 : d - 9;
}

// ── Sorties JSON du binaire (une ligne sur stdout, erreurs {"error": "…"} + code ≠ 0)

export interface EngineWord {
  w: string;
  /** secondes */
  s: number;
  e: number;
}
export interface EngineTranscript {
  text: string;
  durationSec: number;
  words: EngineWord[];
  transcribeSeconds: number;
}
export interface EngineTurn {
  start: number;
  end: number;
  speaker: string;
}
export interface EngineDiarization {
  turns: EngineTurn[];
  speakerCount: number;
  diarizeSeconds: number;
  /** Empreinte moyenne (256 flottants) par locuteur, si `--embeddings`. */
  embeddings?: Record<string, number[]>;
}

export class EngineError extends Error {}

/** Dernière ligne JSON (objet) de la sortie standard ; les journaux de FluidAudio vont sur stderr mais on reste tolérant. */
export function lastJsonLine(stdout: string): Record<string, unknown> {
  const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{') && l.endsWith('}'));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const v = JSON.parse(lines[i]);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* ligne suivante */
    }
  }
  throw new EngineError('sortie du moteur illisible');
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function checkError(o: Record<string, unknown>): void {
  if (typeof o.error === 'string') throw new EngineError(o.error.slice(0, 300));
}

export function parseTranscribe(stdout: string): EngineTranscript {
  const o = lastJsonLine(stdout);
  checkError(o);
  if (typeof o.text !== 'string') throw new EngineError('transcription absente de la sortie du moteur');
  const words: EngineWord[] = [];
  if (Array.isArray(o.words))
    for (const x of o.words as Record<string, unknown>[]) {
      if (!x || typeof x.w !== 'string') continue;
      const s = num(x.s, NaN);
      const e = num(x.e, NaN);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      words.push({ w: x.w, s: Math.max(0, s), e: Math.max(s, e) });
    }
  return { text: o.text.replace(/\s+/g, ' ').trim(), durationSec: num(o.duration), words, transcribeSeconds: num(o.transcribeSeconds) };
}

export function parseDiarize(stdout: string): EngineDiarization {
  const o = lastJsonLine(stdout);
  checkError(o);
  if (!Array.isArray(o.segments)) throw new EngineError('segments absents de la sortie du moteur');
  const turns: EngineTurn[] = [];
  for (const x of o.segments as Record<string, unknown>[]) {
    const start = num(x?.s, NaN);
    const end = num(x?.e, NaN);
    if (typeof x?.speaker !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    turns.push({ start, end, speaker: x.speaker });
  }
  turns.sort((a, b) => a.start - b.start);
  const out: EngineDiarization = { turns, speakerCount: num(o.speakerCount, new Set(turns.map((t) => t.speaker)).size), diarizeSeconds: num(o.diarizeSeconds) };
  if (o.embeddings && typeof o.embeddings === 'object') {
    const emb: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(o.embeddings as Record<string, unknown>))
      if (Array.isArray(v) && v.length >= 8 && v.every((x) => typeof x === 'number' && Number.isFinite(x))) emb[k] = v as number[];
    out.embeddings = emb;
  }
  return out;
}

/**
 * Réglages de séparation des voix FluidAudio (recalibrés le 15 oct. sur 3 / 2 / 1 voix, dictaphone.md) :
 * VBx « sur-découpe » (Fa 0,4 au lieu de 0,07 : sur 50 s le défaut fondait 3 voix en 2), puis les groupes dont les
 * empreintes moyennes sont proches (cosinus ≥ 0,62) sont refondus ; un groupe de moins de 1,5 s de parole est
 * rattaché au tour voisin. Mesures : même voix 0,69–0,85, voix différentes ≤ 0,57.
 */
export const FLUID_DIARIZE_ARGS = ['--fa', '0.4', '--embeddings'];
export const FLUID_MERGE_SIM = 0.62;
export const FLUID_MIN_SPEAKER_SEC = 1.5;

/** Fusion agglomérative (centroïdes pondérés par la durée, cosinus ≥ minSim), comme speakers.mergeCentroids (pur, sans import). */
function mergeByCentroid(items: { id: string; e: number[]; weight: number }[], minSim: number): Map<string, string> {
  const norm = (v: Float64Array) => {
    const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  };
  const g = items.map((c) => ({ ids: [c.id], e: norm(Float64Array.from(c.e)), w: Math.max(c.weight, 1e-6) }));
  const dot = (a: Float64Array, b: Float64Array) => a.reduce((s, x, i) => s + x * b[i], 0);
  while (g.length > 1) {
    let bi = 0;
    let bj = 1;
    let bs = -2;
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const v = dot(g[i].e, g[j].e);
        if (v > bs) [bs, bi, bj] = [v, i, j];
      }
    if (bs < minSim) break;
    const A = g[bi];
    const B = g[bj];
    const e = norm(A.e.map((x, i) => (x * A.w + B.e[i] * B.w) / (A.w + B.w)));
    g.splice(bj, 1);
    g[bi] = { ids: [...A.ids, ...B.ids], e, w: A.w + B.w };
  }
  const m = new Map<string, string>();
  for (const x of g) for (const id of x.ids) m.set(id, x.ids[0]);
  return m;
}

/** Fusion des groupes sur-découpés + absorption des groupes minuscules. Pur. */
export function refineDiarization(d: EngineDiarization, o: { minSim?: number; minSec?: number } = {}): EngineDiarization {
  const dur = new Map<string, number>();
  for (const t of d.turns) dur.set(t.speaker, (dur.get(t.speaker) ?? 0) + t.end - t.start);
  let turns = d.turns;
  const emb = d.embeddings ?? {};
  const items = [...dur.keys()].filter((k) => emb[k]).map((k) => ({ id: k, e: emb[k], weight: dur.get(k)! }));
  if (items.length > 1) {
    const map = mergeByCentroid(items, o.minSim ?? FLUID_MERGE_SIM);
    turns = turns.map((t) => ({ ...t, speaker: map.get(t.speaker) ?? t.speaker }));
  }
  // groupes minuscules → tour voisin le plus proche
  const tot = new Map<string, number>();
  for (const t of turns) tot.set(t.speaker, (tot.get(t.speaker) ?? 0) + t.end - t.start);
  const minSec = o.minSec ?? FLUID_MIN_SPEAKER_SEC;
  const small = new Set([...tot].filter(([, v]) => v < minSec).map(([k]) => k));
  if (small.size && small.size < tot.size) {
    const big = turns.filter((t) => !small.has(t.speaker));
    turns = turns.map((t) => {
      if (!small.has(t.speaker)) return t;
      let best = big[0];
      let gap = Infinity;
      for (const b of big) {
        const g = Math.max(0, b.start - t.end, t.start - b.end);
        if (g < gap) {
          gap = g;
          best = b;
        }
      }
      return { ...t, speaker: best.speaker };
    });
  }
  // tours consécutifs d'une même voix réunis
  const merged: EngineTurn[] = [];
  for (const t of turns.slice().sort((a, b) => a.start - b.start)) {
    const l = merged[merged.length - 1];
    if (l && l.speaker === t.speaker && t.start - l.end < 0.3) l.end = Math.max(l.end, t.end);
    else merged.push({ ...t });
  }
  return { ...d, turns: merged, speakerCount: new Set(merged.map((t) => t.speaker)).size };
}

/** Mots du moteur (secondes relatives au morceau) → ms absolus sur la chronologie de la session. */
export function wordsToMs(words: EngineWord[], offsetMs: number): { w: string; s: number; e: number }[] {
  return words.map((x) => ({ w: x.w, s: Math.round(offsetMs + x.s * 1000), e: Math.round(offsetMs + x.e * 1000) }));
}

// ── Exécution

export interface RunOpts {
  timeoutMs: number;
  signal?: AbortSignal;
  /** DICTA_MEETING_MODELS : dossier des modèles. */
  modelsDir?: string;
}

/** Lance `bin args…` et renvoie la sortie standard. Jamais de contenu de réunion dans les messages d'erreur. */
export function runBin(bin: string, args: string[], o: RunOpts): Promise<string> {
  return new Promise((resolve, reject) => {
    if (o.signal?.aborted) return reject(new EngineError('annulé'));
    const env = { ...process.env, ...(o.modelsDir ? { DICTA_MEETING_MODELS: o.modelsDir } : {}) };
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    let err = '';
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      finish(() => reject(new EngineError(`délai dépassé (${Math.round(o.timeoutMs / 1000)} s)`)));
    }, o.timeoutMs);
    const onAbort = () => {
      p.kill('SIGKILL');
      finish(() => reject(new EngineError('annulé')));
    };
    o.signal?.addEventListener('abort', onAbort, { once: true });
    p.stdout.on('data', (d) => {
      if (out.length < 32 * 1024 * 1024) out += d;
    });
    p.stderr.on('data', (d) => (err = (err + d).slice(-600)));
    p.on('error', (e) => finish(() => reject(new EngineError(`lancement impossible : ${e.message}`))));
    p.on('close', (code) =>
      finish(() => {
        if (code === 0) return resolve(out);
        // {"error": …} sur stdout si le binaire l'a écrit, sinon fin de stderr (journaux FluidAudio : pas de texte de réunion)
        let msg = '';
        try {
          msg = String(lastJsonLine(out).error ?? '');
        } catch {
          /* pas de JSON */
        }
        reject(new EngineError(`code ${code} : ${(msg || err.trim().split('\n').slice(-1)[0] || '').slice(0, 300)}`));
      }),
    );
  });
}

/** Délai d'une transcription de morceau / de fichier : large (premier chargement Core ML ≈ 12 s). */
export const transcribeTimeoutMs = (audioSec: number): number => Math.max(60_000, 30_000 + audioSec * 1000);
export const diarizeTimeoutMs = (audioSec: number): number => Math.max(120_000, audioSec * 500);

/**
 * Tranches d'un long fichier (échantillons 16 kHz) : ≤ `maxSec`, chaque coupe placée au creux le plus calme (100 ms)
 * des `searchSec` dernières secondes de la tranche. `read(from, to)` renvoie le WAV (en-tête 44 octets) de [from, to[.
 */
export function splitLong(total: number, read: (from: number, to: number) => Buffer, maxSec = 600, searchSec = 20): [number, number][] {
  const R = 16000;
  const max = maxSec * R;
  const out: [number, number][] = [];
  let at = 0;
  while (total - at > max) {
    const winFrom = at + max - searchSec * R;
    const buf = read(winFrom, at + max);
    const n = Math.floor((buf.length - 44) / 2);
    const F = R / 10;
    let best = at + max;
    let bestE = Infinity;
    for (let f = 0; f + F <= n; f += F) {
      let e = 0;
      for (let i = f; i < f + F; i++) {
        const v = buf.readInt16LE(44 + i * 2);
        e += v * v;
      }
      if (e < bestE) {
        bestE = e;
        best = winFrom + f + F / 2;
      }
    }
    out.push([at, best]);
    at = best;
  }
  if (total > at) out.push([at, total]);
  return out;
}

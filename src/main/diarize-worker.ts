// Processus utilitaire (utilityProcess.fork) : diarisation sherpa-onnx sur le WAV complet d'une note.
// Isolé du processus principal : ~300–400 Mo (onnxruntime + audio) libérés à la sortie, UI fluide.
//
// Entrée : { mix, mic?, sys?, segmentation, embedding, threads, threshold, numSpeakers?, mergeSim?, maxSpeakers? }
// Sortie : { ok: true, mode, turns: { start, end, speaker }[], audioSec, ms, sysVoicedSec, groups, merged } | { ok: false, error }
//  - mode 'two-track' : micro + son du Mac présents et le son du Mac contient assez de parole →
//    seule la piste système est triée par voix (« S0 », « S1 »…) ; la piste micro est « Moi » et n'est JAMAIS
//    diarisée (les segments portent leur source, cf. src/main/notes.ts) ;
//  - mode 'mix' : une seule piste utile (présentiel) : le mélange est trié, avec `numSpeakers` si fourni.
// numSpeakers = nombre de personnes présentes (toi compris) : imposé au regroupement (numClusters) ; en deux
// pistes, les autres sont numSpeakers − 1. Sans nombre : seuil de regroupement + fusion des groupes dont les
// centroïdes sont proches (mergeSim) + absorption des groupes minuscules + plafond maxSpeakers.
// Ligne de commande (mesures, sans Electron) : node dist/main/diarize-worker.js job.json
import * as fs from 'node:fs';
import { clusterCount, mergeCentroids } from './speakers';

interface Job {
  mix: string;
  mic?: string;
  sys?: string;
  segmentation: string;
  embedding: string;
  threads: number;
  threshold: number;
  /** Personnes présentes, toi compris (imposé au regroupement quand fourni). */
  numSpeakers?: number;
  /** Similarité cosinus des centroïdes au-delà de laquelle deux groupes sont la même personne (défaut 0,7). */
  mergeSim?: number;
  /** Plafond de groupes en mode automatique (défaut 8). */
  maxSpeakers?: number;
  /** Seuil de parole de la piste système pour le mode deux pistes : max(sysMinSec, sysMinRatio × durée). */
  sysMinSec?: number;
  sysMinRatio?: number;
}
export interface Turn {
  start: number;
  end: number;
  speaker: string;
}

const RATE = 16000;
const FRAME = 1600; // 100 ms

/** Position et taille des données PCM16 (en-tête éventuellement non finalisé → taille du fichier). */
function dataSpan(fd: number, fileSize: number): { off: number; bytes: number } {
  const h = Buffer.alloc(Math.min(fileSize, 4096));
  fs.readSync(fd, h, 0, h.length, 0);
  let o = 12;
  while (o + 8 <= h.length) {
    const id = h.toString('ascii', o, o + 4);
    const size = h.readUInt32LE(o + 4);
    if (id === 'data') {
      const off = o + 8;
      const bytes = size > 0 && off + size <= fileSize ? size : fileSize - off;
      return { off, bytes: bytes & ~1 };
    }
    o += 8 + size + (size & 1);
  }
  return { off: 44, bytes: Math.max(0, (fileSize - 44) & ~1) };
}

/** Lecture par blocs de 1 Mo : `onChunk(samples Int16, index du 1er échantillon)`. */
function readPcm(file: string, onChunk: (s: Int16Array, at: number) => void): number {
  const fd = fs.openSync(file, 'r');
  try {
    const { off, bytes } = dataSpan(fd, fs.fstatSync(fd).size);
    const buf = Buffer.alloc(1 << 20);
    let done = 0;
    while (done < bytes) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, bytes - done), off + done);
      if (n <= 0) break;
      const even = n & ~1;
      onChunk(new Int16Array(buf.buffer, buf.byteOffset, even / 2), done / 2);
      done += even;
    }
    return done / 2;
  } finally {
    fs.closeSync(fd);
  }
}

function loadFloat(file: string): Float32Array {
  const fd = fs.openSync(file, 'r');
  const { bytes } = dataSpan(fd, fs.fstatSync(fd).size);
  fs.closeSync(fd);
  const out = new Float32Array(bytes / 2);
  readPcm(file, (s, at) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s[i] / 32768;
  });
  return out;
}

/** RMS par trame de 100 ms (36 000 valeurs par heure). */
function frameRms(file: string): Float32Array {
  const frames: number[] = [];
  let acc = 0;
  let n = 0;
  readPcm(file, (s) => {
    for (let i = 0; i < s.length; i++) {
      const v = s[i] / 32768;
      acc += v * v;
      if (++n === FRAME) {
        frames.push(Math.sqrt(acc / FRAME));
        acc = 0;
        n = 0;
      }
    }
  });
  return Float32Array.from(frames);
}

/** Trames booléennes → tours (fermeture des trous ≤ gap, durée min). */
function runs(on: boolean[], gapFrames: number, minFrames: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let s = -1;
  let lastOn = -1;
  for (let i = 0; i <= on.length; i++) {
    if (i < on.length && on[i]) {
      if (s < 0) s = i;
      else if (i - lastOn - 1 > gapFrames) {
        if (lastOn + 1 - s >= minFrames) out.push({ start: s, end: lastOn + 1 });
        s = i;
      }
      lastOn = i;
    }
  }
  if (s >= 0 && lastOn + 1 - s >= minFrames) out.push({ start: s, end: lastOn + 1 });
  return out.map((r) => ({ start: (r.start * FRAME) / RATE, end: (r.end * FRAME) / RATE }));
}

/**
 * Locuteurs très minoritaires : rattachés au tour voisin le plus proche. Mode automatique : moins de
 * max(4 s, 3 % de la parole) (une voix de 40 s sur 30 min ne survit plus en « faux locuteur » éphémère) ;
 * nombre imposé : seulement les groupes de moins de 1,5 s.
 */
function absorbSmall(turns: Turn[], minSec = 4, minRatio = 0.03): Turn[] {
  const total = new Map<string, number>();
  for (const t of turns) total.set(t.speaker, (total.get(t.speaker) ?? 0) + t.end - t.start);
  const all = [...total.values()].reduce((a, b) => a + b, 0);
  const small = new Set([...total].filter(([, d]) => d < Math.max(minSec, all * minRatio)).map(([k]) => k));
  if (small.size === 0 || small.size === total.size) return turns;
  const big = turns.filter((t) => !small.has(t.speaker));
  return turns.map((t) => {
    if (!small.has(t.speaker)) return t;
    let best = big[0];
    let bestGap = Infinity;
    for (const b of big) {
      const gap = Math.max(0, b.start - t.end, t.start - b.end);
      if (gap < bestGap) {
        bestGap = gap;
        best = b;
      }
    }
    return { ...t, speaker: best.speaker };
  });
}

interface DiaOut {
  turns: Turn[];
  /** Groupes renvoyés par le regroupement, puis après fusion. */
  groups: number;
  merged: number;
}

function diarize(job: Job, samples: Float32Array, nClusters: number): DiaOut {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx-node');
  const sd = new sherpa.OfflineSpeakerDiarization({
    segmentation: { pyannote: { model: job.segmentation }, numThreads: job.threads },
    embedding: { model: job.embedding, numThreads: job.threads },
    // numClusters > 0 : nombre imposé (le seuil est alors ignoré) ; −1 : seuil seul
    clustering: { numClusters: nClusters, threshold: job.threshold },
    minDurationOn: 0.3,
    minDurationOff: 0.5,
  });
  const segs: { start: number; end: number; speaker: number }[] = sd.process(samples);
  const turns = segs.map((s) => ({ start: s.start, end: s.end, speaker: `S${s.speaker}` }));
  const groups = new Set(turns.map((t) => t.speaker)).size;
  let pieces: Unit[] = turns;
  try {
    pieces = refine(sherpa, job, samples, turns);
  } catch (e) {
    refineError = e instanceof Error ? e.message : String(e); // affinage facultatif : tours bruts
  }
  const fused = fuseGroups(pieces, job, nClusters);
  const forced = nClusters > 0;
  const out = absorbSmall(fused.map(({ start, end, speaker }) => ({ start, end, speaker })), forced ? 1.5 : 4, forced ? 0.01 : 0.03);
  const final = mergeAdjacent(out);
  return { turns: final, groups, merged: new Set(final.map((t) => t.speaker)).size };
}

/**
 * Fusion des groupes trop proches : la même personne éclatée en plusieurs groupes (réverbération, variations
 * de timbre) se retrouve en centroïdes très similaires. Avec un nombre imposé, on fusionne les plus proches
 * jusqu'à ce nombre ; sinon on fusionne au-dessus de `mergeSim` et on plafonne à `maxSpeakers`.
 */
function fuseGroups(pieces: Unit[], job: Job, nClusters: number): Unit[] {
  const acc = new Map<string, { e: Float64Array; w: number }>();
  for (const p of pieces) {
    const d = p.end - p.start;
    if (!p.e || d < 1) continue;
    let a = acc.get(p.speaker);
    if (!a) acc.set(p.speaker, (a = { e: new Float64Array(p.e.length), w: 0 }));
    for (let i = 0; i < a.e.length; i++) a.e[i] += p.e[i] * d;
    a.w += d;
  }
  if (acc.size < 2) return pieces;
  const map = mergeCentroids([...acc].map(([id, a]) => ({ id, e: a.e, weight: a.w })), {
    minSim: job.mergeSim ?? 0.7,
    target: nClusters > 0 ? nClusters : undefined,
    maxGroups: nClusters > 0 ? undefined : job.maxSpeakers ?? 8,
  });
  return pieces.map((p) => ({ ...p, speaker: map.get(p.speaker) ?? p.speaker }));
}

let refineError: string | undefined;

type Unit = Turn & { e?: Float32Array };

/**
 * Affinage (mesuré sur 2 conversations synthétiques FR à 3 voix : 80–87 % → 96–98 % des trames, 21/21 tours) :
 * la segmentation pyannote coupe parfois un tour en deux (fenêtres de 10 s) ou rate un changement de voix
 * après une courte pause. On rend les tours disjoints, on les recoupe aux pauses internes ≥ 0,3 s, puis chaque
 * morceau ≥ 0,6 s est ré-attribué au centroïde (empreinte TitaNet moyenne pondérée) le plus proche. ~0,7 s / 2 min.
 */
function refine(sherpa: any, job: Job, samples: Float32Array, turns: Turn[]): Unit[] {
  const sorted = turns.slice().sort((a, b) => a.start - b.start);
  const units: Unit[] = [];
  for (const t of sorted) {
    const u = { ...t };
    const last = units[units.length - 1];
    if (last && u.start < last.end) {
      if (u.end <= last.end) continue;
      const mid = (u.start + last.end) / 2;
      last.end = mid;
      u.start = mid;
    }
    units.push(u);
  }
  // énergie par trame de 20 ms → coupes aux silences internes (seuil relatif au morceau)
  const F = 320;
  const rms = new Float32Array(Math.floor(samples.length / F));
  for (let i = 0; i < rms.length; i++) {
    let a = 0;
    for (let j = i * F; j < (i + 1) * F; j++) a += samples[j] * samples[j];
    rms[i] = Math.sqrt(a / F);
  }
  const pieces: Unit[] = [];
  for (const u of units) {
    const a = Math.floor(u.start * 50);
    const b = Math.min(rms.length, Math.ceil(u.end * 50));
    const v = Array.from(rms.subarray(a, b)).sort((x, y) => x - y);
    const thr = Math.max(0.003, 0.1 * (v[Math.floor(v.length * 0.7)] ?? 0));
    let s0 = u.start;
    let sil = 0;
    for (let i = a; i < b; i++) {
      if (rms[i] < thr) sil++;
      else {
        if (sil >= 15) {
          const c = (i - sil / 2) / 50;
          if (c - s0 >= 1 && u.end - c >= 1) {
            pieces.push({ ...u, start: s0, end: c });
            s0 = c;
          }
        }
        sil = 0;
      }
    }
    pieces.push({ ...u, start: s0, end: u.end });
  }
  const ex = new sherpa.SpeakerEmbeddingExtractor({ model: job.embedding, numThreads: job.threads });
  const embed = (a: number, b: number): Float32Array => {
    const st = ex.createStream();
    st.acceptWaveform({ sampleRate: RATE, samples: samples.slice(Math.floor(a * RATE), Math.floor(b * RATE)) });
    st.inputFinished();
    // false : pas de tampon externe (interdit par le bac à sable V8 d'Electron)
    const e = Float32Array.from(ex.compute(st, false) as Float32Array);
    let n = 0;
    for (const x of e) n += x * x;
    n = Math.sqrt(n) || 1;
    return e.map((x) => x / n);
  };
  for (const p of pieces) if (p.end - p.start >= 0.6) p.e = embed(p.start, p.end);
  for (let it = 0; it < 3; it++) {
    const C = new Map<string, Float32Array>();
    for (const p of pieces) {
      if (!p.e || p.end - p.start < 1.5) continue;
      const d = p.end - p.start;
      let c = C.get(p.speaker);
      if (!c) C.set(p.speaker, (c = new Float32Array(p.e.length)));
      for (let i = 0; i < c.length; i++) c[i] += p.e[i] * d;
    }
    if (C.size < 2) break;
    for (const [k, c] of C) {
      let n = 0;
      for (const x of c) n += x * x;
      n = Math.sqrt(n) || 1;
      C.set(k, c.map((x) => x / n));
    }
    let changed = 0;
    for (const p of pieces) {
      if (!p.e) continue;
      let best = p.speaker;
      let bs = -2;
      for (const [k, c] of C) {
        let s = 0;
        for (let i = 0; i < c.length; i++) s += p.e[i] * c[i];
        if (s > bs) {
          bs = s;
          best = k;
        }
      }
      if (best !== p.speaker) {
        p.speaker = best;
        changed++;
      }
    }
    if (!changed) break;
  }
  return pieces;
}

/** Tours consécutifs du même locuteur (pause < 1 s) fusionnés : moins de coupes inutiles côté transcription. */
function mergeAdjacent(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns.slice().sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && last.speaker === t.speaker && t.start - last.end < 1) last.end = Math.max(last.end, t.end);
    else out.push({ ...t });
  }
  return out;
}

function run(job: Job): { mode: 'two-track' | 'mix'; turns: Turn[]; audioSec: number; sysVoicedSec: number; groups: number; merged: number } {
  const exists = (f?: string) => !!f && fs.existsSync(f) && fs.statSync(f).size > 44 + RATE * 2;
  if (exists(job.mic) && exists(job.sys)) {
    const sys = frameRms(job.sys!);
    let sysSpeech = 0;
    for (let i = 0; i < sys.length; i++) if (sys[i] > 0.004) sysSpeech++;
    const sysVoicedSec = sysSpeech * 0.1;
    const audioSec = (sys.length * FRAME) / RATE;
    // Le son du Mac porte-t-il de la vraie conversation ? (une notification ne suffit pas : ≥ 8 s et ≥ 6 % de la durée)
    if (sysVoicedSec >= Math.max(job.sysMinSec ?? 8, (job.sysMinRatio ?? 0.06) * audioSec)) {
      const n = clusterCount(job.numSpeakers, 'two-track');
      if (n === 1) return { mode: 'two-track', turns: [], audioSec, sysVoicedSec, groups: 1, merged: 1 }; // une seule voix distante : rien à trier
      const d = diarize(job, loadFloat(job.sys!), n);
      return { mode: 'two-track', turns: d.turns, audioSec, sysVoicedSec, groups: d.groups, merged: d.merged };
    }
    // Pas de son système utile : présentiel (une piste) — le mélange est trié avec le nombre de personnes
    const mix = loadFloat(job.mix);
    return mixRun(job, mix, sysVoicedSec);
  }
  return mixRun(job, loadFloat(job.mix), 0);
}

function mixRun(job: Job, mix: Float32Array, sysVoicedSec: number) {
  const n = clusterCount(job.numSpeakers, 'mix');
  const audioSec = mix.length / RATE;
  if (n === 1) return { mode: 'mix' as const, turns: [] as Turn[], audioSec, sysVoicedSec, groups: 1, merged: 1 };
  const d = diarize(job, mix, n);
  return { mode: 'mix' as const, turns: d.turns, audioSec, sysVoicedSec, groups: d.groups, merged: d.merged };
}

type Port = { on(ev: 'message', cb: (e: { data: unknown }) => void): void; postMessage(m: unknown): void };
const port = (process as unknown as { parentPort?: Port }).parentPort;

function handle(job: Job): unknown {
  const t0 = Date.now();
  try {
    const r = run(job);
    return { ok: true, ...r, refineError, ms: Date.now() - t0, rssMB: Math.round(process.memoryUsage().rss / 1e6) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

if (port) {
  port.on('message', (e) => {
    port.postMessage(handle(e.data as Job));
    setTimeout(() => process.exit(0), 50);
  });
} else if (require.main === module && process.argv[2]) {
  // Ligne de commande (tests) : node diarize-worker.js job.json
  console.log(JSON.stringify(handle(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))));
}

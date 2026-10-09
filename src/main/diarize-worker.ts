// Processus utilitaire (utilityProcess.fork) : diarisation sherpa-onnx sur le WAV complet d'une note.
// Isolé du processus principal : ~300–400 Mo (onnxruntime + audio) libérés à la sortie, UI fluide.
//
// Entrée : { mix, mic?, sys?, segmentation, embedding, threads, threshold }
// Sortie : { ok: true, mode, turns: { start, end, speaker }[], audioSec, ms } | { ok: false, error }
//  - mode 'two-track' : micro + son du Mac présents et le son du Mac contient de la parole →
//    diarisation de la piste système (« S0 », « S1 »…) + tours « Moi » là où le micro domine ;
//  - mode 'mix' : diarisation du mélange (une seule piste utile).
import * as fs from 'node:fs';

interface Job {
  mix: string;
  mic?: string;
  sys?: string;
  segmentation: string;
  embedding: string;
  threads: number;
  threshold: number;
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

/** Locuteurs très minoritaires (< 2 s ou < 2 % de la parole) : rattachés au tour voisin le plus proche. */
function absorbSmall(turns: Turn[]): Turn[] {
  const total = new Map<string, number>();
  for (const t of turns) total.set(t.speaker, (total.get(t.speaker) ?? 0) + t.end - t.start);
  const all = [...total.values()].reduce((a, b) => a + b, 0);
  const small = new Set([...total].filter(([, d]) => d < Math.max(2, all * 0.02)).map(([k]) => k));
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

function diarize(job: Job, samples: Float32Array): Turn[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx-node');
  const sd = new sherpa.OfflineSpeakerDiarization({
    segmentation: { pyannote: { model: job.segmentation }, numThreads: job.threads },
    embedding: { model: job.embedding, numThreads: job.threads },
    clustering: { numClusters: -1, threshold: job.threshold },
    minDurationOn: 0.3,
    minDurationOff: 0.5,
  });
  const segs: { start: number; end: number; speaker: number }[] = sd.process(samples);
  const turns = segs.map((s) => ({ start: s.start, end: s.end, speaker: `S${s.speaker}` }));
  let refined = turns;
  try {
    refined = refine(sherpa, job, samples, turns);
  } catch (e) {
    refineError = e instanceof Error ? e.message : String(e); // affinage facultatif : tours bruts
  }
  return mergeAdjacent(absorbSmall(refined));
}

let refineError: string | undefined;

type Unit = Turn & { e?: Float32Array };

/**
 * Affinage (mesuré sur 2 conversations synthétiques FR à 3 voix : 80–87 % → 96–98 % des trames, 21/21 tours) :
 * la segmentation pyannote coupe parfois un tour en deux (fenêtres de 10 s) ou rate un changement de voix
 * après une courte pause. On rend les tours disjoints, on les recoupe aux pauses internes ≥ 0,3 s, puis chaque
 * morceau ≥ 0,6 s est ré-attribué au centroïde (empreinte TitaNet moyenne pondérée) le plus proche. ~0,7 s / 2 min.
 */
function refine(sherpa: any, job: Job, samples: Float32Array, turns: Turn[]): Turn[] {
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
  return pieces.map(({ start, end, speaker }) => ({ start, end, speaker }));
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

function run(job: Job): { mode: 'two-track' | 'mix'; turns: Turn[]; audioSec: number } {
  const exists = (f?: string) => !!f && fs.existsSync(f) && fs.statSync(f).size > 44 + RATE * 2;
  if (exists(job.mic) && exists(job.sys)) {
    const mic = frameRms(job.mic!);
    const sys = frameRms(job.sys!);
    const n = Math.max(mic.length, sys.length);
    let sysSpeech = 0;
    for (let i = 0; i < sys.length; i++) if (sys[i] > 0.01) sysSpeech++;
    if (sysSpeech * 0.1 >= 3) {
      // Parole « à moi » : le micro est nettement au-dessus du son du Mac (l'écho des haut-parleurs reste en dessous).
      const meOn: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const m = mic[i] ?? 0;
        const s = sys[i] ?? 0;
        meOn.push(m > 0.015 && m > 2 * s);
      }
      const me = runs(meOn, 5, 4).map((r) => ({ ...r, speaker: 'Moi' }));
      const others = diarize(job, loadFloat(job.sys!));
      const turns = [...me, ...others].sort((a, b) => a.start - b.start);
      return { mode: 'two-track', turns, audioSec: (n * FRAME) / RATE };
    }
  }
  const mix = loadFloat(job.mix);
  return { mode: 'mix', turns: diarize(job, mix), audioSec: mix.length / RATE };
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

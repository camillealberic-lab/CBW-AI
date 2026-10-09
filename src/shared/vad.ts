// VAD énergétique (RMS) + découpage en segments pour la transcription au fil de l'eau.
// Utilisé par la fenêtre de capture (src/renderer/recorder.ts) et par le bench de latence.
// Aucun import : compatible navigateur, Node et `node --experimental-strip-types`.

export const RATE = 16000;
const FRAME = 320; // 20 ms

export interface SegmenterOpts {
  /** Durée de parole minimale d'un segment avant de pouvoir le couper (ms). */
  minSpeechMs?: number;
  /** Pause qui finalise un segment (ms). */
  pauseMs?: number;
  /** Longueur max d'un segment : au-delà, coupe forcée au point le plus calme (ms). */
  maxSegMs?: number;
}

/** Durée max d'un envoi à whisper-server (contexte audio fixe de 640 ≈ 12,8 s, marge ×2). */
export const MAX_CHUNK_MS = 7000;

/**
 * Reçoit le PCM 16 kHz au fil de l'eau. À chaque pause ≥ pauseMs suivant de la parole nouvelle,
 * appelle onPause(start, end, commit) (indices d'échantillons) :
 *  - commit = true si la parole depuis la dernière coupe dure ≥ minSpeechMs : la coupe avance
 *    (au milieu de la pause) et le segment [start, end] est définitif ;
 *  - commit = false sinon : transcription spéculative de [start, end] (la coupe ne bouge pas).
 */
export class Segmenter {
  private pcm: Float32Array = new Float32Array(RATE * 30);
  /** Indice absolu du 1er échantillon encore en mémoire (> 0 après compact()). Tous les indices restent absolus. */
  private base = 0;
  length = 0;
  private framePos = 0;
  private noise = 0.003; // plancher de bruit estimé (RMS)
  private segStart = 0;
  private speechMs = 0;
  private newSpeech = false; // parole depuis le dernier onPause
  private silenceMs = 0;
  private silenceStart = -1;
  /** Fin (échantillon) de la dernière trame de parole. */
  lastSpeechEnd = 0;
  /** Durée totale de parole détectée (ms) depuis le début de l'enregistrement. */
  voicedMs = 0;
  private readonly minSpeechMs: number;
  private readonly pauseMs: number;
  private readonly maxSeg: number;
  private readonly onPause: (start: number, end: number, commit: boolean) => void;

  constructor(onPause: (start: number, end: number, commit: boolean) => void, o: SegmenterOpts = {}) {
    this.onPause = onPause;
    this.minSpeechMs = o.minSpeechMs ?? 1500;
    this.pauseMs = o.pauseMs ?? 300;
    this.maxSeg = Math.round(((o.maxSegMs ?? 6000) / 1000) * RATE);
  }

  get cut(): number {
    return this.segStart;
  }

  push(chunk: Float32Array): void {
    const used = this.length - this.base;
    if (used + chunk.length > this.pcm.length) {
      const n = new Float32Array(Math.max(this.pcm.length * 2, used + chunk.length));
      n.set(this.pcm.subarray(0, used));
      this.pcm = n;
    }
    this.pcm.set(chunk, used);
    this.length += chunk.length;
    while (this.framePos + FRAME <= this.length) {
      this.frame(this.framePos);
      this.framePos += FRAME;
    }
  }

  audio(start = this.base, end = this.length): Float32Array {
    return this.pcm.subarray(Math.max(0, start - this.base), end - this.base);
  }

  /**
   * Sessions longues (prise de notes) : oublie l'audio déjà transcrit, avant `before`
   * (borné à la coupe courante et à la trame en cours d'analyse). Mémoire ~constante.
   */
  compact(before: number = this.segStart): void {
    const cut = Math.min(before, this.segStart, this.framePos);
    if (cut <= this.base) return;
    const keep = this.pcm.subarray(cut - this.base, this.length - this.base);
    const n = new Float32Array(Math.max(RATE * 30, keep.length * 2));
    n.set(keep);
    this.pcm = n;
    this.base = cut;
  }

  /** Segment trop long sans pause : coupe forcée à la trame la plus calme de la dernière 1,5 s. */
  private forceCut(end: number): void {
    const from = Math.max(this.segStart + FRAME, end - Math.round(1.5 * RATE), this.base);
    let best = end;
    let bestR = Infinity;
    for (let i = from; i + FRAME <= end; i += FRAME) {
      const r = rms(this.pcm, i - this.base, i + FRAME - this.base);
      if (r < bestR) {
        bestR = r;
        best = i + FRAME / 2;
      }
    }
    this.onPause(this.segStart, best, true);
    this.segStart = best;
    this.speechMs = 0;
    this.newSpeech = true;
  }

  private frame(at: number): void {
    if (at + FRAME - this.segStart >= this.maxSeg) this.forceCut(at + FRAME);
    const r = rms(this.pcm, at - this.base, at + FRAME - this.base);
    const speech = isSpeech(r, this.noise);
    if (!speech) this.noise = this.noise * 0.95 + r * 0.05; // suit le bruit ambiant pendant les silences
    if (speech) {
      this.speechMs += 20;
      this.voicedMs += 20;
      this.newSpeech = true;
      this.lastSpeechEnd = at + FRAME;
      this.silenceMs = 0;
      this.silenceStart = -1;
      return;
    }
    if (this.silenceStart < 0) this.silenceStart = at;
    this.silenceMs += 20;
    if (this.newSpeech && this.speechMs >= 200 && this.silenceMs >= this.pauseMs) {
      this.newSpeech = false;
      const end = this.silenceStart + Math.floor((at + FRAME - this.silenceStart) / 2);
      const commit = this.speechMs >= this.minSpeechMs;
      this.onPause(this.segStart, end, commit);
      if (commit) {
        this.segStart = end;
        this.speechMs = 0;
      }
    }
  }
}

export function rms(pcm: Float32Array, a: number, b: number): number {
  let s = 0;
  for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

const isSpeech = (r: number, noise: number): boolean => r > Math.max(0.01, noise * 3);

/** Retire le silence de début et de fin (garde `padMs` de marge). Renvoie un sous-tableau (vide si que du silence). */
export function trimSilence(pcm: Float32Array, padMs = 150): Float32Array {
  const n = Math.floor(pcm.length / FRAME);
  if (!n) return pcm.subarray(0, 0);
  // plancher : 10e percentile des RMS de trames
  const rs: number[] = [];
  for (let i = 0; i < n; i++) rs.push(rms(pcm, i * FRAME, (i + 1) * FRAME));
  const noise = [...rs].sort((x, y) => x - y)[Math.floor(n * 0.1)] ?? 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++)
    if (isSpeech(rs[i], noise)) {
      if (first < 0) first = i;
      last = i;
    }
  if (first < 0) return pcm.subarray(0, 0);
  const pad = Math.floor((padMs / 1000) * RATE);
  return pcm.subarray(Math.max(0, first * FRAME - pad), Math.min(pcm.length, (last + 1) * FRAME + pad));
}

export function encodeWav(pcm: Float32Array, rate = RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  let o = 44;
  for (let i = 0; i < pcm.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** WAV PCM16 mono → Float32 (pour le bench). */
export function decodeWav(buf: Uint8Array): Float32Array {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 12;
  while (o < buf.length - 8) {
    const id = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    const size = v.getUint32(o + 4, true);
    if (id === 'data') {
      const n = size / 2;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = v.getInt16(o + 8 + i * 2, true) / 0x8000;
      return out;
    }
    o += 8 + size + (size & 1);
  }
  return new Float32Array(0);
}

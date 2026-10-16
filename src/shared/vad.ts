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
  /** Marge ajoutée avant et après chaque segment qui finit sur une vraie pause (ms). Défaut 0 (dictée). */
  marginMs?: number;
  /** Plancher absolu de l'énergie de parole (RMS). Défaut 0,01 (dictée, micro proche). */
  minRms?: number;
  /** La parole est « bruit estimé × noiseFactor ». Défaut 3. */
  noiseFactor?: number;
  /** Fenêtre de recherche de la trame la plus calme pour une coupe forcée (ms). Défaut 1500. */
  forceWindowMs?: number;
  /** Parole minimale pour fermer un segment (ms). Défaut 200. */
  minVoicedMs?: number;
}

/** Durée max d'un envoi à whisper-server de la dictée (contexte audio fixe de 640 ≈ 12,8 s, marge ×2). */
export const MAX_CHUNK_MS = 7000;
/** Durée max d'un morceau de réunion (serveur « réunion » à contexte audio complet : 30 s). */
export const MEETING_MAX_CHUNK_MS = 25000;

/**
 * Réglages « réunion » (façon Granola, 05-granola.md) : marge de 256 ms, fin de morceau après 800 ms de
 * silence, 25 s au maximum (coupe forcée au creux le plus calme des 3 dernières secondes, jamais à 6 s),
 * seuil abaissé (−52 dBFS) pour les voix lointaines. Aucun morceau n'est rogné ni jeté.
 */
export const MEETING_VAD: SegmenterOpts = {
  minSpeechMs: 0,
  pauseMs: 800,
  maxSegMs: MEETING_MAX_CHUNK_MS,
  marginMs: 256,
  minRms: 0.0025,
  noiseFactor: 2.5,
  forceWindowMs: 3000,
  minVoicedMs: 200,
};

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
  /** Première / dernière trame de parole du segment en cours (indices absolus ; -1 = aucune). */
  private segFirst = -1;
  /** La dernière coupe était forcée (au milieu de la parole) : pas de marge avant le segment suivant. */
  private cutForced = false;
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
  private readonly margin: number;
  private readonly minRms: number;
  private readonly noiseFactor: number;
  private readonly forceWin: number;
  private readonly minVoicedMs: number;
  private readonly onPause: (start: number, end: number, commit: boolean, speech: SpeechBounds) => void;

  /**
   * onPause(start, end, commit, speech) : start/end incluent la marge ; speech = première / dernière trame
   * de parole du segment (pour l'attribution des voix : seule la parole compte, pas les marges).
   */
  constructor(onPause: (start: number, end: number, commit: boolean, speech: SpeechBounds) => void, o: SegmenterOpts = {}) {
    this.onPause = onPause;
    this.minSpeechMs = o.minSpeechMs ?? 1500;
    this.pauseMs = o.pauseMs ?? 300;
    this.maxSeg = Math.round(((o.maxSegMs ?? 6000) / 1000) * RATE);
    this.margin = Math.round(((o.marginMs ?? 0) / 1000) * RATE);
    this.minRms = o.minRms ?? 0.01;
    this.noiseFactor = o.noiseFactor ?? 3;
    this.forceWin = Math.round(((o.forceWindowMs ?? 1500) / 1000) * RATE);
    this.minVoicedMs = o.minVoicedMs ?? 200;
    if (this.minRms < 0.01) this.noise = 0.001; // réunion : démarre bas, suit le bruit de la salle
  }

  /** Parole détectée depuis la dernière coupe (fin non encore transcrite à rattraper à l'arrêt). */
  get hasPendingSpeech(): boolean {
    return this.segFirst >= 0 && this.speechMs >= this.minVoicedMs;
  }
  /** Bornes de la parole en attente (indices absolus), ou null. */
  get pendingBounds(): SpeechBounds | null {
    return this.hasPendingSpeech ? { from: this.segFirst, to: this.lastSpeechEnd } : null;
  }

  get cut(): number {
    return this.segStart;
  }
  /** Début du reste non transcrit, marge comprise (réunion). */
  get tailFrom(): number {
    return Math.max(this.base, this.segStart - (this.cutForced ? 0 : this.margin));
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
    const cut = Math.min(before, this.segStart - this.margin, this.framePos);
    if (cut <= this.base) return;
    const keep = this.pcm.subarray(cut - this.base, this.length - this.base);
    const n = new Float32Array(Math.max(RATE * 30, keep.length * 2));
    n.set(keep);
    this.pcm = n;
    this.base = cut;
  }

  /** Segment trop long sans pause : coupe forcée à la trame la plus calme de la fenêtre finale. */
  private forceCut(end: number): void {
    const from = Math.max(this.segStart + FRAME, end - this.forceWin, this.base);
    let best = end;
    let bestR = Infinity;
    for (let i = from; i + FRAME <= end; i += FRAME) {
      const r = rms(this.pcm, i - this.base, i + FRAME - this.base);
      if (r < bestR) {
        bestR = r;
        best = i + FRAME / 2;
      }
    }
    // Coupe au milieu de la parole : pas de marge de ce côté (elle dupliquerait un bout de mot).
    const first = this.segFirst >= 0 ? this.segFirst : this.segStart;
    this.onPause(Math.max(this.base, this.segStart - (this.cutForced ? 0 : this.margin)), best, true, { from: first, to: Math.min(best, Math.max(this.lastSpeechEnd, first)) });
    this.segStart = best;
    this.cutForced = true;
    this.segFirst = -1;
    this.speechMs = 0;
    this.newSpeech = true;
  }

  private frame(at: number): void {
    if (at + FRAME - this.segStart >= this.maxSeg) {
      if (this.segFirst < 0 && this.minRms < 0.01) {
        // réunion : 25 s de silence pur, rien à transcrire → on avance sans émettre de segment vide
        this.segStart = at + FRAME;
        this.cutForced = false;
      } else this.forceCut(at + FRAME);
    }
    const r = rms(this.pcm, at - this.base, at + FRAME - this.base);
    const speech = isSpeech(r, this.noise, this.minRms, this.noiseFactor);
    if (!speech) this.noise = this.noise * 0.95 + r * 0.05; // suit le bruit ambiant pendant les silences
    if (speech) {
      if (this.segFirst < 0) this.segFirst = at;
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
    if (this.newSpeech && this.speechMs >= this.minVoicedMs && this.silenceMs >= this.pauseMs) {
      this.newSpeech = false;
      const end = this.silenceStart + Math.floor((at + FRAME - this.silenceStart) / 2);
      const commit = this.speechMs >= this.minSpeechMs;
      const m = this.margin;
      // marge de part et d'autre (bornée à l'audio écouté et encore en mémoire)
      this.onPause(Math.max(this.base, this.segStart - (this.cutForced ? 0 : m)), Math.min(this.length, end + m), commit, { from: this.segFirst >= 0 ? this.segFirst : this.segStart, to: this.lastSpeechEnd });
      if (commit) {
        this.segStart = end;
        this.cutForced = false;
        this.segFirst = -1;
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

const isSpeech = (r: number, noise: number, minRms = 0.01, factor = 3): boolean => r > Math.max(minRms, noise * factor);

/** Bornes (échantillons absolus) de la parole d'un segment : sans les marges. */
export interface SpeechBounds {
  from: number;
  to: number;
}

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

// ── Réunion : découpage hors ligne et rattrapage des passages non transcrits ─────────────────────

export interface Chunk {
  /** Indices d'échantillons (16 kHz), marges comprises. */
  start: number;
  end: number;
  /** Parole seule (sans les marges). */
  from: number;
  to: number;
}

/** Découpe un signal complet comme le fait la capture en direct (mêmes réglages) : sert au rattrapage à l'arrêt. */
export function segmentOffline(pcm: Float32Array, opts: SegmenterOpts = MEETING_VAD, step = RATE): Chunk[] {
  const out: Chunk[] = [];
  const seg = new Segmenter((start, end, _c, sp) => out.push({ start, end, from: sp.from, to: sp.to }), opts);
  for (let i = 0; i < pcm.length; i += step) {
    seg.push(pcm.subarray(i, Math.min(pcm.length, i + step)));
    seg.compact();
  }
  const tail = seg.pendingBounds;
  if (tail) out.push({ start: seg.tailFrom, end: seg.length, from: tail.from, to: tail.to });
  return out;
}

export interface Span {
  from: number;
  to: number;
}

/**
 * Morceaux de parole (Chunk) que les passages déjà transcrits (`covered`, mêmes unités) couvrent à moins de
 * `minRatio` : à retranscrire depuis le WAV de session (rattrapage de 04-muesli.md, R7).
 */
export function uncovered(chunks: Chunk[], covered: Span[], minRatio = 0.5): Chunk[] {
  const sorted = covered.slice().sort((a, b) => a.from - b.from);
  return chunks.filter((c) => {
    const len = Math.max(1, c.to - c.from);
    let ov = 0;
    for (const s of sorted) {
      if (s.from >= c.to) break;
      ov += Math.max(0, Math.min(c.to, s.to) - Math.max(c.from, s.from));
    }
    return ov / len < minRatio;
  });
}

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
 * Réglages de séparation des voix FluidAudio (recalibrés le 15 oct. sur 3 / 2 / 1 voix, dictaphone.md ; puis le 16 oct.
 * sur une vraie réunion de 21 min à 3 personnes, chantiers/notes-v2/ynov/mesures.md) :
 * VBx « sur-découpe » (Fa 0,4 au lieu de 0,07 : sur 50 s le défaut fondait 3 voix en 2), puis
 *  - les groupes « principaux » dont les empreintes moyennes sont proches sont refondus : cosinus ≥ 0,62 si l'un des
 *    deux a moins de 30 s de parole (empreinte bruitée ; voix de synthèse : même voix 0,69–0,85, différentes ≤ 0,57),
 *    ≥ 0,78 si les deux en ont 30 s ou plus (vraie salle : même personne 0,80–0,93, personnes différentes jusqu'à 0,76 —
 *    à 0,62 les 3 personnes étaient fondues en une seule, 96 % du temps) ;
 *  - les bribes (moins de 15 s, ou de 3 % de la parole totale si c'est moins — jamais moins de 1,5 s) ne font pas une
 *    personne : rattachées à la voix principale la plus ressemblante (sinon au tour voisin).
 */
export const FLUID_DIARIZE_ARGS = ['--fa', '0.4', '--embeddings'];
export const FLUID_MERGE_SIM = 0.62;
/** Seuil de fusion entre deux groupes qui ont chacun au moins FLUID_SOLID_SEC de parole. */
export const FLUID_MERGE_SIM_SOLID = 0.78;
export const FLUID_SOLID_SEC = 30;
export const FLUID_MIN_SPEAKER_SEC = 1.5;
/** Bribe : moins de FLUID_BRIBE_SEC s de parole ET moins de FLUID_BRIBE_SHARE de la parole totale (plancher FLUID_MIN_SPEAKER_SEC). */
export const FLUID_BRIBE_SEC = 15;
export const FLUID_BRIBE_SHARE = 0.03;

const normalize = (v: Float64Array): Float64Array => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
};
const dot = (a: Float64Array, b: Float64Array): number => a.reduce((s, x, i) => s + x * b[i], 0);

/**
 * Fusion agglomérative (centroïdes pondérés par la durée), comme speakers.mergeCentroids (pur, sans import) : à chaque
 * tour, la paire la plus proche parmi celles qui passent leur seuil — `minSim`, ou `solidSim` si les deux groupes ont
 * chacun au moins `solidSec` s de parole. Renvoie id → id fusionné et les centroïdes finaux.
 */
function mergeByCentroid(
  items: { id: string; e: number[]; weight: number }[],
  o: { minSim: number; solidSim?: number; solidSec?: number },
): { map: Map<string, string>; groups: { id: string; e: Float64Array; w: number }[] } {
  const g = items.map((c) => ({ ids: [c.id], e: normalize(Float64Array.from(c.e)), w: Math.max(c.weight, 1e-6) }));
  const need = (a: { w: number }, b: { w: number }) => (o.solidSim != null && Math.min(a.w, b.w) >= (o.solidSec ?? Infinity) ? o.solidSim : o.minSim);
  while (g.length > 1) {
    let bi = -1;
    let bj = -1;
    let bs = -2;
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const v = dot(g[i].e, g[j].e);
        if (v >= need(g[i], g[j]) && v > bs) [bs, bi, bj] = [v, i, j];
      }
    if (bi < 0) break;
    const A = g[bi];
    const B = g[bj];
    const e = normalize(A.e.map((x, i) => (x * A.w + B.e[i] * B.w) / (A.w + B.w)));
    g.splice(bj, 1);
    g[bi] = { ids: [...A.ids, ...B.ids], e, w: A.w + B.w };
  }
  const map = new Map<string, string>();
  for (const x of g) for (const id of x.ids) map.set(id, x.ids[0]);
  return { map, groups: g.map((x) => ({ id: x.ids[0], e: x.e, w: x.w })) };
}

export interface RefineOptions {
  minSim?: number;
  solidSim?: number;
  solidSec?: number;
  /** Plancher des bribes (s). */
  minSec?: number;
  bribeSec?: number;
  bribeShare?: number;
}

/** Fusion des groupes sur-découpés + rattachement des bribes. Pur. */
export function refineDiarization(d: EngineDiarization, o: RefineOptions = {}): EngineDiarization {
  const dur = new Map<string, number>();
  for (const t of d.turns) dur.set(t.speaker, (dur.get(t.speaker) ?? 0) + t.end - t.start);
  const total = [...dur.values()].reduce((a, b) => a + b, 0);
  const minSec = o.minSec ?? FLUID_MIN_SPEAKER_SEC;
  const bribeSec = Math.max(minSec, Math.min(o.bribeSec ?? FLUID_BRIBE_SEC, (o.bribeShare ?? FLUID_BRIBE_SHARE) * total));
  const emb = d.embeddings ?? {};
  const isBribe = (k: string) => (dur.get(k) ?? 0) < bribeSec;
  const mainIds = [...dur.keys()].filter((k) => !isBribe(k));
  let turns = d.turns;
  // 1. groupes principaux : fusion des empreintes proches
  const items = mainIds.filter((k) => emb[k]).map((k) => ({ id: k, e: emb[k], weight: dur.get(k)! }));
  let centroids: { id: string; e: Float64Array; w: number }[] = [];
  if (items.length) {
    const r = mergeByCentroid(items, { minSim: o.minSim ?? FLUID_MERGE_SIM, solidSim: o.solidSim ?? FLUID_MERGE_SIM_SOLID, solidSec: o.solidSec ?? FLUID_SOLID_SEC });
    centroids = r.groups;
    turns = turns.map((t) => ({ ...t, speaker: r.map.get(t.speaker) ?? t.speaker }));
  }
  // 2. bribes (s'il reste au moins une voix principale) : voix principale la plus ressemblante, sinon tour voisin
  if (mainIds.length && mainIds.length < dur.size) {
    const toMain = new Map<string, string>();
    for (const k of dur.keys()) {
      if (!isBribe(k) || !emb[k] || !centroids.length) continue;
      const e = normalize(Float64Array.from(emb[k]));
      let best = centroids[0];
      for (const c of centroids) if (dot(e, c.e) > dot(e, best.e)) best = c;
      toMain.set(k, best.id);
    }
    const mains = new Set(turns.filter((t) => !isBribe(t.speaker) || !dur.has(t.speaker)).map((t) => t.speaker));
    const big = turns.filter((t) => mains.has(t.speaker));
    turns = turns.map((t) => {
      if (mains.has(t.speaker)) return t;
      const m = toMain.get(t.speaker);
      if (m) return { ...t, speaker: m };
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

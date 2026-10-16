// Alignement « qui a dit quoi » : segments Whisper horodatés × tours de parole de la diarisation.
// Pur (sans Electron) : testable avec node --experimental-strip-types.

/** D'où vient l'audio : micro (« Moi » en réunion à deux pistes) ou son du Mac (les autres, triés par voix). */
export type Source = 'mic' | 'system';

export interface NoteSegment {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
  /** Piste d'origine (absente des notes enregistrées avant Notes v2.1). */
  source?: Source;
  /** Parole seule (sans les marges de découpage) : base de l'attribution par recouvrement. */
  speechStartMs?: number;
  speechEndMs?: number;
}
export interface SpeakerTurn {
  start: number; // s
  end: number; // s
  speaker: string; // 'Moi' | 'S0' | 'S1'…
}
/** Segment transcrit, pas encore attribué à une voix. */
export interface RawSegment {
  startMs: number;
  endMs: number;
  text: string;
  source?: Source;
  speechStartMs?: number;
  speechEndMs?: number;
  /** Mots horodatés (ms absolus sur la session) quand le moteur Parakeet les fournit : attribution mot par mot. Jamais écrits dans <id>.json. */
  words?: { w: string; s: number; e: number }[];
}

/** Un tour de la transcription envoyée à l'organisation ne dépasse pas cette durée (repères mm:ss utiles). */
const MAX_TURN_MS = 120000;

/** Voix qui recouvre le plus [a, b] (s), sinon le tour le plus proche (≤ 2 s) ; '' si aucun. */
function pickSpeaker(a: number, b: number, turns: SpeakerTurn[]): string {
  const ov = new Map<string, number>();
  let near = '';
  let nearGap = 2;
  for (const t of turns) {
    const o = Math.min(b, t.end) - Math.max(a, t.start);
    if (o > 0) ov.set(t.speaker, (ov.get(t.speaker) ?? 0) + o);
    else {
      const gap = Math.max(t.start - b, a - t.end);
      if (gap < nearGap) {
        nearGap = gap;
        near = t.speaker;
      }
    }
  }
  let best = '';
  let bestO = 0;
  for (const [k, o] of ov)
    if (o > bestO) {
      bestO = o;
      best = k;
    }
  return best || near;
}

/** Voix distinctes qui parlent au moins `minS` secondes dans [a, b] (s). */
function voicesIn(a: number, b: number, turns: SpeakerTurn[], minS = 0.8): string[] {
  const ov = new Map<string, number>();
  for (const t of turns) {
    const o = Math.min(b, t.end) - Math.max(a, t.start);
    if (o > 0) ov.set(t.speaker, (ov.get(t.speaker) ?? 0) + o);
  }
  return [...ov].filter(([, o]) => o >= minS).map(([k]) => k);
}

/** Phrases d'un texte (ponctuation forte), sinon propositions (virgules) si le texte est long d'un seul tenant. */
export function splitSentences(text: string): string[] {
  const t = text.trim();
  let parts = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (parts.length === 1 && t.length > 90) parts = t.split(/(?<=[,;:])\s+/).filter(Boolean);
  return parts.length ? parts : [t];
}

/**
 * Mot par mot (moteur Parakeet, horodatage de chaque mot) : chaque mot va à la voix qui le recouvre le plus, les mots
 * consécutifs d'une même voix forment une pièce ; une pièce d'un seul mot (< 2 mots) est rattachée à sa voisine
 * (bruit de frontière). Le texte est seulement coupé, jamais perdu.
 */
export function piecesFromWords(words: { w: string; s: number; e: number }[], turns: SpeakerTurn[]): { startMs: number; endMs: number; text: string; raw: string }[] {
  type Run = { raw: string; ws: { w: string; s: number; e: number }[] };
  let runs: Run[] = [];
  let prev = '';
  for (const w of words) {
    const raw = pickSpeaker(w.s / 1000, Math.max(w.e, w.s + 1) / 1000, turns) || prev;
    if (raw) prev = raw;
    const last = runs[runs.length - 1];
    if (last && last.raw === raw) last.ws.push(w);
    else runs.push({ raw, ws: [w] });
  }
  // rattachement des pièces d'un seul mot à la voisine (la précédente, sinon la suivante)
  for (let i = 0; i < runs.length && runs.length > 1; ) {
    if (runs[i].ws.length < 2) {
      const into = i > 0 ? i - 1 : 1;
      if (into < i) runs[into].ws.push(...runs[i].ws);
      else runs[into].ws.unshift(...runs[i].ws);
      runs.splice(i, 1);
      // fusion des voisines devenues identiques
      runs = runs.reduce<Run[]>((acc, r) => {
        const l = acc[acc.length - 1];
        if (l && l.raw === r.raw) l.ws.push(...r.ws);
        else acc.push(r);
        return acc;
      }, []);
      i = Math.max(0, i - 1);
    } else i++;
  }
  return runs.map((r) => ({ startMs: Math.round(r.ws[0].s), endMs: Math.round(Math.max(r.ws[r.ws.length - 1].e, r.ws[0].s + 1)), text: r.ws.map((x) => x.w).join(' '), raw: r.raw }));
}

/**
 * Phrase par phrase (Muesli, 04-muesli.md §3.4) : un segment dont la parole recouvre deux voix est découpé en
 * phrases, durées réparties au prorata des caractères ; chaque phrase va à la voix qui la recouvre le plus.
 * AUCUNE re-transcription : le texte de Whisper est seulement coupé, jamais perdu.
 */
export function attributePieces(seg: RawSegment, turns: SpeakerTurn[]): { startMs: number; endMs: number; text: string; raw: string }[] {
  const from = seg.speechStartMs ?? seg.startMs;
  const to = Math.max(from + 1, seg.speechEndMs ?? seg.endMs);
  const voices = voicesIn(from / 1000, to / 1000, turns);
  if (voices.length > 1 && seg.words && seg.words.length > 1) return piecesFromWords(seg.words, turns);
  const sentences = voices.length > 1 ? splitSentences(seg.text) : [seg.text];
  const total = sentences.reduce((n, x) => n + x.length, 0) || 1;
  let at = from;
  return sentences.map((text) => {
    const len = ((to - from) * text.length) / total;
    const startMs = Math.round(at);
    at += len;
    const endMs = Math.round(at);
    return { startMs, endMs, text, raw: pickSpeaker(startMs / 1000, endMs / 1000, turns) };
  });
}

/**
 * Attribution des voix sans re-transcription.
 *  - mode « two-track » : la piste micro est « Moi » (jamais triée) ; seule la piste système reçoit une voix
 *    de `turns` (diarisation de la piste système) ;
 *  - mode « mix » (une piste, présentiel) : toutes les phrases reçoivent une voix de `turns`.
 * Sans recouvrement : tour le plus proche (≤ 2 s), sinon voix précédente. Les identifiants de clusters
 * deviennent « Personne 1…n » par ordre d'apparition ; « Moi » est conservé.
 * `only` : nombre de personnes imposé à 1 en une piste → tout est « Moi ».
 * `micTurns` (deux pistes) : voix trouvées SUR LE MICRO. Plusieurs voix (présentiel + appel) → la piste micro est triée
 * elle aussi (« Personne n », jamais « Moi ») ; une seule voix → « Moi ».
 */
export function labelSegments(segs: RawSegment[], turns: SpeakerTurn[], mode: 'two-track' | 'mix' = 'mix', only = false, micTurns?: SpeakerTurn[]): NoteSegment[] {
  const rows: { s: RawSegment; startMs: number; endMs: number; text: string; raw: string }[] = [];
  let prev = '';
  let prevMic = '';
  const micSplit = !!micTurns && new Set(micTurns.map((t) => t.speaker)).size > 1;
  for (const s of segs.slice().sort((x, y) => x.startMs - y.startMs)) {
    if (!s.text.trim()) continue;
    if (mode === 'two-track' && s.source === 'mic' && micSplit && !only) {
      for (const p of attributePieces(s, micTurns!)) {
        const raw = p.raw ? `mic:${p.raw}` : prevMic;
        if (raw) prevMic = raw;
        rows.push({ s, startMs: p.startMs, endMs: p.endMs, text: p.text, raw: raw || 'mic:?' });
      }
      continue;
    }
    if (only || (mode === 'two-track' && s.source === 'mic')) {
      rows.push({ s, startMs: s.startMs, endMs: s.endMs, text: s.text, raw: 'Moi' });
      continue;
    }
    for (const p of attributePieces(s, turns)) {
      const raw = p.raw || prev;
      if (raw) prev = raw;
      rows.push({ s, startMs: p.startMs, endMs: p.endMs, text: p.text, raw });
    }
  }
  const first = rows.find((r) => r.raw && r.raw !== 'Moi')?.raw ?? 'S0';
  const names = new Map<string, string>();
  let n = 0;
  return rows.map((r) => {
    const id = r.raw || first;
    if (!names.has(id)) names.set(id, id === 'Moi' ? 'Moi' : `Personne ${++n}`);
    const out: NoteSegment = { startMs: r.startMs, endMs: r.endMs, text: r.text, speaker: names.get(id)! };
    if (r.s.source) out.source = r.s.source;
    if (r.s.speechStartMs != null) out.speechStartMs = Math.max(r.s.speechStartMs, r.startMs);
    if (r.s.speechEndMs != null) out.speechEndMs = Math.min(r.s.speechEndMs, r.endMs);
    return out;
  });
}

/**
 * Transcription du fichier entier (mots horodatés, ms) → segments : coupe sur une pause ≥ `gapMs`, ou à `maxMs`.
 * Les mots restent attachés au segment (attribution mot par mot ensuite).
 */
export function segmentsFromWords(words: { w: string; s: number; e: number }[], source: Source, maxMs = 25000, gapMs = 800): RawSegment[] {
  const out: RawSegment[] = [];
  let cur: { w: string; s: number; e: number }[] = [];
  const flush = () => {
    if (!cur.length) return;
    const a = cur[0].s;
    const b = Math.max(cur[cur.length - 1].e, a + 1);
    out.push({ startMs: a, endMs: b, text: cur.map((x) => x.w).join(' ').trim(), source, speechStartMs: a, speechEndMs: b, words: cur });
    cur = [];
  };
  for (const w of words) {
    const last = cur[cur.length - 1];
    if (last && (w.s - last.e >= gapMs || w.e - cur[0].s > maxMs)) flush();
    cur.push(w);
  }
  flush();
  return out.filter((x) => x.text);
}

/** Compat : attribution simple d'une liste de segments (une piste). */
export function assignSpeakers(segs: { startMs: number; endMs: number; text: string }[], turns: SpeakerTurn[]): NoteSegment[] {
  return labelSegments(segs, turns, 'mix');
}

const words = (t: string): string[] => t.toLowerCase().replace(/[^\p{L}\p{N}\s']+/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * Écho : la voix des autres, captée par le micro, ressort deux fois (piste système + piste micro). Un segment
 * micro qui recouvre à ≥ 60 % un segment système dont il reprend ≥ 80 % des mots est un écho → retiré.
 * Prudent par construction (« préserver d'abord », 04-muesli.md) : un segment micro qui n'est pas quasi
 * identique au texte système est toujours gardé.
 */
export function dedupeEcho<T extends RawSegment>(segs: T[]): T[] {
  const sys = segs.filter((s) => s.source === 'system');
  if (!sys.length) return segs;
  return segs.filter((m) => {
    if (m.source !== 'mic') return true;
    const mw = words(m.text);
    if (mw.length < 3) return true;
    const a = m.speechStartMs ?? m.startMs;
    const b = m.speechEndMs ?? m.endMs;
    for (const x of sys) {
      const xa = x.speechStartMs ?? x.startMs;
      const xb = x.speechEndMs ?? x.endMs;
      const ov = Math.min(b, xb) - Math.max(a, xa);
      if (ov < 0.6 * Math.max(1, b - a)) continue;
      const xs = new Set(words(x.text));
      const hit = mw.filter((w) => xs.has(w)).length;
      if (hit / mw.length >= 0.8) return false;
    }
    return true;
  });
}

// ── Fusion des groupes de voix trop proches (même personne éclatée en plusieurs groupes) ─────────────────

export interface Centroid {
  id: string;
  /** Empreinte moyenne (pondérée par la durée de parole), normalisée ou non. */
  e: ArrayLike<number>;
  /** Durée de parole (s) du groupe. */
  weight: number;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na * nb) || 1);
}

/**
 * Fusion agglomérative (liaison moyenne pondérée) des groupes dont les centroïdes ont une similarité cosinus
 * ≥ `minSim` ; si `target` est fourni, continue de fusionner les plus proches tant qu'il reste plus de `target`
 * groupes (nombre de participants connu) ; `maxGroups` plafonne le total. Renvoie id → id fusionné.
 */
export function mergeCentroids(items: Centroid[], o: { minSim: number; target?: number; maxGroups?: number }): Map<string, string> {
  const groups = items.map((c) => ({ ids: [c.id], e: Float64Array.from(c.e), w: Math.max(c.weight, 1e-6) }));
  // normalise : une empreinte = une direction
  for (const g of groups) {
    const n = Math.sqrt(g.e.reduce((a, x) => a + x * x, 0)) || 1;
    for (let i = 0; i < g.e.length; i++) g.e[i] /= n;
  }
  const limit = Math.max(o.target ?? 0, 1);
  for (;;) {
    if (groups.length <= 1) break;
    let bi = -1;
    let bj = -1;
    let bs = -2;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const sim = cosine(groups[i].e, groups[j].e);
        if (sim > bs) {
          bs = sim;
          bi = i;
          bj = j;
        }
      }
    const tooMany = (o.target != null && groups.length > limit) || (o.maxGroups != null && groups.length > o.maxGroups);
    const close = o.target == null && bs >= o.minSim;
    // nombre imposé : on fusionne jusqu'à `target`, et on ne descend pas en dessous
    if (!tooMany && !close) break;
    const A = groups[bi];
    const B = groups[bj];
    const w = A.w + B.w;
    const e = new Float64Array(A.e.length);
    for (let i = 0; i < e.length; i++) e[i] = (A.e[i] * A.w + B.e[i] * B.w) / w;
    const n = Math.sqrt(e.reduce((a, x) => a + x * x, 0)) || 1;
    for (let i = 0; i < e.length; i++) e[i] /= n;
    groups.splice(bj, 1);
    groups[bi] = { ids: [...A.ids, ...B.ids], e, w };
  }
  const map = new Map<string, string>();
  for (const g of groups) for (const id of g.ids) map.set(id, g.ids[0]);
  return map;
}

/**
 * Locuteurs (autres que « Moi ») : avec un nombre imposé, `numClusters` du regroupement = participants moins
 * « Moi » en deux pistes, tous les participants en une piste.
 */
export function clusterCount(numSpeakers: number | undefined, mode: 'two-track' | 'mix'): number {
  const n = Math.round(Number(numSpeakers));
  if (!Number.isFinite(n) || n < 1) return -1;
  return mode === 'two-track' ? Math.max(1, n - 1) : n;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** mm:ss (les minutes continuent au-delà de 59 : « 75:12 »). */
export const mmss = (ms: number): string => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;

/** Tours fusionnés : segments consécutifs du même locuteur (≤ MAX_TURN_MS par ligne). */
export function mergeTurns(segs: NoteSegment[]): NoteSegment[] {
  const out: NoteSegment[] = [];
  for (const s of segs) {
    if (!s.text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === s.speaker && s.endMs - last.startMs <= MAX_TURN_MS) {
      last.endMs = s.endMs;
      last.text = `${last.text} ${s.text}`.replace(/\s+/g, ' ').trim();
    } else out.push({ ...s, text: s.text.trim() });
  }
  return out;
}

/** Format fixe transmis à organizeNotes : une ligne par tour, « [mm:ss] Personne 2 : texte… ». */
export function speakerTranscript(segs: NoteSegment[]): string {
  return mergeTurns(segs)
    .map((t) => `[${mmss(t.startMs)}] ${t.speaker} : ${t.text}`)
    .join('\n');
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Remplace un nom de locuteur entier (« Personne 1 » ne touche pas « Personne 12 »). */
export function replaceSpeaker(text: string, from: string, to: string): string {
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(from)}(?![\\p{L}\\p{N}])`, 'gu'), () => to);
}

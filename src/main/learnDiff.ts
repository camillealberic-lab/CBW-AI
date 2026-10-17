// Diff mot à mot entre le texte collé par CBW AI et la valeur actuelle du champ (piste 4 : apprentissage des
// corrections). Fonctions pures, sans import Electron ; testées par learnDiff.test.ts. Aucun texte journalisé.

export interface Replacement {
  before: string;
  after: string;
}

const strip = (w: string): string => w.replace(/^[\s"'«»“”‘’()[\]{}<>,;:!?…]+|[\s"'«»“”‘’()[\]{},;:!?…]+$/g, '').replace(/[.]+$/, '');
const norm = (w: string): string => strip(w).toLowerCase();

export function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((t) => strip(t));
}

const MAX_TOKENS = 600;
const MIN_MATCH_RATIO = 0.6;
const MAX_HUNK = 3;

/** Index (dans `val`) du début de la zone qui correspond au texte collé, ou -1. Ancre : 3 mots consécutifs. */
function locate(ins: string[], val: string[]): number {
  const ni = ins.map(norm);
  const nv = val.map(norm);
  for (let k = 0; k + 3 <= ni.length; k++) {
    for (let j = 0; j + 3 <= nv.length; j++) {
      if (nv[j] === ni[k] && nv[j + 1] === ni[k + 1] && nv[j + 2] === ni[k + 2]) return Math.max(0, j - k - 4);
    }
  }
  return -1;
}

/**
 * Remplacements « mot(s) collé(s) → mot(s) tapé(s) » (≤ 3 mots de chaque côté) entre `inserted` et `fieldValue`.
 * Vide si le texte collé est introuvable dans le champ ou trop modifié (< 60 % des mots conservés).
 */
export function findReplacements(inserted: string, fieldValue: string): Replacement[] {
  const ins = tokenize(inserted);
  const valAll = tokenize(fieldValue);
  if (ins.length < 3 || ins.length > MAX_TOKENS || !valAll.length) return [];
  const start = locate(ins, valAll);
  if (start < 0) return [];
  const val = valAll.slice(start, start + ins.length + Math.ceil(ins.length / 2) + 12);
  const a = ins.map(norm);
  const b = val.map(norm);
  const n = a.length;
  const m = b.length;
  // LCS
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  if (dp[0][0] / n < MIN_MATCH_RATIO) return [];
  const out: Replacement[] = [];
  let i = 0;
  let j = 0;
  let del: string[] = [];
  let add: string[] = [];
  const flush = (): void => {
    if (del.length && add.length && del.length <= MAX_HUNK && add.length <= MAX_HUNK) {
      const before = del.map(strip).join(' ');
      const after = add.map(strip).join(' ');
      if (before && after && norm(before) !== norm(after)) out.push({ before, after });
    }
    del = [];
    add = [];
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) del.push(ins[i++]);
    else add.push(val[j++]);
  }
  // reste du texte collé non retrouvé : mots supprimés, pas un remplacement
  flush();
  return out;
}

// ─── Apprentissage continu (chantiers/apprentissage/api.md) ─────────────────────────────────────────────────────
// Comparaison complète « texte rendu (collé) → texte final gardé dans le champ » : suppressions, ajouts, remplacements,
// reformulations, retours à la ligne, ponctuation, et réinsertions de ce que l'IA avait retiré du brut Whisper.

export type EditKind =
  | 'delete' // mot(s) supprimé(s) dans la phrase
  | 'delete-end' // mot(s) supprimé(s) en fin de phrase (« voilà. »)
  | 'insert' // mot(s) ajouté(s)
  | 'reinsert' // mot(s) ajouté(s) qui étaient dans le brut Whisper et que l'IA avait retirés
  | 'replace' // ≤ 3 mots → ≤ 3 mots
  | 'rephrase' // passage plus long réécrit
  | 'newline' // retour à la ligne ajouté avant un mot
  | 'newline-removed' // retour à la ligne retiré
  | 'punct'; // ponctuation finale d'un mot changée

export interface Edit {
  kind: EditKind;
  /** Motif agrégeable : « delete-end:voilà », « replace:cloud=>Claude », « newline:cordialement », « punct:!=>. »… */
  key: string;
  before: string;
  after: string;
  /** Extrait court « avant → après » (≤ 2 × 70 car.), pour le rapport. */
  ctx: string;
}

export interface Analysis {
  /** Texte final gardé (zone du champ correspondant au texte collé). */
  final: string;
  edits: Edit[];
}

interface Tok {
  t: string;
  start: number;
  end: number;
  /** Retour à la ligne entre ce mot et le précédent. */
  brk: boolean;
}

function toks(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let prevEnd = 0;
  while ((m = re.exec(s))) {
    if (!strip(m[0])) {
      // ponctuation isolée (« ? » après une espace fine) : rattachée au mot précédent
      const last = out[out.length - 1];
      if (last) (last.t += m[0]), (last.end = m.index + m[0].length), (prevEnd = last.end);
      continue;
    }
    out.push({ t: m[0], start: m.index, end: m.index + m[0].length, brk: out.length > 0 && s.slice(prevEnd, m.index).includes('\n') });
    prevEnd = m.index + m[0].length;
  }
  return out;
}

/** Forme normalisée d'une expression : mots sans ponctuation, minuscules, séparés par une espace. */
export const normPhrase = (s: string): string => tokenize(s).map(norm).filter(Boolean).join(' ');
const SENT_END = /[.!?…]["»”’)\]]*$/;
const trailPunct = (w: string): string => (w.match(/[.,;:!?…]+["»”’)\]]*$/)?.[0] ?? '').replace(/["»”’)\]]/g, '');
const clip = (s: string, n = 70): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const join = (a: Tok[]): string => a.map((x) => x.t).join(' ');

/** Nombre d'occurrences de `phrase` (mots entiers, insensible à la casse) dans `text`, en ignorant la ponctuation. */
export function countPhrase(text: string, phrase: string): number {
  const p = normPhrase(phrase);
  if (!p) return 0;
  const t = ` ${normPhrase(text)} `;
  let n = 0;
  for (let i = t.indexOf(` ${p} `); i >= 0; i = t.indexOf(` ${p} `, i + 1)) n++;
  return n;
}

/** Occurrences de `phrase` placées en fin de phrase (suivies de . ! ? … ou de la fin du texte / d'une ligne). */
export function countAtSentenceEnd(text: string, phrase: string): number {
  const p = normPhrase(phrase).split(' ');
  if (!p[0]) return 0;
  const tk = toks(text);
  let n = 0;
  for (let i = 0; i + p.length <= tk.length; i++) {
    if (!p.every((w, k) => norm(tk[i + k].t) === w)) continue;
    const last = tk[i + p.length - 1];
    const next = tk[i + p.length];
    const gap = text.slice(last.end, next ? next.start : text.length);
    if (SENT_END.test(last.t) || !next || /^[\s]*[.!?…]/.test(gap) || gap.includes('\n')) n++;
  }
  return n;
}

/** Occurrences de `word` (premier mot) collées à la suite du texte précédent, sans retour à la ligne avant. */
export function countInline(text: string, word: string): number {
  const w = normPhrase(word);
  if (!w) return 0;
  return toks(text).filter((x, i) => i > 0 && !x.brk && norm(x.t) === w).length;
}

/**
 * Compare le texte rendu (collé par CBW AI) à la valeur actuelle du champ et classe chaque retouche.
 * `raw` (brut Whisper) sert à reconnaître les réinsertions. null si le texte collé est introuvable ou trop modifié.
 */
export function analyzeCorrection(rendered: string, fieldValue: string, raw = ''): Analysis | null {
  const A = toks(rendered);
  const all = toks(fieldValue);
  if (A.length < 3 || A.length > MAX_TOKENS || !all.length) return null;
  const start = locate(A.map((x) => x.t), all.map((x) => x.t));
  if (start < 0) return null;
  const V = all.slice(start, start + A.length + Math.ceil(A.length / 2) + 12);
  const a = A.map((x) => norm(x.t));
  const b = V.map((x) => norm(x.t));
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  if (dp[0][0] / n < MIN_MATCH_RATIO) return null;

  // Alignement : paires appariées et blocs (hunks) de différences entre elles.
  type Hunk = { i0: number; i1: number; j0: number; j1: number };
  const pairs: [number, number][] = [];
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let h: Hunk | null = null;
  const close = (): void => {
    if (h) hunks.push(h);
    h = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      close();
      pairs.push([i++, j++]);
    } else {
      h ??= { i0: i, i1: i, j0: j, j1: j };
      if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) h.i1 = ++i;
      else h.j1 = ++j;
    }
  }
  close();
  if (!pairs.length) return null;
  const firstJ = pairs[0][1];
  const lastJ = pairs[pairs.length - 1][1];
  let regionStart = firstJ;
  let regionEnd = lastJ;
  const raws = raw ? ` ${normPhrase(raw)} ` : '';
  const edits: Edit[] = [];
  const near = new Set<number>(); // index (dans A) voisins d'un hunk : leur ponctuation suit la retouche, pas un motif
  const ctxOf = (hk: Hunk): string => {
    const bA = join(A.slice(Math.max(0, hk.i0 - 3), Math.min(n, hk.i1 + 2)));
    const bV = join(V.slice(Math.max(firstJ, hk.j0 - 3), Math.min(lastJ + 1, Math.max(hk.j1, hk.j0) + 2)));
    return `${clip(bA)} → ${clip(bV)}`;
  };

  for (const hk of hunks) {
    const leading = hk.j0 <= firstJ && hk.i0 === 0 && pairs[0][0] >= hk.i1;
    const trailing = hk.i1 === n && hk.j0 > lastJ;
    let dels = A.slice(hk.i0, hk.i1);
    let adds = V.slice(hk.j0, hk.j1);
    if (leading) {
      // ce qui précède dans le champ est du texte déjà là : seul un remplacement court du 1er mot compte
      adds = dels.length && adds.length ? adds.slice(-Math.min(adds.length, MAX_HUNK)) : [];
      if (adds.length && adds.length > dels.length + 1) adds = [];
      if (adds.length) regionStart = Math.min(regionStart, hk.j1 - adds.length);
    } else if (trailing) {
      // ce qui suit est la suite tapée : remplacement seulement à longueur égale, sinon simple suppression
      if (!(adds.length === dels.length && adds.length <= MAX_HUNK)) adds = [];
      if (adds.length) regionEnd = Math.max(regionEnd, hk.j0 + adds.length - 1);
    }
    near.add(hk.i0 - 1).add(hk.i1);
    if (!dels.length && !adds.length) continue;
    if (trailing && !adds.length && start + V.length >= all.length && fieldValue.length >= 19_000) continue; // champ tronqué par la relecture
    const before = dels.map((x) => strip(x.t)).join(' ');
    const after = adds.map((x) => strip(x.t)).join(' ');
    const ctx = ctxOf(hk);
    if (dels.length && !adds.length) {
      const atEnd = SENT_END.test(dels[dels.length - 1].t) || hk.i1 === n;
      if (dels.length > 6) edits.push({ kind: 'delete', key: 'delete:*', before: clip(before), after: '', ctx });
      else edits.push({ kind: atEnd ? 'delete-end' : 'delete', key: `${atEnd ? 'delete-end' : 'delete'}:${normPhrase(before)}`, before, after: '', ctx });
    } else if (adds.length && !dels.length) {
      const p = normPhrase(after);
      const re = raws && p && raws.includes(` ${p} `) && countPhrase(raw, p) > countPhrase(rendered, p);
      if (re) edits.push({ kind: 'reinsert', key: `reinsert:${p}`, before: '', after, ctx });
      else edits.push({ kind: 'insert', key: adds.length > 6 ? 'insert:*' : `insert:${p}`, before: '', after: clip(after), ctx });
    } else if (dels.length <= MAX_HUNK && adds.length <= MAX_HUNK) {
      if (norm(before) !== norm(after)) edits.push({ kind: 'replace', key: `replace:${normPhrase(before)}=>${after}`, before, after, ctx });
    } else {
      edits.push({ kind: 'rephrase', key: 'rephrase', before: clip(before), after: clip(after), ctx });
    }
  }

  for (const [pi, pj] of pairs) {
    const x = A[pi];
    const y = V[pj];
    if (pj > regionStart && y.brk && !x.brk) {
      const w = strip(y.t);
      const prev = pi > 0 ? A[pi - 1].t : '';
      edits.push({ kind: 'newline', key: `newline:${norm(y.t)}`, before: '', after: w, ctx: `${clip(prev, 30)} ↵ ${clip(w, 30)}` });
    } else if (pi > 0 && pj > regionStart && x.brk && !y.brk) {
      edits.push({ kind: 'newline-removed', key: 'newline-removed', before: strip(x.t), after: '', ctx: clip(`${A[pi - 1].t} ${x.t}`) });
    }
    if (near.has(pi)) continue;
    const p1 = trailPunct(x.t);
    const p2 = trailPunct(y.t);
    if (p1 !== p2) edits.push({ kind: 'punct', key: `punct:${p1 || '∅'}=>${p2 || '∅'}`, before: x.t, after: y.t, ctx: clip(`${x.t} → ${y.t}`) });
  }

  const final = fieldValue.slice(V[regionStart].start, V[regionEnd].end);
  return { final, edits };
}

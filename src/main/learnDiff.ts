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

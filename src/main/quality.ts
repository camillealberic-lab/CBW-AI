// Mesure de qualité en usage réel : fonctions pures (sans Electron), testées par quality.test.ts.
// Vie privée : n'entrent et ne sortent que des nombres ; aucun texte n'est conservé ici.

export type QualityPath = 'llm' | 'saut' | 'repli';
export const QUALITY_PATHS: QualityPath[] = ['llm', 'saut', 'repli'];

/** Découpe en mots (séparés par des espaces), comparés tels quels (casse et ponctuation comptent). */
const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
const MAX_WORDS = 1500;

/** Distance d'édition au niveau du mot (insertion, suppression, remplacement = 1 chacun). */
export function wordDistance(a: string, b: string): number {
  const x = words(a).slice(0, MAX_WORDS);
  const y = words(b).slice(0, MAX_WORDS);
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** Distance normalisée dans [0, 1] (0 = identique) ; 0 si les deux textes sont vides. */
export function editRatio(a: string, b: string): number {
  const n = Math.max(words(a).length, words(b).length);
  if (!n) return 0;
  return Math.min(1, wordDistance(a, b) / Math.min(n, MAX_WORDS));
}

/** Chemin pris par une dictée : saut du LLM, repli déterministe (rejet ou échec), ou LLM. Null si inconnu (snippet, etc.). */
export function pathOf(provider: string, model: string): QualityPath | null {
  if (provider === 'passthrough') {
    if (model === 'skip-short') return 'saut';
    if (model === 'fallbackClean' || model === 'fallbackClean-rejet') return 'repli';
    return null; // vide, commande, annulation : pas un chemin de nettoyage
  }
  if (!provider || provider === 'snippet') return null;
  return 'llm';
}

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Compteurs par jour et par chemin : seulement des sommes. */
export interface QualityCounts {
  n: number; // dictées collées
  observed: number; // dont texte final relu dans le champ
  editSum: number; // somme des editRatio observés
  wordsCorrected: number;
  reverted: number;
}
export const emptyCounts = (): QualityCounts => ({ n: 0, observed: 0, editSum: 0, wordsCorrected: 0, reverted: 0 });
export type QualityBucket = Partial<Record<QualityPath, QualityCounts>>;

export function bump(b: QualityBucket, p: QualityPath, patch: Partial<QualityCounts>): void {
  const c = (b[p] ??= emptyCounts());
  for (const k of Object.keys(patch) as (keyof QualityCounts)[]) c[k] += patch[k] ?? 0;
}

export interface QualitySummary {
  n: number;
  observed: number;
  /** Moyenne des editRatio observés, null sans observation. */
  editRatio: number | null;
  /** Part de dictées revenues au brut sur les dictées collées, null sans dictée. */
  revertedRate: number | null;
}
export function summarize(c: QualityCounts | undefined): QualitySummary {
  if (!c || !c.n) return { n: 0, observed: 0, editRatio: null, revertedRate: null };
  return {
    n: c.n,
    observed: c.observed,
    editRatio: c.observed ? round3(c.editSum / c.observed) : null,
    revertedRate: round3(c.reverted / c.n),
  };
}
/** Fusionne plusieurs jours en un seul résumé par chemin. */
export function mergeBuckets(buckets: (QualityBucket | undefined)[]): Record<QualityPath, QualitySummary> {
  const out = {} as Record<QualityPath, QualitySummary>;
  for (const p of QUALITY_PATHS) {
    const t = emptyCounts();
    for (const b of buckets) {
      const c = b?.[p];
      if (c) for (const k of Object.keys(t) as (keyof QualityCounts)[]) t[k] += c[k];
    }
    out[p] = summarize(t);
  }
  return out;
}

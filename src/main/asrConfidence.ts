// Confiance de la transcription (W1) : agrégation pure des mesures de whisper-server (verbose_json).
// Aucun texte ici : seulement des nombres.

/** Confiance agrégée d'une prise (ou d'un morceau). Tout est facultatif côté consommateur : absent → comportement inchangé. */
export interface AsrConfidence {
  /** Moyenne des avg_logprob des segments, pondérée par le nombre de tokens (0 = certain ; −1 = douteux). */
  avgLogProb: number;
  /** Plus mauvais avg_logprob d'un segment. */
  minSegLogProb: number;
  /** Plus forte probabilité « pas de parole » d'un segment (0..1). */
  maxNoSpeech: number;
  /** Plus faible probabilité d'un mot (hors ponctuation), si le serveur détaille les mots. */
  minWordProb?: number;
  /** Nombre de tokens pris en compte (poids). */
  tokens: number;
}

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Agrège la réponse verbose_json de whisper-server. undefined si l'information est absente ou inexploitable. */
export function confidenceFromVerbose(body: unknown): AsrConfidence | undefined {
  const segs = (body as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segs) || !segs.length) return undefined;
  let w = 0;
  let sum = 0;
  let minSeg = Infinity;
  let noSpeech = 0;
  let minWord = Infinity;
  for (const s of segs as Array<Record<string, unknown>>) {
    const lp = num(s?.avg_logprob);
    if (lp === undefined) continue;
    const n = Array.isArray(s.tokens) ? Math.max(1, s.tokens.length) : 1;
    w += n;
    sum += n * lp;
    minSeg = Math.min(minSeg, lp);
    noSpeech = Math.max(noSpeech, num(s.no_speech_prob) ?? 0);
    if (Array.isArray(s.words)) {
      for (const x of s.words as Array<Record<string, unknown>>) {
        const p = num(x?.probability);
        if (p !== undefined && typeof x.word === 'string' && /[\p{L}\p{N}]/u.test(x.word)) minWord = Math.min(minWord, p);
      }
    }
  }
  if (!w) return undefined;
  return {
    avgLogProb: sum / w,
    minSegLogProb: minSeg,
    maxNoSpeech: noSpeech,
    ...(minWord !== Infinity ? { minWordProb: minWord } : {}),
    tokens: w,
  };
}

/** Fusionne la confiance de plusieurs morceaux d'une même prise. Un morceau sans mesure rend le tout inconnu (undefined). */
export function mergeConfidence(parts: Array<AsrConfidence | undefined>): AsrConfidence | undefined {
  if (!parts.length || parts.some((p) => !p)) return undefined;
  const ps = parts as AsrConfidence[];
  const w = ps.reduce((a, p) => a + p.tokens, 0);
  if (!w) return undefined;
  const words = ps.map((p) => p.minWordProb);
  return {
    avgLogProb: ps.reduce((a, p) => a + p.avgLogProb * p.tokens, 0) / w,
    minSegLogProb: Math.min(...ps.map((p) => p.minSegLogProb)),
    maxNoSpeech: Math.max(...ps.map((p) => p.maxNoSpeech)),
    // un seul morceau sans détail des mots → on ne prétend pas connaître le minimum
    ...(words.every((x) => x !== undefined) ? { minWordProb: Math.min(...(words as number[])) } : {}),
    tokens: w,
  };
}

/** Pour la ligne de journal : nombres arrondis seulement. */
export function roundConfidence(c: AsrConfidence | undefined): { avgLogProb: number; minSegLogProb: number; maxNoSpeech: number; minWordProb?: number } | undefined {
  if (!c) return undefined;
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { avgLogProb: r(c.avgLogProb), minSegLogProb: r(c.minSegLogProb), maxNoSpeech: r(c.maxNoSpeech), ...(c.minWordProb !== undefined ? { minWordProb: r(c.minWordProb) } : {}) };
}

// Contrôles purs sur le texte renvoyé par Whisper (testables sans Electron : node --experimental-strip-types).

/** Hallucinations classiques de Whisper sur du silence : retirées seulement si TOUT le texte correspond. */
const HALLUCINATIONS = [
  /sous-titr(es|age).*(amara|communaut|radio-canada)/i,
  /^merci d'avoir regard[ée]( cette vidéo| la vidéo)?[\s.!]*$/i,
  /^\[?(musique|silence|applaudissements|rires)\]?\.?$/i,
  /^\([^()]*\)$/,
  /^thank you\.?$/i,
];

export function cleanWhisperOutput(s: string): string {
  const text = s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (HALLUCINATIONS.some((r) => r.test(text))) return '';
  return text;
}

/** Mot sans ponctuation ni casse (« Oui, », « oui. » → « oui »). */
const norm = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');

/** Répétitions consécutives qu'un humain ne produit pas : « oui oui oui » reste normal, cinq « oui » non. */
const minRepeats = (n: number): number => (n === 1 ? 5 : n === 2 ? 4 : 3);

/** Plus longue série d'un même n-gramme, à partir de i : renvoie le nombre de répétitions consécutives. */
function runAt(w: string[], i: number, n: number): number {
  let reps = 1;
  for (let j = i + n; j + n <= w.length; j += n) {
    let same = true;
    for (let k = 0; k < n; k++)
      if (w[j + k] !== w[i + k]) {
        same = false;
        break;
      }
    if (!same) break;
    reps++;
  }
  return reps;
}

/** Positions {start, n, reps} des séries répétées anormales. */
function findRuns(words: string[]): { start: number; n: number; reps: number }[] {
  const w = words.map(norm);
  const out: { start: number; n: number; reps: number }[] = [];
  for (let i = 0; i < w.length; ) {
    let hit: { start: number; n: number; reps: number } | null = null;
    for (let n = 1; n <= 8 && i + n <= w.length; n++) {
      if (!w[i] && n === 1) break;
      const reps = runAt(w, i, n);
      if (reps >= minRepeats(n) && (!hit || reps * n > hit.reps * hit.n)) hit = { start: i, n, reps };
    }
    if (hit) {
      out.push(hit);
      i += hit.n * hit.reps;
    } else i++;
  }
  return out;
}

/**
 * Sortie dégénérée (boucle de répétition / débit impossible) ?
 * Débit : au plus ~40 caractères par seconde (parole très rapide ≈ 7 mots/s) + 30 de marge pour les morceaux
 * courts (l'ancien seuil de 30 car./s classait de la parole rapide en boucle → repli whisper-cli lent).
 * Répétition : 5 mots identiques d'affilée, 4 groupes de 2 mots, 3 groupes de 3 à 8 mots — « oui oui oui »,
 * « très très bien » et les redites naturelles ne déclenchent rien. Texte long très pauvre en mots distincts.
 */
export function looksLooping(text: string, sec: number): boolean {
  if (text.length > 30 + Math.max(1, sec) * 40) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (findRuns(words).length) return true;
  if (words.length >= 30) {
    const uniq = new Set(words.map(norm).filter(Boolean)).size;
    if (uniq / words.length < 0.2) return true;
  }
  return false;
}

/** Garde une seule occurrence de chaque série répétée anormale (récupère le début utile d'une boucle). */
export function collapseLoops(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const runs = findRuns(words);
  if (!runs.length) return text.trim();
  const out: string[] = [];
  let i = 0;
  for (const r of runs) {
    out.push(...words.slice(i, r.start + r.n)); // une occurrence conservée
    i = r.start + r.n * r.reps;
  }
  out.push(...words.slice(i));
  return out.join(' ');
}

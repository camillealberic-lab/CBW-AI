// Dicta AI — apprentissage de termes depuis les corrections de l'utilisateur.
// Règle locale, sans LLM : accepte (avant → après) seulement si « après » ressemble à un nom
// propre / terme rare et reste proche de « avant » (orthographe ou prononciation).
// Compatible `node --experimental-strip-types`.

// Mots courants : jamais appris comme « terme » (évite d'ajouter « Bonjour », « Merci »…).
const COMMON = new Set(`le la les un une des de du d l et ou mais donc or ni car que qui quoi dont où ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se lui y en ne pas plus non oui si ok
a ai as avons avez ont est es suis sommes êtes sont être avoir fait faire dit dire va vais vas vont aller peut peux veux voir sais savoir
bonjour bonsoir salut merci bonne bon bien très trop tout tous toute toutes pour par avec sans sous sur dans chez vers entre comme aussi alors ensuite après avant puis encore déjà jamais toujours demain hier aujourd hui maintenant
lundi mardi mercredi jeudi vendredi samedi dimanche janvier février mars avril mai juin juillet août septembre octobre novembre décembre
the and for with this that from`.split(/\s+/));

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Clé phonétique française grossière (suffisante pour « cloud » ≈ « claude », « super base » ≈ « supabase »). */
export function phoneticKey(s: string): string {
  let t = strip(s).replace(/[^a-z0-9]/g, '');
  t = t
    .replace(/ph/g, 'f').replace(/qu|ck|k/g, 'k').replace(/c(?=[aou])/g, 'k').replace(/c/g, 's')
    .replace(/ch|sh/g, 'j').replace(/g(?=[ei])/g, 'j').replace(/w/g, 'v')
    .replace(/eau|au/g, 'o').replace(/ou/g, 'u').replace(/ai|ei|ee/g, 'e').replace(/y/g, 'i').replace(/h/g, '')
    .replace(/(.)\1+/g, '$1').replace(/[stxd]+$/g, '').replace(/e$/g, '');
  return t;
}

const looksRare = (w: string) => /^\p{Lu}/u.test(w) || /\d/.test(w) || /[.@_]/.test(w) || /\p{Ll}\p{Lu}/u.test(w);

/**
 * Vrai si la correction (before → after) est un terme à mémoriser dans le dictionnaire.
 * Longueur 2–40, « after » capitalisé/rare (nom, CamelCase, fichier.ts, @handle),
 * absent du lexique courant, et proche de « before » (édition ≤ 50 % ou phonétique ≤ 1/3).
 */
export function validateLearnedTerm(before: string, after: string): boolean {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  const b = before.trim(), a = after.trim();
  if (a.length < 2 || a.length > 40 || b.length < 2 || b.length > 40) return false;
  if (/[\u0000-\u001f\u007f<>]/.test(a + b) || /https?:\/\//i.test(a)) return false;
  if (a.split(/\s+/).length > 3 || b.split(/\s+/).length > 3) return false;
  if (strip(a) === strip(b)) return false; // simple changement de casse/accent : pas un terme
  if (!looksRare(a)) return false;
  if (a.split(/\s+/).every((w) => COMMON.has(strip(w)) || COMMON.has(w.toLowerCase()))) return false;
  const na = strip(a).replace(/[^a-z0-9]/g, ''), nb = strip(b).replace(/[^a-z0-9]/g, '');
  if (na.length < 2 || nb.length < 2) return false;
  const edit = lev(na, nb) / Math.max(na.length, nb.length);
  const pa = phoneticKey(a), pb = phoneticKey(b);
  const phon = pa && pb ? lev(pa, pb) / Math.max(pa.length, pb.length) : 1;
  return edit <= 0.5 || phon <= 0.34;
}

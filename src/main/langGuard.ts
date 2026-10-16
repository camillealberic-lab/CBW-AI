// Garde-fou de langue (pur, testable) : une sortie Whisper qui n'est manifestement pas dans la langue demandée
// (ex. passage traduit en anglais alors que general.language = fr) est refusée → nouvel essai sans prompt.
// Heuristique par mots-outils (fr / en) : sûre sur les phrases, muette sur les textes trop courts.

const FR = new Set(
  "le la les un une des du de et est sont que qui quoi ne pas je tu il elle on nous vous ils elles ce cette ces mon ma mes ton ta son sa ses leur avec pour dans sur par au aux mais ou donc car si plus très aussi tout tous faire fait être avoir a ai été c'est j'ai qu'il d'accord oui non alors bon ça voilà comme quand où parce y en".split(' '),
);
const EN = new Set(
  "the a an and is are was were that which who what not no i you he she it we they this these those my your his her their with for in on by to of but or so if more very also all do does did be been have has had it's i'm don't okay yes when where because there here just can will would should could about from".split(' '),
);
// mots communs aux deux listes (« a », « on », « in »…) : ignorés
const AMBIG = new Set(['a', 'on', 'in', 'si', 'pour', 'son', 'plus', 'are', 'ce', 'ou', 'no', 'je', 'est', 'do', 'des']);

/** Langue probable du texte : 'fr' | 'en' | '' (indécis / trop court) + scores. */
export function guessLang(text: string): { lang: '' | 'fr' | 'en'; fr: number; en: number } {
  const ws = text.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}']+/gu) ?? [];
  let fr = 0;
  let en = 0;
  for (const w of ws) {
    if (AMBIG.has(w)) continue;
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
  }
  // accents français : indice fort
  fr += (text.match(/[éèêàùçôîœ]/gi) ?? []).length * 0.5;
  if (fr + en < 3) return { lang: '', fr, en };
  if (en >= 3 && en > 2 * fr) return { lang: 'en', fr, en };
  if (fr >= 3 && fr > 2 * en) return { lang: 'fr', fr, en };
  return { lang: '', fr, en };
}

/** Vrai si `text` est clairement dans une autre langue que `want` (seulement fr / en sont jugés). */
export function wrongLanguage(text: string, want: string): boolean {
  if (want !== 'fr' && want !== 'en') return false;
  const g = guessLang(text).lang;
  return g !== '' && g !== want;
}

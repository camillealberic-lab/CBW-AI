// Extraction locale des noms propres / termes rares depuis du texte lu à l'écran. Fonctions pures (aucun import
// Electron) : testables avec node --experimental-strip-types. Le texte brut ne sort jamais d'ici et n'est
// jamais journalisé.

export const MAX_NAMES = 40;
export const MAX_NAME_LEN = 60;

/** Mots capitalisés courants qui ne sont pas des noms (jours, mois, interface, mots outils). */
const STOP = new Set(
  (
    'le la les un une des du de au aux ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ' +
    'je tu il elle on nous vous ils elles et ou mais donc or ni car que qui quoi dont où si comme quand ' +
    'bonjour bonsoir salut merci cordialement bien cher chère objet re fwd tr pour par avec sans sur sous dans en ' +
    'lundi mardi mercredi jeudi vendredi samedi dimanche janvier février mars avril mai juin juillet août septembre octobre novembre décembre ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ' +
    'the a an and or but if of to in on at for from with by is are was were be this that these those it its my your our their ' +
    'hello hi hey thanks thank regards best dear subject send reply forward cancel save open close edit file view window help ' +
    'new delete search settings share copy paste undo redo yes no ok non oui ' +
    'envoyer répondre transférer annuler enregistrer ouvrir fermer modifier fichier édition affichage fenêtre aide nouveau supprimer rechercher réglages partager copier coller'
  ).split(' '),
);

interface Cand {
  text: string;
  score: number;
  order: number;
}

const WORD = "[A-Za-zÀ-ÖØ-öø-ÿ]";
// mot capitalisé : « Karim », « Éloïse », « O'Brien », « Jean-Pierre »
const CAP_WORD = `[A-ZÀ-ÖØ-Þ]${WORD}*(?:['’-][A-ZÀ-ÖØ-Þa-zà-öø-ÿ]${WORD}*)*`;

const isStop = (w: string): boolean => STOP.has(w.toLowerCase());

/**
 * Noms probables dans `sources` (du plus fiable au moins fiable : titre de fenêtre, texte autour du curseur,
 * textes visibles). Retourne ≤ MAX_NAMES entrées dédoublonnées (insensible à la casse), les plus probables d'abord
 * (fréquence, longueur multi-mots, forme technique), chacune ≤ MAX_NAME_LEN.
 */
export function extractNames(sources: (string | undefined)[], opts: { max?: number } = {}): string[] {
  const max = Math.min(opts.max ?? MAX_NAMES, MAX_NAMES);
  const found = new Map<string, Cand>();
  let order = 0;
  const add = (text: string, w: number): void => {
    const t = text.replace(/\s+/g, ' ').trim().replace(/^[-'’.]+|[-'’.]+$/g, '');
    if (t.length < 2 || t.length > MAX_NAME_LEN) return;
    if (!/[A-Za-zÀ-ÿ]/.test(t)) return;
    if (/^https?:|^www\./i.test(t)) return;
    const k = t.toLowerCase();
    const cur = found.get(k);
    if (cur) cur.score += w;
    else found.set(k, { text: t, score: w, order: order++ });
  };

  sources.forEach((src, si) => {
    if (!src) return;
    const w = si === 0 ? 3 : si === 1 ? 2 : 1; // titre > champ focalisé > texte visible
    const text = src.slice(0, 8000);

    // 1. @handles
    for (const m of text.matchAll(/(?<![\w.])@([A-Za-z0-9_][A-Za-z0-9_.-]{1,38}[A-Za-z0-9_])/g)) add('@' + m[1], w + 1);

    // 2. adresses e-mail → nom (prenom.nom@x.com → « Prenom Nom »), et « Nom <adresse> »
    for (const m of text.matchAll(/([A-Za-z0-9._%+-]{2,60})@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      const parts = m[1].split(/[._-]+/).filter((p) => /^[A-Za-zÀ-ÿ]{2,}$/.test(p));
      if (parts.length >= 2 && parts.length <= 3 && !parts.some((p) => ['noreply', 'no', 'reply', 'contact', 'info', 'support', 'admin', 'hello'].includes(p.toLowerCase())))
        add(parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' '), w + 1);
    }

    // 3. identifiants techniques : router.ts, v1.6, GPT4o, supabase_client, useState
    for (const m of text.matchAll(/(?<![\w@/.])[A-Za-z][\w-]*\.[A-Za-z]{1,6}(?![\w@.-]*@)(?![\w])/g)) {
      if (!/^(e\.g|i\.e|etc|www)\./i.test(m[0])) add(m[0], w + 1);
    }
    for (const m of text.matchAll(/(?<![\w@/])[A-Za-z]+[0-9]+[A-Za-z0-9]*(?![\w@])/g)) add(m[0], w + 1);
    for (const m of text.matchAll(/(?<![\w@/])[a-z]+[A-Z][A-Za-z0-9]*|(?<![\w@/])[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+/g)) add(m[0], w + 2); // camelCase, CamelCase, iPhone
    for (const m of text.matchAll(/(?<![\w@/])[A-Za-z]+(?:_[A-Za-z0-9]+)+(?![\w@])/g)) add(m[0], w + 1);

    // 4. mots capitalisés hors début de phrase, regroupés (« Wispr Flow », « Camille Breton »)
    const re = new RegExp(`(?:^|[.!?…:;\\n\\r]\\s*|\\s)(${CAP_WORD}(?:\\s+${CAP_WORD}){0,2})`, 'g');
    for (const m of text.matchAll(re)) {
      const at = m.index! + m[0].length - m[1].length;
      // début de phrase : le 1er mot capitalisé est banal (« Bonjour »), on ne garde que la suite
      const before = text.slice(0, at).trimEnd();
      const sentenceStart = at === 0 || before === '' || /[.!?…:\n\r]$/.test(before) || /[.!?…:]\s*$/.test(text.slice(Math.max(0, at - 3), at));
      let words = m[1].split(/\s+/);
      if (sentenceStart) words = words.slice(1);
      while (words.length && isStop(words[0])) words.shift();
      while (words.length && isStop(words[words.length - 1])) words.pop();
      if (!words.length) continue;
      const phrase = words.join(' ');
      if (words.length === 1 && (phrase.length < 3 || isStop(phrase))) continue;
      // MAJUSCULES entières de plus de 4 lettres = titre ou bruit d'interface
      if (/^[A-ZÀ-Þ]{5,}$/.test(phrase)) continue;
      add(phrase, w + (words.length > 1 ? 1 : 0));
    }
  });

  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((c) => c.text);
}

/** Domaine seul (jamais le chemin) : « https://www.linear.app/x/y?z » → « linear.app ». */
export function domainOnly(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const h = new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '');
    return h && h.length <= 100 ? h : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Phrase d'amorce pour le prompt Whisper : vocabulaire de la personne d'abord, puis noms vus à l'écran,
 * dédoublonnés, bornée en caractères (~200 jetons ≈ 450 car. en français).
 */
export function whisperNamesPrompt(vocabulary: string[], names: string[], lang = 'fr', maxChars = 450): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let len = lang === 'fr' ? 9 : 8;
  for (const t of [...vocabulary, ...names]) {
    const s = String(t).trim();
    const k = s.toLowerCase();
    if (!s || seen.has(k) || s.length > MAX_NAME_LEN) continue;
    if (len + s.length + 2 > maxChars) continue;
    seen.add(k);
    out.push(s);
    len += s.length + 2;
  }
  if (!out.length) return '';
  // Liste simple, sans étiquette : Whisper recopiait « Noms : » au début de la dictée.
  return `${out.join(', ')}.`;
}

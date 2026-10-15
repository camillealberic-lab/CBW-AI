// Mise en forme déterministe (sans LLM), pure et testable :
//   - commandes dictées (« à la ligne », « virgule »…)            → applyDictationCommands (b1/b2)
//   - profil d'app (terminal, éditeur, messagerie, mail, chat IA)   → appProfile (m11/m12/m13)
//   - raccord avec le texte déjà écrit                              → joinWithBefore (m14)
//   - tiret cadratin inventé, espaces fines françaises              → stripInventedDashes, frenchTypography (m5/m6)
//   - règles de remplacement du dictionnaire                        → applyReplacements (f4)
//
// Compatible `node --experimental-strip-types`.

import type { DictationContext, ReplacementRule } from '../shared/types.ts';

// ───────────────────────────────────────────────────── commandes dictées

const NUM_WORD = '(?:z[ée]ro|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|mille|\\d+)';
const NUM_WORD_RE = new RegExp(`^${NUM_WORD}$`, 'i');
/** Mots après lesquels « point » est un nom commun (« le point », « mettre au point »). */
const POINT_PREV_STOP = new Set([
  'le', 'un', 'ce', 'au', 'du', 'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'chaque', 'ces', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'ce',
  'à', 'de', 'ça', 'premier', 'deuxième', 'dernier', 'même', 'autre', 'bon', 'seul', 'second', 'quel', 'quels', 'ce', 'aucun', 'tout', 'ce', 'ce',
  'mise', 'mettre', 'mis', 'fait', 'faire', 'faisons', 'faites', 'sur', 'au', 'ajouter', 'ce', 'aucun', 'nul', 'trois', 'deux', 'quatre', 'cinq',
]);
const POINT_NEXT_STOP = new Set(['de', 'd', 'du', 'des', 'sur', 'noir', 'faible', 'fort', 'faibles', 'forts', 'mort', 'chaud', 'central', 'critique', 'important', 'essentiel', 'clé', 'cle']);

interface Tok { text: string; lower: string }

const lw = (s: string) => s.toLowerCase().replace(/’/g, "'");

/** Commande de retour à la ligne détectée à la position i (tokens) ; renvoie [nb de tokens, '\n' | '\n\n' | '.\n']. */
function lineCommandAt(toks: Tok[], i: number): [number, string] | null {
  const w = (k: number) => toks[i + k]?.lower ?? '';
  const nextIsContent = (k: number) => /^(?:d'|de|du|des|d)$/.test(w(k)) || w(k).startsWith("d'");
  // point à la ligne
  if (w(0) === 'point' && w(1) === 'à' && w(2) === 'la' && w(3) === 'ligne') return [4, '.\n'];
  if (w(0) === 'point' && w(1) === 'et' && w(2) === 'à' && w(3) === 'la' && w(4) === 'ligne') return [5, '.\n'];
  if (w(0) === 'retour' && w(1) === 'à' && w(2) === 'la' && w(3) === 'ligne') return [4, '\n'];
  if (w(0) === 'nouvelle' && w(1) === 'ligne') return [2, '\n'];
  if (w(0) === 'ligne' && w(1) === 'suivante') return [2, '\n'];
  if (w(0) === 'va' && w(1) === 'à' && w(2) === 'la' && w(3) === 'ligne' && !nextIsContent(4)) return [4, '\n'];
  if (w(0) === 'à' && w(1) === 'la' && w(2) === 'ligne' && !nextIsContent(3)) return [3, '\n'];
  if (w(0) === 'nouveau' && w(1) === 'paragraphe') return [2, '\n\n'];
  if (w(0) === 'paragraphe' && w(1) === 'suivant') return [2, '\n\n'];
  if ((w(0) === 'saute' || w(0) === 'sauter' || w(0) === 'sautez') && w(1) === 'une' && w(2) === 'ligne') return [3, '\n\n'];
  return null;
}

/** Commande de ponctuation à la position i ; renvoie [nb de tokens, signe, kind]. */
function punctCommandAt(toks: Tok[], i: number): [number, string, 'close' | 'open' | 'quote-open' | 'quote-close' | 'paren-open' | 'paren-close'] | null {
  const w = (k: number) => toks[i + k]?.lower ?? '';
  const prev = toks[i - 1]?.lower ?? '';
  if (w(0) === 'point' && w(1) === "d'interrogation") return [2, '?', 'close'];
  if (w(0) === 'point' && w(1) === 'd' && w(2) === 'interrogation') return [3, '?', 'close'];
  if (w(0) === 'point' && w(1) === "d'exclamation") return [2, '!', 'close'];
  if (w(0) === 'point' && w(1) === 'd' && w(2) === 'exclamation') return [3, '!', 'close'];
  if (w(0) === 'points' && w(1) === 'de' && w(2) === 'suspension') return [3, '…', 'close'];
  if (w(0) === 'point' && (w(1) === 'virgule' || w(1) === '-virgule')) return [2, ';', 'close'];
  if (w(0) === 'point-virgule') return [1, ';', 'close'];
  if (w(0) === 'deux' && (w(1) === 'points' || w(1) === 'point')) return [2, ':', 'close'];
  if (w(0) === 'deux-points') return [1, ':', 'close'];
  if (w(0) === 'ouvre' && w(1) === 'les' && w(2) === 'guillemets') return [3, '«', 'quote-open'];
  if (w(0) === 'ouvrez' && w(1) === 'les' && w(2) === 'guillemets') return [3, '«', 'quote-open'];
  if (w(0) === 'ferme' && w(1) === 'les' && w(2) === 'guillemets') return [3, '»', 'quote-close'];
  if (w(0) === 'fermez' && w(1) === 'les' && w(2) === 'guillemets') return [3, '»', 'quote-close'];
  if (w(0) === 'ouvre' && w(1) === 'la' && w(2) === 'parenthèse') return [3, '(', 'paren-open'];
  if (w(0) === 'ferme' && w(1) === 'la' && w(2) === 'parenthèse') return [3, ')', 'paren-close'];
  if (w(0) === 'virgule') {
    // « un virgule cinq » : décimale, pas de la ponctuation
    if (NUM_WORD_RE.test(prev) && NUM_WORD_RE.test(w(1))) return null;
    return [1, ',', 'close'];
  }
  if (w(0) === 'point') {
    if (POINT_PREV_STOP.has(prev) || POINT_NEXT_STOP.has(w(1))) return null;
    if (!prev) return null; // « point » seul en tête : du contenu
    return [1, '.', 'close'];
  }
  return null;
}

/** Le texte contient-il au moins une commande dictée (retour à la ligne ou ponctuation) ? */
export function hasDictationCommand(text: string): boolean {
  const toks = tokenize(text);
  for (let i = 0; i < toks.length; i++) {
    if (lineCommandAt(toks, i) || punctCommandAt(toks, i)) return true;
  }
  return false;
}

/** Le texte contient-il une commande de retour à la ligne / paragraphe ? */
export function hasLineCommand(text: string): boolean {
  const toks = tokenize(text);
  for (let i = 0; i < toks.length; i++) if (lineCommandAt(toks, i)) return true;
  return false;
}

function tokenize(text: string): Tok[] {
  // Les « \n » déjà présents restent des séparateurs (jetons vides ignorés).
  return text
    .split(/[ \t]+/)
    .filter(Boolean)
    .map((t) => ({ text: t, lower: lw(t.replace(/^[,.;:!?…]+|[,.;:!?…]+$/g, '')) }));
}

/**
 * Applique de façon déterministe les commandes dictées (français) : retours à la ligne et ponctuation.
 * Ne touche pas au reste. Sert de filet quand aucun moteur IA n'a répondu (b2) et à la dictée courte (b1).
 * « il est allé à la ligne d'arrivée » reste intact ; « le point important » aussi.
 */
export function applyDictationCommands(text: string): string {
  if (!text) return text;
  const toks = tokenize(text);
  let out = '';
  let capNext = false; // une majuscule est due au prochain mot
  const push = (piece: string, glue: 'space' | 'none') => {
    if (!out || /\n$/.test(out) || /[«(]$/.test(out) || glue === 'none') out += piece;
    else out += ' ' + piece;
  };
  for (let i = 0; i < toks.length; i++) {
    const line = lineCommandAt(toks, i);
    if (line) {
      const [n, seq] = line;
      out = out.replace(/[ \t]+$/, '');
      if (seq === '.\n') out = out.replace(/[,;:]$/, '') + (/[.!?…]$/.test(out) ? '' : '.') + '\n';
      else out += seq;
      i += n - 1;
      capNext = true;
      continue;
    }
    const pc = punctCommandAt(toks, i);
    if (pc) {
      const [n, sign, kind] = pc;
      if (kind === 'close') {
        out = out.replace(/[ \t]+$/, '') + sign;
        capNext = sign === '.' || sign === '?' || sign === '!' || sign === '…';
      } else if (kind === 'quote-open' || kind === 'paren-open') {
        push(sign, 'space');
      } else {
        out = out.replace(/[ \t]+$/, '') + sign;
      }
      i += n - 1;
      continue;
    }
    let w = toks[i].text;
    if (capNext) {
      w = w.replace(/^([«("]*)(\p{L})/u, (_m, p: string, c: string) => p + c.toUpperCase());
      capNext = false;
    }
    // Un signe déjà collé au mot (« remarche. ») déclenche une majuscule au mot suivant.
    push(w, 'space');
    if (/[.!?…]$/.test(w)) capNext = true;
  }
  const trail = out.match(/\n+$/)?.[0] ?? '';
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/([,;:])(?=\p{L})/gu, '$1 ')
    .replace(/([.!?…])(?=\p{L})/gu, '$1 ')
    .replace(/,\s*\./g, '.')
    .replace(/\.{2,}(?!\.)/g, '.')
    .trim() + trail;
}

// ─────────────────────────────────────────────────────── profil d'application

export type AppProfile = 'terminal' | 'code' | 'chat-ia' | 'mail' | 'messagerie' | 'autre';

const BUNDLE_TERMINAL = /(?:^com\.apple\.terminal$|iterm|warp|kitty|ghostty|alacritty|wezterm|co\.zeit\.hyper|tabby)/;
const NAME_TERMINAL = /\b(?:terminal|iterm2?|warp|kitty|ghostty|alacritty|wezterm|hyper|tabby)\b/;
const BUNDLE_CODE = /(?:vscode|visual-?studio|com\.todesktop|apple\.dt\.xcode|jetbrains|sublimetext|dev\.zed|windsurf|codeium|panic\.nova|textmate|vscodium|android\.studio|vim|emacs)/;
const NAME_CODE = /\b(?:code|cursor|xcode|intellij(?: idea)?|pycharm|webstorm|phpstorm|goland|rider|clion|android studio|zed|sublime text|windsurf|nova|textmate|vscodium|vim|neovim|emacs)\b/;
const BUNDLE_CHAT_IA = /(?:anthropic|openai\.chat|com\.openai|perplexity|mistral|grok)/;
const NAME_CHAT_IA = /\b(?:claude|chatgpt|perplexity|le chat|grok|gemini|copilot)\b/;
const SITE_CHAT_IA = /^(?:chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|aistudio\.google\.com|perplexity\.ai|www\.perplexity\.ai|copilot\.microsoft\.com|chat\.mistral\.ai|grok\.com|poe\.com|you\.com|deepseek\.com|chat\.deepseek\.com|kimi\.com|chat\.z\.ai)$/;
const BUNDLE_MAIL = /(?:apple\.mail|microsoft\.outlook|readdle\.smartemail|superhuman|mimestream|airmail|freron|postbox|thunderbird|proton|mailspring|canary)/;
const NAME_MAIL = /\b(?:mail|outlook|spark|superhuman|mimestream|airmail|thunderbird|postbox|proton mail|hey)\b/;
const SITE_MAIL = /^(?:mail\.google\.com|outlook\.(?:live|office|office365)\.com|mail\.proton\.me|mail\.yahoo\.com|app\.hey\.com|mail\.zoho\.com|webmail\..+)$/;
const BUNDLE_MSG = /(?:tinyspeck|apple\.mobilesms|whatsapp|discord|telegram|microsoft\.teams|signal|facebook\.archon|messenger|mattermost|rocket|element|viber|lark)/;
const NAME_MSG = /\b(?:slack|messages|whatsapp|discord|telegram|teams|signal|messenger|mattermost|element|viber)\b/;
const SITE_MSG = /^(?:app\.slack\.com|[a-z0-9-]+\.slack\.com|discord\.com|web\.whatsapp\.com|teams\.microsoft\.com|web\.telegram\.org|messenger\.com|www\.messenger\.com|app\.element\.io)$/;
/** Éditeurs de code avec un chat IA intégré : le mode « prompt pour l'IA » y est actif en automatique. */
const AI_EDITOR = /(?:cursor|windsurf|com\.todesktop|codeium|zed)/;

/** Profil de l'app active, d'après app / bundleId / domaine. 'autre' si inconnu. */
export function appProfile(ctx?: Pick<DictationContext, 'app' | 'bundleId' | 'url'>): AppProfile {
  if (!ctx) return 'autre';
  const name = lw(ctx.app ?? '');
  const bundle = lw(ctx.bundleId ?? '');
  const site = lw(ctx.url ?? '');
  // Les sites (navigateur) priment : Chrome sur claude.ai = chat IA, sur mail.google.com = mail.
  if (site) {
    if (SITE_CHAT_IA.test(site)) return 'chat-ia';
    if (SITE_MAIL.test(site)) return 'mail';
    if (SITE_MSG.test(site)) return 'messagerie';
  }
  if (bundle) {
    if (BUNDLE_TERMINAL.test(bundle)) return 'terminal';
    if (BUNDLE_CHAT_IA.test(bundle)) return 'chat-ia';
    if (BUNDLE_MAIL.test(bundle)) return 'mail';
    if (BUNDLE_MSG.test(bundle)) return 'messagerie';
    if (BUNDLE_CODE.test(bundle)) return 'code';
  }
  if (name) {
    if (NAME_TERMINAL.test(name)) return 'terminal';
    if (NAME_CHAT_IA.test(name)) return 'chat-ia';
    if (NAME_MAIL.test(name)) return 'mail';
    if (NAME_MSG.test(name)) return 'messagerie';
    if (NAME_CODE.test(name)) return 'code';
  }
  return 'autre';
}

export type PromptMode = 'auto' | 'on' | 'off';

/** Le mode « prompt pour l'IA » est-il actif (réglage + app) ? */
export function isPromptMode(ctx: Pick<DictationContext, 'app' | 'bundleId' | 'url'> | undefined, mode: PromptMode = 'auto'): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  const p = appProfile(ctx);
  if (p === 'chat-ia' || p === 'terminal') return true;
  return p === 'code' && AI_EDITOR.test(lw(`${ctx?.app ?? ''} ${ctx?.bundleId ?? ''}`));
}

// ─────────────────────────────────────────── raccord avec le texte déjà écrit

/** Mots courants qui prennent une minuscule au milieu d'une phrase (pas de risque de nom propre). */
const LOWER_START = new Set(
  ('le la les un une des du de d l au aux ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ' +
    'je j tu il elle on nous vous ils elles me m te t se s lui y en ça ca ' +
    'et ou mais donc or ni car que qu qui quoi dont où si comme quand lorsque puisque parce ' +
    'à dans pour par sur sous avec sans chez vers entre contre après avant pendant depuis jusqu ' +
    'ne n pas plus jamais rien aussi encore très trop assez bien mal peu beaucoup déjà toujours puis ensuite alors enfin ' +
    'est sont était sera suis es êtes sommes ai as a avons avez ont va vais vas vont fait faut peut doit ' +
    'tout tous toute toutes même autre autres chaque quelque ' +
    'oui non bonjour merci ok').split(' '),
);

/** Fin de phrase : le texte qui suit commence une phrase (majuscule). */
const SENTENCE_END = /[.!?…]["»”')\]]*\s*$/;

/**
 * Raccorde une dictée au texte déjà écrit avant le curseur : majuscule ou minuscule initiale, espace,
 * point final retiré si la phrase continue, ponctuation en double évitée. Idempotent, jamais de contenu ajouté.
 * `before` : ≤ 300 caractères précédant le curseur (vide = début de champ).
 */
export function joinWithBefore(text: string, before?: string): string {
  if (!text || before === undefined || before === null) return text;
  const b = String(before).slice(-300);
  if (!b.trim()) return text; // champ vide ou que des espaces : rien à raccorder
  let t = text;
  if (/^\s*\n/.test(t)) return t; // la dictée commence par un retour voulu
  const atLineStart = /\n[ \t]*$/.test(b);
  const afterSentence = atLineStart || SENTENCE_END.test(b);
  // Majuscule / minuscule
  const m = t.match(/^([«("'“]*)(\p{L}[\p{L}']*)/u);
  if (m) {
    const first = m[2];
    const rest = t.slice(m[0].length);
    if (afterSentence) {
      t = m[1] + first[0].toUpperCase() + first.slice(1) + rest;
    } else {
      const word = first.replace(/'.*$/, '');
      const isAcronym = word.length > 1 && word === word.toUpperCase();
      if (!isAcronym && first !== 'I' && LOWER_START.has(word.toLowerCase()) && first[0] !== first[0].toLowerCase()) {
        t = m[1] + first[0].toLowerCase() + first.slice(1) + rest;
      }
    }
  }
  // Ponctuation de raccord
  if (!afterSentence) {
    // « mot, » + « , suite » : pas de doublon ; point final d'une seule phrase retiré (la phrase continue)
    const lastCh = b.trimEnd().slice(-1);
    if (/^[,;]/.test(t) && /[,;]$/.test(b.trimEnd())) t = t.replace(/^[,;]\s*/, '');
    if (!/[.!?…]\s*\S/.test(t.replace(/[.!?…]+$/, '')) && /(?<![.!?…])\.$/.test(t) && !/\n/.test(t) && lastCh !== ':') {
      t = t.replace(/\.$/, '');
    }
  } else if (/^[.]/.test(t) && SENTENCE_END.test(b)) {
    t = t.replace(/^\.+\s*/, '');
  }
  // Espace de raccord
  const endsWithSpace = /[ \t  ]$/.test(b) || atLineStart;
  const noSpaceBefore = /^[,.;:!?…)\]»}'’]/.test(t);
  const noSpaceAfterPrev = /[(\[«{'’\-/]$/.test(b);
  if (!endsWithSpace && !noSpaceBefore && !noSpaceAfterPrev) t = ' ' + t;
  return t;
}

// ───────────────────────────────────────────── tiret cadratin, typographie

/**
 * m5 : retire le tiret cadratin (—) ou demi-cadratin spacé (–) inventé par le modèle, sauf si la
 * dictée parlait de « tiret ». « A — B » → « A, B ».
 */
export function stripInventedDashes(out: string, raw = ''): string {
  if (!/[—–]/.test(out) || /\btirets?\b/i.test(raw)) return out;
  return out
    .replace(/[ \t]*—[ \t]*/g, ', ')
    .replace(/[ \t]+–[ \t]+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?…:;])/g, '$1')
    .replace(/^,\s*/gm, '')
    .replace(/(^|\n)([ \t]*),\s*/g, '$1$2');
}

const THIN = ' ';

/**
 * m6 : typographie française. Espace fine insécable avant ; ? ! et :, et dans les guillemets « ».
 * N'agit que sur des signes de ponctuation (jamais « 14:30 », « http:// », « :) »). Idempotent.
 */
export function frenchTypography(text: string): string {
  if (!text) return text;
  let t = text;
  // « ... »
  t = t.replace(/«[ \t  ]*/g, '«' + THIN).replace(/[ \t  ]*»/g, THIN + '»');
  // ; ? ! (y compris « ?! » et « !! »), après un mot, un chiffre ou une fermeture
  t = t.replace(/(?<=[\p{L}\p{N}\)\]»"”'’…])[ \t  ]?([;?!]+)(?=[\s)\]»"”]|$)/gu, THIN + '$1');
  // ; ? ! en tête de ligne ou après espace : rattache au mot précédent si présent
  // :  seulement si suivi d'un espace / fin / retour (pas « 14:30 », pas « https:// »)
  t = t.replace(/(?<=[\p{L}\p{N}\)\]»"”'’])[ \t  ]?:(?=[ \t\n]|$)/gu, THIN + ':');
  // jamais d'espace fine en début de ligne
  t = t.replace(/(^|\n) /g, '$1');
  return t;
}

// ─────────────────────────────────────────── retours à la ligne en terminal

/**
 * m11 : dans un terminal ou un éditeur, aucun retour à la ligne qui n'a pas été dicté.
 * Remplace par un espace les retours que le modèle a inventés, sauf si la dictée contient
 * une commande de retour à la ligne (« à la ligne »…).
 */
export function stripInventedBreaks(out: string, raw = ''): string {
  if (!/\n/.test(out) || hasLineCommand(raw) || /\n/.test(raw)) return out;
  return out.replace(/[ \t]*\n+[ \t]*/g, ' ').replace(/ {2,}/g, ' ').trim();
}

// ──────────────────────────────────────────── règles de remplacement (f4)

export const MAX_REPLACEMENT_RULES = 500;

/** Règles valides uniquement : from non vide (≤ 80), to non vide (≤ 200), sans doublon de `from`. */
export function sanitizeReplacementRules(rules: ReplacementRule[] | undefined): ReplacementRule[] {
  if (!Array.isArray(rules)) return [];
  const seen = new Set<string>();
  const out: ReplacementRule[] = [];
  for (const r of rules) {
    if (!r || typeof r.from !== 'string' || typeof r.to !== 'string') continue;
    const from = r.from.replace(/\s+/g, ' ').trim().slice(0, 80);
    const to = r.to.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 200);
    if (!from || !to || !/[\p{L}\p{N}]/u.test(from)) continue;
    const k = from.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ from, to });
    if (out.length >= MAX_REPLACEMENT_RULES) break;
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * f4 : applique les règles « de → vers » : mots entiers, insensible à la casse, en une seule passe
 * (une règle ne s'applique jamais au résultat d'une autre). La casse de la cible est respectée telle
 * quelle ; si la cible est toute en minuscules et que le mot remplacé commençait par une majuscule
 * (début de phrase), la première lettre de la cible prend une majuscule.
 */
export function applyReplacements(text: string, rules: ReplacementRule[] | undefined): string {
  const list = sanitizeReplacementRules(rules);
  if (!text || !list.length) return text;
  const byKey = new Map<string, string>();
  for (const r of list) byKey.set(r.from.toLowerCase().replace(/\s+/g, ' '), r.to);
  const alts = [...byKey.keys()]
    .sort((a, b) => b.length - a.length)
    .map((k) => escapeRe(k).replace(/ /g, '[ \\t\\u00a0\\u202f]+'));
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return text.replace(re, (m) => {
    const to = byKey.get(m.toLowerCase().replace(/[ \t  ]+/g, ' '));
    if (to === undefined) return m;
    const startsUpper = /^\p{Lu}/u.test(m);
    const targetAllLower = to === to.toLowerCase();
    if (startsUpper && targetAllLower && /^\p{Ll}/u.test(to)) return to[0].toUpperCase() + to.slice(1);
    return to;
  });
}

/** Retour(s) à la ligne à ajouter en fin de sortie quand la dictée FINIT par une commande (« … à la ligne »). */
export function trailingLineBreak(raw: string): string {
  const toks = tokenize(raw);
  for (let i = 0; i < toks.length; i++) {
    const c = lineCommandAt(toks, i);
    if (c && i + c[0] === toks.length) return c[1] === '\n\n' ? '\n\n' : '\n';
  }
  return '';
}

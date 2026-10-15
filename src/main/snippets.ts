/**
 * Snippets (f1) et règles de remplacement du dictionnaire (f4). Logique pure (testable avec
 * `node --experimental-strip-types`) ; la lecture des réglages est paresseuse. Aucun texte n'est journalisé.
 *
 * Réglages (validateSetting n'accepte que des chaînes ≤ 20 000 car. ou des listes de chaînes ≤ 500 car.) :
 *  - `snippets.enabled` (booléen, défaut true)
 *  - `snippets.list` : chaîne JSON `[{"trigger":"ma signature","text":"Cordialement,\nCamille"}]`
 *  - `dictionary.replacements` : liste de chaînes « avant => après » (insensible à la casse, mots entiers)
 */
export interface Snippet {
  trigger: string;
  text: string;
}
export interface Replacement {
  from: string;
  to: string;
}

export const MAX_SNIPPETS = 100;
export const MAX_SNIPPET_TEXT = 5000;
const MAX_JSON = 19_500;

/** minuscules, sans accents ni ponctuation, espaces simples. */
export function normalizeTrigger(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSnippets(v: unknown): Snippet[] {
  let arr: unknown = v;
  if (typeof v === 'string') {
    try {
      arr = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: Snippet[] = [];
  for (const x of arr) {
    const o = x as Partial<Snippet> | null;
    if (!o || typeof o.trigger !== 'string' || typeof o.text !== 'string') continue;
    const trigger = o.trigger.trim().slice(0, 80);
    if (!normalizeTrigger(trigger) || !o.text.trim()) continue;
    out.push({ trigger, text: o.text.slice(0, MAX_SNIPPET_TEXT) });
    if (out.length >= MAX_SNIPPETS) break;
  }
  return out;
}

/** Sérialisation validée pour `snippets.list` ; lance une erreur si trop volumineux. */
export function serializeSnippets(list: unknown): string {
  const s = JSON.stringify(parseSnippets(list));
  if (s.length > MAX_JSON) throw new Error('Trop de snippets (limite de taille atteinte)');
  return s;
}

/**
 * Cherche un snippet. `exactOnly` : le texte entier doit être le déclencheur (sur la transcription brute,
 * avant tout appel IA). Sinon, le texte peut aussi COMMENCER par le déclencheur (mot entier) : le reste suit
 * le texte du snippet. Le déclencheur le plus long gagne. Retourne null sans correspondance.
 */
export function matchSnippet(text: string, snippets: Snippet[], exactOnly = false): string | null {
  const t = normalizeTrigger(text);
  if (!t) return null;
  const sorted = [...snippets].sort((a, b) => normalizeTrigger(b.trigger).length - normalizeTrigger(a.trigger).length);
  for (const sn of sorted) {
    const trig = normalizeTrigger(sn.trigger);
    if (!trig) continue;
    if (t === trig) return sn.text;
    if (!exactOnly && t.startsWith(trig + ' ')) {
      // reste du texte d'origine : on retire les mots du déclencheur (compte de mots identique après normalisation)
      const n = trig.split(' ').length;
      const rest = String(text).trim().split(/\s+/).slice(n).join(' ').replace(/^[\s,;:.!?…-]+/, '').trim();
      return rest ? `${sn.text} ${rest}` : sn.text;
    }
  }
  return null;
}

export function snippetsEnabled(): boolean {
  return (require('./settings') as typeof import('./settings')).settings.get('snippets.enabled') !== false;
}

export function loadSnippets(): Snippet[] {
  const { settings } = require('./settings') as typeof import('./settings');
  return snippetsEnabled() ? parseSnippets(settings.get('snippets.list')) : [];
}

export function saveSnippets(list: unknown): Snippet[] {
  const { settings } = require('./settings') as typeof import('./settings');
  const s = serializeSnippets(list);
  settings.set('snippets.list', s);
  return parseSnippets(s);
}

// ---- Règles de remplacement (f4) ------------------------------------------------------------

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseReplacements(v: unknown): Replacement[] {
  if (!Array.isArray(v)) return [];
  const out: Replacement[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const i = x.indexOf('=>');
    if (i < 1) continue;
    const from = x.slice(0, i).trim();
    const to = x.slice(i + 2).trim();
    if (from && from.length <= 80 && to.length <= 200 && from.toLowerCase() !== to.toLowerCase()) out.push({ from, to });
  }
  return out;
}

/** Remplace `from` (insensible à la casse, mots entiers) par `to`. La règle la plus longue passe d'abord. */
export function applyReplacementRules(text: string, rules: Replacement[]): string {
  let out = text;
  for (const r of [...rules].sort((a, b) => b.from.length - a.from.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escRe(r.from)}(?![\\p{L}\\p{N}])`, 'giu');
    out = out.replace(re, () => r.to);
  }
  return out;
}

/** Applique `dictionary.replacements` (réglage) ; le router (src/llm) peut fournir sa propre version, voir pipeline.ts. */
export function applyDictionaryReplacements(text: string): string {
  const { settings } = require('./settings') as typeof import('./settings');
  const rules = parseReplacements(settings.get('dictionary.replacements'));
  return rules.length ? applyReplacementRules(text, rules) : text;
}

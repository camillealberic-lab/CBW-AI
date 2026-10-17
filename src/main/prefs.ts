// Préférences apprises des retouches (apprentissage continu, chantiers/apprentissage/api.md). Fonctions pures, sans
// import Electron ; testées par prefs.test.ts. Le stockage chiffré et la relecture du champ sont dans learn.ts.
//
// Une préférence naît quand un même motif simple revient (≥ MIN_HITS fois, dans ≥ MIN_OBS dictées) SANS aucun
// contre-exemple dans les observations gardées (60 jours). Elle est visible et annulable dans la page Style.
import { countAtSentenceEnd, countInline, countPhrase, normPhrase, type Edit } from './learnDiff';

/** Une dictée collée puis relue ~45 s plus tard. Stockée chiffrée (learn.ts), 60 jours. */
export interface Observation {
  at: number;
  app?: string;
  /** Brut Whisper. */
  raw: string;
  /** Texte rendu, collé par CBW AI. */
  rendered: string;
  /** Texte gardé dans le champ ; '' quand identique au rendu (gain de place). */
  final: string;
  edits: Edit[];
}
export const finalOf = (o: Observation): string => (o.final === '' && !o.edits.length ? o.rendered : o.final);

export type PrefKind = 'delete-end' | 'delete' | 'replace' | 'newline' | 'keep';
/** Types appliqués sans LLM, après le nettoyage (applyLearnedPreferences). Les autres vont au prompt (plus tard). */
export const DETERMINISTIC: ReadonlySet<PrefKind> = new Set(['delete-end', 'replace']);

export interface Pref {
  id: string;
  /** Motif source (« delete-end:voilà ») : sert à ne jamais recréer une préférence supprimée. */
  key: string;
  kind: PrefKind;
  /** Règle machine : expression (delete-end, delete, keep, newline) ou « avant => après » (replace). */
  rule: string;
  /** Forme affichée (casse d'origine). */
  display: string;
  hits: number;
  observations: number;
  counter: number;
  examples: string[];
  createdAt: number;
  updatedAt: number;
  active: boolean;
  /** 'contredite' : désactivée seule parce que tu as remis ce qu'elle retirait. */
  reason?: 'contredite' | 'manuel';
}

export interface PrefState {
  v: 1;
  prefs: Pref[];
  /** Motifs supprimés par la personne : jamais recréés. */
  rejected: string[];
  lastReportAt: number;
}
export const emptyState = (now = Date.now()): PrefState => ({ v: 1, prefs: [], rejected: [], lastReportAt: now });

export const MIN_HITS = 5;
export const MIN_OBS = 3;
const MAX_PREFS = 50;
const MAX_WORDS = 3;

const KIND_OF: Record<string, PrefKind | undefined> = {
  'delete-end': 'delete-end',
  delete: 'delete',
  replace: 'replace',
  newline: 'newline',
  reinsert: 'keep',
};

/** Libellé français d'une préférence (page Style, rapport). */
export function prefText(kind: PrefKind, display: string): string {
  switch (kind) {
    case 'delete-end':
      return `Retirer « ${display} » en fin de phrase`;
    case 'delete':
      return `Retirer « ${display} »`;
    case 'replace': {
      const [a, b] = display.split(' => ');
      return `Écrire « ${b} » au lieu de « ${a} »`;
    }
    case 'newline':
      return `Aller à la ligne avant « ${display} »`;
    case 'keep':
      return `Garder « ${display} » (l'IA le retirait)`;
  }
}

/** Partie « motif » d'une clé d'edit (« delete-end:voilà » → kind + phrase). */
function splitKey(key: string): { kind: PrefKind; rule: string } | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const kind = KIND_OF[key.slice(0, i)];
  const rule = key.slice(i + 1);
  if (!kind || !rule || rule === '*') return null;
  const words = (s: string): number => s.split(' ').filter(Boolean).length;
  if (kind === 'replace') {
    const [a, b] = rule.split('=>');
    if (!a || !b || words(a) > MAX_WORDS || words(b) > MAX_WORDS) return null;
  } else if (words(rule) > MAX_WORDS) return null;
  if (!/[\p{L}\p{N}]/u.test(rule)) return null;
  return { kind, rule };
}

/** Contre-exemples d'un motif dans une observation (la personne a gardé ce que le motif changerait). */
export function counterIn(o: Observation, kind: PrefKind, rule: string): number {
  const fin = finalOf(o);
  switch (kind) {
    case 'delete-end':
      return Math.min(countAtSentenceEnd(o.rendered, rule), countAtSentenceEnd(fin, rule)) + o.edits.filter((e) => (e.kind === 'insert' || e.kind === 'reinsert') && normPhrase(e.after) === rule).length;
    case 'delete':
      return Math.min(countPhrase(o.rendered, rule), countPhrase(fin, rule)) + o.edits.filter((e) => (e.kind === 'insert' || e.kind === 'reinsert') && normPhrase(e.after) === rule).length;
    case 'replace': {
      const [a, b] = rule.split('=>');
      return Math.min(countPhrase(o.rendered, a), countPhrase(fin, a)) + o.edits.filter((e) => e.kind === 'replace' && normPhrase(e.before) === normPhrase(b) && normPhrase(e.after) === a).length;
    }
    case 'newline':
      return Math.min(countInline(o.rendered, rule), countInline(fin, rule));
    case 'keep': {
      // l'IA a retiré l'expression du brut et la personne ne l'a pas remise
      const lost = countPhrase(o.raw, rule) - countPhrase(o.rendered, rule);
      return lost > 0 && countPhrase(fin, rule) <= countPhrase(o.rendered, rule) ? 1 : 0;
    }
  }
}

export interface MotifStat {
  key: string;
  kind: string;
  hits: number;
  observations: number;
  display: string;
  examples: string[];
}

/** Agrège les edits par motif (clé), avec au plus 3 extraits courts par motif. */
export function aggregate(obs: Observation[]): Map<string, MotifStat> {
  const out = new Map<string, MotifStat>();
  for (const o of obs) {
    const seen = new Set<string>();
    for (const e of o.edits) {
      let s = out.get(e.key);
      if (!s) {
        const disp = e.kind === 'replace' ? `${e.before} => ${e.after}` : e.kind === 'newline' ? e.after : e.after || e.before;
        s = { key: e.key, kind: e.kind, hits: 0, observations: 0, display: disp, examples: [] };
        out.set(e.key, s);
      }
      s.hits++;
      if (!seen.has(e.key)) (seen.add(e.key), s.observations++);
      if (s.examples.length < 3 && e.ctx && !s.examples.includes(e.ctx)) s.examples.push(e.ctx);
    }
  }
  return out;
}

const newId = (key: string, now: number): string => {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `p${now.toString(36)}${(h >>> 0).toString(36)}`;
};

/**
 * Met à jour les préférences à partir de toutes les observations gardées : crée les nouvelles (motif sûr), rafraîchit
 * les comptes, désactive seule une préférence active contredite ≥ 2 fois depuis sa création. Retourne l'état et
 * les préférences créées (pour la notification).
 */
export function derivePrefs(obs: Observation[], state: PrefState, now = Date.now()): { state: PrefState; created: Pref[] } {
  const stats = aggregate(obs);
  const prefs = state.prefs.map((p) => ({ ...p }));
  const byKey = new Map(prefs.map((p) => [p.key, p]));
  const created: Pref[] = [];
  const counterOf = (kind: PrefKind, rule: string, since = 0): number =>
    obs.reduce((n, o) => (o.at >= since ? n + counterIn(o, kind, rule) : n), 0);

  for (const p of prefs) {
    const s = stats.get(p.key);
    if (s) Object.assign(p, { hits: s.hits, observations: s.observations, examples: s.examples, updatedAt: now });
    if (p.active && counterOf(p.kind, p.rule, p.createdAt) >= 2) Object.assign(p, { active: false, reason: 'contredite', updatedAt: now });
  }
  for (const s of stats.values()) {
    if (s.hits < MIN_HITS || s.observations < MIN_OBS || byKey.has(s.key) || state.rejected.includes(s.key)) continue;
    if (prefs.length >= MAX_PREFS) break;
    const k = splitKey(s.key);
    if (!k) continue;
    if (counterOf(k.kind, k.rule) > 0) continue;
    const p: Pref = {
      id: newId(s.key, now),
      key: s.key,
      kind: k.kind,
      rule: k.kind === 'replace' ? k.rule.replace('=>', ' => ') : k.rule,
      display: s.display,
      hits: s.hits,
      observations: s.observations,
      counter: 0,
      examples: s.examples,
      createdAt: now,
      updatedAt: now,
      active: true,
    };
    prefs.push(p);
    byKey.set(p.key, p);
    created.push(p);
  }
  return { state: { ...state, prefs }, created };
}

// ─── Préférences actives (lues par le nettoyage) ────────────────────────────────────────────────────────────────

let current: Pref[] = [];
/** Appelé par learn.ts à chaque chargement / modification de l'état. */
export function setCurrentPrefs(prefs: Pref[]): void {
  current = prefs.slice();
}

/** Contrat (chantiers/apprentissage/api.md) : préférences actives, pour le nettoyage et le futur prompt. */
export function activePreferences(): { kind: PrefKind; rule: string; text: string }[] {
  return current.filter((p) => p.active).map((p) => ({ kind: p.kind, rule: p.rule, text: prefText(p.kind, p.display) }));
}

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SP = '[ \\t\\u00a0\\u202f]';
const phraseRe = (phrase: string): string =>
  phrase
    .trim()
    .split(/\s+/)
    .map(escRe)
    .join(`${SP}+`);

/**
 * Retire `phrase` quand elle termine une phrase : « On se voit demain, voilà. » → « On se voit demain. » ;
 * une phrase réduite à l'expression (« C'est bon. Voilà. ») disparaît. Fin de phrase = . … retour à la ligne ou fin.
 */
export function removeAtSentenceEnd(text: string, phrase: string): string {
  if (!phrase.trim()) return text;
  const re = new RegExp(`([,;:]?${SP}*)(?<![\\p{L}\\p{N}_])(${phraseRe(phrase)})(?![\\p{L}\\p{N}_])${SP}*([.…]+|(?=\\r?\\n)|$)`, 'giu');
  const startsBlank = !/^\s/.test(text);
  let out = text.replace(re, (_m, _sep: string, _ph: string, punct: string, off: number, str: string) => {
    const before = str.slice(0, off).replace(/\s+$/, '');
    const wholeSentence = !before || /[.!?…]["»”’)\]]*$/.test(before) || /\n\s*$/.test(str.slice(0, off));
    return wholeSentence ? '' : punct;
  });
  if (startsBlank) out = out.replace(/^[ \t]+/, '');
  return out;
}

/** Remplacement exact « avant => après » (mots entiers, insensible à la casse, majuscule de début gardée). */
export function replaceExact(text: string, from: string, to: string): string {
  if (!from.trim() || !to.trim()) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${phraseRe(from)}(?![\\p{L}\\p{N}_])`, 'giu');
  return text.replace(re, (m) => (/^\p{Lu}/u.test(m) && /^\p{Ll}/u.test(to) ? to[0].toUpperCase() + to.slice(1) : to));
}

/** Applique les préférences déterministes actives (après le LLM). `prefs` par défaut : l'état courant. */
export function applyLearnedPreferences(text: string, prefs: Pick<Pref, 'kind' | 'rule' | 'active'>[] = current): string {
  let out = text;
  for (const p of prefs) {
    if (!p.active || !DETERMINISTIC.has(p.kind)) continue;
    if (p.kind === 'delete-end') out = removeAtSentenceEnd(out, p.rule);
    else if (p.kind === 'replace') {
      const [a, b] = p.rule.split(' => ');
      if (a && b) out = replaceExact(out, a, b);
    }
  }
  return out;
}

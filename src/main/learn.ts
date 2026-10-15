import { EventEmitter } from 'node:events';
import { Notification } from 'electron';
import { validateLearnedTerm } from '../llm/learn';
import { routerModule } from './cleaner';
import { focusedField } from './context';
import { findReplacements } from './learnDiff';
import { log } from './paths';
import { settings } from './settings';
import { parseReplacements } from './snippets';

/**
 * Piste 4 : dictionnaire appris des corrections. Après un collage, on mémorise le texte inséré et l'app ; dans
 * les 60 s (ou à la dictée suivante) on relit le champ focalisé via dicta-context, on compare mot à mot, et un
 * mot remplacé par un autre proche (validateLearnedTerm, règle locale sans LLM) est ajouté à
 * `cleaning.vocabulary`, marqué « appris » dans `dictionary.learned` (visible et supprimable dans Dictionnaire).
 * Rien n'est envoyé nulle part ; les textes ne sont jamais journalisés (comptes seulement).
 */
export const MAX_VOCAB = 200;
const CHECK_AFTER_MS = 45_000;
const EXPIRE_MS = 60_000;
const MAX_PER_CHECK = 3;

export const autoLearnEnabled = (): boolean => settings.get('dictionary.autoLearn') !== false;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Ajoute `term` au vocabulaire (marqué appris). Au-delà de 200 termes, les plus anciens termes appris sont retirés
 * d'abord ; si tout est manuel, l'ajout est refusé. Retourne true si ajouté.
 */
export function addLearnedTerm(term: string): boolean {
  const vocab = asList(settings.get('cleaning.vocabulary'));
  if (vocab.some((v) => v.toLowerCase() === term.toLowerCase())) return false;
  let learned = asList(settings.get('dictionary.learned')).filter((l) => vocab.includes(l));
  while (vocab.length >= MAX_VOCAB) {
    const oldest = learned.shift();
    if (oldest === undefined) return false;
    const i = vocab.indexOf(oldest);
    if (i >= 0) vocab.splice(i, 1);
  }
  vocab.push(term);
  learned.push(term);
  settings.set('cleaning.vocabulary', vocab);
  settings.set('dictionary.learned', learned);
  routerModule()?.setConfigOverrides?.({ 'cleaning.vocabulary': vocab }); // le router garde sinon l'ancienne liste
  return true;
}

class Learner extends EventEmitter {
  private pending: { text: string; bundleId?: string; at: number } | null = null;
  private timer: NodeJS.Timeout | null = null;

  /** Après un collage réussi. */
  noteInserted(text: string, bundleId?: string): void {
    if (!autoLearnEnabled()) return;
    this.clear();
    this.pending = { text, bundleId, at: Date.now() };
    this.timer = setTimeout(() => void this.check(), CHECK_AFTER_MS);
    this.timer.unref?.();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À la dictée suivante : relit le champ tout de suite si un collage est en attente. */
  flush(): Promise<void> {
    return this.pending ? this.check() : Promise.resolve();
  }

  private async check(): Promise<void> {
    const p = this.pending;
    this.pending = null;
    this.clear();
    if (!p || !autoLearnEnabled() || Date.now() - p.at > EXPIRE_MS + CHECK_AFTER_MS) return;
    try {
      const f = await focusedField();
      if (!f || (p.bundleId && f.bundleId !== p.bundleId)) return;
      const learned: string[] = [];
      for (const r of findReplacements(p.text, f.value)) {
        if (learned.length >= MAX_PER_CHECK) break;
        if (!validateLearnedTerm(r.before, r.after)) continue;
        if (addLearnedTerm(r.after)) learned.push(r.after);
      }
      log('learn: relecture du champ', { termes: learned.length });
      if (learned.length) this.notify(learned);
    } catch (e) {
      log('learn: erreur', e instanceof Error ? e.message : e);
    }
  }

  private notify(terms: string[]): void {
    this.emit('learned', terms);
    if (!Notification.isSupported()) return;
    new Notification({ title: 'CBW AI', body: `Ajouté au dictionnaire : ${terms.join(', ')}`, silent: true }).show();
  }
}

export const learner = new Learner();

/**
 * f6 : vocabulaire partagé avec les notes de réunion. Mots prioritaires (`dictionary.priority`) d'abord, puis
 * `cleaning.vocabulary` (appris compris), dédoublonnés, ≤ 200 ; règles de remplacement `dictionary.replacements`
 * ("avant => après") à appliquer au compte rendu.
 */
export function vocabularyForNotes(): { vocabulary: string[]; replacements: { from: string; to: string }[] } {
  const seen = new Set<string>();
  const vocabulary: string[] = [];
  for (const t of [...asList(settings.get('dictionary.priority')), ...asList(settings.get('cleaning.vocabulary'))]) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    vocabulary.push(t.trim());
    if (vocabulary.length >= MAX_VOCAB) break;
  }
  return { vocabulary, replacements: parseReplacements(settings.get('dictionary.replacements')) };
}

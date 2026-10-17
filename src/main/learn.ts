import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Notification, shell } from 'electron';
import { validateLearnedTerm } from '../llm/learn';
import { routerModule } from './cleaner';
import { focusedField } from './context';
import { getRecent } from './history';
import { analyzeCorrection, findReplacements } from './learnDiff';
import { buildReport, dateKey } from './learnReport';
import { decryptBlob, encryptBlob } from './localcrypto';
import { dataDir, log } from './paths';
import { derivePrefs, emptyState, prefText, setCurrentPrefs, type Observation, type Pref, type PrefState } from './prefs';
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
/** Apprentissage continu (chantiers/apprentissage/api.md) : observer les retouches après collage. */
export const observeEnabled = (): boolean => settings.get('learning.observe') !== false;

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
    if (!autoLearnEnabled() && !observeEnabled()) return;
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
    if (!p || (!autoLearnEnabled() && !observeEnabled()) || Date.now() - p.at > EXPIRE_MS + CHECK_AFTER_MS) return;
    try {
      const f = await focusedField();
      if (!f || (p.bundleId && f.bundleId !== p.bundleId)) return;
      if (observeEnabled()) observe(p.text, f.value, p.bundleId, p.at);
      if (!autoLearnEnabled()) return;
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

// ─── Apprentissage continu : observations chiffrées, préférences apprises, rapport hebdomadaire ─────────────────
// Contrat : chantiers/apprentissage/api.md. Fichiers dans ~/.dicta-ai/learning/ (0700) :
//   observations.bin — {v:1, items: Observation[]} chiffré (localcrypto, AES-256-GCM, clé locale), 60 jours, ≤ 2000
//   prefs.bin        — PrefState chiffré
//   rapport-AAAA-MM-JJ.md — rapport lisible (0600)
// Jamais de texte dans le journal : comptes seulement.

const KEEP_DAYS = 60;
const MAX_OBS = 2000;
const REPORT_EVERY_MS = 7 * 86_400_000;
const learnDir = (): string => {
  const d = path.join(dataDir(), 'learning');
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};
const obsFile = (): string => path.join(learnDir(), 'observations.bin');
const prefsFile = (): string => path.join(learnDir(), 'prefs.bin');

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    const b = decryptBlob(fs.readFileSync(file));
    return b ? (JSON.parse(b.toString('utf8')) as T) : null;
  } catch (e) {
    log('learn: lecture impossible', path.basename(file), e instanceof Error ? e.message : e);
    return null;
  }
}
/** Écrit chiffré ; sans clé locale on n'écrit rien (jamais en clair). */
function writeJson(file: string, v: unknown): boolean {
  const enc = encryptBlob(Buffer.from(JSON.stringify(v), 'utf8'));
  if (!enc) return false;
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, enc, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    log('learn: écriture impossible', path.basename(file), e instanceof Error ? e.message : e);
    return false;
  }
}

let obsCache: Observation[] | null = null;
let stateCache: PrefState | null = null;
export const learningEvents = new EventEmitter(); // 'changed' (préférences / observations), 'report' ({ path })

function loadObs(): Observation[] {
  if (obsCache) return obsCache;
  const d = readJson<{ v: number; items: Observation[] }>(obsFile());
  const cut = Date.now() - KEEP_DAYS * 86_400_000;
  obsCache = (Array.isArray(d?.items) ? d!.items : []).filter((o) => o && typeof o.at === 'number' && o.at >= cut);
  return obsCache;
}
function saveObs(): void {
  const cut = Date.now() - KEEP_DAYS * 86_400_000;
  obsCache = loadObs().filter((o) => o.at >= cut).slice(-MAX_OBS);
  writeJson(obsFile(), { v: 1, items: obsCache });
}
function loadState(): PrefState {
  if (stateCache) return stateCache;
  const d = readJson<PrefState>(prefsFile());
  stateCache = d && Array.isArray(d.prefs) ? { ...emptyState(), ...d } : emptyState();
  if (!d) writeJson(prefsFile(), stateCache); // 1er lancement : le premier rapport viendra dans 7 jours
  setCurrentPrefs(stateCache.prefs);
  return stateCache;
}
function saveState(s: PrefState): void {
  stateCache = s;
  setCurrentPrefs(s.prefs);
  writeJson(prefsFile(), s);
  learningEvents.emit('changed');
}

/** Charge les préférences au démarrage (activePreferences() est alors à jour). */
export function initLearning(): void {
  loadState();
}

/** Relecture d'un collage : enregistre l'observation, met à jour les préférences. Rien de journalisé hors comptes. */
function observe(rendered: string, fieldValue: string, bundleId: string | undefined, at: number): void {
  const raw = getRecent().find((d) => d.status !== 'cancelled' && d.text === rendered && Date.parse(d.at) >= at - 120_000)?.raw ?? '';
  const a = analyzeCorrection(rendered, fieldValue, raw);
  if (!a) {
    log('learn: observation ignorée (texte collé introuvable ou trop modifié)');
    return;
  }
  const o: Observation = { at, app: bundleId, raw, rendered, final: a.edits.length ? a.final : '', edits: a.edits };
  loadObs().push(o);
  saveObs();
  const { state, created } = derivePrefs(loadObs(), loadState());
  saveState(state);
  log('learn: observation', { retouches: a.edits.length, observations: loadObs().length, nouvellesPreferences: created.length });
  if (created.length && Notification.isSupported()) {
    const body = created.length === 1 ? `${prefText(created[0].kind, created[0].display)}. Annulable dans Style.` : `${created.length} nouvelles préférences. Annulables dans Style.`;
    new Notification({ title: 'Préférence apprise', body, silent: true }).show();
  }
}

/** Vue pour la page Style (sans brut ni texte final). */
export function learningView(): {
  observe: boolean;
  observations: number;
  lastReport: string | null;
  prefs: { id: string; kind: string; text: string; hits: number; observations: number; active: boolean; reason?: string; examples: string[]; createdAt: number }[];
} {
  const s = loadState();
  return {
    observe: observeEnabled(),
    observations: loadObs().length,
    lastReport: latestReport(),
    prefs: s.prefs.map((p) => ({ id: p.id, kind: p.kind, text: prefText(p.kind, p.display), hits: p.hits, observations: p.observations, active: p.active, reason: p.reason, examples: p.examples.slice(0, 2), createdAt: p.createdAt })),
  };
}

export function setPrefActive(id: string, active: boolean): boolean {
  const s = loadState();
  const p = s.prefs.find((x) => x.id === id);
  if (!p) return false;
  saveState({ ...s, prefs: s.prefs.map((x) => (x.id === id ? { ...x, active, reason: active ? undefined : 'manuel', updatedAt: Date.now() } : x)) as Pref[] });
  log('learn: préférence', active ? 'réactivée' : 'désactivée');
  return true;
}

/** Supprime une préférence ; son motif n'est plus jamais proposé. */
export function removePref(id: string): boolean {
  const s = loadState();
  const p = s.prefs.find((x) => x.id === id);
  if (!p) return false;
  saveState({ ...s, prefs: s.prefs.filter((x) => x.id !== id), rejected: [...new Set([...s.rejected, p.key])].slice(-500) });
  log('learn: préférence supprimée');
  return true;
}

/** Efface les observations (les préférences restent). */
export function clearObservations(): void {
  obsCache = [];
  try {
    fs.rmSync(obsFile(), { force: true });
  } catch {
    /* rien */
  }
  learningEvents.emit('changed');
  log('learn: observations effacées');
}

function latestReport(): string | null {
  try {
    const f = fs.readdirSync(learnDir()).filter((x) => /^rapport-\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().pop();
    return f ? path.join(learnDir(), f) : null;
  } catch {
    return null;
  }
}

/** Écrit le rapport (7 derniers jours) + notification « Analyse de tes corrections prête » (clic : ouvre le fichier). */
export function writeReport(manual = false): { path: string; observations: number; modified: number; motifs: number } {
  const now = Date.now();
  const { markdown, summary } = buildReport(loadObs(), loadState(), now);
  const file = path.join(learnDir(), `rapport-${dateKey(new Date(now))}.md`);
  fs.writeFileSync(file, markdown, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  saveState({ ...loadState(), lastReportAt: now });
  log('learn: rapport écrit', { manuel: manual, ...summary });
  if (Notification.isSupported()) {
    const n = new Notification({ title: 'Analyse de tes corrections prête', body: `${summary.observations} dictées relues, ${summary.modified} retouchées.`, silent: true });
    n.on('click', () => void shell.openPath(file));
    n.show();
  }
  learningEvents.emit('report', { path: file });
  return { path: file, ...summary };
}

export function openLatestReport(): boolean {
  const f = latestReport();
  if (!f) return false;
  void shell.openPath(f);
  return true;
}

/** Rapport hebdomadaire : vérifié 2 min après le lancement puis toutes les 6 h ; seulement s'il y a ≥ 5 nouvelles dictées relues. */
export function startWeeklyReport(): void {
  const tick = (): void => {
    try {
      if (fs.existsSync(obsFile())) saveObs(); // purge des observations de plus de 60 jours
      const s = loadState();
      if (Date.now() - s.lastReportAt < REPORT_EVERY_MS) return;
      if (loadObs().filter((o) => o.at > s.lastReportAt).length < 5) return;
      writeReport(false);
    } catch (e) {
      log('learn: rapport hebdomadaire impossible', e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, 120_000).unref?.();
  setInterval(tick, 6 * 3600_000).unref?.();
}

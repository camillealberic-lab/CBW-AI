import { app, clipboard } from 'electron';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SLOT_KEYS,
  type BQuestion,
  type Brainstorm,
  type BrainstormTarget,
  type DictaStatus,
  type LiveQuestion,
  type Slot,
  type SlotKey,
} from '../shared/types';
import { routerModule } from './cleaner';
import { log } from './paths';
import { brainstormsDataDir, NoteSession } from './notes';
import type { Recorder } from './recorder';
import { playSound } from './sounds';

/**
 * Mode « Brainstorm → master prompt » (docs/APP_API.md) :
 * vidage libre (même capture que la prise de notes, rien n'est collé) → analyzeBrainstorm (cases CRAFT+ et
 * questions) → réponses → compileMasterPrompt → ~/Documents/CBW AI/Prompts/<date> — <titre>.md.
 * Chaque étape est persistée dans ~/.dicta-ai/brainstorms/<id>.json (reprise après plantage).
 */

export const MAX_QUESTIONS = 6;
/** Brainstorm v2 : bulles visibles au maximum, mots nouveaux minimum, intervalle minimal entre deux appels. */
export const MAX_LIVE_OPEN = 3;
export const LIVE_MIN_WORDS = 12;
export const LIVE_MIN_GAP_MS = 2500;
const countWords = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);

const jsonFile = (id: string): string => path.join(brainstormsDataDir(), `${id}.json`);
const txtFile = (id: string): string => path.join(brainstormsDataDir(), `${id}.txt`);
/** ~/Documents/CBW AI/Prompts (DICTA_PROMPTS_DIR pour les tests). */
export const promptsOutDir = (): string => {
  const d = process.env.DICTA_PROMPTS_DIR || path.join(app.getPath('documents'), 'CBW AI', 'Prompts');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const pad = (n: number): string => String(n).padStart(2, '0');
const safeId = (id: unknown): string => {
  const s = String(id ?? '');
  if (!/^[\w-]{1,80}$/.test(s)) throw new Error('Identifiant de brainstorm invalide');
  return s;
};
const emptySlots = (): Record<SlotKey, Slot> =>
  Object.fromEntries(SLOT_KEYS.map((k) => [k, { value: '', status: 'vide' }])) as Record<SlotKey, Slot>;
const asTarget = (t: unknown, fallback: BrainstormTarget = 'claude-code'): BrainstormTarget =>
  t === 'cursor' || t === 'claude-code' ? t : fallback;

function mdName(createdAt: Date, title: string): string {
  const d = createdAt;
  // Titre proposé par le LLM : aucun séparateur de chemin ni caractère de contrôle, pas de « . » en tête.
  const clean = title.replace(/[\/\\:*?"<>|\x00-\x1f\x7f]+/g, '-').replace(/\s+/g, ' ').replace(/^[.\s-]+/, '').trim().slice(0, 80) || 'Prompt';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())} — ${clean}.md`;
}
/** Chemin de prompt enregistré dans un <id>.json : seulement s'il est dans ~/Documents/CBW AI/Prompts. */
function insidePromptsOut(p: unknown): p is string {
  if (typeof p !== 'string' || !p) return false;
  return path.resolve(p).startsWith(path.resolve(promptsOutDir()) + path.sep) && p.endsWith('.md');
}
function uniquePath(dir: string, name: string, current?: string): string {
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p) && p !== current; i++) p = path.join(dir, name.replace(/\.md$/, ` (${i}).md`));
  return p;
}

function readSession(id: string): Brainstorm | null {
  try {
    return JSON.parse(fs.readFileSync(jsonFile(id), 'utf8')) as Brainstorm;
  } catch {
    return null;
  }
}
/** Écriture atomique (tmp + rename) : jamais de JSON tronqué en cas de plantage. */
function writeSession(b: Brainstorm): void {
  if (!b.id) return;
  const { level: _l, ...persisted } = b;
  const tmp = jsonFile(b.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(persisted, null, 2));
  fs.renameSync(tmp, jsonFile(b.id));
}

/**
 * Paires question / réponse transmises à l'IA : bulles répondues en direct + questions classiques répondues
 * (les questions classiques passées ne sont pas transmises). Les bulles encore ouvertes sont ajoutées avec une
 * réponse vide → points non tranchés, compilés dans « À clarifier avant de commencer ».
 */
function qaOf(b: Brainstorm): { question: string; answer: string }[] {
  const live = b.live ?? [];
  return [
    ...live.filter((q) => q.state === 'answered' && q.answer?.trim()).map((q) => ({ question: q.question, answer: q.answer!.trim() })),
    ...b.questions
      .filter((q) => typeof b.answers[q.id] === 'string' && b.answers[q.id].trim())
      .map((q) => ({ question: q.question, answer: b.answers[q.id].trim() })),
    ...live.filter((q) => q.state === 'open').map((q) => ({ question: q.question, answer: '' })),
  ];
}

export class BrainstormManager extends EventEmitter {
  readonly capture: NoteSession;
  /** Session affichée / en cours (null : aucune). */
  private cur: Brainstorm | null = null;
  private ac: AbortController | null = null;
  private lastWords = -1;
  private lastPush = 0;
  /** Renvoie un message si un brainstorm ne peut pas démarrer (dictée ou note en cours). */
  private guard: () => string | null;
  // ── conversation en direct (Brainstorm v2)
  /** Longueur de la transcription déjà analysée par liveBrainstorm (le reste = « fresh »). */
  private liveDone = 0;
  private liveRun: Promise<void> | null = null;
  private liveAc: AbortController | null = null;
  private liveAt = 0;
  private liveTimer: NodeJS.Timeout | null = null;

  constructor(recorder: Recorder, guard: () => string | null) {
    super();
    this.guard = guard;
    this.capture = new NoteSession(recorder, 'brainstorm');
    this.capture.on('status', (s: DictaStatus) => {
      this.emit('status', s);
      // niveau micro ~15×/s → pousse le timer/niveau à l'UI (limité à ~10×/s)
      if (this.cur?.state === 'recording' && s.state === 'recording' && Date.now() - this.lastPush > 100) this.pushLive();
    });
    this.capture.on('active', (on: boolean) => this.emit('active', on));
    this.capture.on('progress', (p: { state: string; message?: string }) => {
      const b = this.cur;
      if (!b || b.state !== 'recording') return;
      if (p.state === 'error') return; // annulation / échec de démarrage : géré par start() / cancel()
      const words = this.capture.wordCount();
      if (words !== this.lastWords) {
        this.lastWords = words;
        b.transcript = this.capture.transcriptSoFar();
        this.save();
      }
      this.pushLive();
      this.maybeLive();
    });
  }

  // ── conversation en direct : à chaque pause (segment transcrit), ≥ 12 mots nouveaux, un appel à la fois
  private maybeLive(): void {
    const b = this.cur;
    if (!b || b.state !== 'recording' || !this.capture.active || this.liveRun) return;
    if (!routerModule()?.liveBrainstorm) return;
    const fresh = b.transcript.slice(this.liveDone).trim();
    if (countWords(fresh) < LIVE_MIN_WORDS) return;
    const wait = this.liveAt + LIVE_MIN_GAP_MS - Date.now();
    if (wait > 0) {
      if (!this.liveTimer) this.liveTimer = setTimeout(() => ((this.liveTimer = null), this.maybeLive()), wait);
      return;
    }
    this.liveRun = this.runLive(b, fresh).finally(() => {
      this.liveRun = null;
    });
  }

  private async runLive(b: Brainstorm, fresh: string): Promise<void> {
    const fn = routerModule()!.liveBrainstorm!;
    const live = (b.live ??= []);
    const end = b.transcript.length;
    const open = live.filter((q) => q.state === 'open');
    const answered = live.filter((q) => q.state === 'answered' && q.answer?.trim());
    const ac = new AbortController();
    this.liveAc = ac;
    this.liveAt = Date.now();
    const t0 = Date.now();
    try {
      const r = await fn(
        {
          target: b.target,
          slots: b.slots,
          open: open.map((q) => ({ id: q.id, question: q.question })),
          asked: live.map((q) => q.question),
          // réponses cliquées dans les bulles : ajoutées au contexte pour que l'IA en tienne compte
          said: b.transcript + answered.map((q) => `\n(Réponse à « ${q.question} » : ${q.answer!.trim()})`).join(''),
          fresh,
          maxNew: Math.max(0, MAX_LIVE_OPEN - open.length),
        },
        { signal: ac.signal },
      );
      if (ac.signal.aborted || this.cur !== b) return;
      const ms = Date.now() - t0;
      this.liveDone = Math.max(this.liveDone, end);
      b.slots = r.slots ?? b.slots;
      if (!b.title && r.title) b.title = r.title;
      let resolved = 0;
      for (const x of r.resolved ?? []) {
        const q = live.find((y) => y.id === x.id && y.state === 'open');
        if (!q) continue;
        q.state = 'answered';
        q.answer = String(x.answer ?? '');
        resolved++;
      }
      // l'utilisateur a pu répondre / fermer pendant l'appel : on recompte les places libres
      const room = Math.max(0, MAX_LIVE_OPEN - live.filter((q) => q.state === 'open').length);
      const askedAt = this.capture.elapsed();
      const added = (r.questions ?? []).slice(0, room).map(
        (q, i): LiveQuestion => ({
          id: `q${live.length + i + 1}`,
          slot: q.slot,
          question: String(q.question ?? ''),
          suggestions: Array.isArray(q.suggestions) ? q.suggestions.slice(0, 3).map(String) : [],
          state: 'open',
          askedAt,
        }),
      );
      live.push(...added);
      b.provider = r.provider;
      log(`brainstorm: direct par ${r.provider} en ${ms} ms — ${countWords(fresh)} mots, ${resolved} résolue(s), ${added.length} nouvelle(s)`);
      this.emit('live-call', { ms, provider: r.provider, words: countWords(fresh), resolved, added: added.map((q) => q.question) });
      this.save();
      this.pushLive();
    } catch (e) {
      // 429 / réseau / JSON invalide : silencieux, on réessaie à la prochaine pause (le « fresh » s'accumule)
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      log(`brainstorm: direct impossible après ${Date.now() - t0} ms (nouvel essai à la prochaine pause) —`, msg);
      this.emit('live-call', { ms: Date.now() - t0, error: msg });
    } finally {
      if (this.liveAc === ac) this.liveAc = null;
    }
  }

  private stopLive(abort: boolean): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    if (abort) this.liveAc?.abort();
  }

  /** Vidage en cours (micro ouvert ou fin de transcription). */
  get capturing(): boolean {
    return this.capture.busy;
  }
  get recording(): boolean {
    return this.capture.active;
  }
  /** Analyse / compilation LLM en cours. */
  get working(): boolean {
    return this.cur?.state === 'analyzing' || this.cur?.state === 'compiling';
  }
  get current(): Brainstorm | null {
    return this.cur;
  }

  private save(): void {
    if (!this.cur) return;
    try {
      writeSession(this.cur);
    } catch (e) {
      log('brainstorm: sauvegarde', e);
    }
  }
  private push(b: Brainstorm | null = this.cur): void {
    if (!b) return;
    this.lastPush = Date.now();
    this.emit('update', { ...b });
  }
  private pushLive(): void {
    const b = this.cur;
    if (!b) return;
    b.elapsedMs = this.capture.elapsed();
    b.words = this.capture.wordCount();
    b.level = this.capture.currentLevel;
    this.push();
  }
  private set(patch: Partial<Brainstorm>): void {
    if (!this.cur) return;
    Object.assign(this.cur, patch);
    if (patch.state && patch.state !== 'error' && !('message' in patch)) delete this.cur.message;
    this.save();
    this.push();
  }
  private status(s: DictaStatus): void {
    this.emit('status', { mode: 'brainstorm', ...s });
  }
  /** Refus sans session (toast côté UI) : état 'error' + message, rien n'est persisté. */
  private refuse(message: string): void {
    log('brainstorm: refusé —', message);
    playSound('error');
    this.push({
      id: '',
      title: '',
      createdAt: new Date().toISOString(),
      target: 'claude-code',
      state: 'error',
      transcript: '',
      slots: emptySlots(),
      questions: [],
      answers: {},
      message,
    });
  }
  /** Charge une session (la courante si c'est elle). */
  private load(id: string): Brainstorm {
    const sid = safeId(id);
    if (this.cur?.id === sid) return this.cur;
    const b = readSession(sid);
    if (!b) throw new Error('Brainstorm introuvable');
    return b;
  }
  /** Rend `id` courant pour une étape LLM ; refuse si une autre étape est en cours. */
  private activate(id: string): Brainstorm {
    if (this.capturing) throw new Error('Un vidage est en cours');
    if (this.working && this.cur?.id !== safeId(id)) throw new Error('Un autre brainstorm est en cours de traitement');
    if (this.working) throw new Error('Traitement déjà en cours');
    this.cur = this.load(id);
    return this.cur;
  }

  // ── 1) vidage
  async start(target?: unknown, opts: { feed?: boolean } = {}): Promise<void> {
    if (this.capturing) return void this.refuse('Un brainstorm est déjà en cours d’enregistrement');
    if (this.working) return void this.refuse('Un brainstorm est en cours de traitement — patiente quelques secondes');
    const blocked = this.guard();
    if (blocked) return void this.refuse(blocked);
    this.lastWords = -1;
    this.stopLive(true);
    this.liveDone = 0;
    this.liveAt = 0;
    let failure = '';
    const onFail = (p: { state: string; message?: string }) => {
      if (p.state === 'error') failure = p.message || 'Enregistrement impossible';
    };
    this.capture.on('progress', onFail);
    // Session créée avant le démarrage du micro : le premier statut 'recording' la trouve déjà.
    const prev = this.cur;
    this.cur = {
      id: '',
      title: '',
      createdAt: new Date().toISOString(),
      target: asTarget(target),
      state: 'recording',
      transcript: '',
      slots: emptySlots(),
      questions: [],
      answers: {},
      live: [],
      elapsedMs: 0,
      words: 0,
      level: 0,
    };
    try {
      await this.capture.start(opts);
    } finally {
      this.capture.off('progress', onFail);
    }
    if (!this.capture.active) {
      this.cur = prev;
      return void this.refuse(failure || 'Enregistrement impossible');
    }
    this.cur.id = this.capture.currentId;
    this.cur.createdAt = this.capture.startedAt.toISOString();
    this.save();
    log('brainstorm: vidage démarré', this.cur.id, this.cur.target);
    this.push();
  }

  // ── 2) fin du vidage → compilation directe (Brainstorm v2 : les Q/R ont eu lieu en direct)
  async stop(): Promise<void> {
    if (!this.capture.active || !this.cur) return;
    const b = this.cur;
    this.stopLive(false);
    const r = await this.capture.stopCapture();
    if (!r) return;
    // appel en direct en cours : on attend son résultat (bulles résolues), 10 s au plus
    if (this.liveRun) {
      const run = this.liveRun;
      const t = setTimeout(() => this.liveAc?.abort(), 10000);
      await run;
      clearTimeout(t);
    }
    if (this.cur !== b) return;
    b.transcript = r.transcript;
    b.elapsedMs = r.durationMs;
    b.words = this.capture.wordCount();
    b.level = 0;
    if (!r.transcript) {
      this.status({ state: 'error', message: 'Brainstorm : rien n’a été entendu' });
      this.set({ state: 'error', message: 'Rien n’a été entendu pendant le vidage. Recommence en parlant un peu plus près du micro.' });
      return;
    }
    this.save();
    await this.compile(b.id);
  }

  cancel(): void {
    this.stopLive(true);
    if (this.capture.active || this.capture.busy) {
      const id = this.cur?.id;
      this.capture.cancel();
      if (id) {
        fs.rmSync(jsonFile(id), { force: true });
        fs.rmSync(txtFile(id), { force: true });
      }
      if (this.cur) this.push({ ...this.cur, state: 'error', message: 'Brainstorm annulé', level: 0 });
      this.cur = null;
      log('brainstorm: vidage annulé', id);
      return;
    }
    if (this.working && this.cur) {
      this.ac?.abort();
      const back = this.cur.questions.length ? 'questions' : 'error';
      this.status({ state: 'idle' });
      this.set({ state: back, message: back === 'error' ? 'Analyse annulée — relance-la quand tu veux' : undefined });
      log('brainstorm: traitement annulé', this.cur.id);
    }
  }

  private async analyze(b: Brainstorm, more: boolean): Promise<void> {
    const fn = routerModule()?.analyzeBrainstorm;
    if (!fn) {
      this.status({ state: 'error', message: 'Brainstorm : moteur IA indisponible' });
      this.set({
        state: 'error',
        message: 'Analyse indisponible : le module IA Brainstorm (src/llm/brainstorm.ts) n’est pas compilé dans cette version. Ta transcription est conservée.',
      });
      return;
    }
    const ac = new AbortController();
    this.ac = ac;
    this.status({ state: 'cleaning', message: more ? 'Brainstorm · nouvelles questions…' : 'Brainstorm · analyse…' });
    this.set({ state: 'analyzing', level: 0 });
    const remaining = MAX_QUESTIONS - b.questions.length;
    try {
      const t0 = Date.now();
      const r = await fn(
        {
          transcript: b.transcript,
          target: b.target,
          maxQuestions: more ? remaining : MAX_QUESTIONS,
          ...(more || b.questions.length ? { slots: b.slots, qa: qaOf(b) } : {}),
        },
        { signal: ac.signal },
      );
      if (ac.signal.aborted || this.cur !== b) return;
      const base = b.questions.length;
      const fresh: BQuestion[] = (r.questions ?? []).slice(0, Math.max(0, more ? remaining : MAX_QUESTIONS - base)).map((q, i) => ({
        id: `q${base + i + 1}`,
        slot: q.slot,
        question: String(q.question ?? ''),
        why: String(q.why ?? ''),
        suggestions: Array.isArray(q.suggestions) ? q.suggestions.slice(0, 3).map(String) : [],
      }));
      log(`brainstorm: analyse par ${r.provider} en ${Date.now() - t0} ms — ${fresh.length} question(s)`, b.id);
      this.status({ state: 'done', message: fresh.length ? 'Brainstorm · questions prêtes' : 'Brainstorm · analyse terminée' });
      this.set({
        state: 'questions',
        title: b.title || r.title || 'Brainstorm',
        slots: r.slots ?? b.slots,
        questions: [...b.questions, ...fresh],
        provider: r.provider,
        ...(more ? { askedMore: true } : {}),
        ...(more && !fresh.length ? { message: 'Plus de question : les cases sont assez claires' } : {}),
      });
    } catch (e) {
      if (ac.signal.aborted || this.cur !== b) return;
      const msg = e instanceof Error ? e.message : String(e);
      log('brainstorm: analyse impossible', msg);
      this.status({ state: 'error', message: 'Brainstorm : analyse impossible' });
      if (more && b.questions.length) this.set({ state: 'questions', askedMore: true, message: `Pas de nouvelles questions (${msg})` });
      else this.set({ state: 'error', message: `Analyse impossible : ${msg}` });
    } finally {
      if (this.ac === ac) this.ac = null;
    }
  }

  // ── 3) réponses
  answer(id: unknown, questionId: unknown, answer: unknown): void {
    const b = this.load(String(id));
    const qid = String(questionId ?? '');
    if (!b.questions.some((q) => q.id === qid)) throw new Error('Question inconnue');
    b.answers[qid] = String(answer ?? '').slice(0, 4000);
    if (b === this.cur) {
      this.save();
      this.push();
    } else writeSession(b);
  }

  /** Bulle : réponse (clic sur une suggestion ou texte tapé). '' = répondue sans texte. */
  answerLive(id: unknown, questionId: unknown, answer: unknown): void {
    const b = this.load(String(id));
    const q = b.live?.find((x) => x.id === String(questionId ?? ''));
    if (!q) throw new Error('Question inconnue');
    q.state = 'answered';
    q.answer = String(answer ?? '').slice(0, 4000);
    if (b === this.cur) {
      this.save();
      this.push();
    } else writeSession(b);
  }

  /** Bulle fermée (×) : ni posée au compilateur, ni reposée par l'IA. */
  dismissLive(id: unknown, questionId: unknown): void {
    const b = this.load(String(id));
    const q = b.live?.find((x) => x.id === String(questionId ?? ''));
    if (!q) throw new Error('Question inconnue');
    if (q.state === 'open') q.state = 'dismissed';
    if (b === this.cur) {
      this.save();
      this.push();
    } else writeSession(b);
  }

  /** Re-analyse avec les réponses → nouvelles questions (une seule fois, max 6 au total). Après une erreur d'analyse : relance l'analyse. */
  async askMore(id: unknown): Promise<void> {
    const b = this.activate(String(id));
    if (!b.transcript.trim()) throw new Error('Transcription vide');
    if (b.state === 'error' && !b.questions.length) return this.analyze(b, false); // reprise
    if (b.askedMore) throw new Error('Questions supplémentaires déjà demandées');
    if (b.questions.length >= MAX_QUESTIONS) throw new Error(`Déjà ${MAX_QUESTIONS} questions posées`);
    await this.analyze(b, true);
  }

  // ── 4) compilation
  async compile(id: unknown, target?: unknown): Promise<void> {
    const b = this.activate(String(id));
    if (!b.transcript.trim()) throw new Error('Transcription vide');
    b.target = asTarget(target, b.target);
    const fn = routerModule()?.compileMasterPrompt;
    if (!fn) {
      this.status({ state: 'error', message: 'Brainstorm : moteur IA indisponible' });
      this.set({ state: 'error', message: 'Compilation indisponible : le module IA Brainstorm (src/llm/brainstorm.ts) n’est pas compilé dans cette version.' });
      return;
    }
    const ac = new AbortController();
    this.ac = ac;
    const back = b.state; // en cas d'échec : retour à l'étape précédente
    this.status({ state: 'cleaning', message: 'Brainstorm · compilation du prompt…' });
    this.set({ state: 'compiling' });
    try {
      const t0 = Date.now();
      const r = await fn({ transcript: b.transcript, target: b.target, title: b.title, slots: b.slots, qa: qaOf(b) }, { signal: ac.signal });
      if (ac.signal.aborted || this.cur !== b) return;
      const prompt = String(r.prompt ?? '').trim();
      if (!prompt) throw new Error('prompt vide');
      const title = String(r.title || b.title || 'Master prompt').trim();
      const file = uniquePath(promptsOutDir(), mdName(new Date(b.createdAt), title), b.path);
      fs.writeFileSync(file, prompt + '\n');
      if (insidePromptsOut(b.path) && b.path !== file) fs.rmSync(b.path, { force: true });
      log(`brainstorm: prompt compilé par ${r.provider} en ${Date.now() - t0} ms → ${file}`);
      this.status({ state: 'done', message: `Prompt prêt : ${title}` });
      this.set({ state: 'done', prompt, title, path: file, provider: r.provider });
      this.emit('saved', { id: b.id, title, path: file });
    } catch (e) {
      if (ac.signal.aborted || this.cur !== b) return;
      const msg = e instanceof Error ? e.message : String(e);
      log('brainstorm: compilation impossible', msg);
      this.status({ state: 'error', message: 'Brainstorm : compilation impossible' });
      this.set({
        state: back === 'done' ? 'done' : back === 'questions' ? 'questions' : 'error',
        message: `Compilation impossible : ${msg}`,
      });
    } finally {
      if (this.ac === ac) this.ac = null;
    }
  }

  // ── accès aux sessions enregistrées
  list(): { id: string; title: string; createdAt: string; state: string }[] {
    const out: { id: string; title: string; createdAt: string; state: string }[] = [];
    for (const f of fs.readdirSync(brainstormsDataDir())) {
      const m = f.match(/^(.+)\.json$/);
      if (!m) continue;
      const b = this.cur?.id === m[1] ? this.cur : readSession(m[1]);
      if (b) out.push({ id: b.id, title: b.title || 'Brainstorm sans titre', createdAt: b.createdAt, state: b.state });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: unknown): Brainstorm {
    return { ...this.load(String(id)) };
  }

  copyPrompt(id: unknown): void {
    const b = this.load(String(id));
    if (!b.prompt) throw new Error('Pas encore de prompt compilé');
    clipboard.writeText(b.prompt);
  }

  delete(id: unknown): void {
    const sid = safeId(id);
    if (this.cur?.id === sid) {
      if (this.capturing || this.working) this.cancel();
      this.cur = null;
    }
    const b = readSession(sid);
    if (insidePromptsOut(b?.path)) fs.rmSync(b!.path!, { force: true });
    fs.rmSync(jsonFile(sid), { force: true });
    fs.rmSync(txtFile(sid), { force: true });
  }

  /** Au démarrage : sessions interrompues (plantage) → état reprenable. */
  recover(): void {
    for (const f of fs.readdirSync(brainstormsDataDir())) {
      const m = f.match(/^(.+)\.(json|txt)$/);
      if (!m) continue;
      const id = m[1];
      if (m[2] === 'txt') {
        // vidage dont le JSON n'a jamais été écrit (plantage immédiat)
        if (fs.existsSync(jsonFile(id))) continue;
        const t = fs.readFileSync(txtFile(id), 'utf8').replace(/\n+/g, ' ').trim();
        if (!t) {
          fs.rmSync(txtFile(id), { force: true });
          continue;
        }
        writeSession({
          id,
          title: '',
          createdAt: fs.statSync(txtFile(id)).birthtime.toISOString(),
          target: 'claude-code',
          state: 'error',
          transcript: t,
          slots: emptySlots(),
          questions: [],
          answers: {},
          message: 'Brainstorm récupéré après une interruption — relance l’analyse.',
        });
        log('brainstorm: récupéré', id);
        continue;
      }
      const b = readSession(id);
      if (!b || !['recording', 'analyzing', 'compiling'].includes(b.state)) continue;
      if (b.state === 'recording') {
        try {
          b.transcript = fs.readFileSync(txtFile(id), 'utf8').replace(/\n+/g, ' ').trim() || b.transcript;
        } catch {
          /* pas de txt */
        }
      }
      if (!b.transcript.trim()) {
        fs.rmSync(jsonFile(id), { force: true });
        fs.rmSync(txtFile(id), { force: true });
        continue;
      }
      b.state = b.questions.length ? 'questions' : 'error';
      b.message = 'Brainstorm récupéré après une interruption' + (b.state === 'error' ? ' — relance l’analyse.' : '.');
      writeSession(b);
      log('brainstorm: récupéré', id, b.state);
    }
  }
}

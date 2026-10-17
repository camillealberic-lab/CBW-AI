import { EventEmitter } from 'node:events';
import type { CleanOptions, CleanResult, DictaState, DictaStatus } from '../shared/types';
import { clean, routerModule } from './cleaner';
import { snapshotContext, type DictationContextEx } from './context';
import { whisperNamesPrompt } from './contextNames';
import { learner } from './learn';
import { getById, getRecent, newDictationId, purgeAudio, readAudio, recordPending, saveAudio, updateDictation, type Dictation } from './history';
import { insertText, restoreDelayFor, sendCommandKey, snapshot } from './insert';
import { notepadIntercept } from './notepad';
import { log, textForLog } from './paths';
import { bindRecovery } from './recovery';
import { bindRewrite, performRewrite } from './rewrite';
import { Recorder, type RecordingResult } from './recorder';
import { settings } from './settings';
import { loadSnippets, matchSnippet, parseReplacements } from './snippets';
import { applyLearnedPreferences } from './prefs';
import { ensureWhisperModel, transcribe, whisperModel } from './whisper';
import { modelDownloader } from './whisperModels';

type UiohookModule = typeof import('uiohook-napi');

/** Exports du router (src/llm/router.ts) utilisés ici, en plus de ceux typés dans cleaner.ts. */
interface RouterExtras {
  warmup?: () => Promise<void>;
  setRouterLogger?: (fn: ((msg: string, data?: unknown) => void) | null) => void;
  usableCloudProviders?: () => string[];
  canSpeculate?: (raw: string, opts?: { language?: string; priorityVocabulary?: string[]; promptMode?: 'auto' | 'on' | 'off'; toneByApp?: boolean }) => { ok: boolean; reason?: string };
}

const MIN_DURATION_MS = 350;
/** En dessous, ce n'est pas de la parole (souffle, clic, bruit). */
const MIN_VOICED_MS = 300;
/** Phrases que Whisper « entend » dans le silence ou le bruit. */
const SILENCE_RE =
  /^(je vous remercie|merci( beaucoup| à tous| à vous| d'avoir regardé( cette vidéo)?)?|sous-titr\S*.*|bonne (journée|soirée)|au revoir|à bientôt|abonnez-vous.*|thank you( for watching)?|thanks|you|bye)[\s.!?…]*$/i;
const isSilenceHallucination = (raw: string): boolean => {
  const t = raw.trim().replace(/^[\s.…-]+$/, '');
  return !t || SILENCE_RE.test(t);
};
const FRAME = 320; // 20 ms à 16 kHz (cf. src/shared/vad.ts)

export interface DictationResult {
  raw: string;
  text: string;
  provider: string;
  model: string;
  timings: {
    recordMs: number;
    whisperMs: number;
    cleanMs: number;
    insertMs: number;
    totalAfterReleaseMs: number;
    /** Fin de la parole (VAD) → texte collé. */
    speechEndToPastedMs: number;
  };
  inserted: 'pasted' | 'clipboard';
  /** Identifiant d'historique (c3) et audio conservé. */
  id?: string;
  audio?: boolean;
  durationMs?: number;
}

interface SegJob {
  start: number;
  end: number;
  commit: boolean;
  text: Promise<string>;
  done: boolean;
  failed: boolean;
}

/** État propre à UNE dictée (enregistrement + traitement) : permet d'en relancer une pendant le traitement de la précédente (b4). */
interface Take {
  id: string;
  jobs: SegJob[];
  queue: Promise<unknown>;
  partial: string;
  llmSpec: { raw: string; ac: AbortController; result: Promise<CleanResult> } | null;
  recAbort: AbortController | null;
  lastSpecAt: number;
  specTimer: NodeJS.Timeout | null;
  ctxP: Promise<DictationContextEx | undefined>;
  ctx: DictationContextEx | undefined;
  startedAt: number;
  /** Mode « réécrire la sélection » : la parole est la consigne, la sélection est le texte à transformer. */
  rewrite?: { selected: string };
}
const newTake = (): Take => ({
  id: newDictationId(),
  jobs: [],
  queue: Promise.resolve(),
  partial: '',
  llmSpec: null,
  recAbort: new AbortController(),
  lastSpecAt: 0,
  specTimer: null,
  ctxP: Promise.resolve(undefined),
  ctx: undefined,
  startedAt: 0,
});

interface Proc {
  take: Take;
  ac: AbortController;
  /** Texte brut connu au moment de l'annulation (c6). */
  raw: string;
  inserted: boolean;
}

export interface BeginOptions {
  rewrite?: { selected: string };
}

/**
 * Pipeline : record → whisper → cleanTranscript → insert, optimisé pour la latence :
 *  - les segments (pauses détectées par le VAD) sont transcrits PENDANT la dictée ;
 *  - à chaque pause, transcription spéculative de la fin + nettoyage LLM spéculatif :
 *    si rien n'a été dit depuis, le texte est déjà prêt au relâchement ;
 *  - repli sur l'enregistrement complet si un segment échoue ;
 *  - une nouvelle dictée peut démarrer pendant le traitement de la précédente : chaque dictée a son état (Take),
 *    les collages restent dans l'ordre des dictées (b4) ;
 *  - Échap ne jette rien : audio + texte sont gardés dans l'historique, récupérables par recoverLast() (c6).
 * Événements : 'status' (DictaStatus), 'result' (DictationResult), 'recoverable' ({ id, status, until }),
 * 'alert' ({ kind, ... }), 'rewrite' ({ selChars, outChars }), 'learned' via learner.
 */
export class Pipeline extends EventEmitter {
  private state: DictaState = 'idle';
  private doneTimer: NodeJS.Timeout | null = null;
  private lastWarmup = 0;
  private t: Take = newTake();
  private procs = new Set<Proc>();
  /** Fin du traitement de la dictée précédente (jamais rejetée) : garantit l'ordre des collages. */
  private tail: Promise<void> = Promise.resolve();
  /** Arrêt du recorder en cours : une nouvelle dictée attend qu'il soit fini. */
  private stopping: Promise<void> | null = null;
  private routerLogHooked = false;
  private beginOpts: BeginOptions = {};
  private retrying = new Set<string>();

  constructor(
    private recorder: Recorder,
    private env: {
      uiohook: () => UiohookModule | null;
      trusted: () => boolean;
      onForcedStop: () => void;
      nativePaste?: () => Promise<boolean>;
    },
  ) {
    super();
    recorder.on('level', (level: number) => {
      if (this.state === 'recording') this.emit('status', { state: 'recording', level, partialText: this.t.partial || undefined } satisfies DictaStatus);
    });
    recorder.on('started', (info) => log('recorder: démarré', info));
    recorder.on('segment', (wav: Buffer, start: number, end: number, commit: boolean) => this.onSegment(wav, start, end, commit));
    // Événements du recorder (api-audio.md) : limite de durée, micro perdu, aucun son.
    recorder.on('limit', (e: { kind: 'warn' | 'max'; remainingMs?: number }) => {
      if (this.state !== 'recording') return;
      if (e.kind === 'max') {
        log('pipeline: durée max atteinte → arrêt, texte gardé');
        this.env.onForcedStop();
        void this.end();
      } else this.emit('alert', { kind: 'limit-warn', remainingMs: e.remainingMs ?? 60_000 });
    });
    recorder.on('interrupted', (e: { reason?: string }) => {
      if (this.state !== 'recording') return;
      log('pipeline: capture interrompue → arrêt, texte gardé', { reason: e?.reason });
      this.emit('alert', { kind: 'interrupted', reason: e?.reason });
      this.env.onForcedStop();
      void this.end();
    });
    recorder.on('noInput', () => {
      if (this.state === 'recording') this.emit('alert', { kind: 'no-input' });
    });
    bindRecovery(this);
    bindRewrite(this);
    // Purge des audios de plus de 14 jours : au démarrage (différé) puis toutes les 6 h.
    setTimeout(() => purgeAudio(), 30_000).unref?.();
    setInterval(() => purgeAudio(), 6 * 3600_000).unref?.();
  }

  get current(): DictaState {
    return this.state;
  }

  uiohook(): UiohookModule | null {
    return this.env.uiohook();
  }
  trusted(): boolean {
    return this.env.trusted();
  }

  private set(s: DictaStatus): void {
    this.state = s.state;
    if (this.doneTimer) clearTimeout(this.doneTimer);
    this.doneTimer = null;
    this.emit('status', s);
    if (s.state === 'done' || s.state === 'error') {
      this.doneTimer = setTimeout(
        () => {
          if (this.state === s.state) this.set({ state: 'idle' });
        },
        s.state === 'done' ? 1000 : 3000,
      );
    }
  }

  /** Statut d'une dictée en traitement : n'écrase jamais l'état d'une dictée en cours d'enregistrement. */
  private setBg(s: DictaStatus): void {
    if (this.state === 'recording' || this.starting) return;
    this.set(s);
  }

  /** 1er appui sur fn : micro pré-ouvert (pré-écoute). */
  arm(): void {
    if (this.state === 'recording') return;
    this.recorder.arm(); // pas de warmup LLM ici (fn sert aussi à d'autres raccourcis)
  }

  /** Router ↔ dicta.log : bascules et échecs de nettoyage (raison par fournisseur) journalisés. */
  private router(): RouterExtras | null {
    const r = routerModule() as (ReturnType<typeof routerModule> & RouterExtras) | null;
    if (r && !this.routerLogHooked) {
      this.routerLogHooked = true;
      r.setRouterLogger?.((msg, data) => log(msg, data));
    }
    return r;
  }

  /** Début de dictée : rafraîchit l'état des quotas (sonde légère, connexion TLS ouverte) avant le nettoyage. */
  private warmup(): void {
    const r = this.router();
    if (Date.now() - this.lastWarmup < 10000) return;
    this.lastWarmup = Date.now();
    void r?.warmup?.().catch(() => {});
  }

  private starting = false;
  private stopRequested = false;

  async begin(opts: BeginOptions = {}): Promise<void> {
    if (this.state === 'recording' || this.starting) return;
    this.starting = true;
    this.stopRequested = false;
    this.beginOpts = opts;
    try {
      await this.doBegin();
    } finally {
      this.starting = false;
    }
    if (this.stopRequested) void this.end();
  }

  /** Abandonne l'enregistrement courant (jamais le traitement des dictées précédentes) et repart d'un Take neuf. */
  private resetStreaming(): void {
    const t = this.t;
    if (t.specTimer) clearTimeout(t.specTimer);
    t.recAbort?.abort();
    t.llmSpec?.ac.abort();
    this.t = newTake();
  }

  private async doBegin(): Promise<void> {
    // b4 : une dictée précédente en cours de traitement n'est PAS abandonnée ; seul l'arrêt du micro est attendu.
    if (this.stopping) await this.stopping;
    const wm = String(settings.get('whisper.model'));
    if (!whisperModel(wm)) {
      // Premier lancement : le modèle est encore en route → message clair plutôt qu'un échec silencieux.
      if (!modelDownloader.downloading) ensureWhisperModel(wm);
      const pc = modelDownloader.current?.percent;
      this.set({ state: 'error', message: `Modèle de transcription en cours de téléchargement${pc ? ` (${pc} %)` : ''}` });
      return;
    }
    if (!(await this.recorder.ensureMicPermission())) {
      this.set({ state: 'error', message: 'Micro non autorisé (Réglages Système › Confidentialité › Micro)' });
      return;
    }
    this.resetStreaming();
    const t = this.t;
    t.startedAt = Date.now();
    t.rewrite = this.beginOpts.rewrite;
    this.warmup();
    // Contexte (app active, noms à l'écran, texte avant le curseur) : en parallèle de l'ouverture du micro.
    t.ctxP = snapshotContext().then((c) => (t.ctx = c), () => undefined);
    void learner.flush();
    this.set({ state: 'recording', level: 0 });
    try {
      await this.recorder.start();
    } catch (e) {
      this.set({ state: 'error', message: 'Micro indisponible' });
      log('pipeline: start', e);
      return;
    }
    // La durée maximale (audio.maxDurationMin, 20 min par défaut) est gérée par le recorder : événement 'limit'.
  }

  private lang(): string {
    return String(settings.get('general.language') || 'fr');
  }

  /** Prompt Whisper : base + mots prioritaires et vocabulaire (f4) + noms à l'écran + fin du texte déjà validé. */
  private prompt(t: Take, context: string): string | undefined {
    const base = this.lang() === 'fr' ? String(settings.get('whisper.prompt') || '') : '';
    const vocab = settings.get('cleaning.vocabulary');
    const prio = settings.get('dictionary.priority');
    const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
    const names = whisperNamesPrompt([...asList(prio), ...asList(vocab)], t.ctx?.names ?? [], this.lang());
    // vocabulaire + noms (bornés) avant le texte déjà validé, qui reste au plus près de l'audio
    const p = `${base} ${names} ${context.slice(-200)}`.replace(/\s+/g, ' ').trim();
    return p || undefined;
  }

  private committedText(t: Take, upTo = t.jobs.length): Promise<string> {
    return Promise.all(t.jobs.slice(0, upTo).filter((j) => j.commit).map((j) => j.text)).then((x) => join(x));
  }

  /** Transcription en file (whisper-server est séquentiel), contexte = texte déjà validé. */
  private enqueue(t: Take, wav: Buffer, ctxUpTo: number, signal: AbortSignal): Promise<string> {
    const p = t.queue.then(async () => {
      if (signal.aborted) throw new Error('aborted');
      const ctx = await this.committedText(t, ctxUpTo);
      const w = await transcribe(wav, { model: String(settings.get('whisper.model')), language: this.lang(), prompt: this.prompt(t, ctx), signal });
      return w.text;
    });
    t.queue = p.catch(() => undefined);
    return p;
  }

  private onSegment(wav: Buffer, start: number, end: number, commit: boolean): void {
    const t = this.t;
    if (this.state !== 'recording' || !t.recAbort) return;
    // une spéculation non validée est remplacée par tout nouveau segment
    const idx = t.jobs.findIndex((j) => !j.commit);
    if (idx >= 0) t.jobs.splice(idx, 1);
    const job: SegJob = { start, end, commit, text: Promise.resolve(''), done: false, failed: false };
    job.text = this.enqueue(t, wav, t.jobs.length, t.recAbort.signal);
    t.jobs.push(job);
    const signal = t.recAbort.signal;
    job.text.then(
      async () => {
        job.done = true;
        if (signal.aborted || t.jobs[t.jobs.length - 1] !== job) return;
        // dernier segment connu : texte partiel + nettoyage spéculatif
        const raw = join(await Promise.all(t.jobs.map((j) => j.text)));
        t.partial = raw;
        if (this.state === 'recording' && this.t === t) this.emit('status', { state: 'recording', partialText: raw } satisfies DictaStatus);
        if (!t.rewrite) this.speculateLLM(t, raw);
      },
      (e) => {
        job.done = true;
        job.failed = true;
        if (!signal.aborted) log('pipeline: segment non transcrit', e instanceof Error ? e.message : e);
      },
    );
  }

  /** Nettoyage mémoïsé : la spéculation et le relâchement partagent le même appel pour un même texte. */
  private cleanOnce(t: Take, raw: string, speculative = false): Promise<CleanResult> {
    if (t.llmSpec?.raw === raw) return t.llmSpec.result;
    t.llmSpec?.ac.abort();
    this.router();
    const ac = new AbortController();
    const lang = this.lang();
    // `speculative` (option du router, transmise telle quelle par cleaner.ts) : pas de course parallèle
    // ni de dernier recours → une pause ne brûle pas le quota dont l'appel final aura besoin.
    const opts: CleanOptions & { speculative: boolean } = { ...this.dictionaryOpts(), language: lang === 'auto' ? undefined : lang, signal: ac.signal, speculative };
    // `context.before` (≤ 300 car. avant le curseur) : raccord de majuscule / ponctuation (m14, côté LLM).
    const result = t.ctxP.then((context) => (ac.signal.aborted ? ({ text: raw, provider: 'passthrough', model: '', latencyMs: 0 } as CleanResult) : clean(raw, context ? { ...opts, context: settings.get('context.readBefore' as never) === false ? { ...context, before: undefined } : context } : opts)));
    result.catch(() => undefined);
    t.llmSpec = { raw, ac, result };
    return result;
  }

  /**
   * Nettoyage spéculatif à chaque pause, mais limité : chaque appel consomme le quota (tokens/min)
   * même s'il est annulé ensuite. Le 09/10, une dictée de 73 s a lancé ~17 nettoyages spéculatifs et
   * épuisé Groq, Z.ai, OpenRouter et Gemini → texte collé brut. Désormais : au plus un lancement par
   * intervalle (3 s + 10 % de la durée déjà dictée, reporté sur la dernière pause), et aucun quand il
   * reste moins de 2 fournisseurs cloud disponibles (le quota est gardé pour l'appel final).
   * Et seulement si le 1er fournisseur cloud a encore des tokens/minute pour la spéculation ET l'appel
   * final (≥ 2 × l'estimation, router.canSpeculate) : sinon la spéculation ferait basculer l'appel final
   * de Groq (~0,9 s) vers un fournisseur plus lent.
   */
  private speculateLLM(t: Take, raw: string): void {
    if (!raw) return;
    if (t.specTimer) clearTimeout(t.specTimer);
    t.specTimer = null;
    const usable = this.router()?.usableCloudProviders?.();
    if (usable && usable.length < 2) return;
    const interval = 3000 + 0.1 * (Date.now() - t.startedAt);
    const wait = t.lastSpecAt + interval - Date.now();
    const run = () => {
      t.specTimer = null;
      if (this.state !== 'recording' || this.t !== t || t.partial !== raw) return;
      // Évalué au moment du lancement (le quota a pu bouger pendant l'attente).
      const lang = this.lang();
      const { priorityVocabulary, promptMode, toneByApp } = this.dictionaryOpts();
      if (this.router()?.canSpeculate?.(raw, { language: lang === 'auto' ? undefined : lang, priorityVocabulary, promptMode, toneByApp })?.ok === false) return;
      t.lastSpecAt = Date.now();
      void this.cleanOnce(t, raw, true);
    };
    if (wait <= 0) run();
    else t.specTimer = setTimeout(run, wait);
  }

  /**
   * Échap. Pendant l'enregistrement : arrête la capture mais GARDE l'audio et le texte déjà transcrit (c6) ;
   * sinon annule le(s) traitement(s) en cours, également gardés. Émet 'recoverable' (« Dictée annulée · Récupérer »,
   * 5 s) ; recoverLast() la récupère.
   */
  cancel(): void {
    if (this.starting) {
      this.stopRequested = false;
      this.starting = false;
    }
    if (this.state === 'recording') {
      const t = this.t;
      this.resetStreaming();
      log('pipeline: annulé (Échap), dictée gardée');
      this.set({ state: 'idle' });
      const p = this.recorder
        .stop()
        .then((rec) => {
          if (rec.durationMs < MIN_DURATION_MS || (rec.voicedMs > 0 && rec.voicedMs < MIN_VOICED_MS)) return;
          if (t.rewrite) return; // instruction de réécriture : rien à garder
          const audio = saveAudio(t.id, rec.full);
          const d = recordPending({ id: t.id, status: 'cancelled', raw: t.partial, audio, durationMs: rec.durationMs });
          this.emit('recoverable', { id: d.id, status: 'cancelled', until: Date.now() + 5000 });
        })
        .catch((e) => {
          log('pipeline: arrêt après Échap', e instanceof Error ? e.message : e);
          this.recorder.cancel();
        });
      this.stopping = p.finally(() => {
        if (this.stopping) this.stopping = null;
      });
    } else if (this.procs.size) {
      for (const p of this.procs) if (!p.inserted) p.ac.abort();
      log('pipeline: traitement annulé (Échap)', { n: this.procs.size });
      this.set({ state: 'idle' });
    }
  }

  /** Texte brut final : segments déjà transcrits + fin (ou spéculation si rien n'a été dit depuis). */
  private async finalRaw(t: Take, rec: RecordingResult, signal: AbortSignal): Promise<{ raw: string; specHit: boolean; fallback: boolean }> {
    const jobs = t.jobs;
    const committed = jobs.filter((j) => j.commit);
    const spec = jobs.find((j) => !j.commit);
    const texts = await Promise.allSettled(jobs.map((j) => j.text));
    const failed = texts.some((x) => x.status === 'rejected');
    const opts = { model: String(settings.get("whisper.model")), language: this.lang(), signal };
    if (!failed) {
      const committedText = join(committed.map((j) => (texts[jobs.indexOf(j)] as PromiseFulfilledResult<string>).value));
      // spéculation valide : même début, et aucune parole après sa fin
      if (spec && spec.start === rec.tailStart && spec.end + FRAME >= rec.lastSpeechEnd) {
        const specText = (texts[jobs.indexOf(spec)] as PromiseFulfilledResult<string>).value;
        return { raw: join([committedText, specText]), specHit: true, fallback: false };
      }
      // fin déjà couverte par le dernier segment validé
      if (!rec.tail) return { raw: committedText, specHit: !!committed.length, fallback: false };
      try {
        const w = await transcribe(rec.tail, { ...opts, prompt: this.prompt(t, committedText) });
        return { raw: join([committedText, w.text]), specHit: false, fallback: false };
      } catch (e) {
        if (signal.aborted) throw e;
        log('pipeline: fin non transcrite → repli', e);
      }
    }
    const w = await transcribe(rec.full, { ...opts, prompt: this.prompt(t, '') });
    return { raw: w.text, specHit: false, fallback: true };
  }

  /** f4 : mots prioritaires + règles de remplacement, appliquées par le router (src/llm/format.ts), repli réseau compris. */
  private dictionaryOpts(): Pick<CleanOptions, 'replacements' | 'priorityVocabulary' | 'promptMode' | 'toneByApp' | 'frenchTypography'> {
    const prio = settings.get('dictionary.priority');
    const g = (k: string): unknown => settings.get(k as never);
    const mode = g('cleaning.promptMode');
    return {
      replacements: parseReplacements(settings.get('dictionary.replacements')),
      priorityVocabulary: Array.isArray(prio) ? prio.map(String) : [],
      // Réglages Style (m12, m13, m6) : lus à chaque dictée.
      promptMode: mode === 'on' || mode === 'off' ? mode : 'auto',
      toneByApp: g('cleaning.toneByApp') !== false,
      frenchTypography: g('cleaning.frenchTypography') !== false,
    };
  }

  /** Snippets (f1) sur le texte nettoyé : égal ou commençant par le déclencheur. */
  private finalizeText(text: string): { text: string; snippet: boolean } {
    const sn = matchSnippet(text, loadSnippets());
    if (sn != null) return { text: sn, snippet: true };
    // Préférences apprises de tes corrections (src/main/prefs.ts) : déterministes, visibles et annulables dans Style.
    let out = text;
    try { out = applyLearnedPreferences(text); } catch { /* jamais bloquant */ }
    return { text: out, snippet: false };
  }

  private pasteMode(): 'paste' | 'clipboard' {
    return settings.get('general.insertMode') === 'clipboard' || !this.env.trusted() ? 'clipboard' : 'paste';
  }

  /** Colle `text` dans l'app active (délai de restauration du presse-papiers adapté à l'app, c8). */
  async pasteText(text: string, bundleId?: string, prev?: ReturnType<typeof snapshot>): Promise<'pasted' | 'clipboard'> {
    const mode = this.pasteMode();
    return insertText(text, {
      mode,
      restoreDelayMs: restoreDelayFor(bundleId, Number(settings.get('paste.restoreDelayMs') || 250), settings.get('paste.restoreDelayOverrides')),
      uiohook: this.env.uiohook(),
      trusted: this.env.trusted(),
      nativePaste: this.env.nativePaste,
      prev,
    });
  }

  async end(): Promise<void> {
    if (this.starting) {
      this.stopRequested = true; // relâché pendant l'ouverture du micro
      return;
    }
    if (this.state !== 'recording') return;
    const tRelease = Date.now();
    const ac = new AbortController();
    const prior = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((r) => (release = r));
    const startedAt = this.t.startedAt;
    const recordMs = tRelease - startedAt;
    const pasteMode = this.pasteMode();
    const prevClip = pasteMode === 'paste' ? snapshot() : null; // en parallèle de la transcription
    const proc: Proc = { take: this.t, ac, raw: '', inserted: false };
    this.procs.add(proc);
    const aborted = () => ac.signal.aborted;

    let rec: RecordingResult | null = null;
    let t = this.t;
    let audioSaved = false;
    const persistAudio = (): boolean => (audioSaved ||= !!rec && saveAudio(t.id, rec.full));
    /** c6 : traitement interrompu (Échap) ou en échec → audio + texte gardés, récupérables. */
    const keep = (status: 'cancelled' | 'failed'): void => {
      if (!rec || t.rewrite) return;
      const d = recordPending({ id: t.id, status, raw: proc.raw, audio: persistAudio(), durationMs: rec.durationMs });
      this.emit('recoverable', { id: d.id, status, until: Date.now() + (status === 'cancelled' ? 5000 : 15000) });
    };

    try {
      this.set({ state: 'transcribing', partialText: this.t.partial || undefined });
      // Arrêt du micro, puis détachement du Take : le prochain appui démarre une dictée indépendante.
      const stage = (async () => {
        try {
          return await this.recorder.stop();
        } finally {
          t = this.t;
          this.t = newTake();
        }
      })();
      this.stopping = stage.then(
        () => undefined,
        () => undefined,
      );
      proc.take = t;
      try {
        rec = await stage;
      } finally {
        this.stopping = null;
      }
      const tAudio = Date.now();
      if (t.specTimer) clearTimeout(t.specTimer);
      t.specTimer = null;
      if (rec.durationMs < MIN_DURATION_MS || (!rec.lastSpeechEnd && !t.jobs.length) || (rec.voicedMs > 0 && rec.voicedMs < MIN_VOICED_MS && !t.jobs.length)) {
        log(`pipeline: trop court ou silencieux (${rec.durationMs} ms), ignoré`);
        this.setBg({ state: 'idle' });
        return;
      }
      const { raw, specHit, fallback } = await this.finalRaw(t, rec, ac.signal);
      proc.raw = raw;
      const tWhisper = Date.now();
      if (aborted()) return keep('cancelled');
      // Rien entendu (ou hallucination typique de Whisper sur un silence) : rien n'est collé ni enregistré.
      if (!raw || (isSilenceHallucination(raw) && rec.voicedMs < 2500)) {
        log(`pipeline: rien entendu (${rec.voicedMs} ms de parole) → ignoré${raw ? ` [${textForLog(raw)}]` : ''}`);
        this.setBg({ state: 'idle' });
        return;
      }

      // ---- Réécriture de la sélection (f2) : la parole est la consigne ----
      if (t.rewrite) {
        this.setBg({ state: 'cleaning' });
        await t.ctxP;
        const out = await performRewrite(t.rewrite.selected, raw, { language: this.lang(), signal: ac.signal, context: t.ctx });
        if (aborted()) return;
        await prior;
        if (aborted()) return;
        this.setBg({ state: 'inserting' });
        await this.pasteText(out, t.ctx?.bundleId);
        proc.inserted = true;
        this.setBg({ state: 'done' });
        this.emit('rewrite', { selChars: t.rewrite.selected.length, outChars: out.length });
        return;
      }

      // ---- Snippet dit tel quel (f1) : pas d'appel IA ----
      const exact = matchSnippet(raw, loadSnippets(), true);
      let c: CleanResult;
      let llmHit = false;
      if (exact != null) {
        t.llmSpec?.ac.abort();
        c = snippetResult(exact);
      } else {
        this.setBg({ state: 'cleaning', partialText: raw });
        llmHit = t.llmSpec?.raw === raw; // déjà lancé pendant la pause
        c = await this.cleanOnce(t, raw);
        if (aborted()) return keep('cancelled');
        if (llmHit && c.provider === 'passthrough' && (c.model === '' || c.model === 'fallbackClean')) {
          // Spéculation interrompue OU tombée en texte brut (quotas épuisés au moment de la pause) :
          // vrai appel, avec course parallèle et dernier recours sur tous les fournisseurs.
          log(`pipeline: nettoyage spéculatif sans résultat (${c.model || 'interrompu'}) → nouvel essai complet`);
          t.llmSpec = null;
          c = await this.cleanOnce(t, raw);
        }
        if (c.provider === 'passthrough' && (c.model === '' || c.model === 'fallbackClean')) {
          log(`pipeline: ⚠ TEXTE BRUT collé — aucun fournisseur n'a pu nettoyer (${c.model || 'router indisponible / délai'}) ; détail : lignes « router: » ci-dessus`);
        }
        const fin = this.finalizeText(c.text);
        if (fin.snippet) c = snippetResult(fin.text);
        else c = { ...c, text: fin.text } as CleanResult;
      }
      t.llmSpec = null;
      const tClean = Date.now();
      if (aborted()) return keep('cancelled');

      // Les collages restent dans l'ordre des dictées.
      await prior;
      if (aborted()) return keep('cancelled');
      this.setBg({ state: 'inserting', message: c.provider });
      // Bloc-notes vocal (f10) : la dictée part dans le bloc-notes au lieu d'être collée.
      const toNotepad = notepadIntercept((k) => settings.get(k as never), c.text, t.ctx?.bundleId);
      const inserted = toNotepad ? 'clipboard' : await this.pasteText(c.text, t.ctx?.bundleId, prevClip ?? undefined);
      proc.inserted = true;
      const tPasted = Date.now();
      if (inserted === 'pasted') learner.noteInserted(c.text, t.ctx?.bundleId); // piste 4 : relecture du champ plus tard
      // « Inséré » tout de suite (la restauration du presse-papiers se fait en arrière-plan)
      this.setBg({
        state: 'done',
        message: inserted === 'clipboard' ? 'Copié dans le presse-papiers (⌘V)' : undefined,
      });
      const res: DictationResult = {
        raw,
        text: c.text,
        provider: c.provider,
        model: c.model,
        inserted,
        id: t.id,
        audio: persistAudio(),
        durationMs: rec.durationMs,
        timings: {
          recordMs,
          whisperMs: tWhisper - tAudio,
          cleanMs: tClean - tWhisper,
          insertMs: tPasted - tClean,
          totalAfterReleaseMs: tPasted - tRelease,
          speechEndToPastedMs: tPasted - rec.speechEndAt,
        },
      };
      log('timing', {
        audioMs: rec.durationMs,
        segments: t.jobs.filter((j) => j.commit).length,
        specHit,
        llmHit,
        fallback,
        speechEnd_to_release: tRelease - Math.round(rec.speechEndAt),
        release_to_audio: tAudio - tRelease,
        whisper_after_release: tWhisper - tAudio,
        llm_after_whisper: tClean - tWhisper,
        paste: tPasted - tClean,
        release_to_pasted: tPasted - tRelease,
        speechEnd_to_pasted: Math.round(tPasted - rec.speechEndAt),
        provider: c.provider,
        interrupted: rec.interrupted,
      });
      // Pas le texte dicté (données personnelles) : longueurs seulement, sauf DICTA_LOG_TEXT=1.
      log('pipeline: résultat', { ...res, raw: textForLog(res.raw), text: textForLog(res.text) });
      this.emit('result', res);
    } catch (e) {
      if (aborted()) return keep('cancelled');
      log('pipeline: erreur', e);
      keep('failed'); // c3/c6 : l'audio reste, retry(id) possible
      this.setBg({ state: 'error', message: e instanceof Error ? e.message.slice(0, 120) : 'Erreur' });
    } finally {
      this.procs.delete(proc);
      release();
    }
  }

  // ---- c3 : réessayer / c4 : version brute / c6 : récupérer ----

  /** Retranscrit l'audio gardé de la dictée `id` et renettoie ; met l'historique à jour ; colle si `insert`. */
  async retry(id: string, opts: { insert?: boolean } = {}): Promise<Dictation> {
    const d = getById(id);
    if (!d) throw new Error('Dictée introuvable');
    const wav = readAudio(id);
    if (!wav) throw new Error('Audio non conservé pour cette dictée');
    if (this.retrying.has(id)) throw new Error('Réessai déjà en cours');
    const wm = String(settings.get('whisper.model'));
    if (!whisperModel(wm)) throw new Error('Modèle de transcription indisponible');
    this.retrying.add(id);
    try {
      const tmp = newTake();
      const w = await transcribe(wav, { model: wm, language: this.lang(), prompt: this.prompt(tmp, '') });
      const raw = w.text.trim();
      if (!raw) throw new Error('Aucune parole détectée');
      this.router();
      const lang = this.lang();
      const exact = matchSnippet(raw, loadSnippets(), true);
      let c: CleanResult = exact != null ? (snippetResult(exact)) : await clean(raw, { ...this.dictionaryOpts(), language: lang === 'auto' ? undefined : lang });
      if (exact == null) c = { ...c, text: this.finalizeText(c.text).text } as CleanResult;
      const upd = updateDictation(id, { raw, text: c.text, provider: c.provider, model: c.model, status: 'ok' }) ?? d;
      log('pipeline: réessai', { id, raw: textForLog(raw), text: textForLog(c.text), provider: c.provider });
      if (opts.insert) await this.pasteText(c.text);
      this.emit('retried', { id });
      return upd;
    } finally {
      this.retrying.delete(id);
    }
  }

  /** c4 : colle la version brute (Whisper) de la dictée `id` (défaut : la dernière collée). `undoFirst` : ⌘Z avant. */
  async pasteRaw(id?: string, opts: { undoFirst?: boolean } = {}): Promise<boolean> {
    const d = id ? getById(id) : getRecent().find((x) => (x.status ?? 'ok') === 'ok' && x.raw);
    if (!d?.raw) return false;
    const undo = opts.undoFirst ?? settings.get('paste.rawUndoFirst') === true;
    if (undo && Date.now() - Date.parse(d.at) < 60_000 && this.env.trusted()) {
      try {
        await sendCommandKey('z', this.env.uiohook());
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        log('pipeline: ⌘Z avant version brute échoué', e instanceof Error ? e.message : e);
      }
    }
    const ctx = await snapshotContext().catch(() => undefined);
    await this.pasteText(d.raw, ctx?.bundleId);
    return true;
  }

  /** c6 : colle la dernière dictée annulée (Échap) ou en échec (< 30 min), retranscrite si besoin. */
  async recoverLast(): Promise<Dictation | null> {
    const d = getRecent().find((x) => (x.status === 'cancelled' || x.status === 'failed') && Date.now() - Date.parse(x.at) < 30 * 60_000);
    if (!d?.id) return null;
    let cur: Dictation = d;
    if (!cur.text) {
      if (!cur.audio) return null;
      cur = await this.retry(d.id);
    }
    const ctx = await snapshotContext().catch(() => undefined);
    await this.pasteText(cur.text, ctx?.bundleId);
    return updateDictation(d.id, { status: 'ok' }) ?? cur;
  }
}

/** Résultat « sans IA » d'un snippet (provider affiché : snippet). */
function snippetResult(text: string): CleanResult {
  return { text, provider: 'snippet', model: '', latencyMs: 0 } as unknown as CleanResult;
}

function join(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

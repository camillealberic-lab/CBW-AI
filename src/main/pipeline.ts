import { EventEmitter } from 'node:events';
import type { CleanOptions, CleanResult, DictaState, DictaStatus } from '../shared/types';
import { clean, routerModule } from './cleaner';
import { insertText, snapshot } from './insert';
import { log, textForLog } from './paths';
import { Recorder, type RecordingResult } from './recorder';
import { settings } from './settings';
import { ensureWhisperModel, transcribe, whisperModel } from './whisper';
import { modelDownloader } from './whisperModels';

type UiohookModule = typeof import('uiohook-napi');

/** Exports du router (src/llm/router.ts) utilisés ici, en plus de ceux typés dans cleaner.ts. */
interface RouterExtras {
  warmup?: () => Promise<void>;
  setRouterLogger?: (fn: ((msg: string, data?: unknown) => void) | null) => void;
  usableCloudProviders?: () => string[];
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
const MAX_DURATION_MS = 5 * 60 * 1000;
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
}

interface SegJob {
  start: number;
  end: number;
  commit: boolean;
  text: Promise<string>;
  done: boolean;
  failed: boolean;
}

/**
 * Pipeline : record → whisper → cleanTranscript → insert, optimisé pour la latence :
 *  - les segments (pauses détectées par le VAD) sont transcrits PENDANT la dictée ;
 *  - à chaque pause, transcription spéculative de la fin + nettoyage LLM spéculatif :
 *    si rien n'a été dit depuis, le texte est déjà prêt au relâchement ;
 *  - repli sur l'enregistrement complet si un segment échoue.
 * Événements : 'status' (DictaStatus), 'result' (DictationResult).
 */
export class Pipeline extends EventEmitter {
  private state: DictaState = 'idle';
  private recStartedAt = 0;
  private maxTimer: NodeJS.Timeout | null = null;
  private doneTimer: NodeJS.Timeout | null = null;
  private abort: AbortController | null = null;
  private lastWarmup = 0;

  // streaming
  private jobs: SegJob[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private partial = '';
  private llmSpec: { raw: string; ac: AbortController; result: Promise<CleanResult> } | null = null;
  private recAbort: AbortController | null = null;
  /** Nettoyage spéculatif : dernier lancement + report (anti-rafale, économise le quota des fournisseurs). */
  private lastSpecAt = 0;
  private specTimer: NodeJS.Timeout | null = null;
  private routerLogHooked = false;

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
      if (this.state === 'recording') this.emit('status', { state: 'recording', level, partialText: this.partial || undefined } satisfies DictaStatus);
    });
    recorder.on('started', (info) => log('recorder: démarré', info));
    recorder.on('segment', (wav: Buffer, start: number, end: number, commit: boolean) => this.onSegment(wav, start, end, commit));
  }

  get current(): DictaState {
    return this.state;
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

  async begin(): Promise<void> {
    if (this.state === 'recording' || this.starting) return;
    this.starting = true;
    this.stopRequested = false;
    try {
      await this.doBegin();
    } finally {
      this.starting = false;
    }
    if (this.stopRequested) void this.end();
  }

  private resetStreaming(): void {
    if (this.specTimer) clearTimeout(this.specTimer);
    this.specTimer = null;
    this.lastSpecAt = 0;
    this.recAbort?.abort();
    this.recAbort = new AbortController();
    this.llmSpec?.ac.abort();
    this.llmSpec = null;
    this.jobs = [];
    this.queue = Promise.resolve();
    this.partial = '';
  }

  private async doBegin(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'done' && this.state !== 'error') {
      // une dictée précédente est encore en cours de traitement : on l'abandonne
      this.abort?.abort();
    }
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
    this.recStartedAt = Date.now();
    this.warmup();
    this.resetStreaming();
    this.set({ state: 'recording', level: 0 });
    try {
      await this.recorder.start();
    } catch (e) {
      this.set({ state: 'error', message: 'Micro indisponible' });
      log('pipeline: start', e);
      return;
    }
    this.maxTimer = setTimeout(() => {
      log('pipeline: durée max atteinte');
      this.env.onForcedStop();
      void this.end();
    }, MAX_DURATION_MS);
  }

  private lang(): string {
    return String(settings.get('general.language') || 'fr');
  }

  private prompt(context: string): string | undefined {
    const base = this.lang() === 'fr' ? String(settings.get('whisper.prompt') || '') : '';
    const p = `${base} ${context.slice(-200)}`.trim();
    return p || undefined;
  }

  private committedText(upTo = this.jobs.length): Promise<string> {
    return Promise.all(this.jobs.slice(0, upTo).filter((j) => j.commit).map((j) => j.text)).then((t) => join(t));
  }

  /** Transcription en file (whisper-server est séquentiel), contexte = texte déjà validé. */
  private enqueue(wav: Buffer, ctxUpTo: number, signal: AbortSignal): Promise<string> {
    const p = this.queue.then(async () => {
      if (signal.aborted) throw new Error('aborted');
      const ctx = await this.committedText(ctxUpTo);
      const w = await transcribe(wav, { model: String(settings.get('whisper.model')), language: this.lang(), prompt: this.prompt(ctx), signal });
      return w.text;
    });
    this.queue = p.catch(() => undefined);
    return p;
  }

  private onSegment(wav: Buffer, start: number, end: number, commit: boolean): void {
    if (this.state !== 'recording' || !this.recAbort) return;
    // une spéculation non validée est remplacée par tout nouveau segment
    const idx = this.jobs.findIndex((j) => !j.commit);
    if (idx >= 0) this.jobs.splice(idx, 1);
    const job: SegJob = { start, end, commit, text: Promise.resolve(''), done: false, failed: false };
    job.text = this.enqueue(wav, this.jobs.length, this.recAbort.signal);
    this.jobs.push(job);
    const signal = this.recAbort.signal;
    job.text.then(
      async () => {
        job.done = true;
        if (signal.aborted || this.jobs[this.jobs.length - 1] !== job) return;
        // dernier segment connu : texte partiel + nettoyage spéculatif
        const raw = join(await Promise.all(this.jobs.map((j) => j.text)));
        this.partial = raw;
        if (this.state === 'recording') this.emit('status', { state: 'recording', partialText: raw } satisfies DictaStatus);
        this.speculateLLM(raw);
      },
      (e) => {
        job.done = true;
        job.failed = true;
        if (!signal.aborted) log('pipeline: segment non transcrit', e instanceof Error ? e.message : e);
      },
    );
  }

  /** Nettoyage mémoïsé : la spéculation et le relâchement partagent le même appel pour un même texte. */
  private cleanOnce(raw: string, speculative = false): Promise<CleanResult> {
    if (this.llmSpec?.raw === raw) return this.llmSpec.result;
    this.llmSpec?.ac.abort();
    this.router();
    const ac = new AbortController();
    const lang = this.lang();
    // `speculative` (option du router, transmise telle quelle par cleaner.ts) : pas de course parallèle
    // ni de dernier recours → une pause ne brûle pas le quota dont l'appel final aura besoin.
    const opts: CleanOptions & { speculative: boolean } = { language: lang === 'auto' ? undefined : lang, signal: ac.signal, speculative };
    const result = clean(raw, opts);
    result.catch(() => undefined);
    this.llmSpec = { raw, ac, result };
    return result;
  }

  /**
   * Nettoyage spéculatif à chaque pause, mais limité : chaque appel consomme le quota (tokens/min)
   * même s'il est annulé ensuite. Le 09/10, une dictée de 73 s a lancé ~17 nettoyages spéculatifs et
   * épuisé Groq, Z.ai, OpenRouter et Gemini → texte collé brut. Désormais : au plus un lancement par
   * intervalle (3 s + 10 % de la durée déjà dictée, reporté sur la dernière pause), et aucun quand il
   * reste moins de 2 fournisseurs cloud disponibles (le quota est gardé pour l'appel final).
   */
  private speculateLLM(raw: string): void {
    if (!raw) return;
    if (this.specTimer) clearTimeout(this.specTimer);
    this.specTimer = null;
    const usable = this.router()?.usableCloudProviders?.();
    if (usable && usable.length < 2) return;
    const interval = 3000 + 0.1 * (Date.now() - this.recStartedAt);
    const wait = this.lastSpecAt + interval - Date.now();
    const run = () => {
      this.specTimer = null;
      if (this.state !== 'recording' || this.partial !== raw) return;
      this.lastSpecAt = Date.now();
      void this.cleanOnce(raw, true);
    };
    if (wait <= 0) run();
    else this.specTimer = setTimeout(run, wait);
  }

  /** Échap : abandonne l'enregistrement (ou le traitement en cours) sans rien coller. */
  cancel(): void {
    if (this.starting) {
      this.stopRequested = false;
      this.starting = false;
    }
    if (this.state === 'recording') {
      if (this.maxTimer) clearTimeout(this.maxTimer);
      this.maxTimer = null;
      this.recorder.cancel();
      this.resetStreaming();
      log('pipeline: annulé (Échap)');
      this.set({ state: 'idle' });
    } else if (this.state === 'transcribing' || this.state === 'cleaning') {
      this.abort?.abort();
      this.resetStreaming();
      log('pipeline: traitement annulé (Échap)');
      this.set({ state: 'idle' });
    }
  }

  /** Texte brut final : segments déjà transcrits + fin (ou spéculation si rien n'a été dit depuis). */
  private async finalRaw(rec: RecordingResult, signal: AbortSignal): Promise<{ raw: string; specHit: boolean; fallback: boolean }> {
    const jobs = this.jobs;
    const committed = jobs.filter((j) => j.commit);
    const spec = jobs.find((j) => !j.commit);
    const texts = await Promise.allSettled(jobs.map((j) => j.text));
    const failed = texts.some((t) => t.status === 'rejected');
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
        const w = await transcribe(rec.tail, { ...opts, prompt: this.prompt(committedText) });
        return { raw: join([committedText, w.text]), specHit: false, fallback: false };
      } catch (e) {
        if (signal.aborted) throw e;
        log('pipeline: fin non transcrite → repli', e);
      }
    }
    const w = await transcribe(rec.full, { ...opts, prompt: this.prompt('') });
    return { raw: w.text, specHit: false, fallback: true };
  }

  async end(): Promise<void> {
    if (this.starting) {
      this.stopRequested = true; // relâché pendant l'ouverture du micro
      return;
    }
    if (this.state !== 'recording') return;
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.maxTimer = null;
    const tRelease = Date.now();
    const recordMs = tRelease - this.recStartedAt;
    const ac = new AbortController();
    this.abort = ac;
    const aborted = () => ac.signal.aborted;
    const pasteMode = settings.get('general.insertMode') === 'clipboard' || !this.env.trusted() ? 'clipboard' : 'paste';
    const prevClip = pasteMode === 'paste' ? snapshot() : null; // en parallèle de la transcription

    try {
      this.set({ state: 'transcribing', partialText: this.partial || undefined });
      const rec = await this.recorder.stop();
      const tAudio = Date.now();
      if (rec.durationMs < MIN_DURATION_MS || (!rec.lastSpeechEnd && !this.jobs.length) || (rec.voicedMs > 0 && rec.voicedMs < MIN_VOICED_MS && !this.jobs.length)) {
        log(`pipeline: trop court ou silencieux (${rec.durationMs} ms), ignoré`);
        this.set({ state: 'idle' });
        return;
      }
      const { raw, specHit, fallback } = await this.finalRaw(rec, ac.signal);
      const tWhisper = Date.now();
      if (aborted()) return;
      // Rien entendu (ou hallucination typique de Whisper sur un silence) : rien n'est collé ni enregistré.
      if (!raw || (isSilenceHallucination(raw) && rec.voicedMs < 2500)) {
        log(`pipeline: rien entendu (${rec.voicedMs} ms de parole) → ignoré${raw ? ` [${textForLog(raw)}]` : ''}`);
        this.set({ state: 'idle' });
        return;
      }

      this.set({ state: 'cleaning', partialText: raw });
      const llmHit = this.llmSpec?.raw === raw; // déjà lancé pendant la pause
      let c = await this.cleanOnce(raw);
      if (aborted()) return;
      if (this.specTimer) clearTimeout(this.specTimer);
      this.specTimer = null;
      if (llmHit && c.provider === 'passthrough' && (c.model === '' || c.model === 'fallbackClean')) {
        // Spéculation interrompue OU tombée en texte brut (quotas épuisés au moment de la pause) :
        // vrai appel, avec course parallèle et dernier recours sur tous les fournisseurs.
        log(`pipeline: nettoyage spéculatif sans résultat (${c.model || 'interrompu'}) → nouvel essai complet`);
        this.llmSpec = null;
        c = await this.cleanOnce(raw);
      }
      if (c.provider === 'passthrough' && (c.model === '' || c.model === 'fallbackClean')) {
        log(`pipeline: ⚠ TEXTE BRUT collé — aucun fournisseur n'a pu nettoyer (${c.model || 'router indisponible / délai'}) ; détail : lignes « router: » ci-dessus`);
      }
      this.llmSpec = null;
      const tClean = Date.now();
      if (aborted()) return;

      this.set({ state: 'inserting', message: c.provider });
      const inserted = await insertText(c.text, {
        mode: pasteMode,
        restoreDelayMs: Number(settings.get('paste.restoreDelayMs') || 250),
        uiohook: this.env.uiohook(),
        trusted: this.env.trusted(),
        nativePaste: this.env.nativePaste,
        prev: prevClip ?? undefined,
      });
      const tPasted = Date.now();
      // « Inséré » tout de suite (la restauration du presse-papiers se fait en arrière-plan)
      this.set({
        state: 'done',
        message: inserted === 'clipboard' ? 'Copié dans le presse-papiers (⌘V)' : undefined,
      });
      const res: DictationResult = {
        raw,
        text: c.text,
        provider: c.provider,
        model: c.model,
        inserted,
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
        segments: this.jobs.filter((j) => j.commit).length,
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
      });
      // Pas le texte dicté (données personnelles) : longueurs seulement, sauf DICTA_LOG_TEXT=1.
      log('pipeline: résultat', { ...res, raw: textForLog(res.raw), text: textForLog(res.text) });
      this.emit('result', res);
    } catch (e) {
      if (aborted()) return;
      log('pipeline: erreur', e);
      this.set({ state: 'error', message: e instanceof Error ? e.message.slice(0, 120) : 'Erreur' });
    } finally {
      if (this.abort === ac) this.abort = null;
      this.recAbort = null;
      this.jobs = [];
      this.partial = '';
    }
  }
}

function join(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

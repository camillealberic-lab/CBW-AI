import { app, clipboard, shell } from 'electron';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaStatus } from '../shared/types';
import { routerModule } from './cleaner';
import { dataDir, log } from './paths';
import type { Recorder } from './recorder';
import { settings } from './settings';
import { playSound } from './sounds';
import { transcribe, whisperModel } from './whisper';
import { diaModels, diarize } from './diarization';
import { assignSpeakers, replaceSpeaker, speakerSplits, speakerTranscript, type NoteSegment, type SpeakerTurn } from './speakers';
import { readWavSlice, repairWav, WavWriter } from './wavfile';

/**
 * Mode « prise de notes » (docs/APP_API.md) : longue session → transcription au fil de l'eau
 * (segments du VAD, ajoutés à ~/.dicta-ai/notes/<id>.txt dès qu'ils sont transcrits) → organizeNotes()
 * (src/llm/notes.ts, via le bundle du router) → ~/Documents/CBW AI/Notes/<date> — <titre>.md.
 *
 * Notes v2 (docs/APP_API.md › « Notes v2 ») : micro + son du Mac ; WAV complet de la session écrit au fil
 * de l'eau (<id>.wav = mélange, <id>.mic.wav / <id>.sys.wav = pistes séparées) ; à l'arrêt, diarisation
 * locale (src/main/diarization.ts, processus séparé) → chaque segment Whisper horodaté reçoit son locuteur
 * → transcription « [mm:ss] Personne 2 : texte » donnée à organizeNotes ; segments dans <id>.json.
 */

export interface NoteMeta {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  words: number;
  path: string;
  provider: string;
}
export interface NoteProgress {
  state: 'recording' | 'paused' | 'transcribing' | 'organizing' | 'done' | 'error';
  elapsedMs: number;
  words: number;
  step?: number;
  total?: number;
  message?: string;
  noteId?: string;
}

const notesDataDir = (): string => {
  const d = path.join(dataDir(), 'notes');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const indexFile = (): string => path.join(notesDataDir(), 'index.json');

/**
 * Identifiant de note venant d'un renderer : format généré par start() (« 20261008T214706-r1q7 »).
 * Vérifié AVANT de construire un chemin (sinon « ../config » viserait ~/.dicta-ai/config.json).
 */
const NOTE_ID_RE = /^[0-9]{8}T[0-9]{6}-[a-z0-9]{1,8}$/;
export function assertNoteId(id: unknown): string {
  if (typeof id !== 'string' || !NOTE_ID_RE.test(id)) throw new Error('Identifiant de note invalide');
  return id;
}
/** Chemin enregistré dans l'index (Markdown) : seulement s'il est dans le dossier des notes. */
function insideNotesOut(p: unknown): p is string {
  if (typeof p !== 'string' || !p) return false;
  const root = path.resolve(notesOutDir()) + path.sep;
  return path.resolve(p).startsWith(root) && p.endsWith('.md');
}
const txtFile = (id: string): string => path.join(notesDataDir(), `${id}.txt`);
const jsonFile = (id: string): string => path.join(notesDataDir(), `${id}.json`);
const wavFiles = (id: string) => ({
  mix: path.join(notesDataDir(), `${id}.wav`),
  mic: path.join(notesDataDir(), `${id}.mic.wav`),
  sys: path.join(notesDataDir(), `${id}.sys.wav`),
});
function removeAudio(id: string): void {
  for (const f of Object.values(wavFiles(id))) fs.rmSync(f, { force: true });
}

/** <id>.json : segments horodatés (locuteur si la diarisation a réussi) + infos de diarisation. */
interface NoteData {
  segments: NoteSegment[];
  diarized: boolean;
  mode?: 'two-track' | 'mix';
  diarizationMs?: number;
}
function readData(id: string): NoteData | null {
  try {
    return JSON.parse(fs.readFileSync(jsonFile(id), 'utf8')) as NoteData;
  } catch {
    return null;
  }
}
function writeData(id: string, d: NoteData): void {
  const tmp = jsonFile(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1));
  fs.renameSync(tmp, jsonFile(id));
}
/** Mots prononcés (sans les repères « [mm:ss] Personne n : »). */
const spokenWords = (t: string): number => countWords(t.replace(/^\[\d+:\d\d\] [^:\n]{1,60} : /gm, ''));
/** ~/Documents/CBW AI/Notes (DICTA_NOTES_DIR pour les tests). */
export const notesOutDir = (): string => {
  const d = process.env.DICTA_NOTES_DIR || path.join(app.getPath('documents'), 'CBW AI', 'Notes');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const countWords = (t: string): number => (t.match(/\S+/g) ?? []).length;
const pad = (n: number): string => String(n).padStart(2, '0');
export const fmtClock = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

function readIndex(): NoteMeta[] {
  try {
    const v = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeIndex(list: NoteMeta[]): void {
  const tmp = indexFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, indexFile());
}
function upsert(meta: NoteMeta): void {
  const list = readIndex().filter((m) => m.id !== meta.id);
  list.unshift(meta);
  writeIndex(list);
}

function mdName(createdAt: Date, title: string): string {
  const d = createdAt;
  // Titre proposé par le LLM : aucun séparateur de chemin ni caractère de contrôle, pas de « . » en tête.
  const clean = title.replace(/[\/\\:*?"<>|\x00-\x1f\x7f]+/g, '-').replace(/\s+/g, ' ').replace(/^[.\s-]+/, '').trim().slice(0, 80) || 'Note';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())} — ${clean}.md`;
}
function uniquePath(dir: string, name: string, current?: string): string {
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p) && p !== current; i++) p = path.join(dir, name.replace(/\.md$/, ` (${i}).md`));
  return p;
}

function rawNote(transcript: string, createdAt: Date, reason: string): { markdown: string; title: string } {
  const title = `Note du ${createdAt.toLocaleDateString('fr-FR')} ${pad(createdAt.getHours())}h${pad(createdAt.getMinutes())}`;
  return { title, markdown: `# ${title}\n\n> ${reason}\n\n## Transcription\n\n${transcript.trim() || '(vide)'}\n` };
}

type OrganizeFn = (t: string, o: { signal?: AbortSignal; onProgress?: (s: number, n: number) => void }) => Promise<{
  markdown: string;
  title: string;
  provider: string;
  model: string;
  parts: number;
  latencyMs: number;
}>;

/** Session de prise de notes (VAD → segments Whisper au fil de l'eau). */
export class NoteSession extends EventEmitter {
  private recorder: Recorder;
  readonly kind = 'note' as const;
  state: 'idle' | 'recording' | 'paused' | 'transcribing' | 'organizing' = 'idle';
  private id = '';
  private createdAt = new Date();
  private texts: string[] = [];
  /** Segments transcrits, horodatés sur la chronologie du WAV de session (ms). */
  private segs: { startMs: number; endMs: number; text: string }[] = [];
  private wavs: { mix: WavWriter; mic: WavWriter | null; sys: WavWriter | null } | null = null;
  private queue: Promise<void> = Promise.resolve();
  private ac: AbortController | null = null;
  private activeMs = 0;
  private runningSince = 0;
  private tick: NodeJS.Timeout | null = null;
  private level = 0;
  private lastLevelEmit = 0;
  /** Mesures (autotest) : instants clés de la dernière note. */
  timings = { stopAt: 0, transcribedAt: 0, diarizedAt: 0, organizedAt: 0, segments: 0, segMs: 0, diarizeMs: 0, diarizeMode: '', speakers: 0 };

  constructor(recorder: Recorder) {
    super();
    this.recorder = recorder;
    recorder.on('segment', (wav: Buffer, a: number, b: number, commit: boolean) => {
      if (commit && (this.state === 'recording' || this.state === 'paused')) this.enqueue(wav, a, b);
    });
    // WAV de session (notes) : blocs de 0,5 s, le dernier arrive juste avant le résultat de stop().
    recorder.on('pcm', (mix: Buffer, mic: Buffer | null, sys: Buffer | null) => {
      const w = this.wavs;
      if (!w) return;
      w.mix.append(mix);
      if (mic && sys) {
        const f = wavFiles(this.id);
        // pistes ouvertes au 1er bloc qui en contient (alignées : toujours depuis le début de la session)
        if (!w.mic && w.mix.samples === mix.length / 2) {
          w.mic = new WavWriter(f.mic);
          w.sys = new WavWriter(f.sys);
        }
        w.mic?.append(mic);
        w.sys?.append(sys);
      }
    });
    recorder.on('level', (v: number) => {
      if (this.state !== 'recording') return;
      this.level = v;
      const now = Date.now();
      if (now - this.lastLevelEmit > 66) {
        this.lastLevelEmit = now;
        this.emitOverlay();
      }
    });
  }

  get active(): boolean {
    return this.state === 'recording' || this.state === 'paused';
  }
  get busy(): boolean {
    return this.state !== 'idle';
  }
  elapsed(): number {
    return this.activeMs + (this.state === 'recording' && this.runningSince ? Date.now() - this.runningSince : 0);
  }
  private words(): number {
    return countWords(this.texts.join(' '));
  }
  /** Fichier de transcription au fil de l'eau. */
  private txt(id: string): string {
    return txtFile(id);
  }
  get currentId(): string {
    return this.id;
  }
  get currentLevel(): number {
    return this.state === 'recording' ? this.level : 0;
  }
  get startedAt(): Date {
    return this.createdAt;
  }
  /** Transcription accumulée (segments déjà passés par Whisper). */
  transcriptSoFar(): string {
    return this.texts.join(' ').trim();
  }
  wordCount(): number {
    return this.words();
  }

  private progress(p: Omit<NoteProgress, 'elapsedMs' | 'words'> & Partial<NoteProgress>): void {
    this.emit('progress', { elapsedMs: this.elapsed(), words: this.words(), ...p } satisfies NoteProgress);
  }
  private status(s: DictaStatus): void {
    this.emit('status', s);
  }
  private emitOverlay(): void {
    const el = this.elapsed();
    const paused = this.state === 'paused';
    const tag = 'NOTE';
    this.status({
      state: 'recording',
      mode: this.kind,
      elapsedMs: el,
      level: paused ? 0 : this.level,
      message: paused ? `${tag} · PAUSE ${fmtClock(el)}` : `${tag} · ${fmtClock(el)}`,
    });
  }

  private enqueue(wav: Buffer, a = 0, b = 0): void {
    const id = this.id;
    const startMs = Math.round(a / 16);
    const endMs = Math.round(b / 16);
    const signal = this.ac!.signal;
    this.queue = this.queue.then(async () => {
      if (signal.aborted || id !== this.id) return;
      const ctx = this.texts.join(' ').slice(-200);
      const lang = String(settings.get('general.language') || 'fr');
      const base = lang === 'fr' ? String(settings.get('whisper.prompt') || '') : '';
      try {
        const t0 = Date.now();
        const w = await transcribe(wav, { model: String(settings.get('whisper.model')), language: lang, prompt: `${base} ${ctx}`.trim() || undefined, signal });
        this.timings.segments++;
        this.timings.segMs += Date.now() - t0;
        if (signal.aborted || !w.text) return;
        this.texts.push(w.text);
        this.segs.push({ startMs, endMs, text: w.text });
        fs.appendFileSync(this.txt(id), w.text + '\n'); // rien n'est perdu en cas de plantage
        if (this.active) this.progress({ state: this.state as 'recording' | 'paused' });
      } catch (e) {
        if (!signal.aborted) log(`${this.kind}: segment non transcrit`, e instanceof Error ? e.message : e);
      }
    });
  }

  async start(opts: { feed?: boolean } = {}): Promise<void> {
    if (this.busy) return;
    const tag = this.kind;
    if (!whisperModel(String(settings.get('whisper.model')))) {
      this.status({ state: 'error', message: 'Modèle de transcription en cours de téléchargement' });
      this.progress({ state: 'error', message: 'Modèle de transcription en cours de téléchargement' });
      return;
    }
    if (!opts.feed && !(await this.recorder.ensureMicPermission())) {
      this.status({ state: 'error', message: 'Micro non autorisé (Réglages Système › Confidentialité › Micro)' });
      this.progress({ state: 'error', message: 'Micro non autorisé' });
      return;
    }
    this.createdAt = new Date();
    this.id = `${this.createdAt.toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${Math.random().toString(36).slice(2, 6)}`;
    this.texts = [];
    this.segs = [];
    this.queue = Promise.resolve();
    this.ac = new AbortController();
    this.activeMs = 0;
    this.timings = { stopAt: 0, transcribedAt: 0, diarizedAt: 0, organizedAt: 0, segments: 0, segMs: 0, diarizeMs: 0, diarizeMode: '', speakers: 0 };
    fs.writeFileSync(this.txt(this.id), '');
    const isNote = this.kind === 'note';
    if (isNote) {
      this.wavs = { mix: new WavWriter(wavFiles(this.id).mix), mic: null, sys: null };
      // modèles de voix (~46 Mo) prêts avant la fin de la note
      if (settings.get('notes.diarization') !== false) void diaModels.ensure();
    }
    try {
      await this.recorder.start({
        note: true,
        feed: opts.feed,
        wav: isNote,
        systemAudio: isNote && settings.get('notes.systemAudio') !== false,
        probeSys: process.env.DICTA_SELFTEST_SYS_PROBE === '1',
      });
    } catch (e) {
      this.closeWavs();
      removeAudio(this.id);
      log(`${tag}: micro`, e);
      this.state = 'idle';
      this.status({ state: 'error', message: 'Micro indisponible' });
      this.progress({ state: 'error', message: 'Micro indisponible' });
      return;
    }
    this.state = 'recording';
    this.runningSince = Date.now();
    playSound('note-start');
    log(`${tag}: démarrée`, this.id);
    this.emit('active', true);
    this.tick = setInterval(() => {
      this.emitOverlay();
      this.progress({ state: this.state === 'paused' ? 'paused' : 'recording' });
    }, 1000);
    this.emitOverlay();
    this.progress({ state: 'recording', noteId: this.id });
  }

  pause(): void {
    if (this.state !== 'recording') return;
    this.activeMs += Date.now() - this.runningSince;
    this.runningSince = 0;
    this.state = 'paused';
    this.recorder.pause();
    this.emitOverlay();
    this.progress({ state: 'paused' });
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'recording';
    this.runningSince = Date.now();
    this.recorder.resume();
    this.emitOverlay();
    this.progress({ state: 'recording' });
  }

  private endRecording(): void {
    if (this.state === 'recording') this.activeMs += Date.now() - this.runningSince;
    this.runningSince = 0;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.emit('active', false);
  }

  private closeWavs(): void {
    const w = this.wavs;
    this.wavs = null;
    if (!w) return;
    for (const x of [w.mix, w.mic, w.sys]) {
      try {
        x?.close();
      } catch (e) {
        log('note: WAV non finalisé', e);
      }
    }
  }

  cancel(): void {
    if (!this.busy) return;
    this.endRecording();
    this.ac?.abort();
    this.recorder.cancel();
    this.state = 'idle';
    this.closeWavs();
    removeAudio(this.id);
    fs.rmSync(this.txt(this.id), { force: true });
    log(`${this.kind}: annulée`, this.id);
    this.status({ state: 'idle' });
    this.progress({ state: 'error', message: 'Note annulée' });
  }

  /** Arrête l'enregistrement, termine la transcription, organise et enregistre la note. Renvoie son id. */
  async stop(opts: { title?: string; markers?: { atMs: number; text: string }[] } = {}): Promise<string | null> {
    if (!this.active) return null;
    const id = this.id;
    this.endRecording();
    playSound('stop');
    this.state = 'transcribing';
    this.timings.stopAt = Date.now();
    this.status({ state: 'transcribing', mode: 'note', message: 'Note · transcription…' });
    this.progress({ state: 'transcribing' });
    try {
      const rec = await this.recorder.stop();
      if (rec.tail) this.enqueue(rec.tail, rec.tailStart, rec.total);
    } catch (e) {
      log('note: fin de capture', e);
    }
    await this.queue;
    this.closeWavs();
    this.timings.transcribedAt = Date.now();
    const plain = this.texts.join(' ').trim();
    log(`note: transcription finie ${this.timings.transcribedAt - this.timings.stopAt} ms après l'arrêt, ${countWords(plain)} mots`);
    const transcript = countWords(plain) >= 3 ? await this.speakers(id) : plain;
    this.timings.diarizedAt = Date.now();
    // Repères tapés pendant la session : donnés à l'organisation (priorité de structure) ; titre imposé s'il a été saisi.
    const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    const marks = (opts.markers ?? []).map((m) => `- [${fmt(m.atMs)}] ${m.text}`).join('\n');
    const forOrganize = marks
      ? `${transcript}\n\nRepères notés par la personne pendant la session (à utiliser pour structurer la note, sans rien ajouter) :\n${marks}`
      : transcript;
    // Rien entendu (et aucun repère) : aucune note n'est enregistrée, la pastille repasse au repos.
    if (countWords(plain) < 3 && !marks) {
      try { fs.unlinkSync(txtFile(id)); } catch { /* déjà absent */ }
      removeAudio(id);
      fs.rmSync(jsonFile(id), { force: true });
      log('note: rien entendu → aucune note enregistrée');
      this.state = 'idle';
      this.status({ state: 'idle' });
      this.progress({ state: 'error', elapsedMs: this.elapsed(), words: 0, message: 'Rien entendu : aucune note enregistrée.' });
      return null;
    }
    try {
      return await this.organizeAndSave(id, forOrganize, this.createdAt, this.elapsed(), undefined, opts.title);
    } finally {
      this.state = 'idle';
      if (settings.get('notes.keepAudio') !== true) removeAudio(id);
    }
  }

  /**
   * Segments à cheval sur deux locuteurs (changement de voix sans pause nette pour le VAD) : coupés au
   * changement et re-transcrits morceau par morceau depuis le WAV de session (peu de segments concernés).
   */
  private async splitAtTurns(segs: { startMs: number; endMs: number; text: string }[], turns: SpeakerTurn[], wav: string) {
    const out: { startMs: number; endMs: number; text: string }[] = [];
    const lang = String(settings.get('general.language') || 'fr');
    const base = lang === 'fr' ? String(settings.get('whisper.prompt') || '') : '';
    let n = 0;
    const t0 = Date.now();
    for (const s of segs) {
      const cuts = speakerSplits(s, turns);
      if (!cuts.length) {
        out.push(s);
        continue;
      }
      const bounds = [s.startMs, ...cuts, s.endMs];
      const pieces: { startMs: number; endMs: number; text: string }[] = [];
      try {
        for (let i = 0; i + 1 < bounds.length; i++) {
          const ctx = [...out, ...pieces].map((x) => x.text).join(' ').slice(-200);
          const w = await transcribe(readWavSlice(wav, bounds[i], bounds[i + 1]), {
            model: String(settings.get('whisper.model')),
            language: lang,
            prompt: `${base} ${ctx}`.trim() || undefined,
            signal: this.ac?.signal,
          });
          if (w.text) pieces.push({ startMs: bounds[i], endMs: bounds[i + 1], text: w.text });
        }
        if (!pieces.length) throw new Error('morceaux vides');
        out.push(...pieces);
        n++;
      } catch (e) {
        log('note: re-transcription d’un segment à cheval impossible', e instanceof Error ? e.message : e);
        out.push(s);
      }
    }
    if (n) log(`note: ${n} segment(s) à cheval sur deux locuteurs re-transcrits en ${Date.now() - t0} ms`);
    return out;
  }

  /**
   * Diarisation du WAV de session → segments étiquetés (<id>.json) → transcription « [mm:ss] Locuteur : texte ».
   * Désactivée, indisponible ou en échec : transcription simple (sans étiquettes), sans erreur.
   */
  private async speakers(id: string): Promise<string> {
    const plain = this.texts.join(' ').trim();
    const segs = this.segs.slice();
    const f = wavFiles(id);
    let data: NoteData = { segments: segs.map((s) => ({ ...s, speaker: '' })), diarized: false };
    let out = plain;
    if (settings.get('notes.diarization') !== false && fs.existsSync(f.mix)) {
      this.status({ state: 'transcribing', mode: 'note', message: 'Note · séparation des voix…' });
      this.progress({ state: 'transcribing', message: diaModels.downloading ? 'Téléchargement du modèle de voix…' : 'Séparation des voix…' });
      const onDl = (p: { percent: number; state: string }) => {
        if (p.state === 'downloading') this.progress({ state: 'transcribing', message: `Téléchargement du modèle de voix… ${p.percent} %` });
      };
      diaModels.on('progress', onDl);
      try {
        const two = fs.existsSync(f.mic) && fs.existsSync(f.sys);
        const r = await diarize({ mix: f.mix, ...(two ? { mic: f.mic, sys: f.sys } : {}) }, this.ac?.signal);
        if (r && r.turns.length) {
          const split = await this.splitAtTurns(segs, r.turns, f.mix);
          const labeled = assignSpeakers(split, r.turns);
          const names = new Set(labeled.map((s) => s.speaker));
          this.timings.diarizeMs = r.ms;
          this.timings.diarizeMode = r.mode;
          this.timings.speakers = names.size;
          log(`note: diarisation ${r.mode} en ${r.ms} ms pour ${r.audioSec.toFixed(0)} s d'audio (${((r.ms / 10 / r.audioSec) || 0).toFixed(1)} %), ${names.size} locuteur(s) : ${[...names].join(', ')}, ${r.rssMB ?? '?'} Mo`);
          data = { segments: labeled, diarized: true, mode: r.mode, diarizationMs: r.ms };
          out = speakerTranscript(labeled);
        } else log('note: diarisation indisponible → transcription sans locuteurs');
      } catch (e) {
        log('note: diarisation impossible → transcription sans locuteurs', e);
      } finally {
        diaModels.off('progress', onDl);
      }
    }
    try {
      writeData(id, data);
    } catch (e) {
      log('note: segments non enregistrés', e);
    }
    return out;
  }

  private async organizeAndSave(id: string, transcript: string, createdAt: Date, durationMs: number, existing?: NoteMeta, forcedTitle?: string): Promise<string> {
    this.state = 'organizing';
    this.status({ state: 'cleaning', mode: 'note', message: 'Note · organisation…' });
    this.progress({ state: 'organizing', elapsedMs: durationMs, words: spokenWords(transcript), noteId: id });
    const organize: OrganizeFn | undefined = routerModule()?.organizeNotes;
    let markdown: string;
    let title: string;
    let provider = 'passthrough';
    let warn = '';
    const t0 = Date.now();
    if (!countWords(transcript)) {
      ({ markdown, title } = rawNote('', createdAt, 'Rien n’a été entendu pendant cette session.'));
    } else if (!organize) {
      ({ markdown, title } = rawNote(transcript, createdAt, 'Organisation indisponible : transcription brute.'));
      warn = 'Organisation indisponible : transcription brute enregistrée';
    } else {
      try {
        const r = await organize(transcript, {
          signal: this.ac?.signal,
          onProgress: (step, total) => this.progress({ state: 'organizing', elapsedMs: durationMs, words: spokenWords(transcript), step, total, noteId: id }),
        });
        markdown = r.markdown;
        title = r.title;
        provider = r.provider;
        log(`note: organisée par ${r.provider} (${r.model}) en ${r.latencyMs} ms, ${r.parts} partie(s)`);
      } catch (e) {
        log('note: organisation impossible', e);
        ({ markdown, title } = rawNote(transcript, createdAt, 'Aucun moteur IA disponible pour organiser la note (ajoute une clé dans Réglages, puis « Réorganiser »).'));
        warn = 'Organisation impossible : transcription brute enregistrée';
      }
    }
    this.timings.organizedAt = Date.now();
    if (forcedTitle) {
      title = forcedTitle;
      markdown = /^#\s.+$/m.test(markdown) ? markdown.replace(/^#\s.+$/m, `# ${forcedTitle}`) : `# ${forcedTitle}\n\n${markdown}`;
    }
    const file = uniquePath(notesOutDir(), mdName(createdAt, title), existing?.path);
    fs.writeFileSync(file, markdown.endsWith('\n') ? markdown : markdown + '\n');
    if (insideNotesOut(existing?.path) && existing!.path !== file) fs.rmSync(existing!.path, { force: true });
    const meta: NoteMeta = { id, title, createdAt: createdAt.toISOString(), durationMs, words: spokenWords(transcript), path: file, provider };
    upsert(meta);
    log(`note: enregistrée ${file} (organisation ${Date.now() - t0} ms)`);
    this.state = 'idle';
    this.status({ state: warn ? 'error' : 'done', mode: 'note', message: warn || `Note prête : ${title}` });
    // Confirmation brève, puis retour au repos (sinon « Note prête » restait affiché sur la pastille).
    setTimeout(() => { if (this.state === 'idle') this.status({ state: 'idle' }); }, warn ? 3000 : 1500);
    this.progress({ state: 'done', elapsedMs: durationMs, words: meta.words, noteId: id, message: warn || undefined });
    this.emit('saved', meta);
    return id;
  }

  async reorganize(rawId: string): Promise<void> {
    const id = assertNoteId(rawId);
    if (this.busy) throw new Error('Une note est déjà en cours');
    const meta = readIndex().find((m) => m.id === id);
    if (!meta) throw new Error('Note introuvable');
    const d = readData(id);
    const transcript = d?.diarized ? speakerTranscript(d.segments) : fs.readFileSync(txtFile(id), 'utf8').replace(/\n+/g, ' ').trim();
    this.ac = new AbortController();
    try {
      await this.organizeAndSave(id, transcript, new Date(meta.createdAt), meta.durationMs, meta);
    } finally {
      this.state = 'idle';
    }
  }

  /** Au démarrage : transcriptions orphelines (plantage pendant une note) → note brute récupérée. */
  recoverOrphans(): void {
    const known = new Set(readIndex().map((m) => m.id));
    // WAV de sessions interrompues : supprimés (ou réparés si « garder l'audio »).
    for (const f of fs.readdirSync(notesDataDir())) {
      const m = f.match(/^(.+?)(\.mic|\.sys)?\.wav$/);
      if (!m || m[1] === this.id) continue;
      const p = path.join(notesDataDir(), f);
      if (settings.get('notes.keepAudio') === true) {
        if (!known.has(m[1])) repairWav(p);
      } else fs.rmSync(p, { force: true });
    }
    for (const f of fs.readdirSync(notesDataDir())) {
      const m = f.match(/^(.+)\.txt$/);
      if (!m || known.has(m[1]) || m[1] === this.id) continue;
      const transcript = fs.readFileSync(path.join(notesDataDir(), f), 'utf8').replace(/\n+/g, ' ').trim();
      if (!transcript) {
        fs.rmSync(path.join(notesDataDir(), f), { force: true });
        continue;
      }
      const createdAt = fs.statSync(path.join(notesDataDir(), f)).birthtime;
      const { markdown } = rawNote(transcript, createdAt, 'Note récupérée après une interruption — utilise « Réorganiser » pour la mettre en forme.');
      const title = `Note récupérée du ${createdAt.toLocaleDateString('fr-FR')}`;
      const file = uniquePath(notesOutDir(), mdName(createdAt, title));
      fs.writeFileSync(file, markdown.replace(/^# .*$/m, `# ${title}`));
      upsert({ id: m[1], title, createdAt: createdAt.toISOString(), durationMs: 0, words: countWords(transcript), path: file, provider: 'passthrough' });
      log('note: récupérée', m[1]);
    }
  }
}

// ── accès aux notes enregistrées
export const listNotes = (): NoteMeta[] => readIndex();

export function getNote(rawId: string): { meta: NoteMeta; markdown: string; transcript: string; segments?: NoteSegment[] } {
  const id = assertNoteId(rawId);
  const meta = readIndex().find((m) => m.id === id);
  if (!meta) throw new Error('Note introuvable');
  const read = (p: string) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };
  const d = readData(id);
  const md = insideNotesOut(meta.path) ? read(meta.path) : '';
  if (d?.diarized) return { meta, markdown: md, transcript: speakerTranscript(d.segments), segments: d.segments };
  return { meta, markdown: md, transcript: read(txtFile(id)).trim() };
}

/**
 * Renomme un locuteur (« Personne 2 » → « Claire ») dans la note Markdown et les segments.
 * Le titre (index) et le nom du fichier ne changent pas.
 */
export function renameSpeaker(rawId: string, from: string, to: string): void {
  const id = assertNoteId(rawId);
  const meta = readIndex().find((m) => m.id === id);
  if (!meta) throw new Error('Note introuvable');
  const a = String(from ?? '').trim().slice(0, 60);
  // Nouveau nom : texte simple (ni retour à la ligne, ni « : » qui casserait « [mm:ss] Nom : », ni Markdown actif).
  const b = String(to ?? '')
    .replace(/[\x00-\x1f\x7f:#*_`\[\]<>|\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!a || !b || a === b) return;
  const d = readData(id);
  // Seul un locuteur existant peut être renommé (sinon « from » remplacerait n'importe quel mot de la note).
  if (!d?.diarized || !d.segments.some((s) => s.speaker === a)) return;
  if (d) {
    d.segments = d.segments.map((s) => (s.speaker === a ? { ...s, speaker: b } : s));
    writeData(id, d);
  }
  if (insideNotesOut(meta.path) && fs.existsSync(meta.path)) {
    const md = fs.readFileSync(meta.path, 'utf8');
    // la ligne de titre (# …) reste telle quelle : le titre de l'index ne change pas
    const out = md
      .split('\n')
      .map((l) => (/^#\s/.test(l) ? l : replaceSpeaker(l, a, b)))
      .join('\n');
    if (out !== md) fs.writeFileSync(meta.path, out);
  }
  log('note: locuteur renommé', id); // pas les noms : données personnelles
}

export function deleteNote(rawId: string): void {
  const id = assertNoteId(rawId);
  const list = readIndex();
  const meta = list.find((m) => m.id === id);
  if (insideNotesOut(meta?.path)) fs.rmSync(meta!.path, { force: true });
  fs.rmSync(txtFile(id), { force: true });
  fs.rmSync(jsonFile(id), { force: true });
  removeAudio(id);
  writeIndex(list.filter((m) => m.id !== id));
}

export function revealNote(rawId: string): void {
  const id = assertNoteId(rawId);
  const meta = readIndex().find((m) => m.id === id);
  if (insideNotesOut(meta?.path) && fs.existsSync(meta!.path)) shell.showItemInFolder(meta!.path);
  else void shell.openPath(notesOutDir());
}

export function copyNote(id: string): void {
  clipboard.writeText(getNote(assertNoteId(id)).markdown);
}

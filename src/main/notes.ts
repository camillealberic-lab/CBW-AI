import { app, clipboard, shell } from 'electron';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaStatus } from '../shared/types';
import { applyReplacements } from '../llm/format';
import { routerModule } from './cleaner';
import { whisperNamesPrompt } from './contextNames';
import { vocabularyForNotes } from './learn';
import { dataDir, log } from './paths';
import type { Recorder } from './recorder';
import { settings } from './settings';
import { playSound } from './sounds';
import { transcribe, whisperMeetingServer, whisperModel } from './whisper';
import { diaModels, diarize, type DiarizationResult } from './diarization';
import { addBusyProbe, currentEngine, diarizeWithEngine, initMeetingEngine, transcribeChunk, transcribeFile } from './meetingEngine';
import { dedupeEcho, labelSegments, replaceSpeaker, segmentsFromWords, speakerTranscript, type NoteSegment, type RawSegment, type Source } from './speakers';
import { decodeWav, MEETING_VAD, Segmenter, uncovered, type Chunk, type Span } from '../shared/vad';
import { readWavSlice, repairWav, WavWriter } from './wavfile';
import { decryptBlob, encryptBlob, isEncryptedBlob } from './localcrypto';

/** Étapes après l'arrêt (affichage immédiat de la note) : transcription prête → voix → compte rendu. */
export type NoteStage = 'transcript' | 'voices' | 'summary' | 'done';

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
  /** Étape après l'arrêt (state 'transcribing' / 'organizing') : voir NoteStage. */
  stage?: NoteStage;
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

/**
 * Audio des réunions au repos : chiffré (AES-256-GCM, clé locale, même format que l'historique des dictées,
 * src/main/localcrypto.ts) une fois la note terminée ; gardé `notes.audioDays` jours (défaut 15), puis purgé.
 * La date de référence est celle du fichier (une reprise la remet à jour), conservée au chiffrement.
 */
const keepNoteAudio = (): boolean => settings.get('notes.keepAudio') !== false;
const noteAudioDays = (): number => Math.max(1, Math.min(60, Math.round(Number(settings.get('notes.audioDays'))) || 15));
function encryptFileInPlace(p: string): void {
  try {
    const b = fs.readFileSync(p);
    if (isEncryptedBlob(b)) return;
    const { mtime } = fs.statSync(p);
    const enc = encryptBlob(b);
    if (!enc) {
      fs.rmSync(p, { force: true }); // clé indisponible : pas d'audio en clair au repos (comme l'historique)
      log('note: audio non conservé (chiffrement indisponible)');
      return;
    }
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, enc, { mode: 0o600 });
    fs.renameSync(tmp, p);
    fs.utimesSync(p, mtime, mtime);
  } catch (e) {
    log('note: chiffrement de l’audio impossible', e instanceof Error ? e.message : e);
  }
}
/** Remet un WAV chiffré en clair (reprise d'une note) ; false s'il est illisible. */
function decryptFileInPlace(p: string): boolean {
  try {
    const b = fs.readFileSync(p);
    if (!isEncryptedBlob(b)) return true;
    const plain = decryptBlob(b);
    if (!plain) return false;
    fs.writeFileSync(`${p}.tmp`, plain, { mode: 0o600 });
    fs.renameSync(`${p}.tmp`, p);
    return true;
  } catch {
    return false;
  }
}
/** Fin de note : audio chiffré et gardé (réglage), sinon supprimé. */
function finishAudio(id: string, keep = keepNoteAudio()): void {
  if (!keep) return removeAudio(id);
  for (const f of Object.values(wavFiles(id))) if (fs.existsSync(f)) encryptFileInPlace(f);
}
/**
 * Purge (démarrage + toutes les 6 h) : audio de plus de `notes.audioDays` jours ou réglage coupé → supprimé ;
 * WAV encore en clair d'une note terminée (plantage, ancienne version) → chiffré. `busyId` : note en cours, intouchable.
 */
export function purgeNoteAudio(busyId = ''): number {
  const limit = Date.now() - noteAudioDays() * 86_400_000;
  const keep = keepNoteAudio();
  const known = new Set(readIndex().map((m) => m.id));
  let n = 0;
  for (const f of fs.readdirSync(notesDataDir())) {
    const m = f.match(/^(.+?)(\.mic|\.sys)?\.wav$/);
    if (!m || m[1] === busyId) continue;
    const p = path.join(notesDataDir(), f);
    try {
      if (!keep || !known.has(m[1]) || fs.statSync(p).mtimeMs < limit) {
        fs.rmSync(p, { force: true });
        n++;
      } else encryptFileInPlace(p);
    } catch (e) {
      log('note: purge de l’audio', e instanceof Error ? e.message : e);
    }
  }
  if (n) log(`note: ${n} fichier(s) audio supprimé(s) (conservation ${noteAudioDays()} j)`);
  return n;
}
/** PCM16 complet d'une piste (déchiffré en mémoire), avec un petit cache : la réécoute lit plusieurs passages d'affilée. */
let pcmCache: { p: string; mtime: number; pcm: Buffer; t: NodeJS.Timeout } | null = null;
function trackPcm(p: string): Buffer | null {
  try {
    if (!fs.existsSync(p)) return null;
    const mtime = fs.statSync(p).mtimeMs;
    if (pcmCache && pcmCache.p === p && pcmCache.mtime === mtime) return pcmCache.pcm;
    const b = decryptBlob(fs.readFileSync(p));
    if (!b || b.length <= 44) return null;
    if (pcmCache) clearTimeout(pcmCache.t);
    const pcm = b.subarray(44);
    pcmCache = { p, mtime, pcm, t: setTimeout(() => (pcmCache = null), 60_000) };
    return pcm;
  } catch {
    return null;
  }
}
/** Passage [a, b[ (ms) de l'audio d'une note, en PCM16 mono 16 kHz : mélange si présent, sinon micro + son du Mac. */
export function noteAudioSlice(rawId: string, a: number, b: number): Buffer | null {
  const f = wavFiles(assertNoteId(rawId));
  const cut = (pcm: Buffer | null): Buffer | null => {
    if (!pcm) return null;
    const start = Math.floor((a / 1000) * 16000) * 2;
    const end = Math.min(pcm.length, start + Math.floor(((b - a) / 1000) * 16000) * 2);
    return end > start ? Buffer.from(pcm.subarray(start, end)) : null;
  };
  const mix = cut(trackPcm(f.mix));
  if (mix) return mix;
  const s = cut(trackPcm(f.sys));
  const m = cut(trackPcm(f.mic));
  if (!s || !m) return s ?? m;
  const out = Buffer.alloc(Math.max(s.length, m.length));
  for (let i = 0; i + 1 < out.length; i += 2) {
    const v = (i + 1 < s.length ? s.readInt16LE(i) : 0) + (i + 1 < m.length ? m.readInt16LE(i) : 0);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i);
  }
  return out;
}

/** WAV de session repris en ajout (même format que WavWriter) : reprise d'une note terminée. */
class AppendWav {
  private fd: number | null;
  private bytes: number;
  readonly path: string;
  constructor(file: string) {
    this.path = file;
    this.fd = fs.openSync(file, 'r+');
    this.bytes = Math.max(0, (fs.fstatSync(this.fd).size - 44) & ~1);
  }
  get samples(): number {
    return this.bytes / 2;
  }
  append(pcm16: Buffer): void {
    if (this.fd == null || !pcm16.length) return;
    fs.writeSync(this.fd, pcm16, 0, pcm16.length, 44 + this.bytes);
    this.bytes += pcm16.length;
  }
  close(): void {
    if (this.fd == null) return;
    fs.closeSync(this.fd);
    this.fd = null;
    repairWav(this.path); // en-tête recalculé d'après la taille
  }
}
type SessionWav = Pick<WavWriter, 'samples' | 'append' | 'close'>;

/** <id>.json : segments horodatés (locuteur si la diarisation a réussi) + infos de diarisation. */
interface NoteData {
  segments: NoteSegment[];
  diarized: boolean;
  /** two-track : micro = « Moi » + son du Mac trié ; mix : une seule piste triée (présentiel). */
  mode?: 'two-track' | 'mix';
  diarizationMs?: number;
  /** Nombre de personnes annoncé au démarrage (toi compris). */
  numSpeakers?: number;
  /** Moteur de transcription réellement utilisé : 'fluid' (Parakeet), 'whisper', 'mixed' (repli en cours de note). Absent = notes d'avant le moteur Parakeet (Whisper). */
  engine?: 'fluid' | 'whisper' | 'mixed';
  /** Moteur de séparation des voix : 'fluid' (FluidAudio) ou 'sherpa'. */
  diarizationEngine?: 'fluid' | 'sherpa';
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

/**
 * Prompt Whisper des notes : vocabulaire / noms seulement. Plus de « Dictée en français… » ni des 200 derniers
 * caractères (ils faisaient halluciner et boucler Whisper, 01-audit-code §3.4).
 */
function notesWhisperPrompt(lang: string): string | undefined {
  try {
    return whisperNamesPrompt(vocabularyForNotes().vocabulary, [], lang) || undefined;
  } catch {
    return undefined; // dictionnaire indisponible
  }
}

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

/** Seuil unique « presque rien capté » (audit M2) : sous 15 mots prononcés, aucun fichier dans Documents ni notification ; l'écran propose Garder / Jeter. */
export const TINY_WORDS = 15;

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

/** Découpe une piste du WAV de session comme en direct (réglages réunion), lue par blocs de 30 s. */
function offlineChunks(file: string): Chunk[] {
  const out: Chunk[] = [];
  const seg = new Segmenter((start, end, _c, sp) => out.push({ start, end, from: sp.from, to: sp.to }), MEETING_VAD);
  const size = fs.statSync(file).size;
  const total = Math.floor((size - 44) / 2); // échantillons
  const BLOCK = 16000 * 30;
  for (let at = 0; at < total; at += BLOCK) {
    seg.push(decodeWav(readWavSlice(file, at / 16, Math.min(total, at + BLOCK) / 16)));
    seg.compact();
  }
  const tail = seg.pendingBounds;
  if (tail) out.push({ start: seg.tailFrom, end: seg.length, from: tail.from, to: tail.to });
  return out;
}

/** Session de prise de notes (VAD → segments Whisper au fil de l'eau). */
export class NoteSession extends EventEmitter {
  private recorder: Recorder;
  readonly kind = 'note' as const;
  state: 'idle' | 'recording' | 'paused' | 'transcribing' | 'organizing' = 'idle';
  private id = '';
  private createdAt = new Date();
  private texts: string[] = [];
  /** Segments transcrits, horodatés sur la chronologie du WAV de session (ms). */
  private segs: RawSegment[] = [];
  /** Passages déjà passés par Whisper (parole seule, en échantillons) par piste : sert au rattrapage à l'arrêt. */
  private covered: Record<Source, Span[]> = { mic: [], system: [] };
  private numSpeakers: number | undefined;
  private sawSystem = false;
  /** Moteur choisi au démarrage de la note (macOS ≥ 15 + modèles + binaire → 'fluid', sinon Whisper + sherpa). */
  private engine: 'fluid' | 'whisper' = 'whisper';
  private engineFails = 0;
  private engineFailed = false;
  private chunksBy = { fluid: 0, whisper: 0 };
  private wavs: { mix: SessionWav; mic: SessionWav | null; sys: SessionWav | null } | null = null;
  /**
   * Reprise d'une note terminée (« Reprendre » = même note, même fichier) : `base` = échantillons déjà présents dans
   * le WAV de session (la nouvelle capture s'y ajoute) ; `prev` = segments d'avant quand l'audio n'a pas été gardé
   * (la nouvelle capture est alors traitée seule puis mise à la suite, décalée de `shiftMs`).
   */
  private cont: { meta: NoteMeta; txtSize: number; sizes: Record<string, number> } | null = null;
  private base = 0;
  private prev: { segs: NoteSegment[]; texts: string[]; shiftMs: number; diarized: boolean } | null = null;
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
    initMeetingEngine(); // téléchargement des modèles en arrière-plan (idempotent)
    addBusyProbe(() => this.busy);
    recorder.on('segment', (wav: Buffer, a: number, b: number, commit: boolean, source: Source = 'mic', from = a, to = b) => {
      const o = this.base; // reprise : positions dans le WAV de session complet
      if (commit && (this.state === 'recording' || this.state === 'paused')) this.enqueue(wav, a + o, b + o, source, from + o, to + o);
    });
    // Le micro disparaît / revient : la note continue ; l'UI est prévenue.
    recorder.on('device', (e: { state: string; label: string }) => {
      if (this.active) this.emit('device', e);
    });
    // WAV de session (notes) : blocs de 0,5 s, le dernier arrive juste avant le résultat de stop().
    recorder.on('pcm', (mix: Buffer, mic: Buffer | null, sys: Buffer | null) => {
      const w = this.wavs;
      if (!w) return;
      w.mix.append(mix);
      if (mic && sys) {
        const f = wavFiles(this.id);
        // pistes ouvertes au 1er bloc qui en contient (alignées : toujours depuis le début de la session ; jamais en reprise)
        if (!w.mic && !this.base && w.mix.samples === mix.length / 2) {
          w.mic = new WavWriter(f.mic);
          w.sys = new WavWriter(f.sys);
        }
        w.mic?.append(mic);
        w.sys?.append(sys);
      } else if (w.mic && w.sys) {
        // bloc sans pistes séparées alors qu'elles existent (reprise, son du Mac coupé) : alignement conservé
        w.mic.append(mix);
        w.sys.append(Buffer.alloc(mix.length));
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

  private engineOn(): boolean {
    return this.engine === 'fluid' && !this.engineFailed;
  }
  /** Moteur de transcription effectivement utilisé (pour le JSON de la note). */
  private transcriptionEngine(): 'fluid' | 'whisper' | 'mixed' {
    const { fluid, whisper } = this.chunksBy;
    return fluid && whisper ? 'mixed' : fluid ? 'fluid' : 'whisper';
  }
  /** Segment tel qu'écrit dans <id>.json : sans les mots horodatés du moteur (volumineux, inutiles après l'attribution). */
  private plainSeg(x: RawSegment): NoteSegment {
    const { words: _w, ...rest } = x;
    return { ...rest, speaker: '' };
  }

  /** Un morceau (≤ 25 s) d'une piste : transcrit dans l'ordre d'arrivée par le serveur « réunion ». */
  private enqueue(wav: Buffer, a = 0, b = 0, source: Source = 'mic', from = a, to = b): void {
    const id = this.id;
    const startMs = Math.round(a / 16);
    const endMs = Math.round(b / 16);
    const signal = this.ac!.signal;
    this.queue = this.queue.then(async () => {
      if (signal.aborted || id !== this.id) return;
      const lang = String(settings.get('general.language') || 'fr');
      try {
        const t0 = Date.now();
        let w: { text: string; ms: number; words?: { w: string; s: number; e: number }[] } | null = null;
        if (this.engineOn()) {
          try {
            w = await transcribeChunk(wav, startMs, lang, signal);
            this.engineFails = 0;
            this.chunksBy.fluid++;
          } catch (e) {
            if (signal.aborted) return;
            // Repli sans perte : ce morceau passe par Whisper ; 3 échecs d'affilée = Whisper pour le reste de la note.
            this.engineFails++;
            log(`${this.kind}: moteur Parakeet en erreur (${this.engineFails}) → Whisper pour ce morceau`, e instanceof Error ? e.message : e);
            if (this.engineFails >= 3 && !this.engineFailed) {
              this.engineFailed = true;
              log(`${this.kind}: moteur Parakeet abandonné pour cette note → chaîne classique`);
            }
          }
        }
        if (!w) {
          w = await transcribe(wav, { model: String(settings.get('whisper.model')), language: lang, prompt: notesWhisperPrompt(lang), signal, meeting: true });
          this.chunksBy.whisper++;
        }
        this.timings.segments++;
        this.timings.segMs += Date.now() - t0;
        if (signal.aborted) return;
        this.covered[source].push({ from, to }); // traité (même vide : silence / hallucination filtrée)
        if (!w.text) return;
        if (source === 'system') this.sawSystem = true;
        const seg: RawSegment = { startMs, endMs, text: w.text, source, speechStartMs: Math.round(from / 16), speechEndMs: Math.round(to / 16), ...(w.words?.length ? { words: w.words } : {}) };
        this.texts.push(w.text);
        this.segs.push(seg);
        fs.appendFileSync(this.txt(id), w.text + '\n'); // chaque morceau est sauvegardé dès qu'il est transcrit
        // transcription en direct : texte + piste + horodatage (la voix « Moi » / Personne n vient à l'arrêt)
        const sh = this.prev?.shiftMs ?? 0;
        this.emit('live', { noteId: id, source, startMs: (seg.speechStartMs ?? startMs) + sh, endMs: (seg.speechEndMs ?? endMs) + sh, text: w.text });
        if (this.active) this.progress({ state: this.state as 'recording' | 'paused' });
      } catch (e) {
        // jamais jeté : le passage reste « non couvert » et sera rejoué depuis le WAV à l'arrêt
        if (!signal.aborted) log(`${this.kind}: segment non transcrit (rattrapage à l'arrêt)`, e instanceof Error ? e.message : e);
      }
    });
  }

  /**
   * `numSpeakers` : nombre de personnes présentes, toi compris (imposé au tri des voix). En réunion à deux pistes
   * les autres sont numSpeakers − 1 ; en présentiel (pas de son du Mac utile) toutes sont triées sur le micro.
   */
  async start(opts: { feed?: boolean; numSpeakers?: number; continueId?: string } = {}): Promise<void> {
    if (this.busy) return;
    const contMeta = opts.continueId ? readIndex().find((m) => m.id === assertNoteId(opts.continueId)) : undefined;
    if (opts.continueId && !contMeta) {
      this.progress({ state: 'error', message: 'Note introuvable : reprise impossible' });
      return;
    }
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
    this.createdAt = contMeta ? new Date(contMeta.createdAt) : new Date();
    this.id = contMeta ? contMeta.id : `${this.createdAt.toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${Math.random().toString(36).slice(2, 6)}`;
    this.texts = [];
    this.segs = [];
    this.covered = { mic: [], system: [] };
    this.sawSystem = false;
    this.numSpeakers = Number.isFinite(Number(opts.numSpeakers)) && Number(opts.numSpeakers) >= 1 ? Math.min(30, Math.round(Number(opts.numSpeakers))) : undefined;
    this.queue = Promise.resolve();
    this.ac = new AbortController();
    this.activeMs = 0;
    this.timings = { stopAt: 0, transcribedAt: 0, diarizedAt: 0, organizedAt: 0, segments: 0, segMs: 0, diarizeMs: 0, diarizeMode: '', speakers: 0 };
    this.cont = null;
    this.base = 0;
    this.prev = null;
    if (contMeta) this.prepareContinue(contMeta);
    else fs.writeFileSync(this.txt(this.id), '');
    const isNote = this.kind === 'note';
    // Choix automatique du moteur : macOS ≥ 15 ET modèles présents ET binaire présent → Parakeet/FluidAudio ; sinon Whisper + sherpa.
    this.engineFails = 0;
    this.engineFailed = false;
    this.chunksBy = { fluid: 0, whisper: 0 };
    const choice = isNote ? currentEngine() : { engine: 'whisper' as const, reason: 'dictée' };
    this.engine = choice.engine;
    log(`${tag}: moteur ${choice.engine === 'fluid' ? 'Parakeet + FluidAudio' : 'Whisper + sherpa'} (${choice.reason})`);
    if (isNote) {
      const f = wavFiles(this.id);
      this.wavs = this.base
        ? { mix: new AppendWav(f.mix), mic: fs.existsSync(f.mic) ? new AppendWav(f.mic) : null, sys: fs.existsSync(f.sys) ? new AppendWav(f.sys) : null }
        : { mix: new WavWriter(f.mix), mic: null, sys: null };
      if (!!this.wavs.mic !== !!this.wavs.sys) this.wavs.mic = this.wavs.sys = null; // une seule piste séparée : inutilisable
      // modèles de voix (~46 Mo) prêts avant la fin de la note
      // (moteur Parakeet : ni modèle sherpa ni serveur Whisper au départ ; ils démarrent seulement en cas de repli)
      if (settings.get('notes.diarization') !== false && this.engine !== 'fluid') void diaModels.ensure();
      // serveur de transcription des notes (contexte audio complet, morceaux de 25 s) : chaud avant le 1er morceau
      if (this.engine !== 'fluid') void whisperMeetingServer.start(String(settings.get('whisper.model'))).catch(() => false);
    }
    try {
      await this.recorder.start({
        note: true,
        feed: opts.feed,
        wav: isNote,
        systemAudio: isNote && settings.get('notes.systemAudio') !== false,
        probeSys: process.env.DICTA_SELFTEST_SYS_PROBE === '1',
        echoCancel: (settings as unknown as { get(k: string): unknown }).get('notes.echoCancel') !== false,
      });
    } catch (e) {
      this.closeWavs();
      if (this.cont) this.rollbackContinue();
      else removeAudio(this.id);
      log(`${tag}: micro`, e);
      this.state = 'idle';
      this.status({ state: 'error', message: 'Micro indisponible' });
      this.progress({ state: 'error', message: 'Micro indisponible' });
      return;
    }
    this.state = 'recording';
    this.runningSince = Date.now();
    playSound('note-start');
    log(`${tag}: ${this.cont ? `reprise (${this.base ? 'audio gardé' : 'sans audio'})` : 'démarrée'}`, this.id);
    this.emit('active', true);
    this.tick = setInterval(() => {
      this.emitOverlay();
      this.progress({ state: this.state === 'paused' ? 'paused' : 'recording' });
    }, 1000);
    this.emitOverlay();
    this.progress({ state: 'recording', noteId: this.id });
  }

  /**
   * Reprise d'une note terminée : mêmes id, fichier et date. Audio gardé → remis en clair et complété (toute la note
   * est retranscrite et ses voix recalculées à l'arrêt) ; sinon les segments d'avant sont gardés tels quels et la
   * nouvelle capture vient à la suite.
   */
  private prepareContinue(meta: NoteMeta): void {
    const id = meta.id;
    const f = wavFiles(id);
    const sizeOf = (p: string): number => (fs.existsSync(p) ? fs.statSync(p).size : -1);
    const d = readData(id);
    const old = (d?.segments ?? []).slice().sort((a, b) => a.startMs - b.startMs);
    let txtSize = sizeOf(this.txt(id));
    if (txtSize < 0) {
      fs.writeFileSync(this.txt(id), old.map((x) => x.text).join('\n') + (old.length ? '\n' : ''));
      txtSize = sizeOf(this.txt(id));
    }
    const audioOk = fs.existsSync(f.mix) && [f.mix, f.mic, f.sys].every((p) => !fs.existsSync(p) || decryptFileInPlace(p));
    if (audioOk) for (const p of [f.mix, f.mic, f.sys]) if (fs.existsSync(p)) repairWav(p);
    const sizes = { mix: sizeOf(f.mix), mic: sizeOf(f.mic), sys: sizeOf(f.sys) };
    this.cont = { meta, txtSize, sizes };
    this.activeMs = meta.durationMs || 0;
    this.numSpeakers = d?.numSpeakers ?? this.numSpeakers;
    if (audioOk && sizes.mix > 44) {
      this.base = Math.floor((sizes.mix - 44) / 2);
      this.activeMs = Math.max(this.activeMs, Math.round(this.base / 16));
      // l'ancien texte reste l'aperçu (et le repli) ; la passe finale refait tout le fichier
      this.segs = old.map(({ speaker: _s, ...x }) => ({ ...x }));
      this.texts = old.map((x) => x.text);
      this.covered = { mic: [{ from: 0, to: this.base }], system: [{ from: 0, to: this.base }] };
      this.sawSystem = old.some((x) => x.source === 'system');
    } else {
      if (fs.existsSync(f.mix)) removeAudio(id); // audio illisible : la suite repart d'un fichier neuf
      const texts = old.length ? old.map((x) => x.text) : fs.readFileSync(this.txt(id), 'utf8').split('\n').map((x) => x.trim()).filter(Boolean);
      this.prev = { segs: old, texts, shiftMs: this.activeMs, diarized: !!d?.diarized };
    }
  }
  /** Annulation d'une reprise : la note d'avant revient telle quelle (texte, audio). */
  private rollbackContinue(): void {
    const c = this.cont;
    if (!c) return;
    const f = wavFiles(this.id);
    try {
      if (c.txtSize >= 0) fs.truncateSync(this.txt(this.id), c.txtSize);
      if (this.base) {
        for (const k of ['mix', 'mic', 'sys'] as const) {
          if (c.sizes[k] > 0 && fs.existsSync(f[k])) {
            fs.truncateSync(f[k], c.sizes[k]);
            repairWav(f[k]);
          } else if (c.sizes[k] < 0) fs.rmSync(f[k], { force: true });
        }
        finishAudio(this.id);
      } else removeAudio(this.id);
    } catch (e) {
      log('note: retour à la note d’avant incomplet', e instanceof Error ? e.message : e);
    }
    this.cont = null;
    this.base = 0;
    this.prev = null;
  }
  /** Segments de la note complète : ceux d'avant la reprise (sans audio gardé) puis les nouveaux, décalés. */
  private withPrev(segs: NoteSegment[]): NoteSegment[] {
    const p = this.prev;
    if (!p) return segs;
    const sh = (v: number | undefined) => (v == null ? v : v + p.shiftMs);
    // une partie nommée et l'autre non : les passages sans voix prennent « Moi » / « Les autres » (piste)
    const named = p.diarized || segs.some((x) => x.speaker);
    const fill = (x: NoteSegment): string => (named ? x.speaker || (x.source === 'system' ? 'Les autres' : 'Moi') : x.speaker);
    return [
      ...p.segs.map((x) => ({ ...x, speaker: fill(x) })),
      ...segs.map((x) => ({ ...x, speaker: fill(x), startMs: x.startMs + p.shiftMs, endMs: x.endMs + p.shiftMs, speechStartMs: sh(x.speechStartMs), speechEndMs: sh(x.speechEndMs) })),
    ];
  }
  /** Texte brut de toute la note (reprise sans audio : ancien texte en tête). */
  private allText(): string {
    return [...(this.prev?.texts ?? []), ...this.texts].join(' ').trim();
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
    whisperMeetingServer.stop();
    this.state = 'idle';
    this.closeWavs();
    if (this.cont) this.rollbackContinue();
    else {
      removeAudio(this.id);
      fs.rmSync(this.txt(this.id), { force: true });
    }
    log(`${this.kind}: annulée`, this.id);
    this.status({ state: 'idle' });
    this.progress({ state: 'error', message: 'Note annulée' });
  }

  /** Étape après l'arrêt : progression + événement 'stage' (l'UI affiche la note dès « transcript »). */
  private stage(id: string, stage: NoteStage, extra: Record<string, unknown> = {}): void {
    this.emit('stage', { noteId: id, stage, ...extra });
  }

  /** Brouillon visible tout de suite (transcription brute) : remplacé par le compte rendu à la fin. */
  private saveDraft(id: string, transcript: string, existing?: NoteMeta, noFile = false): NoteMeta {
    const { markdown, title } = rawNote(transcript, this.createdAt, 'Compte rendu en cours…');
    // Reprise : le fichier et le titre d'avant restent en place jusqu'au nouveau résumé (même note, même fichier).
    const keepPrev = !!this.cont && !!existing;
    let file = existing?.path ?? '';
    if (!noFile && !keepPrev) {
      file = uniquePath(notesOutDir(), mdName(this.createdAt, title), existing?.path);
      fs.writeFileSync(file, markdown);
    }
    const meta: NoteMeta = { id, title: keepPrev ? existing!.title : title, createdAt: this.createdAt.toISOString(), durationMs: this.elapsed(), words: spokenWords(transcript), path: noFile ? '' : file, provider: 'pending' };
    upsert(meta);
    this.emit('draft', meta);
    return meta;
  }

  /** Arrête l'enregistrement, termine la transcription, organise et enregistre la note. Renvoie son id. */
  async stop(opts: { title?: string; markers?: { atMs: number; text: string }[] } = {}): Promise<string | null> {
    if (!this.active) return null;
    const id = this.id;
    const cont = this.cont;
    this.endRecording();
    playSound('stop');
    this.state = 'transcribing';
    this.timings.stopAt = Date.now();
    this.status({ state: 'transcribing', mode: 'note', message: 'Note · transcription…' });
    this.progress({ state: 'transcribing', noteId: id });
    try {
      const rec = await this.recorder.stop();
      const o = this.base;
      for (const t of rec.tails ?? []) this.enqueue(t.wav, t.start + o, t.end + o, t.source, t.from + o, t.to + o);
    } catch (e) {
      log('note: fin de capture', e);
    }
    this.closeWavs();
    // La séparation des voix (CPU) démarre tout de suite, en parallèle de la file Whisper (GPU) : elle n'a besoin
    // que de l'audio, pas du texte.
    const dia = this.startDiarization(id);
    await this.queue;
    // Dictaphone (moteur Parakeet) : la transcription en direct n'était qu'un aperçu ; la transcription définitive est
    // refaite sur les FICHIERS ENTIERS (mots horodatés). Échec → rattrapage classique des passages non couverts.
    if (!(this.engineOn() && (await this.finalPass(id)))) {
      await this.catchUp(id); // passages non transcrits (échec, perdus) rejoués depuis le WAV de session
      await this.queue;
    }
    this.whenIdleStopServer();
    this.timings.transcribedAt = Date.now();
    const plain = this.allText();
    log(`note: transcription finie ${this.timings.transcribedAt - this.timings.stopAt} ms après l'arrêt, ${countWords(plain)} mots, ${this.segs.length} morceau(x)${cont ? ' (reprise)' : ''}`);
    // Reprise : la note existe déjà, elle est toujours refaite (même si la suite n'a rien capté).
    const enough = !!cont || countWords(plain) >= 3;
    // Presque rien capté (seuil unique, audit M2) : ni fichier dans Documents, ni résumé « Note vide », ni notification.
    const tiny = !cont && countWords(plain) < TINY_WORDS && !(opts.markers ?? []).length;
    let draft: NoteMeta | undefined = cont?.meta;
    if (enough) {
      // Étape 1 : transcription prête → la note existe déjà (brouillon) et ses segments sont lisibles.
      try {
        writeData(id, { segments: this.withPrev(this.sortedSegs().map((x) => this.plainSeg(x))), diarized: false, numSpeakers: this.numSpeakers, engine: this.transcriptionEngine() });
      } catch (e) {
        log('note: segments non enregistrés', e);
      }
      draft = this.saveDraft(id, plain, draft, tiny);
      this.stage(id, 'transcript', { noteId: id, words: countWords(plain) });
      this.progress({ state: 'transcribing', stage: 'transcript', noteId: id, message: 'Transcription prête' });
    } else dia.abort();
    this.stage(id, 'voices');
    const transcript = enough ? await this.speakers(id, dia) : plain;
    if (enough) {
      draft = this.saveDraft(id, transcript, draft, tiny);
      this.stage(id, 'summary');
    }
    this.timings.diarizedAt = Date.now();
    // Repères tapés pendant la session : donnés à l'organisation (priorité de structure) ; titre imposé s'il a été saisi.
    const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    const marks = (opts.markers ?? []).map((m) => `- [${fmt(m.atMs)}] ${m.text}`).join('\n');
    const forOrganize = marks
      ? `${transcript}\n\nRepères notés par la personne pendant la session (à utiliser pour structurer la note, sans rien ajouter) :\n${marks}`
      : transcript;
    // Rien entendu (et aucun repère) : aucune note n'est enregistrée, la pastille repasse au repos.
    if (!enough && !marks) {
      try { fs.unlinkSync(txtFile(id)); } catch { /* déjà absent */ }
      removeAudio(id);
      fs.rmSync(jsonFile(id), { force: true });
      log('note: rien entendu → aucune note enregistrée');
      this.state = 'idle';
      this.status({ state: 'idle' });
      this.progress({ state: 'error', elapsedMs: this.elapsed(), words: 0, message: 'Rien entendu : aucune note enregistrée.' });
      return null;
    }
    const sansAudio = !!this.prev; // reprise sans audio gardé : le WAV ne couvre que la suite, il ne servirait pas à la réécoute
    try {
      const done = await this.organizeAndSave(id, forOrganize, this.createdAt, this.elapsed(), draft, opts.title, tiny);
      this.stage(id, 'done');
      return done;
    } finally {
      this.state = 'idle';
      this.cont = null;
      this.base = 0;
      this.prev = null;
      finishAudio(id, keepNoteAudio() && !sansAudio && !tiny);
    }
  }

  private sortedSegs(): RawSegment[] {
    return this.segs.slice().sort((a, b) => a.startMs - b.startMs);
  }

  /** Le serveur « réunion » (~0,6 Go) n'a plus lieu d'être une fois la transcription finie. */
  private whenIdleStopServer(): void {
    whisperMeetingServer.stop();
  }

  /**
   * Transcription définitive du dictaphone : Parakeet sur chaque piste entière (micro, + son du Mac s'il a porté de la
   * parole ; sinon le mélange), découpée en segments sur les pauses. Remplace l'aperçu en direct si elle réussit.
   */
  private async finalPass(id: string): Promise<boolean> {
    const f = wavFiles(id);
    const two = fs.existsSync(f.mic) && fs.existsSync(f.sys);
    const tracks: [Source, string][] = two ? [['mic', f.mic], ...(this.sawSystem ? ([['system', f.sys]] as [Source, string][]) : [])] : [['mic', f.mix]];
    const lang = String(settings.get('general.language') || 'fr');
    const t0 = Date.now();
    try {
      const segs: RawSegment[] = [];
      for (const [source, file] of tracks) {
        if (!fs.existsSync(file) || this.ac?.signal.aborted) return false;
        const r = await transcribeFile(file, lang, this.ac?.signal);
        segs.push(...segmentsFromWords(r.words, source));
      }
      const liveWords = countWords(this.texts.join(' '));
      const finalWords = segs.reduce((n, x) => n + countWords(x.text), 0);
      // garde-fou : une passe finale nettement plus pauvre que l'aperçu (échec silencieux) n'écrase rien
      if (finalWords < 0.5 * liveWords) {
        log(`note: transcription du fichier entier plus courte que l'aperçu (${finalWords} < ${liveWords} mots) → aperçu gardé`);
        return false;
      }
      this.segs = segs;
      this.texts = segs.slice().sort((a, b) => a.startMs - b.startMs).map((x) => x.text);
      fs.writeFileSync(this.txt(id), [...(this.prev?.texts ?? []), ...this.texts].join('\n') + '\n');
      log(`note: transcription du fichier entier en ${Date.now() - t0} ms, ${finalWords} mots (aperçu en direct : ${liveWords}), ${segs.length} segment(s)`);
      return true;
    } catch (e) {
      if (!this.ac?.signal.aborted) log('note: transcription du fichier entier impossible → aperçu + rattrapage', e instanceof Error ? e.message : e);
      return false;
    }
  }

  /**
   * Rattrapage (04-muesli.md R7) : le découpage est rejoué sur chaque piste du WAV de session ; tout morceau de
   * parole que la transcription en direct n'a pas couvert (échec, erreur, morceau perdu) est retranscrit.
   */
  private async catchUp(id: string): Promise<void> {
    const f = wavFiles(id);
    const two = fs.existsSync(f.mic) && fs.existsSync(f.sys);
    const tracks: [Source, string][] = two ? [['mic', f.mic], ['system', f.sys]] : [['mic', f.mix]];
    let n = 0;
    const t0 = Date.now();
    for (const [source, file] of tracks) {
      if (!fs.existsSync(file) || this.ac?.signal.aborted) continue;
      try {
        for (const c of uncovered(offlineChunks(file), this.covered[source], 0.5)) {
          if (c.to - c.from < 16 * 400) continue; // < 0,4 s de parole : bruit
          this.enqueue(readWavSlice(file, c.start / 16, c.end / 16), c.start, c.end, source, c.from, c.to);
          n++;
        }
      } catch (e) {
        log('note: rattrapage impossible', e instanceof Error ? e.message : e);
      }
    }
    if (n) log(`note: rattrapage de ${n} passage(s) non transcrit(s) (analyse ${Date.now() - t0} ms)`);
  }

  /** Lance la diarisation du WAV de session (processus séparé) ; résolu à null si indisponible. */
  private startDiarization(id: string): { promise: Promise<Awaited<ReturnType<typeof diarize>>>; abort: () => void } {
    const f = wavFiles(id);
    const dac = new AbortController();
    const outer = this.ac?.signal;
    outer?.addEventListener('abort', () => dac.abort(), { once: true });
    if (settings.get('notes.diarization') === false || !fs.existsSync(f.mix)) return { promise: Promise.resolve(null), abort: () => undefined };
    const two = fs.existsSync(f.mic) && fs.existsSync(f.sys);
    this.status({ state: 'transcribing', mode: 'note', message: 'Note · transcription…' });
    const files = { mix: f.mix, ...(two ? { mic: f.mic, sys: f.sys } : {}) };
    const run = async (): Promise<DiarizationResult | null> => {
      if (this.engineOn()) {
        try {
          // parole sur la piste du Mac (décide du mode deux pistes, comme dans le worker sherpa)
          const sysVoicedSec = two ? offlineChunks(f.sys).reduce((n, c) => n + (c.to - c.from), 0) / 16000 : 0;
          const r = await diarizeWithEngine(files, { signal: dac.signal, numSpeakers: this.numSpeakers, sysVoicedSec });
          if (r) return { ...r, engine: 'fluid' };
        } catch (e) {
          if (dac.signal.aborted) return null;
          log('note: séparation des voix Parakeet/FluidAudio en erreur → chaîne classique (sherpa)', e instanceof Error ? e.message : e);
        }
      }
      const r = await diarize(files, dac.signal, this.numSpeakers);
      return r ? { ...r, engine: 'sherpa' } : null;
    };
    const promise = run().catch((e) => {
      log('note: diarisation impossible → transcription sans locuteurs', e);
      return null;
    });
    return { promise, abort: () => dac.abort() };
  }

  /**
   * Voix → segments étiquetés (<id>.json) → transcription « [mm:ss] Locuteur : texte ». Aucune re-transcription :
   * chaque phrase va à la voix qui la recouvre le plus ; en deux pistes la piste micro est « Moi » (jamais triée).
   * Désactivée, indisponible ou en échec : transcription simple, sans erreur.
   */
  private async speakers(id: string, dia: { promise: Promise<Awaited<ReturnType<typeof diarize>>> }): Promise<string> {
    const plain = this.allText();
    const sorted = this.sortedSegs();
    const prevDiarized = !!this.prev?.diarized; // reprise sans audio : les voix d'avant restent nommées
    let data: NoteData = { segments: this.withPrev(sorted.map((s) => this.plainSeg(s))), diarized: prevDiarized, numSpeakers: this.numSpeakers, engine: this.transcriptionEngine() };
    let out = prevDiarized ? speakerTranscript(data.segments) : plain;
    this.status({ state: 'transcribing', mode: 'note', message: 'Note · séparation des voix…' });
    this.progress({ state: 'transcribing', stage: 'voices', message: diaModels.downloading ? 'Téléchargement du modèle de voix…' : 'Séparation des voix…' });
    const onDl = (p: { percent: number; state: string }) => {
      if (p.state === 'downloading') this.progress({ state: 'transcribing', stage: 'voices', message: `Téléchargement du modèle de voix… ${p.percent} %` });
    };
    diaModels.on('progress', onDl);
    try {
      const r = await dia.promise;
      if (r) {
        const segs = r.mode === 'two-track' ? dedupeEcho(sorted) : sorted;
        const labeled = labelSegments(segs, r.turns, r.mode, r.mode === 'mix' && this.numSpeakers === 1, r.micTurns);
        const names = new Set(labeled.map((s) => s.speaker));
        this.timings.diarizeMs = r.ms;
        this.timings.diarizeMode = r.mode;
        this.timings.speakers = names.size;
        log(`note: diarisation ${r.engine ?? 'sherpa'} ${r.mode}${r.micTurns ? ` (voix sur le micro : ${new Set(r.micTurns.map((t) => t.speaker)).size})` : ''} en ${r.ms} ms pour ${r.audioSec.toFixed(0)} s d'audio (${((r.ms / 10 / r.audioSec) || 0).toFixed(1)} %), ${names.size} locuteur(s) (groupes ${r.groups ?? '?'} → ${r.merged ?? '?'}, nombre annoncé ${this.numSpeakers ?? 'auto'}), ${r.rssMB ?? '?'} Mo`);
        const all = this.withPrev(labeled);
        data = { segments: all, diarized: true, mode: r.mode, diarizationMs: r.ms, numSpeakers: this.numSpeakers, engine: this.transcriptionEngine(), diarizationEngine: r.engine ?? 'sherpa' };
        out = speakerTranscript(all);
      } else log('note: diarisation indisponible → transcription sans locuteurs');
    } finally {
      diaModels.off('progress', onDl);
    }
    try {
      writeData(id, data);
    } catch (e) {
      log('note: segments non enregistrés', e);
    }
    this.emit('voices', { noteId: id, segments: data.segments, diarized: data.diarized, mode: data.mode });
    return out;
  }

  private async organizeAndSave(id: string, transcript: string, createdAt: Date, durationMs: number, existing?: NoteMeta, forcedTitle?: string, tiny = false): Promise<string> {
    this.state = 'organizing';
    this.status({ state: 'cleaning', mode: 'note', message: 'Note · organisation…' });
    this.progress({ state: 'organizing', stage: 'summary', elapsedMs: durationMs, words: spokenWords(transcript), noteId: id });
    const organize: OrganizeFn | undefined = routerModule()?.organizeNotes;
    let markdown: string;
    let title: string;
    let provider = 'passthrough';
    let warn = '';
    const t0 = Date.now();
    if (!countWords(transcript)) {
      ({ markdown, title } = rawNote('', createdAt, 'Rien n’a été entendu pendant cette session.'));
    } else if (tiny) {
      // presque rien capté : pas d'appel à l'IA (elle rendrait « Note vide »), l'écran propose Garder / Jeter
      ({ markdown, title } = rawNote(transcript, createdAt, 'Presque rien n’a été capté.'));
    } else if (!organize) {
      ({ markdown, title } = rawNote(transcript, createdAt, 'Organisation indisponible : transcription brute.'));
      warn = 'Organisation indisponible : transcription brute enregistrée';
    } else {
      try {
        // f6 : même dictionnaire que la dictée. `vocabulary` est transmis au module IA (ignoré s'il ne le gère pas) ;
        // les règles de remplacement sont appliquées ici, avant et après l'organisation.
        const dict = vocabularyForNotes();
        const r = await (organize as (t: string, o: Record<string, unknown>) => ReturnType<OrganizeFn>)(applyReplacements(transcript, dict.replacements), {
          vocabulary: dict.vocabulary,
          signal: this.ac?.signal,
          onProgress: (step: number, total: number) => this.progress({ state: 'organizing', elapsedMs: durationMs, words: spokenWords(transcript), step, total, noteId: id }),
        });
        markdown = applyReplacements(r.markdown, dict.replacements);
        title = applyReplacements(r.title, dict.replacements);
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
    markdown = markdown.trimStart(); // m12 : pas de ligne vide en tête du .md
    let file = '';
    if (!tiny) {
      file = uniquePath(notesOutDir(), mdName(createdAt, title), existing?.path);
      fs.writeFileSync(file, markdown.endsWith('\n') ? markdown : markdown + '\n');
    }
    if (insideNotesOut(existing?.path) && existing!.path !== file) fs.rmSync(existing!.path, { force: true });
    const meta: NoteMeta = { id, title, createdAt: createdAt.toISOString(), durationMs, words: spokenWords(transcript), path: file, provider };
    upsert(meta);
    log(tiny ? 'note: presque rien capté → gardée hors de Documents (Garder / Jeter à l’écran)' : `note: enregistrée ${file} (organisation ${Date.now() - t0} ms)`);
    this.state = 'idle';
    this.status(tiny ? { state: 'idle' } : { state: warn ? 'error' : 'done', mode: 'note', message: warn || `Note prête : ${title}` });
    // Confirmation brève, puis retour au repos (sinon « Note prête » restait affiché sur la pastille).
    if (!tiny) setTimeout(() => { if (this.state === 'idle') this.status({ state: 'idle' }); }, warn ? 3000 : 1500);
    this.progress({ state: 'done', elapsedMs: durationMs, words: meta.words, noteId: id, message: warn || undefined });
    this.emit('saved', { ...meta, tiny });
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

  /** « Garder » une note presque vide : son .md (transcription brute) est enfin écrit dans Documents. */
  keepNote(rawId: string): void {
    const id = assertNoteId(rawId);
    const meta = readIndex().find((m) => m.id === id);
    if (!meta || insideNotesOut(meta.path)) return;
    const n = getNote(id);
    const createdAt = new Date(meta.createdAt);
    const { markdown, title } = rawNote(n.transcript, createdAt, 'Transcription brute (presque rien capté).');
    const file = uniquePath(notesOutDir(), mdName(createdAt, meta.title || title));
    fs.writeFileSync(file, markdown);
    upsert({ ...meta, path: file });
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

export function getNote(rawId: string): { meta: NoteMeta; markdown: string; transcript: string; segments?: NoteSegment[]; engine?: 'fluid' | 'whisper' | 'mixed' } {
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
  if (d?.diarized) return { meta, markdown: md, transcript: speakerTranscript(d.segments), segments: d.segments, ...(d.engine ? { engine: d.engine } : {}) };
  return { meta, markdown: md, transcript: read(txtFile(id)).trim(), ...(d?.segments?.length ? { segments: d.segments } : {}), ...(d?.engine ? { engine: d.engine } : {}) };
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

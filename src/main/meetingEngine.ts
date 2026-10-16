import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { powerMonitor } from 'electron';
import type { DiarizationResult } from './diarization';
import { FLUID_SETS } from './fluidModels.manifest';
import { FluidModels, type FluidProgress, type FluidWait } from './fluidModels';
import {
  FLUID_DIARIZE_ARGS,
  refineDiarization,
  chooseEngine,
  diarizeTimeoutMs,
  macMajorFromDarwin,
  parseDiarize,
  parseMacMajor,
  parseTranscribe,
  runBin,
  splitLong,
  transcribeTimeoutMs,
  wordsToMs,
  type EngineChoice,
} from './meetingEngineCore';
import { clusterCount, type SpeakerTurn } from './speakers';
import { dataDir, log, modelsDir } from './paths';
import { readWavSlice } from './wavfile';
import { settings } from './settings';
import { findBin } from './whisper';

/**
 * Moteur de réunion « dicta-meeting » (FluidAudio : transcription Parakeet TDT v3 + diarisation hors ligne),
 * pilote le binaire embarqué (Resources/bin/dicta-meeting, ~19 Mo). Un appel = un processus (chargement des modèles
 * ≈ 0,1 s une fois compilés, ~85 Mo de pic) : plus robuste qu'un processus persistant (aucun état, un plantage ne
 * touche que l'appel). Les modèles (~490 Mo) sont téléchargés en arrière-plan par fluidModels.ts, jamais ici.
 * Choix du moteur : voir chooseEngine (macOS ≥ 15 ET modèles ET binaire) ; tout échec → l'appelant (notes.ts) retombe
 * sur Whisper + sherpa sans perdre la note.
 */

const rawSetting = (k: string): unknown => (settings as unknown as { get(k: string): unknown }).get(k);

export const engineBin = (): string | undefined => findBin('dicta-meeting', process.env.DICTA_MEETING_BIN);

let macMajorCache: number | null = null;
export function macMajor(): number {
  if (macMajorCache != null) return macMajorCache;
  try {
    macMajorCache = parseMacMajor(execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 3000 }));
  } catch {
    macMajorCache = 0;
  }
  if (!macMajorCache) macMajorCache = macMajorFromDarwin(os.release());
  return macMajorCache;
}

// ── Modèles : téléchargement en arrière-plan

/** Sondes « Mac occupé » (dictée, réunion) enregistrées par notes.ts / main.ts. */
const busyProbes: (() => boolean)[] = [];
export function addBusyProbe(fn: () => boolean): void {
  busyProbes.push(fn);
}
const busy = (): boolean => busyProbes.some((f) => f());

const onBattery = (): boolean => {
  try {
    return powerMonitor.isOnBatteryPower();
  } catch {
    return false;
  }
};
const idleSeconds = (): number => {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
};
const paused = (): boolean => rawSetting('notes.engineDownloadPaused') === true;

let models: FluidModels | null = null;
/** Dossier stable ~/.dicta-ai/models/fluid (DICTA_MEETING_MODELS le remplace, comme pour le binaire). */
export const fluidDir = (): string => process.env.DICTA_MEETING_MODELS || path.join(modelsDir(), 'fluid');
export function fluidModels(): FluidModels {
  if (!models) {
    const why = (extra: boolean): { ok: true } | { ok: false; why: FluidWait } => {
      if (paused()) return { ok: false, why: 'paused' };
      if (busy()) return { ok: false, why: 'busy' };
      if (onBattery()) return { ok: false, why: 'power' };
      if (extra && idleSeconds() < 120) return { ok: false, why: 'idle' };
      return { ok: true };
    };
    models = new FluidModels({
      dir: fluidDir(),
      sets: FLUID_SETS,
      canStart: () => why(true),
      canContinue: () => why(false),
      log,
    });
    let downloaded = false;
    models.on('progress', (p: FluidProgress) => {
      if (p.state === 'downloading') downloaded = true;
      // modèles tout juste téléchargés : le 1er chargement Core ML (compilation Neural Engine) est fait tout de suite, pas en pleine réunion
      if (p.state === 'done' && downloaded) {
        downloaded = false;
        void warmup();
      }
    });
  }
  return models;
}

let inited = false;
/** Idempotent : lance le téléchargement en arrière-plan (si le binaire est là, macOS ≥ 15) et nettoie les temporaires. */
export function initMeetingEngine(): void {
  if (inited) return;
  inited = true;
  try {
    fs.rmSync(tmpDir(), { recursive: true, force: true });
  } catch {
    /* rien */
  }
  if (process.platform !== 'darwin' || macMajor() < 15 || !engineBin() || rawSetting('notes.engine') === 'whisper') return;
  fluidModels().schedule();
}

// ── Choix du moteur

export function currentEngine(failed = false): EngineChoice {
  return chooseEngine({
    platform: process.platform,
    macMajor: macMajor(),
    modelsReady: fluidModels().ready(),
    binPresent: !!engineBin(),
    setting: String(rawSetting('notes.engine') ?? 'auto'),
    failed,
  });
}

/** État pour l'UI (Réglages › Notes). */
export function engineStatus(): {
  engine: 'fluid' | 'whisper';
  reason: string;
  supported: boolean;
  binPresent: boolean;
  modelsReady: boolean;
  totalMB: number;
  progress: FluidProgress;
  paused: boolean;
} {
  const m = fluidModels();
  const c = currentEngine();
  return {
    ...c,
    supported: macMajor() >= 15,
    binPresent: !!engineBin(),
    modelsReady: m.ready(),
    totalMB: Math.round(m.totalBytes() / 1048576),
    progress: m.current,
    paused: paused(),
  };
}

// ── Appels au binaire

const tmpDir = (): string => path.join(dataDir(), 'tmp-engine');
let seq = 0;
function withTmpWav<T>(wav: Buffer, fn: (file: string) => Promise<T>): Promise<T> {
  fs.mkdirSync(tmpDir(), { recursive: true, mode: 0o700 });
  const file = path.join(tmpDir(), `${process.pid}-${Date.now()}-${seq++}.wav`);
  fs.writeFileSync(file, wav, { mode: 0o600 });
  return fn(file).finally(() => fs.rm(file, () => undefined));
}
const langArg = (lang: string): string[] => (/^[a-z]{2}$/.test(lang) ? ['--lang', lang] : []);
const wavSeconds = (wav: Buffer): number => Math.max(0, (wav.length - 44) / 32000);

export interface ChunkResult {
  text: string;
  /** mots, ms absolus sur la chronologie de la session */
  words: { w: string; s: number; e: number }[];
  ms: number;
}

/** Transcrit un morceau (WAV 16 kHz mono en mémoire) ; `offsetMs` = début du morceau dans la session. Jette en cas d'erreur. */
export async function transcribeChunk(wav: Buffer, offsetMs: number, lang: string, signal?: AbortSignal): Promise<ChunkResult> {
  const bin = engineBin();
  if (!bin) throw new Error('dicta-meeting introuvable');
  const t0 = Date.now();
  const out = await withTmpWav(wav, (file) => runBin(bin, ['transcribe', file, ...langArg(lang)], { timeoutMs: transcribeTimeoutMs(wavSeconds(wav)), signal, modelsDir: fluidDir() }));
  const r = parseTranscribe(out);
  const ms = Date.now() - t0;
  log(`parakeet: ${ms} ms pour ${wavSeconds(wav).toFixed(1)} s, ${r.words.length} mot(s)`);
  return { text: r.text, words: wordsToMs(r.words, offsetMs), ms };
}

/** Échauffement Core ML (le tout premier chargement compile pour le Neural Engine, ≈ 10 s) sans bloquer personne. */
export async function warmup(): Promise<void> {
  const bin = engineBin();
  if (!bin) return;
  const t0 = Date.now();
  await runBin(bin, ['prepare'], { timeoutMs: 300_000, modelsDir: fluidDir() }).catch((e) => log('moteur de notes : échauffement impossible', e instanceof Error ? e.message : e));
  log(`moteur de notes : échauffement ${Date.now() - t0} ms`);
}

/**
 * Transcription d'un fichier WAV entier (dictaphone, après l'arrêt) : Parakeet sur des tranches de ≤ 10 min coupées au
 * creux le plus calme (mémoire bornée sur une réunion d'une heure). Mots en ms absolus sur la session.
 */
export async function transcribeFile(file: string, lang: string, signal?: AbortSignal): Promise<{ words: { w: string; s: number; e: number }[]; ms: number; audioSec: number }> {
  const bin = engineBin();
  if (!bin) throw new Error('dicta-meeting introuvable');
  const total = Math.max(0, Math.floor((fs.statSync(file).size - 44) / 2));
  const t0 = Date.now();
  const words: { w: string; s: number; e: number }[] = [];
  const cuts = splitLong(total, (from, to) => readWavSlice(file, from / 16, to / 16));
  for (const [a, b] of cuts) {
    if (signal?.aborted) throw new Error('annulé');
    const wav = readWavSlice(file, a / 16, b / 16);
    const out = await withTmpWav(wav, (f) => runBin(bin, ['transcribe', f, ...langArg(lang)], { timeoutMs: transcribeTimeoutMs(wavSeconds(wav)), signal, modelsDir: fluidDir() }));
    words.push(...wordsToMs(parseTranscribe(out).words, Math.round(a / 16)));
  }
  const ms = Date.now() - t0;
  log(`parakeet: fichier entier ${(total / 16000).toFixed(0)} s en ${ms} ms (${cuts.length} tranche(s)), ${words.length} mot(s)`);
  return { words, ms, audioSec: total / 16000 };
}

async function fluidDiarize(bin: string, file: string, n: number, audioSec: number, signal?: AbortSignal): Promise<{ turns: SpeakerTurn[]; raw: number; count: number }> {
  const out = await runBin(bin, ['diarize', file, ...(n > 1 ? ['--speakers', String(n)] : FLUID_DIARIZE_ARGS)], {
    timeoutMs: diarizeTimeoutMs(audioSec),
    signal,
    modelsDir: fluidDir(),
  });
  const d = parseDiarize(out);
  const r = n > 1 ? d : refineDiarization(d);
  return { turns: r.turns, raw: d.speakerCount, count: r.speakerCount };
}

/**
 * Séparation des voix par FluidAudio sur les FICHIERS ENTIERS (mode hors ligne) : mode deux pistes si le Mac porte assez
 * de parole, sinon une piste (présentiel : tout le monde sur le micro). En deux pistes la piste micro est triée aussi :
 * « Moi » seulement si elle ne contient qu'une voix (`micTurns` à une seule voix). Réglages recalibrés : voir
 * FLUID_DIARIZE_ARGS / refineDiarization. Renvoie null en cas d'échec (l'appelant retombe sur sherpa).
 */
export async function diarizeWithEngine(
  files: { mix: string; mic?: string; sys?: string },
  o: { signal?: AbortSignal; numSpeakers?: number; sysVoicedSec: number },
): Promise<DiarizationResult | null> {
  const bin = engineBin();
  if (!bin) return null;
  const audioSec = Math.max(1, (fs.statSync(files.mix).size - 44) / 32000);
  const two = !!(files.mic && files.sys) && o.sysVoicedSec >= Math.max(8, 0.06 * audioSec);
  const mode = two ? 'two-track' : 'mix';
  const n = clusterCount(o.numSpeakers, mode);
  const t0 = Date.now();
  if (n === 1 && !two) return { mode, turns: [], audioSec, ms: Date.now() - t0, sysVoicedSec: o.sysVoicedSec, groups: 1, merged: 1 }; // une seule voix à trier
  const main = n === 1 ? null : await fluidDiarize(bin, two ? files.sys! : files.mix, n, audioSec, o.signal);
  let micTurns: SpeakerTurn[] | undefined;
  if (two) {
    try {
      const m = await fluidDiarize(bin, files.mic!, -1, audioSec, o.signal);
      // écho résiduel : une « voix » du micro qui parle surtout en même temps que le Mac est la voix distante → ignorée
      micTurns = dropEchoVoices(m.turns, main?.turns ?? []);
    } catch (e) {
      log('note: tri des voix du micro impossible → micro = Moi', e instanceof Error ? e.message : e);
    }
  }
  return {
    mode,
    turns: main?.turns ?? [],
    ...(micTurns ? { micTurns } : {}),
    audioSec,
    ms: Date.now() - t0,
    sysVoicedSec: o.sysVoicedSec,
    groups: main?.raw ?? 1,
    merged: main?.count ?? 1,
  };
}

/** Voix du micro dont ≥ 60 % du temps recouvre de la parole du Mac : écho du haut-parleur, rattachée à la voix principale du micro. */
export function dropEchoVoices(mic: SpeakerTurn[], sys: SpeakerTurn[]): SpeakerTurn[] {
  const dur = new Map<string, number>();
  const ov = new Map<string, number>();
  for (const t of mic) {
    dur.set(t.speaker, (dur.get(t.speaker) ?? 0) + t.end - t.start);
    for (const u of sys) {
      const o = Math.min(t.end, u.end) - Math.max(t.start, u.start);
      if (o > 0) ov.set(t.speaker, (ov.get(t.speaker) ?? 0) + o);
    }
  }
  const main = [...dur].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) return mic;
  return mic.map((t) => (t.speaker !== main && (ov.get(t.speaker) ?? 0) >= 0.6 * (dur.get(t.speaker) ?? 1) ? { ...t, speaker: main } : t));
}

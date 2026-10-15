import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { decryptBlob, encryptBlob, isEncryptedBlob } from './localcrypto';
import { dataDir, log } from './paths';
import type { DictationResult } from './pipeline';
import { settings } from './settings';

/** Historique local (~/.dicta-ai/history.json) : 20 dernières dictées + compteurs cumulés. */
export interface Dictation {
  /** Identifiant stable (c3) : sert à retry(id) / pasteRaw(id) ; absent sur les très anciennes entrées. */
  id?: string;
  /** 'ok' (collée), 'cancelled' (Échap, c6), 'failed' (erreur de transcription / nettoyage). */
  status?: 'ok' | 'cancelled' | 'failed';
  /** Audio conservé dans ~/.dicta-ai/audio/<id>.wav (14 jours). */
  audio?: boolean;
  /** Durée de l'enregistrement (ms). */
  durationMs?: number;
  raw: string;
  text: string;
  provider: string;
  model: string;
  at: string;
  ms: number;
}
export interface DailyStat {
  date: string; // YYYY-MM-DD (heure locale)
  words: number;
  dictations: number;
  avgMs: number; // latence moyenne relâchement → collage
}
export interface Stats {
  words: number;
  dictations: number;
  wpm: number;
  streakDays: number;
  timeSavedMin: number;
  /** 30 derniers jours, complétés par des zéros (pour les courbes). */
  daily: DailyStat[];
  /** Nombre de dictées par moteur sur 30 jours. */
  byProvider: Record<string, number>;
}
interface DayBucket {
  words: number;
  dictations: number;
  totalMs: number;
  providers: Record<string, number>;
}
interface HistoryFile {
  recent: Dictation[];
  counters: { words: number; dictations: number; recordMs: number; days: string[] };
  /** Agrégats par jour (conservés ~1 an). */
  perDay: Record<string, DayBucket>;
}

const MAX_RECENT = 50;
const AUDIO_DAYS = 14;
const TYPING_WPM = 40;
const file = (): string => path.join(dataDir(), 'history.json');
const empty = (): HistoryFile => ({ recent: [], counters: { words: 0, dictations: 0, recordMs: 0, days: [] }, perDay: {} });
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const countWords = (s: string): number => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

let data: HistoryFile | null = null;

function load(): HistoryFile {
  if (data) return data;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    data = { ...empty(), ...raw, counters: { ...empty().counters, ...(raw?.counters ?? {}) }, perDay: raw?.perDay ?? {} };
  } catch {
    data = empty();
  }
  return data!;
}

function save(): void {
  try {
    fs.writeFileSync(file(), JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.chmodSync(file(), 0o600);
  } catch (e) {
    log('history: écriture échouée', e);
  }
}

export function newDictationId(): string {
  return Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}
const ID_RE = /^[a-z0-9]{6,32}$/;

// ---- Audio des dictées (c3) : ~/.dicta-ai/audio/<id>.wav, dossier 0700, fichiers 0600 ----
const audioDir = (): string => {
  const d = path.join(dataDir(), 'audio');
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};
export const audioPath = (id: string): string | null => (ID_RE.test(id) ? path.join(audioDir(), `${id}.wav`) : null);
export const keepAudioEnabled = (): boolean => settings.get('history.keepAudio') !== false;

/** Écrit l'audio d'une dictée ; false si désactivé (`history.keepAudio`) ou en erreur. */
export function saveAudio(id: string, wav: Buffer): boolean {
  if (!keepAudioEnabled()) return false;
  const p = audioPath(id);
  if (!p) return false;
  try {
    // Chiffré au repos (AES-256-GCM, clé locale) ; clé indisponible : on ne garde pas l'audio plutôt que de l'écrire en clair.
    const enc = encryptBlob(wav);
    if (!enc) return false;
    fs.writeFileSync(p, enc, { mode: 0o600 });
    fs.chmodSync(p, 0o600);
    return true;
  } catch (e) {
    log('history: audio non enregistré', e instanceof Error ? e.message : e);
    return false;
  }
}
export function readAudio(id: string): Buffer | null {
  const p = audioPath(id);
  try {
    return p ? decryptBlob(fs.readFileSync(p)) : null; // déchiffré en mémoire uniquement
  } catch {
    return null;
  }
}

/** Chiffre les .wav encore en clair (anciennes versions). Appelé par purgeAudio() (démarrage + toutes les 6 h). */
export function migrateAudioEncryption(): number {
  let n = 0;
  try {
    for (const f of fs.readdirSync(audioDir())) {
      if (!f.endsWith('.wav')) continue;
      const full = path.join(audioDir(), f);
      const b = fs.readFileSync(full);
      if (isEncryptedBlob(b)) continue;
      const enc = encryptBlob(b);
      if (!enc) return n;
      const mtime = fs.statSync(full).mtime;
      const tmp = `${full}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, enc, { mode: 0o600 });
      fs.renameSync(tmp, full);
      fs.utimesSync(full, mtime, mtime); // la purge à 14 jours reste fondée sur la date d'origine
      n++;
    }
    if (n) log(`history: ${n} enregistrement(s) chiffré(s) (migration)`);
  } catch (e) {
    log('history: migration du chiffrement échouée', e instanceof Error ? e.message : e);
  }
  return n;
}
const removeAudio = (id?: string): void => {
  const p = id ? audioPath(id) : null;
  if (p) fs.rmSync(p, { force: true });
};

/** Supprime les audios de plus de 14 jours (`history.audioDays`), ceux sans entrée, et marque les entrées. */
export function purgeAudio(): number {
  const days = Math.max(1, Math.min(60, Number(settings.get('history.audioDays')) || AUDIO_DAYS));
  const limit = Date.now() - days * 86_400_000;
  const h = load();
  let n = 0;
  migrateAudioEncryption();
  try {
    const known = new Set(h.recent.filter((d) => d.audio && d.id).map((d) => d.id));
    for (const f of fs.readdirSync(audioDir())) {
      const id = f.replace(/\.wav$/, '');
      const full = path.join(audioDir(), f);
      if (!f.endsWith('.wav') || !known.has(id) || fs.statSync(full).mtimeMs < limit) {
        fs.rmSync(full, { force: true });
        n++;
      }
    }
    for (const d of h.recent) if (d.audio && d.id && !fs.existsSync(path.join(audioDir(), `${d.id}.wav`))) d.audio = false;
    if (n) save();
  } catch (e) {
    log('history: purge audio échouée', e instanceof Error ? e.message : e);
  }
  return n;
}
/** « Supprimer les enregistrements » : efface tous les audios, garde le texte. */
export function clearAudio(): void {
  try {
    for (const f of fs.readdirSync(audioDir())) fs.rmSync(path.join(audioDir(), f), { force: true });
  } catch {
    /* rien à supprimer */
  }
  for (const d of load().recent) d.audio = false;
  save();
}
export function getById(id: string): Dictation | undefined {
  return load().recent.find((d) => d.id === id);
}
export function updateDictation(id: string, patch: Partial<Dictation>): Dictation | undefined {
  const d = getById(id);
  if (!d) return undefined;
  Object.assign(d, patch, { id: d.id });
  save();
  return d;
}
function pushRecent(d: Dictation): void {
  const h = load();
  h.recent = [d, ...h.recent];
  for (const old of h.recent.slice(MAX_RECENT)) removeAudio(old.id);
  h.recent = h.recent.slice(0, MAX_RECENT);
}
/** Entrée sans collage (Échap / échec) : texte et audio gardés pour recoverLast() / retry(id). */
export function recordPending(e: { id: string; status: 'cancelled' | 'failed'; raw: string; text?: string; audio: boolean; durationMs: number; provider?: string }): Dictation {
  const d: Dictation = {
    id: e.id,
    status: e.status,
    audio: e.audio,
    durationMs: e.durationMs,
    raw: e.raw,
    text: e.text ?? '',
    provider: e.provider ?? '',
    model: '',
    at: new Date().toISOString(),
    ms: 0,
  };
  pushRecent(d);
  save();
  return d;
}

export function recordDictation(r: DictationResult, extra: { id?: string; audio?: boolean; durationMs?: number } = {}): Dictation {
  const h = load();
  const now = new Date();
  const d: Dictation = {
    id: extra.id ?? r.id,
    status: 'ok',
    audio: extra.audio ?? r.audio,
    durationMs: extra.durationMs ?? r.durationMs,
    raw: r.raw,
    text: r.text,
    provider: r.provider,
    model: r.model,
    at: now.toISOString(),
    ms: r.timings.totalAfterReleaseMs,
  };
  pushRecent(d);
  h.counters.words += countWords(r.text);
  h.counters.dictations += 1;
  h.counters.recordMs += r.timings.recordMs;
  const k = dayKey(now);
  if (!h.counters.days.includes(k)) h.counters.days = [...h.counters.days, k].slice(-400);
  const b = (h.perDay[k] ??= { words: 0, dictations: 0, totalMs: 0, providers: {} });
  b.words += countWords(r.text);
  b.dictations += 1;
  b.totalMs += r.timings.totalAfterReleaseMs;
  b.providers[r.provider] = (b.providers[r.provider] ?? 0) + 1;
  const keys = Object.keys(h.perDay).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 400))) delete h.perDay[old];
  save();
  return d;
}

export function getRecent(): Dictation[] {
  return load().recent;
}

export function clearRecent(): void {
  for (const d of load().recent) removeAudio(d.id);
  load().recent = [];
  save();
}

export function getStats(): Stats {
  const c = load().counters;
  const minutes = c.recordMs / 60000;
  const wpm = minutes > 0 ? Math.round(c.words / minutes) : 0;
  // Série : jours consécutifs avec au moins une dictée, se terminant aujourd'hui (ou hier).
  const days = new Set(c.days);
  const cur = new Date();
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let streakDays = 0;
  while (days.has(dayKey(cur))) {
    streakDays++;
    cur.setDate(cur.getDate() - 1);
  }
  const timeSavedMin = Math.max(0, Math.round(c.words / TYPING_WPM - minutes));

  const perDay = load().perDay;
  const daily: DailyStat[] = [];
  const byProvider: Record<string, number> = {};
  const d = new Date();
  d.setDate(d.getDate() - 29);
  for (let i = 0; i < 30; i++, d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    const b = perDay[k];
    daily.push({
      date: k,
      words: b?.words ?? 0,
      dictations: b?.dictations ?? 0,
      avgMs: b && b.dictations ? Math.round(b.totalMs / b.dictations) : 0,
    });
    for (const [p, n] of Object.entries(b?.providers ?? {})) byProvider[p] = (byProvider[p] ?? 0) + n;
  }
  return { words: c.words, dictations: c.dictations, wpm, streakDays, timeSavedMin, daily, byProvider };
}

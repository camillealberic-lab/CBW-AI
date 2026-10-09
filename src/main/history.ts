import * as fs from 'node:fs';
import * as path from 'node:path';
import { dataDir, log } from './paths';
import type { DictationResult } from './pipeline';

/** Historique local (~/.dicta-ai/history.json) : 20 dernières dictées + compteurs cumulés. */
export interface Dictation {
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

const MAX_RECENT = 20;
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

export function recordDictation(r: DictationResult): Dictation {
  const h = load();
  const now = new Date();
  const d: Dictation = {
    raw: r.raw,
    text: r.text,
    provider: r.provider,
    model: r.model,
    at: now.toISOString(),
    ms: r.timings.totalAfterReleaseMs,
  };
  h.recent = [d, ...h.recent].slice(0, MAX_RECENT);
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

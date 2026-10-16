import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { log } from './paths';
import { settings } from './settings';

/**
 * Calendrier macOS (EventKit, lu via osascript -l JavaScript + pont ObjC) pour les notes de réunion :
 * - alerte 1 min avant une réunion (événement « soon »), titre et invités pour titrer la note
 *   et proposer les noms quand on renomme « Personne 2 » ;
 * - rien n'est lu tant que `notes.calendar` (défaut false) n'est pas activé ; l'autorisation macOS n'est demandée
 *   qu'à l'activation (requestCalendarAccess, bouton de Réglages), jamais au lancement ;
 * - rien n'est journalisé hormis des comptes (aucun titre, aucun nom).
 * Limite connue : EventKit attribue l'autorisation à l'app responsable (CBW AI) ; l'Info.plist doit porter
 * NSCalendarsFullAccessUsageDescription + NSCalendarsUsageDescription (package.json › build.mac.extendInfo, hors zone UI).
 * Détection « un appel utilise le micro » : src/main/callDetect.ts (helper dicta-callwatch).
 */

export type CalendarAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'write-only' | 'unavailable';
export interface CalendarEvent {
  id: string;
  title: string;
  /** ms epoch */
  start: number;
  end: number;
  location: string;
  url: string;
  /** Invités (nom affiché), toi compris si EventKit le marque. */
  attendees: { name: string; me: boolean }[];
}

const JXA = `
ObjC.import('EventKit');
ObjC.import('Foundation');
function run(argv) {
  const mode = argv[0] || 'status';
  const st = Number($.EKEventStore.authorizationStatusForEntityType(0));
  if (mode === 'status') return JSON.stringify({ status: st });
  const store = $.EKEventStore.alloc.init;
  if (mode === 'request') {
    if (st !== 0) return JSON.stringify({ status: st });
    let done = false, ok = false;
    const cb = function (granted, err) { ok = !!granted; done = true; };
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:')) store.requestFullAccessToEventsWithCompletion(cb);
    else store.requestAccessToEntityTypeCompletion(0, cb);
    const until = Date.now() + 90000;
    while (!done && Date.now() < until) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
    return JSON.stringify({ status: Number($.EKEventStore.authorizationStatusForEntityType(0)), ok: ok });
  }
  if (st !== 3) return JSON.stringify({ status: st, events: [] });
  const back = Number(argv[1] || 900), ahead = Number(argv[2] || 1200);
  const pred = store.predicateForEventsWithStartDateEndDateCalendars($.NSDate.dateWithTimeIntervalSinceNow(-back), $.NSDate.dateWithTimeIntervalSinceNow(ahead), $());
  const evs = store.eventsMatchingPredicate(pred);
  const out = [];
  const s = (v) => { try { const x = ObjC.unwrap(v); return typeof x === 'string' ? x : ''; } catch (e) { return ''; } };
  const n = Math.min(Number(evs.count), 60);
  for (let i = 0; i < n; i++) {
    const e = evs.objectAtIndex(i);
    if (e.allDay) continue;
    const att = [];
    try {
      const a = e.attendees;
      if (a && !a.isNil()) for (let j = 0; j < Math.min(Number(a.count), 40); j++) { const p = a.objectAtIndex(j); att.push({ name: s(p.name), me: !!p.isCurrentUser }); }
    } catch (err) {}
    let url = '';
    try { if (e.URL && !e.URL.isNil()) url = s(e.URL.absoluteString); } catch (err) {}
    out.push({ id: s(e.eventIdentifier), title: s(e.title), start: Math.round(e.startDate.timeIntervalSince1970 * 1000), end: Math.round(e.endDate.timeIntervalSince1970 * 1000), location: s(e.location), url: url, attendees: att });
  }
  return JSON.stringify({ status: st, events: out });
}
`;

const STATUS: Record<number, CalendarAccess> = { 0: 'not-determined', 1: 'restricted', 2: 'denied', 3: 'granted', 4: 'write-only' };

function runJxa(args: string[], timeoutMs: number): Promise<{ status: number; ok?: boolean; events?: CalendarEvent[] } | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA, ...args], { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        resolve(JSON.parse(String(stdout).trim()));
      } catch {
        resolve(null);
      }
    });
  });
}

const clean = (v: unknown, n: number): string => String(v ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, n);
function sanitize(list: unknown): CalendarEvent[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e === 'object' && Number.isFinite(Number((e as any).start)))
    .map((e: any) => ({
      id: clean(e.id, 200),
      title: clean(e.title, 160),
      start: Number(e.start),
      end: Number(e.end) || Number(e.start),
      location: clean(e.location, 200),
      url: /^https:\/\//i.test(String(e.url ?? '')) ? clean(e.url, 400) : '',
      attendees: Array.isArray(e.attendees)
        ? e.attendees.slice(0, 40).map((a: any) => ({ name: clean(a?.name, 60), me: !!a?.me })).filter((a: { name: string }) => a.name)
        : [],
    }));
}

export async function calendarAccess(): Promise<CalendarAccess> {
  const r = await runJxa(['status'], 10_000);
  return r ? STATUS[r.status] ?? 'unavailable' : 'unavailable';
}

/** Demande l'autorisation macOS (à appeler seulement quand la personne active le réglage). */
export async function requestCalendarAccess(): Promise<CalendarAccess> {
  const r = await runJxa(['request'], 100_000);
  return r ? STATUS[r.status] ?? 'unavailable' : 'unavailable';
}

/** Événements (hors « journée entière ») entre now − backSec et now + aheadSec. Vide si non autorisé ou désactivé. */
export async function calendarEvents(backSec = 900, aheadSec = 1200): Promise<CalendarEvent[]> {
  if (settings.get('notes.calendar') !== true) return [];
  const r = await runJxa(['events', String(Math.round(backSec)), String(Math.round(aheadSec))], 15_000);
  return r && r.status === 3 ? sanitize(r.events).sort((a, b) => a.start - b.start) : [];
}

/** Réunion « du moment » : la prochaine qui commence dans ≤ 15 min, sinon celle commencée il y a ≤ 15 min. */
export async function currentMeeting(): Promise<CalendarEvent | null> {
  const now = Date.now();
  const evs = await calendarEvents(900, 900);
  return evs.find((e) => e.start >= now) ?? evs.filter((e) => e.start < now && e.end > now).pop() ?? null;
}

/**
 * Bloc « À venir » de l'écran Notes : réunions d'aujourd'hui (encore en cours ou à venir), de demain et d'après-demain.
 * `enabled: false` (réglage `notes.calendar` coupé) → la page n'affiche pas le bloc. Rien n'est journalisé.
 */
export async function upcomingMeetings(days = 2): Promise<{ enabled: boolean; events: CalendarEvent[] }> {
  if (settings.get('notes.calendar') !== true) return { enabled: false, events: [] };
  const now = Date.now();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + Math.max(0, Math.min(6, Math.round(days))));
  const evs = await calendarEvents(12 * 3600, Math.max(60, (end.getTime() - now) / 1000));
  return { enabled: true, events: evs.filter((e) => e.end > now).slice(0, 40) };
}

/**
 * Surveillance (toutes les 60 s quand `notes.calendar` est actif) : émet 'soon' (CalendarEvent) une seule fois,
 * ~60 s avant le début de chaque réunion.
 */
class CalendarWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private pending = new Map<string, NodeJS.Timeout>();
  private fired = new Set<string>();

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    setTimeout(() => void this.tick(), 5_000);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
  async tick(): Promise<void> {
    if (settings.get('notes.calendar') !== true) return;
    let evs: CalendarEvent[] = [];
    try {
      evs = await calendarEvents(120, 20 * 60);
    } catch (e) {
      log('calendrier: lecture impossible', e);
      return;
    }
    const now = Date.now();
    for (const ev of evs) {
      const key = `${ev.id}|${ev.start}`;
      if (this.fired.has(key) || this.pending.has(key)) continue;
      const at = ev.start - 60_000;
      if (now > ev.start + 60_000) continue; // déjà commencée depuis plus d'une minute
      const fire = () => {
        this.pending.delete(key);
        if (this.fired.has(key) || settings.get('notes.calendar') !== true) return;
        this.fired.add(key);
        this.emit('soon', ev);
      };
      if (at <= now) fire();
      else this.pending.set(key, setTimeout(fire, at - now));
    }
    if (this.fired.size > 500) this.fired = new Set([...this.fired].slice(-200));
  }
}

export const calendarWatcher = new CalendarWatcher();

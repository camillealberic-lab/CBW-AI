// Logique pure de détection d'appel (sans Electron) : noms d'apps connues + anti-rebond. Testée dans callDetectCore.test.ts.

export interface MicEvent { event: 'mic-on' | 'mic-off'; bundleId?: string; app?: string }
export interface CallInfo { app?: string; bundleId?: string }

export const START_CONFIRM_MS = 3000; // micro utilisé 3 s d'affilée avant d'annoncer un appel
export const END_CONFIRM_MS = 5000; // micro libre 5 s avant d'annoncer la fin

/** Apps d'appel connues (préfixe de bundle id → nom affiché). Les navigateurs : Meet / Teams web / etc. */
const KNOWN: Array<[string, string]> = [
  ['us.zoom.xos', 'Zoom'],
  ['com.microsoft.teams', 'Microsoft Teams'],
  ['com.apple.FaceTime', 'FaceTime'],
  ['com.tinyspeck.slackmacgap', 'Slack'],
  ['com.hnc.Discord', 'Discord'],
  ['com.cisco.webexmeetingsapp', 'Webex'],
  ['Cisco-Systems.Spark', 'Webex'],
  ['com.cisco.webex', 'Webex'],
  ['net.whatsapp.WhatsApp', 'WhatsApp'],
  ['desktop.WhatsApp', 'WhatsApp'],
  ['com.skype.skype', 'Skype'],
  ['com.google.meet', 'Google Meet'],
  ['com.ringcentral', 'RingCentral'],
  ['com.gotomeeting', 'GoTo Meeting'],
  ['com.loom.desktop', 'Loom'],
  ['org.whispersystems.signal-desktop', 'Signal'],
  ['ru.keepcoder.Telegram', 'Telegram'],
  ['com.apple.Safari', 'Safari (Meet, Teams web…)'],
  ['com.google.Chrome', 'Chrome (Meet, Teams web…)'],
  ['com.microsoft.edgemac', 'Edge (Meet, Teams web…)'],
  ['company.thebrowser.Browser', 'Arc (Meet, Teams web…)'],
  ['org.mozilla.firefox', 'Firefox (Meet, Teams web…)'],
  ['com.brave.Browser', 'Brave (Meet, Teams web…)'],
];

export function callAppName(bundleId?: string, fallback?: string): string | undefined {
  if (bundleId) {
    const k = KNOWN.find(([p]) => bundleId === p || bundleId.startsWith(p + '.'));
    if (k) return k[1];
  }
  return fallback || undefined;
}

export interface Timers { set(fn: () => void, ms: number): unknown; clear(t: unknown): void }
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as NodeJS.Timeout) };

/** Machine à états : mic-on tenu 3 s → onStart ; mic-off tenu 5 s → onEnd (une seule paire par appel). */
export class CallDebounce {
  private inCall = false;
  private startT: unknown;
  private endT: unknown;
  private info: CallInfo = {};
  private onStart: (i: CallInfo) => void;
  private onEnd: () => void;
  private timers: Timers;
  private startMs: number;
  private endMs: number;
  constructor(onStart: (i: CallInfo) => void, onEnd: () => void, timers: Timers = realTimers, startMs = START_CONFIRM_MS, endMs = END_CONFIRM_MS) {
    this.onStart = onStart; this.onEnd = onEnd; this.timers = timers; this.startMs = startMs; this.endMs = endMs;
  }
  get active(): boolean { return this.inCall; }
  feed(ev: MicEvent): void {
    if (ev.event === 'mic-on') {
      this.info = { app: callAppName(ev.bundleId, ev.app), bundleId: ev.bundleId };
      if (this.endT !== undefined) { this.timers.clear(this.endT); this.endT = undefined; }
      if (!this.inCall && this.startT === undefined) {
        this.startT = this.timers.set(() => {
          this.startT = undefined;
          this.inCall = true;
          this.onStart(this.info);
        }, this.startMs);
      }
    } else {
      if (this.startT !== undefined) { this.timers.clear(this.startT); this.startT = undefined; }
      if (this.inCall && this.endT === undefined) {
        this.endT = this.timers.set(() => {
          this.endT = undefined;
          this.inCall = false;
          this.onEnd();
        }, this.endMs);
      }
    }
  }
  /** Annule tout (arrêt du détecteur) ; émet call-end si un appel était annoncé. */
  reset(): void {
    if (this.startT !== undefined) this.timers.clear(this.startT);
    if (this.endT !== undefined) this.timers.clear(this.endT);
    this.startT = this.endT = undefined;
    const was = this.inCall;
    this.inCall = false;
    if (was) this.onEnd();
  }
}

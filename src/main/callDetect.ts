// Détection d'appel : surveille l'usage du micro par d'autres apps (helper dicta-callwatch, aucun audio lu).
// call-start {app?, bundleId?} après 3 s de micro pris, call-end après 5 s de micro libre. CBW AI est exclu côté helper.
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { settings } from './settings';
import { findBin } from './whisper';
import { CallDebounce, type CallInfo, type MicEvent } from './callDetectCore';

export type { CallInfo } from './callDetectCore';

class CallDetector extends EventEmitter {
  private proc?: ChildProcess;
  private deb = new CallDebounce(
    (i) => { if (this.enabled()) this.emit('call-start', i); },
    () => this.emit('call-end'),
  );
  private enabled = (): boolean => (settings.get('notes.detectCalls') ?? true) !== false;
  get inCall(): boolean { return this.deb.active; }

  start(): void {
    if (this.proc || !this.enabled()) return;
    const bin = findBin('dicta-callwatch', process.env.DICTA_CALLWATCH_BIN);
    if (!bin) return;
    const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc = p;
    let buf = '';
    p.stdout!.on('data', (c: Buffer) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        try {
          const ev = JSON.parse(line) as MicEvent;
          if (ev.event === 'mic-on' || ev.event === 'mic-off') this.deb.feed(ev);
        } catch { /* ligne non JSON : ignorée */ }
      }
    });
    p.on('error', () => undefined);
    p.on('exit', () => { if (this.proc === p) { this.proc = undefined; this.deb.reset(); } });
  }

  stop(): void {
    const p = this.proc;
    this.proc = undefined;
    p?.stdin?.end();
    p?.kill();
    this.deb.reset();
  }
}

export const callDetector = new CallDetector();
export type { CallDetector };

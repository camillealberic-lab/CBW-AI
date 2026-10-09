import { ChildProcess, execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as readline from 'node:readline';
import { log } from './paths';
import { findBin } from './whisper';

/**
 * Touche fn (🌐) via le helper natif dicta-fnwatch (scripts/fnwatch.swift, CGEventTap en écoute seule).
 *  - double appui sur fn (< 350 ms, aucune autre touche entre les deux) → dictée mains libres ;
 *    un appui simple sur fn l'arrête (et colle) ;
 *  - fn maintenue ≥ 250 ms → push-to-talk, relâcher arrête (et colle) ;
 *  - Échap annule une dictée en cours.
 * Événements : 'arm' (1er appui d'une séquence : pré-ouverture du micro), 'down', 'up', 'cancel', 'escape'.
 */

export type TriggerKey = 'fn' | 'lctrl' | 'rctrl';
/** « Fn×2 » → 'fn', « LCtrl×2 » (Control gauche) → 'lctrl', « RCtrl×2 » → 'rctrl', sinon null (accélérateur classique). */
export const triggerOf = (acc: string): TriggerKey | null => {
  const a = acc.trim();
  if (/^fn(\s*[×x]\s*2)?$/i.test(a)) return 'fn';
  if (/^(rctrl|rightcontrol|control\s*droite?|ctrl\s*d)(\s*[×x]\s*2)?$/i.test(a)) return 'rctrl';
  if (/^(lctrl|leftcontrol|control\s*gauche|ctrl\s*g)(\s*[×x]\s*2)?$/i.test(a)) return 'lctrl';
  return null;
};
export const isFnShortcut = (acc: string): boolean => triggerOf(acc) !== null;
export const fnwatchBin = (): string | undefined => findBin('dicta-fnwatch', process.env.DICTA_FNWATCH_BIN);

const DOUBLE_TAP_MS = 350;
const TRIPLE_TAP_MS = 350;
const HOLD_MS = 350; // un peu plus long qu'avec fn : Control sert aussi aux raccourcis

/** Machine à états du geste fn (indépendante du helper, testable). */
export class FnGesture extends EventEmitter {
  private state: 'idle' | 'pressed' | 'hold' | 'free' | 'notetap' = 'idle';
  private lastTapUp = 0;
  /** Relâchement du 2e appui (dictée mains libres lancée) : un 3e appui rapide = prise de notes ('triple'). */
  private freeUpAt = 0;
  private noteTapAt = 0;
  /** Prise de notes en cours : un simple appui (sans autre touche) émet 'noteStop', rien d'autre. */
  noteActive = false;
  private keySinceTap = false;
  private ignoreUp = false;
  private holdTimer: NodeJS.Timeout | null = null;

  private clearTimer(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  fnDown(now = Date.now()): void {
    if (this.noteActive) {
      this.clearTimer();
      this.state = 'notetap';
      this.noteTapAt = now;
      this.ignoreUp = false;
      return;
    }
    if (this.state === 'free' && this.freeUpAt && now - this.freeUpAt < TRIPLE_TAP_MS && !this.keySinceTap) {
      // 3e appui rapide : la dictée à peine lancée est remplacée par une prise de notes
      this.state = 'idle';
      this.freeUpAt = 0;
      this.ignoreUp = true;
      this.emit('triple');
      return;
    }
    if (this.state === 'free') {
      this.state = 'idle';
      this.ignoreUp = true;
      this.emit('up');
      return;
    }
    if (this.state !== 'idle') return;
    this.ignoreUp = false;
    if (this.lastTapUp && now - this.lastTapUp < DOUBLE_TAP_MS && !this.keySinceTap) {
      this.state = 'free';
      this.lastTapUp = 0;
      this.freeUpAt = 0;
      this.keySinceTap = false;
      this.ignoreUp = true; // le relâchement du 2e appui ne doit pas arrêter
      this.emit('down');
      return;
    }
    this.state = 'pressed';
    this.emit('arm');
    this.clearTimer();
    this.holdTimer = setTimeout(() => {
      if (this.state === 'pressed') {
        this.state = 'hold';
        this.lastTapUp = 0;
        this.emit('down');
      }
    }, HOLD_MS);
  }

  fnUp(now = Date.now()): void {
    if (this.state === 'notetap') {
      this.state = 'idle';
      if (now - this.noteTapAt < 500) this.emit('noteStop');
      return;
    }
    if (this.ignoreUp) {
      this.ignoreUp = false;
      if (this.state === 'free') this.freeUpAt = now;
      return;
    }
    this.clearTimer();
    if (this.state === 'hold') {
      this.state = 'idle';
      this.emit('up');
    } else if (this.state === 'pressed') {
      this.state = 'idle';
      this.lastTapUp = now;
      this.keySinceTap = false;
    }
  }

  /** Autre touche (ou modificateur) : annule un double appui / un maintien en cours d'armement (fn+flèche…). */
  key(): void {
    this.keySinceTap = true;
    if (this.state === 'notetap') {
      this.state = 'idle'; // Ctrl+C… pendant une note : ce n'est pas un appui d'arrêt
      return;
    }
    if (this.state === 'pressed') {
      this.clearTimer();
      this.state = 'idle';
      this.ignoreUp = true;
    } else if (this.state === 'hold') {
      // Control maintenu puis une lettre (Ctrl+C, Ctrl+A…) : c'était un raccourci, pas une dictée → on annule.
      this.state = 'idle';
      this.ignoreUp = true;
      this.emit('cancel');
    }
  }

  escape(): void {
    if (this.state === 'hold' || this.state === 'free') {
      if (this.state === 'hold') this.ignoreUp = true; // fn encore enfoncée
      this.state = 'idle';
      this.emit('cancel');
    } else this.key();
    this.emit('escape');
  }

  reset(): void {
    this.clearTimer();
    this.state = 'idle';
    this.lastTapUp = 0;
    this.freeUpAt = 0;
  }
}

/** Process helper + geste. start() → true si le tap est actif. */
export class FnWatcher extends EventEmitter {
  readonly gesture = new FnGesture();
  private proc: ChildProcess | null = null;
  status: 'off' | 'ready' | 'no-access' | 'unavailable' = 'off';
  /** Touche observée par le helper (fn ou Control droite). */
  trigger: TriggerKey = 'lctrl';

  constructor() {
    super();
    for (const e of ['arm', 'down', 'up', 'cancel', 'escape', 'triple', 'noteStop']) this.gesture.on(e, () => this.emit(e));
  }

  start(): Promise<boolean> {
    if (this.proc) return Promise.resolve(this.status === 'ready');
    const bin = fnwatchBin();
    if (!bin) {
      this.status = 'unavailable';
      log('fn: helper dicta-fnwatch introuvable');
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const p = spawn(bin, ['--trigger', this.trigger], { stdio: ['pipe', 'pipe', 'pipe'] }); // stdin gardé ouvert : fermé → le helper quitte
      this.proc = p;
      let settled = false;
      const done = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      p.on('error', (e) => {
        log('fn: lancement du helper échoué', e);
        this.status = 'unavailable';
        done(false);
      });
      readline.createInterface({ input: p.stdout! }).on('line', (line) => {
        switch (line.trim()) {
          case 'ready':
            this.status = 'ready';
            log('fn: helper prêt', bin);
            done(true);
            break;
          case 'error no-access':
            this.status = 'no-access';
            log('fn: accès refusé (Accessibilité / Surveillance de l’entrée) → raccourci de repli');
            done(false);
            break;
          case 'fn-down':
            this.gesture.fnDown();
            break;
          case 'fn-up':
            this.gesture.fnUp();
            break;
          case 'esc':
            this.gesture.escape();
            break;
          case 'pasted':
          case 'paste-failed':
            this.pasteWaiters.shift()?.(line.trim() === 'pasted');
            break;
          case 'key':
          case 'mod':
            this.gesture.key();
            break;
        }
      });
      p.on('exit', (code) => {
        if (this.proc === p) this.proc = null;
        if (this.status === 'ready') {
          log('fn: helper arrêté', code);
          this.status = 'off';
          this.emit('lost');
        }
        done(false);
      });
    });
  }

  private pasteWaiters: ((ok: boolean) => void)[] = [];

  /** ⌘V natif via le helper (CGEvent). false si le helper ne tourne pas. */
  paste(): Promise<boolean> {
    const p = this.proc;
    if (!p || this.status !== 'ready' || !p.stdin?.writable) return Promise.resolve(false);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        const i = this.pasteWaiters.indexOf(done);
        if (i >= 0) this.pasteWaiters.splice(i, 1);
        resolve(false);
      }, 500);
      const done = (ok: boolean) => {
        clearTimeout(t);
        resolve(ok);
      };
      this.pasteWaiters.push(done);
      p.stdin!.write('paste\n');
    });
  }

  stop(): void {
    this.gesture.reset();
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      p.kill();
    }
    if (this.status === 'ready') this.status = 'off';
  }

  /** Vérifie l'accès sans installer de tap. */
  static checkAccess(request = false): Promise<boolean> {
    const bin = fnwatchBin();
    if (!bin) return Promise.resolve(false);
    return new Promise((resolve) => execFile(bin, [request ? '--request' : '--check'], (err) => resolve(!err)));
  }
}

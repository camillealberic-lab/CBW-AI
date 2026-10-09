import { globalShortcut, systemPreferences } from 'electron';
import { EventEmitter } from 'node:events';
import { FnWatcher, isFnShortcut, triggerOf } from './fnkey';
import { log } from './paths';

/**
 * Push-to-talk global.
 *  - Mode "hold" (Accessibilité accordée) : uiohook-napi fournit keydown/keyup.
 *    En parallèle on enregistre le même raccourci via globalShortcut (no-op) :
 *    macOS consomme alors la frappe, ce qui évite d'insérer l'espace insécable
 *    que ⌥+Espace produit sinon. uiohook (event tap en écoute) voit toujours
 *    les événements.
 *  - Mode "toggle" (pas d'Accessibilité) : globalShortcut seul (pas de key-up) :
 *    1er appui = début, 2e appui = fin.
 *
 *  - Mode "fn" (raccourci « Fn×2 », défaut) : helper natif dicta-fnwatch (voir fnkey.ts) :
 *    double appui = mains libres, maintien = push-to-talk. Sans accès, repli sur ⌥Espace
 *    jusqu'à ce que la permission soit accordée.
 *
 * Événements : 'arm' (fn : 1er appui), 'down', 'up', 'cancel' (Échap), 'mode' (mode: 'hold' | 'toggle' | 'fn'),
 * 'triple' (3 appuis rapides : prise de notes), 'noteStop' (simple appui pendant une note).
 */

type UiohookModule = typeof import('uiohook-napi');

interface Parsed {
  accelerator: string; // format Electron
  keycode: number;
  mods: { alt: boolean; ctrl: boolean; shift: boolean; meta: boolean };
}

const MOD_ALIASES: Record<string, 'alt' | 'ctrl' | 'shift' | 'meta'> = {
  alt: 'alt', option: 'alt', opt: 'alt',
  control: 'ctrl', ctrl: 'ctrl',
  shift: 'shift',
  meta: 'meta', command: 'meta', cmd: 'meta', super: 'meta',
};

export function parseAccelerator(acc: string, keys: Record<string, number>): Parsed | null {
  const parts = acc.split('+').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const mods = { alt: false, ctrl: false, shift: false, meta: false };
  let key = '';
  for (const p of parts) {
    const m = MOD_ALIASES[p.toLowerCase()];
    if (m) mods[m] = true;
    else key = p;
  }
  if (!key) return null;
  const norm = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
  const keycode = keys[norm];
  if (keycode == null) return null;
  const eMods = [mods.ctrl && 'Control', mods.alt && 'Alt', mods.shift && 'Shift', mods.meta && 'Command'].filter(
    Boolean,
  ) as string[];
  return { accelerator: [...eMods, norm].join('+'), keycode, mods };
}

export class PushToTalk extends EventEmitter {
  private uio: UiohookModule | null = null;
  private parsed: Parsed | null = null;
  private active = false;
  private hookStarted = false;
  private pollTimer: NodeJS.Timeout | null = null;
  mode: 'hold' | 'toggle' | 'fn' = 'toggle';
  /** Raccourci configuré = fn ; `fnFallback` vrai tant que le helper n'a pas l'accès (⌥Espace en attendant). */
  private fnWanted = false;
  readonly fn = new FnWatcher();
  private fnPoll: NodeJS.Timeout | null = null;
  static readonly FALLBACK = 'Alt+Space';

  constructor() {
    super();
    this.fn.on('arm', () => this.emit('arm'));
    this.fn.on('down', () => this.emit('down'));
    this.fn.on('up', () => this.emit('up'));
    this.fn.on('cancel', () => this.emit('cancel'));
    this.fn.on('escape', () => this.emit('cancel'));
    this.fn.on('triple', () => this.emit('triple'));
    this.fn.on('noteStop', () => this.emit('noteStop'));
    this.fn.on('lost', () => this.fnWanted && void this.startFn());
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.uio = require('uiohook-napi') as UiohookModule;
    } catch (e) {
      log('hotkey: uiohook-napi indisponible, mode toggle', e);
    }
  }

  get uiohook(): UiohookModule | null {
    return this.uio;
  }

  isTrusted(prompt = false): boolean {
    return systemPreferences.isTrustedAccessibilityClient(prompt);
  }

  /** (Re)configure le raccourci. Renvoie false si l'accélérateur est invalide. */
  configure(accelerator: string): boolean {
    if (isFnShortcut(accelerator)) {
      const trigger = triggerOf(accelerator)!;
      if (this.fn.trigger !== trigger) this.fn.stop(); // relance le helper sur la nouvelle touche
      this.fn.trigger = trigger;
      this.fnWanted = true;
      void this.startFn();
      return true;
    }
    this.fnWanted = false;
    this.stopFnPoll();
    this.fn.stop();
    return this.configureAccel(accelerator);
  }

  get fnStatus(): FnWatcher['status'] {
    return this.fn.status;
  }

  /** fn indisponible : le raccourci de repli (⌥Espace) est actif. */
  get fnFallback(): boolean {
    return this.fnWanted && this.fn.status !== 'ready';
  }

  private async startFn(): Promise<void> {
    const ok = await this.fn.start();
    if (!this.fnWanted) return this.fn.stop();
    if (ok) {
      this.stopFnPoll();
      if (this.parsed) globalShortcut.unregister(this.parsed.accelerator);
      this.parsed = null;
      this.active = false;
      this.setMode('fn');
      return;
    }
    // Repli : ⌥Espace (maintenu si uiohook a l'accès, sinon bascule) ; on réessaie dès que l'accès est donné.
    if (!this.parsed) this.configureAccel(PushToTalk.FALLBACK);
    this.emit('mode', this.mode);
    if (!this.fnPoll && this.fn.status === 'no-access')
      this.fnPoll = setInterval(async () => {
        if (await FnWatcher.checkAccess()) {
          this.stopFnPoll();
          void this.startFn();
        }
      }, 2000);
  }

  private stopFnPoll(): void {
    if (this.fnPoll) clearInterval(this.fnPoll);
    this.fnPoll = null;
  }

  private configureAccel(accelerator: string): boolean {
    const keys = (this.uio?.UiohookKey ?? { Space: 57 }) as unknown as Record<string, number>;
    const parsed = parseAccelerator(accelerator, keys);
    if (!parsed) {
      log('hotkey: accélérateur invalide', accelerator);
      return false;
    }
    if (this.parsed) globalShortcut.unregister(this.parsed.accelerator);
    this.parsed = parsed;
    this.active = false;
    const ok = globalShortcut.register(parsed.accelerator, () => this.onGlobalShortcut());
    log('hotkey: globalShortcut', parsed.accelerator, ok ? 'ok' : 'ÉCHEC (déjà pris ?)');
    this.ensureHook();
    return true;
  }

  private setMode(m: 'hold' | 'toggle' | 'fn'): void {
    if (this.fnWanted && !this.fnFallback && m !== 'fn') return; // fn actif : uiohook ne sert qu'au collage
    if (this.mode !== m) {
      this.mode = m;
      log('hotkey: mode', m);
      this.emit('mode', m);
    }
  }

  private ensureHook(): void {
    if (this.hookStarted || !this.uio) {
      if (this.hookStarted) this.setMode('hold');
      return;
    }
    if (!this.isTrusted(false)) {
      this.setMode('toggle');
      // Surveille l'octroi de la permission puis bascule en mode maintenu.
      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => {
          if (this.isTrusted(false)) {
            clearInterval(this.pollTimer!);
            this.pollTimer = null;
            this.ensureHook();
          }
        }, 2000);
      }
      return;
    }
    const { uIOhook, UiohookKey } = this.uio;
    const modKeys: Record<'alt' | 'ctrl' | 'shift' | 'meta', number[]> = {
      alt: [UiohookKey.Alt, UiohookKey.AltRight],
      ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
      shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
      meta: [UiohookKey.Meta, UiohookKey.MetaRight],
    };
    uIOhook.on('keydown', (e) => {
      if (e.keycode === UiohookKey.Escape && !this.fnWanted) this.emit('cancel');
      const p = this.parsed;
      if (!p || this.active || e.keycode !== p.keycode) return;
      if (p.mods.alt !== e.altKey || p.mods.ctrl !== e.ctrlKey || p.mods.shift !== e.shiftKey || p.mods.meta !== e.metaKey)
        return;
      this.active = true;
      this.emit('down');
    });
    uIOhook.on('keyup', (e) => {
      const p = this.parsed;
      if (!p || !this.active) return;
      const isMod = (Object.keys(p.mods) as (keyof Parsed['mods'])[]).some((m) => p.mods[m] && modKeys[m].includes(e.keycode));
      if (e.keycode === p.keycode || isMod) {
        this.active = false;
        this.emit('up');
      }
    });
    try {
      uIOhook.start();
      this.hookStarted = true;
      this.setMode('hold');
    } catch (e) {
      log('hotkey: uIOhook.start a échoué', e);
      this.setMode('toggle');
    }
  }

  /** À appeler quand l'Accessibilité vient d'être accordée : passe en mode maintenu sans redémarrer. */
  recheck(): void {
    if (this.fnWanted && this.fn.status !== 'ready') void this.startFn();
    if (this.pollTimer && this.isTrusted(false)) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.ensureHook();
  }

  private lastToggle = 0;

  private onGlobalShortcut(): void {
    if (this.mode === 'hold') return; // uiohook gère down/up ; ici on ne fait qu'avaler la frappe
    const now = Date.now();
    if (now - this.lastToggle < 300) return; // anti-rebond / répétition
    this.lastToggle = now;
    this.active = !this.active;
    this.emit(this.active ? 'down' : 'up');
  }

  /** Prise de notes en cours : un simple appui sur la touche (fn / Control) l'arrête. */
  setNoteActive(on: boolean): void {
    this.fn.gesture.noteActive = on;
    if (!on) this.fn.gesture.reset();
  }

  /** Appelé par le pipeline s'il force l'arrêt (durée max…) pour resynchroniser. */
  reset(): void {
    this.active = false;
    this.fn.gesture.reset();
  }

  dispose(): void {
    globalShortcut.unregisterAll();
    this.stopFnPoll();
    this.fn.stop();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.hookStarted && this.uio) {
      try {
        this.uio.uIOhook.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

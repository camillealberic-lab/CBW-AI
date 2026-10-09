import { BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, screen, Tray } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaState } from '../shared/types';
import { distDir, log, resourcesDir } from './paths';
import { isTrustedSender } from './security';

const LABEL: Record<DictaState, string> = {
  idle: 'Prêt',
  recording: 'Enregistrement…',
  transcribing: 'Transcription…',
  cleaning: 'Nettoyage…',
  inserting: 'Insertion…',
  done: 'Terminé',
  error: 'Erreur',
};

const iconName = (state: DictaState): string =>
  state === 'recording'
    ? 'trayRecordingTemplate.png'
    : state === 'transcribing' || state === 'cleaning' || state === 'inserting'
      ? 'trayBusyTemplate.png'
      : 'trayTemplate.png';

const cache = new Map<string, Electron.NativeImage>();
function iconFor(state: DictaState): Electron.NativeImage {
  const name = iconName(state);
  const hit = cache.get(name);
  if (hit) return hit;
  const dir = [path.join(resourcesDir(), 'assets', 'tray'), path.join(distDir(), 'assets', 'tray')].find((d) => fs.existsSync(d)) ?? '';
  let img: Electron.NativeImage | null = null;
  for (const f of [name, 'trayTemplate.png']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      img = nativeImage.createFromPath(p); // charge aussi @2x
      img.setTemplateImage(true);
      break;
    }
  }
  img ??= placeholderIcon();
  cache.set(name, img);
  return img;
}

/** Icône de repli : 5 barres verticales arrondies (template, 18x18 @2x). */
function placeholderIcon(): Electron.NativeImage {
  const S = 36;
  const buf = Buffer.alloc(S * S * 4);
  const heights = [10, 20, 28, 20, 10];
  const bw = 4;
  const gap = 3;
  const x0 = Math.round((S - (heights.length * bw + (heights.length - 1) * gap)) / 2);
  heights.forEach((h, i) => {
    const x = x0 + i * (bw + gap);
    const y0 = Math.round((S - h) / 2);
    for (let y = y0; y < y0 + h; y++)
      for (let dx = 0; dx < bw; dx++) {
        const o = (y * S + x + dx) * 4;
        buf[o + 3] = 255; // BGRA noir opaque (template)
      }
  });
  const img = nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 2 });
  img.setTemplateImage(true);
  return img;
}

/** État affiché par le popover de la barre de menus (design/tray/tray.html). */
export interface TrayPopoverState {
  /** Code couleur : 'rec' orange (dictée / note), 'ia' bleu (transcription / nettoyage), 'ready' vert, 'error'. */
  tone: 'ready' | 'rec' | 'ia' | 'error';
  label: string;
  detail: string;
  dictating: boolean;
  canDictate: boolean;
  note: { active: boolean; paused: boolean; elapsedMs: number; busy: boolean };
  canNote: boolean;
  shortcuts: { dictate: string; note: string };
  today: { words: number; dictations: number; savedMin: number };
  last: { text: string; at: string } | null;
  alerts: { id: string; label: string; action?: string }[];
  version: string;
  update: { ready: boolean; version?: string };
  theme: 'light' | 'dark' | 'system';
}

/** Actions acceptées depuis le popover (liste fermée). */
export const TRAY_ACTIONS = [
  'dictate',
  'note',
  'notePause',
  'openApp',
  'settings',
  'quit',
  'install',
  'grantAx',
  'grantMic',
  'downloadModel',
] as const;
export type TrayAction = (typeof TRAY_ACTIONS)[number];

export interface TrayHandlers {
  getState(): TrayPopoverState;
  action(name: TrayAction): void;
  copyLast(): boolean;
  /** Menu natif de secours (clic droit). */
  contextMenu(): Electron.MenuItemConstructorOptions[];
}

const W = 320;

/**
 * Icône de barre de menus : clic → popover au design de l'app (design/tray/tray.html, pont preload-tray),
 * clic droit → menu natif de secours.
 */
export class AppTray {
  private tray: Tray;
  private state: DictaState = 'idle';
  private message = '';
  private pop: BrowserWindow | null = null;
  private ready = false;
  private lastSent = '';
  private hiddenAt = 0;
  private height = 420;

  constructor(private h: TrayHandlers) {
    this.tray = new Tray(iconFor('idle'));
    this.tray.setToolTip('CBW AI');
    this.tray.setIgnoreDoubleClickEvents(true);
    this.tray.on('click', () => this.toggle());
    this.tray.on('right-click', () => this.tray.popUpContextMenu(Menu.buildFromTemplate(this.h.contextMenu())));
    ipcMain.handle('tray:getState', (e) => (this.trusted(e) ? this.h.getState() : null));
    ipcMain.handle('tray:copyLast', (e) => (this.trusted(e) ? this.h.copyLast() : false));
    ipcMain.on('tray:action', (e, name: unknown) => {
      if (!this.trusted(e) || typeof name !== 'string') return;
      if (name === 'hide') return this.hide();
      if (!(TRAY_ACTIONS as readonly string[]).includes(name)) return;
      // Fenêtres / dictée : on referme d'abord (le collage vise l'app au premier plan).
      if (name !== 'notePause' && name !== 'install') this.hide();
      this.h.action(name as TrayAction);
    });
    ipcMain.on('tray:resize', (e, hgt: unknown) => {
      if (!this.trusted(e) || typeof hgt !== 'number' || !Number.isFinite(hgt)) return;
      const next = Math.max(160, Math.min(720, Math.ceil(hgt)));
      if (next === this.height) return;
      this.height = next;
      if (this.pop && !this.pop.isDestroyed()) {
        const b = this.pop.getBounds();
        this.pop.setBounds({ ...b, height: next });
        if (this.pop.isVisible()) this.place();
      }
    });
  }

  private trusted(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
    return !!this.pop && !this.pop.isDestroyed() && isTrustedSender(e, this.pop.webContents);
  }

  setState(state: DictaState, message = ''): void {
    if (state !== this.state || message !== this.message) {
      const iconChanged = iconName(state) !== iconName(this.state);
      this.state = state;
      this.message = message;
      if (iconChanged) this.tray.setImage(iconFor(state));
      this.tray.setToolTip(`CBW AI — ${LABEL[state]}${message ? ` (${message})` : ''}`);
    }
    this.refresh();
  }

  /** Compatibilité : anciennement reconstruction du menu ; pousse désormais l'état au popover visible. */
  rebuild(): void {
    this.refresh();
  }

  /** Envoie l'état au popover s'il est visible et a changé. */
  refresh(): void {
    if (!this.pop || this.pop.isDestroyed() || !this.pop.isVisible() || !this.ready) return;
    let st: TrayPopoverState;
    try {
      st = this.h.getState();
    } catch (e) {
      return void log('tray: état', e);
    }
    const key = JSON.stringify(st);
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.pop.webContents.send('tray:state', st);
  }

  get visible(): boolean {
    return !!this.pop && !this.pop.isDestroyed() && this.pop.isVisible();
  }

  toggle(): void {
    if (this.visible) return this.hide();
    // Le clic sur l'icône fait d'abord perdre le focus (blur → hide) : ne pas rouvrir aussitôt.
    if (Date.now() - this.hiddenAt < 300) return;
    this.show();
  }

  hide(): void {
    if (!this.visible) return;
    this.hiddenAt = Date.now();
    this.pop!.hide();
  }

  show(): void {
    const win = this.ensure();
    this.lastSent = '';
    this.place();
    win.show();
    win.focus();
    this.refresh();
  }

  private place(): void {
    if (!this.pop || this.pop.isDestroyed()) return;
    const tb = this.tray.getBounds();
    const disp = tb.width ? screen.getDisplayMatching(tb) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = disp.workArea;
    const anchorX = tb.width ? tb.x + tb.width / 2 : wa.x + wa.width - W / 2 - 8;
    const x = Math.round(Math.max(wa.x + 8, Math.min(anchorX - W / 2, wa.x + wa.width - W - 8)));
    const y = Math.round(tb.height ? Math.max(wa.y, tb.y + tb.height) + 6 : wa.y + 6);
    this.pop.setBounds({ x, y, width: W, height: this.height });
  }

  private ensure(): BrowserWindow {
    if (this.pop && !this.pop.isDestroyed()) return this.pop;
    const theme = String(this.h.getState().theme);
    const dark = theme === 'dark' || (theme === 'system' && nativeDark());
    const win = new BrowserWindow({
      width: W,
      height: this.height,
      show: false,
      frame: false,
      roundedCorners: false,
      transparent: false,
      backgroundColor: dark ? '#1A1B1D' : '#FFFFFF',
      hasShadow: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // NSPanel non activable : au-dessus des apps en plein écran, sans voler l'app au premier plan.
      type: 'panel',
      hiddenInMissionControl: true,
      webPreferences: {
        preload: path.join(distDir(), 'main', 'preload-tray.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // CBW_TRAY_OPEN=1 (test) : reste ouvert même sans focus, pour la capture d'écran.
    win.on('blur', () => process.env.CBW_TRAY_OPEN !== '1' && this.hide());
    win.on('closed', () => {
      this.pop = null;
      this.ready = false;
    });
    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      this.lastSent = '';
      this.refresh();
    });
    const query: Record<string, string> = theme === 'light' || theme === 'dark' ? { theme } : {};
    void win.loadFile(path.join(distDir(), 'design', 'tray', 'tray.html'), { query }).catch((e) => log('tray: chargement', e));
    this.pop = win;
    return win;
  }

  /** Thème changé : la page relit `theme` dans l'état ; le fond natif suit. */
  setTheme(theme: string): void {
    if (!this.pop || this.pop.isDestroyed()) return;
    const dark = theme === 'dark' || (theme === 'system' && nativeDark());
    this.pop.setBackgroundColor(dark ? '#1A1B1D' : '#FFFFFF');
    this.refresh();
  }
}

function nativeDark(): boolean {
  return nativeTheme.shouldUseDarkColors;
}

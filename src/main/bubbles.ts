import { BrowserWindow, ipcMain, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Brainstorm, BubblesState } from '../shared/types';
import type { BrainstormManager } from './brainstorm';
import { distDir, log } from './paths';
import { isTrustedSender } from './security';

/**
 * Bulles du Brainstorm v2 (docs/APP_API.md › Brainstorm v2) : panneau macOS non activable, toujours au-dessus,
 * sur tous les bureaux (plein écran compris), en bas à droite de l'écran du curseur, au-dessus du Dock.
 * Cliquable sans voler le focus : NSPanel « nonactivating » (type 'panel') + focusable:false + showInactive,
 * jamais focus(). Hors des cartes, la fenêtre laisse passer la souris (setIgnoreMouseEvents + forward).
 * Visible seulement pendant le vidage (état 'recording', y compris fin de transcription).
 */

const W = 380;
const H = 420;
const MARGIN = 16;
/** Laisse le temps à la dernière carte répondue de se cocher puis de s'effacer (800 ms). */
const HIDE_DELAY_MS = 900;

/** Bas-droite de la zone utile (workArea : au-dessus du Dock, sous la barre de menus). Exportée pour les tests. */
export function bubblesBounds(d: Pick<Electron.Display, 'workArea'>): Electron.Rectangle {
  const wa = d.workArea;
  return { x: Math.round(wa.x + wa.width - W - MARGIN), y: Math.round(wa.y + wa.height - H - MARGIN), width: W, height: H };
}

export class Bubbles {
  private win: BrowserWindow | null = null;
  private loaded = false;
  private last: BubblesState = { live: [], title: '', recording: false, elapsedMs: 0 };
  private lastJson = '';
  private shown = false;
  private hovered = false;
  private hideTimer: NodeJS.Timeout | null = null;
  private follow: NodeJS.Timeout | null = null;
  private bsId = '';

  constructor(private bs: BrainstormManager) {
    bs.on('update', (b: Brainstorm) => this.onUpdate(b));
    // Messages acceptés uniquement depuis la fenêtre des bulles ; textes bornés.
    const ok = (e: Electron.IpcMainEvent): boolean => isTrustedSender(e, this.win && !this.win.isDestroyed() ? this.win.webContents : null);
    const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
    ipcMain.on('bubbles:answer', (e, qid: unknown, text: unknown) => ok(e) && this.act(() => bs.answerLive(this.bsId, s(qid, 40), s(text, 4000))));
    ipcMain.on('bubbles:dismiss', (e, qid: unknown) => ok(e) && this.act(() => bs.dismissLive(this.bsId, s(qid, 40))));
    ipcMain.on('bubbles:hover', (e, on: unknown) => ok(e) && this.setInteractive(!!on));
  }

  private act(fn: () => void): void {
    try {
      if (this.bsId) fn();
    } catch (e) {
      log('bulles:', e instanceof Error ? e.message : e);
    }
  }

  private onUpdate(b: Brainstorm): void {
    if (!b.id) return; // refus sans session (toast côté app)
    const recording = b.state === 'recording';
    if (recording) this.bsId = b.id;
    else if (b.id !== this.bsId) return;
    this.last = { live: b.live ?? [], title: b.title || '', recording, elapsedMs: b.elapsedMs ?? 0 };
    this.push();
    if (recording) this.show();
    else this.scheduleHide();
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      width: W,
      height: H,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      type: 'panel', // NSPanel non activable : un clic n'active pas CBW AI
      hiddenInMissionControl: true,
      acceptFirstMouse: true, // le premier clic sur une suggestion compte (fenêtre jamais « key »)
      webPreferences: {
        preload: path.join(distDir(), 'main', 'preload-bubbles.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    this.win = win;
    this.loaded = false;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    this.hovered = false;
    const designed = path.join(distDir(), 'design', 'bubbles', 'bubbles.html');
    const file = fs.existsSync(designed) ? designed : path.join(distDir(), 'renderer', 'bubbles-fallback.html');
    void win.loadFile(file).then(() => {
      this.loaded = true;
      this.lastJson = '';
      this.push();
    });
    const again = (): void => this.reposition();
    screen.on('display-metrics-changed', again);
    screen.on('display-added', again);
    screen.on('display-removed', again);
    win.on('closed', () => {
      screen.off('display-metrics-changed', again);
      screen.off('display-added', again);
      screen.off('display-removed', again);
      if (this.follow) clearInterval(this.follow);
      this.follow = null;
      this.win = null;
    });
    return win;
  }

  private show(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    const win = this.ensure();
    if (!this.shown) {
      this.shown = true;
      this.reposition();
      win.showInactive(); // jamais show()/focus() : l'app active garde le focus
      // suit l'écran du curseur (comme la pastille), se réaffiche si macOS l'a masquée (bureau, plein écran)
      if (this.follow) clearInterval(this.follow);
      this.follow = setInterval(() => {
        if (!this.win || this.win.isDestroyed() || !this.shown) return;
        if (!this.hovered) this.reposition();
        if (!this.win.isVisible()) this.win.showInactive();
        this.win.setAlwaysOnTop(true, 'screen-saver');
      }, 500);
      // Survol fiable même si macOS ne transmet pas les mouvements à un panneau d'app inactive :
      // le main teste lui-même si le curseur est sur une carte (elementFromPoint), ~16×/s.
      if (this.hit) clearInterval(this.hit);
      this.hit = setInterval(() => void this.hitTest(), 60);
    } else if (!win.isVisible()) win.showInactive();
  }

  private scheduleHide(): void {
    if (!this.shown || this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.shown = false;
      if (this.follow) clearInterval(this.follow);
      this.follow = null;
      if (this.hit) clearInterval(this.hit);
      this.hit = null;
      this.setInteractive(false);
      if (this.win && !this.win.isDestroyed()) this.win.hide();
    }, HIDE_DELAY_MS);
  }

  private hit: NodeJS.Timeout | null = null;
  private probing = false;
  private async hitTest(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed() || !this.loaded || this.probing) return;
    const c = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = c.x - b.x;
    const y = c.y - b.y;
    if (x < 0 || y < 0 || x >= b.width || y >= b.height) return void this.setInteractive(false);
    this.probing = true;
    try {
      const on = (await win.webContents.executeJavaScript(
        `(() => { const e = document.elementFromPoint(${x}, ${y}); return !!(e && e.closest && e.closest('.card, #head, .c, #h')); })()`,
      )) as boolean;
      this.setInteractive(!!on);
    } catch {
      /* fenêtre en cours de rechargement */
    } finally {
      this.probing = false;
    }
  }

  /** Carte / en-tête survolé → cliquable ; sinon la souris traverse (forward : survol toujours détecté). */
  setInteractive(on: boolean): void {
    if (!this.win || this.win.isDestroyed() || on === this.hovered) return;
    this.hovered = on;
    this.win.setIgnoreMouseEvents(!on, { forward: true });
  }

  reposition(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const r = bubblesBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    const b = this.win.getBounds();
    if (b.x !== r.x || b.y !== r.y || b.width !== r.width || b.height !== r.height) this.win.setBounds(r);
  }

  get visible(): boolean {
    return this.shown;
  }

  private push(): void {
    if (!this.win || this.win.isDestroyed() || !this.loaded) return;
    // timer seul à chaque niveau micro (~10×/s) : on n'envoie qu'au changement de seconde ou de contenu
    const key = JSON.stringify({ ...this.last, elapsedMs: Math.floor(this.last.elapsedMs / 1000) });
    if (key === this.lastJson) return;
    this.lastJson = key;
    this.win.webContents.send('bubbles:state', this.last);
  }

  /**
   * Autotest : clic (mouseDown/mouseUp injectés dans la page, sans passer par macOS) sur la 1re suggestion
   * affichée. Renvoie son texte, ou null si aucune suggestion n'est visible.
   */
  async debugClick(): Promise<string | null> {
    if (!this.win || this.win.isDestroyed() || !this.loaded) return null;
    const r = (await this.win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector('[data-act="answer"], .s button'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: b.textContent.trim() }; })()`,
    )) as { x: number; y: number; t: string } | null;
    if (!r) return null;
    this.setInteractive(true);
    const wc = this.win.webContents;
    wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return r.t;
  }

  async capture(): Promise<Buffer | null> {
    if (!this.win || this.win.isDestroyed()) return null;
    return (await this.win.webContents.capturePage()).toPNG();
  }
}

import { BrowserWindow, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaStatus } from '../shared/types';
import { distDir } from './paths';
import { settings } from './settings';

const W = 520;
const H = 64;
/** Pastille (design/overlay : --tag-h 30 px) centrée verticalement dans la fenêtre de H px. */
const PILL_INSET = (H - 30) / 2;
/** Marge transparente de chaque côté de la pastille au repos (la fenêtre est plus large que la pastille). */
const PILL_SIDE = 70; // (520 − 380 px de pastille max) / 2 : la pastille reste toujours entière à l’écran
/** Écart pastille ↔ haut du Dock (Dock en bas) / ↔ bord de l'écran (Dock masqué, à gauche/droite, plein écran). */
const GAP_DOCK = 8;
const GAP_EDGE = 12;

/**
 * Position de la fenêtre : tout en bas de l'écran, juste au-dessus du Dock s'il occupe le bas
 * (workArea plus courte que bounds en bas), sinon à 12 px du bord. Exportée pour les tests.
 */
export function overlayBounds(d: Pick<Electron.Display, 'bounds' | 'workArea'>): Electron.Rectangle {
  const b = d.bounds;
  const wa = d.workArea;
  const screenBottom = b.y + b.height;
  const waBottom = wa.y + wa.height;
  const dockAtBottom = waBottom < screenBottom - 1; // Dock à gauche/droite : le bas de workArea = bas de l'écran
  const pillBottom = dockAtBottom ? waBottom - GAP_DOCK : screenBottom - GAP_EDGE;
  const y = Math.round(pillBottom + PILL_INSET - H);
  const x = Math.round(wa.x + (wa.width - W) / 2);
  return { x, y, width: W, height: H };
}

/** Position choisie par l'utilisateur (glisser la pastille) : « idÉcran:x:y », x / y relatifs au coin de l'écran. */
const POS_KEY = 'overlay.position';
function savedBounds(d: Electron.Display): Electron.Rectangle | null {
  const m = /^(\d+):(-?\d+):(-?\d+)$/.exec(String(settings.get(POS_KEY) ?? ''));
  if (!m || Number(m[1]) !== d.id) return null;
  return clampTo(d, { x: d.bounds.x + Number(m[2]), y: d.bounds.y + Number(m[3]), width: W, height: H });
}
/** Garde la pastille entièrement visible sur l'écran (barre des menus comprise). */
function clampTo(d: Electron.Display, r: Electron.Rectangle): Electron.Rectangle {
  const b = d.bounds;
  return {
    ...r,
    x: Math.round(Math.min(Math.max(r.x, b.x - PILL_SIDE), b.x + b.width - W + PILL_SIDE)),
    y: Math.round(Math.min(Math.max(r.y, d.workArea.y - PILL_INSET), b.y + b.height - H + PILL_INSET)),
  };
}

export class Overlay {
  private win: BrowserWindow | null = null;
  private loaded = false;
  private last: DictaStatus = { state: 'idle' };

  create(idleMode: 'dim' | 'hidden'): void {
    this.win = new BrowserWindow({
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
      // NSPanel non activable : reste au-dessus des apps en plein écran et de tous les bureaux (comme Wispr Flow).
      type: 'panel',
      hiddenInMissionControl: true,
      webPreferences: {
        preload: path.join(distDir(), 'main', 'preload-overlay.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    // skipTransformProcessType : ne pas faire disparaître l'icône du Dock en basculant la politique d'activation.
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // Laisse passer les clics, mais transmet les mouvements de souris au rendu (détection du survol).
    this.win.setIgnoreMouseEvents(true, { forward: true });
    // Dock affiché / masqué, résolution, écran branché… → recalcul.
    const again = (): void => this.reposition();
    screen.on('display-metrics-changed', again);
    screen.on('display-added', again);
    screen.on('display-removed', again);
    const designed = path.join(distDir(), 'design', 'overlay', 'overlay.html');
    const file = fs.existsSync(designed) ? designed : path.join(distDir(), 'renderer', 'overlay-fallback.html');
    void this.win.loadFile(file, { query: { idle: idleMode } }).then(() => {
      this.loaded = true;
      this.push(this.last);
    });
    this.reposition();
    this.win.showInactive();
    // Toujours présente, sur toutes les pages : suit l'écran du curseur, se réaffiche si macOS l'a masquée
    // (changement de bureau, sortie de veille, plein écran).
    this.follow = setInterval(() => {
      if (!this.win || this.win.isDestroyed()) return;
      if (!this.hovered) this.reposition();
      if (!this.win.isVisible()) this.win.showInactive();
      this.win.setAlwaysOnTop(true, 'screen-saver');
    }, 500);
    this.win.on('closed', () => this.follow && clearInterval(this.follow));
  }

  private follow: NodeJS.Timeout | null = null;
  private hovered = false;

  /** Pastille survolée → fenêtre cliquable ; sinon transparente à la souris (forward pour garder le survol). */
  setInteractive(on: boolean): void {
    if (!this.win || this.win.isDestroyed() || on === this.hovered) return;
    if (!on && this.drag) return; // le curseur peut devancer la fenêtre pendant le glisser : rester cliquable
    this.hovered = on;
    this.win.setIgnoreMouseEvents(!on, { forward: true });
  }

  /** Bas-centre de l'écran qui contient le curseur (au-dessus du Dock s'il est en bas). */
  reposition(): void {
    if (!this.win || this.win.isDestroyed() || this.drag) return;
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const r = savedBounds(d) ?? overlayBounds(d);
    const b = this.win.getBounds();
    if (b.x !== r.x || b.y !== r.y) this.win.setBounds(r);
  }

  private drag: { dx: number; dy: number; timer: NodeJS.Timeout } | null = null;

  /** Glisser la pastille : la fenêtre suit le curseur (sondé à 60 Hz) ; la position est mémorisée à la fin. */
  dragStart(): void {
    if (!this.win || this.win.isDestroyed() || this.drag) return;
    const c = screen.getCursorScreenPoint();
    const b = this.win.getBounds();
    const timer = setInterval(() => {
      if (!this.win || this.win.isDestroyed() || !this.drag) return;
      const p = screen.getCursorScreenPoint();
      const d = screen.getDisplayNearestPoint(p);
      this.win.setBounds(clampTo(d, { x: p.x - this.drag.dx, y: p.y - this.drag.dy, width: W, height: H }));
    }, 16);
    this.drag = { dx: c.x - b.x, dy: c.y - b.y, timer };
  }

  dragEnd(): void {
    if (!this.drag) return;
    clearInterval(this.drag.timer);
    this.drag = null;
    if (!this.win || this.win.isDestroyed()) return;
    const b = this.win.getBounds();
    const d = screen.getDisplayMatching(b);
    settings.set(POS_KEY, `${d.id}:${b.x - d.bounds.x}:${b.y - d.bounds.y}`);
  }

  /** Double-clic sur la pastille ou Réglages › Réinitialiser : retour à la place par défaut (bas de l'écran). */
  resetPosition(): void {
    settings.set(POS_KEY, '');
    this.reposition();
  }

  setIdleMode(mode: 'dim' | 'hidden'): void {
    this.win?.webContents.executeJavaScript(`window.setIdleMode && window.setIdleMode(${JSON.stringify(mode)})`).catch(() => undefined);
  }

  private settle: NodeJS.Timeout | null = null;

  setStatus(s: DictaStatus): void {
    const prev = this.last.state;
    this.last = s;
    // « Terminé » / « erreur » ne restent jamais affichés : retour au repos automatique
    // (dictée ou note), sauf si un nouvel état arrive entre-temps.
    if (this.settle) clearTimeout(this.settle);
    this.settle = null;
    if (s.state === 'done' || s.state === 'error') {
      this.settle = setTimeout(() => this.setStatus({ state: 'idle' }), s.state === 'error' ? 3000 : 1600);
    }
    // Recalculé à chaque apparition (début de dictée / note) : écran du curseur, Dock affiché ou non.
    if (s.state !== prev && (prev === 'idle' || prev === 'done' || prev === 'error')) this.reposition();
    if (this.win && !this.win.isVisible()) {
      this.reposition();
      this.win.showInactive();
    }
    this.push(s);
  }

  async capture(): Promise<Buffer | null> {
    if (!this.win) return null;
    return (await this.win.webContents.capturePage()).toPNG();
  }

  private push(s: DictaStatus): void {
    // Aucun mot dicté n'apparaît dans la pastille : on garde barres + états, jamais le texte.
    const { partialText: _hidden, ...visible } = s;
    if (this.win && this.loaded) this.win.webContents.send('overlay:status', visible);
  }
}

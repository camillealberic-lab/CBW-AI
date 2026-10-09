import { BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { distDir, log } from './paths';
import { isTrustedSender } from './security';

/**
 * Fenêtre « Nouvelle version » (design/update/update.html) : sans cadre, centrée sur l'écran du curseur, au premier plan,
 * hors Dock / Mission Control. Une seule instance. Pilotée par updater.ts (quand l'afficher, quoi faire des boutons).
 */
export interface PopupData {
  current: string;
  version: string;
  notes?: string;
  message?: string;
}
export interface PopupHandlers {
  install: () => { ok: boolean; message?: string };
  later: () => void;
}

const W = 440;
const H_DEFAULT = 360;
const H_MIN = 260;
const H_MAX = 600;

let win: BrowserWindow | null = null;
let data: PopupData | null = null;
let handlers: PopupHandlers | null = null;
let ipcReady = false;

function sender(): Electron.WebContents | null {
  return win && !win.isDestroyed() ? win.webContents : null;
}

function initIpc(): void {
  if (ipcReady) return;
  ipcReady = true;
  ipcMain.handle('update-popup:install', (e) => {
    if (!isTrustedSender(e, sender()) || !handlers) return { ok: false, message: 'Indisponible' };
    const r = handlers.install();
    if (!r.ok) log('update: installation refusée —', r.message);
    return r;
  });
  ipcMain.on('update-popup:later', (e) => {
    if (!isTrustedSender(e, sender())) return;
    handlers?.later();
  });
  ipcMain.on('update-popup:resize', (e, h: unknown) => {
    if (!isTrustedSender(e, sender()) || typeof h !== 'number' || !Number.isFinite(h)) return;
    place(Math.round(Math.min(H_MAX, Math.max(H_MIN, h))));
    reveal();
  });
}

/** Centre la fenêtre (hauteur h) sur l'écran qui contient le curseur, un peu au-dessus du milieu. */
function place(h: number): void {
  if (!win || win.isDestroyed()) return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = d.workArea;
  const x = Math.round(wa.x + (wa.width - W) / 2);
  const y = Math.round(wa.y + Math.max(0, (wa.height - h) / 2 - wa.height * 0.06));
  win.setBounds({ x, y, width: W, height: h });
}

function reveal(): void {
  if (!win || win.isDestroyed() || win.isVisible()) return;
  win.setAlwaysOnTop(true, 'floating');
  win.show();
  win.focus(); // panneau : devient la fenêtre clé (Entrée / Échap) sans changer de bureau
  win.webContents.focus();
}

/** Affiche (ou met à jour) la fenêtre. */
export function showUpdatePopup(d: PopupData, h: PopupHandlers): void {
  data = d;
  handlers = h;
  initIpc();
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-popup:data', data);
    if (!win.isVisible()) reveal();
    else {
      win.moveTop();
      win.focus();
    }
    return;
  }
  const file = path.join(distDir(), 'design', 'update', 'update.html');
  if (!fs.existsSync(file)) {
    log('update: fenêtre introuvable', file);
    return;
  }
  win = new BrowserWindow({
    width: W,
    height: H_DEFAULT,
    show: false,
    frame: false,
    roundedCorners: false, // identité CBW : coins carrés, le filet de 2 px est dessiné par la page
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    alwaysOnTop: true,
    // NSPanel : visible aussi au-dessus d'une app en plein écran (une fenêtre normale resterait sur son bureau).
    type: 'panel',
    title: 'Mise à jour de CBW AI',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1A1B1D' : '#FFFFFF',
    webPreferences: {
      preload: path.join(distDir(), 'main', 'preload-update.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  // Apparaît sur le bureau (Space) courant, même au-dessus d'une app en plein écran.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  place(H_DEFAULT);
  win.on('closed', () => {
    win = null;
  });
  win.webContents.on('did-finish-load', () => {
    if (data) win?.webContents.send('update-popup:data', data);
    setTimeout(reveal, 800); // filet : la page n'a pas signalé sa hauteur
  });
  void win.loadFile(file);
}

/** Ferme la fenêtre (Plus tard, mise à jour lancée, plus de mise à jour prête). */
export function closeUpdatePopup(): void {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

/** Tests : clique « Mettre à jour » dans la page (même chemin que l'utilisateur). */
export function clickUpdatePopup(): void {
  void sender()?.executeJavaScript("document.getElementById('go').click()");
}

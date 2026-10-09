import { Menu, nativeImage, Tray } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaState } from '../shared/types';
import { distDir, resourcesDir } from './paths';

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

export interface TrayHandlers {
  openApp(): void;
  openSettings(): void;
  quit(): void;
  extraItems(): Electron.MenuItemConstructorOptions[];
}

export class AppTray {
  private tray: Tray;
  private state: DictaState = 'idle';
  private message = '';

  constructor(private h: TrayHandlers) {
    this.tray = new Tray(iconFor('idle'));
    this.tray.setToolTip('CBW AI');
    this.rebuild();
  }

  setState(state: DictaState, message = ''): void {
    if (state === this.state && message === this.message) return;
    const iconChanged = iconName(state) !== iconName(this.state);
    this.state = state;
    this.message = message;
    if (iconChanged) this.tray.setImage(iconFor(state));
    this.tray.setToolTip(`CBW AI — ${LABEL[state]}${message ? ` (${message})` : ''}`);
    this.rebuild();
  }

  rebuild(): void {
    const menu = Menu.buildFromTemplate([
      { label: `État : ${LABEL[this.state]}${this.message ? ` — ${this.message}` : ''}`, enabled: false },
      ...this.h.extraItems(),
      { type: 'separator' },
      { label: 'Ouvrir CBW AI', click: () => this.h.openApp() },
      { label: 'Réglages…', accelerator: 'Command+,', click: () => this.h.openSettings() },
      { type: 'separator' },
      { label: 'Quitter CBW AI', accelerator: 'Command+Q', click: () => this.h.quit() },
    ]);
    this.tray.setContextMenu(menu);
  }
}

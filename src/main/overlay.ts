import { BrowserWindow, ipcMain, Menu, screen, systemPreferences } from 'electron';
import { EventEmitter } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import { findBin } from './whisper';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaStatus } from '../shared/types';
import { HIDE_MS, isHiddenAt, LANGUAGES, languageOf, previewTail } from './keysLogic';
import { distDir } from './paths';
import { settings } from './settings';
import { playSound } from './sounds';

const W = 520;
const H = 64;
/** Pastille (design/overlay : --tag-h 30 px) centrée verticalement dans la fenêtre de H px. */
const PILL_INSET = (H - 30) / 2;
/** Marge transparente de chaque côté de la pastille au repos (la fenêtre est plus large que la pastille). */
const PILL_SIDE = 70; // (520 − 380 px de pastille max) / 2 : la pastille reste toujours entière à l’écran
/** Écart pastille ↔ haut du Dock (Dock en bas) / ↔ bord de l'écran (Dock masqué, à gauche/droite, plein écran). */
const GAP_DOCK = 5;
const GAP_EDGE = 5;
/** Lâchée à moins de MAGNET px de sa place (centre à centre), la pastille s'y aimante. */
const MAGNET = 60;
/** Au-delà de FAR px, l'emplacement est vide ; il se remplit jusqu'à MAGNET. */
const FAR = 260;
const reducedMotion = (): boolean => {
  try { return systemPreferences.getAnimationSettings().prefersReducedMotion; } catch { return false; }
};

/** Réglages du Dock (masquage auto, taille, côté), relus toutes les 10 s : le Dock masqué ne réduit pas workArea. */
const dockPrefs = { autohide: false, tile: 48, bottom: true };
function readDockPrefs(): void {
  execFile('/usr/bin/defaults', ['export', 'com.apple.dock', '-'], { timeout: 3000 }, (err, out) => {
    if (err) return;
    const val = (k: string): string | undefined => new RegExp(`<key>${k}</key>\\s*<([a-z]+)>?([^<]*)`).exec(out)?.slice(1).join(' ');
    const ah = val('autohide');
    dockPrefs.autohide = !!ah && ah.startsWith('true');
    const t = Number(val('tilesize')?.split(' ')[1]);
    if (t > 0) dockPrefs.tile = t;
    const o = val('orientation')?.split(' ')[1];
    dockPrefs.bottom = !o || o === 'bottom';
  });
}
/** Écrans occupés par une app en plein écran (helper dicta-fullscreen) : pas de Dock → 5 px du bas. */
let fullScreens: Electron.Rectangle[] = [];
function watchFullScreen(onChange: () => void): void {
  const bin = findBin('dicta-fullscreen', process.env.DICTA_FULLSCREEN_BIN);
  if (!bin) return;
  const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '';
  p.stdout.on('data', (c: Buffer) => {
    buf += c.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      fullScreens = line.startsWith('full ')
        ? line.slice(5).split(';').map((r) => {
            const [x, y, width, height] = r.split(',').map(Number);
            return { x, y, width, height };
          })
        : [];
      onChange();
    }
  });
  p.on('error', () => undefined);
}
const isFull = (b: Electron.Rectangle): boolean =>
  fullScreens.some((f) => Math.abs(f.x - b.x) < 2 && Math.abs(f.y - b.y) < 2 && Math.abs(f.width - b.width) < 2);

/** Hauteur approximative du Dock masqué quand il surgit (icônes + marges). */
const shownDockHeight = (): number => Math.round(dockPrefs.tile + 18);

/**
 * Position de la fenêtre : tout en bas de l'écran, juste au-dessus du Dock s'il occupe le bas
 * (workArea plus courte que bounds en bas) ou du Dock masqué quand il surgit, sinon à 5 px du bord. Exportée pour les tests.
 */
export function overlayBounds(d: Pick<Electron.Display, 'bounds' | 'workArea'>, autoDockShown = 0): Electron.Rectangle {
  const b = d.bounds;
  const wa = d.workArea;
  const screenBottom = b.y + b.height;
  const waBottom = wa.y + wa.height;
  // Dock à gauche/droite : le bas de workArea = bas de l'écran. App en plein écran : pas de Dock (workArea périmée).
  const dockAtBottom = waBottom < screenBottom - 1 && !isFull(b);
  const pillBottom = dockAtBottom
    ? waBottom - GAP_DOCK
    : autoDockShown > 0 ? screenBottom - autoDockShown - GAP_DOCK : screenBottom - GAP_EDGE;
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

/** Réglages de la pastille lus ici (clés, défauts : voir chantiers/wispr-parite/api-keys.md). */
const LIVE_KEY = 'overlay.livePreview'; // défaut false : aucun texte dans la pastille
const HIDDEN_KEY = 'overlay.hiddenUntil'; // epoch ms ; 0 = visible
const LANG_KEY = 'general.language';

/** Événements : 'hiddenChange' (hidden: boolean, until: number). */
export class Overlay extends EventEmitter {
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
      // La fenêtre (64 px) déborde sous l'écran quand la pastille (30 px) est à 5 px du bas : sans ça, macOS la remonte.
      enableLargerThanScreen: true,
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
    this.applyVisibility();
    // Toujours présente, sur toutes les pages : suit l'écran du curseur, se réaffiche si macOS l'a masquée
    // (changement de bureau, sortie de veille, plein écran).
    this.follow = setInterval(() => {
      if (!this.win || this.win.isDestroyed()) return;
      if (!this.hovered) this.reposition();
      this.applyVisibility();
      this.win.setAlwaysOnTop(true, 'screen-saver');
    }, 500);
    ipcMain.on('overlay:menu', this.onMenu);
    readDockPrefs();
    watchFullScreen(() => this.reposition());
    this.dockPoll = setInterval(() => this.watchAutoDock(), 100);
    this.prefsPoll = setInterval(readDockPrefs, 10_000);
    this.win.on('closed', () => {
      ipcMain.removeListener('overlay:menu', this.onMenu);
      for (const t of [this.follow, this.dockPoll, this.prefsPoll]) if (t) clearInterval(t);
      if (this.slot && !this.slot.isDestroyed()) this.slot.destroy();
    });
  }

  private dockPoll: NodeJS.Timeout | null = null;
  private prefsPoll: NodeJS.Timeout | null = null;
  /** Emplacement aimanté (pointillés) affiché pendant le glisser, à la place par défaut. */
  private slot: BrowserWindow | null = null;
  private slotReady = false;
  private slotQueue: string[] = [];
  private slotKey = '';
  private slotTimers: NodeJS.Timeout[] = [];
  private armed = false;
  private gliding = false;

  /** Exécute du JS dans la fenêtre emplacement (mis en file tant qu'elle n'est pas chargée). */
  private slotJs(code: string): void {
    if (!this.slot || this.slot.isDestroyed()) return;
    if (!this.slotReady) { this.slotQueue.push(code); return; }
    this.slot.webContents.executeJavaScript(code).catch(() => undefined);
  }
  private slotLater(fn: () => void, ms: number): void {
    this.slotTimers.push(setTimeout(fn, ms));
  }
  private clearSlotTimers(): void {
    for (const t of this.slotTimers) clearTimeout(t);
    this.slotTimers = [];
  }

  private slotWindow(): BrowserWindow {
    if (this.slot && !this.slot.isDestroyed()) return this.slot;
    const win = new BrowserWindow({
      width: W, height: H, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      hasShadow: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, enableLargerThanScreen: true,
      type: 'panel', hiddenInMissionControl: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true);
    const html = `<!doctype html><meta charset="utf-8"><style>
      :root{--encre:#1C1C1E;--blanc:#fff;--accent:#FF5A1F;--bleu-vif:#5A67FF;--vert:#1FD26A;--fantome:#8C8C88;
        --ease:cubic-bezier(.2,.7,.2,1);--ease-sortie:cubic-bezier(.16,1,.3,1);--ease-rideau:cubic-bezier(.7,0,.15,1)}
      html,body{margin:0;height:100%;background:transparent;overflow:hidden;pointer-events:none}
      body{display:flex;align-items:center;justify-content:center}
      #s{--l:2px;position:relative;flex:none;width:calc(var(--w,44px) + 8px);height:calc(var(--h,16px) + 8px);
        display:flex;align-items:center;justify-content:center;background:var(--encre);
        box-shadow:inset 0 0 0 1px var(--encre),inset 0 0 0 calc(1px + var(--l)) var(--blanc)}
      #s[data-s="off"]{visibility:hidden;clip-path:inset(100% 0 0 0);transition:none}
      #s[data-s="in"]{visibility:visible;clip-path:inset(0);transition:clip-path 200ms var(--ease-sortie),box-shadow 120ms var(--ease)}
      #s[data-s="out"]{visibility:visible;clip-path:inset(100% 0 0 0);transition:clip-path 160ms var(--ease-rideau)}
      #s[data-s="close"]{visibility:visible;clip-path:inset(4px);transition:clip-path 140ms var(--ease-rideau)}
      .marque{display:flex;align-items:center;gap:3px}
      .marque span{position:relative;display:block;width:5px;height:5px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--fantome);
        transition:transform 120ms var(--ease-sortie)}
      .marque span i{position:absolute;inset:0;display:block;background:var(--c);transform:scaleX(0);transform-origin:0 50%;transition:transform 70ms linear}
      .marque span:nth-child(1){--c:var(--accent)}
      .marque span:nth-child(2){--c:var(--bleu-vif);transition-delay:20ms}
      .marque span:nth-child(3){--c:var(--vert);transition-delay:40ms}
      #s[data-s="in"] .marque span{animation:trace 120ms var(--ease-sortie) both}
      #s[data-s="in"] .marque span:nth-child(1){animation-delay:60ms}
      #s[data-s="in"] .marque span:nth-child(2){animation-delay:80ms}
      #s[data-s="in"] .marque span:nth-child(3){animation-delay:100ms}
      @keyframes trace{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
      #s.proche{--l:3px}
      #s.proche .marque span{transform:scaleY(2)}
      #s.ok{background:var(--vert);box-shadow:inset 0 0 0 1px var(--encre);transition:none}
      #s.ok .marque{visibility:hidden}
      #s.ok[data-s="close"]{transition:clip-path 140ms var(--ease-rideau)}
      @media (prefers-reduced-motion: reduce){
        #s,#s[data-s],#s.ok[data-s="close"]{transition:none!important}
        .marque span,.marque span i{transition:none!important;animation:none!important}
      }
    </style><div id="s" data-s="off"><div class="marque"><span><i></i></span><span><i></i></span><span><i></i></span></div></div>
    <script>
      (function(){
        var s=document.getElementById('s'),f=[].slice.call(s.querySelectorAll('i'));
        var mq=window.matchMedia('(prefers-reduced-motion: reduce)');
        function rm(){return mq.matches}
        window.S={
          show:function(w,h){s.style.setProperty('--w',w+'px');s.style.setProperty('--h',h+'px');s.className='';s.dataset.s='off';
            f.forEach(function(e){e.style.transform='scaleX(0)'});void s.offsetWidth;s.dataset.s='in'},
          set:function(p,near){for(var i=0;i<f.length;i++){var v=Math.max(0,Math.min(1,3*p-i));if(rm())v=v>=.5?1:0;
            f[i].style.transform='scaleX('+v.toFixed(2)+')'}s.classList.toggle('proche',!!near)},
          snap:function(){s.classList.remove('proche');s.classList.add('ok')},
          close:function(){s.dataset.s=rm()?'off':'close'},
          out:function(){s.classList.remove('proche');s.dataset.s=rm()?'off':'out'},
          hide:function(){s.dataset.s='off';s.className=''}
        };
      })();
    <\/script>`;
    win.webContents.once('did-finish-load', () => {
      this.slotReady = true;
      for (const c of this.slotQueue.splice(0)) win.webContents.executeJavaScript(c).catch(() => undefined);
    });
    this.slotReady = false;
    this.slotQueue = [];
    void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    this.slot = win;
    return win;
  }

  /** Distance (centre à centre) entre la pastille et sa place par défaut, sur l'écran donné. */
  private homeDistance(d: Electron.Display, b: Electron.Rectangle): number {
    const h = overlayBounds(d, this.autoDock);
    return Math.hypot(b.x - h.x, b.y - h.y);
  }

  /** Remplissage continu (p quantifié au 0,05) et état « proche » ; n'envoie que si la valeur change. */
  private setSlotProximity(d: number, armed: boolean): void {
    const p = Math.round(Math.max(0, Math.min(1, (FAR - d) / (FAR - MAGNET))) * 20) / 20;
    const near = armed && d < MAGNET;
    const key = `${p}|${near}`;
    if (key === this.slotKey) return;
    this.slotKey = key;
    this.slotJs(`S.set(${p}, ${near})`);
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
    if (!this.win || this.win.isDestroyed() || this.drag || this.gliding) return;
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const home = overlayBounds(d, this.autoDock);
    const saved = savedBounds(d);
    // Position mémorisée tout près de la place par défaut (ancienne version, Dock déplacé…) : on reprend la place aimantée.
    const r = saved && this.homeDistance(d, saved) >= MAGNET ? saved : home;
    const b = this.win.getBounds();
    if (b.x !== r.x || b.y !== r.y) this.win.setBounds(r);
  }

  /** Hauteur du Dock masqué actuellement surgi (0 s'il est caché ou pas en masquage auto). */
  private autoDock = 0;
  /** Dock en masquage auto : le curseur touche le bas → le Dock surgit, la pastille remonte avec lui ; elle redescend quand il le quitte. */
  private watchAutoDock(): void {
    if (!dockPrefs.autohide || !dockPrefs.bottom || this.drag) {
      if (this.autoDock) { this.autoDock = 0; this.reposition(); }
      return;
    }
    const c = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(c);
    const bottom = d.bounds.y + d.bounds.height;
    const h = shownDockHeight();
    const next = c.y >= bottom - 2 ? h : this.autoDock && c.y >= bottom - h - 4 ? h : 0;
    if (next !== this.autoDock) { this.autoDock = next; this.reposition(); }
  }

  private drag: { dx: number; dy: number; timer: NodeJS.Timeout } | null = null;

  /** Glisser la pastille : la fenêtre suit le curseur (sondé à 60 Hz) ; la position est mémorisée à la fin. */
  dragStart(w = 44, h = 16): void {
    if (!this.win || this.win.isDestroyed() || this.drag) return;
    this.gliding = false;
    this.clearSlotTimers();
    this.armed = false;
    const c = screen.getCursorScreenPoint();
    const b = this.win.getBounds();
    const timer = setInterval(() => {
      if (!this.win || this.win.isDestroyed() || !this.drag) return;
      const p = screen.getCursorScreenPoint();
      const d = screen.getDisplayNearestPoint(p);
      const r = clampTo(d, { x: p.x - this.drag.dx, y: p.y - this.drag.dy, width: W, height: H });
      this.win.setBounds(r);
      const slot = this.slotWindow();
      const home = overlayBounds(d, this.autoDock);
      const sb = slot.getBounds();
      if (sb.x !== home.x || sb.y !== home.y) slot.setBounds(home);
      const dist = this.homeDistance(d, r);
      if (dist >= MAGNET) this.armed = true;
      this.setSlotProximity(dist, this.armed);
    }, 16);
    this.drag = { dx: c.x - b.x, dy: c.y - b.y, timer };
    const slot = this.slotWindow();
    slot.setBounds(overlayBounds(screen.getDisplayNearestPoint(c), this.autoDock));
    this.slotKey = '';
    this.slotJs(`S.show(${w}, ${h})`);
    slot.showInactive();
    this.win.moveTop(); // la plaque est opaque : la pastille doit rester au-dessus
  }

  dragEnd(): void {
    if (!this.drag) return;
    clearInterval(this.drag.timer);
    this.drag = null;
    const armed = this.armed;
    this.armed = false;
    this.slotKey = '';
    const slot = this.slot && !this.slot.isDestroyed() ? this.slot : null;
    if (!this.win || this.win.isDestroyed()) { slot?.hide(); return; }
    const b = this.win.getBounds();
    const d = screen.getDisplayMatching(b);
    const dist = this.homeDistance(d, b);
    const rm = reducedMotion();
    this.clearSlotTimers();
    if (dist >= MAGNET) {
      // Lâchée ailleurs : la plaque redescend, la pastille reste là où on l'a lâchée.
      this.slotJs('S.out()');
      this.slotLater(() => slot?.hide(), rm ? 0 : 170);
      settings.set(POS_KEY, `${d.id}:${b.x - d.bounds.x}:${b.y - d.bounds.y}`);
      return;
    }
    // Lâchée près de l'emplacement : elle s'y aimante (retour à la place par défaut, qui suit le Dock).
    const target = overlayBounds(d, this.autoDock);
    const ms = rm ? 0 : Math.min(120, 40 + 2 * dist);
    if (armed) {
      this.slotJs('S.snap()');
      playSound('dock'); // son d'identité : uniquement à l'aimantation armée (moment du vert)
    }
    this.glide(b, target, ms, () => {
      settings.set(POS_KEY, '');
      this.reposition();
    });
    if (armed) {
      this.slotLater(() => this.slotJs('S.close()'), rm ? 400 : 200);
      this.slotLater(() => slot?.hide(), (rm ? 400 : 200) + (rm ? 0 : 150));
    } else {
      this.slotLater(() => this.slotJs('S.close()'), ms);
      this.slotLater(() => slot?.hide(), ms + (rm ? 0 : 150));
    }
  }

  /** Glissement de la fenêtre de la pastille en images de 16 ms (ease-out) ; ms = 0 : saut immédiat. */
  private glide(from: Electron.Rectangle, to: Electron.Rectangle, ms: number, done: () => void): void {
    const win = this.win;
    if (!win || win.isDestroyed() || ms <= 0) {
      if (win && !win.isDestroyed()) win.setBounds(to);
      done();
      return;
    }
    this.gliding = true;
    const t0 = Date.now();
    const step = (): void => {
      if (!this.gliding || !this.win || this.win.isDestroyed()) return;
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      this.win.setBounds({ ...to, x: Math.round(from.x + (to.x - from.x) * e), y: Math.round(from.y + (to.y - from.y) * e) });
      if (k < 1) setTimeout(step, 16);
      else { this.gliding = false; done(); }
    };
    step();
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
    if (this.win && !this.win.isVisible() && this.shouldShow()) {
      this.reposition();
      this.win.showInactive();
    }
    this.push(s);
    if (this.hidden && this.last.state === 'idle') this.applyVisibility();
  }

  async capture(): Promise<Buffer | null> {
    if (!this.win) return null;
    return (await this.win.webContents.capturePage()).toPNG();
  }

  private push(s: DictaStatus): void {
    // Par défaut aucun mot dicté n'apparaît dans la pastille : barres + états, jamais le texte.
    // Réglage overlay.livePreview (désactivé par défaut) : fin du texte provisoire, uniquement pendant l'écoute d'une dictée.
    const { partialText, ...visible } = s;
    const live = settings.get(LIVE_KEY) === true && s.state === 'recording' && s.mode !== 'note' && partialText;
    const out = live ? { ...visible, partialText: previewTail(partialText) } : visible;
    if (this.win && this.loaded) this.win.webContents.send('overlay:status', out);
  }

  // ---- Masquer la pastille (c13) ----
  private hideTimer: NodeJS.Timeout | null = null;

  /** Date de réapparition (epoch ms) ou 0 si la pastille n'est pas masquée. */
  get hiddenUntil(): number {
    const u = Number(settings.get(HIDDEN_KEY) ?? 0);
    return isHiddenAt(u) ? u : 0;
  }
  get hidden(): boolean {
    return this.hiddenUntil > 0;
  }

  /** Masque la pastille au repos pendant `ms` (1 h par défaut) ; elle réapparaît seule. Pendant une dictée elle reste visible (retour d'état). */
  hideFor(ms = HIDE_MS): void {
    const until = Date.now() + Math.max(1000, Math.min(ms, 24 * HIDE_MS));
    settings.set(HIDDEN_KEY, until);
    this.armHideTimer();
    this.applyVisibility();
    this.emit('hiddenChange', true, until);
  }

  /** Réaffiche tout de suite (menu de la barre des menus, Réglages). */
  unhide(): void {
    if (!Number(settings.get(HIDDEN_KEY) ?? 0)) return;
    settings.set(HIDDEN_KEY, 0);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.applyVisibility();
    this.emit('hiddenChange', false, 0);
  }

  private armHideTimer(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    const left = this.hiddenUntil - Date.now();
    if (left > 0) this.hideTimer = setTimeout(() => this.unhide(), Math.min(left + 50, 2 ** 31 - 1));
  }

  private shouldShow(): boolean {
    return !this.hidden || this.last.state !== 'idle';
  }

  private applyVisibility(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    if (!this.hidden && Number(settings.get(HIDDEN_KEY) ?? 0)) settings.set(HIDDEN_KEY, 0); // échéance passée (app relancée)
    if (this.shouldShow()) {
      if (!w.isVisible()) w.showInactive();
    } else if (w.isVisible()) {
      this.setInteractive(false);
      w.hide();
    }
    if (this.hidden && !this.hideTimer) this.armHideTimer();
  }

  // ---- Menu clic droit : langue (f8), aperçu (c14), masquer (c13), position ----
  private onMenu = (e: Electron.IpcMainEvent): void => {
    if (!this.win || this.win.isDestroyed() || e.sender !== this.win.webContents) return;
    const cur = languageOf(settings.get(LANG_KEY)) ?? 'fr';
    const menu = Menu.buildFromTemplate([
      {
        label: 'Langue de dictée',
        submenu: LANGUAGES.map((l) => ({
          label: l.label,
          type: 'radio' as const,
          checked: l.code === cur,
          click: () => settings.set(LANG_KEY, l.code),
        })),
      },
      {
        label: 'Aperçu du texte pendant la dictée',
        type: 'checkbox',
        checked: settings.get(LIVE_KEY) === true,
        click: (m) => settings.set(LIVE_KEY, m.checked),
      },
      { type: 'separator' },
      { label: 'Masquer la pastille pendant 1 heure', click: () => this.hideFor() },
      { label: 'Remettre la pastille en bas', click: () => this.resetPosition() },
    ]);
    menu.popup({ window: this.win, callback: () => this.setInteractive(false) });
  };
}

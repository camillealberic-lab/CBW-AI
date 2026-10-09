import { BrowserWindow, ipcMain, session, systemPreferences, webContents } from 'electron';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { distDir, log } from './paths';
import { isTrustedSender } from './security';

export interface RecordingResult {
  /** Fin non encore transcrite (depuis la dernière coupe), silence retiré ; null si rien. */
  tail: Buffer | null;
  tailStart: number;
  /** Enregistrement complet (repli). */
  full: Buffer;
  durationMs: number;
  /** Échantillon de fin de la dernière parole détectée (16 kHz). */
  lastSpeechEnd: number;
  /** Parole réellement détectée (ms). */
  voicedMs: number;
  total: number;
  /** Instant (Date.now()) estimé de la fin de la parole. */
  speechEndAt: number;
}

/**
 * Pilote la fenêtre cachée de capture (src/renderer/recorder.ts).
 * Événements : 'level' (0..1), 'started' ({ openMs, prerollMs }), 'segment' (wav, start, end, commit).
 */
export class Recorder extends EventEmitter {
  private win: BrowserWindow | null = null;
  private pending: { resolve: (r: RecordingResult) => void; reject: (e: Error) => void; stopAt: number } | null = null;
  private ready: Promise<void> | null = null;
  private disarmTimer: NodeJS.Timeout | null = null;

  init(): Promise<void> {
    if (this.ready) return this.ready;
    const isRec = (wc: Electron.WebContents | null | undefined) => !!wc && !!this.win && !this.win.isDestroyed() && wc === this.win.webContents;
    // Seule la fenêtre de capture (cachée) obtient le micro — audio uniquement, jamais la caméra — et le
    // son du Mac ; toute autre fenêtre / permission est refusée (docs/SECURITY.md).
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
      if (!isRec(wc)) return cb(false);
      if (permission === 'media') {
        const types = ((details as { mediaTypes?: string[] }).mediaTypes ?? []) as string[];
        return cb(!types.includes('video'));
      }
      cb(permission === 'display-capture');
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) => {
      if (permission !== 'media' && permission !== 'display-capture') return false;
      if (wc ? !isRec(wc) : true) return false;
      return permission === 'display-capture' || (details as { mediaType?: string }).mediaType !== 'video';
    });
    // Son du Mac (notes) : la fenêtre de capture demande getDisplayMedia ; on répond « audio: 'loopback' »
    // (Chromium : CoreAudio Tap, macOS 14.2+, permission « Enregistrement audio du système » au 1er usage,
    // clé NSAudioCaptureUsageDescription dans Info.plist). L'API impose une vidéo : celle de la fenêtre
    // cachée elle-même (aucune capture d'écran, aucune permission écran), coupée aussitôt côté renderer.
    session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
      const frame = req.frame;
      if (!frame || !isRec(webContents.fromFrame(frame))) return cb(null as never);
      try {
        cb({ video: frame, audio: 'loopback' });
      } catch (e) {
        log('recorder: capture du son du Mac refusée', e);
      }
    });

    // Messages rec:* acceptés uniquement depuis la fenêtre de capture.
    const fromRec = (e: Electron.IpcMainEvent): boolean => isTrustedSender(e, this.win?.webContents);
    ipcMain.on('rec:level', (e, v: number) => fromRec(e) && this.emit('level', Number(v) || 0));
    ipcMain.on('rec:started', (e, info) => fromRec(e) && this.emit('started', info));
    ipcMain.on('rec:segment', (e, wav: ArrayBuffer, start: number, end: number, commit: boolean) => {
      if (!fromRec(e) || !(wav instanceof ArrayBuffer || ArrayBuffer.isView(wav))) return;
      this.emit('segment', Buffer.from(wav as ArrayBuffer), Number(start) || 0, Number(end) || 0, !!commit);
    });
    ipcMain.on('rec:result', (e, r: any) => {
      if (!fromRec(e) || !r || typeof r !== 'object') return;
      const p = this.pending;
      this.pending = null;
      if (!p) return;
      const afterSpeechMs = ((r.total - r.lastSpeechEnd) / 16000) * 1000;
      p.resolve({
        tail: r.tail ? Buffer.from(r.tail) : null,
        tailStart: r.tailStart,
        full: Buffer.from(r.full),
        durationMs: r.durationMs,
        lastSpeechEnd: r.lastSpeechEnd,
        voicedMs: Number(r.voicedMs ?? 0),
        total: r.total,
        speechEndAt: p.stopAt - Math.max(0, afterSpeechMs),
      });
    });
    ipcMain.on('rec:pcm', (e, mix: ArrayBuffer, mic: ArrayBuffer | null, sys: ArrayBuffer | null) => {
      if (!fromRec(e) || !mix) return;
      this.emit('pcm', Buffer.from(mix), mic ? Buffer.from(mic) : null, sys ? Buffer.from(sys) : null);
    });
    ipcMain.on('rec:log', (e, msg: string) => fromRec(e) && log('recorder:', String(msg).slice(0, 500)));
    ipcMain.on('rec:error', (e, raw: string) => {
      if (!fromRec(e)) return;
      const msg = String(raw).slice(0, 300);
      log('recorder: erreur', msg);
      const p = this.pending;
      this.pending = null;
      p?.reject(new Error(msg));
      this.emit('error', new Error(msg));
    });

    this.win = new BrowserWindow({
      show: false,
      width: 200,
      height: 100,
      webPreferences: {
        preload: path.join(distDir(), 'main', 'preload-recorder.js'),
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    this.ready = this.win.loadFile(path.join(distDir(), 'renderer', 'recorder.html'));
    return this.ready;
  }

  /** Statut TCC du micro ; demande l'accès si nécessaire. */
  async ensureMicPermission(): Promise<boolean> {
    const st = systemPreferences.getMediaAccessStatus('microphone');
    if (st === 'granted') return true;
    if (st === 'denied' || st === 'restricted') return false;
    return systemPreferences.askForMediaAccess('microphone');
  }

  /**
   * Pré-ouverture du micro (1er appui sur fn) : la pré-écoute commence, start() n'attendra pas getUserMedia.
   * Micro refermé automatiquement si aucune dictée ne démarre dans `holdMs`.
   */
  arm(holdMs = 1200): void {
    if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted' || !this.win) return;
    this.win.webContents.send('rec:arm');
    if (this.disarmTimer) clearTimeout(this.disarmTimer);
    this.disarmTimer = setTimeout(() => this.win?.webContents.send('rec:disarm'), holdMs);
  }

  /**
   * `wav` : PCM de la session renvoyé par blocs (événement 'pcm' : mélange, micro, Mac — PCM16 16 kHz) ;
   * `systemAudio` : capte aussi le son du Mac (notes) ; `probeSys` : autotest du chemin de capture.
   */
  async start(opts: { note?: boolean; feed?: boolean; wav?: boolean; systemAudio?: boolean; probeSys?: boolean } = {}): Promise<void> {
    await this.init();
    if (this.disarmTimer) clearTimeout(this.disarmTimer);
    this.disarmTimer = null;
    if (this.pending) this.pending.reject(new Error('superseded'));
    this.pending = null;
    this.win!.webContents.send('rec:start', opts);
  }

  pause(): void {
    this.win?.webContents.send('rec:pause');
  }
  resume(): void {
    this.win?.webContents.send('rec:resume');
  }

  /** Autotest : injecte un WAV PCM16 mono 16 kHz dans la capture en cours (start({ feed: true })). Résolu à la fin. */
  feed(pcm: Float32Array, speed = 1, sys?: Float32Array): Promise<void> {
    return new Promise((resolve) => {
      ipcMain.once('rec:fed', () => resolve());
      const copy = pcm.slice();
      this.win?.webContents.send('rec:feed', copy.buffer, speed, sys ? sys.slice().buffer : null);
    });
  }

  /** Arrête et renvoie la fin non transcrite + l'enregistrement complet (WAV 16 kHz mono). */
  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.win) return reject(new Error('recorder non initialisé'));
      this.pending = { resolve, reject, stopAt: Date.now() };
      this.win.webContents.send('rec:stop');
      setTimeout(() => {
        if (this.pending?.resolve === resolve) {
          this.pending = null;
          reject(new Error('timeout capture audio'));
        }
      }, 5000);
    });
  }

  cancel(): void {
    this.pending = null;
    this.win?.webContents.send('rec:cancel');
  }
}

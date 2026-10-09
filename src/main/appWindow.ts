import { app, BrowserWindow, ipcMain, screen, shell, systemPreferences, type IpcMainInvokeEvent } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { FnWatcher } from './fnkey';
import * as path from 'node:path';
import type { DictaStatus, ProviderId } from '../shared/types';
import { routerModule } from './cleaner';
import { clearRecent, getRecent, getStats, recordDictation } from './history';
import type { PushToTalk } from './hotkey';
import { ollamaBin, ollamaStatus, pullOllamaModel } from './ollama';
import { distDir, log } from './paths';
import type { DictationResult, Pipeline } from './pipeline';
import type { Recorder } from './recorder';
import { settings } from './settings';
import { copyNote, deleteNote, getNote, listNotes, renameSpeaker, revealNote, type NoteSession } from './notes';
import { downloadWhisper, whisperStatus } from './whisper';
import { modelDownloader, type DownloadProgress } from './whisperModels';
import { updater, type UpdateStatus } from './updater';
import { isTrustedSender } from './security';
import { wipeAllUserData } from './privacy';

/**
 * Fenêtre principale (onboarding + hub) : design/app/app.html, pont `window.dictaApp`
 * (src/main/preload-app.ts) selon docs/APP_API.md.
 */

const AX_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
const INPUT_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent';

/** Réglages Système › Clavier › « Appuyer sur 🌐 pour » (0 = Ne rien faire, 1 = source de saisie, 2 = emoji, 3 = dictée Apple). */
function readFnUsage(): Promise<number | null> {
  return new Promise((resolve) =>
    execFile('defaults', ['read', 'com.apple.HIToolbox', 'AppleFnUsageType'], (err, out) => {
      const n = Number(String(out).trim());
      resolve(err || !Number.isFinite(n) ? null : n);
    }),
  );
}
function setFnUsageNothing(): Promise<boolean> {
  return new Promise((resolve) =>
    execFile('defaults', ['write', 'com.apple.HIToolbox', 'AppleFnUsageType', '-int', '0'], (err) => {
      if (err) log('app: AppleFnUsageType', err);
      else log('app: « Appuyer sur 🌐 » → Ne rien faire');
      resolve(!err);
    }),
  );
}

let win: BrowserWindow | null = null;
let permTimer: NodeJS.Timeout | null = null;
let lastAx: boolean | null = null;
let deps: { hotkey: PushToTalk; recorder: Recorder } | null = null;

const send = (ch: string, ...a: unknown[]): void => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, ...a);
};

type MicStatus = 'granted' | 'denied' | 'not-determined' | 'restricted';
function permissions(): { mic: MicStatus; accessibility: boolean; fnKey: string } {
  const m = systemPreferences.getMediaAccessStatus('microphone');
  const mic: MicStatus = m === 'granted' || m === 'denied' || m === 'restricted' ? m : 'not-determined';
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  if (lastAx === false && accessibility) {
    log('app: Accessibilité accordée → raccourci maintenu');
    deps?.hotkey.recheck();
  }
  lastAx = accessibility;
  // fnKey : 'ready' | 'no-access' (Accessibilité ou Surveillance de l'entrée manquante) | 'unavailable' | 'off'
  return { mic, accessibility, fnKey: deps?.hotkey.fnStatus ?? 'off' };
}

function startPermLoop(): void {
  if (permTimer) return;
  permTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return stopPermLoop();
    send('app:permissions', permissions());
  }, 1000);
}
function stopPermLoop(): void {
  if (permTimer) clearInterval(permTimer);
  permTimer = null;
}

/** Clés transmises au router LLM en mémoire (prise en compte immédiate, sans attendre le mtime du fichier). */
const isLlmKey = (k: string): boolean => k.startsWith('providers.') || k.startsWith('cleaning.');

function pushLlmOverrides(): void {
  const r = routerModule();
  if (!r?.setConfigOverrides) return;
  const all = settings.all();
  r.setConfigOverrides(Object.fromEntries(Object.entries(all).filter(([k]) => isLlmKey(k))));
}

/** Fournisseurs connus (src/llm/config.ts › ALL_PROVIDERS) : `testProvider` refuse tout autre identifiant. */
const PROVIDER_IDS: readonly ProviderId[] = ['gemini', 'groq', 'zai', 'mistral', 'cloudflare', 'openrouter', 'ollama'];
const isProviderId = (x: unknown): x is ProviderId => typeof x === 'string' && (PROVIDER_IDS as readonly string[]).includes(x);

/** Fenêtre principale attendue comme émetteur de tous les canaux `app:*`. */
const appContents = () => (win && !win.isDestroyed() ? win.webContents : null);

/** ipcMain.handle + vérification de l'émetteur (cadre principal d'une page de l'app, fenêtre principale). */
function handle(ch: string, fn: (e: IpcMainInvokeEvent, ...a: any[]) => unknown): void {
  ipcMain.handle(ch, (e, ...a) => {
    if (!isTrustedSender(e, appContents())) {
      log('sécurité: IPC refusé (émetteur non autorisé)', ch);
      throw new Error('Émetteur non autorisé');
    }
    return fn(e, ...a);
  });
}

export function initAppIpc(d: {
  hotkey: PushToTalk;
  recorder: Recorder;
  pipeline: Pipeline;
  notes: NoteSession;
}): void {
  deps = d;
  pushLlmOverrides();

  ipcMain.on('app:version', (e) => (e.returnValue = isTrustedSender(e, appContents()) ? app.getVersion() : ''));
  // ── mises à jour (src/main/updater.ts, docs/APP_API.md › Mises à jour)
  handle('app:getVersion', () => app.getVersion());
  handle('app:getUpdateStatus', () => updater.get());
  handle('app:checkForUpdates', () => updater.check());
  handle('app:installUpdate', () => updater.install());
  updater.on('update', (u: UpdateStatus) => send('app:update', u));
  handle('app:getPermissions', () => permissions());
  handle('app:requestMic', async () => {
    const ok = await d.recorder.ensureMicPermission();
    send('app:permissions', permissions());
    return ok;
  });
  handle('app:openAccessibilitySettings', async () => {
    systemPreferences.isTrustedAccessibilityClient(true); // ajoute l'app à la liste + prompt système
    await shell.openExternal(AX_URL);
  });

  handle('app:requestInputMonitoring', async () => {
    const ok = await FnWatcher.checkAccess(true);
    if (!ok) await shell.openExternal(INPUT_URL);
    d.hotkey.recheck();
    return ok;
  });
  // Entrée TCC périmée (ancienne signature) : on la supprime puis on redemande.
  handle('app:repairAccessibility', async () => {
    for (const svc of ['Accessibility', 'ListenEvent'])
      await new Promise<void>((r) => execFile('tccutil', ['reset', svc, 'com.dicta-ai.app'], () => r()));
    log('app: autorisations Accessibilité / Surveillance de l’entrée réinitialisées');
    systemPreferences.isTrustedAccessibilityClient(true);
    await shell.openExternal(AX_URL);
  });
  handle('app:getFnUsage', async () => {
    const value = await readFnUsage();
    return { value, doNothing: value === 0 };
  });
  handle('app:setFnUsageNothing', () => setFnUsageNothing());

  handle('app:getConfig', () => settings.all());
  handle('app:setConfig', (_e, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || !key) return;
    settings.set(key, value);
    if (isLlmKey(key)) routerModule()?.setConfigOverrides?.({ [key]: value });
  });
  handle('app:testProvider', async (_e, id: unknown) => {
    if (!isProviderId(id)) return { ok: false, message: 'Fournisseur inconnu' };
    const r = routerModule();
    if (!r?.testProvider) return { ok: false, message: 'Router LLM indisponible' };
    try {
      return await r.testProvider(id);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
  handle('app:providerStatuses', async () => {
    const r = routerModule();
    if (!r?.providerStatuses) return [];
    try {
      const noOllama = !ollamaBin();
      return (await r.providerStatuses()).map((p: any) =>
        // Ollama est optionnel : absent → « non installé » (gris), jamais une erreur.
        p.id === 'ollama' && noOllama && p.uiStatus !== 'available'
          ? { id: p.id, ui: 'offline', detail: 'Non installé (optionnel)', installed: false }
          : { id: p.id, ui: p.uiStatus, detail: p.reason },
      );
    } catch (e) {
      log('app: providerStatuses', e);
      return [];
    }
  });

  handle('app:ollamaStatus', () => ollamaStatus());
  handle('app:pullOllamaModel', async () => {
    await pullOllamaModel((p) => send('app:ollamaProgress', p));
    send('app:ollamaProgress', { status: 'success', percent: 100 });
    void routerModule()?.warmup?.().catch(() => undefined);
  });
  handle('app:whisperStatus', () => whisperStatus(String(settings.get('whisper.model'))));
  handle('app:downloadWhisper', async (_e, model: unknown) => {
    await downloadWhisper(typeof model === 'string' ? model : undefined, String(settings.get('whisper.model')));
  });
  modelDownloader.on('progress', (p: DownloadProgress) => send('app:whisperProgress', p));

  handle('app:getStats', () => getStats());
  handle('app:getRecent', () => getRecent());
  handle('app:clearRecent', () => clearRecent());

  handle('app:finishOnboarding', () => settings.set('onboarding.done', true));
  handle('app:resetOnboarding', () => settings.set('onboarding.done', false));
  // « Supprimer toutes mes données » (docs/SECURITY.md › 8) : efface puis relance sur l'onboarding.
  handle('app:wipeAllData', async (_e, opts: unknown) => {
    const o = (opts && typeof opts === 'object' ? opts : {}) as { documents?: unknown; models?: unknown };
    const r = await wipeAllUserData({ documents: o.documents === true, models: o.models === true });
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 300); // laisse la réponse partir vers la page
    return r;
  });
  handle('app:openExternal', async (_e, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) await shell.openExternal(url);
  });

  // ── prise de notes
  const n = d.notes;
  handle('app:startNote', async () => {
    if (d.pipeline.current === 'recording') d.pipeline.cancel();
    await n.start();
  });
  handle('app:pauseNote', () => n.pause());
  handle('app:resumeNote', () => n.resume());
  handle('app:stopNote', async (_e, opts: unknown) => {
    const o = (opts ?? {}) as { title?: unknown; markers?: unknown };
    const markers = Array.isArray(o.markers)
      ? o.markers.slice(0, 200).map((m: any) => ({ atMs: Math.max(0, Number(m?.atMs) || 0), text: String(m?.text ?? '').slice(0, 200) })).filter((m) => m.text.trim())
      : [];
    await n.stop({ title: typeof o.title === 'string' ? o.title.slice(0, 120).trim() || undefined : undefined, markers });
  });
  handle('app:cancelNote', () => n.cancel());
  handle('app:listNotes', () => listNotes());
  handle('app:getNote', (_e, id: unknown) => getNote(String(id)));
  handle('app:reorganizeNote', (_e, id: unknown) => n.reorganize(String(id)));
  handle('app:deleteNote', (_e, id: unknown) => deleteNote(String(id)));
  handle('app:revealNote', (_e, id: unknown) => revealNote(String(id)));
  handle('app:copyNote', (_e, id: unknown) => copyNote(String(id)));
  handle('app:renameSpeaker', (_e, id: unknown, from: unknown, to: unknown) => renameSpeaker(String(id), String(from ?? ''), String(to ?? '')));
  n.on('progress', (p: unknown) => send('app:noteProgress', p));

  d.pipeline.on('status', (s: DictaStatus) => send('app:status', s));
  d.pipeline.on('result', (r: DictationResult) => send('app:dictation', recordDictation(r)));
}

function pageFile(): string {
  const designed = path.join(distDir(), 'design', 'app', 'app.html');
  return fs.existsSync(designed) ? designed : path.join(distDir(), 'renderer', 'app-placeholder.html');
}

/**
 * Ouvre (ou ramène) la fenêtre principale. `section` (ex. 'reglages') est passé en hash
 * (#reglages) et via l'événement DOM `dicta:navigate` si la page est déjà chargée.
 */
export function openAppWindow(section?: string): void {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    app.focus({ steal: true });
    if (section)
      win.webContents
        .executeJavaScript(
          `location.hash = ${JSON.stringify('#' + section)}; window.dispatchEvent(new CustomEvent('dicta:navigate', { detail: ${JSON.stringify(section.split(':')[0])} }));`,
        )
        .catch(() => undefined);
    startPermLoop();
    return;
  }
  // Fenêtre pensée pour le grand écran : ~85 % de l'espace utile, redimensionnable, plein écran possible.
  const work = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.max(960, Math.min(1440, Math.round(work.width * 0.85))),
    height: Math.max(640, Math.min(920, Math.round(work.height * 0.88))),
    minWidth: 960,
    minHeight: 640,
    center: true,
    fullscreenable: true,
    backgroundColor: '#FFFFFF', // thème clair (blanc) par défaut : pas de flash noir à l'ouverture
    title: 'CBW AI',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 19 }, // feux centrés sur l'axe de la barre d'outils (y = 26, design/app/app.html › en-tête)
    show: false,
    webPreferences: {
      preload: path.join(distDir(), 'main', 'preload-app.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => {
    win?.show();
    app.focus({ steal: true });
  });
  win.on('show', startPermLoop);
  // plein écran : la marque et la nav remontent (design/app/app.html › html.fs)
  win.on('enter-full-screen', () => send('app:fullscreen', true));
  win.on('leave-full-screen', () => send('app:fullscreen', false));
  win.webContents.on('did-finish-load', () => send('app:fullscreen', win?.isFullScreen() ?? false));
  win.on('focus', () => send('app:permissions', permissions()));
  win.on('closed', () => {
    win = null;
    stopPermLoop();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  // Thème : 'light' (défaut) | 'dark' | 'system' (suit macOS) — lu par la page via ?theme=.
  const theme = String(settings.get('general.theme') || 'light');
  const query: Record<string, string> = theme === 'light' || theme === 'dark' ? { theme } : {};
  void win.loadFile(pageFile(), { query, ...(section ? { hash: section } : {}) }).catch((e) => log('app: chargement', e));
}

export async function captureAppWindow(): Promise<Buffer | null> {
  return win && !win.isDestroyed() ? (await win.webContents.capturePage()).toPNG() : null;
}

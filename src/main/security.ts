import { app, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { distDir, log } from './paths';

/**
 * Durcissement Electron commun à toutes les fenêtres (docs/SECURITY.md) :
 * - navigation / nouvelles fenêtres / <webview> interdites (aucun contenu distant n'est chargé) ;
 * - requêtes réseau des renderers limitées à file:, data:, blob:, devtools: (les appels LLM partent du
 *   process main via fetch Node, hors session Chromium) ;
 * - shell.openExternal : https vers une liste d'hôtes connus + volets des Réglages Système seulement ;
 * - permissions : refusées par défaut (le recorder installe ses propres règles micro / son du Mac).
 */

/** Hôtes que l'UI peut ouvrir dans le navigateur (liens « Obtenir une clé », aide, téléchargements). */
const EXTERNAL_HOSTS = [
  'aistudio.google.com',
  'console.groq.com',
  'z.ai',
  'openrouter.ai',
  'ollama.com',
  'github.com',
  'huggingface.co',
  'cbw.studio',
];

export function isSafeExternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  // Volets de Réglages Système (Accessibilité, Micro, Surveillance de l'entrée) ouverts par l'app elle-même.
  if (u.protocol === 'x-apple.systempreferences:') return /^com\.apple\.preference\.security(\?Privacy_[A-Za-z]+)?$/.test(u.pathname + u.search);
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return EXTERNAL_HOSTS.some((d) => h === d || h.endsWith('.' + d));
}

/** Remplace shell.openExternal par une version filtrée (tous les appelants, y compris appWindow.ts). */
function guardOpenExternal(): void {
  const orig = shell.openExternal.bind(shell);
  const guarded = (url: string, opts?: Electron.OpenExternalOptions): Promise<void> => {
    if (!isSafeExternalUrl(url)) {
      log('sécurité: openExternal refusé', String(url).slice(0, 120));
      return Promise.resolve();
    }
    return orig(url, opts);
  };
  try {
    Object.defineProperty(shell, 'openExternal', { value: guarded, configurable: true, writable: true });
  } catch (e) {
    log('sécurité: openExternal non filtrable', e instanceof Error ? e.message : e);
  }
}

/** URL chargée par nos fenêtres : un fichier de dist/ (pas de http, pas de fichier hors de l'app). */
export function isAppUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'file:') return false;
    const root = pathToFileURL(distDir() + path.sep).pathname;
    return decodeURIComponent(u.pathname).startsWith(decodeURIComponent(root));
  } catch {
    return false;
  }
}

/** L'émetteur d'un message IPC est-il une page de l'app (cadre principal, file:// de dist/) ? */
export function isTrustedSender(e: IpcMainEvent | IpcMainInvokeEvent, expected?: WebContents | null): boolean {
  if (expected && e.sender !== expected) return false;
  const f = e.senderFrame;
  if (!f || f.parent) return false;
  return isAppUrl(f.url);
}

function guardWebContents(wc: WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const block = (e: Electron.Event, url: string): void => {
    if (isAppUrl(url)) return; // ex. changement de hash / rechargement d'une page de l'app
    e.preventDefault();
    log('sécurité: navigation bloquée', String(url).slice(0, 120));
  };
  wc.on('will-navigate', block);
  wc.on('will-redirect', block);
  wc.on('will-frame-navigate', (e) => {
    if (!isAppUrl(e.url)) {
      e.preventDefault();
      log('sécurité: navigation de cadre bloquée', String(e.url).slice(0, 120));
    }
  });
  wc.on('will-attach-webview', (e) => {
    e.preventDefault();
    log('sécurité: <webview> refusé');
  });
  // Vérifie les préférences effectives (filet de sécurité si une fenêtre est créée sans les bonnes options).
  if (wc.getType() !== 'window') return;
  const prefs = (wc as any).getLastWebPreferences?.() as Electron.WebPreferences | undefined;
  if (prefs && (prefs.nodeIntegration || prefs.contextIsolation === false || prefs.webSecurity === false || prefs.sandbox === false)) {
    log('sécurité: fenêtre aux préférences non sûres détruite', JSON.stringify({ nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, webSecurity: prefs.webSecurity }));
    setImmediate(() => wc.close());
  }
}

/** Avant app.whenReady() : umask strict (fichiers 0600 / dossiers 0700) + garde des webContents. */
export function hardenProcess(): void {
  try {
    process.umask(0o077);
  } catch {
    /* ignore */
  }
  app.on('web-contents-created', (_e, wc) => guardWebContents(wc));
  guardOpenExternal();
}

/** Après app.whenReady() : règles réseau / permissions de la session par défaut. */
export function hardenSession(): void {
  const s = session.defaultSession;
  // Aucun contenu distant dans les renderers (CSP dans chaque page + blocage ici).
  s.webRequest.onBeforeRequest((details, cb) => {
    const ok = /^(file|data|blob|devtools|chrome-extension):/i.test(details.url) && (!/^file:/i.test(details.url) || isAppUrl(details.url));
    if (!ok) log('sécurité: requête renderer bloquée', details.url.slice(0, 120));
    cb({ cancel: !ok });
  });
  // Défaut : tout refuser. Recorder.init() remplace ces handlers par ses règles (micro + son du Mac pour sa fenêtre seule).
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
  s.setDevicePermissionHandler(() => false);
}

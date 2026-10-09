import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { redact } from '../shared/redact';
import { routerModule } from './cleaner';
import { distDir, log } from './paths';
import { isSafeExternalUrl, isTrustedSender } from './security';
import { settings, validateSetting } from './settings';
import { downloadWhisper, whisperModel } from './whisper';
import { CATALOG } from './whisperModels';

const PROVIDER_IDS = ['gemini', 'groq', 'zai', 'openrouter', 'ollama'];

let win: BrowserWindow | null = null;
let last: [string, string, unknown] | null = null;

// Câblage injecté dans le monde principal de design/settings/settings.html
const WIRE = `(async () => {
  if (!window.dicta || !window.dictaHost) return;
  document.documentElement.classList.add('embedded');
  const all = await dictaHost.getAll();
  dicta.setValues(all);
  dicta.onChange((k, v) => dictaHost.set(k, v));
  dicta.onAction((n, p) => dictaHost.action(n, p));
  dictaHost.on('settings:push:last', (raw, clean, meta) => dicta.setLastDictation(raw, clean, meta));
  dictaHost.on('settings:push:whisper', (st, p) => dicta.setWhisperStatus(st, p));
  dictaHost.on('settings:push:values', (o) => dicta.setValues(o));
  dictaHost.on('settings:push:tab', (t) => dicta.openTab(t));
  dictaHost.on('settings:push:provider', (id, st) => dicta.setProviderStatus(id, st));
  dictaHost.on('settings:push:test', (id, ok, msg) => dicta.setTestResult(id, ok, msg));
  dictaHost.on('settings:push:quota', (id, used, limit) => dicta.setQuota(id, used, limit));
  await dictaHost.action('ready', null);
})();`;

const send = (ch: string, ...a: unknown[]) => win?.webContents.send(ch, ...a);

function pushWhisperStatus(): void {
  const name = String(settings.get('whisper.model'));
  send('settings:push:whisper', whisperModel(name)?.includes(`ggml-${name}`) ? 'downloaded' : 'missing');
}

export function initSettingsIpc(): void {
  // Fenêtre Réglages historique (design/settings) : messages acceptés seulement depuis une page de l'app,
  // réglages validés (validateSetting), clés API jamais renvoyées en clair (settings.all() les masque).
  ipcMain.handle('settings:getAll', (e) => (isTrustedSender(e) ? settings.all() : {}));
  ipcMain.handle('settings:set', (e, k: unknown, v: unknown) => {
    if (!isTrustedSender(e)) return;
    validateSetting(k, v);
    settings.set(k, v);
    if (k.startsWith('providers.')) setTimeout(() => void pushProviders(), 300);
  });
  ipcMain.handle('settings:action', async (e, rawName: unknown, payload: any) => {
    if (!isTrustedSender(e)) return;
    const name = typeof rawName === 'string' ? rawName.slice(0, 40) : '';
    switch (name) {
      case 'ready':
        pushWhisperStatus();
        if (last) send('settings:push:last', ...last);
        void pushProviders();
        return;
      case 'testProvider': {
        const r = routerModule();
        const id = String(payload?.id ?? '');
        if (!PROVIDER_IDS.includes(id)) return;
        if (!r?.testProvider) {
          send('settings:push:test', id, false, 'Router LLM indisponible');
          return;
        }
        send('settings:push:provider', id, 'testing');
        try {
          const t = await r.testProvider(id);
          send('settings:push:test', id, t.ok, redact(t.message));
        } catch (err) {
          send('settings:push:test', id, false, redact(err instanceof Error ? err.message : String(err)));
        }
        void pushProviders();
        return;
      }
      case 'whisperModelChanged':
        if (typeof payload?.model === 'string' && CATALOG[payload.model]) settings.set('whisper.model', payload.model);
        pushWhisperStatus();
        return;
      case 'downloadWhisper': {
        // Catalogue fixe + SHA-256 vérifié (whisperModels.ts) — jamais un nom de fichier venant de la page.
        const model = typeof payload?.model === 'string' && CATALOG[payload.model] ? payload.model : String(settings.get('whisper.model'));
        try {
          await downloadWhisper(model, String(settings.get('whisper.model')));
        } catch (err) {
          log('settings: téléchargement échoué', err instanceof Error ? err.message : err);
        }
        pushWhisperStatus();
        return;
      }
      case 'openExternal':
        if (isSafeExternalUrl(payload?.url)) void shell.openExternal(payload.url);
        return;
      default:
        log('settings: action non gérée', name);
    }
  });
}

async function pushProviders(): Promise<void> {
  const r = routerModule();
  if (!r?.providerStatuses) return;
  try {
    for (const p of await r.providerStatuses()) {
      send('settings:push:provider', p.id, p.uiStatus);
      if (p.dailyLimit != null) send('settings:push:quota', p.id, p.usedToday, p.dailyLimit);
    }
  } catch (e) {
    log('settings: providerStatuses', e);
  }
}

export function setLastDictation(raw: string, clean: string, meta?: unknown): void {
  last = [raw, clean, meta];
  send('settings:push:last', raw, clean, meta);
}

export async function captureSettings(): Promise<Buffer | null> {
  return win ? (await win.webContents.capturePage()).toPNG() : null;
}

export function openSettings(tab?: string): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    app.focus({ steal: true });
    if (tab) send('settings:push:tab', tab);
    return;
  }
  const designed = path.join(distDir(), 'design', 'settings', 'settings.html');
  const isDesigned = fs.existsSync(designed);
  win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 600,
    minHeight: 420,
    title: 'Réglages CBW AI',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(distDir(), 'main', 'preload-settings.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.once('ready-to-show', () => {
    win?.show();
    app.focus({ steal: true });
  });
  win.on('closed', () => (win = null));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadFile(isDesigned ? designed : path.join(distDir(), 'renderer', 'settings-fallback.html'), tab ? { hash: tab } : {}).then(() => {
    if (isDesigned) win?.webContents.executeJavaScript(WIRE).catch((e) => log('settings: wiring', e));
  });
}

import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, screen, shell, systemPreferences, type IpcMainInvokeEvent } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { FnWatcher } from './fnkey';
import * as path from 'node:path';
import type { DictaStatus, ProviderId } from '../shared/types';
import { routerModule } from './cleaner';
import { clearAudio, clearRecent, getRecent, getStats, recordDictation } from './history';
import { pasteRaw, recoverLast, retry } from './recovery';
import { getRewritePresets, runRewritePreset, saveRewritePresets, type RewritePreset } from './rewrite';
import { loadSnippets, parseSnippets, saveSnippets, MAX_SNIPPETS, MAX_SNIPPET_TEXT } from './snippets';
import { clearNotepad, listNotepad, notepadAsText, removeFromNotepad } from './notepad';
import { importContactNames, mergeVocabulary } from './contacts';
import { dataDir } from './paths';
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
let deps: { hotkey: PushToTalk; recorder: Recorder; pipeline: Pipeline } | null = null;

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

/** Réglages modifiés côté main (apprentissage, import, menu de la pastille, raccourcis) que l'UI recharge en direct. */
const CHANGED_KEYS = new Set([
  'cleaning.vocabulary', 'dictionary.learned', 'dictionary.priority', 'dictionary.replacements', 'snippets.list',
  'rewrite.presets', 'general.language', 'overlay.livePreview', 'notepad.enabled',
]);

/** Clés transmises au router LLM en mémoire (prise en compte immédiate, sans attendre le mtime du fichier). */
const isLlmKey = (k: string): boolean => k.startsWith('providers.') || k.startsWith('cleaning.');

function pushLlmOverrides(): void {
  const r = routerModule();
  if (!r?.setConfigOverrides) return;
  const all = settings.all();
  r.setConfigOverrides(Object.fromEntries(Object.entries(all).filter(([k]) => isLlmKey(k))));
}

/** Fournisseurs connus (src/llm/config.ts › ALL_PROVIDERS) : `testProvider` refuse tout autre identifiant. */
const PROVIDER_IDS: readonly ProviderId[] = ['gemini', 'groq', 'zai', 'openrouter', 'ollama'];
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

  // Dictionnaire appris (src/main/learn.ts) : l'UI recharge la liste sans rouvrir la fenêtre.
  settings.on('change', (k: string, v: unknown) => {
    if (CHANGED_KEYS.has(k)) send('app:configChanged', { key: k, value: v });
  });
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


  // ══ Parité Wispr (chantiers/wispr-parite/api-*.md) — payloads validés strictement ══
  const ID_RE = /^[a-z0-9]{6,32}$/;
  const asId = (v: unknown): string => {
    if (typeof v !== 'string' || !ID_RE.test(v)) throw new Error('Identifiant invalide');
    return v;
  };
  /** Rend la main à l'app précédente avant un collage lancé depuis la fenêtre (sinon le texte arrive ici). */
  const yieldFocus = async (): Promise<void> => {
    if (win && !win.isDestroyed() && win.isFocused()) {
      app.hide();
      await new Promise((r) => setTimeout(r, 350));
    }
  };
  const histChanged = (): void => send('app:historyChanged', null);
  const saveDialog = (o: Electron.SaveDialogOptions) => (win && !win.isDestroyed() ? dialog.showSaveDialog(win, o) : dialog.showSaveDialog(o));
  const openDialog = (o: Electron.OpenDialogOptions) => (win && !win.isDestroyed() ? dialog.showOpenDialog(win, o) : dialog.showOpenDialog(o));

  // ── micro (api-audio.md)
  handle('app:audio:listInputs', () => d.recorder.listInputDevices());

  // Test du micro (Accueil › « Tester mon micro ») : capture sans transcription, niveau poussé ~30×/s, arrêt auto 15 s.
  let micTest: NodeJS.Timeout | null = null;
  const stopMicTest = (cancel: boolean): void => {
    if (!micTest) return;
    clearTimeout(micTest);
    micTest = null;
    if (cancel) d.recorder.cancel();
    send('app:micLevel', -1); // -1 = test terminé
  };
  handle('app:micTest:start', async () => {
    if (micTest) return { ok: true };
    if (!['idle', 'done', 'error'].includes(d.pipeline.current) || d.notes.busy) return { ok: false, message: 'Une dictée ou une note est en cours' };
    if (!(await d.recorder.ensureMicPermission())) return { ok: false, message: 'Micro non autorisé' };
    micTest = setTimeout(() => stopMicTest(true), 15_000);
    // mode « note » : ni pause de la musique, ni limite, ni alerte « aucun son » ; rien n'est transcrit ni gardé
    await d.recorder.start({ note: true });
    return { ok: true };
  });
  handle('app:micTest:stop', () => stopMicTest(true));
  d.recorder.on('level', (v: number) => micTest && send('app:micLevel', Math.max(0, Math.min(1, Number(v) || 0))));
  // une vraie dictée / note reprend le micro : le test s'arrête sans couper la capture
  d.pipeline.on('status', (s: DictaStatus) => s.state === 'recording' && stopMicTest(false));
  d.notes.on('active', (on: boolean) => on && stopMicTest(false));

  // ── historique (api-pipe.md : c3 réessayer, c4 version brute, c6 récupérer)
  handle('app:history:retry', async (_e, id: unknown) => {
    const r = await retry(asId(id), { insert: false }); // depuis la fenêtre : jamais collé ici, l'UI propose Copier
    histChanged();
    return r;
  });
  handle('app:history:pasteRaw', async (_e, id: unknown) => {
    const v = id === undefined || id === null ? undefined : asId(id);
    await yieldFocus();
    return pasteRaw(v, { undoFirst: false });
  });
  handle('app:history:recover', async () => {
    await yieldFocus();
    const r = await recoverLast();
    histChanged();
    return r;
  });
  handle('app:history:clearAudio', () => {
    clearAudio();
    histChanged();
  });

  // ── snippets (f1)
  handle('app:snippets:get', () => parseSnippets(settings.get('snippets.list')));
  handle('app:snippets:set', (_e, list: unknown) => {
    if (!Array.isArray(list) || list.length > MAX_SNIPPETS) throw new Error('Liste de snippets invalide');
    const clean = list.map((x) => {
      const o = x as { trigger?: unknown; text?: unknown } | null;
      if (!o || typeof o.trigger !== 'string' || typeof o.text !== 'string' || o.trigger.length > 80 || o.text.length > MAX_SNIPPET_TEXT)
        throw new Error('Snippet invalide');
      return { trigger: o.trigger, text: o.text };
    });
    return saveSnippets(clean);
  });
  void loadSnippets; // (lecture effective : pipeline)

  // ── réécriture (f2/f3)
  handle('app:rewrite:presets:get', () => getRewritePresets());
  handle('app:rewrite:presets:set', (_e, list: unknown) => {
    if (!Array.isArray(list) || list.length > 20) throw new Error('Liste de consignes invalide');
    const seen = new Set<string>();
    const clean: RewritePreset[] = list.map((x, i) => {
      const o = x as { id?: unknown; name?: unknown; instruction?: unknown } | null;
      if (!o || typeof o.name !== 'string' || typeof o.instruction !== 'string') throw new Error('Consigne invalide');
      const name = o.name.replace(/\s+/g, ' ').trim().slice(0, 40);
      const instruction = o.instruction.trim().slice(0, 500);
      if (!name || instruction.length < 3) throw new Error('Consigne invalide');
      let id = typeof o.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(o.id) ? o.id : `p${Date.now().toString(36)}${i}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      return { id, name, instruction };
    });
    saveRewritePresets(clean);
    return getRewritePresets();
  });
  handle('app:rewrite:run', async (_e, id: unknown) => {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(id)) throw new Error('Identifiant invalide');
    await yieldFocus();
    return runRewritePreset(id);
  });

  // ── dictionnaire : export / import JSON (f7), import des contacts (f5)
  const strList = (v: unknown, max: number, len: number): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim() && x.length <= len).map((x) => x.trim()).slice(0, max) : [];
  handle('app:dictionary:export', async () => {
    const data = {
      format: 'cbw-ai-dictionary',
      version: 1,
      exportedAt: new Date().toISOString(),
      vocabulary: strList(settings.get('cleaning.vocabulary'), 200, 80),
      priority: strList(settings.get('dictionary.priority'), 200, 80),
      replacements: strList(settings.get('dictionary.replacements'), 500, 300),
      snippets: parseSnippets(settings.get('snippets.list')),
    };
    const r = await saveDialog({
      title: 'Exporter le dictionnaire',
      defaultPath: path.join(app.getPath('documents'), 'CBW AI - dictionnaire.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    return { ok: true, terms: data.vocabulary.length, rules: data.replacements.length, snippets: data.snippets.length };
  });
  handle('app:dictionary:import', async () => {
    const r = await openDialog({
      title: 'Importer un dictionnaire',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const f = r.filePaths[0];
    if (r.canceled || !f) return { ok: false };
    if (fs.statSync(f).size > 1_000_000) return { ok: false, message: 'Fichier trop gros (1 Mo max)' };
    let o: any;
    try {
      o = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return { ok: false, message: 'Fichier JSON illisible' };
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, message: 'Format inconnu' };
    // Fusion (on n'efface rien) : termes, prioritaires, règles, snippets.
    const vocab = strList(settings.get('cleaning.vocabulary'), 200, 80);
    const m = mergeVocabulary(vocab, strList(o.vocabulary, 300, 80), 200);
    const prioIn = strList(o.priority, 200, 80).filter((t) => m.list.some((v) => v.toLowerCase() === t.toLowerCase()));
    const prio = [...new Set([...strList(settings.get('dictionary.priority'), 200, 80), ...prioIn])].slice(0, 200);
    const rulesIn = strList(o.replacements, 500, 300).filter((x) => /^.{1,80}=>.{0,200}$/s.test(x));
    const rulesOld = strList(settings.get('dictionary.replacements'), 500, 300);
    const rules = [...new Set([...rulesOld, ...rulesIn])].slice(0, 500);
    const snipOld = parseSnippets(settings.get('snippets.list'));
    const snipIn = parseSnippets(Array.isArray(o.snippets) ? o.snippets : []).filter(
      (s) => !snipOld.some((x) => x.trigger.toLowerCase() === s.trigger.toLowerCase()),
    );
    settings.set('cleaning.vocabulary', m.list);
    settings.set('dictionary.priority', prio);
    settings.set('dictionary.replacements', rules);
    let snippets = 0;
    try {
      snippets = saveSnippets([...snipOld, ...snipIn].slice(0, MAX_SNIPPETS)).length - snipOld.length;
    } catch {
      snippets = 0;
    }
    routerModule()?.setConfigOverrides?.({ 'cleaning.vocabulary': m.list });
    return { ok: true, terms: m.added, rules: rules.length - rulesOld.length, snippets: Math.max(0, snippets) };
  });
  handle('app:contacts:import', async (_e, opts: unknown) => {
    const calendar = !!opts && typeof opts === 'object' && (opts as { calendar?: unknown }).calendar === true;
    const r = await importContactNames({ contacts: true, calendar });
    const m = mergeVocabulary(strList(settings.get('cleaning.vocabulary'), 200, 80), r.names, 200);
    if (m.added) {
      settings.set('cleaning.vocabulary', m.list);
      routerModule()?.setConfigOverrides?.({ 'cleaning.vocabulary': m.list });
    }
    return { added: m.added, found: r.names.length, errors: r.errors.map((x) => ({ source: x.source, reason: x.reason })) };
  });

  // ── bloc-notes vocal (f10, api-notes.md)
  handle('app:notepad:list', () => listNotepad());
  handle('app:notepad:remove', (_e, id: unknown) => {
    if (typeof id !== 'string' || !/^[a-z0-9]{4,32}$/.test(id)) throw new Error('Identifiant invalide');
    return removeFromNotepad(id);
  });
  handle('app:notepad:clear', () => clearNotepad());
  handle('app:notepad:copy', () => {
    const t = notepadAsText();
    if (t) void clipboard.writeText(t);
    return !!t;
  });

  // ── statistiques (f11) : jours de dictée sur ~1 an (agrégats de ~/.dicta-ai/history.json, lecture seule)
  handle('app:getActivity', () => {
    try {
      const h = JSON.parse(fs.readFileSync(path.join(dataDir(), 'history.json'), 'utf8'));
      const per = h && typeof h.perDay === 'object' && h.perDay ? h.perDay : {};
      return Object.entries(per)
        .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
        .map(([date, b]: [string, any]) => ({ date, words: Number(b?.words) || 0, dictations: Number(b?.dictations) || 0 }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-371);
    } catch {
      return [];
    }
  });
  // Carte « à partager » : PNG généré dans la page (canvas), enregistré / copié localement. Rien n'est envoyé.
  const pngOf = (v: unknown): Electron.NativeImage => {
    if (typeof v !== 'string' || !v.startsWith('data:image/png;base64,') || v.length > 8_000_000) throw new Error('Image invalide');
    const img = nativeImage.createFromDataURL(v);
    if (img.isEmpty()) throw new Error('Image invalide');
    return img;
  };
  handle('app:image:save', async (_e, dataUrl: unknown) => {
    const img = pngOf(dataUrl);
    const r = await saveDialog({
      title: 'Enregistrer la carte',
      defaultPath: path.join(app.getPath('downloads'), 'CBW AI - mes stats.png'),
      filters: [{ name: 'Image PNG', extensions: ['png'] }],
    });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, img.toPNG());
    return true;
  });
  handle('app:image:copy', async (_e, dataUrl: unknown) => {
    const png = pngOf(dataUrl).toPNG();
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
    return true;
  });

  // ── saisie sécurisée (c11) : indicateur dans Réglages
  handle('app:getSecureInput', () => d.hotkey.secureInput);
  d.hotkey.on('secureInput', (on: boolean, appName: string) => send('app:secureInput', { active: !!on, app: String(appName || '').slice(0, 80) }));

  d.pipeline.on('recoverable', histChanged);
  d.pipeline.on('retried', histChanged);

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

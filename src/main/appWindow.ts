import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, Notification, screen, shell, systemPreferences, type IpcMainInvokeEvent } from 'electron';
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
import { assertNoteId, copyNote, deleteNote, getNote, listNotes, notesOutDir, renameSpeaker, revealNote, type NoteSession } from './notes';
import { calendarAccess, calendarWatcher, currentMeeting, requestCalendarAccess, upcomingMeetings, type CalendarEvent } from './calendar';
import { engineStatus, fluidModels } from './meetingEngine';
import * as os from 'node:os';
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

// ══ Notes v2 : fichier UI par note (~/.dicta-ai/notes/<id>.ui.json) — compte rendu balisé, gabarit, notes tapées ══
interface UiData {
  annotated?: string;
  templateId?: string;
  templatePick?: string;
  userNotes?: string;
  userTimes?: Record<string, string>;
  participants?: string[];
  eventTitle?: string;
  title?: string;
  provider?: string;
  /** Genre détecté par l'IA (réunion, brainstorm, cours…) — api-llm.md §3. */
  kind?: string;
  previous?: { annotated: string; templateId?: string; templatePick?: string; kind?: string };
}
const uiFile = (id: string): string => path.join(dataDir(), 'notes', `${id}.ui.json`);
function readUi(id: string): UiData | null {
  try {
    return JSON.parse(fs.readFileSync(uiFile(id), 'utf8')) as UiData;
  } catch {
    return null;
  }
}
function writeUi(id: string, d: UiData): void {
  fs.mkdirSync(path.dirname(uiFile(id)), { recursive: true });
  const tmp = uiFile(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, uiFile(id));
}
/** Réécrit le .md (texte sans balises) d'une note, seulement s'il est dans ~/Documents/CBW AI/Notes. */
function writeMd(id: string, annotated: string): void {
  const strip = (routerModule() as unknown as { stripMarkers?: (s: string) => string } | null)?.stripMarkers;
  const md = typeof strip === 'function' ? strip(annotated) : annotated.replace(/\[\[\/?ia[^\]]*\]\]/g, '');
  const p = getNote(id).meta.path;
  const root = path.resolve(notesOutDir()) + path.sep;
  if (typeof p === 'string' && path.resolve(p).startsWith(root) && p.endsWith('.md')) fs.writeFileSync(p, md.endsWith('\n') ? md : md + '\n');
}
const cleanName = (v: unknown): string =>
  String(v ?? '').replace(/[\x00-\x1f\x7f:#*_`\[\]<>|\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
function sanitizeTimes(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, t] of Object.entries(v as Record<string, unknown>).slice(0, 400))
    if (typeof t === 'string' && /^(\d{1,2}:)?\d{1,3}:\d{2}$|^avant$/.test(t)) out[String(k).slice(0, 300)] = t;
  return out;
}
/** Pose le contexte du prochain organizeNotes (enveloppe de scripts/build.mjs) : flux → page, résultat → fichier UI. */
function armOrganize(idOf: () => string, extra: Record<string, unknown>, ctx: UiData & { userNotes: string }): void {
  const set = (routerModule() as unknown as { setNextOrganize?: (o: unknown) => void } | null)?.setNextOrganize;
  if (typeof set !== 'function') return;
  let last = 0;
  let timer: NodeJS.Timeout | null = null;
  let pendingText = '';
  const flush = () => {
    timer = null;
    last = Date.now();
    send('app:noteDelta', { noteId: idOf(), annotated: pendingText });
  };
  set({
    ...extra,
    onDelta: (annotated: string) => {
      pendingText = annotated;
      if (!annotated) return flush(); // '' = changement de fournisseur
      if (timer) return;
      const wait = Math.max(0, 80 - (Date.now() - last));
      timer = setTimeout(flush, wait);
    },
    onResult: (r: { annotated?: string; templateId?: string; provider?: string; kind?: string }) => {
      if (timer) clearTimeout(timer);
      const id = idOf();
      if (!id) return;
      try {
        const prev = readUi(id) ?? {};
        writeUi(id, { ...prev, ...ctx, annotated: r.annotated, templateId: r.templateId, templatePick: (ctx.templatePick ?? extra.template) as string | undefined, provider: r.provider, kind: typeof r.kind === 'string' ? r.kind.slice(0, 24) : undefined });
      } catch (e) {
        log('notes: fichier UI non écrit', e);
      }
    },
  });
}
function disarmOrganize(): void {
  const set = (routerModule() as unknown as { setNextOrganize?: (o: unknown) => void } | null)?.setNextOrganize;
  if (typeof set === 'function') set(null);
}
const wavPaths = (id: string) => ['', '.sys', '.mic'].map((x) => path.join(dataDir(), 'notes', `${id}${x}.wav`));
const hasAudio = (id: string): boolean => wavPaths(id).some((p) => fs.existsSync(p) && fs.statSync(p).size > 44 + 32000);
/** PCM16 mono 16 kHz entre a et b (ms) : mélange si présent, sinon somme des pistes son du Mac + micro. */
function readAudio(id: string, a: number, b: number): Buffer | null {
  const slice = (p: string): Buffer | null => {
    try {
      const fd = fs.openSync(p, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        const start = 44 + Math.floor((a / 1000) * 16000) * 2;
        const len = Math.min(size - start, Math.floor(((b - a) / 1000) * 16000) * 2);
        if (len <= 0) return null;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, start);
        return buf;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return null;
    }
  };
  const [mix, sys, mic] = wavPaths(id);
  if (fs.existsSync(mix)) return slice(mix);
  const s = fs.existsSync(sys) ? slice(sys) : null;
  const m = fs.existsSync(mic) ? slice(mic) : null;
  if (!s || !m) return s ?? m;
  const out = Buffer.alloc(Math.max(s.length, m.length));
  for (let i = 0; i + 1 < out.length; i += 2) {
    const v = (i + 1 < s.length ? s.readInt16LE(i) : 0) + (i + 1 < m.length ? m.readInt16LE(i) : 0);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i);
  }
  return out;
}
function wavBuffer(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const hubScript = (): string => path.join(os.homedir(), 'cbw-studio', 'mcp', 'hub.mjs');
const PROVIDER_NAMES: Record<string, string> = { groq: 'Groq', gemini: 'Gemini', zai: 'Z.ai', openrouter: 'OpenRouter', ollama: 'Ollama (sur ce Mac)' };
/** Où part le texte de la réunion pour rédiger la note (B1 de l'audit) : premier fournisseur prêt dans l'ordre d'essai. */
async function privacyInfo(): Promise<{ local: boolean; provider: string | null; label: string | null }> {
  try {
    const st = (await routerModule()?.providerStatuses?.()) ?? [];
    const ready = new Set(st.filter((s) => s.uiStatus === 'available').map((s) => s.id));
    const order = (settings.get('providers.order') as string[] | undefined) ?? ['groq', 'gemini', 'zai', 'ollama', 'openrouter'];
    const seq = settings.get('providers.localFirst') === true ? ['ollama', ...order.filter((x) => x !== 'ollama')] : order;
    const first = seq.find((x) => ready.has(x)) ?? null;
    return { local: first === 'ollama' || (!!first && [...ready].every((x) => x === 'ollama')), provider: first, label: first ? PROVIDER_NAMES[first] ?? first : null };
  } catch {
    return { local: false, provider: null, label: null };
  }
}
/** Démarre une réunion depuis le main (clic sur la notification calendrier). */
let startMeetingFn: ((o: unknown) => Promise<void>) | null = null;
let stopMeetingFn: ((o: unknown) => Promise<void>) | null = null;
let notesRef: NoteSession | null = null;
const winFocused = (): boolean => !!win && !win.isDestroyed() && win.isVisible() && win.isFocused();
function notifyNote(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported() || process.env.DICTA_NO_PROMPT === '1') return;
  const nf = new Notification({ title, body, silent: true });
  if (onClick) nf.on('click', onClick);
  nf.show();
}

/**
 * Détection d'appel (src/main/callDetect.ts, api-call.md) → carte « Réunion détectée » (10 s : Démarrer maintenant ·
 * Plus tard 2 min · Non) ou démarrage direct si `notes.autoStart` ; fin d'appel → arrêt auto si `notes.autoStop`
 * et qu'un appel a été vu pendant la note : avertissement 15 s (« Toujours là ? »), pause, « Notes arrêtées » +
 * Reprendre 4 s, puis arrêt réel. Aucun nom de réunion ni texte journalisé.
 */
type CallInfo = { app?: string; bundleId?: string };
let call: (CallInfo & { at: number }) | null = null;
let callDeclined = false;
let callSeenInNote = false;
let snoozeT: NodeJS.Timeout | null = null;
let autoT: NodeJS.Timeout | null = null;
let autoPhase: 'warn' | 'stopped' | null = null;
const WARN_S = 15;
const RESUME_S = 4;
function cancelAutoStop(resume: boolean): void {
  if (autoT) clearTimeout(autoT);
  autoT = null;
  const was = autoPhase;
  autoPhase = null;
  if (was === 'stopped' && resume && notesRef?.state === 'paused') notesRef.resume();
  if (was) send('app:noteAutoStop', { phase: 'cancel' });
}
function offerCall(): void {
  if (!call || callDeclined || !notesRef || notesRef.busy || deps?.pipeline.current === 'recording') return;
  const info = { app: call.app, bundleId: call.bundleId, seconds: 10 };
  send('app:callDetected', info);
  if (!winFocused())
    notifyNote('Réunion détectée', `${call.app ? call.app + ' utilise le micro. ' : ''}Clique pour prendre des notes.`, () => {
      openAppWindow('notes');
      void startFromCall();
    });
}
async function startFromCall(): Promise<void> {
  if (!notesRef || notesRef.busy || !startMeetingFn) return;
  callSeenInNote = true;
  send('app:callDetected', null);
  await startMeetingFn({ app: call?.app }).catch((e) => log('note: démarrage sur appel', e));
}
function finishAutoStop(): void {
  autoT = null;
  autoPhase = null;
  send('app:noteAutoStop', { phase: 'done' });
  if (notesRef?.active && stopMeetingFn) void stopMeetingFn({}).catch((e) => log('note: arrêt auto', e));
}
function startAutoStop(): void {
  if (!notesRef?.active || autoPhase) return;
  autoPhase = 'warn';
  send('app:noteAutoStop', { phase: 'warn', seconds: WARN_S });
  if (!winFocused()) notifyNote('Appel terminé', `Les notes s’arrêtent dans ${WARN_S} s. Clique pour continuer.`, () => openAppWindow('notes'));
  autoT = setTimeout(() => {
    if (!notesRef?.active) return cancelAutoStop(false);
    if (notesRef.state === 'recording') notesRef.pause();
    autoPhase = 'stopped';
    send('app:noteAutoStop', { phase: 'stopped', seconds: RESUME_S });
    autoT = setTimeout(finishAutoStop, RESUME_S * 1000);
  }, WARN_S * 1000);
}
/** À appeler une fois (main.ts) avec `callDetector`. */
export function wireCallDetection(det: NodeJS.EventEmitter): void {
  det.on('call-start', (i: CallInfo | undefined) => {
    call = { app: typeof i?.app === 'string' ? i.app.slice(0, 60) : undefined, bundleId: i?.bundleId, at: Date.now() };
    callDeclined = false;
    const n = notesRef;
    if (!n) return;
    if (n.active) {
      callSeenInNote = true;
      cancelAutoStop(true); // l'appel a repris pendant l'avertissement
      return;
    }
    if (n.busy || deps?.pipeline.current === 'recording') return;
    if (settings.get('notes.autoStart') === true) {
      void startFromCall();
      if (!winFocused()) notifyNote('Notes démarrées', `${call.app ? 'Appel détecté dans ' + call.app + '. ' : ''}Arrête quand tu veux depuis la pastille.`, () => openAppWindow('notes'));
      return;
    }
    offerCall();
  });
  det.on('call-end', () => {
    call = null;
    if (snoozeT) clearTimeout(snoozeT);
    snoozeT = null;
    send('app:callDetected', null);
    if (callSeenInNote && notesRef?.active && settings.get('notes.autoStop') !== false) startAutoStop();
  });
}
export function startMeetingFromMain(o: { title?: string; participants?: string[]; eventId?: string }): Promise<void> {
  return startMeetingFn ? startMeetingFn(o) : Promise.resolve();
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

  // ── prise de notes (docs/APP_API.md › Mode « Prise de notes » + Notes v2)
  const n = d.notes;
  // Contexte de la réunion en cours (événement calendrier, invités, nombre de personnes) : relu par la page à son montage.
  // Le nombre de personnes n'est jamais demandé (décision Camille, 15 oct.) : les voix sont détectées seules.
  let meeting: { title?: string; participants: string[]; eventId?: string; startedAt: number; app?: string } | null = null;
  let stageId = '';
  const strArr = (v: unknown, max: number, len: number): string[] =>
    Array.isArray(v) ? v.slice(0, max).map((x) => String(x ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, len)).filter(Boolean) : [];
  const startMeeting = async (opts: unknown): Promise<void> => {
    const o = (opts ?? {}) as Record<string, unknown>;
    if (d.pipeline.current === 'recording') d.pipeline.cancel();
    meeting = {
      title: typeof o.title === 'string' ? o.title.slice(0, 160).trim() || undefined : undefined,
      participants: strArr(o.participants, 40, 60),
      eventId: typeof o.eventId === 'string' ? o.eventId.slice(0, 200) : undefined,
      startedAt: Date.now(),
      app: typeof o.app === 'string' ? o.app.slice(0, 60) : undefined,
    };
    await n.start({});
  };
  startMeetingFn = startMeeting;
  notesRef = n;
  n.on('active', (on: boolean) => {
    if (on) callSeenInNote = callSeenInNote || !!call;
    else {
      callSeenInNote = false;
      if (autoPhase) cancelAutoStop(false);
    }
  });
  // Carte « Réunion détectée » / « Toujours là ? » : actions de la page.
  handle('app:notes:call', async (_e, action: unknown) => {
    switch (action) {
      case 'start':
        return startFromCall();
      case 'snooze':
        send('app:callDetected', null);
        if (snoozeT) clearTimeout(snoozeT);
        snoozeT = setTimeout(() => { snoozeT = null; offerCall(); }, 2 * 60_000);
        return;
      case 'dismiss':
        callDeclined = true;
        send('app:callDetected', null);
        return;
      case 'keep': // « Toujours là ? » → on continue
        return cancelAutoStop(true);
      case 'resume': // « Notes arrêtées » → Reprendre
        return cancelAutoStop(true);
      case 'stopNow':
        if (autoT) clearTimeout(autoT);
        return finishAutoStop();
      default:
        throw new Error('Action inconnue');
    }
  });
  handle('app:notes:callState', () => ({
    inCall: !!call,
    app: call?.app ?? null,
    offer: !!call && !callDeclined && !n.busy && !snoozeT,
    autoStop: autoPhase,
  }));
  handle('app:startNote', (_e, opts: unknown) => startMeeting(opts));
  handle('app:pauseNote', () => n.pause());
  handle('app:resumeNote', () => n.resume());
  const stopMeeting = async (opts: unknown): Promise<void> => {
    const o = (opts ?? {}) as Record<string, unknown>;
    const markers = Array.isArray(o.markers)
      ? o.markers.slice(0, 200).map((m: any) => ({ atMs: Math.max(0, Number(m?.atMs) || 0), text: String(m?.text ?? '').slice(0, 200) })).filter((m) => m.text.trim())
      : [];
    const userNotes = typeof o.userNotes === 'string' ? o.userNotes.slice(0, 30_000) : '';
    const template = typeof o.template === 'string' && /^[a-z0-9-]{1,24}$/.test(o.template) ? o.template : String(settings.get('notes.template') || 'auto');
    const title = typeof o.title === 'string' ? o.title.slice(0, 120).trim() || undefined : meeting?.title;
    const participants = strArr(o.participants, 40, 60).length ? strArr(o.participants, 40, 60) : meeting?.participants ?? [];
    const userTimes = sanitizeTimes(o.userTimes);
    const ctx = { userNotes, userTimes, participants, eventTitle: meeting?.title };
    // Compte rendu v2 : notes tapées, gabarit, invités, flux balisé → posés pour le prochain organizeNotes (scripts/build.mjs).
    armOrganize(() => stageId, { userNotes: userNotes || undefined, template, title, participants }, ctx);
    try {
      // Notes tapées données en `userNotes` : plus de « repères » ajoutés à la transcription (sinon en double).
      await n.stop({ title: typeof o.title === 'string' ? title : undefined, markers: userNotes ? [] : markers });
    } finally {
      disarmOrganize();
      meeting = null;
    }
  };
  stopMeetingFn = stopMeeting;
  handle('app:stopNote', (_e, opts: unknown) => stopMeeting(opts));
  handle('app:cancelNote', () => {
    meeting = null;
    n.cancel();
  });
  handle('app:listNotes', () =>
    listNotes().map((m) => {
      const x = readUi(m.id);
      return x ? { ...m, title: x.title || m.title, templateId: x.templateId, folder: x.templateId, kind: x.kind } : m;
    }),
  );
  handle('app:getNote', (_e, id: unknown) => {
    const note = getNote(String(id));
    const x = readUi(note.meta.id);
    return {
      ...note,
      meta: x?.title ? { ...note.meta, title: x.title } : note.meta,
      annotated: x?.annotated,
      templateId: x?.templateId,
      templatePick: x?.templatePick,
      kind: x?.kind,
      userNotes: x?.userNotes,
      userTimes: x?.userTimes,
      participants: x?.participants,
      previous: !!x?.previous,
      hasAudio: hasAudio(note.meta.id),
    };
  });
  handle('app:reorganizeNote', (_e, id: unknown) => regenerate(String(id), {}));
  handle('app:deleteNote', (_e, id: unknown) => {
    deleteNote(String(id));
    fs.rmSync(uiFile(assertNoteId(String(id))), { force: true });
  });
  handle('app:revealNote', (_e, id: unknown) => revealNote(String(id)));
  handle('app:copyNote', (_e, id: unknown) => copyNote(String(id)));
  // Copie depuis l'interface : le presse-papiers du navigateur est bloqué par la session durcie (security.ts).
  handle('app:copyText', (_e, text: unknown) => {
    if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('Texte invalide');
    clipboard.writeText(text);
    return true;
  });
  handle('app:renameSpeaker', (_e, id: unknown, from: unknown, to: unknown) => {
    renameSpeaker(String(id), String(from ?? ''), String(to ?? ''));
    // même remplacement dans le compte rendu balisé (fichier UI) : « renommer une fois = partout »
    const nid = assertNoteId(String(id));
    const x = readUi(nid);
    const a = String(from ?? '').trim().slice(0, 60);
    const b = cleanName(to);
    if (x?.annotated && a && b && a !== b) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
      writeUi(nid, { ...x, annotated: x.annotated.split('\n').map((l) => (/^#\s/.test(l) ? l : l.replace(re, `$1${b}`))).join('\n') });
    }
  });
  n.on('progress', (p: unknown) => send('app:noteProgress', p));
  n.on('live', (p: unknown) => send('app:noteLive', p));
  n.on('stage', (p: { noteId?: string; stage?: string }) => {
    if (p?.noteId) stageId = p.noteId;
    send('app:noteStage', p);
  });
  n.on('voices', (p: unknown) => send('app:noteVoices', p));
  n.on('device', (p: unknown) => send('app:noteDevice', p));
  n.on('draft', (p: unknown) => send('app:noteDraft', p));

  // ══ Notes v2 (chantiers/notes-v2/api-*.md) ══
  const regenerate = async (rawId: string, o: { template?: unknown }): Promise<void> => {
    const id = assertNoteId(rawId);
    const x = readUi(id);
    const template = typeof o.template === 'string' && /^[a-z0-9-]{1,24}$/.test(o.template) ? o.template : x?.templatePick || x?.templateId || String(settings.get('notes.template') || 'auto');
    const note = getNote(id);
    if (x?.annotated) writeUi(id, { ...x, previous: { annotated: x.annotated, templateId: x.templateId, templatePick: x.templatePick, kind: x.kind } });
    armOrganize(() => id, { userNotes: x?.userNotes || undefined, template, title: x?.eventTitle || note.meta.title, participants: x?.participants ?? [] }, { userNotes: x?.userNotes ?? '', userTimes: x?.userTimes ?? {}, participants: x?.participants ?? [], eventTitle: x?.eventTitle, templatePick: template });
    try {
      await n.reorganize(id);
    } finally {
      disarmOrganize();
    }
  };
  handle('app:notes:regenerate', (_e, id: unknown, o: unknown) => regenerate(String(id), (o ?? {}) as { template?: unknown }));
  // « Ce passage seulement » : renomme un seul tour de parole (fichier <id>.json, même format que notes.ts).
  handle('app:notes:renameSegment', (_e, id: unknown, startMs: unknown, to: unknown) => {
    const nid = assertNoteId(String(id));
    const b = cleanName(to);
    const at = Number(startMs);
    if (!b || !Number.isFinite(at)) return false;
    const f = path.join(dataDir(), 'notes', `${nid}.json`);
    let d: { segments?: { startMs: number; speaker: string }[]; diarized?: boolean } | null = null;
    try {
      d = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return false;
    }
    const seg = d?.segments?.find((x) => Math.abs(Number(x.startMs) - at) < 1);
    if (!d?.diarized || !seg) return false;
    seg.speaker = b;
    fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 1));
    fs.renameSync(f + '.tmp', f);
    return true;
  });
  handle('app:notes:restorePrevious', (_e, id: unknown) => {
    const nid = assertNoteId(String(id));
    const x = readUi(nid);
    if (!x?.previous) return false;
    writeUi(nid, { ...x, annotated: x.previous.annotated, templateId: x.previous.templateId, templatePick: x.previous.templatePick, kind: x.previous.kind, previous: undefined });
    writeMd(nid, x.previous.annotated);
    return true;
  });
  handle('app:notes:current', () => ({
    state: n.state,
    active: n.active,
    busy: n.busy,
    elapsedMs: n.active ? n.elapsed() : 0,
    meeting,
  }));
  handle('app:notes:save', (_e, id: unknown, patch: unknown) => {
    const nid = assertNoteId(String(id));
    const p = (patch ?? {}) as Record<string, unknown>;
    const x = readUi(nid) ?? {};
    const next: UiData = { ...x };
    if (typeof p.annotated === 'string' && p.annotated.length <= 300_000) {
      next.annotated = p.annotated;
      writeMd(nid, p.annotated);
    }
    if (typeof p.title === 'string') next.title = p.title.replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 160) || undefined;
    writeUi(nid, next);
    return true;
  });
  handle('app:notes:templates', () => {
    const fn = (routerModule() as unknown as { listTemplates?: () => { id: string; label: string; hint: string }[] } | null)?.listTemplates;
    try {
      if (typeof fn === 'function') return fn();
    } catch (e) {
      log('notes: gabarits', e);
    }
    return [{ id: 'auto', label: 'Auto', hint: 'Choisi selon le contenu de la réunion' }];
  });
  handle('app:notes:ask', async (_e, qid: unknown, question: unknown, ids: unknown, history: unknown) => {
    const ask = (routerModule() as unknown as { askNotes?: (q: string, notes: unknown[], o: Record<string, unknown>) => Promise<unknown> } | null)?.askNotes;
    if (typeof ask !== 'function') throw new Error('Questions indisponibles : moteur IA absent');
    const q = String(question ?? '').trim().slice(0, 1000);
    if (!q) throw new Error('Question vide');
    const list = (Array.isArray(ids) ? ids : []).slice(0, 30).map((v) => assertNoteId(String(v)));
    const notes = list.map((id) => {
      const note = getNote(id);
      const x = readUi(id);
      return {
        id,
        title: x?.title || note.meta.title,
        date: note.meta.createdAt,
        ...(note.segments?.length ? { segments: note.segments.map((s) => ({ start: s.startMs / 1000, speaker: s.speaker, text: s.text })) } : { transcript: note.transcript }),
        summary: x?.annotated || note.markdown,
      };
    });
    const hist = Array.isArray(history)
      ? history.slice(-6).map((h: any) => ({ role: h?.role === 'assistant' ? 'assistant' : 'user', content: String(h?.content ?? '').slice(0, 4000) }))
      : [];
    const tag = String(qid ?? '').slice(0, 40);
    let last = 0;
    return ask(q, notes, {
      history: hist,
      onDelta: (answer: string) => {
        const now = Date.now();
        if (now - last < 60 && answer) return;
        last = now;
        send('app:askDelta', { qid: tag, answer });
      },
    });
  });
  handle('app:notes:search', (_e, q: unknown) => {
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const k = fold(String(q ?? '').trim()).slice(0, 80);
    if (k.length < 2) return [];
    const out: { id: string; snippet: string }[] = [];
    for (const m of listNotes().slice(-400)) {
      let t = '';
      try {
        t = getNote(m.id).transcript;
      } catch {
        continue;
      }
      const f = fold(t);
      const i = f.indexOf(k);
      if (i < 0) continue;
      out.push({ id: m.id, snippet: t.slice(Math.max(0, i - 40), i + k.length + 60).replace(/\s+/g, ' ').trim() });
      if (out.length >= 60) break;
    }
    return out;
  });
  handle('app:notes:audio', (_e, id: unknown, fromMs: unknown, toMs: unknown) => {
    const nid = assertNoteId(String(id));
    const a = Math.max(0, Number(fromMs) || 0);
    const b = Math.min(a + 90_000, Math.max(a + 1000, Number(toMs) || a + 15_000));
    const pcm = readAudio(nid, a, b);
    return pcm ? { ok: true, dataUrl: 'data:audio/wav;base64,' + wavBuffer(pcm).toString('base64') } : { ok: false, message: 'Audio non conservé pour cette réunion' };
  });
  handle('app:notes:privacy', () => privacyInfo());

  // ── CBW Hub : seulement si ~/cbw-studio/mcp/hub.mjs existe (sinon le bouton est masqué)
  handle('app:hub:available', () => fs.existsSync(hubScript()));
  handle('app:hub:send', async (_e, tasks: unknown) => {
    if (!fs.existsSync(hubScript())) throw new Error('CBW Hub introuvable sur ce Mac');
    const list = (Array.isArray(tasks) ? tasks : []).slice(0, 30);
    let sent = 0;
    const errors: string[] = [];
    for (const t of list as any[]) {
      const titre = String(t?.titre ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 200);
      if (!titre) continue;
      const args = [hubScript(), 'tache', titre];
      if (typeof t?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) args.push('--date', t.date);
      const pour = cleanName(t?.pour);
      if (pour) args.push('--pour', pour);
      const why = String(t?.pourquoi ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 300);
      if (why) args.push('--pourquoi', why);
      const ok = await new Promise<boolean>((res) =>
        execFile(process.execPath, args, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15_000 }, (err) => res(!err)),
      );
      if (ok) sent++;
      else errors.push(titre.slice(0, 40));
    }
    log(`hub: ${sent} tâche(s) envoyée(s), ${errors.length} échec(s)`);
    return { ok: errors.length === 0, sent, failed: errors.length };
  });

  // ── Calendrier (src/main/calendar.ts) : autorisation demandée seulement à l'activation
  handle('app:calendar:status', () => calendarAccess());
  handle('app:calendar:enable', async (_e, on: unknown) => {
    if (on === false) {
      settings.set('notes.calendar', false);
      return { ok: true, access: await calendarAccess() };
    }
    let access = await calendarAccess();
    if (access === 'not-determined') access = await requestCalendarAccess();
    const ok = access === 'granted';
    settings.set('notes.calendar', ok);
    if (ok) void calendarWatcher.tick();
    return { ok, access };
  });
  handle('app:calendar:current', () => currentMeeting());
  handle('app:calendar:upcoming', () => upcomingMeetings(2)); // bloc « À venir » de l'écran Notes
  calendarWatcher.on('soon', (ev: CalendarEvent) => send('app:meetingSoon', ev));

  // ── Moteur de notes Parakeet / FluidAudio (api-engine.md)
  handle('app:engine:status', () => engineStatus());
  handle('app:engine:downloadNow', () => {
    void fluidModels().start();
  });
  handle('app:engine:cancel', () => fluidModels().cancel());
  try {
    fluidModels().on('progress', (p: unknown) => send('app:engineProgress', p));
  } catch (e) {
    log('moteur de notes: progression indisponible', e);
  }
  handle('app:licenses', () => {
    for (const p of [path.join(process.resourcesPath || '', 'licenses', 'NOTICE-meeting-engine.txt'), path.join(app.getAppPath(), 'assets', 'licenses', 'NOTICE-meeting-engine.txt')]) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').slice(0, 100_000);
      } catch {
        /* suivant */
      }
    }
    return '';
  });


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

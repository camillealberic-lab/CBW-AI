import { app, ipcMain, Menu, nativeImage, Notification, shell, systemPreferences } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DictaStatus } from '../shared/types';
import { routerAvailable, routerModule } from './cleaner';
import { PushToTalk } from './hotkey';
import { Overlay } from './overlay';
import { captureAppWindow, initAppIpc, openAppWindow } from './appWindow';
import { ensureOllama, stopOllama } from './ollama';
import { distDir, logFile, log } from './paths';
import { NoteSession } from './notes';
import { Pipeline } from './pipeline';
import { Recorder } from './recorder';
import { settings } from './settings';
import { playSound } from './sounds';
import { secureStartup } from './privacy';
import { hardenProcess, isTrustedSender } from './security';
import { initSettingsIpc, setLastDictation } from './settingsWindow';
import { AppTray } from './tray';
import { updater } from './updater';
import { downloadWhisper, ensureWhisperModel, whisperBin, whisperModel, whisperModelExact, whisperServer } from './whisper';
import { CATALOG, modelDownloader } from './whisperModels';

let hotkeyRef: PushToTalk | null = null;
const NO_PROMPT = process.env.DICTA_NO_PROMPT === '1'; // tests automatisés : pas de dialogues
// Autotests : les gestes clavier réels (Control ×2 de la personne qui utilise le Mac) n'agissent pas sur la session testée.
const SELFTEST = !!(process.env.DICTA_SELFTEST || process.env.DICTA_SELFTEST_NOTE);

// Test « nouvel utilisateur » (DICTA_AI_HOME=/tmp/x) : profil Electron isolé, sinon le verrou
// d'instance unique est partagé avec l'app installée.
if (process.env.DICTA_AI_HOME) app.setPath('userData', path.join(process.env.DICTA_AI_HOME, 'electron'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openAppWindow());
  void main();
}

const AX_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
const MIC_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';

async function main(): Promise<void> {
  hardenProcess(); // umask 077, navigation / fenêtres / openExternal filtrés (docs/SECURITY.md)
  settings.load();
  settings.migrate();
  settings.migrateV3();
  settings.migrateV4();
  settings.migrateV5();
  await app.whenReady();
  app.setName('CBW AI');
  secureStartup(); // clés API → trousseau, session durcie, permissions des données
  // App de Dock (clic → fenêtre principale) + barre de menus + overlay.
  if (!app.isPackaged) {
    const icon = path.join(distDir(), 'assets', 'icon.png');
    if (fs.existsSync(icon)) app.dock?.setIcon(nativeImage.createFromPath(icon));
  }
  void app.dock?.show();
  app.on('activate', () => openAppWindow());
  log('--- CBW AI démarre', `electron ${process.versions.electron}`, `log: ${logFile()}`);

  initSettingsIpc();
  const hotkey = new PushToTalk();
  hotkeyRef = hotkey;
  const recorder = new Recorder();
  const overlay = new Overlay();
  const trusted = () => hotkey.isTrusted(false);

  const notes = new NoteSession(recorder);
  const pipeline = new Pipeline(recorder, {
    uiohook: () => hotkey.uiohook,
    trusted,
    onForcedStop: () => hotkey.reset(),
    nativePaste: () => hotkey.fn.paste(),
  });
  /** Micro occupé par une prise de notes : la dictée est suspendue. */
  const longCapture = (): boolean => notes.busy;

  const tray = new AppTray({
    openApp: () => openAppWindow(),
    openSettings: () => openAppWindow('reglages'),
    quit: () => app.quit(),
    extraItems: () => {
      const items: Electron.MenuItemConstructorOptions[] = [
        notes.active
          ? { label: 'Terminer la note', click: () => void notes.stop() }
          : { label: 'Prise de notes', enabled: !longCapture(), click: () => void startNote() },
        ...(notes.active
          ? [
              notes.state === 'paused'
                ? { label: 'Reprendre la note', click: () => notes.resume() }
                : { label: 'Mettre la note en pause', click: () => notes.pause() },
            ]
          : []),
        { type: 'separator' },
        {
          label:
            hotkey.mode === 'fn'
              ? 'Raccourci : fn ×2 (mains libres) ou fn maintenue'
              : `Raccourci : ${hotkey.fnFallback ? `${PushToTalk.FALLBACK} — fn indisponible sans Accessibilité` : settings.get('general.shortcut')} ${hotkey.mode === 'hold' ? '(maintenir)' : '(appuyer pour démarrer / arrêter)'}`,
          enabled: false,
        },
      ];
      if (!trusted())
        items.push({
          label: 'Autoriser l’Accessibilité…',
          click: () => {
            hotkey.isTrusted(true);
            void shell.openExternal(AX_URL);
          },
        });
      if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted')
        items.push({
          label: 'Autoriser le micro…',
          click: async () => {
            if (!(await recorder.ensureMicPermission())) void shell.openExternal(MIC_URL);
            tray.rebuild();
          },
        });
      if (!whisperBin()) items.push({ label: 'Moteur de transcription absent (réinstallez CBW AI)', enabled: false });
      else if (!whisperModel(String(settings.get('whisper.model'))))
        items.push({
          label: modelDownloader.downloading
            ? `Téléchargement du modèle de transcription… ${modelDownloader.current?.percent ?? 0} %`
            : 'Télécharger le modèle de transcription',
          enabled: !modelDownloader.downloading,
          click: () => ensureWhisperModel(String(settings.get('whisper.model'))),
        });
      if (!routerAvailable()) items.push({ label: 'Nettoyage LLM indisponible (texte brut)', enabled: false });
      items.push(
        { type: 'separator' },
        {
          label: 'Presse-papiers seulement (pas de collage auto)',
          type: 'checkbox',
          checked: settings.get('general.insertMode') === 'clipboard',
          click: (mi) => settings.set('general.insertMode', mi.checked ? 'clipboard' : 'paste'),
        },
        { label: 'Ouvrir le journal', click: () => void shell.openPath(logFile()) },
      );
      // Mises à jour (src/main/updater.ts)
      const up = updater.get();
      if (up.state !== 'disabled') {
        items.push({ type: 'separator' });
        if (up.state === 'ready' || up.state === 'installing')
          items.push({ label: `Redémarrer pour mettre à jour (v${up.version})`, enabled: up.state === 'ready', click: () => void updater.install() });
        else if (up.state === 'downloading')
          items.push({ label: `Téléchargement de la mise à jour… ${up.percent ?? 0} %`, enabled: false });
        items.push({
          label: up.state === 'checking' ? 'Recherche de mises à jour…' : up.state === 'up-to-date' ? `CBW AI est à jour (v${up.current})` : 'Vérifier les mises à jour',
          enabled: up.state !== 'checking' && up.state !== 'downloading' && up.state !== 'ready' && up.state !== 'installing',
          click: () => void updater.check(),
        });
      }
      return items;
    },
  });

  // Sons : début (dès l'état « recording », avant l'ouverture du micro), fin au relâchement, erreur.
  // Annulation (Échap) et « rien entendu » restent silencieux.
  let prevDicta = pipeline.current;
  pipeline.on('status', (s: DictaStatus) => {
    if (s.state !== prevDicta) {
      if (s.state === 'recording') playSound('start');
      else if (prevDicta === 'recording' && s.state === 'transcribing') playSound('stop');
      else if (s.state === 'error') playSound('error');
      prevDicta = s.state;
    }
    overlay.setStatus(s);
    tray.setState(s.state, s.state === 'error' ? s.message : '');
  });
  pipeline.on('result', (r) =>
    setLastDictation(r.raw, r.provider === 'passthrough' ? '' : r.text, {
      provider: r.provider,
      model: r.model,
      latencyMs: r.timings.cleanMs,
    }),
  );

  // Prise de notes : pastille + menu ; un simple appui sur la touche de dictée l'arrête.
  notes.on('status', (s: DictaStatus) => {
    if (s.state === 'error') playSound('error');
    overlay.setStatus(s);
    tray.setState(s.state, s.state === 'error' ? s.message : s.mode === 'note' ? s.message : '');
  });
  notes.on('active', (on: boolean) => {
    hotkey.setNoteActive(on);
    tray.rebuild();
  });
  notes.on('saved', (meta: { id: string; title: string }) => {
    tray.rebuild();
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: 'Note prête', body: meta.title, silent: false });
    n.on('click', () => openAppWindow(`notes:${meta.id}`));
    n.show();
  });
  const startNote = async (): Promise<void> => {
    if (pipeline.current === 'recording') pipeline.cancel();
    await notes.start();
  };
  try {
    notes.recoverOrphans();
  } catch (e) {
    log('note: récupération', e);
  }

  initAppIpc({ hotkey, recorder, pipeline, notes });
  // Mises à jour : 30 s après le lancement, toutes les heures et au réveil ; installation seule quand le Mac est inactif (ou au Quitter).
  let lastUpKey = '';
  updater.on('update', (u: { state: string; percent?: number }) => {
    const key = `${u.state}|${u.state === 'downloading' ? Math.floor((u.percent ?? 0) / 10) : ''}`;
    if (key !== lastUpKey) {
      lastUpKey = key;
      tray.rebuild();
    }
  });
  updater.on('open', () => openAppWindow('reglages'));
  updater.init({
    busy: () =>
      notes.busy
        ? 'Une prise de notes est en cours — termine-la avant de mettre à jour'
        : pipeline.current === 'recording'
          ? 'Une dictée est en cours'
          : null,
  });
  syncLoginItem(!!settings.get('general.launchAtLogin'));
  // Ollama : lancé par l'app s'il ne tourne pas déjà, puis préchauffage du modèle.
  void ensureOllama()
    .catch((e) => log('ollama', e))
    .then(() => routerModule()?.warmup?.())
    .catch((e) => log('router warmup', e));
  // Premier lancement sur un autre Mac : pas de modèle → téléchargement (puis démarrage du serveur).
  if (whisperModel(String(settings.get('whisper.model')))) void whisperServer.start(String(settings.get('whisper.model')));
  else ensureWhisperModel(String(settings.get('whisper.model')));
  let lastPc = -1;
  modelDownloader.on('progress', (p) => {
    const step = p.state === 'downloading' ? Math.floor(p.percent / 5) : -1; // menu rafraîchi tous les 5 %
    if (step !== lastPc) {
      lastPc = step;
      tray.rebuild();
    }
  });
  overlay.create(settings.get('overlay.idleMode') === 'hidden' ? 'hidden' : 'dim');
  await recorder.init();

  hotkey.on('arm', () => !SELFTEST && !longCapture() && pipeline.arm());
  hotkey.on('down', () => !SELFTEST && !longCapture() && void pipeline.begin());
  hotkey.on('up', () => !SELFTEST && !longCapture() && void pipeline.end());
  hotkey.on('cancel', () => {
    if (SELFTEST) return;
    // Échap pendant une note : annule seulement au tout début (< 30 s) — au-delà, confirmation dans l'UI.
    if (notes.active) return void (notes.elapsed() < 30000 ? notes.cancel() : log('note: Échap ignoré (> 30 s)'));
    pipeline.cancel();
  });
  // Control gauche ×3 : la dictée lancée au 2e appui est remplacée par une prise de notes.
  hotkey.on('triple', () => {
    if (SELFTEST) return;
    if (longCapture()) return;
    pipeline.cancel();
    setTimeout(() => {
      if (pipeline.current === 'recording') pipeline.cancel();
      void notes.start();
    }, 150);
  });
  hotkey.on('noteStop', () => {
    if (SELFTEST) return;
    if (notes.active) void notes.stop();
  });

  // Actions directes (survol de la pastille, menu du Dock) : dictée mains libres et prise de notes.
  const toggleDictation = (): void => {
    if (longCapture()) return;
    if (pipeline.current === 'recording') void pipeline.end();
    else if (['idle', 'done', 'error'].includes(pipeline.current)) void pipeline.begin();
  };
  const toggleNote = (): void => {
    if (notes.active) void notes.stop();
    else if (!longCapture()) void startNote();
  };
  ipcMain.on('overlay:hover', (e, on: boolean) => isTrustedSender(e) && overlay.setInteractive(!!on));
  ipcMain.on('overlay:drag', (e, phase: string) => {
    if (!isTrustedSender(e)) return;
    if (phase === 'start') overlay.dragStart();
    else if (phase === 'end') overlay.dragEnd();
    else if (phase === 'reset') overlay.resetPosition();
  });
  ipcMain.on('overlay:action', (e, name: string) => {
    if (!isTrustedSender(e)) return;
    if (name === 'dictate') toggleDictation();
    else if (name === 'note') toggleNote();
  });
  let dockKey = '';
  const rebuildDockMenu = (): void => {
    // Les statuts arrivent ~30×/s (niveau micro) : on ne reconstruit que si le menu change.
    const key = `${pipeline.current === 'recording'}|${notes.active}|${notes.state}|${notes.busy}`;
    if (key === dockKey) return;
    dockKey = key;
    app.dock?.setMenu(
      Menu.buildFromTemplate([
        { label: pipeline.current === 'recording' ? 'Arrêter la dictée' : 'Dicter', click: toggleDictation, enabled: !longCapture() },
        { label: notes.active ? 'Terminer la note' : 'Démarrer une note', click: toggleNote, enabled: notes.active || !longCapture() },
        ...(notes.active
          ? [notes.state === 'paused'
              ? { label: 'Reprendre la note', click: () => notes.resume() }
              : { label: 'Mettre la note en pause', click: () => notes.pause() }]
          : []),
        { type: 'separator' },
        { label: 'Mes notes', click: () => openAppWindow('notes') },
      ]),
    );
  };
  rebuildDockMenu();
  notes.on('active', rebuildDockMenu);
  notes.on('status', rebuildDockMenu);
  pipeline.on('status', rebuildDockMenu);
  hotkey.on('mode', () => tray.rebuild());
  if (!hotkey.configure(String(settings.get('general.shortcut')))) hotkey.configure(PushToTalk.FALLBACK);

  watchAccessibility(trusted, hotkey, () => tray.rebuild());

  settings.on('change', (k: string, v: unknown) => {
    if (k === 'general.shortcut' && !hotkey.configure(String(v))) log('raccourci refusé', v);
    if (k === 'whisper.model') {
      const name = String(v);
      // Modèle choisi absent mais téléchargeable → on le récupère (le serveur bascule à l'arrivée).
      if (CATALOG[name] && !whisperModelExact(name) && !modelDownloader.downloading)
        downloadWhisper(name, name).catch(() => undefined);
      else void whisperServer.start(name);
    }
    if (k === 'overlay.idleMode') overlay.setIdleMode(v === 'hidden' ? 'hidden' : 'dim');
    if (k === 'overlay.position') overlay.reposition(); // Réglages › Réinitialiser la position de la pastille
    if (k === 'general.launchAtLogin') syncLoginItem(!!v);
    if (k === 'updates.auto' && v !== false) void updater.check();
    tray.rebuild();
  });

  log('état', {
    accessibility: trusted(),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    whisperBin: whisperBin() ?? null,
    whisperModel: whisperModel(String(settings.get('whisper.model'))) ?? null,
    llmRouter: routerAvailable(),
    hotkeyMode: hotkey.mode,
    shortcut: settings.get('general.shortcut'),
  });

  const noteWav = process.env.DICTA_SELFTEST_NOTE === '1' ? process.env.DICTA_SELFTEST : process.env.DICTA_SELFTEST_NOTE;
  if (noteWav) {
    await selfTestNote(noteWav, notes, recorder, overlay);
    return;
  }
  if (process.env.DICTA_SELFTEST) {
    await selfTest(process.env.DICTA_SELFTEST, overlay);
    return;
  }
  // Premier lancement : onboarding (permissions, raccourci, moteur IA) dans la fenêtre principale.
  if (!NO_PROMPT && settings.get('onboarding.done') !== true) openAppWindow();
  tray.rebuild();
}

/** DICTA_SELFTEST=/chemin/test.wav : whisper + nettoyage + capture de l'overlay, puis quitte. */
async function selfTest(wav: string, overlay: Overlay): Promise<void> {
  const fs = await import('node:fs');
  const { transcribe } = await import('./whisper');
  const { clean } = await import('./cleaner');
  try {
    const { clipboard } = await import('electron');
    const ins = await import('./insert');
    await clipboard.writeText('presse-papiers original ✓');
    const snap = await ins.snapshot();
    await clipboard.writeText('texte dicté');
    await ins.restore(snap);
    log('selftest: presse-papiers restauré =', (await clipboard.readText()) === 'presse-papiers original ✓');
    for (const st of ['recording', 'transcribing'] as const) {
      overlay.setStatus({ state: st, level: 0.6 });
      await new Promise((r) => setTimeout(r, 700));
      const img = await overlay.capture();
      if (img) fs.writeFileSync(`${wav}.overlay-${st}.png`, img);
    }
    openAppWindow();
    await new Promise((r) => setTimeout(r, 2500));
    const shot = await captureAppWindow();
    if (shot) fs.writeFileSync(`${wav}.app.png`, shot);
    log('selftest: whisper-server prêt =', await whisperServer.start(String(settings.get('whisper.model'))));
    const buf = fs.readFileSync(wav);
    for (let i = 0; i < 3; i++) {
      const w = await transcribe(buf, {
        model: String(settings.get('whisper.model')),
        language: 'fr',
        prompt: String(settings.get('whisper.prompt')),
      });
      const c = await clean(w.text, { language: 'fr' });
      log('selftest', { run: i + 1, whisperMs: w.ms, raw: w.text, clean: c.text, provider: c.provider, model: c.model, cleanMs: c.latencyMs });
    }
  } catch (e) {
    log('selftest: échec', e);
  }
  app.quit();
}

/**
 * DICTA_SELFTEST=/chemin/long.wav DICTA_SELFTEST_NOTE=1 (ou DICTA_SELFTEST_NOTE=/chemin/long.wav) : prise de
 * notes de bout en bout, l'audio étant injecté dans la capture comme s'il venait du micro (DICTA_SELFTEST_SPEED,
 * défaut 1 = temps réel). DICTA_SELFTEST_NOTE_SYS=/chemin/sys.wav : 2e piste injectée comme « son du Mac »
 * (le 1er WAV est alors la piste micro). DICTA_SELFTEST_NO_PAUSE=1 : sans pause au milieu.
 * Mesure : transcription pendant l'enregistrement vs après l'arrêt, diarisation, organisation ;
 * journalise la transcription étiquetée et les segments (<id>.json).
 */
async function selfTestNote(wav: string, notes: NoteSession, recorder: Recorder, overlay: Overlay): Promise<void> {
  const fs = await import('node:fs');
  const { decodeWav } = await import('../shared/vad');
  try {
    log('selftest-note: whisper-server prêt =', await whisperServer.start(String(settings.get('whisper.model'))));
    const pcm = decodeWav(new Uint8Array(fs.readFileSync(wav)));
    const sysWav = process.env.DICTA_SELFTEST_NOTE_SYS;
    const sys = sysWav ? decodeWav(new Uint8Array(fs.readFileSync(sysWav))) : undefined;
    const speed = Number(process.env.DICTA_SELFTEST_SPEED || 1);
    log(`selftest-note: audio ${(pcm.length / 16000).toFixed(1)} s, vitesse ×${speed}${sys ? ', + piste « son du Mac »' : ''}`);
    const t0 = Date.now();
    await notes.start({ feed: true });
    let shot = false;
    notes.on('status', async (s: DictaStatus) => {
      if (!shot && s.mode === 'note' && (s.elapsedMs ?? 0) > 3000) {
        shot = true;
        const img = await overlay.capture();
        if (img) fs.writeFileSync(`${wav}.overlay-note.png`, img);
      }
    });
    // pause / reprise au milieu (3 s) pour exercer le chemin
    if (process.env.DICTA_SELFTEST_NO_PAUSE === '1') await recorder.feed(pcm, speed, sys);
    else {
      const half = Math.floor(pcm.length / 2);
      await recorder.feed(pcm.subarray(0, half), speed, sys?.subarray(0, half));
      notes.pause();
      await new Promise((r) => setTimeout(r, 3000));
      notes.resume();
      await recorder.feed(pcm.subarray(half), speed, sys?.subarray(half));
    }
    const fedAt = Date.now();
    const id = await notes.stop();
    const t = notes.timings;
    const { getNote } = await import('./notes');
    const note = id ? getNote(id) : null;
    log('selftest-note', {
      recordMs: fedAt - t0,
      elapsedNoteMs: note?.meta.durationMs,
      segments: t.segments,
      whisperMsTotal: t.segMs,
      transcribeAfterStopMs: t.transcribedAt - t.stopAt,
      diarizeMs: t.diarizeMs,
      diarizeWallMs: t.diarizedAt - t.transcribedAt,
      diarizeMode: t.diarizeMode,
      speakers: t.speakers,
      organizeMs: t.organizedAt - t.diarizedAt,
      totalAfterStopMs: t.organizedAt - t.stopAt,
      words: note?.meta.words,
      provider: note?.meta.provider,
      file: note?.meta.path,
    });
    if (note) log('selftest-note: transcription étiquetée\n' + note.transcript);
    if (note?.segments) log('selftest-note: segments', JSON.stringify(note.segments));
  } catch (e) {
    log('selftest-note: échec', e);
  }
  app.quit();
}

/**
 * Surveille l'Accessibilité en permanence : à l'octroi, bascule sans redémarrage (raccourci maintenu / fn,
 * collage automatique). Si le raccourci ne s'active pas malgré tout (TCC pris en compte au lancement),
 * relance l'app une seule fois.
 */
function watchAccessibility(trusted: () => boolean, hotkey: PushToTalk, onChange: () => void): void {
  let was = trusted();
  setInterval(() => {
    const now = trusted();
    if (now === was) return;
    was = now;
    log('Accessibilité :', now ? 'accordée → collage automatique + raccourci maintenu' : 'retirée → mode presse-papiers');
    onChange();
    if (!now) return;
    hotkey.recheck();
    setTimeout(() => {
      const ok = hotkey.mode === 'fn' || hotkey.mode === 'hold';
      log('hotkey après octroi de l’Accessibilité :', hotkey.mode, `fn=${hotkey.fnStatus}`);
      onChange();
      if (!ok && !process.argv.includes('--relaunched') && app.isPackaged) {
        log('relance de l’app pour appliquer la permission');
        app.relaunch({ args: [...process.argv.slice(1), '--relaunched'] });
        app.quit();
      }
    }, 3000);
  }, 1500);
}

/** « Lancer au démarrage » : seulement pour l'app packagée (en dev, ce serait le binaire Electron). */
function syncLoginItem(on: boolean): void {
  if (!app.isPackaged) return void log('launchAtLogin ignoré en développement', on);
  app.setLoginItemSettings({ openAtLogin: on });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.quit());

app.on('window-all-closed', () => {
  /* fenêtre fermée : l'app reste active (barre de menus + overlay + Dock) */
});
app.on('will-quit', () => {
  updater.onQuit(); // mise à jour prête → remplacée après la fermeture (script détaché)
  hotkeyRef?.dispose();
  whisperServer.stop();
  stopOllama();
});

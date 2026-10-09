import { contextBridge, ipcRenderer } from 'electron';

// Pont de la fenêtre principale — contrat : docs/APP_API.md
const invoke = (ch: string, ...a: unknown[]) => ipcRenderer.invoke(`app:${ch}`, ...a);
const on = (ch: string) => (cb: (v: unknown) => void) => {
  if (typeof cb !== 'function') return;
  ipcRenderer.on(`app:${ch}`, (_e, v) => cb(v));
};

contextBridge.exposeInMainWorld('dictaApp', {
  getPermissions: () => invoke('getPermissions'),
  requestMic: () => invoke('requestMic'),
  openAccessibilitySettings: () => invoke('openAccessibilitySettings'),
  onPermissions: on('permissions'),
  requestInputMonitoring: () => invoke('requestInputMonitoring'),
  getFnUsage: () => invoke('getFnUsage'),
  repairAccessibility: () => invoke('repairAccessibility'),
  setFnUsageNothing: () => invoke('setFnUsageNothing'),

  getConfig: () => invoke('getConfig'),
  setConfig: (key: string, value: unknown) => invoke('setConfig', key, value),
  testProvider: (id: string) => invoke('testProvider', id),
  providerStatuses: () => invoke('providerStatuses'),

  ollamaStatus: () => invoke('ollamaStatus'),
  pullOllamaModel: () => invoke('pullOllamaModel'),
  onOllamaProgress: on('ollamaProgress'),
  whisperStatus: () => invoke('whisperStatus'),
  downloadWhisper: (model?: 'large-v3-turbo' | 'small') => invoke('downloadWhisper', model),
  onWhisperProgress: on('whisperProgress'),

  onStatus: on('status'),
  onDictation: on('dictation'),
  getStats: () => invoke('getStats'),
  getRecent: () => invoke('getRecent'),
  clearRecent: () => invoke('clearRecent'),

  // prise de notes (docs/APP_API.md › Mode « Prise de notes »)
  startNote: () => invoke('startNote'),
  pauseNote: () => invoke('pauseNote'),
  resumeNote: () => invoke('resumeNote'),
  stopNote: (opts?: { title?: string; markers?: { atMs: number; text: string }[] }) => invoke('stopNote', opts),
  cancelNote: () => invoke('cancelNote'),
  onNoteProgress: on('noteProgress'),
  listNotes: () => invoke('listNotes'),
  getNote: (id: string) => invoke('getNote', id),
  reorganizeNote: (id: string) => invoke('reorganizeNote', id),
  deleteNote: (id: string) => invoke('deleteNote', id),
  revealNote: (id: string) => invoke('revealNote', id),
  copyNote: (id: string) => invoke('copyNote', id),
  renameSpeaker: (noteId: string, from: string, to: string) => invoke('renameSpeaker', noteId, from, to),

  // mises à jour (docs/APP_API.md › Mises à jour)
  getVersion: () => invoke('getVersion'),
  getUpdateStatus: () => invoke('getUpdateStatus'),
  checkForUpdates: () => invoke('checkForUpdates'),
  installUpdate: () => invoke('installUpdate'),
  onUpdate: on('update'),
  onFullscreen: on('fullscreen'), // cb(boolean) — entrée / sortie du plein écran macOS

  finishOnboarding: () => invoke('finishOnboarding'),
  resetOnboarding: () => invoke('resetOnboarding'),
  // « Supprimer toutes mes données » (Réglages › Confidentialité) : efface puis relance l'app — docs/APP_API.md
  wipeAllData: (opts?: { documents?: boolean; models?: boolean }) => invoke('wipeAllData', opts ?? {}),
  openExternal: (url: string) => invoke('openExternal', url),
  platform: { version: String(ipcRenderer.sendSync('app:version')) },
});

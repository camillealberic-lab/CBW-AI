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
  onConfigChanged: on('configChanged'), // cb({ key, value }) — cleaning.vocabulary / dictionary.learned modifiés côté main
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
  startNote: (opts?: { title?: string; participants?: string[]; eventId?: string }) => invoke('startNote', opts ?? {}),
  pauseNote: () => invoke('pauseNote'),
  resumeNote: () => invoke('resumeNote'),
  stopNote: (opts?: { title?: string; markers?: { atMs: number; text: string }[]; userNotes?: string; userTimes?: Record<string, string>; template?: string; participants?: string[] }) => invoke('stopNote', opts),
  cancelNote: () => invoke('cancelNote'),
  onNoteProgress: on('noteProgress'),
  listNotes: () => invoke('listNotes'),
  getNote: (id: string) => invoke('getNote', id),
  reorganizeNote: (id: string) => invoke('reorganizeNote', id),
  deleteNote: (id: string) => invoke('deleteNote', id),
  revealNote: (id: string) => invoke('revealNote', id),
  copyNote: (id: string) => invoke('copyNote', id),
  copyText: (text: string) => invoke('copyText', text),
  renameSpeaker: (noteId: string, from: string, to: string) => invoke('renameSpeaker', noteId, from, to),
  // notes v2 (docs/APP_API.md › Notes v2 — écran Notes)
  notesV2: {
    current: () => invoke('notes:current'),
    call: (action: 'start' | 'snooze' | 'dismiss' | 'keep' | 'resume' | 'stopNow') => invoke('notes:call', action),
    callState: () => invoke('notes:callState'),
    onCallDetected: on('callDetected'), // { app?, bundleId?, seconds } | null (carte retirée)
    onAutoStop: on('noteAutoStop'), // { phase: 'warn'|'stopped'|'cancel'|'done', seconds? }
    regenerate: (id: string, o?: { template?: string }) => invoke('notes:regenerate', id, o ?? {}),
    restorePrevious: (id: string) => invoke('notes:restorePrevious', id),
    renameSegment: (id: string, startMs: number, to: string) => invoke('notes:renameSegment', id, startMs, to),
    save: (id: string, patch: { annotated?: string; title?: string }) => invoke('notes:save', id, patch),
    templates: () => invoke('notes:templates'),
    ask: (qid: string, question: string, noteIds: string[], history?: { role: string; content: string }[]) => invoke('notes:ask', qid, question, noteIds, history ?? []),
    search: (q: string) => invoke('notes:search', q),
    audio: (id: string, fromMs: number, toMs: number) => invoke('notes:audio', id, fromMs, toMs),
    privacy: () => invoke('notes:privacy'),
    onLive: on('noteLive'), // { noteId, source: 'mic'|'system', startMs, endMs, text }
    onStage: on('noteStage'), // { noteId, stage: 'transcript'|'voices'|'summary'|'done' }
    onVoices: on('noteVoices'), // { noteId, segments, diarized, mode }
    onDevice: on('noteDevice'), // { state: 'lost'|'recovered'|'fallback'|'muted', label }
    onDraft: on('noteDraft'), // NoteMeta du brouillon
    onDelta: on('noteDelta'), // { noteId, annotated } (cumulé ; '' = autre fournisseur)
    onAskDelta: on('askDelta'), // { qid, answer }
    onMeetingSoon: on('meetingSoon'), // CalendarEvent, ~1 min avant
  },
  hub: { available: () => invoke('hub:available'), send: (tasks: unknown) => invoke('hub:send', tasks) },
  calendar: { status: () => invoke('calendar:status'), enable: (on?: boolean) => invoke('calendar:enable', on), current: () => invoke('calendar:current'), upcoming: () => invoke('calendar:upcoming') },
  engine: { status: () => invoke('engine:status'), downloadNow: () => invoke('engine:downloadNow'), cancel: () => invoke('engine:cancel') },
  onEngineProgress: on('engineProgress'),
  licenses: () => invoke('licenses'),

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

  // ── parité Wispr (docs/APP_API.md › Historique, micro, snippets, réécriture…)
  audio: { listInputs: () => invoke('audio:listInputs') },
  micTest: { start: () => invoke('micTest:start'), stop: () => invoke('micTest:stop') },
  onMicLevel: on('micLevel'), // cb(0..1) ; -1 = test terminé
  history: {
    retry: (id: string) => invoke('history:retry', id),
    pasteRaw: (id?: string) => invoke('history:pasteRaw', id),
    recover: () => invoke('history:recover'),
    clearAudio: () => invoke('history:clearAudio'),
  },
  onHistoryChanged: on('historyChanged'),
  snippets: { get: () => invoke('snippets:get'), set: (list: unknown) => invoke('snippets:set', list) },
  rewrite: {
    getPresets: () => invoke('rewrite:presets:get'),
    setPresets: (list: unknown) => invoke('rewrite:presets:set', list),
    run: (id: string) => invoke('rewrite:run', id),
  },
  dictionary: { export: () => invoke('dictionary:export'), import: () => invoke('dictionary:import') },
  importContacts: (opts?: { calendar?: boolean }) => invoke('contacts:import', opts ?? {}),
  notepad: {
    list: () => invoke('notepad:list'),
    remove: (id: string) => invoke('notepad:remove', id),
    clear: () => invoke('notepad:clear'),
    copy: () => invoke('notepad:copy'),
  },
  getActivity: () => invoke('getActivity'),
  image: { save: (dataUrl: string) => invoke('image:save', dataUrl), copy: (dataUrl: string) => invoke('image:copy', dataUrl) },
  getSecureInput: () => invoke('getSecureInput'),
  onSecureInput: on('secureInput'), // cb({ active, app })
  platform: { version: String(ipcRenderer.sendSync('app:version')) },
});

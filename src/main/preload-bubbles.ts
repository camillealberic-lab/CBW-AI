import { contextBridge, ipcRenderer } from 'electron';

// Bulles du brainstorm en direct (design/bubbles/bubbles.html) — docs/APP_API.md › Brainstorm v2.
// état = { live: LiveQuestion[], title, recording, elapsedMs }
contextBridge.exposeInMainWorld('cbwBubbles', {
  onState: (cb: (s: unknown) => void) => {
    if (typeof cb === 'function') ipcRenderer.on('bubbles:state', (_e, s) => cb(s));
  },
  answer: (qid: string, text: string) => ipcRenderer.send('bubbles:answer', String(qid ?? ''), String(text ?? '')),
  dismiss: (qid: string) => ipcRenderer.send('bubbles:dismiss', String(qid ?? '')),
  /** Survol d'une carte : la fenêtre devient cliquable (sinon la souris la traverse). */
  setHover: (on: boolean) => ipcRenderer.send('bubbles:hover', !!on),
});

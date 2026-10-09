import { contextBridge, ipcRenderer } from 'electron';

// design/overlay/overlay.html s'abonne automatiquement à window.dicta.onStatus(cb).
contextBridge.exposeInMainWorld('dicta', {
  onStatus: (cb: (s: unknown) => void) => ipcRenderer.on('overlay:status', (_e, s) => cb(s)),
  /** Survol de la pastille : la fenêtre devient cliquable (sinon elle laisse passer la souris). */
  setHover: (on: boolean) => ipcRenderer.send('overlay:hover', !!on),
  /** Boutons du mode survol : 'dictate' (écoute) ou 'note' (prise de notes). */
  action: (name: 'dictate' | 'note') => ipcRenderer.send('overlay:action', name),
  /** Glisser la pastille : 'start' | 'end' ; 'reset' (double-clic) = place par défaut. */
  drag: (phase: 'start' | 'end' | 'reset') => ipcRenderer.send('overlay:drag', phase),
});

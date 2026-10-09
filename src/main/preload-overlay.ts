import { contextBridge, ipcRenderer } from 'electron';

// design/overlay/overlay.html s'abonne automatiquement à window.dicta.onStatus(cb).
contextBridge.exposeInMainWorld('dicta', {
  onStatus: (cb: (s: unknown) => void) => ipcRenderer.on('overlay:status', (_e, s) => cb(s)),
  /** Survol de la pastille : la fenêtre devient cliquable (sinon elle laisse passer la souris). */
  setHover: (on: boolean) => ipcRenderer.send('overlay:hover', !!on),
  /** Boutons du mode survol : 'dictate' (écoute), 'note' (prise de notes) ou 'brainstorm' (ouvre #brainstorm et démarre le vidage ; l'arrête s'il est en cours). */
  action: (name: 'dictate' | 'note' | 'brainstorm') => ipcRenderer.send('overlay:action', name),
});

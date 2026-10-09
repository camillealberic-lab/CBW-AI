import { contextBridge, ipcRenderer } from 'electron';

// design/update/update.html (fenêtre « Nouvelle version », src/main/updatePopup.ts).
contextBridge.exposeInMainWorld('cbwUpdate', {
  /** { current, version, notes, message? } — poussé au chargement puis à chaque mise à jour de l'état. */
  onData: (cb: (d: unknown) => void) => ipcRenderer.on('update-popup:data', (_e, d) => cb(d)),
  /** « Mettre à jour » : { ok } (l'app se ferme et se relance) ou { ok: false, message }. */
  install: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('update-popup:install'),
  /** « Plus tard » (Échap). */
  later: () => ipcRenderer.send('update-popup:later'),
  /** Hauteur du contenu (px) : la fenêtre s'y ajuste. */
  resize: (h: number) => ipcRenderer.send('update-popup:resize', Number(h)),
});

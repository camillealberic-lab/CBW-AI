import { contextBridge, ipcRenderer } from 'electron';

// Pont du popover de la barre de menus (design/tray/tray.html) — minimal.
contextBridge.exposeInMainWorld('cbwTray', {
  getState: () => ipcRenderer.invoke('tray:getState'),
  onState: (cb: (s: unknown) => void) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('tray:state', (_e, s) => cb(s));
  },
  action: (name: string) => ipcRenderer.send('tray:action', String(name)),
  copyLast: () => ipcRenderer.invoke('tray:copyLast'),
  resize: (h: number) => ipcRenderer.send('tray:resize', Number(h)),
});

import { contextBridge, ipcRenderer } from 'electron';

// La page design/settings/settings.html définit elle-même window.dicta (monde principal).
// On expose un pont hôte séparé ; le câblage est injecté par settingsWindow.ts après chargement.
contextBridge.exposeInMainWorld('__DICTA_WIRED__', true);
contextBridge.exposeInMainWorld('dictaHost', {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  action: (name: string, payload: unknown) => ipcRenderer.invoke('settings:action', name, payload),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!/^settings:push:/.test(channel)) return;
    ipcRenderer.on(channel, (_e, ...args) => cb(...args));
  },
});

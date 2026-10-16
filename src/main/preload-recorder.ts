import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dictaRecorder', {
  onArm: (cb: (cfg?: unknown) => void) => ipcRenderer.on('rec:arm', (_e, c) => cb(c)),
  onList: (cb: (id: number) => void) => ipcRenderer.on('rec:list', (_e, id) => cb(id)),
  devices: (id: number, list: unknown) => ipcRenderer.send('rec:devices', id, list),
  noInput: () => ipcRenderer.send('rec:noinput'),
  limit: (kind: string, remainingMs: number) => ipcRenderer.send('rec:limit', kind, remainingMs),
  interrupted: (reason: string) => ipcRenderer.send('rec:interrupted', reason),
  onDisarm: (cb: () => void) => ipcRenderer.on('rec:disarm', () => cb()),
  onStart: (cb: (opts?: unknown) => void) => ipcRenderer.on('rec:start', (_e, o) => cb(o)),
  onPause: (cb: () => void) => ipcRenderer.on('rec:pause', () => cb()),
  onResume: (cb: () => void) => ipcRenderer.on('rec:resume', () => cb()),
  onFeed: (cb: (pcm: ArrayBuffer, speed: number, sys?: ArrayBuffer | null) => void) =>
    ipcRenderer.on('rec:feed', (_e, pcm, speed, sys) => cb(pcm, speed, sys)),
  fed: () => ipcRenderer.send('rec:fed'),
  onStop: (cb: () => void) => ipcRenderer.on('rec:stop', () => cb()),
  onCancel: (cb: () => void) => ipcRenderer.on('rec:cancel', () => cb()),
  level: (v: number) => ipcRenderer.send('rec:level', v),
  started: (info: unknown) => ipcRenderer.send('rec:started', info),
  segment: (wav: ArrayBuffer, start: number, end: number, commit: boolean, source: string, from: number, to: number) => ipcRenderer.send('rec:segment', wav, start, end, commit, source, from, to),
  device: (state: string, label: string) => ipcRenderer.send('rec:device', state, label),
  result: (r: unknown) => ipcRenderer.send('rec:result', r),
  error: (msg: string) => ipcRenderer.send('rec:error', msg),
  pcm: (mix: ArrayBuffer, mic: ArrayBuffer | null, sys: ArrayBuffer | null) => ipcRenderer.send('rec:pcm', mix, mic, sys),
  log: (msg: string) => ipcRenderer.send('rec:log', msg),
});

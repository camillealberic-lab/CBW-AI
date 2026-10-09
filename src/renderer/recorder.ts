// Fenêtre cachée de capture micro : getUserMedia → AudioWorklet → PCM 16 kHz mono.
// Pont IPC exposé par preload-recorder.ts sous window.dictaRecorder.
//
// Latence :
//  - le graphe audio (AudioContext + worklet) est prêt en permanence ; seul le micro s'ouvre/se ferme ;
//  - « arm » (1er appui sur fn) ouvre le micro et remplit un tampon circulaire de pré-écoute (~300 ms) :
//    le début de la phrase n'est jamais coupé et getUserMedia est déjà fait au moment de « start » ;
//  - pendant l'enregistrement, un VAD (src/shared/vad.ts) envoie les segments au main dès qu'une pause
//    est détectée : ils sont transcrits pendant que la personne parle encore.
//
// Prise de notes (Notes v2) :
//  - son du Mac (visios) capté en plus du micro : getDisplayMedia → le main répond « audio: 'loopback' »
//    (CoreAudio Tap, macOS 14.2+) avec la vidéo de cette fenêtre cachée, coupée aussitôt ;
//  - les deux sources passent par un ChannelMerger (canal 0 = micro, 1 = Mac) : synchronisées à l'échantillon ;
//  - le VAD / Whisper reçoivent le mélange ; le WAV de session (mélange + pistes séparées pour la
//    diarisation) part au main par blocs de 0,5 s (rien d'accumulé ici).
import { encodeWav, RATE, Segmenter, trimSilence } from '../shared/vad';

interface RecorderBridge {
  onArm(cb: () => void): void;
  onDisarm(cb: () => void): void;
  onStart(cb: (opts?: StartOpts) => void): void;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onFeed(cb: (pcm: ArrayBuffer, speed: number, sys?: ArrayBuffer | null) => void): void;
  fed(): void;
  onStop(cb: () => void): void;
  onCancel(cb: () => void): void;
  level(v: number): void;
  started(info: { openMs: number; prerollMs: number }): void;
  segment(wav: ArrayBuffer, start: number, end: number, commit: boolean): void;
  result(r: { tail: ArrayBuffer | null; tailStart: number; full: ArrayBuffer; durationMs: number; lastSpeechEnd: number; total: number; voicedMs?: number }): void;
  error(msg: string): void;
  pcm(mix: ArrayBuffer, mic: ArrayBuffer | null, sys: ArrayBuffer | null): void;
  log(msg: string): void;
}
interface StartOpts {
  note?: boolean;
  feed?: boolean;
  /** Envoie le PCM de la session au main (WAV complet de la note). */
  wav?: boolean;
  /** Capte aussi le son du Mac (réglage notes.systemAudio). */
  systemAudio?: boolean;
  /** Autotest : ouvre la capture du son du Mac même en mode injecté (vérifie le chemin, données ignorées). */
  probeSys?: boolean;
}
declare global {
  interface Window {
    dictaRecorder: RecorderBridge;
  }
}

const bridge = window.dictaRecorder;
const PREROLL = Math.round(RATE * 0.3);

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const i = inputs[0];
    if (i && i[0]) this.port.postMessage([i[0].slice(0), i[1] ? i[1].slice(0) : null]);
    return true;
  }
}
registerProcessor('dicta-tap', Tap);
`;

let ctx: AudioContext | null = null;
let node: AudioWorkletNode | null = null;
let merger: ChannelMergerNode | null = null;
let stream: MediaStream | null = null;
let src: MediaStreamAudioSourceNode | null = null;
let opening: Promise<number> | null = null; // ms d'ouverture du micro
let ring = new Float32Array(PREROLL);
let ringPos = 0;
let ringFill = 0;
let seg: Segmenter | null = null;
let recording = false;
let starting = false;
let stopAfterStart = false;
let cancelAfterStart = false;
let lastLevelAt = 0;
let levelAcc = 0;
let levelN = 0;
// Prise de notes : session longue (mémoire compactée), pause / reprise ; feed = audio injecté (autotest).
let noteMode = false;
let feeding = false;
let paused = false;
let sinceCompact = 0;
// Son du Mac (notes) et WAV de session.
let wantSys = false;
let sysStream: MediaStream | null = null;
let sysSrc: MediaStreamAudioSourceNode | null = null;
let sysOpening: Promise<void> | null = null;
let sysEver = false; // au moins une ouverture réussie pendant la session
let feedSys = false; // autotest : piste « son du Mac » injectée
let wavOn = false;
let tracksOn = false; // pistes séparées (micro / Mac) en plus du mélange
const FLUSH = RATE / 2;
let outMix: Int16Array = new Int16Array(FLUSH);
let outMic: Int16Array = new Int16Array(FLUSH);
let outSys: Int16Array = new Int16Array(FLUSH);
let outN = 0;

async function ensureGraph(): Promise<AudioContext> {
  if (ctx && node) return ctx;
  // Chromium rééchantillonne la source micro vers le sampleRate du contexte (16 kHz).
  ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  node = new AudioWorkletNode(ctx, 'dicta-tap', { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
  node.port.onmessage = (ev: MessageEvent<[Float32Array, Float32Array | null]>) => onAudio(ev.data[0], ev.data[1]);
  // canal 0 = micro, canal 1 = son du Mac (silence s'il n'est pas capté)
  merger = ctx.createChannelMerger(2);
  merger.connect(node);
  // Le worklet doit être relié à la destination pour être cadencé (sortie silencieuse).
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);
  return ctx;
}

function onAudio(buf: Float32Array, sysBuf: Float32Array | null = null, injected = false): void {
  if (!stream && !injected) return;
  if (feeding && !injected) return;
  if (recording && seg) {
    if (paused) return;
    ingest(buf, injected ? (feedSys ? sysBuf : null) : sysSrc ? sysBuf : null);
    return;
  }
  if (injected) return;
  // pré-écoute : tampon circulaire
  for (let i = 0; i < buf.length; i++) {
    ring[ringPos] = buf[i];
    ringPos = (ringPos + 1) % PREROLL;
  }
  ringFill = Math.min(PREROLL, ringFill + buf.length);
}

/** Session en cours : mélange micro + Mac → VAD ; mélange et pistes → WAV de session (main). */
function ingest(mic: Float32Array, sys: Float32Array | null): void {
  if (!seg) return;
  let mix = mic;
  if (sys) {
    mix = new Float32Array(mic.length);
    for (let i = 0; i < mic.length; i++) mix[i] = Math.max(-1, Math.min(1, mic[i] + (sys[i] ?? 0)));
  }
  seg.push(mix);
  meter(mix);
  if (noteMode && (sinceCompact += mix.length) > RATE * 30) {
    sinceCompact = 0;
    seg.compact(); // l'audio déjà transcrit n'est plus gardé en mémoire
  }
  if (wavOn) writeOut(mix, mic, sys);
}

const i16 = (v: number): number => {
  const s = Math.max(-1, Math.min(1, v));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
};
function writeOut(mix: Float32Array, mic: Float32Array, sys: Float32Array | null): void {
  for (let i = 0; i < mix.length; i++) {
    outMix[outN] = i16(mix[i]);
    if (tracksOn) {
      outMic[outN] = i16(mic[i]);
      outSys[outN] = sys ? i16(sys[i] ?? 0) : 0;
    }
    if (++outN === FLUSH) flushOut();
  }
}
function flushOut(): void {
  if (!outN) return;
  const cut = (a: Int16Array) => a.slice(0, outN).buffer;
  bridge.pcm(cut(outMix), tracksOn ? cut(outMic) : null, tracksOn ? cut(outSys) : null);
  outN = 0;
}

/** Son du Mac (idempotent). Échec (refus, macOS < 14.2…) : journalisé, la note continue au micro seul. */
function openSys(): Promise<void> {
  if (sysStream || !wantSys) return Promise.resolve();
  if (sysOpening) return sysOpening;
  sysOpening = (async () => {
    try {
      const c = await ensureGraph();
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      s.getVideoTracks().forEach((t) => t.stop()); // vidéo imposée par l'API : jetée
      const tracks = s.getAudioTracks();
      if (!tracks.length) throw new Error('aucune piste audio système');
      if (!recording || paused || !wantSys) {
        tracks.forEach((t) => t.stop());
        return;
      }
      sysStream = s;
      sysSrc = c.createMediaStreamSource(new MediaStream(tracks));
      sysSrc.connect(merger!, 0, 1);
      sysEver = true;
      bridge.log(`son du Mac capté (${tracks[0].label || 'loopback'})`);
    } catch (e) {
      bridge.log(`son du Mac indisponible → micro seul (${e instanceof Error ? `${e.name}: ${e.message}` : String(e)})`);
      if (!sysEver) tracksOn = false; // pas de pistes séparées inutiles
    }
  })().finally(() => (sysOpening = null));
  return sysOpening;
}

function closeSys(): void {
  try {
    sysSrc?.disconnect();
  } catch {
    /* ignore */
  }
  sysSrc = null;
  sysStream?.getTracks().forEach((t) => t.stop());
  sysStream = null;
}

function meter(buf: Float32Array): void {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  levelAcc += sum / buf.length;
  levelN++;
  const now = performance.now();
  if (now - lastLevelAt > 33) {
    const rms = Math.sqrt(levelAcc / Math.max(1, levelN));
    const db = 20 * Math.log10(rms + 1e-8); // ~ -50 dB → 0, ~ -10 dB → 1
    bridge.level(Math.max(0, Math.min(1, (db + 50) / 40)));
    levelAcc = 0;
    levelN = 0;
    lastLevelAt = now;
  }
}

/** Ouvre le micro (idempotent). Renvoie le temps d'ouverture en ms (0 si déjà ouvert). */
function arm(): Promise<number> {
  if (stream) return Promise.resolve(0);
  if (opening) return opening;
  opening = (async () => {
    const t0 = performance.now();
    const c = await ensureGraph();
    if (c.state === 'suspended') await c.resume();
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    ringPos = 0;
    ringFill = 0;
    stream = s;
    src = c.createMediaStreamSource(s);
    src.connect(merger!, 0, 0);
    return Math.round(performance.now() - t0);
  })();
  opening
    .catch((e) => bridge.error(e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
    .finally(() => (opening = null));
  return opening;
}

function closeMic(): void {
  try {
    src?.disconnect();
  } catch {
    /* ignore */
  }
  src = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  ringFill = 0;
}

async function start(opts: StartOpts = {}): Promise<void> {
  if (recording || starting) return;
  starting = true;
  cancelAfterStart = false;
  noteMode = !!opts.note;
  feeding = !!opts.feed;
  paused = false;
  sinceCompact = 0;
  wavOn = !!opts.wav;
  wantSys = !!opts.systemAudio && (!feeding || !!opts.probeSys);
  tracksOn = wavOn && wantSys; // (autotest : activé par feed() si une piste « Mac » est injectée)
  sysEver = false;
  feedSys = false;
  outN = 0;
  try {
    const openMs = feeding ? 0 : await arm();
    starting = false;
    if (cancelAfterStart) {
      cancelAfterStart = false;
      closeMic();
      return;
    }
    recording = true;
    if (wantSys) void openSys();
    const s = new Segmenter((a, b, commit) => {
      const audio = trimSilence(s.audio(a, b));
      if (audio.length) bridge.segment(encodeWav(audio), a, b, commit);
    });
    // pré-écoute (ordre chronologique)
    const pre = new Float32Array(ringFill);
    for (let i = 0; i < ringFill; i++) pre[i] = ring[(ringPos - ringFill + i + PREROLL * 2) % PREROLL];
    seg = s;
    if (pre.length) ingest(pre, null); // même chronologie pour le VAD et le WAV de session
    bridge.started({ openMs, prerollMs: Math.round((pre.length / RATE) * 1000) });
    if (stopAfterStart) {
      stopAfterStart = false;
      stop();
    }
  } catch (e) {
    starting = false;
    stopAfterStart = false;
    recording = false;
    closeMic();
    bridge.error(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

function stop(): void {
  const s = seg;
  if (starting) {
    stopAfterStart = true; // relâché pendant l'ouverture du micro
    return;
  }
  if (!recording || !s) return;
  flushOut(); // le main reçoit tout le PCM avant le résultat (même canal IPC, ordre garanti)
  recording = false;
  seg = null;
  feeding = false;
  paused = false;
  wantSys = false;
  closeMic(); // micro coupé dès la fin (pastille orange éteinte)
  closeSys();
  const tail = trimSilence(s.audio(s.cut));
  bridge.result({
    tail: tail.length ? encodeWav(tail) : null,
    tailStart: s.cut,
    full: encodeWav(s.audio()),
    durationMs: Math.round((s.length / RATE) * 1000),
    lastSpeechEnd: s.lastSpeechEnd,
    voicedMs: s.voicedMs,
    total: s.length,
  });
}

function cancel(): void {
  if (starting) cancelAfterStart = true;
  stopAfterStart = false;
  recording = false;
  seg = null;
  feeding = false;
  paused = false;
  wantSys = false;
  outN = 0;
  closeMic();
  closeSys();
}

/** Pause (prise de notes) : la phrase en cours est finalisée (silence ajouté) et le micro est coupé. */
function pause(): void {
  if (!recording || !seg || paused) return;
  const z = new Float32Array(Math.round(RATE * 0.6));
  ingest(z, sysSrc || feedSys ? z : null); // le WAV de session suit la même chronologie que le VAD
  paused = true;
  if (!feeding) closeMic();
  closeSys();
}

async function resume(): Promise<void> {
  if (!recording || !paused) return;
  if (!feeding) {
    try {
      await arm();
    } catch {
      return; // erreur déjà signalée par arm()
    }
  }
  paused = false;
  if (wantSys) void openSys();
}

/** Autotest : injecte du PCM 16 kHz (Float32) comme s'il venait du micro, à `speed` × le temps réel. */
async function feed(pcm: ArrayBuffer, speed: number, sysPcm?: ArrayBuffer | null): Promise<void> {
  const all = new Float32Array(pcm);
  const sysAll = sysPcm ? new Float32Array(sysPcm) : null;
  feedSys = !!sysAll;
  if (feedSys && wavOn) tracksOn = true;
  const step = RATE / 10; // 100 ms
  for (let i = 0; i < all.length && recording; i += step) {
    while (paused && recording) await new Promise((r) => setTimeout(r, 50));
    const mic = all.slice(i, i + step);
    let sys: Float32Array | null = null;
    if (sysAll) {
      sys = new Float32Array(mic.length);
      sys.set(sysAll.subarray(i, i + mic.length));
    }
    onAudio(mic, sys, true);
    await new Promise((r) => setTimeout(r, 100 / Math.max(0.1, speed)));
  }
  bridge.fed();
}

bridge.onArm(() => void arm().catch(() => undefined));
bridge.onDisarm(() => {
  if (!recording) closeMic();
});
bridge.onStart((o) => void start(o ?? {}));
bridge.onPause(pause);
bridge.onResume(() => void resume());
bridge.onFeed((pcm, speed, sys) => void feed(pcm, speed, sys));
bridge.onStop(stop);
bridge.onCancel(cancel);
// Graphe audio prêt dès le chargement (pas le micro : pas de pastille orange au repos).
void ensureGraph().catch(() => undefined);

export {};

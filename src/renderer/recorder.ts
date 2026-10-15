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
  onArm(cb: (cfg?: AudioCfg) => void): void;
  onList(cb: (id: number) => void): void;
  devices(id: number, list: unknown): void;
  noInput(): void;
  limit(kind: 'warn' | 'max', remainingMs: number): void;
  interrupted(reason: string): void;
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
  result(r: { interrupted?: string; tail: ArrayBuffer | null; tailStart: number; full: ArrayBuffer; durationMs: number; lastSpeechEnd: number; total: number; voicedMs?: number }): void;
  error(msg: string): void;
  pcm(mix: ArrayBuffer, mic: ArrayBuffer | null, sys: ArrayBuffer | null): void;
  log(msg: string): void;
}
interface AudioCfg {
  /** Micro choisi (audio.inputDeviceId) ; '' = défaut système. */
  deviceId: string;
  avoidBluetooth: boolean;
  /** Voix basse : gain + AGC renforcés. */
  lowVoice: boolean;
  /** Durée max de dictée en ms (0 = illimité). */
  maxMs: number;
}
interface StartOpts {
  audio?: AudioCfg;
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
const WARN_BEFORE_MS = 60_000; // avertissement une minute avant la limite
const NO_SIGNAL_MS = 1500; // c2 : durée sans son au début
const NO_SIGNAL_PEAK = 0.0015; // ~ -56 dBFS : micro mort / coupé
const LOW_VOICE_GAIN = 4; // +12 dB (c12)
const BT_RE = /airpods|bluetooth|beats|bose|jabra|sony|wh-1000|wf-1000|buds|powerbeats|galaxy|sennheiser|hfp/i;
const BUILTIN_RE = /built-?in|int[ée]gr|macbook|internal|imac|mac mini|studio display/i;
let cfg: AudioCfg = { deviceId: '', avoidBluetooth: true, lowVoice: false, maxMs: 20 * 60_000 };
let gainNode: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
// c2 / c5 / c10
let recSamples = 0;
let peak = 0;
let noSignalDone = false;
let warnSent = false;
let maxSent = false;
let interrupted = '';
let muteTimer: ReturnType<typeof setTimeout> | null = null;

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

/** c2 (aucun son) et c5 (durée max + avertissement). */
function checkSession(mix: Float32Array): void {
  recSamples += mix.length;
  if (!noSignalDone) {
    for (let i = 0; i < mix.length; i++) {
      const a = Math.abs(mix[i]);
      if (a > peak) peak = a;
    }
    if (peak > NO_SIGNAL_PEAK) noSignalDone = true;
    else if (recSamples >= (RATE * NO_SIGNAL_MS) / 1000) {
      noSignalDone = true;
      bridge.noInput();
    }
  }
  if (cfg.maxMs > 0) {
    const ms = (recSamples / RATE) * 1000;
    if (!warnSent && cfg.maxMs > 2 * WARN_BEFORE_MS && ms >= cfg.maxMs - WARN_BEFORE_MS) {
      warnSent = true;
      bridge.limit('warn', Math.round(cfg.maxMs - ms));
    }
    if (!maxSent && ms >= cfg.maxMs) {
      maxSent = true;
      bridge.limit('max', 0); // le main arrête proprement via stop() : le texte est gardé
    }
  }
}

/** Session en cours : mélange micro + Mac → VAD ; mélange et pistes → WAV de session (main). */
function ingest(mic: Float32Array, sys: Float32Array | null): void {
  if (!seg) return;
  let mix = mic;
  if (sys) {
    mix = new Float32Array(mic.length);
    for (let i = 0; i < mic.length; i++) mix[i] = Math.max(-1, Math.min(1, mic[i] + (sys[i] ?? 0)));
  }
  if (interrupted) return; // micro perdu : plus rien à ajouter, l'audio capté reste intact
  seg.push(mix);
  meter(mix);
  checkSession(mix);
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
/** Choisit le micro : réglage explicite, sinon micro intégré si l'entrée par défaut est Bluetooth (c1). */
async function pickDevice(c: AudioCfg): Promise<{ id: string | null; why: string }> {
  let devs: MediaDeviceInfo[] = [];
  try {
    devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  } catch {
    /* ignore */
  }
  if (c.deviceId && devs.some((d) => d.deviceId === c.deviceId)) return { id: c.deviceId, why: 'réglage' };
  if (c.avoidBluetooth) {
    const def = devs.find((d) => d.deviceId === 'default');
    const defLabel = def?.label ?? '';
    // Chromium libelle « Default - <nom> » ; si l'étiquette est vide (accès non accordé), on ne peut pas juger.
    if (BT_RE.test(defLabel) && !BUILTIN_RE.test(defLabel)) {
      const builtin = devs.find((d) => d.deviceId !== 'default' && d.deviceId !== 'communications' && BUILTIN_RE.test(d.label) && !BT_RE.test(d.label));
      if (builtin) return { id: builtin.deviceId, why: 'Bluetooth évité → micro intégré' };
    }
  }
  return { id: null, why: 'défaut système' };
}

function applyLowVoice(on: boolean): void {
  if (gainNode) gainNode.gain.value = on ? LOW_VOICE_GAIN : 1;
}

function watchTrack(s: MediaStream): void {
  const t = s.getAudioTracks()[0];
  if (!t) return;
  // c10 : micro débranché / périphérique perdu → on prévient, l'audio déjà capté reste dans le Segmenter.
  t.addEventListener('ended', () => {
    if (stream !== s) return;
    if (recording) markInterrupted('device-lost');
    else closeMic();
  });
  // Appel entrant / micro pris par une autre app : piste coupée plus d'1,5 s.
  t.addEventListener('mute', () => {
    if (!recording) return;
    if (muteTimer) clearTimeout(muteTimer);
    muteTimer = setTimeout(() => stream === s && recording && t.muted && markInterrupted('muted'), 1500);
  });
  t.addEventListener('unmute', () => {
    if (muteTimer) clearTimeout(muteTimer);
    muteTimer = null;
  });
}

function markInterrupted(reason: string): void {
  if (interrupted || !recording) return;
  interrupted = reason;
  bridge.log(`capture interrompue : ${reason}`);
  bridge.interrupted(reason); // le main/pipeline appelle stop() : le texte déjà dit est gardé
}

function arm(c?: AudioCfg): Promise<number> {
  if (c) cfg = { ...cfg, ...c };
  if (stream && stream.getAudioTracks()[0]?.readyState !== 'live') closeMic(); // micro perdu pendant la pré-écoute
  if (stream) {
    applyLowVoice(cfg.lowVoice);
    return Promise.resolve(0);
  }
  if (opening) return opening;
  opening = (async () => {
    const t0 = performance.now();
    const c = await ensureGraph();
    if (c.state === 'suspended') await c.resume();
    const constraints = { channelCount: 1, echoCancellation: false, noiseSuppression: !cfg.lowVoice, autoGainControl: true };
    let pick = await pickDevice(cfg);
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: pick.id ? { ...constraints, deviceId: { exact: pick.id } } : constraints });
    } catch (e) {
      if (!pick.id) throw e;
      bridge.log(`micro choisi indisponible (${e instanceof Error ? e.name : 'erreur'}) → défaut système`);
      pick = { id: null, why: 'repli' };
      s = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    }
    bridge.log(`micro : ${s.getAudioTracks()[0]?.label || '?'} (${pick.why}${cfg.lowVoice ? ', voix basse' : ''})`);
    ringPos = 0;
    ringFill = 0;
    stream = s;
    src = c.createMediaStreamSource(s);
    if (!gainNode) {
      gainNode = c.createGain();
      // limiteur doux : évite l'écrêtage quand le gain voix basse est actif
      limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      gainNode.connect(limiter).connect(merger!, 0, 0);
    }
    applyLowVoice(cfg.lowVoice);
    src.connect(gainNode);
    watchTrack(s);
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
  if (muteTimer) clearTimeout(muteTimer);
  muteTimer = null;
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
  if (opts.audio) cfg = { ...cfg, ...opts.audio };
  recSamples = 0;
  peak = 0;
  noSignalDone = !!opts.feed || !!opts.note; // alerte micro muet : dictée au micro seulement
  warnSent = false;
  maxSent = false;
  interrupted = '';
  if (opts.note) cfg = { ...cfg, maxMs: 0 }; // notes : pas de limite
  wantSys = !!opts.systemAudio && (!feeding || !!opts.probeSys);
  tracksOn = wavOn && wantSys; // (autotest : activé par feed() si une piste « Mac » est injectée)
  sysEver = false;
  feedSys = false;
  outN = 0;
  try {
    const openMs = feeding ? 0 : await arm(opts.audio);
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
    interrupted: interrupted || undefined,
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

/** c1 : liste des entrées pour l'UI (étiquettes vides sans accès micro → ouverture brève pour les obtenir). */
async function listDevices(id: number): Promise<void> {
  try {
    let devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    if (devs.length && devs.every((d) => !d.label) && !stream) {
      try {
        const t = await navigator.mediaDevices.getUserMedia({ audio: true });
        t.getTracks().forEach((x) => x.stop());
        devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      } catch {
        /* accès refusé : étiquettes vides */
      }
    }
    const defLabel = devs.find((d) => d.deviceId === 'default')?.label ?? '';
    bridge.devices(
      id,
      devs
        .filter((d) => d.deviceId !== 'communications')
        .map((d) => {
          const label = d.label.replace(/^Default - /, '');
          return {
            id: d.deviceId,
            label: d.deviceId === 'default' ? `Défaut du système${defLabel ? ` (${label})` : ''}` : label || 'Micro',
            isDefault: d.deviceId === 'default',
            bluetooth: BT_RE.test(label) && !BUILTIN_RE.test(label),
            builtIn: BUILTIN_RE.test(label),
          };
        }),
    );
  } catch {
    bridge.devices(id, []);
  }
}

bridge.onArm((c) => void arm(c).catch(() => undefined));
bridge.onList((id) => void listDevices(id));
navigator.mediaDevices?.addEventListener('devicechange', () => bridge.log('périphériques audio modifiés'));
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

import { app } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MAX_CHUNK_MS, MEETING_MAX_CHUNK_MS } from '../shared/vad';
import { cleanWhisperOutput, collapseLoops, looksLooping } from '../shared/whisperText';
import { wrongLanguage } from './langGuard';
import { appRoot, dataDir, firstExisting, log, modelsDir, textForLog } from './paths';
import { CATALOG, DEFAULT_DOWNLOAD, modelDownloader } from './whisperModels';

export function findBin(name: string, env?: string): string | undefined {
  return firstExisting([
    env,
    app.isPackaged ? path.join(process.resourcesPath, 'bin', name) : undefined,
    path.join(appRoot(), 'vendor', 'bin', name),
    path.join(appRoot(), 'vendor', 'whisper.cpp', 'build', 'bin', name),
    path.join(dataDir(), 'bin', name),
  ]);
}
/** Prompt Whisper borné (≈ 224 jetons max) : on garde la fin, la plus proche de l'audio. */
export const boundPrompt = (p: string | undefined): string | undefined => {
  const t = (p ?? '').trim();
  return t ? (t.length > 900 ? t.slice(-900) : t) : undefined;
};
export const whisperBin = (): string | undefined => findBin('whisper-cli', process.env.DICTA_WHISPER_BIN);
export const whisperServerBin = (): string | undefined => findBin('whisper-server', process.env.DICTA_WHISPER_SERVER_BIN);

/** Résout un nom de modèle ("large-v3-turbo", "small"…) vers un fichier ggml-*.bin présent. */
export function whisperModel(name: string): string | undefined {
  const d = modelsDir();
  const exact = whisperModelExact(name);
  if (exact) return exact;
  // repli : n'importe quel modèle présent, le plus gros d'abord
  try {
    const all = fs
      .readdirSync(d)
      .filter((f) => /^ggml-.*\.bin$/.test(f))
      .map((f) => path.join(d, f))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
    return all[0];
  } catch {
    return undefined;
  }
}

/** Fichier correspondant exactement au nom (sans repli sur un autre modèle). */
export function whisperModelExact(name: string): string | undefined {
  const d = modelsDir();
  // Nom venant des réglages : jamais un chemin (« ../ ») — seulement un nom de modèle ggml.
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(String(name)) || String(name).includes('..')) name = 'large-v3-turbo';
  return firstExisting([
    process.env.DICTA_WHISPER_MODEL,
    path.join(d, `ggml-${name}-q5_0.bin`),
    path.join(d, `ggml-${name}-q5_1.bin`),
    path.join(d, `ggml-${name}.bin`),
    path.join(d, `ggml-${name}-q8_0.bin`),
  ]);
}

/** Modèle effectivement utilisé (nom court, ex. « large-v3-turbo-q5_0 »). */
const shortName = (file: string): string => path.basename(file).replace(/^ggml-|\.bin$/g, '');

export interface WhisperStatus {
  ready: boolean;
  model: string;
  downloading?: boolean;
  percent?: number;
  error?: string;
}

export function whisperStatus(name: string): WhisperStatus {
  const file = whisperModel(name);
  const p = modelDownloader.current;
  const st: WhisperStatus = {
    ready: !!file && (whisperServer.ready || !!whisperBin()),
    model: file ? shortName(file) : name,
  };
  if (modelDownloader.downloading) {
    st.downloading = true;
    st.percent = p?.percent ?? 0;
  } else if (!file && p?.state === 'error') st.error = p.error;
  return st;
}

/**
 * Télécharge un modèle (défaut : large-v3-turbo q5_0) puis (re)démarre whisper-server.
 * `serverModel` = réglage whisper.model courant (le serveur prend le fichier exact, sinon le plus gros présent).
 */
export async function downloadWhisper(name: string | undefined, serverModel: string): Promise<void> {
  const key = name && CATALOG[name] ? name : DEFAULT_DOWNLOAD;
  await modelDownloader.download(key);
  whisperServer.stop(); // repart sur le meilleur modèle disponible
  await whisperServer.start(serverModel);
}

/** Premier lancement : aucun modèle → téléchargement automatique (celui du réglage s'il est au catalogue). */
export function ensureWhisperModel(serverModel: string): void {
  if (whisperModel(serverModel)) return;
  const key = CATALOG[serverModel] ? serverModel : DEFAULT_DOWNLOAD;
  log('whisper: aucun modèle dans', modelsDir(), '→ téléchargement', key);
  downloadWhisper(key, serverModel).catch(() => undefined /* journalisé ; réessai via l'UI ou la prochaine dictée */);
}

// Nettoyage et détection de boucles : src/shared/whisperText.ts (pur, testé).
export { cleanWhisperOutput, collapseLoops, looksLooping };

export interface TranscribeOpts {
  model: string;
  language: string; // 'fr' | 'en' | 'auto'
  prompt?: string;
  signal?: AbortSignal;
  /**
   * Prise de notes : serveur dédié à contexte audio complet (morceaux jusqu'à 25 s, 30 s de contexte) et
   * réglages de réunion. La dictée garde son serveur (contexte 640) et ses réglages : jamais ralentie.
   */
  meeting?: boolean;
}

/** Réglages envoyés avec chaque requête (les paramètres de requête persistent côté serveur : on les envoie tous). */
interface InferParams {
  audioCtx: number; // 0 = contexte complet du modèle (1500)
  beam: number;
  bestOf: number;
  /** Incrément de température du repli (0 = pas de repli). Le repli sur compression excessive casse les boucles. */
  tempInc: number;
  maxContext: number; // -1 = défaut ; 0 = ne réinjecte pas le texte déjà décodé
  prompt?: string;
}

/** Cœurs « performance » (M4 : 4) : au-delà, les cœurs efficacité ralentissent whisper. */
function perfCores(): number {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const n = Number(execFileSync('sysctl', ['-n', 'hw.perflevel0.physicalcpu'], { encoding: 'utf8' }).trim());
    if (n > 0) return Math.min(8, n);
  } catch {
    /* ignore */
  }
  return 4;
}

/**
 * Contexte audio FIXE de 640 (≈ 12,8 s au lieu de 30 s) : encodeur ≈ 0,4 s au lieu de 0,9 s sur M4.
 * Fixe car whisper-server réutilise son état : changer audio_ctx d'une requête à l'autre (surtout
 * à la baisse) produit du charabia. Les envois au serveur sont donc limités à MAX_CHUNK_MS (marge ×2,
 * le VAD force une coupe à 6 s) ; au-delà → whisper-cli avec le contexte complet.
 */
export const AUDIO_CTX = 640;
const wavMs = (wav: Buffer): number => ((wav.length - 44) / 32000) * 1000;

/**
 * whisper-server persistant : modèle + pipelines Metal gardés en mémoire.
 * Évite ~0,4 s de chargement par dictée et surtout le démarrage à froid
 * (jusqu'à ~7 s observés après une période d'inactivité avec whisper-cli).
 */
class WhisperServer {
  constructor(
    /** 640 pour la dictée (fixe : le serveur réutilise son état) ; 0 = contexte complet (réunion). */
    private readonly audioCtx: number,
    private readonly tag: string,
    private readonly pidName: string,
  ) {}
  private proc: ChildProcess | null = null;
  private port = 0;
  private model = '';
  private readyP: Promise<boolean> | null = null;

  get ready(): boolean {
    return !!this.proc && this.readyP != null && this.ok;
  }
  private ok = false;

  async start(modelName: string): Promise<boolean> {
    const bin = whisperServerBin();
    const model = whisperModel(modelName);
    if (!bin || !model) return false;
    if (this.proc && this.model === model) return this.readyP ?? false;
    this.stop();
    this.model = model;
    this.port = await freePort();
    // Greedy (beam 1, best-of 1), sans repli de température ; flash-attn + Metal actifs par défaut.
    // Réunion : pas de -ac (contexte complet) ; le repli de température est décidé requête par requête.
    const args = ['-m', model, '--host', '127.0.0.1', '--port', String(this.port), '-l', 'fr', '-nt', '-t', String(perfCores()), '-bo', '1', '-bs', '1', '-fa'];
    if (this.audioCtx > 0) args.push('-nf', '-ac', String(this.audioCtx));
    log(`whisper-server${this.tag}: démarrage`, path.basename(model), 'port', this.port);
    killStale(bin, this.pidFile());
    // Chien de garde : un petit shell lance whisper-server et le tue dès que notre stdin se ferme
    // (Electron planté / tué) → jamais d'orphelin qui garde ~0,6 Go + le GPU.
    const p = spawn('/bin/sh', ['-c', WATCHDOG, bin, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    p.stdout!.once('data', (d) => {
      const pid = Number(String(d).trim());
      if (pid) fs.writeFileSync(this.pidFile(), String(pid));
    });
    let tail = '';
    p.stderr!.on('data', (d) => (tail = (tail + d).slice(-2000)));
    p.on('exit', (code) => {
      if (this.proc === p) {
        log(`whisper-server${this.tag}: arrêté`, code, tail.split('\n').slice(-3).join(' '));
        this.proc = null;
        this.ok = false;
        this.readyP = null;
      }
    });
    this.readyP = (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 60000 && this.proc === p) {
        try {
          const r = await fetch(`http://127.0.0.1:${this.port}/health`);
          if (r.ok) {
            this.ok = true;
            log(`whisper-server${this.tag}: prêt en ${Date.now() - t0} ms`);
            return true;
          }
        } catch {
          /* pas encore */
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      return false;
    })();
    return this.readyP;
  }

  private pidFile(): string {
    return path.join(dataDir(), this.pidName);
  }

  /** Attend que le serveur soit prêt (démarrage en cours) ; false s'il ne peut pas l'être. */
  async whenReady(): Promise<boolean> {
    return this.readyP ? this.readyP : false;
  }

  async infer(wav: Buffer, opts: TranscribeOpts, p: InferParams): Promise<string> {
    const fd = new FormData();
    // Les paramètres de requête persistent côté serveur : on les envoie toujours tous (prompt compris,
    // même vide, sinon le prompt d'une requête précédente resterait actif).
    fd.append('audio_ctx', String(p.audioCtx));
    fd.append('beam_size', String(p.beam));
    fd.append('best_of', String(p.bestOf));
    fd.append('temperature_inc', String(p.tempInc));
    fd.append('max_context', String(p.maxContext));
    fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    fd.append('response_format', 'text');
    fd.append('no_timestamps', 'true');
    fd.append('language', opts.language || 'fr');
    fd.append('temperature', '0.0');
    fd.append('prompt', boundPrompt(p.prompt) ?? '');
    // Délai de garde : un serveur bloqué (~1 fois sur 10 observé en test) ne doit jamais figer la dictée → repli.
    const guard = AbortSignal.timeout(Math.max(8_000, Math.round(wavMs(wav) * 2) + 4_000));
    const r = await fetch(`http://127.0.0.1:${this.port}/inference`, { method: 'POST', body: fd, signal: opts.signal ? AbortSignal.any([opts.signal, guard]) : guard });
    if (!r.ok) throw new Error(`whisper-server HTTP ${r.status}`);
    return r.text();
  }

  stop(): void {
    this.ok = false;
    this.readyP = null;
    if (this.proc) {
      this.proc.stdin?.end(); // le chien de garde tue whisper-server
      this.proc.kill();
      this.proc = null;
      fs.rmSync(this.pidFile(), { force: true });
    }
  }
}

/** sh -c : lance "$0" "$@", écrit son pid sur stdout, le tue à la fermeture de stdin ou à SIGTERM. */
const WATCHDOG =
  '"$0" "$@" </dev/null >/dev/null & c=$!; echo $c; ' +
  'trap \'kill $c 2>/dev/null\' TERM INT HUP EXIT; ' +
  // sans job control, un « & » reçoit /dev/null en stdin : on passe par le fd 3
  'exec 3<&0; (while read -r _ <&3; do :; done; kill $c 2>/dev/null) & r=$!; ' +
  'wait $c; kill $r 2>/dev/null';

/** Tue les whisper-server orphelins (pidfile, ou même binaire rattaché à launchd) d'une session précédente. */
function killStale(bin: string, pidFile: string): void {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    if (pid) {
      const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).trim();
      if (cmd.endsWith('whisper-server')) {
        process.kill(pid);
        log('whisper-server: orphelin tué', pid);
      }
    }
  } catch {
    /* pas de pid / process absent */
  }
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n');
    for (const row of rows) {
      const m = row.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (m && m[2] === '1' && m[3].startsWith(bin + ' ')) {
        process.kill(Number(m[1]));
        log('whisper-server: orphelin tué', m[1]);
      }
    }
  } catch {
    /* ignore */
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });
}

export const whisperServer = new WhisperServer(AUDIO_CTX, '', 'whisper-server.pid');
/** Serveur des notes (contexte audio complet, morceaux jusqu'à 25 s) : démarré avec la note, arrêté à la fin. */
export const whisperMeetingServer = new WhisperServer(0, ' (réunion)', 'whisper-server-notes.pid');

/** Dictée : greedy, contexte 640, sans repli de température (inchangé). */
const DICTATION_PARAMS: InferParams = { audioCtx: AUDIO_CTX, beam: 1, bestOf: 1, tempInc: 0, maxContext: -1 };
/** Réunion, 1re passe : contexte complet, greedy, repli de température permis (casse les boucles de compression). */
const MEETING_PARAMS: InferParams = { audioCtx: 0, beam: 1, bestOf: 3, tempInc: 0.2, maxContext: -1 };
/** Nouvel essai après une boucle : sans prompt, sans texte précédent réinjecté, beam 3, repli plus ample. */
const anti = (p: InferParams): InferParams => ({ ...p, beam: 3, bestOf: 3, tempInc: 0.4, maxContext: 0, prompt: undefined });

export async function transcribe(wav: Buffer | string, opts: TranscribeOpts): Promise<{ text: string; ms: number }> {
  const meeting = !!opts.meeting;
  const srv = meeting ? whisperMeetingServer : whisperServer;
  const maxMs = (meeting ? MEETING_MAX_CHUNK_MS : MAX_CHUNK_MS) + 300;
  if (meeting && typeof wav !== 'string' && !srv.ready) {
    await srv.start(opts.model).catch(() => false); // démarrage paresseux si la note l'a devancé
    await srv.whenReady();
  }
  if (srv.ready && typeof wav !== 'string' && wavMs(wav) <= maxMs) {
    const t0 = Date.now();
    const sec = wavMs(wav) / 1000;
    try {
      const base = meeting ? MEETING_PARAMS : DICTATION_PARAMS;
      // Un prompt (texte déjà dicté, noms) rédigé dans une autre langue fait TRADUIRE Whisper malgré `language`
      // (reproduit : audio français + prompt anglais + language=fr → sortie anglaise) : il est alors écarté d'emblée.
      const prompt = opts.prompt && wrongLanguage(opts.prompt, opts.language) ? undefined : opts.prompt;
      if (opts.prompt && !prompt) log(`whisper-server: prompt dans une autre langue que ${opts.language} → ignoré`);
      let text = cleanWhisperOutput(await srv.infer(wav, opts, { ...base, prompt }));
      if (looksLooping(text, sec)) {
        // Un nouvel essai sur le MÊME serveur (contexte inchangé) avec réglages anti-boucle : jamais de
        // rechargement du modèle (whisper-cli ≈ 2,6 s par morceau).
        const first = text.length;
        text = cleanWhisperOutput(await srv.infer(wav, opts, anti(base)));
        if (looksLooping(text, sec)) {
          log(`whisper-server${meeting ? ' (réunion)' : ''}: boucle persistante (${first} puis ${text.length} car.) → répétitions réduites`);
          text = cleanWhisperOutput(collapseLoops(text));
          if (text.length > 30 + sec * 40) text = '';
        }
      }
      // Garde-fou de langue : sortie manifestement dans une autre langue que celle demandée (ex. anglais alors que
      // general.language = fr, poussé par un prompt plein de noms / de texte anglais) → nouvel essai sans prompt ni
      // texte précédent ; on garde la version dans la bonne langue (sinon la 1re).
      if (text && wrongLanguage(text, opts.language)) {
        const again = cleanWhisperOutput(await srv.infer(wav, opts, { ...base, maxContext: 0, prompt: undefined }));
        const fixed = !!again && !wrongLanguage(again, opts.language);
        log(`whisper-server${meeting ? ' (réunion)' : ''}: langue ≠ ${opts.language} → nouvel essai sans prompt (${fixed ? 'corrigé' : 'inchangé'})`);
        if (fixed) text = again;
      }
      const ms = Date.now() - t0;
      log(`whisper(server${meeting ? ', réunion' : ''}): ${ms} ms → ${textForLog(text)}`);
      return { text, ms };
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      log('whisper-server: échec, repli whisper-cli', e);
    }
  }
  return transcribeCli(wav, opts);
}

async function transcribeCli(wav: Buffer | string, opts: TranscribeOpts): Promise<{ text: string; ms: number }> {
  const bin = whisperBin();
  if (!bin) throw new Error('Moteur de transcription introuvable (réinstallez CBW AI)');
  const model = whisperModel(opts.model);
  if (!model) throw new Error('Modèle de transcription en cours de téléchargement');

  let file: string;
  let tmp: string | null = null;
  if (typeof wav === 'string') file = wav;
  else {
    // Dossier temporaire privé de l'utilisateur (/var/folders/…/T, 0700) + fichier 0600, supprimé après usage
    // (et au démarrage suivant en cas de plantage : privacy.ts › cleanupTempAudio).
    tmp = path.join(os.tmpdir(), `dicta-${process.pid}-${Date.now()}.wav`);
    fs.writeFileSync(tmp, wav, { mode: 0o600 });
    file = tmp;
  }

  const args = ['-m', model, '-f', file, '-l', opts.language || 'fr', '-nt', '-np', '-t', '4'];
  const prompt = boundPrompt(opts.prompt && wrongLanguage(opts.prompt, opts.language) ? undefined : opts.prompt);
  if (prompt) args.push('--prompt', prompt);
  const t0 = Date.now();
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let so = '';
      let se = '';
      p.stdout.on('data', (d) => (so += d));
      p.stderr.on('data', (d) => (se += d));
      const onAbort = () => p.kill('SIGKILL');
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      p.on('error', reject);
      p.on('close', (code) => {
        opts.signal?.removeEventListener('abort', onAbort);
        if (code === 0) resolve(so);
        else reject(new Error(`whisper-cli code ${code}: ${se.split('\n').slice(-4).join(' ')}`));
      });
    });
    const ms = Date.now() - t0;
    let text = cleanWhisperOutput(out);
    // La sortie de whisper-cli était jusqu'ici invérifiée : une boucle de 870 car. entrait dans la note.
    if (looksLooping(text, typeof wav === 'string' ? 30 : wavMs(wav) / 1000)) {
      text = cleanWhisperOutput(collapseLoops(text));
      log('whisper: boucle dans la sortie de whisper-cli → répétitions réduites');
    }
    if (text && wrongLanguage(text, opts.language)) log(`whisper: langue ≠ ${opts.language} dans la sortie de whisper-cli (gardée, pas de nouvel essai)`);
    log(`whisper: ${ms} ms (${path.basename(model)}) → ${textForLog(text)}`);
    return { text, ms };
  } finally {
    if (tmp) fs.rm(tmp, () => undefined);
  }
}

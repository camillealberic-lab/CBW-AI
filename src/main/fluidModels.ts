import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Modèles du moteur de réunion (Parakeet TDT v3 + diarisation FluidAudio, ~490 Mo), téléchargés depuis HuggingFace
 * EN ARRIÈRE-PLAN (Mac inactif, sur secteur, hors dictée/réunion), jamais dans l'app ni dans le zip de mise à jour.
 *  - emplacement stable ~/.dicta-ai/models/fluid : jamais retéléchargés à une mise à jour ;
 *  - fichiers épinglés (révision HuggingFace + taille + SHA-256, fluidModels.manifest.ts généré par
 *    scripts/meeting-engine/pin-models.mjs) ; un fichier n'est utilisable qu'une fois son empreinte vérifiée ;
 *  - reprise après coupure (fichier .part + en-tête Range), 4 essais par fichier, coupure si plus aucune donnée en 30 s ;
 *  - pause automatique si la condition de poursuite disparaît (dictée/réunion en cours, batterie, réglage « suspendre »).
 * Module sans Electron (testable avec node --experimental-strip-types) : les conditions et le journal sont injectés.
 */

export interface FluidSet {
  id: string;
  repo: string;
  revision: string;
  /** Dossier du jeu sous le dossier des modèles (là où FluidAudio le cherche). */
  dir: string;
  /** Contenu du fichier `.fluidaudio-revision` (révision épinglée par FluidAudio) ou null. */
  marker: string | null;
  /** [chemin relatif, taille, sha256] */
  files: [string, number, string][];
}

export type FluidState = 'idle' | 'waiting' | 'downloading' | 'verifying' | 'done' | 'error';
/** Raison d'attente (état 'waiting') : l'UI affiche « en attente : Mac actif… ». */
export type FluidWait = 'idle' | 'power' | 'busy' | 'paused' | 'offline';
export interface FluidProgress {
  state: FluidState;
  received: number;
  total: number;
  /** 0..100 */
  percent: number;
  /** Fichier en cours (chemin relatif au jeu, pas de donnée personnelle). */
  file?: string;
  waiting?: FluidWait;
  error?: string;
}

export interface FluidOpts {
  /** Dossier des modèles (~/.dicta-ai/models/fluid). */
  dir: string;
  /** https://huggingface.co (remplaçable : serveur local de test). */
  baseUrl?: string;
  /** Fichiers épinglés (fluidModels.manifest.ts) — passés par meetingEngine.ts ; injectés dans les tests. */
  sets: FluidSet[];
  /** Conditions pour DÉMARRER (Mac inactif + secteur + ni dictée ni réunion + non suspendu). */
  canStart?: () => { ok: true } | { ok: false; why: FluidWait };
  /** Conditions pour CONTINUER (secteur + ni dictée ni réunion + non suspendu) : testées toutes les 5 s. */
  canContinue?: () => { ok: true } | { ok: false; why: FluidWait };
  log?: (...a: unknown[]) => void;
  /** Délai de base entre deux essais d'un même fichier (ms ; réduit dans les tests). */
  retryDelayMs?: number;
  /** Coupure si aucune donnée reçue pendant ce délai (ms). */
  stallMs?: number;
}

const VERIFIED = '.verified.json';

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

export class FluidModels extends EventEmitter {
  private sets: FluidSet[];
  private dir: string;
  private base: string;
  private opts: FluidOpts;
  private verified: Record<string, string> = {};
  private job: Promise<boolean> | null = null;
  private ac: AbortController | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastEmit = 0;
  current: FluidProgress = { state: 'idle', received: 0, total: 0, percent: 0 };

  constructor(opts: FluidOpts) {
    super();
    this.opts = opts;
    this.dir = opts.dir;
    this.base = (opts.baseUrl ?? 'https://huggingface.co').replace(/\/$/, '');
    this.sets = opts.sets;
    this.current.total = this.totalBytes();
    this.loadVerified();
    this.current = { ...this.current, ...(this.ready() ? { state: 'done', received: this.current.total, percent: 100 } : {}) };
  }

  private log(...a: unknown[]): void {
    this.opts.log?.(...a);
  }
  get modelsDir(): string {
    return this.dir;
  }
  totalBytes(): number {
    return this.sets.reduce((n, s) => n + s.files.reduce((m, f) => m + f[1], 0), 0);
  }
  get downloading(): boolean {
    return !!this.job;
  }

  private loadVerified(): void {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(this.dir, VERIFIED), 'utf8'));
      this.verified = v && typeof v === 'object' ? v : {};
    } catch {
      this.verified = {};
    }
  }
  private saveVerified(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = path.join(this.dir, VERIFIED + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(this.verified));
    fs.renameSync(tmp, path.join(this.dir, VERIFIED));
  }
  private abs(s: FluidSet, rel: string): string {
    return path.join(this.dir, s.dir, rel);
  }
  private key(s: FluidSet, rel: string): string {
    return `${s.id}/${rel}`;
  }
  private fileOk(s: FluidSet, f: [string, number, string]): boolean {
    if (this.verified[this.key(s, f[0])] !== f[2]) return false;
    try {
      return fs.statSync(this.abs(s, f[0])).size === f[1];
    } catch {
      return false;
    }
  }
  private markerOk(s: FluidSet): boolean {
    if (!s.marker) return true;
    try {
      return fs.readFileSync(path.join(this.dir, s.dir, '.fluidaudio-revision'), 'utf8').trim() === s.marker;
    } catch {
      return false;
    }
  }

  /** Tous les fichiers présents, à la bonne taille et vérifiés (SHA-256). Synchrone, sans lecture des gros fichiers. */
  ready(): boolean {
    return this.sets.every((s) => s.files.every((f) => this.fileOk(s, f)) && this.markerOk(s));
  }

  /**
   * Fichiers déjà là (ex. préparés par `dicta-meeting prepare --online`) mais jamais vérifiés : empreinte calculée une
   * fois ; un fichier différent de l'épingle est supprimé. Résout true si tout est prêt ensuite.
   */
  async adoptExisting(): Promise<boolean> {
    let changed = false;
    for (const s of this.sets)
      for (const f of s.files) {
        const p = this.abs(s, f[0]);
        if (this.fileOk(s, f)) continue;
        let size = -1;
        try {
          size = fs.statSync(p).size;
        } catch {
          continue;
        }
        if (size !== f[1]) continue;
        if ((await sha256File(p)) === f[2]) {
          this.verified[this.key(s, f[0])] = f[2];
          changed = true;
        } else {
          fs.rmSync(p, { force: true });
          this.log('fluid: fichier différent de l’épingle, supprimé', s.id, f[0]);
        }
      }
    if (changed) this.saveVerified();
    for (const s of this.sets) if (s.files.every((f) => this.fileOk(s, f))) this.writeMarker(s);
    const ok = this.ready();
    if (ok) this.emitP({ state: 'done', received: this.current.total, total: this.current.total, percent: 100 });
    return ok;
  }

  private writeMarker(s: FluidSet): void {
    if (!s.marker) return;
    fs.mkdirSync(path.join(this.dir, s.dir), { recursive: true });
    fs.writeFileSync(path.join(this.dir, s.dir, '.fluidaudio-revision'), s.marker);
  }

  private emitP(p: Partial<FluidProgress> & { state: FluidState }, force = true): void {
    const now = Date.now();
    if (!force && now - this.lastEmit < 250) return;
    this.lastEmit = now;
    const total = this.current.total || this.totalBytes();
    const received = p.received ?? this.current.received;
    this.current = { total, received, percent: Math.min(100, Math.floor((received / Math.max(1, total)) * 100)), ...p };
    if (p.state !== 'waiting') delete this.current.waiting;
    if (p.state !== 'error') delete this.current.error;
    this.emit('progress', this.current);
  }

  /** Démarre le téléchargement tout de suite (ignore `canStart`) ; un 2e appel rejoint le 1er. Résout false en cas d'échec. */
  start(): Promise<boolean> {
    if (this.ready()) return Promise.resolve(true);
    if (!this.job) this.job = this.run().finally(() => (this.job = null));
    return this.job;
  }

  /** Interrompt (le fichier .part est conservé pour la reprise). */
  cancel(): void {
    this.ac?.abort();
  }

  /**
   * Planificateur : toutes les `everyMs` (60 s), si tout n'est pas prêt et que `canStart` l'autorise, lance le
   * téléchargement ; sinon l'état passe à « waiting » avec la raison. À appeler une fois au démarrage de l'app.
   */
  schedule(everyMs = 60_000): void {
    if (this.timer) return;
    void this.adoptExisting().catch((e) => this.log('fluid: vérification des fichiers existants', e instanceof Error ? e.message : e));
    const tick = () => {
      if (this.job || this.ready()) return;
      const c = this.opts.canStart?.() ?? { ok: true as const };
      if (!c.ok) return this.emitP({ state: 'waiting', waiting: c.why });
      void this.start();
    };
    this.timer = setInterval(tick, everyMs);
    this.timer.unref?.();
    setTimeout(tick, 5000).unref?.();
  }
  stopSchedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<boolean> {
    const total = this.totalBytes();
    this.ac = new AbortController();
    const ac = this.ac;
    // Surveillance : si une condition de poursuite disparaît (dictée, batterie, suspension), on coupe — la reprise est automatique.
    const watch = setInterval(() => {
      const c = this.opts.canContinue?.() ?? { ok: true as const };
      if (!c.ok) {
        this.pauseWhy = c.why;
        ac.abort();
      }
    }, 5000);
    watch.unref?.();
    this.pauseWhy = undefined;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const need = this.sets.reduce((n, s) => n + s.files.filter((f) => !this.fileOk(s, f)).reduce((m, f) => m + f[1], 0), 0);
      const free = await freeBytes(this.dir);
      if (free != null && free < need + 300 * 1024 * 1024) throw new FluidFatal('Espace disque insuffisant pour le moteur de notes (≈ 600 Mo nécessaires)');
      let done = 0;
      for (const s of this.sets) {
        for (const f of s.files) {
          if (this.fileOk(s, f)) {
            done += f[1];
            continue;
          }
          await this.fetchFile(s, f, done, total, ac.signal);
          done += f[1];
        }
        this.writeMarker(s);
      }
      this.log('fluid: modèles prêts', this.dir);
      this.emitP({ state: 'done', received: total, total, percent: 100 });
      return true;
    } catch (e) {
      if (ac.signal.aborted) {
        const why = this.pauseWhy ?? 'busy';
        this.log('fluid: téléchargement interrompu →', why);
        this.emitP({ state: 'waiting', waiting: why });
        return false;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.log('fluid: téléchargement impossible', msg);
      this.emitP({ state: 'error', error: msg });
      return false;
    } finally {
      clearInterval(watch);
      this.ac = null;
    }
  }
  private pauseWhy: FluidWait | undefined;

  private async fetchFile(s: FluidSet, f: [string, number, string], before: number, total: number, signal: AbortSignal): Promise<void> {
    const [rel, size, sha] = f;
    const dest = this.abs(s, rel);
    const part = dest + '.part';
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const url = `${this.base}/${s.repo}/resolve/${s.revision}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    const delay = this.opts.retryDelayMs ?? 2000;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.fetchTo(url, part, size, signal, (r) => this.emitP({ state: 'downloading', file: rel, received: before + r, total }, false));
        this.emitP({ state: 'verifying', file: rel, received: before + size, total });
        const got = await sha256File(part);
        if (got !== sha) {
          fs.rmSync(part, { force: true });
          throw new FluidFatal(`empreinte SHA-256 invalide pour ${rel} (${got.slice(0, 12)}…)`, true);
        }
        fs.renameSync(part, dest);
        this.verified[this.key(s, rel)] = sha;
        this.saveVerified();
        return;
      } catch (e) {
        if (signal.aborted) throw e;
        if (e instanceof FluidFatal && !e.retry) throw e;
        if (attempt >= 4) throw e;
        this.log(`fluid: essai ${attempt} échoué (${path.basename(rel)}), reprise dans ${(attempt * delay) / 1000} s`, e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, attempt * delay));
      }
    }
  }

  private async fetchTo(url: string, part: string, size: number, signal: AbortSignal, onProgress: (received: number) => void): Promise<void> {
    let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (have > size) {
      fs.rmSync(part);
      have = 0;
    }
    if (have === size) return; // déjà complet : empreinte vérifiée par l'appelant
    const stall = new AbortController();
    const onAbort = () => stall.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let stallTimer: NodeJS.Timeout | null = null;
    const arm = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => stall.abort(), this.opts.stallMs ?? 30_000);
    };
    arm();
    try {
      const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: 'follow', signal: stall.signal });
      if (res.status === 200 && have) have = 0; // Range ignoré : on repart de zéro
      else if (res.status === 416) {
        fs.rmSync(part, { force: true });
        throw new Error('HTTP 416 (reprise refusée, fichier repris du début)');
      } else if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('réponse vide');
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      let received = have;
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          arm();
          received += chunk.length;
          if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
          onProgress(received);
        }
      } finally {
        await new Promise<void>((r) => out.end(() => r()));
      }
      if (received !== size) throw new Error(`taille inattendue ${received} / ${size}`);
    } catch (e) {
      if (signal.aborted) throw e;
      if (stall.signal.aborted) throw new Error('connexion inactive (30 s)');
      throw e;
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      signal.removeEventListener('abort', onAbort);
    }
  }
}

class FluidFatal extends Error {
  readonly retry: boolean;
  constructor(msg: string, retry = false) {
    super(msg);
    this.retry = retry;
  }
}

async function freeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fs.promises.statfs(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}


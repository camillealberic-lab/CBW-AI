import { app, Notification } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dataDir, log } from './paths';
import { settings } from './settings';
import { verifyManifest } from './updateVerify';

/**
 * Mises à jour sans Developer ID (pas de Squirrel / electron-updater) :
 *   latest.json (GitHub Releases, signé Ed25519 → updateVerify.ts) → zip téléchargé dans ~/.dicta-ai/updates (reprise + SHA-256)
 *   → `ditto -x -k` → vérif `codesign` + identifiant + exigence désignée → « prête ».
 * Installation (action « Redémarrer pour mettre à jour » ou au prochain Quitter) : script détaché
 * qui attend la fin de l'app, remplace le bundle par `ditto` (sauvegarde .previous, restaurée en cas
 * d'échec), retire la quarantaine et relance. Même bundle id + même exigence désignée
 * (`identifier "com.dicta-ai.app"`, cf. scripts/after-pack.cjs) → Micro / Accessibilité conservés.
 *
 * Env (tests) : CBW_UPDATE_URL (latest.json), CBW_INSTALL_PATH (bundle à remplacer),
 *               CBW_UPDATE_DELAY_MS (1re vérification, défaut 30 s).
 */

export type UpdateState = 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'installing' | 'error';
export interface UpdateStatus {
  state: UpdateState;
  current: string;
  version?: string;
  notes?: string;
  percent?: number;
  message?: string;
}
interface Manifest {
  version: string;
  date?: string;
  notes?: string;
  zipUrl: string;
  dmgUrl?: string;
  sha256: string;
}

const BUNDLE_ID = 'com.dicta-ai.app';
const DR = 'identifier "com.dicta-ai.app"';
const APP_NAME = 'CBW AI.app';
const PLACEHOLDER = /^OWNER\//i;
const EVERY_MS = 6 * 3600_000;

/** "1.2.10" > "1.2.9" ; suffixes (-beta…) ignorés. */
export function semverGt(a: string, b: string): boolean {
  const p = (v: string) => v.replace(/^v/, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const x = p(a);
  const y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

function repo(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
    return String(pkg?.cbw?.repo ?? '');
  } catch {
    return '';
  }
}

function feedUrl(): string | null {
  if (process.env.CBW_UPDATE_URL) return process.env.CBW_UPDATE_URL;
  const r = repo();
  if (!/^[\w.-]+\/[\w.-]+$/.test(r) || PLACEHOLDER.test(r)) return null; // dépôt pas encore choisi
  return `https://github.com/${r}/releases/latest/download/latest.json`;
}

/** Bundle à remplacer : celui qui tourne (sauf DMG / translocation) ou /Applications/CBW AI.app. */
function installTarget(): string {
  if (process.env.CBW_INSTALL_PATH) return process.env.CBW_INSTALL_PATH;
  const running = path.resolve(process.execPath, '..', '..', '..');
  if (running.endsWith('.app') && !running.startsWith('/Volumes/') && !running.includes('/AppTranslocation/')) return running;
  return path.join('/Applications', APP_NAME);
}

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { maxBuffer: 4 << 20 }, (err, out, errOut) =>
      err ? reject(new Error(`${cmd} ${args[0]} : ${String(errOut || err.message).trim()}`)) : resolve(`${out}${errOut}`),
    ),
  );

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (c) => h.update(c))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

/** Signature valide, bon identifiant, exigence désignée stable, bonne version. */
async function verifyBundle(appPath: string, version: string): Promise<void> {
  if (!fs.existsSync(path.join(appPath, 'Contents', 'Info.plist'))) throw new Error('bundle introuvable dans l’archive');
  await run('codesign', ['--verify', '--deep', '--strict', appPath]);
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const id = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist])).trim();
  if (id !== BUNDLE_ID) throw new Error(`identifiant inattendu : ${id}`);
  const v = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])).trim();
  if (v !== version) throw new Error(`version du bundle ${v} ≠ ${version}`);
  const req = await run('codesign', ['-d', '-r-', appPath]);
  if (!req.includes(`designated => ${DR}`)) throw new Error('exigence désignée différente (les autorisations seraient perdues)');
}

class Updater extends EventEmitter {
  private status: UpdateStatus = { state: 'idle', current: app.getVersion() };
  private manifest: Manifest | null = null;
  private readyApp: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private relaunch = false;
  private spawned = false;
  private busy: () => string | null = () => null;

  private dir(): string {
    const d = path.join(dataDir(), 'updates');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  get enabled(): boolean {
    if (process.env.DICTA_SELFTEST || process.env.DICTA_SELFTEST_NOTE) return false;
    if (!app.isPackaged && !process.env.CBW_INSTALL_PATH) return false; // en dev, rien à remplacer
    return !!feedUrl();
  }

  get(): UpdateStatus {
    return { ...this.status };
  }

  private set(s: Partial<UpdateStatus> & { state: UpdateState }): void {
    this.status = { current: app.getVersion(), ...s };
    this.emit('update', this.get());
  }

  /** À appeler une fois après app.whenReady(). `busy` : raison de refuser l'installation (note en cours…). */
  init(opts: { busy?: () => string | null } = {}): void {
    if (opts.busy) this.busy = opts.busy;
    if (!this.enabled) {
      this.set({ state: 'disabled', message: app.isPackaged ? 'Dépôt de mise à jour non configuré' : 'Mode développement' });
      return;
    }
    this.cleanup();
    const delay = Number(process.env.CBW_UPDATE_DELAY_MS) || 30_000;
    setTimeout(() => {
      if (settings.get('updates.auto') !== false) void this.check();
    }, delay);
    this.timer = setInterval(() => {
      if (settings.get('updates.auto') !== false && this.status.state !== 'ready') void this.check();
    }, EVERY_MS);
    this.timer.unref?.();
  }

  /** Supprime les mises à jour déjà installées / périmées (≤ version courante). */
  private cleanup(): void {
    try {
      for (const f of fs.readdirSync(this.dir())) {
        const m = f.match(/^(\d+\.\d+\.\d+)(?:$|[^\d])/);
        if (m && !semverGt(m[1], app.getVersion())) fs.rmSync(path.join(this.dir(), f), { recursive: true, force: true });
      }
    } catch (e) {
      log('update: nettoyage', e);
    }
  }

  async check(): Promise<UpdateStatus> {
    const url = feedUrl();
    if (!this.enabled || !url) return this.get();
    if (['checking', 'downloading', 'installing'].includes(this.status.state)) return this.get();
    if (this.status.state === 'ready') return this.get();
    this.set({ state: 'checking' });
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
      if (res.status === 404) {
        this.set({ state: 'up-to-date', message: 'Aucune version publiée' });
        return this.get();
      }
      if (!res.ok) throw new Error(`latest.json : HTTP ${res.status}`);
      const m = (await res.json()) as Manifest;
      // Authenticité (Ed25519, clé publique embarquée) + URL GitHub Releases uniquement — docs/SECURITY.md › 7
      const why = verifyManifest(m);
      if (why) throw new Error(`latest.json refusé : ${why}`);
      if (!m?.version || !m.zipUrl || !/^[0-9a-f]{64}$/i.test(m.sha256 ?? '')) throw new Error('latest.json invalide');
      if (!semverGt(m.version, app.getVersion())) {
        this.set({ state: 'up-to-date' });
        return this.get();
      }
      log('update: nouvelle version', m.version, '(actuelle', app.getVersion() + ')');
      this.manifest = m;
      await this.download(m);
    } catch (e) {
      log('update: échec', e);
      this.set({ state: 'error', message: e instanceof Error ? e.message : String(e), version: this.manifest?.version });
    }
    return this.get();
  }

  private async download(m: Manifest): Promise<void> {
    const base = path.join(this.dir(), m.version);
    const appDir = `${base}-app`;
    const okMark = path.join(appDir, '.verified');
    const extracted = path.join(appDir, APP_NAME);
    // Déjà téléchargée et vérifiée lors d'un lancement précédent
    if (fs.existsSync(okMark) && fs.readFileSync(okMark, 'utf8').trim() === m.sha256.toLowerCase() && fs.existsSync(extracted)) {
      await verifyBundle(extracted, m.version);
      return this.markReady(m, extracted);
    }
    const zip = `${base}.zip`;
    const part = `${zip}.part`;
    if (!fs.existsSync(zip)) {
      const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
      this.set({ state: 'downloading', version: m.version, notes: m.notes, percent: 0 });
      const res = await fetch(m.zipUrl, { redirect: 'follow', headers: have ? { Range: `bytes=${have}-` } : {} });
      if (!res.ok || !res.body) throw new Error(`téléchargement : HTTP ${res.status}`);
      const resumed = res.status === 206;
      const offset = resumed ? have : 0;
      const total = offset + Number(res.headers.get('content-length') || 0);
      const out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      let got = offset;
      let lastPc = -1;
      try {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
          got += value.length;
          const pc = total ? Math.min(99, Math.floor((got / total) * 100)) : 0;
          if (pc !== lastPc) {
            lastPc = pc;
            this.set({ state: 'downloading', version: m.version, notes: m.notes, percent: pc });
          }
        }
      } finally {
        await new Promise<void>((r) => out.end(r));
      }
      fs.renameSync(part, zip);
    }
    const sum = await sha256(zip);
    if (sum.toLowerCase() !== m.sha256.toLowerCase()) {
      fs.rmSync(zip, { force: true });
      throw new Error('somme SHA-256 invalide (fichier corrompu, supprimé)');
    }
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.mkdirSync(appDir, { recursive: true });
    await run('ditto', ['-x', '-k', zip, appDir]);
    await verifyBundle(extracted, m.version);
    fs.writeFileSync(okMark, m.sha256.toLowerCase());
    fs.rmSync(zip, { force: true });
    this.markReady(m, extracted);
  }

  private markReady(m: Manifest, extracted: string): void {
    this.readyApp = extracted;
    this.set({ state: 'ready', version: m.version, notes: m.notes, percent: 100 });
    log('update: prête', m.version, extracted);
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'Mise à jour prête — redémarre CBW AI', body: `Version ${m.version} téléchargée. Elle s’installera au prochain redémarrage.` });
      n.on('click', () => this.emit('open'));
      n.show();
    }
  }

  /** « Redémarrer pour mettre à jour ». */
  install(): { ok: boolean; message?: string } {
    if (this.status.state !== 'ready' || !this.readyApp) return { ok: false, message: 'Aucune mise à jour prête' };
    const why = this.busy();
    if (why) return { ok: false, message: why };
    const target = installTarget();
    try {
      fs.accessSync(path.dirname(target), fs.constants.W_OK);
    } catch {
      const message = `Impossible d’écrire dans ${path.dirname(target)}`;
      this.set({ ...this.status, state: 'error', message });
      return { ok: false, message };
    }
    this.relaunch = true;
    this.set({ ...this.status, state: 'installing' });
    setImmediate(() => app.quit());
    return { ok: true };
  }

  /** Appelé dans `will-quit` : installe la mise à jour prête (relance seulement si demandée). */
  onQuit(): void {
    if (this.spawned || (this.status.state !== 'ready' && this.status.state !== 'installing')) return;
    if (!this.readyApp || !fs.existsSync(this.readyApp)) return;
    this.spawned = true;
    const target = installTarget();
    const script = path.join(this.dir(), 'install.sh');
    fs.writeFileSync(script, INSTALL_SH, { mode: 0o755 });
    const logPath = path.join(this.dir(), 'install.log');
    log('update: installation au départ →', target, this.relaunch ? '(relance)' : '');
    const child = spawn('/bin/bash', [script, String(process.pid), this.readyApp, target, this.relaunch ? '1' : '0', path.join(this.dir(), 'previous')], {
      detached: true,
      stdio: ['ignore', fs.openSync(logPath, 'a'), fs.openSync(logPath, 'a')],
      env: process.env,
    });
    child.unref();
  }
}

/** $1 pid · $2 nouvelle app · $3 cible · $4 relance (1/0) · $5 dossier de sauvegarde. */
const INSTALL_SH = `#!/bin/bash
set -u
PID="$1"; NEW="$2"; DEST="$3"; RELAUNCH="$4"; BACKUP_DIR="$5"
echo "[$(date '+%F %T')] mise à jour : $NEW → $DEST"
for _ in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
if kill -0 "$PID" 2>/dev/null; then echo "✗ l'app ne s'est pas fermée (60 s) — abandon"; exit 1; fi
sleep 0.5
PREV="$DEST.previous"
rm -rf "$PREV"
if [ -d "$DEST" ]; then mv "$DEST" "$PREV" || { echo "✗ impossible de déplacer l'ancienne version"; exit 1; }; fi
if ditto "$NEW" "$DEST" && codesign --verify --deep --strict "$DEST"; then
  xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
  touch "$DEST"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST" >/dev/null 2>&1 || true
  if [ -d "$PREV" ]; then
    rm -rf "$BACKUP_DIR"; mkdir -p "$BACKUP_DIR"
    mv "$PREV" "$BACKUP_DIR/$(basename "$DEST")" 2>/dev/null || rm -rf "$PREV"
  fi
  rm -rf "$(dirname "$NEW")"
  echo "✓ installé"
else
  echo "✗ échec de la copie / signature — restauration de l'ancienne version"
  rm -rf "$DEST"
  [ -d "$PREV" ] && mv "$PREV" "$DEST"
fi
if [ "$RELAUNCH" = 1 ]; then
  ENVS=()
  for V in DICTA_AI_HOME CBW_UPDATE_URL CBW_INSTALL_PATH CBW_UPDATE_DELAY_MS DICTA_NO_PROMPT OLLAMA_HOST DICTA_WHISPER_MODEL DICTA_WHISPER_SERVER_BIN; do
    [ -n "\${!V:-}" ] && ENVS+=(--env "$V=\${!V}")
  done
  if [ \${#ENVS[@]} -gt 0 ]; then open -n "$DEST" "\${ENVS[@]}"; else open "$DEST"; fi
  echo "→ relancé"
fi
`;

export const updater = new Updater();

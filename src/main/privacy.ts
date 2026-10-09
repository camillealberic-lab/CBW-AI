import { app, session } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { routerModule } from './cleaner';
import { dataDir, log } from './paths';
import { getSecret, wipeSecrets } from './secrets';
import { hardenSession } from './security';
import { settings } from './settings';

/**
 * Données locales (docs/SECURITY.md › « Où sont mes données ») :
 * - permissions : ~/.dicta-ai en 0700, fichiers 0600 (umask 077 posé par security.ts › hardenProcess,
 *   et rattrapage des fichiers créés par les anciennes versions ici) ;
 * - audio temporaire : WAV whisper-cli orphelins supprimés au démarrage ;
 * - « Supprimer toutes mes données » : wipeAllUserData().
 */

const SKIP_CHMOD = new Set(['models']); // gros fichiers publics (modèles), inutile de les parcourir à chaque lancement

function chmodTree(dir: string, depth = 0): void {
  if (depth > 4) return;
  let entries: fs.Dirent[];
  try {
    fs.chmodSync(dir, 0o700);
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    try {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (depth === 0 && SKIP_CHMOD.has(e.name)) fs.chmodSync(p, 0o700);
        else chmodTree(p, depth + 1);
      } else if (e.isFile()) {
        const m = fs.statSync(p).mode & 0o777;
        if (m & 0o077) fs.chmodSync(p, m & 0o700 ? (m & 0o700) | 0o600 : 0o600);
      }
    } catch {
      /* fichier disparu / verrouillé : ignoré */
    }
  }
}

/** Dossiers de sortie visibles dans le Finder (~/Documents/CBW AI, Notes, Prompts). */
function documentsDirs(): string[] {
  try {
    const base = path.join(app.getPath('documents'), 'CBW AI');
    return [base, path.join(base, 'Notes'), path.join(base, 'Prompts')];
  } catch {
    return [];
  }
}

/** Au démarrage : rattrape les permissions des fichiers créés par les versions précédentes (0644 → 0600). */
export function hardenDataPermissions(): void {
  const t0 = Date.now();
  chmodTree(dataDir());
  // ~/Documents est déjà privé (0700) sous macOS : les .md exportés n'ont pas besoin d'être modifiés.
  const ms = Date.now() - t0;
  if (ms > 200) log(`confidentialité: permissions vérifiées en ${ms} ms`);
}

/** WAV temporaires de whisper-cli laissés par un plantage (os.tmpdir() = /var/folders/…/T, privé). */
export function cleanupTempAudio(): void {
  const dir = os.tmpdir();
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/^dicta-\d+-\d+\.wav$/.test(f)) continue;
      const pid = Number(f.split('-')[1]);
      if (pid === process.pid) continue;
      fs.rmSync(path.join(dir, f), { force: true });
    }
  } catch {
    /* ignore */
  }
}

export interface WipeOptions {
  /** Supprime aussi ~/Documents/CBW AI (notes .md et prompts .md). Défaut : false (fichiers de la personne). */
  documents?: boolean;
  /** Supprime aussi les modèles téléchargés (~600 Mo à retélécharger). Défaut : false. */
  models?: boolean;
}

/**
 * « Supprimer toutes mes données » (design : docs/SECURITY.md). À appeler depuis le process main
 * (ex. ipcMain.handle('app:wipeAllData') dans appWindow.ts, après une confirmation explicite dans l'UI),
 * puis app.relaunch() + app.exit(0). Ne touche pas aux fichiers hors de l'app.
 *
 * Efface : clés API (secrets.json + élément « CBW AI Safe Storage » du trousseau), config.json, historique,
 * compteurs d'usage, notes (transcriptions, segments, audio), anciennes données, journaux, profil Chromium
 * (cache, localStorage) ; en option les modèles et les documents exportés.
 */
export async function wipeAllUserData(opts: WipeOptions = {}): Promise<{ removed: string[] }> {
  const removed: string[] = [];
  const root = dataDir();
  wipeSecrets();
  for (const e of fs.readdirSync(root)) {
    if (e === 'models' && !opts.models) continue;
    if (e === 'whisper-server.pid') continue; // utilisé par le serveur en cours
    fs.rmSync(path.join(root, e), { recursive: true, force: true });
    removed.push(path.join('~/.dicta-ai', e));
  }
  if (opts.documents)
    for (const d of documentsDirs().slice(0, 1))
      if (fs.existsSync(d)) {
        fs.rmSync(d, { recursive: true, force: true });
        removed.push(d.replace(os.homedir(), '~'));
      }
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    removed.push('profil Chromium (cache, stockage local)');
  } catch (e) {
    log('confidentialité: profil Chromium non effacé', e instanceof Error ? e.message : e);
  }
  // Clé de chiffrement safeStorage dans le trousseau (ignorée si absente). Arguments en tableau : pas de shell.
  await new Promise<void>((resolve) =>
    execFile('/usr/bin/security', ['delete-generic-password', '-s', `${app.getName()} Safe Storage`], () => resolve()),
  );
  removed.push('trousseau : « ' + app.getName() + ' Safe Storage »');
  log('confidentialité: toutes les données ont été supprimées', removed.length, 'élément(s)');
  return { removed };
}

/**
 * Démarrage sécurisé, juste après app.whenReady() (et avant toute fenêtre / tout appel LLM) :
 * session durcie, clés migrées vers le trousseau, router branché sur les clés déchiffrées,
 * permissions des données rattrapées, audio temporaire orphelin supprimé.
 */
export function secureStartup(): void {
  try {
    hardenSession();
  } catch (e) {
    log('sécurité: session', e instanceof Error ? e.message : e);
  }
  settings.initSecrets();
  routerModule()?.setSecretAccessor?.((k) => getSecret(k) ?? (settings.get(k) as string | undefined));
  hardenDataPermissions();
  cleanupTempAudio();
}

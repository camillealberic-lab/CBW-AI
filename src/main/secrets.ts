import { safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { forgetSecretValue, isMaskedValue, maskSecret, registerSecretValues } from '../shared/redact';
import { dataDir } from './paths';

/**
 * Clés API au repos : chiffrées avec Electron `safeStorage` (clé de chiffrement gardée dans le trousseau
 * macOS, élément « CBW AI Safe Storage », accessible à l'app signée seulement) ; le texte chiffré est
 * dans ~/.dicta-ai/secrets.json (0600). Jamais de clé en clair dans config.json, l'UI ou les journaux.
 *
 * - Migration transparente : au démarrage, les clés en clair de config.json sont chiffrées puis effacées.
 * - Variables d'env (GROQ_API_KEY…) : toujours prioritaires (src/llm/config.ts).
 * - Le router LLM lit les clés via setSecretAccessor(getSecret) (bundle séparé, même process).
 * - safeStorage indisponible (cas rare : trousseau verrouillé / refusé) : repli sur config.json en clair
 *   (comportement historique, 0600), signalé dans le journal — l'app reste utilisable.
 */

export const SECRET_PROVIDERS = ['gemini', 'groq', 'zai', 'mistral', 'cloudflare', 'openrouter'] as const;
export const SECRET_KEYS: readonly string[] = SECRET_PROVIDERS.map((p) => `providers.${p}.apiKey`);
export const isSecretKey = (k: string): boolean => SECRET_KEYS.includes(k);

const file = (): string => path.join(process.env.DICTA_AI_HOME || dataDir(), 'secrets.json');

interface SecretsFile {
  version: 1;
  /** clé de réglage → texte chiffré (base64) */
  items: Record<string, string>;
}

let cache = new Map<string, string>();
let ready = false;
let encrypted = false;

function readFile(): SecretsFile {
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (j && typeof j === 'object' && j.items && typeof j.items === 'object') return { version: 1, items: j.items };
  } catch {
    /* absent / illisible */
  }
  return { version: 1, items: {} };
}

function writeFile(f: SecretsFile): void {
  const p = file();
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(f, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
  fs.chmodSync(p, 0o600);
}

/** Chiffrement disponible (après app.whenReady()). */
export function secretsEncrypted(): boolean {
  return ready && encrypted;
}

/**
 * À appeler après app.whenReady(). Déchiffre secrets.json (un seul accès au trousseau) puis migre les clés
 * en clair trouvées dans `plain` (contenu de config.json). Renvoie les clés de config.json à effacer.
 */
export function initSecrets(plain: Record<string, unknown>): string[] {
  encrypted = (() => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  })();
  ready = true;
  cache = new Map();
  if (!encrypted) return [];
  const f = readFile();
  for (const [k, b64] of Object.entries(f.items)) {
    if (!isSecretKey(k) || typeof b64 !== 'string') continue;
    try {
      cache.set(k, safeStorage.decryptString(Buffer.from(b64, 'base64')));
    } catch {
      /* élément illisible (autre trousseau / app re-signée) : ignoré, la personne ressaisira la clé */
    }
  }
  const migrated: string[] = [];
  let dirty = false;
  for (const k of SECRET_KEYS) {
    const v = getFlatOrNested(plain, k);
    if (v === undefined) continue;
    migrated.push(k);
    // config.json en clair = saisie la plus récente (on l'efface juste après) : elle remplace l'ancienne.
    if (typeof v === 'string' && v.trim() && !isMaskedValue(v) && cache.get(k) !== v.trim()) {
      cache.set(k, v.trim());
      f.items[k] = safeStorage.encryptString(v.trim()).toString('base64');
      dirty = true;
    }
  }
  if (dirty) writeFile(f);
  registerSecretValues(cache.values());
  return migrated;
}

function getFlatOrNested(o: Record<string, unknown>, k: string): unknown {
  if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
  let cur: any = o;
  for (const part of k.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Clé déchiffrée (process main uniquement — ne jamais l'envoyer à un renderer). */
export function getSecret(k: string): string | undefined {
  return cache.get(k);
}

export function hasSecret(k: string): boolean {
  return !!cache.get(k);
}

/** Forme affichable : « gsk_…a3f2 » (ou '' si absente). */
export function maskedSecret(k: string): string {
  const v = cache.get(k);
  return v ? maskSecret(v) : '';
}

/**
 * Enregistre (ou efface avec '') une clé. Renvoie false si le chiffrement est indisponible :
 * l'appelant garde alors l'ancien stockage en clair.
 */
export function setSecret(k: string, value: string): boolean {
  if (!isSecretKey(k) || !ready || !encrypted) return false;
  const v = String(value ?? '').trim();
  const old = cache.get(k);
  if (old) forgetSecretValue(old);
  const f = readFile();
  if (v) {
    cache.set(k, v);
    f.items[k] = safeStorage.encryptString(v).toString('base64');
    registerSecretValues([v]);
  } else {
    cache.delete(k);
    delete f.items[k];
  }
  writeFile(f);
  return true;
}

/** « Supprimer toutes mes données » : efface le fichier chiffré et le cache. */
export function wipeSecrets(): void {
  for (const v of cache.values()) forgetSecretValue(v);
  cache.clear();
  fs.rmSync(file(), { force: true });
}

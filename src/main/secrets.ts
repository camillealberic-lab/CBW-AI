import { safeStorage } from 'electron';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { forgetSecretValue, isMaskedValue, maskSecret, registerSecretValues } from '../shared/redact';
import { dataDir } from './paths';

/**
 * Clés API au repos : chiffrées en AES-256-GCM avec une clé aléatoire gardée dans ~/.dicta-ai/secret.key
 * (0600, lisible par le seul compte de l'utilisateur) ; le texte chiffré est dans ~/.dicta-ai/secrets.json (0600).
 * Plus de trousseau : l'app est signée ad hoc, chaque nouvelle version changeait d'empreinte et macOS
 * redemandait le mot de passe à chaque ouverture. Jamais de clé en clair dans config.json, l'UI ou les journaux.
 *
 * - Ancien format (safeStorage / trousseau) : déchiffré une dernière fois au démarrage puis rechiffré (v2).
 * - Migration transparente : au démarrage, les clés en clair de config.json sont chiffrées puis effacées.
 * - Variables d'env (GROQ_API_KEY…) : toujours prioritaires (src/llm/config.ts).
 * - Le router LLM lit les clés via setSecretAccessor(getSecret) (bundle séparé, même process).
 * - Clé locale impossible à créer (disque en lecture seule…) : repli sur config.json en clair
 *   (comportement historique, 0600), signalé dans le journal — l'app reste utilisable.
 */

export const SECRET_PROVIDERS = ['gemini', 'groq', 'zai', 'openrouter'] as const;
export const SECRET_KEYS: readonly string[] = SECRET_PROVIDERS.map((p) => `providers.${p}.apiKey`);
export const isSecretKey = (k: string): boolean => SECRET_KEYS.includes(k);

const file = (): string => path.join(process.env.DICTA_AI_HOME || dataDir(), 'secrets.json');

interface SecretsFile {
  version: 1;
  /** clé de réglage → texte chiffré (base64) */
  items: Record<string, string>;
}

const keyFile = (): string => path.join(process.env.DICTA_AI_HOME || dataDir(), 'secret.key');
const V2 = 'v2:';
let key: Buffer | null = null;

/** Clé AES-256 locale (créée au premier lancement, 0600). */
function loadKey(): Buffer {
  const p = keyFile();
  if (fs.existsSync(p)) {
    const k = Buffer.from(fs.readFileSync(p, 'utf8').trim(), 'base64');
    if (k.length !== 32) {
      // Clé abîmée : on la met de côté (jamais écrasée en silence) et on en crée une neuve ; les clés API seront à ressaisir.
      fs.renameSync(p, `${p}.bad-${Date.now()}`);
    } else {
      fs.chmodSync(p, 0o600);
      return k;
    }
  }
  const k = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, k.toString('base64'), { mode: 0o600 });
  fs.renameSync(tmp, p);
  return k;
}

function encrypt(v: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key!, iv);
  const ct = Buffer.concat([c.update(v, 'utf8'), c.final()]);
  return V2 + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

function decrypt(item: string): string {
  if (!item.startsWith(V2)) return safeStorage.decryptString(Buffer.from(item, 'base64')); // ancien format (trousseau)
  const b = Buffer.from(item.slice(V2.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key!, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
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
      key = loadKey();
      return true;
    } catch {
      return false;
    }
  })();
  ready = true;
  cache = new Map();
  if (!encrypted) return [];
  const f = readFile();
  let dirty = false;
  for (const [k, item] of Object.entries(f.items)) {
    if (!isSecretKey(k) || typeof item !== 'string') continue;
    try {
      const v = decrypt(item);
      cache.set(k, v);
      if (!item.startsWith(V2)) {
        f.items[k] = encrypt(v); // migration depuis le trousseau, une seule fois
        dirty = true;
      }
    } catch {
      /* élément illisible (ancien trousseau refusé, clé locale perdue) : ignoré, la personne ressaisira la clé */
    }
  }
  const migrated: string[] = [];
  for (const k of SECRET_KEYS) {
    const v = getFlatOrNested(plain, k);
    if (v === undefined) continue;
    migrated.push(k);
    // config.json en clair = saisie la plus récente (on l'efface juste après) : elle remplace l'ancienne.
    if (typeof v === 'string' && v.trim() && !isMaskedValue(v) && cache.get(k) !== v.trim()) {
      cache.set(k, v.trim());
      f.items[k] = encrypt(v.trim());
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
    f.items[k] = encrypt(v);
    registerSecretValues([v]);
  } else {
    cache.delete(k);
    delete f.items[k];
  }
  writeFile(f);
  return true;
}

/**
 * Retire de secrets.json les éléments dont la clé vérifie `match` (fournisseurs retirés de l'app).
 * Simple édition du fichier : ne déchiffre rien, utilisable avant app.whenReady(). Renvoie le nombre retiré.
 */
export function purgeSecretItems(match: (k: string) => boolean): number {
  if (!fs.existsSync(file())) return 0;
  const f = readFile();
  const gone = Object.keys(f.items).filter(match);
  if (!gone.length) return 0;
  for (const k of gone) delete f.items[k];
  writeFile(f);
  return gone.length;
}

/** « Supprimer toutes mes données » : efface le fichier chiffré et le cache. */
export function wipeSecrets(): void {
  for (const v of cache.values()) forgetSecretValue(v);
  cache.clear();
  fs.rmSync(file(), { force: true });
  fs.rmSync(keyFile(), { force: true });
  key = null;
  encrypted = false;
  ready = false;
}

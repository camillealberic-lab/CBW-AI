import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dataDir, log } from './paths';

/**
 * Chiffrement au repos avec la clé locale existante ~/.dicta-ai/secret.key (AES-256-GCM, même clé et même
 * schéma que secrets.ts : base64 de 32 octets, 0600). Sert aux enregistrements de l'historique.
 * Format fichier : "CBWAUD1" (7 octets) + iv (12) + tag (16) + texte chiffré. Un fichier sans cet en-tête
 * (WAV « RIFF ») est un ancien fichier en clair, à migrer.
 */
const MAGIC = Buffer.from('CBWAUD1');
const keyFile = (): string => path.join(dataDir(), 'secret.key');
let key: Buffer | null = null;
let keyHome = '';

/** Clé AES-256 locale ; créée (même procédure que secrets.ts) si elle n'existe pas encore. null si impossible. */
export function localKey(): Buffer | null {
  const home = process.env.DICTA_AI_HOME || '';
  if (key && keyHome === home) return key;
  try {
    const p = keyFile();
    if (fs.existsSync(p)) {
      const k = Buffer.from(fs.readFileSync(p, 'utf8').trim(), 'base64');
      if (k.length === 32) {
        key = k;
        keyHome = home;
        return k;
      }
      return null; // clé abîmée : secrets.ts la traite au démarrage, on ne l'écrase jamais ici
    }
    const k = crypto.randomBytes(32);
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, k.toString('base64'), { mode: 0o600 });
    fs.renameSync(tmp, p);
    key = k;
    keyHome = home;
    return k;
  } catch (e) {
    log('localcrypto: clé locale indisponible', e instanceof Error ? e.message : e);
    return null;
  }
}

export const isEncryptedBlob = (b: Buffer): boolean => b.length > MAGIC.length + 28 && b.subarray(0, MAGIC.length).equals(MAGIC);

/** Chiffre `data` ; null si la clé est indisponible. */
export function encryptBlob(data: Buffer): Buffer | null {
  const k = localKey();
  if (!k) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

/** Déchiffre en mémoire ; un fichier en clair (ancien) est rendu tel quel ; null si illisible. */
export function decryptBlob(b: Buffer): Buffer | null {
  if (!isEncryptedBlob(b)) return b;
  const k = localKey();
  if (!k) return null;
  try {
    const o = MAGIC.length;
    const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(o, o + 12));
    d.setAuthTag(b.subarray(o + 12, o + 28));
    return Buffer.concat([d.update(b.subarray(o + 28)), d.final()]);
  } catch {
    return null;
  }
}

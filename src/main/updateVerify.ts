import { createPublicKey, verify } from 'node:crypto';

/**
 * Vérification de l'authenticité de latest.json (mises à jour in-app) — docs/SECURITY.md › « Mises à jour ».
 *
 * Pourquoi : le SHA-256 du zip est publié dans latest.json, servi par la même origine (GitHub Releases) que le
 * zip. Quiconque peut modifier la release (jeton GitHub volé, CI compromise) peut donc publier un zip + son
 * SHA-256. Avec une signature Ed25519 dont la clé privée n'existe que dans un secret GitHub Actions
 * (UPDATE_SIGNING_KEY), et la clé publique embarquée ici, l'app refuse toute mise à jour non signée.
 *
 * Format : latest.json reçoit un champ `sig` (base64) = Ed25519 sur le message canonique ci-dessous
 * (texte ligne à ligne : aucune ambiguïté de sérialisation JSON). Signature : scripts/sign-update.mjs.
 *
 * Intégration (src/main/updater.ts, après `const m = await res.json()`) :
 *   const why = verifyManifest(m);
 *   if (why) throw new Error(`latest.json refusé : ${why}`);
 */

/**
 * Clé publique Ed25519 (32 octets, base64). À remplacer par la sortie de `node scripts/sign-update.mjs keygen`.
 * Vide = vérification impossible → verifyManifest() refuse tout (sauf UPDATE_ALLOW_UNSIGNED=1 en développement).
 */
export const UPDATE_PUBLIC_KEY_B64 = '51YuTO3D/DeWdW8m6uKOxOhz5WusmhY59t1QlncjtBo=';

/** Préfixe DER SubjectPublicKeyInfo d'une clé Ed25519 brute (RFC 8410). */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface SignedManifest {
  version: string;
  sha256: string;
  zipUrl: string;
  dmgUrl?: string | null;
  date?: string;
  sig?: string;
}

/** Message signé : préfixe de domaine + champs qui décident de ce qui est installé. */
export function manifestMessage(m: SignedManifest): Buffer {
  return Buffer.from(
    ['cbw-ai-update-v1', m.version, String(m.sha256).toLowerCase(), m.zipUrl, m.dmgUrl ?? '', m.date ?? ''].join('\n'),
    'utf8',
  );
}

/** Seules origines acceptées pour le téléchargement (GitHub Releases + son CDN). */
export function isAllowedDownloadUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Vérifie une signature Ed25519 (base64) sur `message` avec une clé publique brute (base64). */
export function verifyEd25519(message: Buffer, sigB64: string, publicKeyB64: string): boolean {
  try {
    const raw = Buffer.from(publicKeyB64, 'base64');
    const sig = Buffer.from(sigB64, 'base64');
    if (raw.length !== 32 || sig.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
    return verify(null, message, key, sig);
  } catch {
    return false;
  }
}

/**
 * null si latest.json est authentique et cohérent, sinon la raison du refus.
 * (À compléter par le contrôle existant de l'updater : version > version installée, SHA-256 du zip.)
 */
export function verifyManifest(m: unknown, publicKeyB64: string = UPDATE_PUBLIC_KEY_B64): string | null {
  const x = m as SignedManifest;
  if (!x || typeof x !== 'object') return 'manifeste absent';
  if (typeof x.version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(x.version)) return 'version invalide';
  if (typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(x.sha256)) return 'sha256 invalide';
  if (!isAllowedDownloadUrl(x.zipUrl)) return 'zipUrl hors GitHub Releases (https)';
  if (x.dmgUrl != null && !isAllowedDownloadUrl(x.dmgUrl)) return 'dmgUrl hors GitHub Releases (https)';
  if (!publicKeyB64) return process.env.UPDATE_ALLOW_UNSIGNED === '1' ? null : 'aucune clé publique de mise à jour embarquée';
  if (typeof x.sig !== 'string' || !x.sig) return 'signature absente';
  return verifyEd25519(manifestMessage(x), x.sig, publicKeyB64) ? null : 'signature invalide';
}

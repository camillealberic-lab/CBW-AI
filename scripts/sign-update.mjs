#!/usr/bin/env node
// Signature Ed25519 de latest.json (mises à jour in-app) — voir docs/SECURITY.md › « Mises à jour ».
//
//   node scripts/sign-update.mjs keygen
//       → affiche la clé PRIVÉE (à mettre dans le secret GitHub Actions UPDATE_SIGNING_KEY, jamais dans le dépôt)
//         et la clé PUBLIQUE (à coller dans src/main/updateVerify.ts › UPDATE_PUBLIC_KEY_B64).
//   UPDATE_SIGNING_KEY=… node scripts/sign-update.mjs sign dist-app/latest.json
//       → ajoute / remplace le champ "sig" de latest.json.
//   node scripts/sign-update.mjs verify dist-app/latest.json <clé publique base64>
//
// Node built-ins uniquement (node:crypto).
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex'); // Ed25519, clé brute de 32 octets
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Doit rester identique à manifestMessage() dans src/main/updateVerify.ts. */
const message = (m) =>
  Buffer.from(['cbw-ai-update-v1', m.version, String(m.sha256).toLowerCase(), m.zipUrl, m.dmgUrl ?? '', m.date ?? ''].join('\n'), 'utf8');

const [cmd, file, pub] = process.argv.slice(2);
if (cmd === 'keygen') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(PKCS8_PREFIX.length).toString('base64');
  const pubRaw = publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_PREFIX.length).toString('base64');
  console.log('UPDATE_SIGNING_KEY (secret GitHub, ne pas committer) :\n' + priv);
  console.log('\nUPDATE_PUBLIC_KEY_B64 (src/main/updateVerify.ts) :\n' + pubRaw);
} else if (cmd === 'sign' && file) {
  const raw = process.env.UPDATE_SIGNING_KEY;
  if (!raw) throw new Error('UPDATE_SIGNING_KEY absent');
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(raw, 'base64')]), format: 'der', type: 'pkcs8' });
  const m = JSON.parse(readFileSync(file, 'utf8'));
  delete m.sig;
  m.sig = sign(null, message(m), key).toString('base64');
  writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  console.log(`✓ ${file} signé (v${m.version})`);
} else if (cmd === 'verify' && file && pub) {
  const m = JSON.parse(readFileSync(file, 'utf8'));
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(pub, 'base64')]), format: 'der', type: 'spki' });
  const ok = !!m.sig && verify(null, message(m), key, Buffer.from(m.sig, 'base64'));
  console.log(ok ? '✓ signature valide' : '✗ signature INVALIDE');
  process.exit(ok ? 0 : 1);
} else {
  console.log('usage : sign-update.mjs keygen | sign <latest.json> | verify <latest.json> <clé publique>');
  process.exit(2);
}

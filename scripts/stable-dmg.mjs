// Copie dist-app/CBW AI-<version>-arm64.dmg → dist-app/CBW-AI-arm64.dmg (nom stable pour
// https://github.com/<owner>/<repo>/releases/latest/download/CBW-AI-arm64.dmg) + affiche taille et SHA-256.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const src = join(root, 'dist-app', `${pkg.build.productName}-${pkg.version}-arm64.dmg`);
const dst = join(root, 'dist-app', 'CBW-AI-arm64.dmg');
copyFileSync(src, dst);
const sha = createHash('sha256').update(readFileSync(dst)).digest('hex');
console.log(`✓ ${src}\n✓ ${dst}  ${(statSync(dst).size / 1e6).toFixed(1)} Mo  sha256 ${sha}`);

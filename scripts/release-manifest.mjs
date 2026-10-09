// Écrit <dir>/latest.json (lu par src/main/updater.ts) + SHA256SUMS.txt.
// Usage : node scripts/release-manifest.mjs dist-app/release
// Env : REPO (défaut GITHUB_REPOSITORY puis package.json › cbw.repo), TAG (défaut v<version>),
//       NOTES_FILE (notes de version), ASSET_BASE (URL des assets, ex. http://127.0.0.1:8765 pour un test local)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dir = process.argv[2] || join(root, 'dist-app', 'release');
const version = pkg.version;
const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || pkg.cbw?.repo;
const tag = process.env.TAG || `v${version}`;
const base = (process.env.ASSET_BASE || `https://github.com/${repo}/releases/download/${tag}`).replace(/\/+$/, '');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

const zip = `CBW-AI-${version}-arm64.zip`;
const dmg = `CBW-AI-${version}-arm64.dmg`;
if (!existsSync(join(dir, zip))) throw new Error(`${zip} absent de ${dir}`);
const hasDmg = existsSync(join(dir, dmg));
const notes = process.env.NOTES_FILE && existsSync(process.env.NOTES_FILE) ? readFileSync(process.env.NOTES_FILE, 'utf8').trim() : '';

const manifest = {
  version,
  date: new Date().toISOString(),
  notes,
  zipUrl: `${base}/${zip}`,
  dmgUrl: hasDmg ? `${base}/${dmg}` : null,
  sha256: sha(join(dir, zip)), // du zip (celui que télécharge l'app)
  zipSize: statSync(join(dir, zip)).size,
  dmgSha256: hasDmg ? sha(join(dir, dmg)) : null,
  minimumSystemVersion: pkg.build?.mac?.minimumSystemVersion || '14.0',
};
writeFileSync(join(dir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  join(dir, 'SHA256SUMS.txt'),
  [zip, ...(hasDmg ? [dmg, 'CBW-AI-arm64.dmg'] : [])].filter((f) => existsSync(join(dir, f))).map((f) => `${sha(join(dir, f))}  ${f}`).join('\n') + '\n',
);
console.log(`✓ latest.json  v${version}  zip sha256 ${manifest.sha256}`);

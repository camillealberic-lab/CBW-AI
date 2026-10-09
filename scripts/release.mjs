// npm run release [minor|major] [--dry-run]
// Vérifie (branche main, arbre propre, typecheck), monte éventuellement la version mineure/majeure,
// commit « release vX.Y.0 », puis pousse main. La CI (.github/workflows/release.yml) publie alors
// automatiquement la version X.Y.<n° de build> — chaque push sur main = une nouvelle version.
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const bump = args.find((a) => !a.startsWith('--')) || 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage : npm run release [patch|minor|major] [-- --dry-run]');
  process.exit(1);
}
const sh = (c) => execSync(c, { cwd: root, encoding: 'utf8' }).trim();
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
const fail = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') fail(`branche « ${branch} » : les versions partent de main`);
if (sh('git status --porcelain')) fail('des modifications ne sont pas commitées (git status)');
let remote = '';
try {
  remote = sh('git remote get-url origin');
} catch {
  fail('aucun dépôt distant « origin » : voir docs/RELEASE.md (gh repo create)');
}
console.log('→ typecheck');
execSync('npx tsc --noEmit -p .', { cwd: root, stdio: 'inherit' });

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [M, m] = pkg.version.split('.').map(Number);
let next = pkg.version;
if (bump !== 'patch') {
  next = bump === 'major' ? `${M + 1}.0.0` : `${M}.${m + 1}.0`;
  console.log(`→ version ${pkg.version} → ${next}`);
  if (!dry) {
    pkg.version = next;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    // garde package-lock.json cohérent (npm ci refuse un lock désynchronisé)
    const lockPath = join(root, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = next;
    if (lock.packages?.['']) lock.packages[''].version = next;
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    git('add', 'package.json', 'package-lock.json');
    git('commit', '-m', `release v${next}`);
  }
}
const ahead = Number(sh('git rev-list --count @{u}..HEAD 2>/dev/null || git rev-list --count HEAD'));
if (!ahead && bump === 'patch') fail('rien à publier : aucun commit en avance sur origin/main');
const [MM, mm] = next.split('.');
console.log(`→ git push origin main (${remote}) — la CI publiera v${MM}.${mm}.<n° de build>`);
if (dry) console.log('(dry-run : rien poussé)');
else git('push', '-u', 'origin', 'main');

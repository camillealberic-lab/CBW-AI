// Épingle les modèles du moteur de réunion : liste chaque fichier du dossier local de référence (déjà préparé par
// `dicta-meeting prepare`), vérifie qu'il est identique à celui du dépôt HuggingFace à la révision donnée
// (LFS : sha256 ; autre : empreinte git blob), et écrit src/main/fluidModels.manifest.ts.
// Usage : node scripts/meeting-engine/pin-models.mjs [~/.dicta-ai/models/fluid]
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = process.argv[2] || path.join(os.homedir(), '.dicta-ai/models/fluid');
const SETS = [
  { id: 'parakeet', repo: 'FluidInference/parakeet-tdt-0.6b-v3-coreml', rev: process.env.PARAKEET_REV || '', local: 'parakeet-tdt-0.6b-v3', marker: null },
  { id: 'diarizer', repo: 'FluidInference/speaker-diarization-coreml', rev: 'df2625ac79a7ac6b65ad868fee6d80f320da4232', local: 'diarizer/speaker-diarization', marker: 'df2625ac79a7ac6b65ad868fee6d80f320da4232' },
];
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p, base) : [path.relative(base, p)];
});
const sha256 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const gitBlob = (f) => { const b = fs.readFileSync(f); return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex'); };

let out = `// GÉNÉRÉ par scripts/meeting-engine/pin-models.mjs — ne pas modifier à la main.\n// Modèles du moteur de réunion (Parakeet TDT v3 + diarisation FluidAudio), épinglés : révision HuggingFace + taille + SHA-256 de chaque fichier.\nimport type { FluidSet } from './fluidModels';\n\nexport const FLUID_SETS: FluidSet[] = [\n`;
for (const s of SETS) {
  let rev = s.rev;
  if (!rev) rev = (await (await fetch(`https://huggingface.co/api/models/${s.repo}`)).json()).sha;
  const tree = await (await fetch(`https://huggingface.co/api/models/${s.repo}/tree/${rev}?recursive=1`)).json();
  const byPath = new Map(tree.filter((t) => t.type === 'file').map((t) => [t.path, t]));
  const dir = path.join(root, s.local);
  const files = walk(dir).filter((f) => !f.startsWith('.') && !f.includes('/.') && !f.endsWith('.DS_Store')).sort();
  out += `  {\n    id: '${s.id}',\n    repo: '${s.repo}',\n    revision: '${rev}',\n    dir: '${s.local}',\n    marker: ${s.marker ? `'${s.marker}'` : 'null'},\n    files: [\n`;
  for (const f of files) {
    const t = byPath.get(f);
    if (!t) { console.error(`(ignoré, absent du dépôt à ${rev.slice(0, 8)}) ${s.id}/${f}`); continue; }
    const p = path.join(dir, f);
    const sha = sha256(p);
    const ok = t.lfs ? t.lfs.oid === sha : t.oid === gitBlob(p);
    if (!ok) throw new Error(`${s.id}/${f} : différent du dépôt à ${rev}`);
    out += `      ['${f}', ${fs.statSync(p).size}, '${sha}'],\n`;
  }
  out += `    ],\n  },\n`;
}
out += `];\n`;
fs.writeFileSync(new URL('../../src/main/fluidModels.manifest.ts', import.meta.url), out);
console.log('OK src/main/fluidModels.manifest.ts');

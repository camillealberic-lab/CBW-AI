// Build CBW AI : esbuild (TS → JS) + copie des HTML, design/ et assets/ dans dist/.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = { bundle: true, sourcemap: 'linked', logLevel: 'warning', absWorkingDir: root };
const node = { ...common, platform: 'node', target: 'node22', format: 'cjs', external: ['electron', 'uiohook-napi', 'sherpa-onnx-node'] };

await Promise.all([
  build({ ...node, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' }),
  // diarisation (processus utilitaire, addon natif sherpa-onnx chargé depuis node_modules)
  build({ ...node, entryPoints: ['src/main/diarize-worker.ts'], outfile: 'dist/main/diarize-worker.js' }),
  // preload-update : ajouté par le popup de mise à jour ; ignoré tant que le fichier n'existe pas.
  ...['preload-recorder', 'preload-overlay', 'preload-settings', 'preload-app', 'preload-tray', 'preload-update']
    .filter((n) => existsSync(join(root, `src/main/${n}.ts`)))
    .map((n) => build({ ...node, entryPoints: [`src/main/${n}.ts`], outfile: `dist/main/${n}.js` })),
  build({ ...common, platform: 'browser', target: 'chrome130', format: 'iife', entryPoints: ['src/renderer/recorder.ts'], outfile: 'dist/renderer/recorder.js' }),
]);

// Router LLM (worker LLM) : compilé à part s'il existe ; chargé dynamiquement par src/main/cleaner.ts.
const router = join(root, 'src/llm/router.ts');
if (existsSync(router)) {
  try {
    // Un seul bundle (état config/quotas partagé) : router + notes v2 (organizeNotes, askNotes, gabarits, balises).
    const has = (f) => existsSync(join(root, f));
    const notes = has('src/llm/notes.ts');
    // organizeNotes est enveloppé : src/main/appWindow.ts pose, juste avant NoteSession.stop()/reorganize(), le contexte
    // du prochain compte rendu (notes tapées, gabarit, titre, invités, flux onDelta, résultat balisé) via setNextOrganize().
    const notesEntry = notes
      ? `
import { organizeNotes as __organize } from './src/llm/notes.ts';
export { parseAnnotated, stripMarkers } from './src/llm/notes.ts';
let __next = null;
export function setNextOrganize(o) { __next = o && typeof o === 'object' ? o : null; }
export function organizeNotes(transcript, opts = {}) {
  const x = __next; __next = null;
  if (!x) return __organize(transcript, opts);
  const { onResult, ...extra } = x;
  return __organize(transcript, { ...opts, ...extra }).then((r) => { try { onResult && onResult(r); } catch (e) { /* rien */ } return r; });
}`
      : '';
    await build({
      ...node,
      stdin: {
        contents:
          `export * from './src/llm/router.ts';` +
          notesEntry +
          (has('src/llm/ask.ts') ? `\nexport { askNotes } from './src/llm/ask.ts';` : '') +
          (has('src/llm/templates.ts') ? `\nexport { listTemplates } from './src/llm/templates.ts';` : ''),
        resolveDir: root,
        sourcefile: 'llm-entry.ts',
        loader: 'ts',
      },
      outfile: 'dist/llm/router.js',
    });
    console.log('✓ router LLM compilé');
  } catch (e) {
    console.warn('⚠ router LLM non compilé (passthrough) :', e.message);
  }
} else console.log('· pas de src/llm/router.ts → nettoyage en passthrough');

// Fichiers statiques
for (const f of ['recorder.html', 'overlay-fallback.html', 'settings-fallback.html', 'app-placeholder.html'])
  cpSync(join(root, 'src/renderer', f), join(dist, 'renderer', f));
for (const d of ['design/overlay', 'design/settings', 'design/app', 'design/brand', 'design/tray', 'design/update', 'assets'])
  if (existsSync(join(root, d))) cpSync(join(root, d), join(dist, d), { recursive: true });

console.log('✓ build → dist/');

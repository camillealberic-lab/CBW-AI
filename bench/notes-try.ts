// Essai manuel du résumé « Auto » (v4) — AUCUN appel LLM ici.
//   node --experimental-strip-types bench/notes-try.ts [reunion|brainstorm|cours] [--prompt]
// Affiche le genre deviné (repli sans IA), le nombre de tours et la taille du prompt ; --prompt imprime le prompt système.
// Pour un vrai essai plus tard : organizeNotes(readFileSync(...), { onDelta }) depuis src/llm/notes.ts (clés + réseau requis).
import { readFileSync } from 'node:fs';
import { buildNotesSystem, buildNotesUser, parseTranscript } from '../src/llm/notes.ts';
import { guessKind } from '../src/llm/templates.ts';

const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const expected: Record<string, string> = { reunion: 'reunion', brainstorm: 'brainstorm', cours: 'cours' };
for (const n of names.length ? names : Object.keys(expected)) {
  const text = readFileSync(new URL(`./notes/${n}.txt`, import.meta.url), 'utf8');
  const segs = parseTranscript(text);
  const kind = guessKind(text, '', new Set(segs.map((s) => s.speaker)).size);
  const sys = buildNotesSystem('auto');
  console.log(`${n}: ${segs.length} tours, genre deviné (repli) = ${kind} ${kind === expected[n] ? 'ok' : 'ATTENDU ' + expected[n]}, prompt ${sys.length} car., entrée ${buildNotesUser(text, undefined, '').length} car.`);
  if (process.argv.includes('--prompt')) console.log(sys + '\n');
}

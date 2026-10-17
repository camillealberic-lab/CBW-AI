// Essai réel du pipeline qualité des notes (relecture → analyse → rédaction → vérification) sur bench/notes/*.txt.
// Transcriptions FICTIVES uniquement. Appels réels : clés de l'app, Gemini seul, jamais Ollama.
//   DICTA_PROVIDERS=gemini node scripts/with-app-keys.mjs node --experimental-strip-types bench/notes-quality-try.ts [reunion|brainstorm|cours] [--md]
import { readFileSync } from 'node:fs';
import { organizeNotesQuality } from '../src/llm/notesPipeline.ts';

process.env.OLLAMA_HOST = 'http://127.0.0.1:9';
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const n of names.length ? names : ['reunion', 'brainstorm', 'cours']) {
  const text = readFileSync(new URL(`./notes/${n}.txt`, import.meta.url), 'utf8');
  let first = 0;
  const t0 = performance.now();
  try {
    const r = await organizeNotesQuality(text, {
      steps: { review: true },
      onDelta: (d) => { if (d && !first) first = performance.now() - t0; },
      onStage: (s) => { if (s.status !== 'start') console.log(`  ${n} · ${s.name} : ${s.status}${s.ms != null ? ` ${(s.ms / 1000).toFixed(1)} s` : ''}${s.detail ? ` (${s.detail})` : ''}`); },
    });
    console.log(`${n} : ${(r.pipeline.totalMs / 1000).toFixed(1)} s au total, 1er texte à ${(first / 1000).toFixed(1)} s, genre ${r.kind}, ${r.provider}/${r.model}, repli ${r.pipeline.fallback}, vérif ${JSON.stringify(r.pipeline.verification ?? null)}`);
    if (process.argv.includes('--md')) console.log(`\n${r.markdown}\n`);
  } catch (e: any) {
    console.log(`${n} : ÉCHEC ${e?.message?.split('\n')[0]}`);
  }
}

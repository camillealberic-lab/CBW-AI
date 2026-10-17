// Harnais « Notes » sans Electron : rejoue EXACTEMENT la chaîne de l'app sur un WAV 16 kHz mono (dictaphone / présentiel,
// une piste = mode « mix », nombre de personnes non annoncé), puis le compte rendu par le pipeline qualité.
//
//   1. transcription : dicta-meeting transcribe sur des tranches ≤ 10 min coupées au creux (meetingEngine.transcribeFile) ;
//   2. voix : dicta-meeting diarize --fa 0.4 --embeddings, puis refineDiarization (fusion cos ≥ 0,62, groupes < 1,5 s absorbés) ;
//   3. attribution : segmentsFromWords(…, 'mic') → labelSegments(…, 'mix') (mot par mot) → speakerTranscript ;
//   4. résumé : applyReplacements + organizeNotesQuality(transcript, { vocabulary }) comme organizeAndSave (notes.ts).
//
// Usage (clés de l'app, jamais Ollama) :
//   export PATH=~/.local/node/bin:$PATH
//   node scripts/with-app-keys.mjs node --experimental-strip-types scripts/notes-harness/run.ts <wav> <dossierSortie> [--no-llm] [--reuse]
// Sorties dans <dossierSortie> : engine.json (mots + tours), labeled.json, transcript.txt, summary.json, timings.json.
// Aucun texte de réunion n'est écrit sur la console : uniquement des nombres.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FLUID_DIARIZE_ARGS, diarizeTimeoutMs, parseDiarize, parseTranscribe, refineDiarization, runBin, splitLong, transcribeTimeoutMs, wordsToMs,
} from '../../src/main/meetingEngineCore.ts';
import { labelSegments, mergeTurns, segmentsFromWords, speakerTranscript } from '../../src/main/speakers.ts';

/** Copie fidèle de wavfile.readWavSlice (wavfile.ts n'est pas chargeable en strip-only : propriété de paramètre). */
function wavHeader(dataBytes: number, rate: number): Buffer {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataBytes, 40);
  return b;
}
function readWavSlice(file: string, fromMs: number, toMs: number): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const a = Math.min(size, 44 + Math.max(0, Math.floor((fromMs * 16) | 0)) * 2);
    const b = Math.min(size, 44 + Math.max(0, Math.floor((toMs * 16) | 0)) * 2);
    const data = Buffer.alloc(Math.max(0, b - a) & ~1);
    if (data.length) fs.readSync(fd, data, 0, data.length, a);
    return Buffer.concat([wavHeader(data.length, 16000), data]);
  } finally {
    fs.closeSync(fd);
  }
}

process.env.OLLAMA_HOST = 'http://127.0.0.1:9';
const args = process.argv.slice(2);
const namesIdx = args.indexOf('--names');
const namesArg = namesIdx >= 0 ? args[namesIdx + 1] ?? '' : '';
const known = new Map(namesArg.split(',').map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][]);
const rest = args.filter((_a, i) => namesIdx < 0 || (i !== namesIdx && i !== namesIdx + 1));
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const [wav, outDir] = rest.filter((a) => !a.startsWith('--'));
if (!wav || !outDir) {
  console.error('usage : run.ts <wav> <dossierSortie> [--no-llm] [--reuse] [--names "Personne 1=Camille,Personne 2=Clément"]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const out = (f: string) => path.join(outDir, f);
const home = process.env.DICTA_AI_HOME || path.join(os.homedir(), '.dicta-ai');
const BIN = process.env.DICTA_MEETING_BIN || '/Applications/CBW AI.app/Contents/Resources/bin/dicta-meeting';
const MODELS = process.env.DICTA_MEETING_MODELS || path.join(home, 'models', 'fluid');

// Réglages de l'app (lecture ciblée de config.json : langue + dictionnaire, rien d'autre n'est lu ni affiché)
const cfg: Record<string, unknown> = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const lang = typeof cfg['general.language'] === 'string' ? String(cfg['general.language']) : 'fr';
const langArg = /^[a-z]{2}$/.test(lang) ? ['--lang', lang] : [];
function vocabularyForNotes(): { vocabulary: string[]; replacements: { from: string; to: string }[] } {
  const seen = new Set<string>();
  const vocabulary: string[] = [];
  for (const t of [...asList(cfg['dictionary.priority']), ...asList(cfg['cleaning.vocabulary'])]) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    vocabulary.push(t.trim());
    if (vocabulary.length >= 200) break;
  }
  const replacements: { from: string; to: string }[] = [];
  for (const x of asList(cfg['dictionary.replacements'])) {
    const i = x.indexOf('=>');
    if (i < 1) continue;
    const from = x.slice(0, i).trim();
    const to = x.slice(i + 2).trim();
    if (from && from.length <= 80 && to.length <= 200 && from.toLowerCase() !== to.toLowerCase()) replacements.push({ from, to });
  }
  return { vocabulary, replacements };
}

const timings: Record<string, number | string> = {};
const t = () => performance.now();
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

type Word = { w: string; s: number; e: number };
let words: Word[];
let rawTurns: { start: number; end: number; speaker: string }[];
let rawCount: number;
let embeddingsCount = 0;
let refined: ReturnType<typeof refineDiarization>;
const audioSec = Math.max(1, (fs.statSync(wav).size - 44) / 32000);
timings.audioSec = Number(audioSec.toFixed(1));

if (flags.has('--reuse') && fs.existsSync(out('engine.json'))) {
  const e = JSON.parse(fs.readFileSync(out('engine.json'), 'utf8'));
  ({ words, rawTurns, rawCount } = e);
  refined = refineDiarization({ turns: rawTurns, speakerCount: rawCount, diarizeSeconds: 0, embeddings: e.embeddings });
  Object.assign(timings, JSON.parse(fs.readFileSync(out('timings.json'), 'utf8')));
  console.log('moteur : résultats réutilisés');
} else {
  // 1. Transcription (meetingEngine.transcribeFile)
  const total = Math.max(0, Math.floor((fs.statSync(wav).size - 44) / 2));
  const t0 = t();
  words = [];
  const cuts = splitLong(total, (from, to) => readWavSlice(wav, from / 16, to / 16));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-harness-'));
  try {
    for (const [a, b] of cuts) {
      const slice = readWavSlice(wav, a / 16, b / 16);
      const f = path.join(tmp, `slice-${a}.wav`);
      fs.writeFileSync(f, slice);
      const so = await runBin(BIN, ['transcribe', f, ...langArg], { timeoutMs: transcribeTimeoutMs((slice.length - 44) / 32000), modelsDir: MODELS });
      fs.rmSync(f, { force: true });
      words.push(...wordsToMs(parseTranscribe(so).words, Math.round(a / 16)));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  timings.transcribeMs = Math.round(t() - t0);
  timings.slices = cuts.length;
  console.log(`transcription : ${words.length} mots, ${cuts.length} tranche(s), ${timings.transcribeMs} ms`);

  // 2. Séparation des voix (meetingEngine.fluidDiarize, n = -1)
  const t1 = t();
  const so = await runBin(BIN, ['diarize', wav, ...FLUID_DIARIZE_ARGS], { timeoutMs: diarizeTimeoutMs(audioSec), modelsDir: MODELS });
  const d = parseDiarize(so);
  timings.diarizeMs = Math.round(t() - t1);
  const t2 = t();
  refined = refineDiarization(d);
  timings.refineMs = Math.round(t() - t2);
  rawTurns = d.turns;
  rawCount = d.speakerCount;
  embeddingsCount = Object.keys(d.embeddings ?? {}).length;
  fs.writeFileSync(out('engine.json'), JSON.stringify({ words, rawTurns, rawCount, embeddings: d.embeddings }));
  console.log(`voix : ${rawCount} groupe(s) bruts (${embeddingsCount} empreintes) → ${refined.speakerCount} après fusion, ${timings.diarizeMs} + ${timings.refineMs} ms`);
}

// 3. Attribution (notes.ts finalPass + speakers)
const t3 = t();
const segs = segmentsFromWords(words, 'mic');
const labeled = labelSegments(segs, refined.turns, 'mix', false);
// noms connus (--names) : « Personne N » remplacé par le prénom donné, comme après un renommage dans l'app
const transcript = speakerTranscript(known.size ? labeled.map((l) => ({ ...l, speaker: known.get(l.speaker) ?? l.speaker })) : labeled);
timings.labelMs = Math.round(t() - t3);
timings.segments = segs.length;
timings.words = words.length;

// Statistiques par personne (nombres seulement) : à partir des pièces étiquetées et des tours de la diarisation
const bySpk = new Map<string, { ms: number; words: number; turns: number }>();
for (const s of labeled) {
  const x = bySpk.get(s.speaker) ?? { ms: 0, words: 0, turns: 0 };
  x.ms += s.endMs - s.startMs;
  x.words += countWords(s.text);
  bySpk.set(s.speaker, x);
}
for (const m of mergeTurns(labeled)) bySpk.get(m.speaker)!.turns++;
const rawDur = new Map<string, number>();
for (const r of rawTurns) rawDur.set(r.speaker, (rawDur.get(r.speaker) ?? 0) + r.end - r.start);
const refDur = new Map<string, number>();
for (const r of refined.turns) refDur.set(r.speaker, (refDur.get(r.speaker) ?? 0) + r.end - r.start);
// correspondance cluster fusionné → « Personne N » (premier mot attribué)
fs.writeFileSync(out('labeled.json'), JSON.stringify(labeled));
fs.writeFileSync(out('transcript.txt'), transcript + '\n');
const stats = {
  rawGroups: [...rawDur].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, sec: +v.toFixed(1) })),
  mergedGroups: [...refDur].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, sec: +v.toFixed(1) })),
  persons: [...bySpk].map(([k, v]) => ({ speaker: k, sec: +(v.ms / 1000).toFixed(1), words: v.words, turns: v.turns })),
  transcriptTurns: mergeTurns(labeled).length,
};
fs.writeFileSync(out('stats.json'), JSON.stringify(stats, null, 1));
console.log(`attribution : ${segs.length} segments → ${stats.transcriptTurns} tours, ${bySpk.size} personne(s), ${timings.labelMs} ms`);
fs.writeFileSync(out('timings.json'), JSON.stringify(timings, null, 1));

// 4. Compte rendu (organizeAndSave → organizeNotes = organizeNotesQuality dans le bundle de l'app)
if (!flags.has('--no-llm')) {
  const { organizeNotesQuality } = await import('../../src/llm/notesPipeline.ts');
  const { applyReplacements } = await import('../../src/llm/format.ts');
  const dict = vocabularyForNotes();
  const stages: { name: string; status: string; ms?: number; detail?: string }[] = [];
  let first = 0;
  const t4 = t();
  try {
    const r = await organizeNotesQuality(applyReplacements(transcript, dict.replacements), {
      vocabulary: dict.vocabulary,
      participants: known.size ? [...known.values()] : undefined,
      onDelta: (s: string) => { if (s && !first) first = t() - t4; },
      onStage: (s) => {
        if (s.status === 'start') return;
        stages.push(s);
        console.log(`  ${s.name} : ${s.status}${s.ms != null ? ` ${(s.ms / 1000).toFixed(1)} s` : ''}${s.detail ? ` (${s.detail})` : ''}`);
      },
    });
    timings.summaryMs = Math.round(t() - t4);
    timings.firstTextMs = Math.round(first);
    const summary = {
      title: applyReplacements(r.title, dict.replacements),
      markdown: applyReplacements(r.markdown, dict.replacements).trimStart(),
      provider: r.provider, model: r.model, kind: r.kind, parts: r.parts,
      pipeline: r.pipeline, stages, vocabularySize: dict.vocabulary.length, replacements: dict.replacements.length,
      reviewedTranscript: r.reviewedTranscript,
    };
    fs.writeFileSync(out('summary.json'), JSON.stringify(summary, null, 1));
    console.log(`résumé : ${r.provider}/${r.model}, ${timings.summaryMs} ms (1er texte ${timings.firstTextMs} ms), repli ${r.pipeline.fallback}, vérif ${JSON.stringify(r.pipeline.verification ?? null)}`);
  } catch (e) {
    timings.summaryMs = Math.round(t() - t4);
    timings.summaryError = (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 200);
    console.log(`résumé : ÉCHEC (${timings.summaryError})`);
  }
  fs.writeFileSync(out('timings.json'), JSON.stringify(timings, null, 1));
}

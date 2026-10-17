// Lance dicta-meeting diarize (réglages de l'app : FLUID_DIARIZE_ARGS) sur chaque WAV donné, un à la fois,
// et garde la sortie brute (<wav>.di.json) pour rejouer le calibrage sans relancer le moteur.
//   node --experimental-strip-types scripts/notes-harness/diarize-cache.ts <a.wav> [b.wav…]
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FLUID_DIARIZE_ARGS, diarizeTimeoutMs, parseDiarize, runBin } from '../../src/main/meetingEngineCore.ts';

const BIN = process.env.DICTA_MEETING_BIN || '/Applications/CBW AI.app/Contents/Resources/bin/dicta-meeting';
const MODELS = process.env.DICTA_MEETING_MODELS || path.join(os.homedir(), '.dicta-ai', 'models', 'fluid');
for (const wav of process.argv.slice(2)) {
  const out = wav.replace(/\.wav$/, '.di.json');
  if (fs.existsSync(out)) continue;
  const sec = (fs.statSync(wav).size - 44) / 32000;
  const t0 = performance.now();
  const so = await runBin(BIN, ['diarize', wav, ...FLUID_DIARIZE_ARGS], { timeoutMs: diarizeTimeoutMs(sec), modelsDir: MODELS });
  const d = parseDiarize(so);
  fs.writeFileSync(out, JSON.stringify({ ...d, ms: Math.round(performance.now() - t0) }));
  console.log(`${path.basename(wav)} : ${d.speakerCount} groupe(s) bruts, ${Math.round(performance.now() - t0)} ms`);
}

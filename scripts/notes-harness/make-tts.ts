// Fichiers de test synthétiques (voix macOS `say`) pour le calibrage de la séparation des voix : 1, 2 et 3 voix,
// tours alternés, WAV 16 kHz mono à en-tête de 44 octets (comme les WAV de session de l'app).
//   node --experimental-strip-types scripts/notes-harness/make-tts.ts <dossier>
// Écrit <dossier>/<scenario>.wav + <scenario>.truth.json ({ voices, turns: [{ s, e, voice }] }).

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const dir = process.argv[2];
if (!dir) process.exit(2);
fs.mkdirSync(dir, { recursive: true });

const LINES = [
  'Bonjour à tous, on commence la réunion de suivi du projet.',
  'Très bien, je propose de faire le point sur le budget du trimestre.',
  'Le devis du client est arrivé hier soir, il faut encore le relire.',
  'Je peux m’en occuper demain matin, avant le comité.',
  'Attention, le planning de livraison a glissé d’une semaine.',
  'Dans ce cas il faut prévenir l’équipe graphique rapidement.',
  'On pourrait aussi réduire le périmètre de la première version.',
  'Je ne suis pas sûr, le client tient beaucoup à la page d’accueil.',
  'Alors gardons la page d’accueil et repoussons le blog.',
  'D’accord, je note la décision dans le compte rendu.',
  'Il reste la question des photos, qui s’en charge ?',
  'Moi, je contacte le photographe cette semaine.',
  'Parfait, on se revoit jeudi pour valider les maquettes.',
  'Merci à tous, bonne fin de journée.',
];

function pcm(voice: string, text: string, tmp: string): Buffer {
  const f = path.join(tmp, 'x.wav');
  execFileSync('say', ['-v', voice, '-o', f, '--file-format=WAVE', '--data-format=LEI16@16000', text]);
  const b = fs.readFileSync(f);
  let at = 12;
  while (at < b.length - 8) {
    const id = b.toString('ascii', at, at + 4);
    const len = b.readUInt32LE(at + 4);
    if (id === 'data') return b.subarray(at + 8, at + 8 + Math.min(len, b.length - at - 8));
    at += 8 + len;
  }
  throw new Error('wav sans data');
}
function header(n: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n, 40);
  return h;
}

const SCENARIOS: Record<string, { voices: string[]; rounds: number }> = {
  'v1-thomas': { voices: ['Thomas'], rounds: 1 },
  'v2-thomas-shelley': { voices: ['Thomas', 'Shelley (Français (France))'], rounds: 1 },
  'v2-jacques-flo': { voices: ['Jacques', 'Flo (Français (France))'], rounds: 1 },
  'v3-thomas-shelley-jacques': { voices: ['Thomas', 'Shelley (Français (France))', 'Jacques'], rounds: 1 },
  'v3-eddy-flo-sandy': { voices: ['Eddy (Français (France))', 'Flo (Français (France))', 'Sandy (Français (France))'], rounds: 1 },
  'v3-long-thomas-amelie-rocko': { voices: ['Thomas', 'Amélie (Français (Canada))', 'Rocko (Français (France))'], rounds: 3 },
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
try {
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const parts: Buffer[] = [];
    const turns: { s: number; e: number; voice: string }[] = [];
    let at = 0;
    let k = 0;
    for (let r = 0; r < sc.rounds; r++)
      for (const line of LINES) {
        const voice = sc.voices[k++ % sc.voices.length];
        const p = pcm(voice, line, tmp);
        turns.push({ s: at / 32000, e: (at + p.length) / 32000, voice });
        parts.push(p);
        at += p.length;
        const gap = Buffer.alloc(16000 * 2 * 0.6);
        parts.push(gap);
        at += gap.length;
      }
    const data = Buffer.concat(parts);
    fs.writeFileSync(path.join(dir, `${name}.wav`), Buffer.concat([header(data.length), data]));
    fs.writeFileSync(path.join(dir, `${name}.truth.json`), JSON.stringify({ voices: sc.voices.length, turns }));
    console.log(`${name} : ${(data.length / 32000).toFixed(0)} s, ${sc.voices.length} voix`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

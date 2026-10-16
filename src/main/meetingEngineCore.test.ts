// @ts-nocheck
// Tests : choix du moteur (matrice macOS / modèles / binaire), parsing des sorties JSON de dicta-meeting, essai réel du
// binaire en ligne de commande (sans Electron). node --experimental-strip-types src/main/meetingEngineCore.test.ts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chooseEngine, EngineError, lastJsonLine, macMajorFromDarwin, parseDiarize, parseMacMajor, parseTranscribe, runBin, wordsToMs } from './meetingEngineCore.ts';
import { piecesFromWords } from './speakers.ts';

// 1. matrice de choix : macOS ≥ 15 ET modèles ET binaire → fluid ; tout le reste → whisper
{
  const ok = { platform: 'darwin', macMajor: 15, modelsReady: true, binPresent: true };
  assert.equal(chooseEngine(ok).engine, 'fluid');
  assert.equal(chooseEngine({ ...ok, macMajor: 26 }).engine, 'fluid');
  for (const major of [0, 13, 14]) assert.equal(chooseEngine({ ...ok, macMajor: major }).engine, 'whisper', `macOS ${major}`);
  assert.equal(chooseEngine({ ...ok, modelsReady: false }).engine, 'whisper');
  assert.equal(chooseEngine({ ...ok, binPresent: false }).engine, 'whisper');
  assert.equal(chooseEngine({ ...ok, platform: 'linux' }).engine, 'whisper');
  assert.equal(chooseEngine({ ...ok, failed: true }).engine, 'whisper');
  assert.equal(chooseEngine({ ...ok, setting: 'whisper' }).engine, 'whisper');
  assert.equal(chooseEngine({ ...ok, setting: 'auto' }).engine, 'fluid');
  // exhaustif : 2 (macOS) x 2 (modèles) x 2 (binaire)
  for (const mac of [14, 15]) for (const m of [false, true]) for (const b of [false, true])
    assert.equal(chooseEngine({ platform: 'darwin', macMajor: mac, modelsReady: m, binPresent: b }).engine, mac >= 15 && m && b ? 'fluid' : 'whisper');
}
// 2. version de macOS
assert.equal(parseMacMajor('15.4.1'), 15);
assert.equal(parseMacMajor('26.0\n'), 26);
assert.equal(parseMacMajor('?'), 0);
assert.equal(macMajorFromDarwin('23.6.0'), 14);
assert.equal(macMajorFromDarwin('24.1.0'), 15);
assert.equal(macMajorFromDarwin('25.0.0'), 26);
assert.equal(macMajorFromDarwin(''), 0);

// 3. sorties JSON
{
  const t = parseTranscribe('[log] bruit\n{"text":"Bonjour  à tous.","duration":2.5,"transcribeSeconds":0.1,"words":[{"w":"Bonjour","s":0,"e":0.4},{"w":"à","s":0.4,"e":0.5},{"w":"x","s":"a","e":1},{"w":"tous.","s":0.5,"e":1.2}]}\n');
  assert.equal(t.text, 'Bonjour à tous.');
  assert.equal(t.words.length, 3); // mot invalide ignoré
  assert.equal(t.durationSec, 2.5);
  assert.deepEqual(wordsToMs(t.words, 10000)[2], { w: 'tous.', s: 10500, e: 11200 });
  assert.throws(() => parseTranscribe('{"error":"modelMissing(repo: x)"}'), /modelMissing/);
  assert.throws(() => parseTranscribe('rien du tout'), EngineError);
  assert.throws(() => parseTranscribe('{"duration":1}'), /absente/);
  assert.equal(parseTranscribe('{"text":"","duration":1,"words":[]}').text, '');
  const d = parseDiarize('{"segments":[{"speaker":"S2","s":5,"e":9},{"speaker":"S1","s":0,"e":4.5},{"speaker":"S1","s":7,"e":7},{"speaker":3,"s":1,"e":2}],"speakerCount":2,"diarizeSeconds":1.1}');
  assert.deepEqual(d.turns.map((x) => x.speaker), ['S1', 'S2']); // triés, invalides retirés
  assert.equal(d.speakerCount, 2);
  assert.throws(() => parseDiarize('{"error":"boom"}'), /boom/);
  assert.deepEqual(lastJsonLine('{"a":1}\n{"b":2}\n'), { b: 2 });
}
// 4. attribution mot par mot
{
  const turns = [{ start: 0, end: 3, speaker: 'S1' }, { start: 3, end: 6, speaker: 'S2' }];
  const words = ['Oui', 'je', 'pense', 'que', 'non', 'merci', 'mais', 'si'].map((w, i) => ({ w, s: i * 700, e: i * 700 + 650 }));
  const p = piecesFromWords(words, turns);
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => x.raw), ['S1', 'S2']);
  assert.equal(p.map((x) => x.text).join(' '), 'Oui je pense que non merci mais si'); // rien perdu
  // un mot isolé d'une autre voix est rattaché à ses voisins
  const w2 = ['a', 'b', 'c', 'd', 'e'].map((w, i) => ({ w, s: i * 1000, e: i * 1000 + 900 }));
  const p2 = piecesFromWords(w2, [{ start: 0, end: 2, speaker: 'S1' }, { start: 2, end: 3, speaker: 'S2' }, { start: 3, end: 5, speaker: 'S1' }]);
  assert.equal(p2.length, 1);
}

// 5. essai réel du binaire (si présent avec ses modèles et si `say` existe) : transcription + diarisation de deux voix
const bin = process.env.DICTA_MEETING_BIN || new URL('../../vendor/bin/dicta-meeting', import.meta.url).pathname;
const models = process.env.DICTA_MEETING_MODELS || path.join(os.homedir(), '.dicta-ai', 'models', 'fluid');
if (process.platform === 'darwin' && fs.existsSync(bin) && fs.existsSync(path.join(models, 'parakeet-tdt-0.6b-v3', 'Encoder.mlmodelc'))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dicta-engine-test-'));
  try {
    const pcm = (voice: string, text: string): Buffer => {
      const aiff = path.join(dir, 'x.aiff');
      const wav = path.join(dir, 'x.wav');
      execFileSync('say', ['-v', voice, text, '-o', aiff]);
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav]);
      const b = fs.readFileSync(wav);
      let at = 12;
      while (at < b.length - 8) {
        const id = b.toString('ascii', at, at + 4);
        const len = b.readUInt32LE(at + 4);
        if (id === 'data') return b.subarray(at + 8, at + 8 + Math.min(len, b.length - at - 8));
        at += 8 + len;
      }
      throw new Error('wav sans data');
    };
    const a = pcm('Thomas', 'Bonjour à tous, on commence la réunion. Le budget est validé pour le mois de novembre.');
    const b = pcm('Shelley (Français (France))', "Très bien. Je m'occupe du devis client et je l'envoie vendredi.");
    const gap = Buffer.alloc(16000 * 2 * 1); // 1 s de silence
    const data = Buffer.concat([a, gap, b]);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
    hdr.writeUInt32LE(16000, 24); hdr.writeUInt32LE(32000, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
    const file = path.join(dir, 'duo.wav');
    fs.writeFileSync(file, Buffer.concat([hdr, data]));
    const t = parseTranscribe(await runBin(bin, ['transcribe', file, '--lang', 'fr'], { timeoutMs: 120000, modelsDir: models }));
    assert.match(t.text.toLowerCase(), /budget/);
    assert.match(t.text.toLowerCase(), /devis/);
    assert.ok(t.words.length > 15 && t.words.every((w) => w.e >= w.s));
    const d = parseDiarize(await runBin(bin, ['diarize', file, '--speakers', '2'], { timeoutMs: 120000, modelsDir: models }));
    assert.equal(new Set(d.turns.map((x) => x.speaker)).size, 2, 'deux voix attendues');
    const pieces = piecesFromWords(wordsToMs(t.words, 0), d.turns);
    assert.ok(pieces.length >= 2 && pieces[0].raw !== pieces[pieces.length - 1].raw, 'les deux voix sont séparées mot par mot');
    // erreur propre : fichier absent
    await assert.rejects(runBin(bin, ['transcribe', path.join(dir, 'absent.wav')], { timeoutMs: 60000, modelsDir: models }), EngineError);
    // modèles absents : erreur, jamais de téléchargement (mode hors ligne)
    await assert.rejects(runBin(bin, ['transcribe', file], { timeoutMs: 60000, modelsDir: path.join(dir, 'vide') }), /modelMissing|required|code/);
    // annulation
    const ac = new AbortController();
    const p = runBin(bin, ['transcribe', file], { timeoutMs: 60000, modelsDir: models, signal: ac.signal });
    ac.abort();
    await assert.rejects(p, /annulé/);
    console.log(`binaire réel : OK (${t.words.length} mots, ${d.turns.length} tours, ${d.speakerCount} voix)`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
} else console.log('binaire réel : ignoré (binaire ou modèles absents)');
console.log('meetingEngineCore.test.ts : OK');

// ── dictaphone (15 oct.) : fusion des groupes sur-découpés, absorption, tranches d'un long fichier
{
  const { refineDiarization, splitLong, parseDiarize } = await import('./meetingEngineCore.ts');
  const e = (k) => Array.from({ length: 16 }, (_, i) => (i === k ? 1 : 0.05));
  const d = parseDiarize(JSON.stringify({ segments: [{ speaker: 'S1', s: 0, e: 10 }, { speaker: 'S2', s: 10, e: 20 }, { speaker: 'S3', s: 20, e: 30 }, { speaker: 'S4', s: 30, e: 31 }], speakerCount: 4, embeddings: { S1: e(0), S2: e(1), S3: e(0).map((x, i) => (i === 2 ? 0.3 : x)), S4: e(5) } }));
  const r = refineDiarization(d);
  assert.equal(r.speakerCount, 2); // S3 ≈ S1 fusionnés, S4 (1 s) absorbé
  const total = 16000 * 1500; // 25 min
  const buf = (a, b) => { const n = b - a; const B = Buffer.alloc(44 + n * 2); for (let i = 0; i < n; i++) B.writeInt16LE(((a + i) % 16000 < 1600) ? 0 : 1000, 44 + i * 2); return B; };
  const cuts = splitLong(total, buf);
  assert.equal(cuts.length, 3);
  assert.equal(cuts[0][0], 0);
  assert.equal(cuts.at(-1)[1], total);
  for (const [a, b] of cuts) assert.ok(b - a <= 600 * 16000);
  assert.ok(cuts[0][1] % 16000 < 1600); // coupe dans le silence
  console.log('dictaphone (moteur) ok');
}

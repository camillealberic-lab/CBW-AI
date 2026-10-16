// @ts-nocheck
// Tests purs du découpage (dictée inchangée ; réunion façon Granola) : node --experimental-strip-types src/shared/vad.test.ts
import assert from 'node:assert/strict';
import { MEETING_VAD, RATE, Segmenter, segmentOffline, uncovered, type SpeechBounds } from './vad.ts';

let seed = 7;
const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** Signal de type parole : porteuse 180 Hz modulée + bruit, au RMS demandé. */
function speech(sec: number, rms: number): Float32Array {
  const n = Math.round(sec * RATE);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = (Math.sin((2 * Math.PI * 180 * i) / RATE) * (0.7 + 0.3 * Math.sin((2 * Math.PI * 3.5 * i) / RATE)) + 0.3 * (rnd() - 0.5)) * rms * 1.35;
  return o;
}
const silence = (sec: number, rms = 0.0004): Float32Array => Float32Array.from({ length: Math.round(sec * RATE) }, () => (rnd() - 0.5) * rms * 3.4);
const cat = (...a: Float32Array[]): Float32Array => {
  const o = new Float32Array(a.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of a) (o.set(x, p), (p += x.length));
  return o;
};
interface Got { start: number; end: number; commit: boolean; sp: SpeechBounds }
function run(sig: Float32Array, opts?: ConstructorParameters<typeof Segmenter>[1]): { got: Got[]; seg: Segmenter } {
  const got: Got[] = [];
  const seg = new Segmenter((start, end, commit, sp) => got.push({ start, end, commit, sp }), opts);
  for (let i = 0; i < sig.length; i += 1600) seg.push(sig.subarray(i, Math.min(sig.length, i + 1600)));
  return { got, seg };
}
const sec = (n: number): number => n / RATE;

// 1. Dictée : réglages inchangés — parole continue de 15 s coupée de force vers 6 s
{
  const { got } = run(speech(15, 0.05));
  assert.ok(got.length >= 2, 'dictée : coupes forcées');
  assert.ok(sec(got[0].end) <= 6.1, `dictée : première coupe à ${sec(got[0].end)} s`);
}

// 2. Réunion : 40 s de parole continue, creux à ~23,5 s → aucune coupe avant 20 s, aucun morceau > 25 s + marge
{
  const sig = cat(speech(23.5, 0.04), silence(0.12), speech(17, 0.04));
  const { got } = run(sig, MEETING_VAD);
  assert.ok(got.length >= 1, 'réunion : au moins une coupe forcée');
  assert.ok(sec(got[0].end) >= 19.5, `réunion : coupe forcée à ${sec(got[0].end).toFixed(1)} s (jamais à 6 s)`);
  for (const g of got) assert.ok(sec(g.end - g.start) <= 25.6, 'morceau ≤ 25 s (+ marge)');
  // la coupe tombe dans le creux (23,5–23,62 s) : pas au milieu d'un mot
  assert.ok(sec(got[0].end) > 23.4 && sec(got[0].end) < 23.7, `coupe dans le creux (${sec(got[0].end).toFixed(2)} s)`);
}

// 3. Réunion : pause de 500 ms ne coupe pas ; pause de 1 s coupe, avec marge de 256 ms autour de la parole
{
  const a = run(cat(silence(1), speech(3, 0.04), silence(0.5), speech(3, 0.04), silence(2)), MEETING_VAD);
  assert.equal(a.got.length, 1, 'pause 500 ms : un seul morceau');
  const b = run(cat(silence(1), speech(3, 0.04), silence(1.2), speech(3, 0.04), silence(2)), MEETING_VAD);
  assert.equal(b.got.length, 2, 'pause 1,2 s : deux morceaux');
  const [m1, m2] = b.got;
  assert.ok(sec(m1.end - m1.sp.to) >= 0.256 - 0.01, 'marge après ≥ 256 ms');
  assert.ok(sec(m2.sp.from - m2.start) >= 0.256 - 0.01, 'marge avant ≥ 256 ms');
  assert.ok(m1.end <= m2.start + RATE, 'morceaux contigus (pas de trou de parole)');
  assert.ok(Math.abs(sec(m1.sp.from) - 1) < 0.1 && Math.abs(sec(m1.sp.to) - 4) < 0.1, 'bornes de parole justes');
}

// 4. Voix lointaine (RMS ≈ 0,008 ≈ −42 dBFS) : captée en réunion, ignorée par les réglages de dictée (seuil 0,01)
{
  const far = cat(silence(1), speech(3, 0.01), silence(2));
  assert.equal(run(far, MEETING_VAD).got.length, 1, 'voix lointaine détectée en réunion');
  assert.equal(run(far).seg.voicedMs, 0, 'seuil de dictée inchangé : aucune parole détectée');
  assert.ok(run(far, MEETING_VAD).seg.voicedMs >= 2500, 'réunion : parole comptée');
}

// 5. Silence pur de 70 s : aucun morceau (pas de coupe forcée dans le vide), rien en attente
{
  const { got, seg } = run(silence(70), MEETING_VAD);
  assert.equal(got.length, 0);
  assert.equal(seg.hasPendingSpeech, false);
}

// 6. Reste non transcrit à l'arrêt : parole en cours sans pause → pendingBounds
{
  const { got, seg } = run(cat(silence(1), speech(2, 0.04)), MEETING_VAD);
  assert.equal(got.length, 0);
  assert.ok(seg.hasPendingSpeech && seg.pendingBounds!.to - seg.pendingBounds!.from > RATE);
}

// 7. Hors ligne == direct ; rattrapage des passages non couverts
{
  const sig = cat(silence(1), speech(4, 0.03), silence(1.5), speech(5, 0.03), silence(1.5), speech(3, 0.03), silence(1));
  const live = run(sig, MEETING_VAD).got;
  const off = segmentOffline(sig, MEETING_VAD);
  assert.equal(off.length, live.length + (run(sig, MEETING_VAD).seg.hasPendingSpeech ? 1 : 0));
  assert.equal(off.length, 3);
  const covered = [off[0], off[2]].map((c) => ({ from: c.from, to: c.to }));
  const miss = uncovered(off, covered);
  assert.equal(miss.length, 1, 'un seul passage non couvert');
  assert.equal(miss[0], off[1]);
  assert.equal(uncovered(off, off.map((c) => ({ from: c.from, to: c.to }))).length, 0);
  // couverture partielle (30 %) → à rattraper ; 70 % → couvert
  const c = off[1];
  assert.equal(uncovered([c], [{ from: c.from, to: c.from + (c.to - c.from) * 0.3 }]).length, 1);
  assert.equal(uncovered([c], [{ from: c.from, to: c.from + (c.to - c.from) * 0.7 }]).length, 0);
}

// 8. compact() garde la marge d'avant-segment (mémoire bornée, audio de la marge disponible)
{
  const seg = new Segmenter(() => undefined, MEETING_VAD);
  const sig = cat(silence(2), speech(2, 0.04), silence(1.5), speech(2, 0.04));
  for (let i = 0; i < sig.length; i += 1600) {
    seg.push(sig.subarray(i, Math.min(sig.length, i + 1600)));
    seg.compact();
  }
  assert.ok(seg.audio(seg.tailFrom).length > 0);
  assert.ok(seg.cut - seg.tailFrom <= Math.round(0.256 * RATE) + 1);
}

console.log('vad.test.ts : OK');

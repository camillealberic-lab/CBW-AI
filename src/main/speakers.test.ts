// @ts-nocheck
// Tests purs : attribution par recouvrement, écho, fusion de groupes. node --experimental-strip-types src/main/speakers.test.ts
import assert from 'node:assert/strict';
import { attributePieces, clusterCount, dedupeEcho, labelSegments, mergeCentroids, splitSentences, speakerTranscript } from './speakers.ts';

const turns = [
  { start: 0, end: 10, speaker: 'S0' },
  { start: 10, end: 20, speaker: 'S1' },
];
// 1. recouvrement maximal, sans re-transcription (le texte n'est que coupé)
{
  const r = labelSegments([{ startMs: 1000, endMs: 8000, text: 'Bonjour à tous.', source: 'system' }, { startMs: 12000, endMs: 18000, text: 'Merci.', source: 'system' }], turns, 'mix');
  assert.deepEqual(r.map((x) => x.speaker), ['Personne 1', 'Personne 2']);
}
// 2. segment à cheval : découpé par phrases au prorata, chaque phrase à la voix dominante
{
  const seg = { startMs: 6000, endMs: 14000, text: 'Je pense que oui. Moi aussi je suis d’accord avec toi.', source: 'system' };
  const r = labelSegments([seg], turns, 'mix');
  assert.equal(r.length, 2);
  assert.equal(r[0].text, 'Je pense que oui.');
  assert.equal(r.map((x) => x.text).join(' '), seg.text, 'aucun mot perdu');
  assert.deepEqual(r.map((x) => x.speaker), ['Personne 1', 'Personne 2']);
}
// 3. deux pistes : micro = Moi (jamais trié, même au-dessus d'une voix), système trié
{
  const r = labelSegments([{ startMs: 2000, endMs: 4000, text: 'Oui.', source: 'mic' }, { startMs: 5000, endMs: 9000, text: 'Alors voilà.', source: 'system' }], turns, 'two-track');
  assert.deepEqual(r.map((x) => x.speaker), ['Moi', 'Personne 1']);
  assert.equal(speakerTranscript(r), '[00:02] Moi : Oui.\n[00:05] Personne 1 : Alors voilà.');
}
// 4. sans recouvrement : tour le plus proche (≤ 2 s), sinon voix précédente ; une seule personne => Moi
{
  const r = labelSegments([{ startMs: 20500, endMs: 22000, text: 'Fin.', source: 'system' }, { startMs: 40000, endMs: 41000, text: 'Loin.', source: 'system' }], turns, 'mix');
  assert.deepEqual(r.map((x) => x.speaker), ['Personne 1', 'Personne 1']);
  assert.ok(labelSegments([{ startMs: 0, endMs: 1000, text: 'Seul.' }], [], 'mix', true).every((x) => x.speaker === 'Moi'));
}
// 5. écho : le micro reprend la voix de l'autre -> retiré ; une vraie réponse est gardée
{
  const segs = [
    { startMs: 0, endMs: 4000, text: 'On doit livrer le devis vendredi prochain', source: 'system' },
    { startMs: 100, endMs: 4100, text: 'on doit livrer le devis vendredi prochain', source: 'mic' },
    { startMs: 4500, endMs: 6000, text: 'Non, plutôt lundi matin.', source: 'mic' },
  ];
  const r = dedupeEcho(segs);
  assert.equal(r.length, 2);
  assert.equal(r[1].text, 'Non, plutôt lundi matin.');
}
// 6. fusion de groupes : deux centroïdes proches fusionnent, un éloigné reste ; nombre imposé
{
  const e = (...v) => Float32Array.from(v);
  const items = [{ id: 'S0', e: e(1, 0.05, 0), weight: 100 }, { id: 'S1', e: e(0.97, 0.2, 0), weight: 30 }, { id: 'S2', e: e(0, 0, 1), weight: 80 }];
  const m = mergeCentroids(items, { minSim: 0.9 });
  assert.equal(m.get('S1'), 'S0');
  assert.equal(m.get('S2'), 'S2');
  const forced = mergeCentroids(items, { minSim: 0.99, target: 2 });
  assert.equal(new Set(forced.values()).size, 2);
  assert.equal(new Set(mergeCentroids(items, { minSim: 0.99, target: 3 }).values()).size, 3, 'jamais sous le nombre imposé');
  assert.equal(new Set(mergeCentroids(items, { minSim: 0.99, maxGroups: 2 }).values()).size, 2);
}
// 7. nombre de personnes -> numClusters
assert.equal(clusterCount(3, 'two-track'), 2);
assert.equal(clusterCount(3, 'mix'), 3);
assert.equal(clusterCount(undefined, 'mix'), -1);
assert.equal(clusterCount(1, 'two-track'), 1);
assert.deepEqual(splitSentences('Un. Deux ? Trois !'), ['Un.', 'Deux ?', 'Trois !']);
console.log('speakers.test.ts : OK');

// ── dictaphone (15 oct.) : segments depuis les mots du fichier entier ; plus de « micro = Moi » si plusieurs voix
{
  const { segmentsFromWords } = await import('./speakers.ts');
  const ws = [{ w: 'bonjour', s: 0, e: 400 }, { w: 'à', s: 450, e: 500 }, { w: 'tous', s: 520, e: 800 }, { w: 'oui', s: 2000, e: 2300 }, { w: 'merci', s: 2350, e: 2700 }];
  const segs = segmentsFromWords(ws, 'mic');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].text, 'bonjour à tous');
  assert.equal(segs[1].words.length, 2);
  // deux pistes, deux voix sur le micro → « Personne n » pour le micro, jamais « Moi »
  const micTurns = [{ start: 0, end: 1, speaker: 'S1' }, { start: 1.9, end: 3, speaker: 'S2' }];
  const lab = labelSegments(segs, [], 'two-track', false, micTurns);
  assert.ok(!lab.some((x) => x.speaker === 'Moi'));
  assert.equal(new Set(lab.map((x) => x.speaker)).size, 2);
  // une seule voix sur le micro → « Moi »
  const lab1 = labelSegments(segs, [], 'two-track', false, [{ start: 0, end: 3, speaker: 'S1' }]);
  assert.ok(lab1.every((x) => x.speaker === 'Moi'));
  console.log('dictaphone (speakers) ok');
}

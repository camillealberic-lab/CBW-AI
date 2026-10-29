// @ts-nocheck
// Tests purs de la mesure de qualité.  NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/quality.test.ts
import assert from 'node:assert/strict';
const q = await import('./quality.ts');

assert.equal(q.wordDistance('a b c', 'a b c'), 0);
assert.equal(q.wordDistance('a b c', 'a x c'), 1);
assert.equal(q.wordDistance('a b c', 'a c'), 1);
assert.equal(q.wordDistance('a c', 'a b c d'), 2);
assert.equal(q.wordDistance('', 'a b'), 2);
assert.equal(q.wordDistance('a b', ''), 2);
assert.equal(q.editRatio('', ''), 0);
assert.equal(q.editRatio('a b c d', 'a b c d'), 0);
assert.equal(q.editRatio('a b c d', 'x y z w'), 1);
assert.equal(q.editRatio('a b c d', 'a b c e'), 0.25);
assert.equal(q.editRatio('Bonjour, Paul.', 'Bonjour, Paul'), 0.5); // la ponctuation compte

assert.equal(q.pathOf('groq', 'x'), 'llm');
assert.equal(q.pathOf('passthrough', 'skip-short'), 'saut');
assert.equal(q.pathOf('passthrough', 'fallbackClean-rejet'), 'repli');
assert.equal(q.pathOf('passthrough', 'fallbackClean'), 'repli');
assert.equal(q.pathOf('passthrough', ''), null);
assert.equal(q.pathOf('snippet', ''), null);

// agrégation
const day1 = {};
q.bump(day1, 'llm', { n: 1 });
q.bump(day1, 'llm', { n: 1 });
q.bump(day1, 'llm', { observed: 1, editSum: 0.2, wordsCorrected: 2 });
q.bump(day1, 'saut', { n: 1, reverted: 1 });
const day2 = {};
q.bump(day2, 'llm', { n: 2, observed: 1, editSum: 0.4, wordsCorrected: 4, reverted: 1 });
let m = q.mergeBuckets([day1, day2, undefined]);
assert.deepEqual(m.llm, { n: 4, observed: 2, editRatio: 0.3, revertedRate: 0.25 });
assert.deepEqual(m.saut, { n: 1, observed: 0, editRatio: null, revertedRate: 1 });
assert.deepEqual(m.repli, { n: 0, observed: 0, editRatio: null, revertedRate: null });
// ancien format : rien
m = q.mergeBuckets([undefined, {}]);
assert.equal(m.llm.n, 0);
console.log('quality : OK');

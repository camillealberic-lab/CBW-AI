// @ts-nocheck
// Tests purs : geste souris, validation des raccourcis, langues, masquage, aperçu.
//   NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/keysLogic.test.ts
import assert from 'node:assert/strict';
const k = await import('./keysLogic.ts');

// accélérateurs
assert.ok(k.validAccelerator('Control+Command+V'));
assert.ok(k.validAccelerator('Alt+Shift+F5'));
assert.ok(!k.validAccelerator('V'));
assert.ok(!k.validAccelerator('Foo+V'));
assert.ok(!k.validAccelerator('Control+'));
assert.ok(!k.validAccelerator(42));
assert.equal(k.mouseButtonOf(4), 4);
assert.equal(k.mouseButtonOf('5'), 5);
assert.equal(k.mouseButtonOf(1), 0);
assert.equal(k.mouseButtonOf(null), 0);
assert.equal(k.mouseButtonOf(4.5), 0);

// geste souris : maintien = push-to-talk ; clic bref = mains libres puis re-clic arrête
const g = new k.MouseGesture();
const ev: string[] = [];
for (const e of ['down', 'up']) g.on(e, () => ev.push(e));
g.buttonDown(0); g.buttonUp(800);
assert.deepEqual(ev, ['down', 'up']);
ev.length = 0;
g.buttonDown(1000); g.buttonUp(1100); // bref : reste actif
assert.deepEqual(ev, ['down']);
assert.ok(g.active);
g.buttonDown(5000); // 2e clic : arrête
assert.deepEqual(ev, ['down', 'up']);
g.buttonUp(5050); // relâchement ignoré
assert.ok(!g.active);
g.buttonDown(6000); g.reset(); g.buttonUp(6100);
assert.ok(!g.active);

// langues / masquage
assert.equal(k.languageOf('fr'), 'fr');
assert.equal(k.languageOf('auto'), 'auto');
assert.equal(k.languageOf('xx; rm'), null);
assert.ok(k.isHiddenAt(2000, 1000));
assert.ok(!k.isHiddenAt(1000, 1000));
assert.ok(!k.isHiddenAt('x', 1));
assert.ok(!k.isHiddenAt(0));

// aperçu
assert.equal(k.previewTail('  bonjour   le monde '), 'bonjour le monde');
const long = 'mot '.repeat(60);
const p = k.previewTail(long);
assert.ok(p.length <= k.PREVIEW_MAX && p.startsWith('…'));
assert.equal(k.previewTail(null), '');
console.log('keysLogic : OK');

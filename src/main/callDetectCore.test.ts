// @ts-nocheck
// Tests purs : anti-rebond de la détection d'appel. node --experimental-strip-types src/main/callDetectCore.test.ts
import assert from 'node:assert/strict';
import { CallDebounce, callAppName } from './callDetectCore.ts';

function rig() {
  let now = 0; const q = [];
  const timers = { set: (fn, ms) => { const t = { at: now + ms, fn, dead: false }; q.push(t); return t; }, clear: (t) => { t.dead = true; } };
  const ev = [];
  const d = new CallDebounce((i) => ev.push(['start', i]), () => ev.push(['end']), timers);
  const adv = (ms) => { now += ms; for (const t of q) if (!t.dead && t.at <= now) { t.dead = true; t.fn(); } };
  return { d, ev, adv };
}
const on = { event: 'mic-on', bundleId: 'us.zoom.xos', app: 'zoom.us' };
const off = { event: 'mic-off' };
{ // micro < 3 s : rien
  const { d, ev, adv } = rig(); d.feed(on); adv(2900); d.feed(off); adv(10000); assert.deepEqual(ev, []);
}
{ // appel confirmé à 3 s, nommé Zoom ; fin après 5 s
  const { d, ev, adv } = rig(); d.feed(on); adv(3000);
  assert.deepEqual(ev, [['start', { app: 'Zoom', bundleId: 'us.zoom.xos' }]]);
  d.feed(off); adv(4900); assert.equal(ev.length, 1); adv(100); assert.deepEqual(ev[1], ['end']);
}
{ // coupure brève < 5 s : même appel, pas de fin
  const { d, ev, adv } = rig(); d.feed(on); adv(3000); d.feed(off); adv(3000); d.feed(on); adv(20000); assert.equal(ev.length, 1);
}
{ // mic-on répétés : un seul start
  const { d, ev, adv } = rig(); d.feed(on); adv(1000); d.feed(on); adv(2000); d.feed(on); adv(5000); assert.equal(ev.length, 1);
}
{ // reset pendant un appel => call-end
  const { d, ev, adv } = rig(); d.feed(on); adv(3000); d.reset(); assert.deepEqual(ev[1], ['end']);
}
assert.equal(callAppName('com.google.Chrome.helper', 'x'), 'Chrome (Meet, Teams web…)');
assert.equal(callAppName('com.inconnue.app', 'Truc'), 'Truc');
console.log('callDetectCore ok');

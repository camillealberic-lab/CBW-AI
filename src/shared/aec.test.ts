// @ts-nocheck
import assert from 'node:assert/strict';
import { EchoCanceller } from './aec.ts';
let seed = 11;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5;
const N = 16000 * 12;
// référence : bruit coloré type parole ; écho = référence retardée de 80 ms, atténuée, + petite réverbération
const ref = new Float32Array(N);
let lp = 0;
for (let i = 0; i < N; i++) { lp = 0.9 * lp + rnd() * 0.3; ref[i] = lp * (0.5 + 0.5 * Math.sin(i / 3000)); }
const echo = new Float32Array(N);
for (let i = 0; i < N; i++) echo[i] = 0.5 * (ref[i - 1280] ?? 0) + 0.2 * (ref[i - 1700] ?? 0);
// voix proche : sinus 200 Hz sur 8–10 s
const near = new Float32Array(N);
for (let i = 8 * 16000; i < 10 * 16000; i++) near[i] = 0.2 * Math.sin((2 * Math.PI * 200 * i) / 16000);
const mic = echo.map((x, i) => x + near[i]);
const aec = new EchoCanceller();
const out = new Float32Array(N);
for (let i = 0; i < N; i += 128) out.set(aec.process(mic.subarray(i, i + 128), ref.subarray(i, i + 128)), i);
const rms = (a, s, e) => Math.sqrt(a.slice(s * 16000, e * 16000).reduce((x, y) => x + y * y, 0) / ((e - s) * 16000));
const erle = 20 * Math.log10(rms(mic, 5, 8) / rms(out, 5, 8));
assert.ok(erle > 12, `écho atténué de ${erle.toFixed(1)} dB (≥ 12)`);
// la voix proche (8–10 s) est conservée
const keep = rms(out.map((x, i) => x - near[i]), 8.2, 9.8) / rms(near, 8.2, 9.8); // erreur résiduelle (écho + dommage) relative à la voix proche
console.log("résiduel", keep.toFixed(2), "erle", erle.toFixed(1));
assert.ok(keep < 0.5, `voix proche conservée (résiduel ${keep.toFixed(2)} de son niveau)`);
// sans référence active : le micro passe tel quel
const quiet = new EchoCanceller().process(Float32Array.from([0.1, -0.2, 0.3]), Float32Array.from([0, 0, 0]));
assert.deepEqual([...quiet], [Float32Array.from([0.1, -0.2, 0.3])[0], Float32Array.from([0.1, -0.2, 0.3])[1], Float32Array.from([0.1, -0.2, 0.3])[2]]);
console.log(`aec.test.ts : OK (ERLE ${erle.toFixed(1)} dB, voix proche ${keep.toFixed(2)})`);

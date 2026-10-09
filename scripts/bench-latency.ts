// Bench de latence « relâchement → texte prêt » : ancien chemin (WAV entier après relâchement)
// vs nouveau (segments transcrits pendant la dictée, seule la fin après relâchement).
// Usage : node --experimental-strip-types scripts/bench-latency.ts a.wav [b.wav…]
// (npm run build d'abord : utilise dist/llm/router.js et vendor/bin/whisper-server)
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decodeWav, encodeWav, RATE, Segmenter, trimSilence } from '../src/shared/vad.ts';

const root = join(import.meta.dirname, '..');
const router = createRequire(import.meta.url)(join(root, 'dist/llm/router.js'));
const MODEL = join(homedir(), '.dicta-ai/models/ggml-large-v3-turbo-q5_0.bin');
const PROMPT = 'Dictée en français, avec une ponctuation correcte.';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function server(args: string[], port: number): Promise<ChildProcess> {
  const p = spawn(join(root, 'vendor/bin/whisper-server'), ['-m', MODEL, '--host', '127.0.0.1', '--port', String(port), ...args], { stdio: 'ignore' });
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return p;
    } catch {}
    await sleep(100);
  }
  throw new Error('whisper-server KO');
}

async function infer(port: number, wav: ArrayBuffer, prompt: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'a.wav');
  fd.append('response_format', 'text');
  fd.append('no_timestamps', 'true');
  fd.append('language', 'fr');
  fd.append('temperature', '0.0');
  fd.append('prompt', prompt);
  const r = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: fd });
  return (await r.text()).replace(/\s+/g, ' ').trim();
}

async function clean(raw: string): Promise<{ text: string; ms: number; provider: string }> {
  const t = performance.now();
  const c = await router.cleanTranscript(raw, { language: 'fr' });
  return { text: c.text, ms: Math.round(performance.now() - t), provider: c.provider };
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const onlyAfter = process.argv.includes('--after');
const rounds = 3;
await router.warmup?.().catch(() => {});

// — Avant : paramètres d'origine, WAV entier après relâchement
let p: ChildProcess | null = null;
process.on('exit', () => p?.kill()); // jamais de whisper-server orphelin
process.on('SIGINT', () => process.exit(1));
p = await server(['-nt', '-t', '4'], 18091);
for (const f of onlyAfter ? [] : files) {
  const pcm = decodeWav(readFileSync(f));
  await infer(18091, encodeWav(pcm.subarray(0, RATE)), PROMPT); // chauffe
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    const raw = await infer(18091, encodeWav(pcm), PROMPT);
    const w = Math.round(performance.now() - t0);
    const c = await clean(raw);
    console.log(JSON.stringify({ mode: 'avant', file: f.split('/').pop(), audioMs: Math.round((pcm.length / RATE) * 1000), whisperMs: w, cleanMs: c.ms, provider: c.provider, totalMs: w + c.ms, raw, text: c.text }));
  }
}
p.kill();
await sleep(500);

// — Après : greedy, audio_ctx adaptatif, segments + spéculation pendant la dictée, LLM spéculatif.
// On simule un relâchement RELEASE_MS après la fin de la parole (silence ajouté en fin de fichier).
const RELEASE_MS = Number(process.env.RELEASE_MS ?? 400);
const ctxFor = (_wav: ArrayBuffer) => 640; // = AUDIO_CTX (src/main/whisper.ts)
async function inferFast(port: number, wav: ArrayBuffer, prompt: string): Promise<string> {
  const fd = new FormData();
  fd.append('audio_ctx', String(ctxFor(wav)));
  fd.append('beam_size', '1');
  fd.append('best_of', '1');
  fd.append('temperature_inc', '0.0');
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'a.wav');
  fd.append('response_format', 'text');
  fd.append('no_timestamps', 'true');
  fd.append('language', 'fr');
  fd.append('temperature', '0.0');
  fd.append('prompt', prompt);
  const r = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: fd });
  return (await r.text()).replace(/\s+/g, ' ').trim();
}
const joinT = (t: string[]) => t.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
p = await server(['-nt', '-t', '4', '-bo', '1', '-bs', '1', '-nf', '-fa', '-ac', '640'], 18092);
for (const f of files) {
  const speech = decodeWav(readFileSync(f));
  const pcm = new Float32Array(speech.length + Math.round((RELEASE_MS / 1000) * RATE));
  pcm.set(speech);
  await inferFast(18092, encodeWav(pcm.subarray(0, RATE)), PROMPT);
  for (let i = 0; i < rounds; i++) {
    let queue: Promise<unknown> = Promise.resolve();
    const jobs: { start: number; end: number; commit: boolean; text: Promise<string> }[] = [];
    let llm: { raw: string; res: Promise<any> } | null = null;
    const cleanOnce = (raw: string) => {
      if (llm?.raw !== raw) llm = { raw, res: router.cleanTranscript(raw, { language: 'fr' }) };
      return llm.res;
    };
    const seg = new Segmenter((a, b, commit) => {
      const audio = trimSilence(seg.audio(a, b));
      if (!audio.length) return;
      const k = jobs.findIndex((j) => !j.commit);
      if (k >= 0) jobs.splice(k, 1);
      const ctx = jobs.filter((j) => j.commit).map((j) => j.text);
      const text = queue.then(async () => inferFast(18092, encodeWav(audio), (PROMPT + " " + joinT(await Promise.all(ctx))).slice(-250)));
      queue = text.catch(() => {});
      const job = { start: a, end: b, commit, text };
      jobs.push(job);
      text.then(async () => {
        if (jobs[jobs.length - 1] !== job) return;
        const raw = joinT(await Promise.all(jobs.map((j) => j.text)));
        cleanOnce(raw);
      });
    });
    const t0 = performance.now();
    for (let o = 0; o < pcm.length; o += 128) {
      seg.push(pcm.subarray(o, o + 128));
      const due = ((o + 128) / RATE) * 1000 - (performance.now() - t0);
      if (due > 4) await sleep(due);
    }
    const tRel = performance.now();
    const speechEnd = tRel - ((seg.length - seg.lastSpeechEnd) / RATE) * 1000;
    const committed = jobs.filter((j) => j.commit);
    const spec = jobs.find((j) => !j.commit);
    let raw: string;
    let specHit = false;
    if (spec && spec.start === seg.cut && spec.end + 320 >= seg.lastSpeechEnd) {
      raw = joinT(await Promise.all([...committed.map((j) => j.text), spec.text]));
      specHit = true;
    } else {
      const ctx = joinT(await Promise.all(committed.map((j) => j.text)));
      const tail = trimSilence(seg.audio(seg.cut));
      raw = joinT([ctx, tail.length ? await inferFast(18092, encodeWav(tail), (PROMPT + ' ' + ctx).slice(-250)) : '']);
    }
    const tW = performance.now();
    const llmHit = (llm as any)?.raw === raw;
    const c = await cleanOnce(raw);
    const tC = performance.now();
    console.log(JSON.stringify({ mode: 'après', file: f.split('/').pop(), releaseAfterSpeechMs: RELEASE_MS, commits: committed.length, specHit, llmHit, whisperAfterRelease: Math.round(tW - tRel), llmAfterWhisper: Math.round(tC - tW), releaseToText: Math.round(tC - tRel), speechEndToText: Math.round(tC - speechEnd), provider: c.provider, raw, text: c.text }));
  }
}
p.kill();
process.exit(0);

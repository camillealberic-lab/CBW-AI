// @ts-nocheck
// node --experimental-strip-types src/main/asrConfidence.test.ts
import { confidenceFromVerbose, mergeConfidence, roundConfidence } from './asrConfidence.ts';

let fails = 0;
const check = (ok: boolean, name: string) => { if (!ok) { fails++; console.error('ÉCHEC :', name); } };
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;

check(confidenceFromVerbose(undefined) === undefined, 'absent → undefined');
check(confidenceFromVerbose({}) === undefined, 'sans segments → undefined');
check(confidenceFromVerbose({ segments: [{ text: 'x' }] }) === undefined, 'segment sans avg_logprob → undefined');
const one = confidenceFromVerbose({ segments: [{ tokens: [1, 2, 3, 4], avg_logprob: -0.1, no_speech_prob: 0.02, words: [{ word: ' Bonjour', probability: 0.9 }, { word: '.', probability: 0.1 }, { word: ' ça', probability: 0.7 }] }] });
check(near(one?.avgLogProb, -0.1) && one?.tokens === 4, 'un segment');
check(near(one?.minWordProb, 0.7), 'ponctuation ignorée pour minWordProb');
const two = confidenceFromVerbose({ segments: [{ tokens: [1, 2, 3], avg_logprob: -0.1, no_speech_prob: 0.01 }, { tokens: [1], avg_logprob: -0.5, no_speech_prob: 0.3 }] });
check(near(two?.avgLogProb, (3 * -0.1 + -0.5) / 4), 'moyenne pondérée par les tokens');
check(near(two?.minSegLogProb, -0.5) && near(two?.maxNoSpeech, 0.3), 'min et max');
check(two?.minWordProb === undefined, 'pas de mots → minWordProb absent');
const m = mergeConfidence([one, two]);
check(m?.tokens === 8 && near(m?.minSegLogProb, -0.5) && m?.minWordProb === undefined, 'fusion : mots inconnus → inconnu');
check(mergeConfidence([one, undefined]) === undefined, 'fusion avec un morceau inconnu → undefined');
check(mergeConfidence([]) === undefined, 'fusion vide → undefined');
check(near(mergeConfidence([one])?.avgLogProb, -0.1), 'fusion d\'un seul morceau');
check(roundConfidence(undefined) === undefined, 'arrondi : undefined');
check(roundConfidence({ avgLogProb: -0.123456, minSegLogProb: -0.2, maxNoSpeech: 0, tokens: 3 })?.avgLogProb === -0.123, 'arrondi à 3 décimales');
if (fails) process.exit(1);
console.log('asrConfidence.test : OK');

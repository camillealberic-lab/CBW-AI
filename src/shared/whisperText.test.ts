// @ts-nocheck
import assert from 'node:assert/strict';
import { cleanWhisperOutput, collapseLoops, looksLooping } from './whisperText.ts';
const normal = [
  ['Oui oui oui, très très bien, on est d’accord là-dessus.', 4],
  ['Non non non, ce n’est pas ce que j’ai dit hier soir à la réunion.', 5],
  ["Bonjour à tous, merci d'être là. On commence par le point sur le budget du troisième trimestre, qui est un peu serré, et on enchaîne avec le recrutement du développeur.", 12],
  ['Je vous dis que je vous dis que je vous le dis, voilà.', 4],
  ["Ça va, ça va, ça va aller, t'inquiète, ça va aller.", 3],
  // parole rapide : 7 mots/s sur 2 s
  ['Donc je disais simplement que oui on peut le faire demain matin.', 2],
];
for (const [t, s] of normal) assert.equal(looksLooping(t, s), false, t);
const loops = [
  ["Merci. ".repeat(40), 6],
  ['et puis voilà et puis voilà et puis voilà et puis voilà', 5],
  ['non non non non non non', 3],
  ['la la la la la la la la', 2],
  ['x'.repeat(900), 6],
];
for (const [t, s] of loops) assert.equal(looksLooping(t, s), true, t.slice(0, 40));
assert.equal(collapseLoops('Bonjour à tous. ' + 'et puis voilà '.repeat(30) + 'fin').includes('Bonjour à tous'), true);
assert.ok(collapseLoops('et puis voilà '.repeat(30)).length < 30);
// hallucinations : seulement si TOUT le texte correspond
assert.equal(cleanWhisperOutput("Merci d'avoir regardé cette vidéo !"), '');
assert.equal(cleanWhisperOutput("Merci d'avoir regardé le devis, il est parfait."), "Merci d'avoir regardé le devis, il est parfait.");
assert.equal(cleanWhisperOutput('(musique)'), '');
console.log('whisperText.test.ts : OK');

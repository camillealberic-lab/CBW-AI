// @ts-nocheck
// Tests purs de l'extraction des noms (aucun appel externe).
//   NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/contextNames.test.ts
import assert from 'node:assert/strict';
const { domainOnly, extractNames, MAX_NAMES, whisperNamesPrompt } = await import('./contextNames.ts');

const has = (names: string[], n: string) => assert.ok(names.some((x) => x.toLowerCase() === n.toLowerCase()), `« ${n} » attendu dans ${JSON.stringify(names)}`);
const hasNot = (names: string[], n: string) => assert.ok(!names.some((x) => x.toLowerCase() === n.toLowerCase()), `« ${n} » inattendu dans ${JSON.stringify(names)}`);

let n = extractNames(['Re: Point Wispr Flow', 'Bonjour Karim, peux-tu relire le doc avec Éloïse Martin ? Merci.', 'Le Lundi, Supabase et Linear sont en retard.']);
has(n, 'Karim');
has(n, 'Éloïse Martin');
has(n, 'Supabase');
has(n, 'Wispr Flow');
hasNot(n, 'Bonjour');
hasNot(n, 'Merci');
hasNot(n, 'Lundi');
hasNot(n, 'Le');

n = extractNames(['ouvre router.ts et pnpm-lock.yaml, puis useState dans AppShell avec GPT4o @camille_b et karim.benzema@acme.com']);
has(n, 'router.ts');
has(n, 'pnpm-lock.yaml');
has(n, 'useState');
has(n, 'AppShell');
has(n, 'GPT4o');
has(n, '@camille_b');
has(n, 'Karim Benzema');
hasNot(n, 'acme.com'); // domaine de l'adresse : pas un nom

// début de phrase : un mot banal capitalisé n'est pas un nom ; plus loin, oui
n = extractNames(['Demain on déjeune avec Pierre.']);
hasNot(n, 'Demain');
has(n, 'Pierre');

// bornes et dédoublonnage
const many = Array.from({ length: 200 }, (_, i) => `voir Projet${String.fromCharCode(65 + (i % 26))}${i} `).join('');
n = extractNames([many]);
assert.ok(n.length <= MAX_NAMES);
assert.equal(new Set(n.map((x) => x.toLowerCase())).size, n.length);
assert.ok(n.every((x) => x.length <= 60));
n = extractNames(['avec Karim et Karim et karim.', 'Karim']);
assert.equal(n.filter((x) => x.toLowerCase() === 'karim').length, 1);

// ordre : fréquent/proche du curseur d'abord
n = extractNames(['', 'avec Zoé, puis Zoé, et Zoé', 'a Yann b']);
assert.equal(n[0], 'Zoé');

// vide / bruit
assert.deepEqual(extractNames([undefined, '', '   ']), []);
assert.deepEqual(extractNames(['1234 5678 !!! ???']), []);

// domaine seul
assert.equal(domainOnly('https://www.linear.app/team/ABC-12?x=1'), 'linear.app');
assert.equal(domainOnly('linear.app'), 'linear.app');
assert.equal(domainOnly('pas une url ::'), undefined);
assert.equal(domainOnly(undefined), undefined);

// prompt Whisper : vocabulaire d'abord, dédoublonné, borné
assert.equal(whisperNamesPrompt(['Supabase', 'CBW AI'], ['supabase', 'Karim'], 'fr'), 'Supabase, CBW AI, Karim.');
assert.equal(whisperNamesPrompt([], [], 'fr'), '');
const long = whisperNamesPrompt(Array.from({ length: 300 }, (_, i) => 'Terme' + i), [], 'fr');
assert.ok(long.length <= 470, String(long.length));

console.log('contextNames : OK');

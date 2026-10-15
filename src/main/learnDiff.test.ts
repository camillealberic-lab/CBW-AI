// @ts-nocheck
// Tests purs du diff de corrections.
//   NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/learnDiff.test.ts
import assert from 'node:assert/strict';
const { findReplacements } = await import('./learnDiff.ts');

const ins = 'On a branché cloud sur le projet et super base gère la base de données.';
// l'utilisateur corrige « cloud » → « Claude » et « super base » → « Supabase », puis écrit la suite
let r = findReplacements(ins, 'Salut. On a branché Claude sur le projet et Supabase gère la base de données. Et ensuite on verra.');
assert.deepEqual(r, [
  { before: 'cloud', after: 'Claude' },
  { before: 'super base', after: 'Supabase' },
]);

// aucune modification
assert.deepEqual(findReplacements(ins, 'rien avant ' + ins + ' rien après'), []);
// texte collé introuvable (autre champ)
assert.deepEqual(findReplacements(ins, 'Un tout autre texte qui parle de cuisine et de vacances en Bretagne cet été.'), []);
// trop modifié
assert.deepEqual(findReplacements(ins, 'On a tout réécrit autrement : le projet marche, et la base aussi.'), []);
// ajout de mots seulement : pas de remplacement
assert.deepEqual(findReplacements(ins, 'On a vraiment branché cloud sur le projet et super base gère la base de données.'), []);
// ponctuation autour du mot corrigé
r = findReplacements('Envoie ça à karim demain matin avant midi.', 'Envoie ça à Karim, demain matin avant midi.');
assert.deepEqual(r, []); // simple casse : norm() identique → pas un remplacement
r = findReplacements('Envoie ça à carime demain matin avant midi.', 'Envoie ça à Karim, demain matin avant midi.');
assert.deepEqual(r, [{ before: 'carime', after: 'Karim' }]);
// mot de début modifié : l'ancre se fait sur une autre fenêtre de 3 mots
r = findReplacements('Cloud est lancé ce matin sur le serveur principal de production.', 'Claude est lancé ce matin sur le serveur principal de production.');
assert.deepEqual(r, [{ before: 'Cloud', after: 'Claude' }]);
// vide
assert.deepEqual(findReplacements('', 'abc'), []);
assert.deepEqual(findReplacements('a b c d', ''), []);

console.log('learnDiff : OK');

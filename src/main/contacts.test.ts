// @ts-nocheck
import assert from 'node:assert/strict';
import { cleanNames, mergeVocabulary } from './contacts.ts';
const n = cleanNames(['Karim Benzema', 'karim benzema', 'Éloïse', 'a', 'x@y.fr', '06 12 34', "O'Brien", 'Jean-Pierre Martin', 'A B C D E', 42]);
assert.deepEqual(n, ['Karim Benzema', 'Éloïse', "O'Brien", 'Jean-Pierre Martin']);
const m = mergeVocabulary(['karim benzema', 'CBW'], n, 5);
assert.deepEqual(m.list, ['karim benzema', 'CBW', 'Éloïse', "O'Brien", 'Jean-Pierre Martin']);
assert.equal(m.added, 3);
assert.equal(mergeVocabulary(['a'], ['Bob', 'Cat'], 2).added, 1);
console.log('contacts: ok');

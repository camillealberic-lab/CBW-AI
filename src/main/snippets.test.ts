// @ts-nocheck
import assert from 'node:assert/strict';
import { applyReplacementRules, matchSnippet, parseReplacements, parseSnippets } from './snippets.ts';

const sn = parseSnippets(JSON.stringify([{ trigger: 'Ma signature', text: 'Cordialement,\nCamille' }, { trigger: 'mon lien agenda', text: 'https://cal.example/camille' }]));
assert.equal(sn.length, 2);
assert.equal(matchSnippet('Ma signature.', sn), 'Cordialement,\nCamille');
assert.equal(matchSnippet('ma signature', sn, true), 'Cordialement,\nCamille');
assert.equal(matchSnippet('Ma signature. Merci d’avance', sn), 'Cordialement,\nCamille Merci d’avance');
assert.equal(matchSnippet('Ma signature. Merci', sn, true), null);
assert.equal(matchSnippet('voici ma signature', sn), null);
assert.equal(matchSnippet('ma signatures', sn), null);
const r = parseReplacements(['asian => agent', 'bad', 'x=>x']);
assert.equal(r.length, 1);
assert.equal(applyReplacementRules("L'Asian est là, asiane non. ASIAN.", r), "L'agent est là, asiane non. agent.");
console.log('snippets: ok');

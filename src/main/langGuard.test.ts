// @ts-nocheck
import assert from 'node:assert/strict';
import { guessLang, wrongLanguage } from './langGuard.ts';
assert.equal(guessLang("Bon, du coup on reprend le support mural et on le met à gauche de la porte.").lang, 'fr');
assert.equal(guessLang("So we take the wall mount again and we put it on the left of the door, okay?").lang, 'en');
assert.equal(wrongLanguage("I think we should ship the update before the meeting, can you check the build?", 'fr'), true);
assert.equal(wrongLanguage("Est-ce que tu peux vérifier le pull request sur GitHub et me dire si le build passe ?", 'fr'), false);
assert.equal(wrongLanguage("Ok merci.", 'fr'), false); // trop court : jamais refusé
assert.equal(wrongLanguage("Claude Code, GitHub, Vercel.", 'fr'), false); // noms propres seuls
assert.equal(wrongLanguage("The meeting is at noon.", 'auto'), false);
assert.equal(wrongLanguage("Le déploiement du build sur Vercel a échoué à cause du cache de la CI.", 'fr'), false);
console.log('langGuard ok');

// @ts-nocheck
// Tests purs : analyse des retouches (learnDiff.analyzeCorrection), préférences apprises (prefs.ts), rapport (learnReport.ts).
//   NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/prefs.test.ts
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// imports sans extension (style du projet, résolus par esbuild) → .ts pour node
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx);
      throw e;
    }
  },
});
const { analyzeCorrection, countAtSentenceEnd, countInline, countPhrase } = await import('./learnDiff.ts');
const P = await import('./prefs.ts');
const { buildReport } = await import('./learnReport.ts');

const kinds = (a) => a.edits.map((e) => e.key);

// ── analyse ──
let a = analyzeCorrection('On se voit demain pour le point, voilà.', 'On se voit demain pour le point.');
assert.deepEqual(kinds(a), ['delete-end:voilà']);
assert.equal(a.final, 'On se voit demain pour le point.');

a = analyzeCorrection('Bonjour Marie, je te confirme le rendez-vous de jeudi. Cordialement, Camille', 'Salut.\nBonjour Marie,\nje te confirme le rendez-vous de jeudi.\nCordialement, Camille');
assert.deepEqual(kinds(a), ['newline:je', 'newline:cordialement']);
assert.equal(a.final, 'Bonjour Marie,\nje te confirme le rendez-vous de jeudi.\nCordialement, Camille');

// réinsertion : « en fait » était dans le brut, l'IA l'a retiré, la personne le remet
a = analyzeCorrection('Le projet est prêt pour la démo de lundi.', 'Le projet est en fait prêt pour la démo de lundi.', 'euh le projet est en fait prêt pour la démo de lundi');
assert.deepEqual(kinds(a), ['reinsert:en fait']);
a = analyzeCorrection('Le projet est prêt pour la démo de lundi.', 'Le projet est vraiment prêt pour la démo de lundi.', 'le projet est prêt pour la démo de lundi');
assert.deepEqual(kinds(a), ['insert:vraiment']);
// remplacement + ponctuation
a = analyzeCorrection('On a branché cloud sur le projet hier soir !', 'On a branché Claude sur le projet hier soir.');
assert.deepEqual(kinds(a), ['replace:cloud=>Claude', 'punct:!=>.']);
// suite tapée après : ignorée ; texte avant dans le champ : ignoré
a = analyzeCorrection('Je passe au bureau vers dix heures.', 'Note : Je passe au bureau vers dix heures. Et toi ?');
assert.deepEqual(kinds(a), []);
assert.equal(a.final, 'Je passe au bureau vers dix heures.');
// reformulation longue
a = analyzeCorrection('Pour la réunion de demain il faudrait que nous puissions éventuellement regarder le budget avec toute l\'équipe du projet.', 'Pour la réunion de demain on doit absolument revoir ensemble le budget avec toute l\'équipe du projet.');
assert.deepEqual(kinds(a), ['rephrase']);
// introuvable
assert.equal(analyzeCorrection('Le chat dort sur le canapé du salon.', 'Rien à voir, une autre conversation complètement différente ici.'), null);

assert.equal(countAtSentenceEnd('Bon, voilà. Voilà le plan. Et voilà', 'voilà'), 2);
assert.equal(countPhrase('En fait, je pense en fait que', 'en fait'), 2);
assert.equal(countInline('Bonjour.\nCordialement', 'cordialement'), 0);
assert.equal(countInline('Bonjour. Cordialement', 'cordialement'), 1);

// ── application déterministe ──
assert.equal(P.removeAtSentenceEnd('On se voit demain, voilà.', 'voilà'), 'On se voit demain.');
assert.equal(P.removeAtSentenceEnd("C'est bon. Voilà. On continue, voilà", 'voilà'), "C'est bon. On continue");
assert.equal(P.removeAtSentenceEnd('Voilà le plan, voilà quoi.', 'voilà quoi'), 'Voilà le plan.');
assert.equal(P.removeAtSentenceEnd('Voilà le plan.', 'voilà'), 'Voilà le plan.');
assert.equal(P.removeAtSentenceEnd('Ça marche voilà\nSuite', 'voilà'), 'Ça marche\nSuite');
assert.equal(P.removeAtSentenceEnd('Voilà. Suite', 'voilà'), 'Suite');
assert.equal(P.removeAtSentenceEnd('Tu es là, voilà ?', 'voilà'), 'Tu es là, voilà ?'); // question : on n'y touche pas
assert.equal(P.replaceExact('Cloud et cloudflare, cloud.', 'cloud', 'Claude'), 'Claude et cloudflare, Claude.');
assert.equal(P.applyLearnedPreferences('Ok, voilà.', [{ kind: 'delete-end', rule: 'voilà', active: true }, { kind: 'newline', rule: 'ok', active: true }]), 'Ok.');
assert.equal(P.applyLearnedPreferences('Ok, voilà.', [{ kind: 'delete-end', rule: 'voilà', active: false }]), 'Ok, voilà.');

// ── dérivation ──
const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 1);
const mk = (i, rendered, field, raw = '') => {
  const an = analyzeCorrection(rendered, field, raw);
  return { at: t0 + i * 3600_000, raw, rendered, final: an.edits.length ? an.final : '', edits: an.edits };
};
const voila = (i) => mk(i, `Je t'envoie le dossier numéro ${i} ce soir, voilà.`, `Je t'envoie le dossier numéro ${i} ce soir.`);
let obs = [1, 2, 3, 4].map(voila);
let r = P.derivePrefs(obs, P.emptyState(t0), t0 + DAY);
assert.equal(r.created.length, 0, '4 fois : pas encore');
obs.push(voila(5));
r = P.derivePrefs(obs, P.emptyState(t0), t0 + DAY);
assert.equal(r.created.length, 1);
assert.equal(r.created[0].kind, 'delete-end');
assert.equal(r.created[0].rule, 'voilà');
P.setCurrentPrefs(r.state.prefs);
assert.deepEqual(P.activePreferences(), [{ kind: 'delete-end', rule: 'voilà', text: 'Retirer « voilà » en fin de phrase' }]);
assert.equal(P.applyLearnedPreferences('Parfait, voilà.'), 'Parfait.');
// contre-exemple : une fois gardé → pas de préférence
const kept = mk(6, 'On en reparle lundi matin au bureau, voilà.', 'On en reparle lundi matin au bureau, voilà.');
assert.equal(P.derivePrefs([...obs, kept], P.emptyState(t0), t0 + DAY).created.length, 0);
// supprimée : jamais recréée
const st2 = { ...r.state, prefs: [], rejected: [r.created[0].key] };
assert.equal(P.derivePrefs(obs, st2, t0 + DAY).created.length, 0);
// contredite 2 fois après création → désactivée seule
const re1 = mk(30, "C'est envoyé au client ce soir. Je te tiens au courant.", "C'est envoyé au client ce soir, voilà. Je te tiens au courant.");
const re2 = mk(31, 'Le devis part demain matin. On en reparle après.', 'Le devis part demain matin, voilà. On en reparle après.');
assert.deepEqual(kinds({ edits: re1.edits }), ['insert:voilà']);
re1.at = re2.at = t0 + 2 * DAY;
const r3 = P.derivePrefs([...obs, re1, re2], r.state, t0 + 3 * DAY);
assert.equal(r3.state.prefs[0].active, false);
assert.equal(r3.state.prefs[0].reason, 'contredite');

// retour à la ligne avant « Cordialement » : non déterministe, exposé au prompt
const cord = (i) => mk(i, `Merci pour ton retour sur le point ${i}. Cordialement, Camille`, `Merci pour ton retour sur le point ${i}.\nCordialement, Camille`);
const rc = P.derivePrefs([1, 2, 3, 4, 5].map(cord), P.emptyState(t0), t0 + DAY);
assert.deepEqual(rc.created.map((p) => [p.kind, p.rule]), [['newline', 'cordialement']]);
assert.equal(P.prefText('newline', rc.created[0].display), 'Aller à la ligne avant « Cordialement »');
assert.equal(P.applyLearnedPreferences('Merci. Cordialement', rc.state.prefs), 'Merci. Cordialement');

// ── rapport ──
const rep = buildReport([...obs, kept, ...[1, 2].map(cord)], r.state, t0 + 2 * DAY);
assert.match(rep.markdown, /# Analyse de tes corrections/);
assert.match(rep.markdown, /Suppressions en fin de phrase/);
assert.match(rep.markdown, /Retirer « voilà » en fin de phrase — active/);
assert.match(rep.markdown, /Pistes pour le prompt/);
assert.equal(rep.summary.observations, 8);
assert.equal(rep.summary.modified, 7);
console.log('prefs / analyse / rapport : OK');

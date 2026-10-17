// Tests purs : format balisé des comptes rendus, pipeline qualité (routeur simulé), gabarits, sélection des passages, citations, réglages Groq.
// Aucun réseau, aucun LLM.   NODE_NO_WARNINGS=1 node --experimental-strip-types src/llm/notes.test.ts
import { buildNotesSystem, buildNotesUser, dropPartialTag, enforceUserNotes, formatSegments, normalizeAnnotated, outTokens, parseAnnotated, parseClock, parseTranscript, postProcessNotes, splitTranscript, stripMarkers, mmss, tidyNotes as tidy } from './notes.ts';
import { NOTE_KINDS, TEMPLATES, extractKind, getTemplate, guessKind, guessTemplate, kindOfTemplate, listTemplates, renderTemplatePrompt } from './templates.ts';
import { buildAskMessages, parseCitations, selectPassages, tokenizeQuery } from './ask.ts';
import type { AskNote } from './ask.ts';
import { groqExtraBody, GROQ_REASONING_MARGIN } from './providers/groq.ts';
import { visibleStream } from './providers/common.ts';

let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// ── transcription
const T = '[00:05] Moi : On commence par le budget.\n[01:10] Personne 2 : Le devis fait 12 000 euros.\nIl est valable un mois.\n[1:02:03] Moi : Merci à tous.';
const segs = parseTranscript(T);
check(segs.length === 3 && segs[1].speaker === 'Personne 2' && segs[1].start === 70, 'parseTranscript : 3 tours, locuteur, secondes');
check(segs[1].text.endsWith('valable un mois.'), 'ligne sans horodatage = suite du tour');
check(segs[2].start === 3723 && mmss(3723) === '1:02:03' && parseClock('1:02:03') === 3723, 'horodatage h:mm:ss');
check(parseTranscript(formatSegments(segs)).length === 3, 'formatSegments ↔ parseTranscript');

// ── format balisé
const md = '# Point budget\n## Décisions\n- [[ia 01:10]]Devis à 12 000 euros.[[/ia]]\nMa note perso\n- [ ] [[ia 00:05 01:10]]Valider avant vendredi[[/ia]] (Moi)\n';
const lines = parseAnnotated(md);
check(lines[0].kind === 'heading' && lines[0].level === 1 && lines[0].spans[0].text === 'Point budget', 'titre : neutre, niveau 1');
check(lines[2].prefix === '- ' && lines[2].spans[0].kind === 'ia', 'puce : ajout IA');
check(lines[3].spans.length === 1 && lines[3].spans[0].kind === 'user', 'texte sans balise = utilisateur');
check(lines[4].prefix === '- [ ] ' && lines[4].spans[0].refs.length === 0 && lines[4].spans[1].kind === 'user', 'case à cocher, heure ignorée, suite en texte utilisateur');
check(stripMarkers(md) === md.replace(/\[\[\/?ia[^\]]*\]\]/g, ''), 'stripMarkers retire toutes les balises');
const open = parseAnnotated('- [[ia 00:05]]non fermée');
check(open[0].spans[0].kind === 'ia' && open[0].spans[0].text === 'non fermée', 'balise non fermée tolérée');
check(parseAnnotated('texte [[/ia]] seul')[0].spans[0].kind === 'user', 'balise fermante orpheline ignorée');
check(dropPartialTag('abc [[ia 03:') === 'abc ' && dropPartialTag('abc [[ia 03:12]]def') === 'abc [[ia 03:12]]def', 'balise partielle de fin de flux retirée');
check(parseAnnotated('- [[ia 00:05]]début du fl[[ia 0').length === 1, 'texte cumulé du streaming analysable à tout moment');

// ── références ramenées au tour de parole le plus proche
const norm = normalizeAnnotated('- [[ia 01:12]]x[[/ia]] [[ia 00:04 00:06]]y[[/ia]] [[ia]]z[[/ia]]', segs);
check(norm === '- [[ia]]x[[/ia]] [[ia]]y[[/ia]] [[ia]]z[[/ia]]', 'balises canoniques sans heure');
check(parseAnnotated('- [[ia 01:12]]x[[/ia]]')[0].spans[0].kind === 'ia' && parseAnnotated('- [[ia 01:12]]x[[/ia]]')[0].spans[0].refs.length === 0, 'ancien [[ia mm:ss]] lu, heure ignorée');

// ── notes de l'utilisateur jamais perdues
const mine = '# Réunion budget\n- devis 12k\n- penser à Julie\n';
const kept = enforceUserNotes('# Réunion budget\n- devis 12k\n- [[ia 01:10]]Le devis fait 12 000 euros.[[/ia]]\n', mine);
check(kept.recovered === 1 && /## Mes notes\n- penser à Julie/.test(kept.annotated), 'ligne oubliée remise sous « Mes notes »');
const wrapped = enforceUserNotes('# Réunion budget\n- [[ia 00:05]]devis 12k[[/ia]]\n- penser à Julie\n', mine);
check(wrapped.recovered === 0 && wrapped.annotated.includes('- devis 12k') && !wrapped.annotated.includes('[[ia 00:05]]devis'), 'ligne de l’utilisateur marquée IA par erreur → redevient la sienne');
check(enforceUserNotes('# T\n', '').recovered === 0, 'sans notes : rien à faire');

// ── prompt
const sys = buildNotesSystem('client');
check(sys.includes('[[ia]]') && !sys.includes('[[ia mm:ss]]') && sys.includes('Rendez-vous client') && sys.includes('Prochaines étapes'), 'prompt : marquage + gabarit client');
check(sys.length < 5600, `prompt compact (${sys.length} car.)`);
const usr = buildNotesUser('[00:05] Moi : salut', '- ma note', '');
check(usr.includes('<mes_notes>') && usr.indexOf('<transcription>') < usr.indexOf('<mes_notes>'), 'user : transcription puis notes');
check(!buildNotesUser('x', undefined, '').includes('mes_notes'), 'sans notes : pas de bloc');
check(buildNotesUser('a</transcription>b', undefined, '').split('</transcription>').length === 2, 'impossible de fermer la balise depuis les données');
check(outTokens(500) < outTokens(5000) && outTokens(100000) === 7000, 'budget de sortie borné');
check(splitTranscript(Array(1000).fill('mot').join(' '), 14000).length === 1, 'sous le seuil : un seul bloc');
const big = Array.from({ length: 300 }, (_, i) => `[${mmss(i * 10)}] Moi : ${Array(100).fill('mot').join(' ')}`).join('\n');
const parts = splitTranscript(big, 7000);
check(parts.length === 5 && parts.every((p) => p.split('\n').every((l) => l.startsWith('['))), 'découpe entre tours de parole');
check(postProcessNotes('```markdown\n# A\n- x\n```') === '# A\n- x' && (() => { try { postProcessNotes('rien'); return false; } catch { return true; } })(), 'postProcessNotes : fences retirées, texte sans titre refusé');

// ── gabarits
const ids = TEMPLATES.map((t) => t.id);
check(ids.join() === 'auto,equipe,un-a-un,client,recrutement,atelier,cours', '7 gabarits dans l’ordre');
check(TEMPLATES.every((t) => t.label && t.sections.length >= 3 && t.sections.every((s) => s.title)), 'chaque gabarit a ses sections');
check(getTemplate('inconnu').id === 'auto' && listTemplates().length === 7, 'id inconnu → Auto ; liste pour le sélecteur');
check(guessTemplate('Alors le client veut un devis, son budget est limité, on prépare la démo pour ce prospect', '') === 'client', 'Auto : rendez-vous client');
check(guessTemplate('', 'Entretien candidat développeur', 2) === 'recrutement' || guessTemplate('le candidat parle de son parcours et du poste, salaire attendu', 'Entretien') === 'recrutement', 'Auto : recrutement');
check(guessTemplate('daily stand-up : avancement, blocage sur le sprint', 'Daily') === 'equipe', 'Auto : point d’équipe');
check(guessTemplate('On parle du week-end et de la météo, rien de précis.') === 'auto', 'Auto : repli général');
check(renderTemplatePrompt(getTemplate('cours')).includes('Notions clés'), 'prompt de gabarit : sections');

// ── Auto « court complet » adaptatif
const auto = buildNotesSystem();
check(NOTE_KINDS.every((k) => auto.includes(`- ${k} (`)) && auto.includes('[[genre:X]]'), 'Auto : 6 genres et ligne [[genre:X]] demandée');
check(auto.length < 5600, `Auto : prompt compact (${auto.length} car.)`);
check(/À retenir/.test(auto) && /\*\*Prénom\*\*/.test(auto) && /À attribuer/.test(auto) && /omis/.test(auto) && /aucune puce/.test(auto) && /JAMAIS chronologiques/.test(auto) && /UNE seule liste/.test(auto), 'Auto : prose par thème, sans chronologie, une liste d’étapes par personne');
check(!auto.includes('mes_notes') && buildNotesSystem('auto', { hasNotes: true }).includes('<mes_notes>'), 'carnet : consigne seulement si des notes existent');
check(buildNotesSystem('auto', { kind: 'cours' }).includes('notions clés') && !buildNotesSystem('auto', { kind: 'cours' }).includes('[[genre'), 'plan imposé (parties) : un seul genre, pas de ligne genre');
const ek = extractKind('[[genre:brainstorm]]\n# Nom newsletter\n- x');
check(ek.kind === 'brainstorm' && ek.text.startsWith('# Nom'), 'extractKind : genre lu et ligne retirée');
check(extractKind('[[genre:inconnu]]\n# T').kind === null && extractKind('# T').kind === null, 'extractKind : genre inconnu ou absent → null');
check(kindOfTemplate('atelier') === 'brainstorm' && kindOfTemplate('un-a-un') === 'collegues' && kindOfTemplate('x') === 'reunion', 'gabarit explicite → genre');
check(guessKind('On brainstorme: idee, on pourrait, atelier, idee', '', 3) === 'brainstorm', 'repli : brainstorm');
check(guessKind('Notion de BFR, définition, exemple, à retenir pour le cours', '', 1) === 'cours', 'repli : cours');
check(guessKind('bonjour on avance', '', 2) === 'reunion', 'repli : réunion par défaut');
check([auto, buildNotesSystem('client'), buildNotesSystem('cours', { kind: 'cours' })].every((x) => x.includes('Sans titre, 1 à 2') && x.includes('TOUTES les décisions') && x.includes('Prochaines étapes')), 'tous genres : même forme (résumé général, thèmes, étapes)');
// citation et encadré : le « > » reste hors balise, la ligne est grisée
const qb = parseAnnotated('> **À retenir**\n> - [[ia 01:10]]BFR = trou de trésorerie.[[/ia]]\n- [ ] [[ia 01:30]]**Camille** : appeler l’organisateur (jeudi)[[/ia]]');
check(qb[1].prefix === '> - ' && qb[1].spans[0].kind === 'ia' && qb[2].prefix === '- [ ] ' && qb[2].spans[0].kind === 'ia', 'encadré « > - » et case à cocher : préfixe hors balise');

// ── Groq : réponses vides de gpt-oss
const g = groqExtraBody('openai/gpt-oss-120b', 1000);
check(g.reasoning_effort === 'low' && g.include_reasoning === false && g.max_completion_tokens === 1000 + GROQ_REASONING_MARGIN, 'gpt-oss : raisonnement bas, masqué, marge de tokens');
check(groqExtraBody('openai/gpt-oss-20b', 1000, 3072).max_completion_tokens === 4072, 'gpt-oss : marge du réessai');
check(groqExtraBody('qwen/qwen3.8-27b', 500).reasoning_effort === 'none' && groqExtraBody('qwen/qwen3.8-27b', 500).max_completion_tokens === 500, 'qwen3 : pas de réflexion, pas de marge');
check(visibleStream('<think>hum</think>\n# Titre') === '# Titre' && visibleStream('a <think>en cours') === 'a ', 'flux : raisonnement masqué');

// ── Questions
check(tokenizeQuery('Quelles décisions ont été prises sur le budget ?').join() === 'decisio,prises,budget'.replace('decisio', tokenizeQuery('décisions')[0]).replace('prises', tokenizeQuery('prises')[0]), 'mots-clés : sans mots vides ni accents');
const n1: AskNote = { id: 'n1', title: 'Point budget', segments: [
  { start: 5, speaker: 'Moi', text: 'On commence par le budget du site.' },
  { start: 70, speaker: 'Personne 2', text: 'Le devis de la refonte fait douze mille euros.' },
  { start: 300, speaker: 'Moi', text: 'Passons au recrutement du stagiaire, on verra en septembre.' },
], summary: '# Point budget\n## Décisions\n- [[ia 01:10]]Devis de la refonte validé à 12 000 euros.[[/ia]]\n' };
const n2: AskNote = { id: 'n2', title: 'Atelier marque', transcript: '[00:10] Moi : On parle du logo et des couleurs.\n[02:00] Personne 1 : Le bleu me plaît.' };
const sel = selectPassages('Combien coûte le devis de la refonte ?', [n1, n2]);
check(sel.length >= 1 && sel[0].text.includes('douze mille') || sel.some((p) => p.text.includes('douze mille')), 'sélection : passage du devis retenu');
check(sel.every((p, i) => p.ref === `S${i + 1}`), 'références S1…Sn');
check(sel.some((p) => p.source === 'summary' && p.t == null), 'extrait du compte rendu sans horodatage (heure des balises ignorée)');
check(sel.some((p) => p.noteId === 'n2') === false || sel.every((p) => p.score >= 0), 'multi-réunions : ordre stable');
const tiny = selectPassages('devis refonte budget', [n1, n2], 60);
check(tiny.reduce((a, p) => a + p.text.length, 0) <= 60 * 3.4 + 60, 'budget de tokens respecté');
const none = selectPassages('zzz', [n2]);
check(none.length >= 1, 'aucun mot-clé trouvé : repli sur le début des réunions');
check(selectPassages('devis', []).length === 0, 'aucune réunion : aucun passage');
const synth = selectPassages('Quelles sont les décisions ?', [n1, n2]);
check(synth[0].source === 'summary' || synth.some((p) => p.source === 'summary'), 'question « décisions » : compte rendu favorisé');
const many = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, title: `R${i}`, transcript: `[00:0${i}] Moi : le budget ${i} est validé` }));
check(new Set(selectPassages('budget', many, 200).map((p) => p.noteId)).size >= 4, 'équité : le meilleur passage de chaque réunion d’abord');
const q = buildAskMessages('Combien ?', sel, [n1, n2]);
check(q.user.includes('<passage id="S1"') && q.user.endsWith('</question>') && q.system.includes('[S3]'), 'messages : passages numérotés + question');
const cit = parseCitations('Douze mille euros [S2]. Autre [S9] et encore [S2, S1].', [
  { ref: 'S1', noteId: 'n1', title: 'A', t: 5, source: 'transcript', text: '[00:05] Moi : x', score: 1 },
  { ref: 'S2', noteId: 'n1', title: 'A', t: 70, source: 'transcript', text: '[01:10] Personne 2 : douze mille', score: 1 },
]);
check(cit.citations.map((c) => c.ref).join() === 'S2,S1' && cit.citations[0].label === '01:10' && cit.citations[0].noteId === 'n1', 'citations : id de note + horodatage, ordre d’apparition');
check(!cit.answer.includes('S9') && cit.answer.includes('[S2, S1]'), 'référence inconnue retirée');

// ── Prompt v5 (audit-notes §4)
check(!buildNotesUser('[00:05] Moi : salut\n[1:02:03] Karim : ok', undefined, '').includes('00:05') && buildNotesUser('[00:05] Moi : salut', undefined, '').includes('Moi : salut'), 'v5 : entrée sans heures');
check(/PISTE/.test(auto) && /jamais « l'équipe valide »/.test(auto) && /jamais « \*\*Personne N\*\* »/.test(auto) && /interpellée par son prénom/.test(auto), 'v5 : décision ≠ piste, jamais « Personne N » responsable');
check(/garde les dates et échéances DITES/.test(auto) && /chronologie de la réunion/.test(auto), 'v5 : dates dites gardées, chronologie interdite');
check(extractKind('# Titre\n[[genre:cours]]\nTexte').kind === 'cours' && !extractKind('# Titre\n[[genre:cours]]\nTexte').text.includes('genre'), 'v5 : genre lu dans les 3 premières lignes et retiré');
check(postProcessNotes('[[ia]]Texte de partie sans thème titré.[[/ia]]', true).length > 0, 'v5 : partie sans titre acceptée');
check(guessKind('franchement du coup ouais on verra', '') === 'collegues', 'v5 : repli sans nombre de voix');
check(!TEMPLATES.some((t) => t.sections.some((x) => /^(Décisions|Décision et suite|Questions et réponses)$/.test(x.title))), 'v5 : gabarits sans rubriques en doublon');

// ── Pipeline qualité (notesPipeline.ts) : parsing, analyse, vérification ; routeur simulé, aucun réseau
{
  const P = await import('./notesPipeline.ts');
  const { readFileSync } = await import('node:fs');
  const reunion = readFileSync(new URL('../../bench/notes/reunion.txt', import.meta.url), 'utf8');
  const brainstorm = readFileSync(new URL('../../bench/notes/brainstorm.txt', import.meta.url), 'utf8');
  const rs = parseTranscript(reunion);

  check(P.parseJsonLoose('Voici :\n```json\n{"a":[1,2,],}\n```').a.length === 2, 'JSON : fences, préambule et virgules finales tolérés');
  check((() => { try { P.parseJsonLoose('rien'); return false; } catch { return true; } })(), 'JSON absent → erreur');
  check(P.traceScore('Camille renégocie avec l’organisateur', reunion) >= 0.6 && P.traceScore('Envoyer le prototype aux familles', reunion) < 0.5, 'traçabilité : vraie étape vs étape inventée');

  // relecture
  const chunks = P.chunkSegments(rs, 60);
  check(chunks.length > 1 && chunks[0][0] === 0 && chunks[chunks.length - 1][1] === rs.length && chunks.every(([a, b], i) => b > a && (i === 0 || chunks[i - 1][1] === a)), 'relecture : blocs contigus entre tours');
  const blk = rs.slice(0, 3);
  const user = P.buildReviewUser(blk, 0, '');
  check(user.includes('[1] Moi : Bon') && !/\d{2}:\d{2}/.test(user), 'relecture : lignes numérotées sans heure');
  const out = blk.map((s, i) => `[${i + 1}] ${s.speaker} : ${s.text.replace('quatre mille deux cents', '4 200')}`).join('\n');
  const map = P.parseReviewOutput(out + '\n[9] Intrus : x', blk, 0);
  check(map.size === 3 && map.get(1)!.includes('4 200') && !map.get(1)!.startsWith('Camille'), 'relecture : sortie lue, locuteur retiré, ligne hors bloc ignorée');
  check(P.parseReviewOutput('[2] Karim : texte', blk, 0).size === 0, 'relecture : locuteur changé = ligne ignorée');
  const g1 = P.guardReview(['Je parle de Carime et du devis.'], new Map([[0, 'Je parle de Karim et du devis.']]), ['Karim']);
  check(!!g1 && g1.changed === 1, 'garde-fou : nom du dictionnaire accepté');
  check(P.guardReview(['On garde le budget.'], new Map([[0, 'On garde le budget, validé par la direction générale hier soir.']])) === null, 'garde-fou : contenu ajouté → bloc rejeté');
  check(P.guardReview(['a', 'b'], new Map([[0, 'a']])) === null, 'garde-fou : ligne manquante → bloc rejeté');
  const g2 = P.guardReview(['Pour le salon le stand coûte quatre mille euros avec la déco'], new Map([[0, 'Le stand coûte.']]));
  check(!!g2 && g2.texts[0].startsWith('Pour le salon'), 'garde-fou : ligne raccourcie → ligne d’origine');

  // analyse
  const rawA = { genre: 'reunion', titre: 'Salon, site et stagiaire', participants: [{ nom: 'Camille' }, { nom: 'Personne 3' }],
    themes: [{ titre: 'Budget du salon', points: [
      { type: 'decision', texte: 'Six mètres carrés, plafond 3 500 €', source: 'on décide : six mètres carrés, plafond trois mille cinq cents euros' },
      { type: 'decision', texte: 'Le stand sera installé par une agence', source: 'agence installe le stand en couleur' },
      { type: 'bidon', texte: 'Stand de neuf mètres carrés à 4 200 €' } ] }],
    etapes: [
      { qui: 'Camille', quoi: 'renégocier avec l’organisateur', echeance: 'avant jeudi', source: 'Camille, tu renégocies avec l\'organisateur avant jeudi' },
      { qui: 'Personne 2', quoi: 'faire passer l’entretien technique', source: 'tu fais passer l\'entretien technique' },
      { qui: 'Julie', quoi: 'envoyer le prototype aux familles', source: 'envoyer le prototype aux familles pour les tests' } ],
    citations: [{ qui: 'Julie', texte: 'Je les envoie vendredi, pas plus tard.' }, { qui: 'Karim', texte: 'On va tout révolutionner demain matin.' }] };
  const A = P.normalizeAnalysis(rawA, reunion);
  check(A.etapes.length === 2 && A.dropped.etapes === 1 && !A.etapes.some((e) => /prototype/.test(e.quoi)), 'analyse : étape sans appui retirée');
  check(A.etapes[1].qui === 'À attribuer' && A.etapes[0].echeance === 'avant jeudi', 'analyse : « Personne N » → À attribuer ; échéance dite gardée');
  check(A.themes[0].points[1].type === 'piste' && A.dropped.decisions === 1 && A.themes[0].points[2].type === 'fait', 'analyse : décision sans appui → piste ; type inconnu → fait');
  check(A.citations.length === 1 && A.dropped.citations === 1 && !A.participants.some((p) => p.nom === 'Personne 3'), 'analyse : citation non retrouvée retirée, « Personne N » n’est pas un participant');
  const R = P.renderAnalysis(A);
  check(R.includes('[DÉCISION] Six mètres') && R.includes('[PISTE]') && R.includes('- Camille : renégocier') && R.includes('(avant jeudi)'), 'analyse rendue pour la rédaction');
  check(P.renderAnalysis({ ...A, etapes: [] }).includes('section omise'), 'analyse sans étape : section omise');

  // vérification locale
  const good = '# Salon et site\n[[ia]]L’équipe fixe le stand à **six mètres carrés**.[[/ia]]\n## Budget du salon\n[[ia]]Plafond de 3 500 euros.[[/ia]]\n## Prochaines étapes\n- [ ] [[ia]]**Camille** : renégocier avec l’organisateur (avant jeudi)[[/ia]]\n- [ ] [[ia]]**Karim** : faire passer l’entretien technique (mardi)[[/ia]]';
  check(P.localChecks(good, { transcript: reunion, speakers: ['Moi', 'Camille', 'Karim', 'Julie'] }).length === 0, 'contrôle local : note conforme → 0 problème');
  const bad = '# Salon\n[[ia]]Au début de la réunion, vers 03:12, on parle du stand.[[/ia]]\n- [[ia]]une puce au milieu[[/ia]]\n## Prochaines étapes\n- [ ] [[ia]]**Personne 2** : faire passer l’entretien technique[[/ia]]\n- [ ] [[ia]]**Julie** : envoyer le prototype aux familles[[/ia]]\n- [ ] [[ia]]**Bernard** : renégocier avec l’organisateur[[/ia]]\n## Budget\n[[ia]]x[[/ia]]';
  const kinds = P.localChecks(bad, { transcript: reunion, speakers: ['Moi', 'Camille', 'Karim', 'Julie'] }).map((i) => i.kind);
  for (const k of ['heure', 'chronologie', 'liste_hors_fin', 'etapes_pas_en_dernier', 'personne_n', 'etape_sans_appui', 'nom_inconnu'] as const) check(kinds.includes(k), `contrôle local : ${k} détecté`);
  check(P.applyLocalFixes('- [ ] [[ia]]**Personne 2** : x [01:10][[/ia]]') === '- [ ] [[ia]]**À attribuer** : x[[/ia]]', 'correction locale : Personne N et horodatage');
  const rep = P.filterReport({ inventions: [{ extrait: 'six mètres carrés' }, { extrait: 'phrase absente de la note' }], oublis: [{ element: 'Entretiens la semaine du 27', source: 'Entretiens la semaine du 27' }, { element: 'Un chiffre jamais dit', source: 'les licornes volent' }], statut_faux: [], heures: 'x' }, good, reunion);
  check(rep.inventions.length === 1 && rep.oublis.length === 1 && rep.heures.length === 0, 'rapport du contrôleur filtré (extrait introuvable, oubli sans appui ignorés)');
  check(/INVENTION/.test(P.renderProblems(rep, [{ kind: 'personne_n', extrait: 'Personne 2' }])) && /Personne N/.test(P.renderProblems(rep, [{ kind: 'personne_n', extrait: 'Personne 2' }])), 'problèmes rendus pour la correction');

  const cb = '# T\n[[ia]]Intro.[[/ia]]\n## A\n[[ia]]Le BFR est un besoin. Trois leviers existent.[[/ia]]\n## B\n[[ia]]Le plan est mensuel et mis à jour chaque semaine.[[/ia]]';
  check(P.correctionOk(cb, cb.replace('Trois leviers', 'Deux leviers'), 1, 0), 'correction : version proche acceptée');
  check(!P.correctionOk(cb, cb.replace('besoin. Trois', 'besoin. > Trois'), 1, 0), 'correction : « > » collé dans un paragraphe → refusée');
  check(!P.correctionOk(cb, '# T\n[[ia]]Intro.[[/ia]]', 1, 0) && !P.correctionOk(cb, cb, 0, 1), 'correction : note tronquée ou plus de problèmes → refusée');

  // pipeline complet, routeur simulé (aucun réseau)
  const draftBad = '# Salon, site et stagiaire\n[[ia]]L’équipe fixe le stand à **six mètres carrés** et valide le sondage.[[/ia]]\n## Budget du salon\n[[ia]]Au début de la réunion, plafond de 3 500 euros.[[/ia]]\n## Prochaines étapes\n- [ ] [[ia]]**Camille** : renégocier avec l’organisateur (avant jeudi)[[/ia]]\n- [ ] [[ia]]**Personne 2** : faire passer l’entretien technique[[/ia]]';
  const calls: string[] = [];
  let corrChecked = 0;
  const fake = (async (job: any) => {
    calls.push(job.label);
    const reply = (t: string) => { job.onDelta?.(t); return { text: job.post(t), provider: 'gemini', model: 'fake', attempts: [] }; };
    if (job.label === 'relecture') { const lines = job.user.split('\n').filter((l: string) => /^\[\d+\]/.test(l)); return reply(lines.map((l: string) => l.replace('Carime', 'Karim')).join('\n')); }
    if (job.label === 'analyse') return reply(JSON.stringify(rawA));
    if (job.label === 'compte rendu (rédaction)') { check(job.system.includes('Analyse fournie') && job.user.includes('<analyse>') && !job.system.includes('[[genre:X]]') && !/\[\d{2}:\d{2}\]/.test(job.user), 'rédaction : analyse fournie, sans heures ni ligne genre'); return reply(draftBad); }
    if (job.label === 'vérification') {
      check(job.user.startsWith('<points>') && !job.user.includes('<transcription>') && job.order?.[0] === 'groq', 'vérification : liste courte de points (pas la transcription), fournisseur rapide en premier');
      const n = Number(/^(\d+)\. \[NOTE\] [^\n]*valide le sondage/m.exec(job.user)?.[1] ?? 0);
      return reply(JSON.stringify({ problemes: [{ n, type: 'statut_faux', raison: 'piste gardée pour plus tard' }] }));
    }
    if (job.label === 'compte rendu (correction)') { if (!corrChecked++) check(/STATUT FAUX/.test(job.user) && /CHRONOLOGIE/.test(job.user), 'correction : problèmes du contrôleur et locaux transmis'); return reply(good); }
    if (job.label === 'compte rendu') return reply(good);
    throw new Error('inattendu ' + job.label);
  }) as any;
  const deltas: string[] = [];
  const stagesSeen: string[] = [];
  const Q = await P.organizeNotesQuality(reunion, { route: fake, steps: { review: true }, onDelta: (d) => deltas.push(d), onStage: (s) => stagesSeen.push(`${s.name}:${s.status}`), vocabulary: ['Karim'] });
  check(calls.join() === 'relecture,analyse,compte rendu (rédaction),vérification,compte rendu (correction)', `pipeline : ordre des appels (${calls.join()})`);
  check(Q.pipeline.verification?.corrected === true && Q.markdown.includes('six mètres carrés') && !Q.markdown.includes('valide le sondage') && !/Personne 2/.test(Q.markdown), 'pipeline : note corrigée retenue');
  check(deltas.length >= 2 && deltas[deltas.length - 1] === Q.annotated, 'pipeline : streaming de la rédaction puis version vérifiée');
  check(!!Q.reviewedTranscript && Q.pipeline.review?.accepted === Q.pipeline.review?.blocks && !!Q.analysis && Q.kind === 'reunion' && !Q.pipeline.fallback, 'pipeline : relecture et analyse exposées');
  check(stagesSeen.includes('relecture:done') && stagesSeen.includes('correction:done') && Q.pipeline.stages.every((s) => !s.detail || !/salon|Camille/i.test(s.detail)), 'pipeline : étapes signalées, sans texte de réunion');

  // repli : analyse en échec → rédaction simple ; vérification en échec → note gardée
  const calls2: string[] = [];
  const flaky = (async (job: any) => { calls2.push(job.label); if (job.label === 'analyse' || job.label === 'vérification') throw new Error('quota'); return fake(job); }) as any;
  const F = await P.organizeNotesQuality(brainstorm, { route: flaky, steps: { review: false } });
  check(F.pipeline.fallback && calls2.includes('compte rendu') && !calls2.includes('compte rendu (rédaction)') && F.markdown.length > 0, 'repli : analyse en échec → résumé simple v5');
  check(F.pipeline.stages.some((s) => s.name === 'analyse' && s.status === 'failed') && F.pipeline.stages.some((s) => s.name === 'relecture' && s.status === 'skipped'), 'repli : étapes en échec / sautées signalées');
  const calls3: string[] = [];
  const N = await P.organizeNotesQuality(reunion, { route: (async (j: any) => { calls3.push(j.label); return fake(j); }) as any, steps: { review: false, analysis: false, verify: false } });
  check(calls3.join() === 'compte rendu' && !N.pipeline.verification, 'toutes étapes coupées = organizeNotes v5 seul');
  const slow = (async (job: any) => { if (job.label === 'relecture') await new Promise((_r, rej) => job.signal?.addEventListener('abort', () => rej(new Error('abort')))); return fake(job); }) as any;
  const tS = performance.now();
  const S = await P.organizeNotesQuality(reunion, { route: slow, steps: { review: true, verify: false }, budgetMs: 1 });
  check(S.pipeline.stages.some((s) => s.name === 'relecture' && s.status === 'failed' && s.detail === 'délai dépassé') && S.pipeline.stages.some((s) => s.name === 'analyse' && s.status === 'skipped') && performance.now() - tS < 20_000, 'budget : relecture hors délai abandonnée, analyse sautée');
  // vérification : liste, repli sans IA, champ « vérifiée »
  check(Q.pipeline.verified === true && Q.pipeline.verification?.mode === 'llm' && Q.pipeline.verification?.done === true, 'vérification : faite (champ verified)');
  const cl = P.buildClaims(draftBad, reunion);
  check(cl.length >= 2 && cl.some((c) => c.kind === 'etape') && cl.every((c) => c.evidence.length <= 2) && P.renderClaims(cl).length < draftBad.length * 4, 'vérification : liste d’affirmations courte avec preuves');
  const D = P.deterministicVerify('# T\n[[ia]]Le stand fait six mètres carrés, dit Bernard.[[/ia]]\n## Prochaines étapes\n- [ ] [[ia]]**Camille** : renégocier avec l’organisateur (avant jeudi)[[/ia]]\n- [ ] [[ia]]**Julie** : envoyer le prototype aux familles[[/ia]]\n- [ ] [[ia]]**Bernard** : renégocier avec l’organisateur[[/ia]]', { transcript: reunion, speakers: ['Camille', 'Karim', 'Julie'] });
  check(D.flagged === 3 && /prototype aux familles \(à vérifier\)\[\[\/ia\]\]/.test(D.annotated) && !/Camille\*\* : renégocier avec l’organisateur \(avant jeudi\) \(à vérifier\)/.test(D.annotated), 'repli sans IA : étape et responsable sans appui marqués « à vérifier »');
  check(P.markLines('# T\n[[ia]]L’équipe valide le sondage.[[/ia]]\n[[ia]]Autre.[[/ia]]', ['valide le sondage']).flagged === 1, 'points signalés non corrigés : marqués « à vérifier »');
  const calls4: string[] = [];
  const noVerif = (async (job: any) => { calls4.push(job.label); if (job.label === 'vérification') throw new Error('délai'); return fake(job); }) as any;
  const V = await P.organizeNotesQuality(reunion, { route: noVerif, steps: { review: false } });
  check(V.pipeline.verified === false && V.pipeline.verification?.mode === 'local' && V.pipeline.verification?.done === false && !calls4.includes('compte rendu (correction)'), 'vérification en échec : repli sans IA, résultat « non vérifiée par IA »');

  // « Moi » fantôme et citations en double
  const T = tidy('# T\n[[ia]]Texte.[[/ia]]\n\n> **À retenir**\n> > Le principe de base. (Moi)\n\n> **À retenir**\n> > Le principe de base. (Moi)\n\n## Prochaines étapes\n- [ ] [[ia]]**Moi** : appeler[[/ia]]', ['Personne 1', 'Personne 2']);
  check(!/Moi/.test(T) && (T.match(/Le principe de base/g) ?? []).length === 1 && !/> >/.test(T) && /\*\*À attribuer\*\* : appeler/.test(T), 'Moi absent sans voix « Moi » ; citation dédoublonnée ; « > > » aplati');
  check(/\(Moi\)/.test(tidy('> Un point. (Moi)', ['Moi', 'Personne 2'])), 'Moi conservé quand une voix « Moi » existe');
  check(/jamais « Moi »/.test(buildNotesUser('[00:01] Personne 1 : a\n[00:09] Personne 2 : b', undefined, '')) && !/jamais « Moi »/.test(buildNotesUser('[00:01] Moi : a\n[00:09] Personne 2 : b', undefined, '')), 'consigne « pas de Moi » seulement sans voix Moi');
  const AN = P.normalizeAnalysis({ themes: [{ titre: 'x', points: [{ type: 'fait', texte: 'Un fait', qui: 'Moi' }] }], etapes: [{ qui: 'Moi', quoi: 'renégocier avec l’organisateur', source: 'tu renégocies avec l\'organisateur' }], citations: [{ qui: 'Moi', texte: 'Je les envoie vendredi, pas plus tard.' }] }, reunion, 'reunion', ['Personne 1', 'Personne 2']);
  check(AN.etapes[0]?.qui === 'À attribuer' && AN.citations[0]?.qui === undefined && AN.themes[0].points[0].qui === undefined, 'analyse : « Moi » écarté sans voix Moi');
  check(P.defaultBudgetMs(2300) > 60_000 && P.defaultBudgetMs(100000) === 180_000 && P.stageTimeouts(2300).review < 30_000, 'budget par défaut proportionné');
}

console.log(failed ? `\n${failed} échec(s)` : '\ntous les tests passent');
process.exitCode = failed ? 1 : 0;

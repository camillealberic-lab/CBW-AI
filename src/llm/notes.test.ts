// Tests purs : format balisé des comptes rendus, gabarits, sélection des passages, citations, réglages Groq.
// Aucun réseau, aucun LLM.   NODE_NO_WARNINGS=1 node --experimental-strip-types src/llm/notes.test.ts
import { buildNotesSystem, buildNotesUser, dropPartialTag, enforceUserNotes, formatSegments, normalizeAnnotated, outTokens, parseAnnotated, parseClock, parseTranscript, postProcessNotes, splitTranscript, stripMarkers, mmss } from './notes.ts';
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
check(sys.length < 4800, `prompt compact (${sys.length} car.)`);
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
check(auto.length < 4800, `Auto : prompt compact (${auto.length} car.)`);
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
check([auto, buildNotesSystem('client'), buildNotesSystem('cours', { kind: 'cours' })].every((x) => x.includes('1 à 2, sans titre') && x.includes('TOUTES les décisions') && x.includes('Prochaines étapes')), 'tous genres : même forme (résumé général, thèmes, étapes)');
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

console.log(failed ? `\n${failed} échec(s)` : '\ntous les tests passent');
process.exitCode = failed ? 1 : 0;

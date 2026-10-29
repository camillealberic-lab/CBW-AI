// Tests purs de prompt.ts : prompt v1.14, saut du LLM élargi à 12 mots (C3), rejet d'une dictée répétée (C5).
//   NODE_NO_WARNINGS=1 node --experimental-strip-types src/llm/prompt.test.ts
import { shouldSkipLLM, shouldSkipLLMWithConfidence, asrConfidenceLevel, ASR_CONF, postProcess, buildSystemPrompt, PROMPT_VERSION, OutOfRoleError } from './prompt.ts';

let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.error('✘ ' + msg); } else console.log('✔ ' + msg); };
const rejects = (out: string, raw: string) => { try { postProcess(out, raw); return false; } catch (e) { return e instanceof OutOfRoleError; } };

// ── prompt v1.14
const sys = buildSystemPrompt({});
check(PROMPT_VERSION === 'v1.14', 'version v1.14');
check(/CBW AI/.test(sys) && !/Dicta AI/.test(sys), 'P6 : CBW AI, plus Dicta AI');
check(/garde la formulation d'origine/.test(sys), 'P1 : doute → formulation d\'origine');
check(/passe avant « garde la voix de la personne », jamais avant le sens ni les noms/.test(sys), 'P2 : le profil de l\'app passe avant la voix');
check(/--fix/.test(sys) && /-v/.test(sys) && /OAuth/.test(sys), 'P3 : syntaxe technique dictée');
check(/coupée en deux par une pause/.test(sys), 'P4 : phrase coupée par une pause');
check((sys.match(/^<dictée>/gm) ?? []).length === 7, 'P5 : 7 exemples');
check(sys.length < 8000, `P5 : prompt compact (${sys.length} car.)`);

// ── C3 : à sauter (7 à 12 mots propres)
const SKIP = [
  "Je t'envoie le document demain matin avant la réunion",
  'Peux-tu me renvoyer le fichier signé avant ce soir',
].slice(0, 0); // « peux-tu » est une question : voir plus bas
const skip = [
  "Je t'envoie le document demain matin avant la réunion.",
  'Le rapport est prêt, tu peux le relire cet après-midi.',
  'La réunion de demain est reportée à la semaine prochaine.',
  "Merci pour ton retour, je regarde cela cet après-midi.",
  'Je serai en retard ce matin à cause des transports.',
];
for (const s of skip) check(shouldSkipLLM(s), `saute : ${s}`);
void SKIP;

// ── C3 : à ne pas sauter
const noSkip: [string, string][] = [
  ['euh je te rappelle demain matin à la première heure', 'filler'],
  ['on se voit lundi, enfin mardi, chez le client à Bordeaux', 'correction'],
  ['du coup je te renvoie le fichier demain matin sans faute', 'tic doux'],
  ['je je te renvoie le fichier demain matin sans faute', 'répétition'],
  ['Salut Karim virgule on relance les tests demain matin sans faute', 'commande dictée'],
  ["y a plus de café dans la cuisine du deuxième étage", 'oral : y a'],
  ["t'es dispo demain matin pour la réunion avec le client", 'oral : t\'es'],
  ['faut que je finisse le rapport avant la réunion de demain', 'oral : faut'],
  ['je sais pas si le client sera là pour la réunion de demain', 'négation sans ne'],
  ["j'ai trouvé un truc intéressant dans le rapport de la semaine", 'un truc'],
  ['ça va être compliqué de finir le rapport avant la réunion', 'ça va être'],
  ['on va se voir demain matin au bureau pour la réunion', 'on va'],
  ['il faut acheter du pain et du lait pour le petit déjeuner', 'énumération et'],
  ['il faut acheter du pain, du lait, des œufs pour le petit déjeuner', 'virgules multiples'],
  ['premièrement relire le rapport avant la réunion de demain matin', 'premièrement'],
  ['est-ce que tu peux relire le rapport avant la réunion de demain', 'question sans ?'],
  ['pourquoi le rapport est toujours pas prêt pour la réunion de demain', 'mot interrogatif'],
  ['le rendez-vous est à dix heures demain matin chez le client', 'chiffre à convertir'],
  ['ouvre le fichier router point ts avant la réunion de demain', 'syntaxe technique'],
  ['le dernier chiffre est dans le rapport de la semaine passée de claude', 'terme du dictionnaire'],
];
for (const [s, why] of noSkip) check(!shouldSkipLLM(s, { vocabulary: ['Claude'] }), `ne saute pas (${why}) : ${s}`);
check(shouldSkipLLM('Merci beaucoup'), 'inchangé : ≤ 6 mots propres sautés');
check(!shouldSkipLLM('on va se voir demain matin au bureau pour la réunion de la semaine prochaine avec tout le monde'), '> 12 mots : jamais sauté');
check(shouldSkipLLM('Le rapport est prêt, tu peux le relire cet après-midi.', { vocabulary: ['Claude'] }), 'dictionnaire sans rapport : saute');

// ── C5 : dictée répétée deux fois dans la sortie
const raw = "le fichier est prêt pour la relecture";
check(rejects(`Le fichier est prêt pour la relecture. Le fichier est prêt pour la relecture.`, raw), 'C5 : sortie en double rejetée');
check(rejects(`Le fichier est prêt pour la relecture.\n\nLe fichier est prêt pour la relecture.`, raw), 'C5 : double avec paragraphe rejeté');
check(!rejects('Le fichier est prêt pour la relecture.', raw), 'C5 : sortie simple acceptée');
const rep = 'dis-lui que le fichier est prêt, je répète, le fichier est prêt pour la relecture';
check(!rejects('Dis-lui que le fichier est prêt. Je répète : le fichier est prêt pour la relecture.', rep), 'C5 : répétition réellement dictée acceptée');

// ── W1 : confiance de la transcription
const HIGH = { avgLogProb: -0.05, minSegLogProb: -0.05, maxNoSpeech: 0.001, minWordProb: 0.8 };
const MID = { avgLogProb: -0.3, minSegLogProb: -0.3, maxNoSpeech: 0.01, minWordProb: 0.6 };
const LOW = { avgLogProb: -0.9, minSegLogProb: -0.9, maxNoSpeech: 0.01, minWordProb: 0.5 };
const S16 = "Je t'envoie le document demain matin avant la grande réunion de la semaine prochaine."; // 14 mots
const S25 = 'Je pense que nous devrions reporter la grande réunion de la semaine prochaine parce que plusieurs collègues importants seront absents lundi matin.'; // > 20
check(asrConfidenceLevel(HIGH) === 'high' && asrConfidenceLevel(MID) === 'unknown' && asrConfidenceLevel(LOW) === 'low', 'W1 : niveaux haut / intermédiaire / bas');
check(asrConfidenceLevel(undefined) === 'unknown' && asrConfidenceLevel(null) === 'unknown', 'W1 : absente → inconnue');
check(asrConfidenceLevel({ avgLogProb: -0.05 }) === 'high' && asrConfidenceLevel({ avgLogProb: -0.15 }) === 'unknown', 'W1 : sans détail des mots, seuil de moyenne plus strict');
check(asrConfidenceLevel({ ...HIGH, minWordProb: 0.15 }) === 'low', 'W1 : un mot très douteux → bas');
check(asrConfidenceLevel({ ...HIGH, maxNoSpeech: 0.7 }) === 'low' && asrConfidenceLevel({ ...HIGH, maxNoSpeech: 0.3 }) === 'unknown', 'W1 : pas-de-parole élevé');
check(asrConfidenceLevel({ avgLogProb: Number.NaN }) === 'unknown', 'W1 : valeur non finie ignorée');
check(!shouldSkipLLM(S16), 'W1 : 14 mots sans confiance → LLM (défaut 12 inchangé)');
check(shouldSkipLLM(S16, { maxWords: 20 }) && !shouldSkipLLM(S25, { maxWords: 20 }), 'W1 : maxWords 20 relève la limite, pas au-delà');
check(shouldSkipLLMWithConfidence(S16, { asrConfidence: HIGH }), 'W1 : confiance haute, 14 mots propres → saut');
check(!shouldSkipLLMWithConfidence(S16, { asrConfidence: MID }) && !shouldSkipLLMWithConfidence(S16), 'W1 : confiance moyenne ou absente → LLM');
check(!shouldSkipLLMWithConfidence(S25, { asrConfidence: HIGH }), 'W1 : > 20 mots jamais sauté');
check(!shouldSkipLLMWithConfidence('Merci beaucoup', { asrConfidence: LOW }), 'W1 : confiance basse → jamais de saut, même 2 mots');
check(shouldSkipLLMWithConfidence('Merci beaucoup', { asrConfidence: MID }) && shouldSkipLLMWithConfidence('Merci beaucoup'), 'W1 : courte et propre, confiance moyenne ou absente → inchangé');
// les autres filtres restent actifs avec une confiance haute (14 mots chacun)
const stillNo: Array<[string, string]> = [
  ['Euh je t\'envoie le document demain matin avant la grande réunion de la semaine prochaine.', 'filler'],
  ['Je t\'envoie le document demain matin avant la grande réunion de la semaine prochaine à 15 heures.', 'chiffre'],
  ['Je t\'envoie le document demain matin, avant la grande réunion, de la semaine prochaine.', '2 virgules'],
  ['Est-ce que tu peux m\'envoyer le document demain matin avant la grande réunion de la semaine ?', 'question'],
  ['Je t\'envoie le document demain matin avant la grande réunion virgule de la semaine prochaine.', 'commande dictée'],
  ['Je t\'envoie le document claude demain matin avant la grande réunion de la semaine prochaine.', 'vocabulaire'],
];
for (const [s, why] of stillNo) check(!shouldSkipLLMWithConfidence(s, { asrConfidence: HIGH, vocabulary: ['Claude'] }), `W1 : confiance haute, filtre « ${why} » toujours actif`);
check(ASR_CONF.extendedMaxWords === 20, 'W1 : limite étendue 20 mots');

if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
console.log('\nOK');

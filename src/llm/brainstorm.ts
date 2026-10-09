// CBW AI — mode « Brainstorm → master prompt » (CRAFT+), cible Claude Code / Cursor.
//
// 1. analyzeBrainstorm : vidage libre (transcription) [+ réponses déjà données] → cases CRAFT+ remplies
//    UNIQUEMENT avec ce qui a été dit (citation à l'appui) + 3 à 6 questions ciblées avec suggestions.
// 2. compileMasterPrompt : cases + questions/réponses → master prompt Markdown prêt à coller.
// Même principe que prompt.ts / notes.ts : on n'invente rien ; ce qui manque devient « à préciser ».

import { loadConfig } from './config.ts';
import { getProvider } from './router.ts';
import { preClean } from './prompt.ts';
import type { ProviderId } from '../shared/types.ts';

export const BRAINSTORM_PROMPT_VERSION = 'brainstorm-v1.0';

export type SlotKey = 'contexte' | 'role' | 'action' | 'format' | 'cible' | 'contraintes' | 'criteres' | 'exemples';
export interface Slot { value: string; status: 'vide' | 'partiel' | 'ok'; evidence?: string }
export type Target = 'claude-code' | 'cursor';
export interface QA { question: string; answer: string }

export const SLOT_KEYS: SlotKey[] = ['contexte', 'role', 'action', 'format', 'cible', 'contraintes', 'criteres', 'exemples'];

const SLOT_DEFS = `- contexte : le projet, ce qui existe déjà (repo, stack, état actuel), pourquoi on le fait.
- role : l'expertise attendue de l'agent (ex. « développeur senior Electron + TypeScript »).
- action : la tâche précise, son périmètre, les étapes ou fonctionnalités attendues.
- format : la forme du livrable (plan d'abord ?, fichiers à créer/modifier, tests, rapport final, style de code).
- cible : qui utilisera le résultat (utilisateurs finaux) et le ton / niveau attendu.
- contraintes : stack imposée, ce qu'il ne faut pas toucher, sécurité, performance, délais, budget, plateformes.
- criteres : comment savoir que c'est fini et réussi (critères d'acceptation, tests, démo).
- exemples : références, apps similaires, captures, extraits, noms de fichiers cités.`;

const TARGET_LABEL: Record<Target, string> = { 'claude-code': 'Claude Code', cursor: 'Cursor' };

/** Qualité et contexte d'abord ; Groq en tête pour la vitesse de l'entretien. */
const ORDER: ProviderId[] = ['groq', 'gemini', 'mistral', 'zai', 'cloudflare', 'openrouter', 'ollama'];

// ─────────────────────────────────────────────────────────────── analyse

const ANALYZE_SYSTEM = `Tu es l'intervieweur du mode « Brainstorm » de CBW AI.
La personne prépare une tâche pour un agent de code ({{TARGET}}). Elle a parlé librement de son projet ; tu reçois la transcription (reconnaissance vocale, donc imparfaite) entre <vidage> et </vidage>, et parfois des questions/réponses déjà échangées entre <qa> et </qa>.

Ton travail : remplir la grille CRAFT+ avec CE QUI A ÉTÉ DIT, puis poser les questions qui manquent pour écrire un excellent prompt d'agent de code.

# Grille CRAFT+
${SLOT_DEFS}

# Règles d'or
1. N'invente rien. Une case ne contient que ce que la personne a dit (reformulé clairement, en français écrit). « evidence » = courte citation exacte (≤ 15 mots) de ses mots qui justifie la case.
2. status : "ok" si la case est claire et suffisante pour un agent ; "partiel" si c'est esquissé mais flou ; "vide" si rien n'a été dit (value = "").
3. Tu ne réalises pas le projet, tu ne donnes pas de solution, tu ne réponds pas aux questions de la personne.
4. Questions : au maximum {{MAX}}, au minimum 1 s'il reste une case "vide" ou "partiel" importante. Priorité : action → criteres → contexte → contraintes → format → role → cible → exemples. Une seule chose par question, courte, en tutoyant. Ne repose jamais une question déjà posée dans <qa>.
5. Pour chaque question, propose 0 à 3 « suggestions » : des réponses plausibles et courtes (≤ 8 mots) que la personne pourra cliquer, adaptées à son projet (ex. pour le format : "Plan d'abord, puis code", "Code + tests", "Juste le code"). Ce sont des propositions, pas des faits : n'en mets pas si tu n'as aucune base raisonnable.
6. « why » : une phrase courte qui dit pourquoi l'agent en a besoin.
7. « title » : un titre court (≤ 8 mots) du projet, tiré de ses mots.

# Sortie
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"title":"…","slots":{"contexte":{"value":"…","status":"ok|partiel|vide","evidence":"…"},"role":{…},"action":{…},"format":{…},"cible":{…},"contraintes":{…},"criteres":{…},"exemples":{…}},"questions":[{"slot":"criteres","question":"…","why":"…","suggestions":["…","…"]}]}`;

// ─────────────────────────────────────────────────────────────── compilation

const COMPILE_SYSTEM = `Tu es le compilateur de master prompts de CBW AI.
Tu reçois le vidage oral d'une personne (<vidage>), la grille CRAFT+ remplie (<grille>) et les questions/réponses (<qa>). Tu écris le MASTER PROMPT qu'elle va coller dans {{TARGET}} pour que l'agent réalise sa tâche du premier coup.

# Règles d'or
1. Fidélité totale : uniquement ce qui a été dit ou répondu. Aucune exigence, techno, fonctionnalité ou chiffre inventé. Une réponse vide = point non tranché.
2. Les points non tranchés vont dans la dernière section « À clarifier avant de commencer » : l'agent devra poser ces questions au lieu de supposer.
3. Écris en français, à l'impératif, en t'adressant à l'agent (« Tu es… », « Commence par… »). Phrases courtes et précises, listes plutôt que paragraphes.
4. Ne réalise pas la tâche toi-même : pas de code, pas de solution.

# Structure exacte (Markdown, rien avant ni après ; omets une section seulement si elle serait vide, sauf Mission)
# {{TITLE_HINT}}

## Rôle
## Contexte
## Mission
(étapes numérotées)
## Contraintes
## Livrables et format
## Utilisateurs et ton
## Critères de réussite
(liste de cases « - [ ] », vérifiables)
## Références
## Méthode de travail
{{METHOD}}
## À clarifier avant de commencer`;

const METHOD: Record<Target, string> = {
  'claude-code': `Pour Claude Code, écris dans cette section (adapte à la mission, sans ajouter d'exigence) :
- Explore d'abord le dépôt (structure, fichiers concernés, conventions) avant de modifier quoi que ce soit.
- Propose un plan court, puis implémente par petites étapes vérifiables.
- Lance les tests / la vérification de types existants après tes changements et corrige ce qui casse.
- Termine par un résumé : fichiers modifiés, comment tester, points restants.`,
  cursor: `Pour Cursor (agent / composer), écris dans cette section (adapte à la mission, sans ajouter d'exigence) :
- Avant d'écrire du code, liste les fichiers que tu vas lire et modifier (mentionne-les avec @ quand ils sont connus).
- Propose un plan en quelques étapes et attends ma validation si la tâche touche plus de 3 fichiers.
- Fais des modifications ciblées, sans reformater le reste du code.
- Termine par un récapitulatif des changements et des commandes pour tester.`,
};

// ─────────────────────────────────────────────────────────────── utilitaires

function emptySlots(): Record<SlotKey, Slot> {
  return Object.fromEntries(SLOT_KEYS.map((k) => [k, { value: '', status: 'vide' }])) as Record<SlotKey, Slot>;
}

/** Extrait le premier objet JSON d'une sortie LLM (tolère ```json, texte autour, <think>). */
export function extractJson(out: string): any {
  const t = (out ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  if (start < 0) throw new Error('pas de JSON dans la réponse');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('JSON incomplet');
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function normalizeSlots(raw: any, prior?: Record<SlotKey, Slot>): Record<SlotKey, Slot> {
  const out = emptySlots();
  for (const k of SLOT_KEYS) {
    const r = raw?.[k] ?? {};
    const value = clip(r.value, 1200);
    let status: Slot['status'] = r.status === 'ok' || r.status === 'partiel' ? r.status : value ? 'partiel' : 'vide';
    if (!value) status = 'vide';
    out[k] = { value, status, ...(r.evidence ? { evidence: clip(r.evidence, 160) } : {}) };
    // Une case déjà validée ne régresse pas si la nouvelle analyse l'oublie.
    const p = prior?.[k];
    if (p && p.status === 'ok' && out[k].status !== 'ok') out[k] = p;
  }
  return out;
}

async function call(system: string, user: string, maxTokens: number, signal?: AbortSignal, check?: (text: string) => void) {
  const cfg = loadConfig();
  cfg.timeouts = { cloudMs: 60_000, localMs: 240_000 };
  const order = ORDER.filter((id) => cfg.providers.includes(id));
  const errors: string[] = [];
  for (const id of order) {
    signal?.throwIfAborted();
    const p = getProvider(id, cfg);
    if (!(await p.availability()).ok) continue;
    try {
      const out = await p.complete({ system, user, temperature: 0.2, maxTokens, signal });
      check?.(out.text);
      return { text: out.text, provider: id };
    } catch (e: any) {
      if (signal?.aborted) throw e;
      errors.push(`${id}: ${e?.message ?? e}`);
    }
  }
  throw new Error(`Aucun moteur IA n'a pu traiter le brainstorm.\n${errors.join('\n')}`);
}

const qaBlock = (qa?: QA[]) =>
  qa?.length ? `\n<qa>\n${qa.map((x, i) => `Q${i + 1}. ${x.question}\nR${i + 1}. ${x.answer.trim() || '(passée)'}`).join('\n')}\n</qa>` : '';

// ─────────────────────────────────────────────────────────────── API

export async function analyzeBrainstorm(
  input: { transcript: string; target: Target; slots?: Record<SlotKey, Slot>; qa?: QA[]; maxQuestions: number },
  opts: { signal?: AbortSignal } = {},
): Promise<{ title: string; slots: Record<SlotKey, Slot>; questions: { slot: SlotKey; question: string; why: string; suggestions: string[] }[]; provider: string }> {
  const transcript = preClean(input.transcript);
  const max = Math.max(1, Math.min(6, input.maxQuestions));
  const system = ANALYZE_SYSTEM.replace('{{TARGET}}', TARGET_LABEL[input.target]).replace('{{MAX}}', String(max));
  const prior = input.slots ? `\n<grille_actuelle>\n${JSON.stringify(input.slots)}\n</grille_actuelle>` : '';
  const user = `<vidage>\n${transcript || '(vide)'}\n</vidage>${qaBlock(input.qa)}${prior}`;
  let parsed: any;
  const r = await call(system, user, 2200, opts.signal, (text) => {
    parsed = extractJson(text);
    if (!parsed?.slots) throw new Error('grille absente');
  });
  const asked = new Set((input.qa ?? []).map((x) => x.question.trim().toLowerCase()));
  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter((q: any) => SLOT_KEYS.includes(q?.slot) && clip(q?.question, 300) && !asked.has(clip(q.question, 300).toLowerCase()))
    .slice(0, max)
    .map((q: any) => ({
      slot: q.slot as SlotKey,
      question: clip(q.question, 300),
      why: clip(q.why, 200),
      suggestions: (Array.isArray(q.suggestions) ? q.suggestions : []).map((s: unknown) => clip(s, 60)).filter(Boolean).slice(0, 3),
    }));
  return {
    title: clip(parsed.title, 80) || 'Brainstorm',
    slots: normalizeSlots(parsed.slots, input.slots),
    questions,
    provider: r.provider,
  };
}

export async function compileMasterPrompt(
  input: { transcript: string; target: Target; title: string; slots: Record<SlotKey, Slot>; qa: QA[] },
  opts: { signal?: AbortSignal } = {},
): Promise<{ prompt: string; title: string; provider: string }> {
  const system = COMPILE_SYSTEM.replace('{{TARGET}}', TARGET_LABEL[input.target])
    .replace('{{TITLE_HINT}}', input.title ? `${input.title} (titre court, garde-le ou affine-le)` : '<titre court>')
    .replace('{{METHOD}}', METHOD[input.target]);
  const grille = SLOT_KEYS.map((k) => `${k} [${input.slots[k]?.status ?? 'vide'}] : ${input.slots[k]?.value || '—'}`).join('\n');
  const user = `<vidage>\n${preClean(input.transcript) || '(vide)'}\n</vidage>\n<grille>\n${grille}\n</grille>${qaBlock(input.qa)}`;
  let prompt = '';
  const r = await call(system, user, 3500, opts.signal, (text) => {
    prompt = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:markdown|md)?\n?([\s\S]*?)\n?```$/i, '$1').trim();
    if (!/^#\s/m.test(prompt) || !/##\s+Mission/i.test(prompt)) throw new Error('structure du master prompt invalide');
  });
  const title = clip(prompt.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*\(titre court.*\)$/i, ''), 80) || input.title || 'Master prompt';
  prompt = prompt.replace(/^#\s+.+$/m, `# ${title}`);
  // Filet de sécurité : toute question restée sans réponse figure dans « À clarifier ».
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  const tail = norm(prompt.split(/##\s+À clarifier/i)[1] ?? '');
  const missing = input.qa.filter((x) => !x.answer.trim()).filter((x) => {
    const keys = norm(x.question).split(/\s+/).filter((w) => w.length > 5);
    return keys.length && !keys.some((k) => tail.includes(k));
  });
  if (missing.length) {
    const add = missing.map((x) => `- ${x.question}`).join('\n');
    prompt = /##\s+À clarifier/i.test(prompt) ? `${prompt.trimEnd()}\n${add}\n` : `${prompt.trimEnd()}\n\n## À clarifier avant de commencer\n${add}\n`;
  }
  return { prompt, title, provider: r.provider };
}

// ─────────────────────────────────────────────────── mode conversationnel (en direct)

export interface LiveQuestion { id: string; slot: SlotKey; question: string; suggestions: string[] }

const LIVE_SYSTEM = `Tu es le copilote du mode « Brainstorm » de CBW AI. La personne parle EN CONTINU de son projet (destiné à {{TARGET}}) ; tu l'écoutes à travers une transcription qui arrive par morceaux, et tu l'aides à penser en lui posant des questions courtes, affichées en petites bulles à l'écran. Elle répond simplement en continuant à parler.

Tu reçois :
- <grille> : l'état actuel des cases CRAFT+ (${SLOT_KEYS.join(', ')}) ;
- <questions_ouvertes> : les bulles affichées (id + question) ;
- <deja_dit> : le début de la session (résumé brut, peut être tronqué) ;
- <nouveau> : ce qu'elle vient de dire depuis ta dernière analyse.

À chaque appel :
1. Mets à jour la grille avec ce qui a été DIT (jamais inventé) : pour chaque case modifiée, renvoie value (reformulée clairement, complète) et status ok | partiel.
2. « resolved » : les questions ouvertes auxquelles <nouveau> apporte une vraie réponse, même formulée autrement que la question (ex. Q « Combien de temps pour réserver ? » ← « il faut que ça prenne moins de 30 secondes »). La réponse doit contenir l'information demandée : jamais « n'a pas encore précisé », jamais une déduction. Résume-la en une phrase fidèle à ses mots. Sinon la question reste ouverte.
3. « new_questions » : 0 à {{NEW}} nouvelles questions, seulement si elles font vraiment avancer le prompt final : clarifier un point flou qu'elle vient d'évoquer, une décision qu'elle n'a pas prise, une contrainte ou un critère de réussite manquant, un cas limite. Courtes (≤ 14 mots), tutoiement, une seule chose par question, jamais une question déjà posée ou déjà répondue. Pour chacune, 0 à 3 « suggestions » de réponse (≤ 6 mots) qu'elle pourra cliquer.
4. Ne donne jamais ton avis, ne propose pas de solution, ne réponds pas à sa place.

Réponds UNIQUEMENT en JSON :
{"slots":{"action":{"value":"…","status":"ok"}},"resolved":[{"id":"q3","answer":"…"}],"new_questions":[{"slot":"criteres","question":"…","suggestions":["…"]}],"title":"titre court du projet si tu peux le déduire de ses mots, sinon \"\""}`;

/**
 * Appel « en direct » pendant le brainstorm (à chaque pause de parole).
 * Coût maîtrisé : on n'envoie que le nouveau morceau + un extrait borné du début + la grille.
 */
export async function liveBrainstorm(
  input: {
    target: Target;
    slots: Record<SlotKey, Slot>;
    open: { id: string; question: string }[];
    asked: string[]; // toutes les questions déjà posées (pour éviter les doublons)
    said: string; // transcription depuis le début
    fresh: string; // ce qui vient d'être dit
    maxNew: number;
  },
  opts: { signal?: AbortSignal } = {},
): Promise<{
  slots: Record<SlotKey, Slot>;
  resolved: { id: string; answer: string }[];
  questions: Omit<LiveQuestion, 'id'>[];
  title: string;
  provider: string;
}> {
  const said = preClean(input.said);
  const head = said.split(/\s+/).slice(-900).join(' '); // ~1 200 tokens max de contexte
  const system = LIVE_SYSTEM.replace('{{TARGET}}', TARGET_LABEL[input.target]).replace('{{NEW}}', String(Math.max(0, Math.min(3, input.maxNew))));
  const grille = SLOT_KEYS.map((k) => `${k} [${input.slots[k]?.status ?? 'vide'}] : ${input.slots[k]?.value || '—'}`).join('\n');
  const user =
    `<grille>\n${grille}\n</grille>\n<questions_ouvertes>\n${input.open.map((q) => `${q.id} : ${q.question}`).join('\n') || '(aucune)'}\n</questions_ouvertes>\n` +
    `<deja_pose>\n${input.asked.slice(-20).join('\n') || '(rien)'}\n</deja_pose>\n<deja_dit>\n${head}\n</deja_dit>\n<nouveau>\n${preClean(input.fresh)}\n</nouveau>`;
  let parsed: any;
  const r = await call(system, user, 900, opts.signal, (text) => {
    parsed = extractJson(text);
  });
  // Fusion prudente de la grille : on ne garde que les cases renvoyées non vides.
  const slots = { ...input.slots };
  for (const k of SLOT_KEYS) {
    const v = parsed?.slots?.[k];
    const value = clip(v?.value, 1200);
    if (!value) continue;
    const status: Slot['status'] = v?.status === 'ok' ? 'ok' : 'partiel';
    if (slots[k]?.status === 'ok' && status !== 'ok' && value.length < (slots[k]?.value.length ?? 0)) continue;
    slots[k] = { value, status };
  }
  const openIds = new Set(input.open.map((q) => q.id));
  const resolved = (Array.isArray(parsed?.resolved) ? parsed.resolved : [])
    .filter((x: any) => openIds.has(String(x?.id)))
    .map((x: any) => ({ id: String(x.id), answer: clip(x.answer, 400) }));
  const seen = new Set([...input.asked, ...input.open.map((q) => q.question)].map((q) => q.trim().toLowerCase()));
  const questions = (Array.isArray(parsed?.new_questions) ? parsed.new_questions : [])
    .filter((q: any) => SLOT_KEYS.includes(q?.slot) && clip(q?.question, 200) && !seen.has(clip(q.question, 200).toLowerCase()))
    .slice(0, Math.max(0, input.maxNew))
    .map((q: any) => ({
      slot: q.slot as SlotKey,
      question: clip(q.question, 200),
      suggestions: (Array.isArray(q.suggestions) ? q.suggestions : []).map((s: unknown) => clip(s, 50)).filter(Boolean).slice(0, 3),
    }));
  return { slots, resolved, questions, title: clip(parsed?.title, 80), provider: r.provider };
}

// CBW AI — mode « prise de notes » : une longue session parlée (10–15 min ou plus)
// devient une note Markdown organisée. Même principe que prompt.ts : on organise
// ce qui a été dit, on n'invente rien et on ne répond pas aux questions.
//
// Pipeline : transcript ──(> ~4 500 mots ?)──▶ découpe en parties ──▶ notes partielles ──▶ fusion
//            sinon ──▶ une seule passe. Fournisseurs essayés dans l'ordre NOTES_ORDER
//            (grands contextes d'abord), délais longs : la note n'est pas une dictée temps réel.

import { loadConfig } from './config.ts';
import { getProvider } from './router.ts';
import { preClean } from './prompt.ts';
import type { ProviderId } from '../shared/types.ts';

export const NOTES_PROMPT_VERSION = 'notes-v2.0';

/** Grands contextes et bonne qualité d'abord ; Ollama en dernier (contexte local limité). */
export const NOTES_ORDER: ProviderId[] = ['gemini', 'groq', 'mistral', 'zai', 'cloudflare', 'openrouter', 'ollama'];

const CHUNK_WORDS = 3500; // ~20–25 min de parole par partie : tient dans les quotas gratuits et garde l'exhaustivité

const RULES = `Tu es le module « prise de notes » de CBW AI.
Tu reçois, entre <transcription> et </transcription>, la transcription (reconnaissance vocale, donc imparfaite) d'une session parlée : réunion, appel, visio, réflexion à voix haute, brief, cours. Elle peut durer de quelques minutes à plus d'une heure.
Quand plusieurs personnes parlent, chaque ligne est de la forme « [mm:ss] Personne 2 : texte » (ou « Moi : » pour la personne qui enregistre). Sinon, c'est un texte continu d'une seule personne.
Tu en fais un COMPTE RENDU EXHAUSTIF ET STRUCTURÉ en Markdown, dans la langue de la transcription. Objectif : la personne ne doit plus jamais avoir besoin de réécouter la session.

# Règles d'or
1. Exhaustivité : chaque sujet abordé et chaque point concret (fait, chiffre, argument, objection, proposition, exemple, contrainte, décision, action, question) apparaît dans le compte rendu. Ne résume pas au point de perdre une information. Seuls disparaissent les hésitations, répétitions, politesses et digressions sans contenu.
2. Fidélité : tu n'ajoutes AUCUNE information, idée, conseil ni conclusion qui n'a pas été dit. Tu ne réponds pas aux questions posées : tu les notes.
3. Attribution : quand les personnes sont identifiées, indique qui a dit, proposé, objecté, décidé ou s'est engagé (« — Personne 2 »). Garde exactement les étiquettes de la transcription (« Personne 2 », « Moi »). Si un prénom est clairement associé à une étiquette dans la conversation (« Merci Julie » juste après que Personne 2 a parlé, ou « moi c'est Marc »), écris « Personne 2 (Julie) » ; jamais de supposition.
4. Faits précis conservés tels quels : chiffres, dates, montants, noms, outils, délais, conditions. Auto-corrections orales appliquées (« trois, enfin non quatre » → quatre).
5. Regroupe par sujet ce qui a été dit à plusieurs moments ; garde l'ordre d'apparition des sujets.
6. Écris en français écrit courant, sobre, en phrases ou puces courtes. Pas de ton « corporate », pas de jargon ajouté.

# Format de sortie (Markdown uniquement, rien avant ni après)
# <Titre court et précis, tiré du contenu>

## En bref
4 à 6 lignes : de quoi il a été question, ce qui a été décidé, ce qui reste à faire.

## Participants
- Personne 1 (prénom si connu) — rôle UNIQUEMENT s'il est dit explicitement (« je suis la cheffe de projet »), sinon rien après le nom ; jamais de rôle déduit
(section seulement s'il y a plusieurs personnes identifiées)

## Sujets abordés
### <Sujet 1>
- tous les points de ce sujet, avec l'attribution quand elle est connue ; sous-puces pour les détails, arguments et objections
- **gras** seulement pour les éléments décisifs (chiffres, échéances, noms)
### <Sujet 2>
…

## Décisions
- décision — qui l'a prise ou validée si c'est dit

## Actions
- [ ] Personne 1 — action — échéance (qui et échéance UNIQUEMENT s'ils ont été dits ; sinon juste l'action)

## Échéances et rendez-vous
- date / heure — objet

## Questions ouvertes
- ce qui reste à trancher ou à vérifier — qui l'a soulevé si c'est connu

## Par personne
### Personne 1
- ses positions, propositions, objections et engagements, en une ligne chacun
(section seulement s'il y a plusieurs personnes identifiées)

## Chronologie
- mm:ss — sujet ou moment clé (seulement si la transcription est horodatée ; 5 à 15 repères)

N'écris PAS une section si rien ne la remplit (pas de « Aucune »).
Si la transcription est trop courte ou vide de contenu, renvoie seulement : # Note vide`;

const PART_RULES = `${RULES}

# Cas particulier : transcription découpée
Tu reçois ici UNE PARTIE (indiquée « Partie k/n ») d'une longue session. Fais le compte rendu de cette partie seulement, avec le même format et la même exhaustivité, mais SANS « # Titre » ni « ## En bref » : commence directement par « ## Participants » ou « ## Sujets abordés ».`;

const MERGE_RULES = `Tu es le module « prise de notes » de CBW AI.
Tu reçois, entre <notes> et </notes>, les comptes rendus partiels successifs d'une même longue session parlée.
Fusionne-les en UN compte rendu final, avec exactement le format ci-dessous :
- garde TOUS les sujets et TOUS les points des parties (l'exhaustivité prime sur la concision) ; fusionne seulement les doublons stricts ;
- regroupe sous un même « ### » les sujets qui reviennent dans plusieurs parties ;
- garde chaque fait précis et chaque attribution ; si une partie ultérieure corrige une précédente, garde la version corrigée ;
- n'ajoute rien qui ne soit dans les comptes rendus partiels ; écris un « ## En bref » qui couvre toute la session.

${RULES.slice(RULES.indexOf('# Format de sortie'))}`;

const COVERAGE_RULES = `Tu es le module « prise de notes » de CBW AI.
Tu reçois un compte rendu final (<final>) et des passages de comptes rendus partiels dont les sujets semblent absents du final (<manquants>).
Réécris le compte rendu final COMPLET en y intégrant ces sujets et leurs points (dans « ## Sujets abordés », et dans Décisions / Actions / Questions / Par personne si concerné), sans rien retirer ni inventer. Même format. Markdown uniquement.`;

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Découpe aux fins de phrase les plus proches de CHUNK_WORDS mots. */
export function splitTranscript(text: string, max = CHUNK_WORDS): string[] {
  const w = words(text);
  if (w.length <= max) return [text];
  // Transcription par tours de parole (« [mm:ss] Personne 2 : … ») : on coupe entre deux tours, jamais au milieu.
  if (/^\[\d{1,3}:\d{2}\]/m.test(text)) {
    const parts: string[] = [];
    let cur: string[] = [];
    let n = 0;
    for (const line of text.split('\n')) {
      const lw = words(line).length;
      if (n + lw > max && cur.length) { parts.push(cur.join('\n')); cur = []; n = 0; }
      cur.push(line);
      n += lw;
    }
    if (cur.length) parts.push(cur.join('\n'));
    return parts;
  }
  const parts: string[] = [];
  let start = 0;
  while (start < w.length) {
    let end = Math.min(w.length, start + max);
    if (end < w.length) {
      // recule jusqu'à une fin de phrase (au plus 400 mots) pour ne pas couper une idée
      for (let i = end; i > end - 400 && i > start + 100; i--) {
        if (/[.!?…]$/.test(w[i - 1])) { end = i; break; }
      }
    }
    parts.push(w.slice(start, end).join(' '));
    start = end;
  }
  return parts;
}

export interface NotesResult {
  markdown: string;
  title: string;
  provider: string;
  model: string;
  parts: number;
  latencyMs: number;
}

const normTopic = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Sections « ### sujet » des parties dont aucun mot-clé significatif n'apparaît dans le final. */
export function missingTopics(partials: string[], final: string): string[] {
  const fin = normTopic(final);
  const out: string[] = [];
  for (const part of partials) {
    for (const block of part.split(/\n(?=###\s)/)) {
      const h = block.match(/^###\s+(.+)$/m)?.[1];
      if (!h || /^personne\s+\d|^moi\b/i.test(h)) continue;
      const keys = normTopic(h).split(' ').filter((w) => w.length > 4);
      if (keys.length && !keys.some((k) => fin.includes(k))) out.push(block.trim().slice(0, 2500));
    }
  }
  return out.slice(0, 8);
}

/** Nettoyage de la sortie : retire fences, préambules, et vérifie qu'on a bien une note. */
export function postProcessNotes(out: string): string {
  let t = (out ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:markdown|md)?\n?([\s\S]*?)\n?```$/i, '$1').trim();
  t = t.replace(/^(?:voici[^\n]*:\s*\n)/i, '').trim();
  t = t.replace(/<\/?(?:transcription|notes)>/gi, '').trim();
  if (!t) throw new Error('note vide');
  if (!/^#\s/m.test(t) && !/^##\s/m.test(t)) throw new Error('format Markdown attendu absent');
  return t.replace(/\n{3,}/g, '\n\n');
}

async function complete(system: string, user: string, maxTokens: number, signal?: AbortSignal) {
  const cfg = loadConfig();
  // Une note n'est pas du temps réel : délais longs, contexte local plus grand.
  cfg.timeouts = { cloudMs: 120_000, localMs: 300_000 };
  const order = NOTES_ORDER.filter((id) => cfg.providers.includes(id));
  const errors: string[] = [];
  for (const id of order) {
    signal?.throwIfAborted();
    const p = getProvider(id, cfg);
    const av = await p.availability();
    if (!av.ok) continue;
    try {
      const out = await p.complete({ system, user, temperature: 0.1, maxTokens, signal });
      return { text: postProcessNotes(out.text), provider: id, model: out.model };
    } catch (e: any) {
      if (signal?.aborted) throw e;
      errors.push(`${id}: ${e?.message ?? e}`);
    }
  }
  throw new Error(`Aucun moteur n'a pu organiser la note.\n${errors.join('\n')}`);
}

/**
 * Transforme une longue transcription en note organisée.
 * onProgress reçoit (étape, total) pour l'interface (« Organisation 2/4… »).
 */
export async function organizeNotes(
  transcript: string,
  opts: { signal?: AbortSignal; onProgress?: (step: number, total: number) => void } = {},
): Promise<NotesResult> {
  const t0 = performance.now();
  const text = preClean(transcript);
  if (words(text).length < 15) {
    return { markdown: '# Note vide', title: 'Note vide', provider: 'passthrough', model: '', parts: 0, latencyMs: 0 };
  }
  const parts = splitTranscript(text);
  // Compte rendu v2 exhaustif (9 sections, attributions) : la sortie dépasse souvent la longueur de la transcription.
  const outTokens = (w: number) => Math.min(12000, Math.round(w * 1.8) + 2000);
  let final: { text: string; provider: string; model: string };

  if (parts.length === 1) {
    opts.onProgress?.(1, 1);
    final = await complete(RULES, `<transcription>\n${text}\n</transcription>`, outTokens(words(text).length), opts.signal);
  } else {
    const partials: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      opts.onProgress?.(i + 1, parts.length + 1);
      const r = await complete(
        PART_RULES,
        `Partie ${i + 1}/${parts.length}\n<transcription>\n${parts[i]}\n</transcription>`,
        outTokens(words(parts[i]).length),
        opts.signal,
      );
      partials.push(`### Partie ${i + 1}\n${r.text}`);
    }
    opts.onProgress?.(parts.length + 1, parts.length + 1);
    const joined = partials.join('\n\n');
    final = await complete(MERGE_RULES, `<notes>\n${joined}\n</notes>`, outTokens(words(joined).length), opts.signal);
    // Contrôle de couverture : chaque sujet (###) des parties doit se retrouver dans le final.
    const missing = missingTopics(partials, final.text);
    if (missing.length) {
      try {
        const fixed = await complete(
          COVERAGE_RULES,
          `<final>\n${final.text}\n</final>\n<manquants>\n${missing.join('\n\n')}\n</manquants>`,
          outTokens(words(final.text).length + words(missing.join(' ')).length),
          opts.signal,
        );
        if (words(fixed.text).length >= words(final.text).length * 0.9) final = fixed;
      } catch { /* on garde la fusion : mieux qu'un échec */ }
    }
  }

  const title = (final.text.match(/^#\s+(.+)$/m)?.[1] ?? 'Note').trim();
  return {
    markdown: final.text,
    title,
    provider: final.provider,
    model: final.model,
    parts: parts.length,
    latencyMs: Math.round(performance.now() - t0),
  };
}

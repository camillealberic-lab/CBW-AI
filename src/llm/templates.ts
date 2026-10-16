// CBW AI — gabarits de compte rendu (français). Un gabarit = un nom + les sections attendues.
// Changeable après coup : on relance organizeNotes() avec un autre `template` (même transcription, mêmes notes).
// Module pur (aucun appel réseau) : testable sans LLM.

export interface NoteTemplate {
  id: string;
  /** Libellé affiché dans le sélecteur. */
  label: string;
  /** Une ligne sous le libellé. */
  hint: string;
  /** Sections attendues, dans l'ordre. Une section vide est omise (jamais « Aucune »). */
  sections: { title: string; guide: string }[]; // thèmes (paragraphes rédigés) ; le résumé général et « Prochaines étapes » viennent de la forme commune
}

export const AUTO_TEMPLATE_ID = 'auto';
export const DEFAULT_TEMPLATE_ID = AUTO_TEMPLATE_ID;

/** Gabarit « général » (id `auto`) : forme unique ; le prompt Auto choisit les thèmes du genre reconnu. */
const GENERAL: NoteTemplate['sections'] = [
  { title: 'Résumé général', guide: '1 à 2 paragraphes : toutes les décisions et conclusions, points ouverts' },
  { title: 'Thèmes', guide: 'un « ## thème » par sujet, en paragraphes rédigés' },
  { title: 'Prochaines étapes', guide: 'une seule liste de cases à cocher par personne' },
];

/** Genres reconnus par le mode Auto. */
export type NoteKind = 'reunion' | 'brainstorm' | 'cours' | 'collegues' | 'client' | 'recrutement';
export const NOTE_KINDS: NoteKind[] = ['reunion', 'brainstorm', 'cours', 'collegues', 'client', 'recrutement'];

/** Forme commune à tous les genres et gabarits (décision de Camille, 16 oct.). */
export const DEPTH_RULE = 'FORME : (1) paragraphe(s) général(aux), 1 à 2, sans titre, couvrant TOUTES les décisions et conclusions (quoi, qui, pourquoi) et ce qui reste ouvert ; (2) un « ## thème » nommé d’après le contenu, en paragraphes rédigés (prose, aucune puce) : le quoi, le comment, chiffres, raisons, nuances ; thèmes par sujet, JAMAIS chronologiques ni par phases, aucune expression de temps (« au début », « ensuite », « puis ») ni horodatage ; (3) UNE seule liste à la fin, « ## Prochaines étapes ». Un encadré « > **À retenir** » ou une citation : rares. Le genre adapte les thèmes, pas la forme.';

/** Thèmes de chaque genre (forme commune : DEPTH_RULE). */
export const KIND_PLANS: Record<NoteKind, { label: string; plan: string }> = {
  reunion: { label: 'réunion de travail', plan: 'thèmes = sujets traités (2 à 6) ; décision, responsable, échéance et condition intégrés au thème ; points ouverts dans le thème concerné' },
  brainstorm: { label: 'brainstorm / atelier', plan: 'thèmes = groupes d’idées (qui l’a proposée si dit), idées retenues et pourquoi, pistes à explorer, questions soulevées' },
  cours: { label: 'cours / conférence', plan: 'thèmes = notions clés (définition en une phrase, exemples, chiffres, références) ; « À retenir » autorisé ; questions de la salle dans le thème concerné ; Prochaines étapes seulement si des tâches sont dites' },
  collegues: { label: 'conversation entre collègues', plan: 'thèmes = sujets abordés, avec la position de chacun, accords et désaccords' },
  client: { label: 'entretien client', plan: 'thèmes = besoins exprimés (mots du client), situation actuelle, budget/délais/décideurs (si dit), objections et signaux d’achat' },
  recrutement: { label: 'entretien de recrutement', plan: 'thèmes = profil, points forts (exemples cités), points de vigilance, adéquation au poste, avis et suite' },
};

/** Genre associé à un gabarit explicite. */
const TEMPLATE_KIND: Record<string, NoteKind> = { auto: 'reunion', equipe: 'reunion', 'un-a-un': 'collegues', client: 'client', recrutement: 'recrutement', atelier: 'brainstorm', cours: 'cours' };
export const kindOfTemplate = (id?: string): NoteKind => TEMPLATE_KIND[id ?? 'auto'] ?? 'reunion';

export const TEMPLATES: NoteTemplate[] = [
  { id: 'auto', label: 'Auto', hint: 'Résumé général, thèmes rédigés, prochaines étapes : l’IA reconnaît le genre', sections: GENERAL },
  {
    id: 'equipe', label: 'Point d’équipe', hint: 'Avancement, blocages, décisions',
    sections: [
      { title: 'Avancement', guide: 'ce qui avance ou est terminé, par personne ou par sujet' },
      { title: 'Blocages et risques', guide: 'ce qui coince, qui peut débloquer' },
      { title: 'Décisions', guide: 'décisions prises, intégrées au thème concerné' },
    ],
  },
  {
    id: 'un-a-un', label: '1:1', hint: 'Échange entre deux personnes',
    sections: [
      { title: 'Ressenti et contexte', guide: 'comment ça va, ce qui occupe l’autre' },
      { title: 'Sujets discutés', guide: 'un thème par sujet' },
      { title: 'Soutien demandé', guide: 'aides, arbitrages ou ressources demandés' },
      { title: 'Retours donnés', guide: 'feedbacks positifs ou à améliorer, tels que dits' },
    ],
  },
  {
    id: 'client', label: 'Rendez-vous client', hint: 'Besoins, objections, prochaines étapes',
    sections: [
      { title: 'Contexte', guide: 'qui est le client, pourquoi ce rendez-vous' },
      { title: 'Besoins et problèmes exprimés', guide: 'dans les mots du client' },
      { title: 'Situation actuelle', guide: 'outils, process, contraintes en place' },
      { title: 'Budget, délais, décideurs', guide: 'seulement ce qui est dit' },
      { title: 'Objections et signaux d’achat', guide: 'freins et intérêts exprimés' },
    ],
  },
  {
    id: 'recrutement', label: 'Recrutement', hint: 'Entretien avec un candidat',
    sections: [
      { title: 'Profil', guide: 'parcours, poste visé, disponibilité (seulement ce qui est dit)' },
      { title: 'Points forts', guide: 'ce qui ressort de positif, avec les exemples cités' },
      { title: 'Points de vigilance', guide: 'réserves, zones floues, contradictions' },
      { title: 'Adéquation au poste', guide: 'lien avec le poste, la motivation, les attentes (salaire si cité)' },
      { title: 'Décision et suite', guide: 'avis exprimé' },
    ],
  },
  {
    id: 'atelier', label: 'Atelier / brainstorm', hint: 'Idées, regroupements, choix',
    sections: [
      { title: 'Objectif', guide: 'la question ou le défi de l’atelier' },
      { title: 'Idées', guide: 'regroupées par thème, avec qui les a proposées si c’est dit' },
      { title: 'Idées retenues', guide: 'ce qui a été choisi et pourquoi' },
      { title: 'Questions ouvertes', guide: 'ce qui reste à explorer' },
    ],
  },
  {
    id: 'cours', label: 'Cours / conférence', hint: 'Notes d’apprentissage d’un intervenant',
    sections: [
      { title: 'Thème', guide: 'sujet et intervenant si cités' },
      { title: 'Notions clés', guide: 'une notion par thème, définitions et exemples donnés' },
      { title: 'Chiffres et références', guide: 'données, noms, livres, outils cités' },
      { title: 'Questions et réponses', guide: 'questions de la salle et réponses' },
    ],
  },
];

export function getTemplate(id?: string): NoteTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Liste pour le sélecteur de l'interface. */
export function listTemplates(): { id: string; label: string; hint: string }[] {
  return TEMPLATES.map(({ id, label, hint }) => ({ id, label, hint }));
}

/**
 * Auto : devine le gabarit à partir du titre/description (calendrier) et du texte parlé.
 * Heuristique par mots-clés (gratuite, instantanée, déterministe). Repli : « auto » (sections générales).
 * Le LLM garde la main : en mode Auto le prompt l'autorise à adapter les sections au contenu.
 */
export function guessTemplate(text: string, title = '', speakers = 0): string {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = norm(`${title} ${title} ${title} ${text.slice(0, 6000)}`);
  const score = (re: RegExp) => (t.match(re) ?? []).length;
  const s: Record<string, number> = {
    'un-a-un': score(/\b(1[:\-]1|one to one|one-to-one|1 to 1)\b|\bpoint individuel\b|\bentretien annuel\b|\bfeedback\b/g) * 3 + (speakers === 2 ? 1 : 0),
    equipe: score(/\bstand-?up\b|\bdaily\b|\bsprint\b|\bpoint (d.equipe|hebdo)\b|\bblocage|\bavancement\b|\bretro(spective)?\b|\bweekly\b/g),
    client: score(/\bclient\b|\bdevis\b|\bproposition commerciale\b|\bbudget\b|\bappel d.offre\b|\bdemo\b|\bprospect\b|\bcontrat\b/g),
    recrutement: score(/\bcandidat|\brecrutement\b|\bentretien d.embauche\b|\bcv\b|\bposte\b|\bsalaire\b|\bparcours\b|\bexperience professionnelle\b/g),
    atelier: score(/\bbrainstorm|\batelier\b|\bidee|\bideation\b|\bon pourrait\b|\bworkshop\b/g),
    cours: score(/\bcours\b|\bconference\b|\bchapitre\b|\bdefinition\b|\bexamen\b|\bprofesseur\b|\bformation\b|\bwebinaire\b/g) + (speakers <= 1 ? 1 : 0),
  };
  let best = 'auto';
  let top = 2; // seuil : moins de 3 indices = pas assez sûr
  for (const [id, v] of Object.entries(s)) if (v > top) { best = id; top = v; }
  return best;
}

/** Genre deviné sans IA (repli quand le modèle n'annonce pas son genre, et pour les longues sessions en parties). */
export function guessKind(text: string, title = '', speakers = 0): NoteKind {
  const t = `${title} ${text}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 6000);
  const lecture = (t.match(/\b(notions?|definitions?|exemples?|a retenir|seance|chapitre|cours|bfr|theoreme)\b/g) ?? []).length;
  if (lecture >= 3 && speakers <= 3) return 'cours';
  let id = guessTemplate(text, title, speakers);
  // Plus de 3 voix : une réunion, pas un entretien en tête à tête.
  if ((id === 'recrutement' || id === 'client' || id === 'un-a-un') && speakers > 3) id = 'auto';
  if (id !== 'auto') return kindOfTemplate(id);
  const casual = (t.match(/\b(franchement|du coup|t.as vu|tu as vu|ouais|grave|genre|bref)\b/g) ?? []).length;
  return speakers >= 2 && speakers <= 3 && casual >= 3 ? 'collegues' : 'reunion';
}

/** Genre annoncé par le modèle sur la 1re ligne « [[genre:xxx]] » ; renvoie aussi le texte sans cette ligne. */
export function extractKind(raw: string): { kind: NoteKind | null; text: string } {
  const m = /^\s*\[\[genre\s*:\s*([a-zé]+)\s*\]\][ \t]*\n?/i.exec(raw);
  if (!m) return { kind: null, text: raw };
  const k = m[1].toLowerCase().replace('é', 'e') as NoteKind;
  return { kind: NOTE_KINDS.includes(k) ? k : null, text: raw.slice(m[0].length) };
}

/** Bloc de consigne « gabarit » ajouté au prompt système. `kind` fixe les thèmes (sans reconnaissance par le modèle). */
export function renderTemplatePrompt(tpl: NoteTemplate, kind?: NoteKind): string {
  if (tpl.id === AUTO_TEMPLATE_ID) {
    if (kind) return `# Forme et thèmes (${KIND_PLANS[kind].label})\n${DEPTH_RULE}\nThèmes : ${KIND_PLANS[kind].plan}. Rien à dire = omis.`;
    const plans = NOTE_KINDS.map((k) => `- ${k} (${KIND_PLANS[k].label}) : ${KIND_PLANS[k].plan}`).join('\n');
    return `# Genre, forme et thèmes\nReconnais le genre. Ligne 1 de la sortie, avant le titre : [[genre:X]] avec X = ${NOTE_KINDS.join('|')} (doute : reunion). Rien à dire = omis.\n${DEPTH_RULE}\nThèmes selon le genre :\n${plans}`;
  }
  const secs = tpl.sections.map((s) => `- ${s.title} : ${s.guide}`).join('\n');
  return `# Gabarit « ${tpl.label} » : thèmes attendus, rédigés en paragraphes (un « ## » par thème, sans puces)\n${secs}\nRien à dire = omis. ${DEPTH_RULE}`;
}

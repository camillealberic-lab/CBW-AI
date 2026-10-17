// Rapport local « Analyse de tes corrections » (apprentissage continu, chantiers/apprentissage/api.md).
// Fonction pure (Markdown) ; learn.ts l'écrit dans ~/.dicta-ai/learning/rapport-AAAA-MM-JJ.md (0600) chaque semaine
// ou à la demande (Style › « Analyser mes corrections »). Sert de base à une proposition de prompt que Camille valide :
// rien n'est jamais écrit automatiquement dans le prompt.
import { aggregate, MIN_HITS, MIN_OBS, prefText, type MotifStat, type Observation, type PrefState } from './prefs';

const DAY = 86_400_000;
export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const FAMILY: Record<string, string> = {
  'delete-end': 'Suppressions en fin de phrase',
  delete: 'Suppressions',
  insert: 'Ajouts',
  reinsert: "Réinsertions (l'IA avait retiré, tu as remis)",
  replace: 'Remplacements de mots',
  rephrase: 'Reformulations',
  newline: 'Retours à la ligne ajoutés',
  'newline-removed': 'Retours à la ligne retirés',
  punct: 'Ponctuation',
};
const ORDER = Object.keys(FAMILY);

const md = (s: string): string => s.replace(/\r?\n/g, ' ↵ ').replace(/[|`]/g, (c) => `\\${c}`);
const motifLabel = (s: MotifStat): string => {
  const rule = s.key.slice(s.key.indexOf(':') + 1);
  if (s.key.endsWith(':*') || s.key === 'rephrase' || s.key === 'newline-removed') return '(divers)';
  if (s.kind === 'punct') return `« ${rule.replace('=>', ' » → « ').replace(/∅/g, 'rien')} »`;
  if (s.kind === 'replace') return `« ${md(s.display.replace(' => ', ' » → « '))} »`;
  return `« ${md(s.display)} »`;
};

export interface ReportSummary {
  observations: number;
  modified: number;
  motifs: number;
}

/**
 * Rapport Markdown sur les `days` derniers jours (7 par défaut). Comptes, motifs les plus fréquents avec 2 extraits
 * courts, préférences apprises, candidats proches du seuil, pistes pour le prompt (à valider par Camille).
 */
export function buildReport(all: Observation[], state: PrefState, now = Date.now(), days = 7): { markdown: string; summary: ReportSummary } {
  const since = now - days * DAY;
  const obs = all.filter((o) => o.at >= since);
  const modified = obs.filter((o) => o.edits.length).length;
  const stats = [...aggregate(obs).values()];
  const total = new Map<string, number>();
  for (const s of stats) total.set(s.kind, (total.get(s.kind) ?? 0) + s.hits);
  const L: string[] = [];
  L.push(`# Analyse de tes corrections — ${dateKey(new Date(now))}`, '');
  L.push(`Période : ${days} derniers jours (du ${dateKey(new Date(since))} au ${dateKey(new Date(now))}). Généré sur ce Mac, sans IA.`, '');
  L.push(`- Dictées relues : **${obs.length}** (sur ${all.length} gardées 60 jours)`);
  L.push(`- Retouchées après collage : **${modified}**${obs.length ? ` (${Math.round((100 * modified) / obs.length)} %)` : ''}`);
  L.push(`- Retouches relevées : **${[...total.values()].reduce((a, b) => a + b, 0)}**`, '');

  L.push('## Par type de retouche', '');
  if (!stats.length) L.push('Aucune retouche relevée sur la période.', '');
  else {
    L.push('| Type | Nombre |', '|---|---:|');
    for (const k of ORDER) if (total.get(k)) L.push(`| ${FAMILY[k]} | ${total.get(k)} |`);
    L.push('');
  }

  L.push('## Motifs qui reviennent', '');
  const top = stats.filter((s) => s.hits >= 2).sort((a, b) => b.hits - a.hits || b.observations - a.observations).slice(0, 25);
  if (!top.length) L.push('Rien qui revienne au moins deux fois.', '');
  for (const s of top) {
    L.push(`- **${FAMILY[s.kind] ?? s.kind}** ${motifLabel(s)} — ${s.hits} fois, dans ${s.observations} dictée(s)`);
    for (const ex of s.examples.slice(0, 2)) L.push(`  - \`${md(ex)}\``);
  }
  L.push('');

  L.push('## Préférences apprises', '');
  if (!state.prefs.length) L.push(`Aucune pour l'instant (il faut ${MIN_HITS} fois, dans ${MIN_OBS} dictées, sans contre-exemple).`, '');
  for (const p of state.prefs) {
    const st = p.active ? 'active' : p.reason === 'contredite' ? 'désactivée (tu l’as contredite)' : 'désactivée';
    L.push(`- ${prefText(p.kind, p.display)} — ${st}, ${p.hits} fois`);
  }
  if (state.prefs.length) L.push('');

  const near = stats
    .filter((s) => ['delete-end', 'delete', 'replace', 'newline', 'reinsert'].includes(s.kind) && !s.key.endsWith(':*'))
    .filter((s) => s.hits >= 3 && !state.prefs.some((p) => p.key === s.key) && !state.rejected.includes(s.key))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10);
  L.push('## Candidats (pas encore des préférences)', '');
  if (!near.length) L.push('Aucun.', '');
  for (const s of near) L.push(`- ${FAMILY[s.kind]} ${motifLabel(s)} — ${s.hits} fois / ${s.observations} dictée(s)`);
  if (near.length) L.push('');

  L.push('## Pistes pour le prompt (à valider par Camille)', '');
  const tips: string[] = [];
  const reins = stats.filter((s) => s.kind === 'reinsert').sort((a, b) => b.hits - a.hits).slice(0, 5);
  if (reins.length) tips.push(`Ne plus retirer : ${reins.map((s) => `« ${md(s.display)} »`).join(', ')} (remis à la main ${reins.reduce((n, s) => n + s.hits, 0)} fois).`);
  const ends = stats.filter((s) => s.kind === 'delete-end' && !s.key.endsWith(':*')).sort((a, b) => b.hits - a.hits).slice(0, 5);
  if (ends.length) tips.push(`Tics de fin de phrase à retirer : ${ends.map((s) => `« ${md(s.display)} » (${s.hits})`).join(', ')}.`);
  if ((total.get('newline') ?? 0) >= 3) tips.push(`Paragraphes : ${total.get('newline')} retours à la ligne ajoutés à la main — revoir la règle des paragraphes.`);
  if ((total.get('rephrase') ?? 0) >= 3) tips.push(`${total.get('rephrase')} reformulations longues : relire les extraits ci-dessus avant de toucher au prompt.`);
  if ((total.get('punct') ?? 0) >= 5) tips.push(`Ponctuation retouchée ${total.get('punct')} fois : voir les motifs « Ponctuation ».`);
  if (!tips.length) tips.push('Rien de net cette semaine : garder le prompt tel quel.');
  for (const t of tips) L.push(`- ${t}`);
  L.push('', '_Rapport local, jamais envoyé. Aucune modification automatique du prompt._', '');
  return { markdown: L.join('\n'), summary: { observations: obs.length, modified, motifs: top.length } };
}

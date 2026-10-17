// Livrables lisibles à partir des sorties du harnais (run.ts) : transcript.md, resume.md, mesures.md, index.html.
//   node --experimental-strip-types scripts/notes-harness/render.ts <sortieAvant> <sortieApres> <calib.txt> <dossierLivrables> [noms.json]
// noms.json (facultatif) : { "Personne 3": { "nom": "Prénom", "pourquoi": "…" } } — affiché en légende, les lignes gardent « Personne N ».
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mergeTurns, type NoteSegment } from '../../src/main/speakers.ts';

const [beforeDir, afterDir, calibFile, dest, namesFile] = process.argv.slice(2);
if (!dest) process.exit(2);
fs.mkdirSync(dest, { recursive: true });
const J = (d: string, f: string) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const labeled: NoteSegment[] = J(afterDir, 'labeled.json');
const stA = J(afterDir, 'stats.json');
const stB = J(beforeDir, 'stats.json');
const tA = J(afterDir, 'timings.json');
const sum = fs.existsSync(path.join(afterDir, 'summary.json')) ? J(afterDir, 'summary.json') : null;
const calib = fs.readFileSync(calibFile, 'utf8').trim().split('\n');
const names: Record<string, { nom: string; pourquoi: string }> = namesFile ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};

const s1 = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const pct = (x: number, t: number) => `${Math.round((100 * x) / (t || 1))} %`;
const mmss = (sec: number) => `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, '0')} s`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── transcript.md
const turns = mergeTurns(labeled);
const legend = Object.entries(names).map(([k, v]) => `- ${k} = ${v.nom} (probable) : ${v.pourquoi}`);
const transcriptMd = [
  '# Ynov Campus — transcription (qui a dit quoi)',
  '',
  `Chaîne de l'app (dicta-meeting Parakeet + FluidAudio, réglages recalibrés le 16 oct.), ${turns.length} tours, ${tA.words} mots, ${new Set(labeled.map((s) => s.speaker)).size} voix.`,
  ...(legend.length ? ['', 'Noms :', ...legend, '- Les autres voix restent « Personne N » : rien dans l’enregistrement ne permet de les nommer sans risque.'] : []),
  '',
  ...turns.map((t) => `**${t.speaker}** : ${t.text}\n`),
].join('\n');
fs.writeFileSync(path.join(dest, 'transcript.md'), transcriptMd);

// ── resume.md (tel que l'app l'enregistre)
const resumeMd = sum ? sum.markdown.trim() + '\n' : '# Résumé indisponible\n';
fs.writeFileSync(path.join(dest, 'resume.md'), resumeMd);

// ── mesures.md
const totA = stA.persons.reduce((a: number, p: { sec: number }) => a + p.sec, 0);
const totB = stB.persons.reduce((a: number, p: { sec: number }) => a + p.sec, 0);
const totW = stA.persons.reduce((a: number, p: { words: number }) => a + p.words, 0);
const diaTot = stA.mergedGroups.reduce((a: number, g: { sec: number }) => a + g.sec, 0);
const stages: { name: string; status: string; ms?: number; detail?: string }[] = sum?.stages ?? [];
const engineMs = tA.transcribeMs + tA.diarizeMs + tA.refineMs + tA.labelMs;
const mesures = [
  '# Ynov Campus — mesures (chaîne Notes de l’app, sans Electron)',
  '',
  `Audio : ${mmss(tA.audioSec)} (${tA.audioSec} s), WAV 16 kHz mono, une piste (présentiel → mode « mix », nombre de personnes non annoncé). Vérité terrain : 3 personnes.`,
  'Harnais : `scripts/notes-harness/run.ts` (mêmes modules que l’app : meetingEngineCore, speakers, notesPipeline).',
  '',
  '## Temps par étape',
  '',
  '| Étape | Temps | Détail |',
  '|---|---|---|',
  `| Transcription (Parakeet, ${tA.slices} tranches ≤ 10 min) | ${s1(tA.transcribeMs)} | ${tA.words} mots, ${tA.segments} segments |`,
  `| Séparation des voix (FluidAudio --fa 0.4) | ${s1(tA.diarizeMs)} | ${stA.rawGroups.length} groupes bruts |`,
  `| Fusion + bribes (refineDiarization) | ${tA.refineMs} ms | ${stA.rawGroups.length} → ${stA.mergedGroups.length} voix |`,
  `| Attribution mot par mot (labelSegments) | ${tA.labelMs} ms | ${stA.transcriptTurns} tours |`,
  ...stages.map((s) => `| Résumé · ${s.name} | ${s.ms != null ? s1(s.ms) : '—'} | ${s.status}${s.detail ? ` (${s.detail})` : ''} |`),
  ...(sum ? [`| **Résumé total** | **${s1(tA.summaryMs)}** | 1er texte à ${s1(tA.firstTextMs)} ; ${sum.provider} / ${sum.model} ; genre ${sum.kind} ; repli ${sum.pipeline.fallback ? 'oui' : 'non'} |`] : []),
  `| **Total (étapes en série)** | **${s1(engineMs + (tA.summaryMs ?? 0))}** | local ${s1(engineMs)} + IA ${s1(tA.summaryMs ?? 0)} |`,
  '',
  '## Voix trouvées',
  '',
  '| | Avant (réglage du 15 oct.) | Après (recalibrage du 16 oct.) | Référence `--speakers 3` |',
  '|---|---|---|---|',
  `| Voix | ${stB.persons.length} | ${stA.persons.length} | 3 |`,
  `| Répartition (tours de la séparation) | ${stB.mergedGroups.map((g: { sec: number }) => pct(g.sec, stB.mergedGroups.reduce((a: number, x: { sec: number }) => a + x.sec, 0))).join(' / ')} | ${stA.mergedGroups.map((g: { sec: number }) => pct(g.sec, diaTot)).join(' / ')} | 54 % / 28 % / 18 % |`,
  '',
  '## Temps de parole et mots par personne (après)',
  '',
  '| Personne | Parole | Part | Mots | Tours |',
  '|---|---|---|---|---|',
  ...stA.persons.map((p: { speaker: string; sec: number; words: number; turns: number }) => `| ${p.speaker}${names[p.speaker] ? ` (${names[p.speaker].nom} ?)` : ''} | ${mmss(p.sec)} | ${pct(p.sec, totA)} | ${p.words} (${pct(p.words, totW)}) | ${p.turns} |`),
  '',
  `Avant : ${stB.persons.length} « personnes », dont Personne 1 = ${pct(stB.persons[0].sec, totB)} du temps et ${stB.persons[0].words} mots sur ${stB.persons.reduce((a: number, p: { words: number }) => a + p.words, 0)} ; les 9 autres sont des bribes de 3 à 8 s.`,
  '',
  '## Calibrage (avant → après, mêmes sorties brutes)',
  '',
  '```',
  ...calib,
  '```',
  '',
  'Voix de synthèse macOS (`scripts/notes-harness/make-tts.ts`, ~55 s et 163 s) : 1 → 1 et 2 → 2 inchangés, pureté identique. Cas à 3 voix de synthèse : déjà à 2 avant (FluidAudio ne sort que 2 groupes bruts, limite du moteur) ; le cas long passe de 3 à 2 car sa 3e « voix » ne pesait que 2 % (pureté 64 → 63 %). La colonne « avant » de la réunion a été mesurée sur le WAV ffmpeg d\u2019origine (3 621 mots), « après » sur le même audio à en-tête 44 octets (3 607 mots).',
  '',
  '## Réglages et problèmes notés',
  '',
  '1. **Corrigé** (`src/main/meetingEngineCore.ts`) : la fusion à cosinus ≥ 0,62 fondait les 3 personnes en une (96 %). En vraie salle, même personne 0,80–0,93, personnes différentes jusqu’à 0,76. Nouveau : 0,78 entre deux groupes de ≥ 30 s, 0,62 sinon ; bribes (< 15 s et < 3 % de la parole) rattachées à la voix principale la plus ressemblante.',
  '2. Vérification du résumé hors délai (délai = 12 s + 3 s par 1 000 mots ≈ 23 s ici) : le résumé n’est pas vérifié sur une réunion de 20 min (repli = oui). `stageTimeouts.verify` paraît trop court (src/llm/notesPipeline.ts, non modifié).',
  '3. La citation « À retenir » est attribuée à « (Moi) » alors qu’en présentiel (mode mix) personne n’est « Moi » : attribution inventée par l’IA. Le bloc de citation sort aussi doublé (« > > »).',
  '4. Analyse : 0 décision, 0 étape (réunion de type atelier/brainstorm : plausible, à confirmer par Camille).',
  '5. Fichier d’entrée converti par ffmpeg : en-tête WAV de 80 octets ; l’app suppose 44 octets (sans effet sur les WAV de session de l’app ; le harnais réécrit un en-tête de 44 octets).',
  '',
].join('\n');
fs.writeFileSync(path.join(dest, 'mesures.md'), mesures);

// ── index.html (autonome, identité CBW)
function md2html(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list = false;
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; if (list) { out.push('</ul>'); list = false; } };
  for (const raw of md.split('\n')) {
    const l = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!l.trim()) { flush(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { flush(); const n = Math.min(4, m[1].length + 2); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flush(); out.push(`<blockquote>${inline(m[1].replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if ((m = l.match(/^\s*[-*]\s+(.*)$/))) { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    para.push(l);
  }
  flush();
  return out.join('\n');
}
const color = ['var(--texte)', 'var(--bleu)', 'var(--orange)', 'var(--vert)'];
const spkIdx = new Map(stA.persons.map((p: { speaker: string }, i: number) => [p.speaker, i]));
const bar = (list: { sec: number }[], tot: number) => `<div class="stack">${list.map((g, i) => `<b style="width:${(100 * g.sec) / tot}%;background:${color[i] ?? 'var(--fil-fort)'}"></b>`).join('')}</div>`;
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes · Ynov Campus</title>
<link rel="stylesheet" href="../../../assets/fonts/fonts.css">
<style>
:root{--fond:#FFFFFF;--fond-2:#F4F4F2;--fond-3:#ECECE8;--texte:#1E1E1C;--texte-sec:#5F5F5A;--trait:#1E1E1C;--fil:#DDDDDD;--fil-fort:#C4C4BF;
  --orange:#FF5A1F;--bleu:#2B3BFF;--vert:#15803D;--erreur:#B3261E;--police:'Archivo',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--fond:#1A1B1D;--fond-2:#202124;--fond-3:#2C2D31;--texte:#ECECEA;--texte-sec:#A3A3A0;--trait:#D9D9D6;--fil:#3A3B3E;--fil-fort:#55565A;--bleu:#7C86FF;--vert:#1FD26A;--erreur:#FF6B5E}}
:root[data-theme="dark"]{--fond:#1A1B1D;--fond-2:#202124;--fond-3:#2C2D31;--texte:#ECECEA;--texte-sec:#A3A3A0;--trait:#D9D9D6;--fil:#3A3B3E;--fil-fort:#55565A;--bleu:#7C86FF;--vert:#1FD26A;--erreur:#FF6B5E}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--texte);font:16px/1.55 var(--police);-webkit-font-smoothing:antialiased}
main{max-width:980px;margin:0 auto;padding:48px 16px 96px}
h1{font-size:clamp(40px,7vw,72px);font-weight:900;font-stretch:80%;line-height:.95;letter-spacing:-.035em;margin:8px 0 16px}
h2{font-size:26px;font-weight:800;letter-spacing:-.01em;margin:56px 0 12px;padding-top:14px;border-top:2px solid var(--trait)}
h3{font-size:19px;font-weight:800;margin:28px 0 8px}h4{font-size:16px;font-weight:800;margin:20px 0 6px}
.lab{font:500 12px/1.3 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec)}
.lede{color:var(--texte-sec);max-width:64ch;margin:0}
.chiffres{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));border:2px solid var(--trait);margin:32px 0}
.chiffres div{padding:16px 18px;border-right:1px solid var(--fil)}
.chiffres div:last-child{border-right:0}
.chiffres strong{display:block;font-size:34px;font-weight:900;font-stretch:85%;letter-spacing:-.02em;line-height:1.1}
.chiffres span{font-size:14px;color:var(--texte-sec)}
table{width:100%;border-collapse:collapse;font-size:15px;margin:12px 0}
th{text-align:left;font:500 12px/1.3 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec);border-bottom:2px solid var(--trait);padding:8px 10px}
td{vertical-align:top;border-bottom:1px solid var(--fil);padding:10px}
td.num{font-family:var(--mono);font-size:13.5px;white-space:nowrap}
.stack{display:flex;height:18px;border:1px solid var(--trait);margin:6px 0 14px}.stack b{display:block;height:100%}
.pastille{display:inline-block;width:10px;height:10px;margin-right:8px;vertical-align:0}
.resume{border:2px solid var(--trait);padding:8px 24px 16px}
.resume blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid var(--orange);background:var(--fond-2)}
.tr{max-height:70vh;overflow:auto;border:1px solid var(--fil);padding:4px 18px}
.tr p{margin:10px 0}.tr p strong{font:700 13px var(--mono)}
pre{background:var(--fond-2);border:1px solid var(--fil);padding:14px 16px;overflow:auto;font:500 12.5px/1.6 var(--mono);white-space:pre-wrap}
.note{border-left:4px solid var(--trait);background:var(--fond-2);padding:12px 16px;margin:16px 0}
.note ol{margin:0;padding-left:20px}.note li{margin:6px 0}
@media (max-width:640px){.chiffres div{border-right:0;border-bottom:1px solid var(--fil)}td.num{white-space:normal}}
</style>
</head>
<body>
<main>
<p class="lab">CBW AI · Notes · essai réel</p>
<h1>Ynov Campus</h1>
<p class="lede">Enregistrement de ${mmss(tA.audioSec)} passé dans la chaîne Notes de l'app (Parakeet + FluidAudio, attribution mot par mot, pipeline qualité du résumé), sans Electron. Vérité terrain : 3 personnes.</p>
<div class="chiffres">
<div><strong>${stA.persons.length}</strong><span>voix après recalibrage (avant : ${stB.persons.length})</span></div>
<div><strong>${tA.words}</strong><span>mots transcrits</span></div>
<div><strong>${s1(engineMs)}</strong><span>transcription + voix (local)</span></div>
<div><strong>${sum ? s1(tA.summaryMs) : '—'}</strong><span>résumé (IA)</span></div>
</div>

<h2>Voix</h2>
<p class="lab">Avant · réglage du 15 oct.</p>${bar(stB.mergedGroups, stB.mergedGroups.reduce((a: number, g: { sec: number }) => a + g.sec, 0))}
<p class="lab">Après · recalibrage du 16 oct.</p>${bar(stA.mergedGroups, diaTot)}
<table><thead><tr><th>Personne</th><th>Parole</th><th>Part</th><th>Mots</th><th>Tours</th></tr></thead><tbody>
${stA.persons.map((p: { speaker: string; sec: number; words: number; turns: number }, i: number) => `<tr><td><span class="pastille" style="background:${color[i]}"></span>${esc(p.speaker)}${names[p.speaker] ? ` <span class="lab">${esc(names[p.speaker].nom)} ?</span>` : ''}</td><td class="num">${mmss(p.sec)}</td><td class="num">${pct(p.sec, totA)}</td><td class="num">${p.words}</td><td class="num">${p.turns}</td></tr>`).join('\n')}
</tbody></table>
${legend.length ? `<div class="note">${Object.entries(names).map(([k, v]) => `<strong>${esc(k)} = ${esc(v.nom)} (probable)</strong> : ${esc(v.pourquoi)}`).join('<br>')}<br>Les autres voix restent « Personne N » : rien ne permet de les nommer sans risque.</div>` : ''}

<h2>Résumé</h2>
<p class="lab">Tel que l'app l'enregistre${sum ? ` · ${esc(sum.provider)} / ${esc(sum.model)} · genre ${esc(sum.kind)}` : ''}</p>
<div class="resume">${md2html(resumeMd)}</div>

<h2>Transcription</h2>
<p class="lab">${turns.length} tours · qui a dit quoi</p>
<div class="tr">
${turns.map((t) => `<p><strong style="color:${color[(spkIdx.get(t.speaker) as number) ?? 0]}">${esc(t.speaker)}</strong> : ${esc(t.text)}</p>`).join('\n')}
</div>

<h2>Mesures</h2>
<table><thead><tr><th>Étape</th><th>Temps</th><th>Détail</th></tr></thead><tbody>
<tr><td>Transcription (Parakeet, ${tA.slices} tranches)</td><td class="num">${s1(tA.transcribeMs)}</td><td>${tA.words} mots, ${tA.segments} segments</td></tr>
<tr><td>Séparation des voix (FluidAudio)</td><td class="num">${s1(tA.diarizeMs)}</td><td>${stA.rawGroups.length} groupes bruts</td></tr>
<tr><td>Fusion + bribes</td><td class="num">${tA.refineMs} ms</td><td>${stA.rawGroups.length} → ${stA.mergedGroups.length} voix</td></tr>
<tr><td>Attribution mot par mot</td><td class="num">${tA.labelMs} ms</td><td>${stA.transcriptTurns} tours</td></tr>
${stages.map((s) => `<tr><td>Résumé · ${esc(s.name)}</td><td class="num">${s.ms != null ? s1(s.ms) : '—'}</td><td>${esc(s.status)}${s.detail ? ` (${esc(s.detail)})` : ''}</td></tr>`).join('\n')}
${sum ? `<tr><td><strong>Résumé total</strong></td><td class="num"><strong>${s1(tA.summaryMs)}</strong></td><td>1er texte à ${s1(tA.firstTextMs)}, repli ${sum.pipeline.fallback ? 'oui' : 'non'}</td></tr>` : ''}
</tbody></table>
<p class="lab">Calibrage · mêmes sorties brutes, avant → après</p>
<pre>${esc(calib.join('\n'))}</pre>
<div class="note"><ol>
<li><strong>Corrigé</strong> : la fusion à cosinus ≥ 0,62 fondait les 3 personnes en une (96 %). Nouveau : 0,78 entre deux groupes de 30 s ou plus, 0,62 sinon ; bribes de moins de 15 s rattachées à la voix la plus ressemblante.</li>
<li>Vérification du résumé hors délai (≈ 23 s pour 3 600 mots) : résumé non vérifié, repli.</li>
<li>Citation « À retenir » attribuée à « (Moi) » alors que personne n'est « Moi » en présentiel ; bloc de citation doublé.</li>
<li>0 décision, 0 étape trouvées (atelier de conception : plausible).</li>
</ol></div>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(dest, 'index.html'), html);
console.log(`livrables : ${dest} (${turns.length} tours)`);

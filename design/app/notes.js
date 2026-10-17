/* CBW AI — écran « Notes », organisé comme Wispr Notetaker (chantiers/notes-v2/wispr-structure.md, 15 changements,
   réponses de Camille dans tickets.md › « Organisation façon Wispr Notetaker »), en identité CBW (design/cbw/DESIGN.md).
   Deux niveaux dans la même page :
   - L1 (#notes) : liste pleine largeur. En-tête « Notes » + réglages + « Nouvelle note » (⌘N). Bloc « À venir » (agenda,
     seulement si activé : 3 réunions, « Afficher N de plus », Démarrer / Rejoindre et démarrer), puis « Notes précédentes »
     groupées par jour (heure seule), recherche à droite, menu … par ligne. Note en cours en tête (onde + chrono).
     Aperçu à droite (280 px) : suit le survol ou la sélection (horaire, Participants, Vue d'ensemble).
   - L2 (#notes:<id>) : la note remplace la liste. Retour, menu …, Note précédente / suivante (J / K). Gros titre, puce date,
     voix. Onglets Transcription · Résumé (Transcription pendant l'enregistrement, Résumé pour une note passée), outils dans
     chaque onglet (chrono / « 3 voix • 42 min » · Chercher · Copier tout · Nommer les voix ; « N min de lecture » · Chercher ·
     Copier · …). Barre du bas flottante : Démarrer / Arrêter / Reprendre / Finalisation… + « Demander… » après l'arrêt.
     Pas de pause, pas d'Annuler (« Démarré par erreur ? Garder / Jeter » après coup).
   Gardé de CBW : texte gris = IA, noir = retouché par toi, résumé en prose pleine largeur, sans heure (les heures restent dans l'onglet Transcription),
   renommage au clic (2 extraits, Partout / Ce passage seulement), fenêtre « Nommer les voix », thème sombre, clavier.
   Cartes flottantes (toutes pages) : « Réunion détectée » (10 s, bouton principal + menu) et « Toujours là ? ».
   Contrat : docs/APP_API.md › Notes v2. Sans `api.notesV2` (navigateur) : démo jouable (?notes=liste|pendant|pendant-liste|
   apres|transcription|voix|renommer|detection|detection-menu|autostop|arret|progression|court|vide).
   Usage : window.CBWNotes.mount(container, { api, navigate, toast, confirm, noteId }) → { open(sub), start(), unmount() }
   Tout texte venant de l'utilisateur, du LLM, de l'agenda ou de la transcription passe par esc() avant innerHTML. */
(function () {
  'use strict';

  /* ═════════ Styles (scopés sous .cbwr, cartes sous .cbwc) ═════════ */
  const CSS = `
.cbwr,.cbwc{--bleu-texte:#2B3BFF;--o-s:var(--ombre-dure-s,4px 4px 0 var(--trait));--es:var(--ease-sortie,cubic-bezier(.16,1,.3,1))}
.cbwr{--marge:88px;--gi:24px;--col:720px;--t-titre:clamp(44px,4.4vw,68px);--t-sujet:21px;--t-corps:17px;--l:28px;
  --ia:var(--texte-sec);--hl:var(--fond-3);
  --c-moi:var(--texte);--c-p2:#0F766E;--c-p3:#8A5A00;--c-p4:#9D174D;--c-p5:#6D28D9;--c-p6:#4D7C0F;--c-autres:#0F766E;
  position:relative;height:100%;min-height:0;container:win / inline-size;
  font-family:var(--police);font-size:14px;line-height:1.45;color:var(--texte);background:var(--fond);-webkit-font-smoothing:antialiased}
:root[data-theme="dark"] .cbwr,:root[data-theme="dark"] .cbwc{--bleu-texte:#7C86FF}
:root[data-theme="dark"] .cbwr{--c-p2:#5EEAD4;--c-p3:#E0B050;--c-p4:#F9A8D4;--c-p5:#C4B5FD;--c-p6:#A3E635;--c-autres:#5EEAD4}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .cbwr,:root:not([data-theme="light"]) .cbwc{--bleu-texte:#7C86FF}
  :root:not([data-theme="light"]) .cbwr{--c-p2:#5EEAD4;--c-p3:#E0B050;--c-p4:#F9A8D4;--c-p5:#C4B5FD;--c-p6:#A3E635;--c-autres:#5EEAD4}}
.cbwr *,.cbwc *{box-sizing:border-box}
.cbwr button,.cbwr input,.cbwr select,.cbwc button{font:inherit;color:inherit}
.cbwr button,.cbwc button{cursor:pointer;background:none;border:0;padding:0;border-radius:0}
.cbwr :focus-visible,.cbwc :focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.cbwr [hidden],.cbwc[hidden],.cbwc [hidden]{display:none!important}
.cbwr .sr,.cbwc .sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cbwr svg.i,.cbwc svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:square;stroke-linejoin:miter;flex:none}
.cbwr .btn1,.cbwr .btn2,.cbwr .btn3,.cbwc .btn1,.cbwc .btn2,.cbwc .btn3{min-height:44px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;transition:background-color var(--d-2) var(--ease),border-color var(--d-2) var(--ease),color var(--d-2) var(--ease),transform var(--d-1) var(--ease)}
.cbwr .btn1,.cbwc .btn1{padding:0 18px;background:var(--inverse-fond);color:var(--inverse-texte);font-weight:800;font-size:15px}
.cbwr .btn2,.cbwc .btn2{padding:0 14px;border:1px solid var(--fil-fort);background:var(--surface);font-weight:700;font-size:14px}
.cbwr .btn2:hover,.cbwc .btn2:hover{background:var(--fond-2);border-color:var(--texte)}
.cbwr .btn3,.cbwc .btn3{padding:0 8px;color:var(--texte-sec);font-weight:600;font-size:14px;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:4px}
.cbwr .btn3:hover,.cbwc .btn3:hover{color:var(--texte);text-decoration-color:currentColor}
.cbwr .btn1:active,.cbwr .btn2:active,.cbwc .btn1:active,.cbwc .btn2:active{transform:scale(.98)}
.cbwr .btn1:disabled,.cbwr .btn2:disabled,.cbwr .btn-i:disabled{opacity:.45;cursor:not-allowed}
.cbwr .btn-i,.cbwc .btn-i{width:44px;height:44px;display:grid;place-items:center;color:var(--texte-sec);flex:none}
.cbwr .btn-i:not(:disabled):hover,.cbwc .btn-i:hover{background:var(--fond-2);color:var(--texte)}
.cbwr .btn-i[aria-expanded="true"],.cbwr .btn-i[aria-pressed="true"]{color:var(--texte);background:var(--fond-3)}
.cbwr kbd,.cbwc kbd{font:500 12px/1 var(--mono);border:1px solid var(--fil-fort);padding:2px 6px;color:var(--texte-sec)}
.cbwr .lab{margin:0;font:500 12px/1.3 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec)}
.cbwr .esp{flex:1}
/* ── Niveaux ── */
.cbwr .l1{display:block;height:100%;min-height:0;overflow:auto}
.cbwr .l2{display:flex;flex-direction:column;height:100%;min-height:0;position:relative}
.cbwr[data-niveau="note"] .l1,.cbwr[data-niveau="liste"] .l2{display:none}
/* ── L1 : liste ── */
.cbwr .l1-main{min-width:0}
/* Gabarit commun des pages (app.html › .page / .page-head) : marges var(--s5) var(--gout) var(--s6), 1120 px max,
   H1 900 / 80 % qui monte d'un masque (420 ms, --ease-rideau), sections en cascade (40 ms). */
.cbwr .ln{display:block;overflow:hidden;padding-bottom:.08em;margin-bottom:-.08em}
.cbwr .ln > span{display:inline-block}
.cbwr .page-head h1 .ln > span,.cbwr .titre{animation:cbwLn 420ms var(--ease-rideau,cubic-bezier(.7,0,.15,1)) both}
@keyframes cbwLn{from{transform:translateY(105%)}to{transform:none}}
@keyframes cbwRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.cbwr .l1-cadre > .page-head,.cbwr .l1-in > *,.cbwr .apercu,.cbwr .feuille > :not(.regle){animation:cbwRise var(--d-3) var(--ease) both}
.cbwr .l1-in > :nth-child(1),.cbwr .feuille > :nth-child(2){animation-delay:40ms}
.cbwr .l1-in > :nth-child(2),.cbwr .apercu,.cbwr .feuille > :nth-child(3){animation-delay:80ms}
.cbwr .l1-in > :nth-child(n+3),.cbwr .feuille > :nth-child(n+4){animation-delay:120ms}
/* Même conteneur que .page (app.html) : 1120 px max centré, marges var(--gout). L'aperçu est une colonne interne,
   séparée de la liste par la gouttière de la grille de l'Accueil (var(--s5)). */
.cbwr .l1-cadre{max-width:1120px;margin:0 auto;padding:var(--s5,48px) var(--gout,64px) var(--s6,64px);display:grid;grid-template-columns:minmax(0,1fr) 280px;column-gap:var(--s5,48px);align-items:start}
.cbwr .l1-cadre > .page-head{grid-column:1 / -1}
.cbwr .page-head{margin-bottom:var(--s5,48px)}
.cbwr .page-head h1{margin:0 0 var(--s2,16px);font-size:clamp(44px,4.4vw,68px);line-height:.92;font-weight:900;font-stretch:80%;letter-spacing:-.045em}
.cbwr .page-head .lede{margin:0;font-size:15px;line-height:1.55;color:var(--texte-sec);max-width:40em}
.cbwr .l1-tete{display:flex;align-items:flex-end;gap:var(--s2,16px) var(--s3,24px);flex-wrap:wrap}
.cbwr .l1-tete .ph-t{flex:1;min-width:260px}
.cbwr .l1-tete .ph-a{display:flex;align-items:center;gap:8px}
.cbwr .l1-tete .btn2 kbd{margin-left:4px}
.cbwr .avenir{border:2px solid var(--trait);padding:10px 10px 8px;margin:0 0 32px}
.cbwr .av-h{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 0 0 6px}
.cbwr .av-h .lab::before{content:"";display:inline-block;width:10px;height:10px;background:var(--bleu-texte);margin-right:8px;vertical-align:-1px}
.cbwr .av-j{padding:12px 6px 4px}
.cbwr .ev{position:relative;display:grid;grid-template-columns:4px minmax(0,1fr) auto;column-gap:12px;align-items:center;min-height:60px;padding:4px 6px 4px 6px;margin-top:4px}
.cbwr .ev:hover,.cbwr .ev:focus-within,.cbwr .ev.sel{background:var(--fond-2)}
.cbwr .ev .bar{align-self:stretch;background:var(--fil-fort)}
.cbwr .ev[data-now] .bar{background:var(--trait)}
.cbwr .ev-m{display:block;text-align:left;min-height:48px;padding:4px 0;min-width:0}
.cbwr .ev-m b{display:block;font-size:15px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbwr .ev[data-now] .ev-m b{font-weight:800}
.cbwr .ev-m small{display:block;font:500 12px/18px var(--mono);color:var(--texte-sec)}
.cbwr .ev-d{display:flex;align-items:center;gap:8px}
.cbwr .cpt{font:500 12px/1 var(--mono);color:var(--texte-sec);white-space:nowrap}
.cbwr .ev[data-now] .cpt{color:var(--texte);font-weight:700}
.cbwr .ev-act{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;align-items:center;padding-left:12px;background:var(--fond-2);opacity:0;pointer-events:none;transition:opacity var(--d-2) var(--ease)}
.cbwr .ev:hover .ev-act,.cbwr .ev:focus-within .ev-act,.cbwr .ev.sel .ev-act,.cbwr .ev[data-now] .ev-act{opacity:1;pointer-events:auto}
.cbwr .ev[data-now] .ev-act{background:var(--fond)}
.cbwr .ev[data-now]:hover .ev-act,.cbwr .ev[data-now]:focus-within .ev-act{background:var(--fond-2)}
.cbwr .ev-act .btn2{min-height:40px}
.cbwr .ev-act .btn-i{height:40px;width:36px;border:1px solid var(--fil-fort);border-left:0;background:var(--surface)}
.cbwr .av-vide{margin:0;padding:10px 6px 8px;font-size:14px;color:var(--texte-sec)}
.cbwr .av-plus{padding:4px 6px 0}
.cbwr .np-tete{display:flex;align-items:center;gap:16px;min-height:44px;border-bottom:2px solid var(--trait);padding-bottom:10px}
.cbwr .np-tete h2{font-size:12px}
.cbwr .cherche{position:relative;width:min(320px,100%)}
.cbwr .cherche input{width:100%;height:44px;border:2px solid var(--trait);border-radius:0;background:var(--surface);padding:0 10px 0 38px;font-size:14px}
.cbwr .cherche input::placeholder{color:var(--texte-3)}
.cbwr .cherche svg{position:absolute;left:11px;top:12px;color:var(--texte-sec)}
.cbwr .jour{padding:22px 12px 6px}
.cbwr .ligne{position:relative}
.cbwr .reu{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;column-gap:14px;width:100%;min-height:60px;padding:10px 56px 10px 9px;text-align:left;border-left:3px solid transparent;transition:background-color var(--d-2) var(--ease)}
.cbwr .reu:hover,.cbwr .ligne.sel .reu{background:var(--fond-2)}
.cbwr .reu[aria-current="true"]{background:var(--fond-3);border-left-color:var(--trait)}
.cbwr .reu b{display:block;font-size:15px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbwr .reu small{display:flex;align-items:center;gap:8px;font:500 12px/18px var(--mono);color:var(--texte-sec);margin-top:2px}
.cbwr .reu .st-l{color:var(--bleu-texte)}
.cbwr .reu .st-e{color:var(--erreur);font-weight:700}
.cbwr .reu .ex{display:block;font-size:13px;line-height:18px;color:var(--texte-sec);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbwr .ligne .plus{position:absolute;right:6px;top:8px;opacity:0;transition:opacity var(--d-2) var(--ease)}
.cbwr .ligne:hover .plus,.cbwr .ligne:focus-within .plus,.cbwr .ligne .plus[aria-expanded="true"]{opacity:1}
.cbwr .ligne.endirect .reu{border-left-color:var(--orange)}
.cbwr .pile{display:flex;align-items:center;min-width:36px}
.cbwr .reu .pile{width:78px}
.cbwr .pile i{width:30px;height:30px;display:grid;place-items:center;font:700 11px/1 var(--mono);font-style:normal;background:var(--c,var(--fond-3));color:var(--fond);border:2px solid var(--fond);margin-left:-8px}
.cbwr .pile i:first-child{margin-left:0}
.cbwr .pile i.neutre{background:var(--fond-3);color:var(--texte-sec)}
.cbwr .pile i.rec{background:var(--orange);color:var(--noir,#1E1E1C)}
.cbwr .vide-l{margin:24px 0 0;padding:28px 24px;border:1px dashed var(--fil-fort);display:grid;justify-items:start;gap:6px}
.cbwr .vide-l b{font-size:16px}
.cbwr .vide-l span{font-size:14px;color:var(--texte-sec)}
.cbwr .vide-l .btn2{margin-top:8px}
.cbwr .squel{height:60px;margin-top:4px;background:var(--fond-2)}
/* aperçu */
.cbwr .apercu{position:sticky;top:var(--s3,24px);max-height:calc(100vh - 52px - 2 * var(--s3,24px));overflow:auto;border:1px solid var(--fil);background:var(--fond-2);padding:20px 20px 24px}
.cbwr .ap-badge{display:inline-block;padding:3px 8px;font:700 12px/1.3 var(--mono);letter-spacing:.06em;text-transform:uppercase;background:var(--inverse-fond);color:var(--inverse-texte)}
.cbwr .ap-badge.rec{background:var(--orange);color:var(--noir,#1E1E1C)}
.cbwr .apercu h2{margin:10px 0 6px;font-size:20px;line-height:24px;font-weight:800;letter-spacing:-.01em;overflow-wrap:anywhere}
.cbwr .ap-l{margin:0;font:500 12px/18px var(--mono);color:var(--texte-sec)}
.cbwr .ap-s{margin-top:22px;padding-top:12px;border-top:1px solid var(--fil)}
.cbwr .ap-s h3{margin:0 0 8px}
.cbwr .ap-p{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.cbwr .ap-p li{display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px}
.cbwr .ap-p li::before{content:"";width:8px;height:8px;background:var(--c,var(--texte-3));flex:none}
.cbwr .ap-p em{font-style:normal;color:var(--texte-sec)}
.cbwr .ap-bref{margin:0;font-size:14px;line-height:21px;color:var(--ia)}
.cbwr .ap-bref.st{color:var(--bleu-texte);font-weight:600}
.cbwr .ap-vide{margin:0;font-size:13px;color:var(--texte-sec)}
/* ── L2 : note ── */
/* barre « Retour » : même conteneur ; la flèche (encre) commence au bord du contenu, l'icône de droite finit sur le bord droit */
.cbwr .p-haut{flex:none;display:flex;align-items:center;gap:4px;width:100%;max-width:1120px;margin:0 auto;min-height:52px;padding:var(--s1,8px) var(--gout,64px) 0}
.cbwr .p-haut > .btn3:first-child{margin-left:-9px}
.cbwr .p-haut > :last-child{margin-right:-17px}
.cbwr .p-haut .btn3{padding:0 10px 0 6px;color:var(--texte);font-weight:700}
.cbwr .prive{font-size:13px;color:var(--texte-sec);max-width:60ch;line-height:18px;margin-right:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cbwr .defile{flex:1;overflow:auto;position:relative;scroll-padding-bottom:180px;overflow-anchor:auto}
.cbwr .feuille{position:relative;width:100%;max-width:1120px;margin:0 auto;padding:var(--s3,24px) var(--gout,64px) 160px;min-height:100%}
.cbwr .feuille > .onglets,.cbwr .corps{max-width:calc(var(--marge) + var(--gi) + var(--col))}
.cbwr .corps{position:relative;padding-left:calc(var(--marge) + var(--gi))}
.cbwr .corps .outils{position:relative;z-index:1;background:var(--fond);margin-left:calc(-1 * (var(--marge) + var(--gi)))}
/* Onglet Résumé : plus de marge d'heures, une colonne de prose qui part du bord du contenu (mêmes x que le titre, l'onglet et Historique) */
.cbwr[data-onglet="res"] .feuille > .onglets,.cbwr[data-onglet="res"] .corps{max-width:var(--col)}
.cbwr[data-onglet="res"] .corps{padding-left:0}
.cbwr[data-onglet="res"] .corps .outils{margin-left:0}
.cbwr[data-onglet="res"] .regle{display:none}
.cbwr .regle{position:absolute;top:0;bottom:0;left:calc(var(--marge) + var(--gi) / 2 - 1px);width:2px;background:var(--fil);transition:background-color var(--d-3) var(--ease)}
.cbwr .regle i{position:absolute;inset:0;background:var(--bleu-texte);transform:scaleY(var(--p,0));transform-origin:top;opacity:0;transition:transform 240ms linear,opacity var(--d-3) var(--ease)}
.cbwr[data-etat="enregistre"] .regle{background:var(--orange)}
.cbwr[data-etat="pause"] .regle{background:transparent;border-left:2px dashed var(--orange);width:0}
.cbwr[data-etat="ecrit"] .regle i{opacity:1}
.cbwr[data-etat="pret"] .regle i{opacity:1;transform:scaleY(1);background:var(--vert-pt)}
.cbwr .tete{position:relative}
.cbwr .ln-m{overflow:hidden;padding-bottom:.08em;margin-bottom:-.08em}
.cbwr .ln-m:focus-within{overflow:visible}
.cbwr .titre{margin:0;font-size:var(--t-titre);line-height:.92;font-weight:900;font-stretch:80%;letter-spacing:-.045em;outline:none;overflow-wrap:anywhere}
.cbwr .titre:focus-visible{outline:3px solid var(--focus);outline-offset:4px}
.cbwr .s-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:var(--s2,16px) 0 0;font-size:14px;line-height:22px;color:var(--texte-sec)}
.cbwr .puce-d{font:500 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--fil-fort);padding:6px 8px;color:var(--texte)}
.cbwr .s-voix{display:flex;align-items:center;gap:10px;min-width:0}
.cbwr .s-h{font:500 12px/1 var(--mono);letter-spacing:.06em;color:var(--texte-sec);font-variant-numeric:tabular-nums}
.cbwr .s-voix .pile{flex:none}
.cbwr .s-voix .pile i{width:auto;min-width:30px;height:28px;padding:0 6px;font-size:11px;margin-left:-2px;white-space:nowrap}
.cbwr .s-voix .pile i:first-child{margin-left:0}
.cbwr .s-voix .spk{color:var(--texte);font-weight:600}
/* onglets */
.cbwr .onglets{display:flex;align-items:stretch;margin-top:0;border-bottom:2px solid var(--trait)}
.cbwr .onglets [role="tab"]{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0;margin-right:30px;font-weight:800;font-size:16px;color:var(--texte-sec);box-shadow:inset 0 -4px 0 transparent;margin-bottom:-2px}
.cbwr .onglets [role="tab"]:hover{color:var(--texte)}
.cbwr .onglets [role="tab"][aria-selected="true"]{color:var(--texte);box-shadow:inset 0 -4px 0 var(--trait)}
.cbwr .onde{display:inline-flex;gap:2px;align-items:center;height:14px}
.cbwr .onde i{width:3px;height:14px;background:var(--orange);transform-origin:center;animation:onde 900ms var(--ease) infinite}
.cbwr .onde i:nth-child(2){animation-delay:150ms}.cbwr .onde i:nth-child(3){animation-delay:300ms}
@keyframes onde{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
.cbwr [role="tab"] .charge{color:var(--bleu-texte)}
.cbwr .tab{padding-top:4px}
/* rangée d'outils (dans chaque onglet) */
.cbwr .outils{display:flex;align-items:center;gap:2px;min-height:52px;border-bottom:1px solid var(--fil);margin-bottom:12px}
.cbwr .o-lab{flex:1;display:flex;align-items:center;gap:10px;min-width:0;font:500 12px/1.3 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec);font-variant-numeric:tabular-nums}
.cbwr .o-lab.rec::before{content:"";width:10px;height:10px;background:var(--orange);flex:none}
.cbwr .o-lab .genre{display:inline-flex;align-items:center;gap:8px}
.cbwr .o-lab .genre::before{content:"";width:8px;height:8px;background:var(--bleu-texte)}
.cbwr .outils .btn2{min-height:36px;padding:0 10px;font-size:13px;margin-left:6px}
.cbwr .o-ch{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.cbwr .o-ch input{flex:1;max-width:420px;height:44px;border:2px solid var(--trait);border-radius:0;padding:0 12px;font-size:14px;background:var(--surface)}
.cbwr .o-ch .n{font:500 12px var(--mono);color:var(--texte-sec);min-width:48px}
/* Transcription */
.cbwr .p-info{margin:0 0 6px;font-size:13px;line-height:20px;color:var(--texte-sec)}
.cbwr .p-info.direct{display:flex;align-items:center;gap:8px}
.cbwr .p-info.direct::before{content:"";width:8px;height:8px;background:var(--orange);flex:none}
.cbwr .frise{padding:6px 0 10px;display:grid;gap:4px}
.cbwr .f-l{display:grid;grid-template-columns:120px 1fr;align-items:center;column-gap:8px;height:16px}
.cbwr .f-l > span{display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;color:var(--texte-sec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbwr .f-l > span::before{content:"";width:8px;height:8px;background:var(--c);flex:none}
.cbwr .f-p{position:relative;height:12px;background:var(--fond-2)}
.cbwr .f-p button{position:absolute;top:0;bottom:0;min-width:3px;background:var(--c)}
.cbwr .f-p button:hover{outline:2px solid var(--texte);outline-offset:1px;z-index:1}
.cbwr .f-ax{display:flex;justify-content:space-between;margin-left:128px;font:500 12px/16px var(--mono);color:var(--texte-sec)}
.cbwr .ecoute{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px;margin:6px 0 10px;border:1px solid var(--fil);background:var(--fond-2);position:sticky;top:0;z-index:5}
.cbwr .jouer{width:44px;height:44px;border:2px solid var(--trait);display:grid;place-items:center;background:var(--surface);flex:none}
.cbwr .jouer:hover{background:var(--fond-3)}
.cbwr .ecoute .e-t{flex:1;min-width:0}
.cbwr .ecoute .e-t b{display:block;font-size:14px}
.cbwr .ecoute .e-t span{font:500 12px var(--mono);color:var(--texte-sec)}
.cbwr .piste{flex-basis:100%;height:4px;background:var(--fil);position:relative}
.cbwr .piste i{position:absolute;inset:0;background:var(--texte);transform-origin:left;transform:scaleX(var(--a,0))}
.cbwr .tr{position:relative;display:grid;grid-template-columns:1fr;padding:8px 10px 8px 13px;margin-left:-16px;border-left:3px solid transparent;transition:background-color var(--d-2) var(--ease)}
.cbwr .tr .tt{position:absolute;left:calc(-1 * (var(--marge) + var(--gi)) + 13px);top:8px;width:var(--marge);text-align:right;font:500 12px/22px var(--mono);color:var(--texte-sec);min-height:24px}
.cbwr .tr .tt:not(:disabled):hover{color:var(--texte);text-decoration:underline}
.cbwr .tr .qui{font-weight:700;font-size:14px;line-height:22px;justify-self:start}
.cbwr .tr .qui::before{content:"";display:inline-block;width:8px;height:8px;margin-right:8px;background:var(--c,var(--texte))}
.cbwr .tr p{margin:2px 0 0;font-size:16px;line-height:26px}
.cbwr .tr.hl{background:var(--hl);border-left-color:var(--trait)}
.cbwr .vide-t{margin:8px 0;font-size:14px;line-height:22px;color:var(--texte-sec)}
.cbwr .bienvenue{border:2px solid var(--trait);padding:16px 18px;display:grid;gap:8px;max-width:560px;margin-top:4px}
.cbwr .bienvenue b{font-size:17px}
.cbwr .bienvenue p{margin:0;font-size:15px;line-height:23px}
.cbwr .bienvenue small{font-size:13px;line-height:20px;color:var(--texte-sec)}
/* Résumé */
.cbwr .etapes{list-style:none;margin:4px 0 20px;padding:0;border:2px solid var(--trait)}
.cbwr .etapes li{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;min-height:48px;padding:6px 14px;border-top:1px solid var(--fil);font-size:15px;color:var(--texte-3)}
.cbwr .etapes li:first-child{border-top:0}
.cbwr .etapes .n{font:500 12px var(--mono)}
.cbwr .etapes li[data-s="fait"]{color:var(--texte-sec)}
.cbwr .etapes li[data-s="fait"] .n{color:var(--vert-pt);font-weight:700}
.cbwr .etapes li[data-s="cours"]{color:var(--texte);font-weight:700}
.cbwr .etapes li[data-s="cours"] .n{color:var(--bleu-texte)}
.cbwr .etapes small{font:500 12px var(--mono);color:var(--texte-sec);font-weight:500}
.cbwr .cas{margin:4px 0 20px;border:2px solid var(--trait);padding:14px 16px;display:grid;gap:10px}
.cbwr .cas.panne{border-color:var(--erreur);border-left-width:6px}
.cbwr .cas p{margin:0;font-size:15px;line-height:23px}
.cbwr .cas .err{color:var(--erreur);font-weight:700}
.cbwr .cas .act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cbwr .att{margin:4px 0 16px;font-size:15px;line-height:24px;color:var(--texte-sec)}
.cbwr .att b{display:block;color:var(--texte);font-size:16px;margin-bottom:2px}
.cbwr .legende{margin:0 0 6px;display:flex;flex-wrap:wrap;gap:6px 20px;font-size:13px;line-height:20px;color:var(--texte-sec)}
.cbwr .legende kbd{padding:1px 5px}
.cbwr .note{margin-top:8px;font-size:var(--t-corps);line-height:var(--l);color:var(--texte);outline:none}
.cbwr .note[contenteditable="true"]:focus-visible{outline:none}
.cbwr .note,.cbwr .tr,.cbwr .tx,.cbwr .ln-m,.cbwr .extraits{-webkit-user-select:text;user-select:text;cursor:text}
.cbwr .feuille:focus-within .regle{width:4px}
.cbwr .bh{position:relative;border-top:2px solid var(--trait);margin-top:32px;padding-top:14px}
.cbwr .bh:first-child{margin-top:0}
.cbwr .mgh{margin:0;font:800 var(--t-sujet)/1.2 var(--police);letter-spacing:-.01em;color:var(--texte);overflow-wrap:anywhere}
.cbwr .u{--pt:8px;position:relative;padding:var(--pt) 0 8px;margin:0}
.cbwr .u.me::after{content:"";position:absolute;left:-14px;top:calc(var(--pt) + 6px);width:4px;height:16px;background:var(--texte)}
.cbwr .u:not(.li):not(.todo):not(.q):not(.h){padding-bottom:10px}
.cbwr .u.h{--pt:24px;font-size:var(--t-sujet);font-weight:700;letter-spacing:-.01em}
.cbwr .u.h.h3{--pt:16px;font-size:18px}
.cbwr .bh + .u.h{--pt:18px}
.cbwr .u.h.me::after{display:none}
.cbwr .u.ia .tx,.cbwr .ia-in{color:var(--ia)}
.cbwr .u b{font-weight:700;color:inherit}
.cbwr .u.li{padding-left:20px}
.cbwr .u.li::before{content:"";position:absolute;left:4px;top:calc(var(--pt) + 12px);width:5px;height:5px;background:var(--texte)}
.cbwr .u.ia.li::before{background:var(--ia)}
.cbwr .u.sub{margin-top:-8px;padding-left:40px}
.cbwr .u.sub::before{left:24px;width:4px;height:4px}
.cbwr .u.q{background:var(--fond-2);border-left:4px solid var(--trait);padding-left:18px;padding-right:12px;margin-top:10px}
.cbwr .u.q + .u.q{margin-top:0;--pt:2px}
.cbwr .u.q.li{padding-left:38px}
.cbwr .u.q.li::before{left:20px}
.cbwr .u.q.me::after{display:none}
.cbwr .u.q.cit .tx{font-style:italic}
.cbwr .u.todo{padding-left:32px}
.cbwr .u.todo::before{display:none}
.cbwr .u.trouve{background:var(--hl)}
.cbwr .u.trouve-cur{box-shadow:inset 3px 0 0 var(--bleu-texte)}
.cbwr .coche{position:absolute;left:-4px;top:calc(var(--pt) - 8px);width:30px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none}
.cbwr .coche input{appearance:none;-webkit-appearance:none;width:18px;height:18px;margin:0;border:2px solid var(--texte);border-radius:0;background:var(--surface);cursor:pointer}
.cbwr .coche input:checked{background:var(--texte) no-repeat center url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'%3E%3Cpath d='M2 7.5l3.2 3L12 3.5' fill='none' stroke='%23FFFFFF' stroke-width='2.2' stroke-linecap='square'/%3E%3C/svg%3E")}
:root[data-theme="dark"] .cbwr .coche input:checked{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'%3E%3Cpath d='M2 7.5l3.2 3L12 3.5' fill='none' stroke='%231C1C1E' stroke-width='2.2' stroke-linecap='square'/%3E%3C/svg%3E")}
.cbwr .u.todo.fait .tx,.cbwr .u.todo.fait .ia-in{text-decoration:line-through;text-decoration-thickness:1px}
.cbwr .acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:6px 0 4px 32px;font-size:13px;line-height:19px;color:var(--texte-sec);user-select:none}
.cbwr .u.actif .tx,.cbwr .u.actif .ia-in{background:var(--hl);color:var(--texte-sec);box-decoration-break:clone;-webkit-box-decoration-break:clone}
.cbwr .spk{color:inherit;text-decoration:underline dotted 1px;text-underline-offset:4px;cursor:pointer}
.cbwr .spk:hover{text-decoration-style:solid}
.cbwr .spk[data-inconnu]::after{content:"Qui est-ce ?";display:inline-block;margin-left:6px;padding:0 5px;font:500 11px/18px var(--mono);letter-spacing:.02em;border:1px solid var(--fil-fort);color:var(--texte-sec);vertical-align:2px;font-style:normal;text-decoration:none}
.cbwr .spk[data-inconnu]:hover::after{border-color:var(--texte);color:var(--texte)}
.cbwr .nouv{animation:fondu 160ms var(--ease) both}
@keyframes fondu{from{opacity:0}to{opacity:1}}
.cbwr .curseur{display:inline-block;width:8px;height:18px;background:var(--bleu-texte);vertical-align:-3px;margin-left:2px;animation:clig 1s steps(2,jump-none) infinite}
@keyframes clig{50%{opacity:0}}
.cbwr .pied{margin:36px 0 0;padding-top:12px;border-top:1px solid var(--fil);font-size:13px;line-height:20px;color:var(--texte-sec)}
/* ── Barre du bas flottante (+ tiroir des réponses, vers le haut) ── */
/* calée sur la colonne de texte de la note : même conteneur (1120 px, var(--gout)) + marge des heures */
.cbwr .dock{--dk:max(0px,(100% - 1120px) / 2);position:absolute;left:0;right:0;bottom:0;z-index:40;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:8px calc(var(--dk) + var(--gout,64px)) 14px calc(var(--dk) + var(--gout,64px) + var(--marge) + var(--gi));background:var(--fond);border-top:1px solid var(--fil)}
.cbwr[data-onglet="res"] .dock{padding-left:calc(var(--dk) + var(--gout,64px))}
.cbwr .dock > *{width:min(var(--col),100%)}
.cbwr .d-info{margin:0;padding:0 10px;font-size:13px;line-height:20px;color:var(--texte-sec);text-align:center;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0 6px}
.cbwr .d-info .btn3{min-height:32px;font-size:13px}
.cbwr .d-info.err{color:var(--erreur);font-weight:700}
.cbwr .tiroir{background:var(--surface);border:2px solid var(--trait);max-height:min(52vh,460px);overflow:auto;padding:0 16px 8px;animation:entre var(--d-3) var(--es)}
.cbwr .ti-h{position:sticky;top:0;background:var(--surface);display:flex;align-items:center;justify-content:space-between;min-height:44px;border-bottom:1px solid var(--fil);z-index:1}
.cbwr .ti-h h2{margin:0;font-size:12px}
.cbwr .barre{display:flex;align-items:center;gap:10px;min-height:68px;padding:10px;background:var(--surface);border:2px solid var(--trait)}
.cbwr .barre .btn1 .carre{width:10px;height:10px;background:var(--orange);flex:none}
.cbwr .enreg{display:flex;align-items:center;gap:12px;min-width:0}
.cbwr .ondes{display:inline-flex;gap:3px;align-items:center;height:22px}
.cbwr .ondes i{width:3px;height:22px;background:var(--orange);transform:scaleY(.25);transition:transform 90ms linear}
.cbwr .reu .ondes{height:14px;gap:2px}
.cbwr .reu .ondes i{height:14px}
.cbwr[data-etat="pause"] .ondes i,.cbwr[data-muet="1"] .ondes i{background:var(--texte-3);transform:scaleY(.2)}
.cbwr .chrono{font:700 15px var(--mono);font-variant-numeric:tabular-nums}
.cbwr .etat-l{font-size:13px;color:var(--texte-sec)}
.cbwr .st-ia{display:flex;align-items:center;gap:10px;color:var(--bleu-texte);font-weight:600;font-size:14px;min-width:0}
.cbwr .st-ia .mono{font:500 12px var(--mono);color:var(--texte-sec)}
.cbwr .st-ok{display:flex;align-items:center;gap:10px;color:var(--vert-pt);font-weight:700;font-size:14px}
.cbwr .st-ok::before{content:"";width:10px;height:10px;background:var(--vert-pt)}
.cbwr .st-err{color:var(--erreur);font-weight:700;font-size:14px}
.cbwr .charge,.cbwc .charge{display:inline-flex;gap:3px;align-items:flex-end;height:14px}
.cbwr .charge i,.cbwc .charge i{width:3px;height:14px;background:currentColor;transform-origin:bottom;animation:saute 900ms var(--ease) infinite}
.cbwr .charge i:nth-child(2){animation-delay:120ms}.cbwr .charge i:nth-child(3){animation-delay:240ms}
@keyframes saute{0%,100%{transform:scaleY(.35)}40%{transform:scaleY(1)}}
.cbwr .demande{flex:1;min-width:200px;position:relative}
.cbwr .demande input{width:100%;height:46px;border:2px solid var(--trait);border-radius:0;background:var(--surface);padding:0 70px 0 14px;font-size:15px}
.cbwr .demande input::placeholder{color:var(--texte-3)}
.cbwr .demande kbd{position:absolute;right:12px;top:14px}
.cbwr .rapides{position:absolute;left:0;bottom:56px;width:min(440px,100%);list-style:none;margin:0;padding:6px 0;background:var(--surface);border:2px solid var(--trait);z-index:30}
.cbwr .rapides li{padding:8px 14px;min-height:44px;cursor:pointer}
.cbwr .rapides li b{display:block;font-size:14px}
.cbwr .rapides li span{font-size:13px;color:var(--texte-sec)}
.cbwr .rapides li[aria-selected="true"]{background:var(--fond-3);box-shadow:inset 3px 0 0 var(--trait)}
.cbwr .rapides .r-t{padding:4px 14px 6px;min-height:0;cursor:default;font:500 12px var(--mono);color:var(--texte-sec)}
.cbwr .qa{padding:14px 0;border-bottom:1px solid var(--fil);animation:entre var(--d-3) var(--es)}
.cbwr .qa:last-child{border-bottom:0}
.cbwr .qa h3{margin:0 0 8px;font-size:15px;font-weight:700;line-height:22px}
.cbwr .qa .rep{font-size:15px;line-height:24px}
.cbwr .qa .rep p{margin:0 0 10px}
.cbwr .qa .rep ul{margin:0 0 10px;padding-left:18px}
.cbwr .qa .attente{display:flex;align-items:center;gap:10px;color:var(--bleu-texte);font-weight:600;font-size:14px;margin:0}
.cbwr .qa .err{color:var(--erreur);font-weight:600;margin:0}
.cbwr .qa .acts{padding-left:0}
.cbwr .cite{font:500 12px/18px var(--mono);padding:1px 5px;border:1px solid var(--fil-fort);color:var(--texte-sec);vertical-align:1px}
.cbwr .cite:hover{border-color:var(--texte);color:var(--texte)}
/* ── Popovers, fenêtre « Nommer les voix », toast ── */
@keyframes entre{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
.cbwr .pop{position:fixed;z-index:90;width:392px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:var(--surface);border:2px solid var(--trait);box-shadow:var(--o-s);padding:14px;animation:entre 160ms var(--es)}
.cbwr .pop h2{margin:0 0 4px;font-size:16px;font-weight:800}
.cbwr .pop > p{margin:0 0 12px;font-size:13px;line-height:19px;color:var(--texte-sec)}
.cbwr .extraits{list-style:none;margin:0 0 12px;padding:0;border-top:1px solid var(--fil)}
.cbwr .extraits li{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--fil)}
.cbwr .extraits li.sans{grid-template-columns:1fr}
.cbwr .extraits q,.cbwr .dv q{font-size:14px;line-height:20px;quotes:"« " " »"}
.cbwr .extraits span{display:block;font:500 12px var(--mono);color:var(--texte-sec)}
.cbwr .choix{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.cbwr .choix button{min-height:44px;padding:0 12px;border:2px solid var(--trait);font-weight:700;font-size:14px}
.cbwr .choix button:hover{background:var(--inverse-fond);color:var(--inverse-texte)}
.cbwr .champ label{display:block;font-size:13px;font-weight:700;margin-bottom:6px}
.cbwr .champ input{width:100%;height:44px;border:2px solid var(--trait);border-radius:0;padding:0 12px;font-size:15px;background:var(--surface)}
.cbwr .portee{display:inline-flex;border:1px solid var(--fil-fort);margin-top:12px}
.cbwr .portee button{min-height:40px;padding:0 12px;font-weight:600;font-size:13px;color:var(--texte-sec)}
.cbwr .portee button[aria-checked="true"]{background:var(--inverse-fond);color:var(--inverse-texte)}
.cbwr .p-act{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:12px}
.cbwr .gabs{list-style:none;margin:0 0 12px;padding:0;border-top:1px solid var(--fil);max-height:340px;overflow:auto}
.cbwr .gabs li{border-bottom:1px solid var(--fil)}
.cbwr .gabs button{width:100%;text-align:left;padding:8px 10px 8px 13px;min-height:52px;border-left:3px solid transparent}
.cbwr .gabs button:hover{background:var(--fond-2)}
.cbwr .gabs button[aria-checked="true"]{border-left-color:var(--trait);background:var(--fond-3)}
.cbwr .gabs b{display:block;font-size:14px}
.cbwr .gabs span{display:block;font-size:13px;line-height:18px;color:var(--texte-sec)}
.cbwr .menu-l,.cbwc .menu-l{display:grid;gap:2px;width:100%}
.cbwr .menu-l button,.cbwc .menu-l button{min-height:44px;text-align:left;padding:0 10px;font-weight:600;display:flex;align-items:center;gap:10px}
.cbwr .menu-l button:hover,.cbwc .menu-l button:hover{background:var(--fond-2)}
.cbwr .menu-l .danger{color:var(--erreur)}
.cbwr .menu-l hr,.cbwc .menu-l hr{border:0;border-top:1px solid var(--fil);margin:4px 0}
.cbwr .pop.menu{width:280px;padding:6px}
.cbwr dialog.dlg{width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px);padding:0;border:2px solid var(--trait);box-shadow:var(--ombre-dure,8px 8px 0 var(--trait));background:var(--surface);color:var(--texte);border-radius:0}
.cbwr dialog.dlg::backdrop{background:color-mix(in srgb,var(--fond) 70%,transparent)}
.cbwr .dlg form{display:flex;flex-direction:column;max-height:calc(100vh - 52px)}
.cbwr .dlg-h{padding:20px 22px 12px;border-bottom:2px solid var(--trait)}
.cbwr .dlg-h h2{margin:0 0 6px;font-size:22px;line-height:26px;font-weight:800}
.cbwr .dlg-h p{margin:0;font-size:14px;line-height:21px;color:var(--texte-sec)}
.cbwr .dlg-h .sugg{margin-top:8px;font-size:13px}
.cbwr .dlg-c{overflow:auto;padding:0 22px}
.cbwr .dv-l{list-style:none;margin:0;padding:0}
.cbwr .dv{display:grid;gap:8px;padding:14px 0;border-bottom:1px solid var(--fil)}
.cbwr .dv:last-child{border-bottom:0}
.cbwr .dv-t{display:flex;align-items:center;gap:10px}
.cbwr .dv-t .carre{width:10px;height:10px;background:var(--c);flex:none}
.cbwr .dv-t b{font-size:15px}
.cbwr .dv-t .mono{font:500 12px var(--mono);color:var(--texte-sec)}
.cbwr .dv-x{display:flex;align-items:center;gap:10px;color:var(--texte-sec)}
.cbwr .dv-c{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}
.cbwr .dv-c label{display:grid;gap:4px;font-size:13px;font-weight:700}
.cbwr .dv-c input,.cbwr .dv-c select{height:44px;border:2px solid var(--trait);border-radius:0;padding:0 10px;font-size:15px;background:var(--surface);font-weight:400}
.cbwr .dv-c select{max-width:220px}
.cbwr .dlg-p{display:flex;justify-content:flex-end;gap:8px;padding:12px 22px;border-top:2px solid var(--trait)}
.cbwr .toast::before{display:none}
.cbwr .toast{font:500 14px/20px var(--police);letter-spacing:0;text-transform:none;position:absolute;left:50%;bottom:132px;transform:translateX(-50%);z-index:70;max-width:min(600px,calc(100% - 32px));background:var(--inverse-fond);color:var(--inverse-texte);padding:8px 8px 8px 16px;display:flex;gap:12px;align-items:center;font-size:14px;line-height:20px;animation:entre var(--d-3) var(--es)}
.cbwr[data-niveau="liste"] .toast{bottom:24px}
.cbwr .toast button{min-height:44px;padding:0 10px;font-weight:700;text-decoration:underline;text-underline-offset:4px}
/* ── Cartes flottantes : « Réunion détectée », « Toujours là ? » ── */
.cbwc{position:fixed;right:20px;bottom:88px;z-index:1000;width:372px;max-width:calc(100vw - 40px);background:var(--surface);color:var(--texte);border:2px solid var(--trait);box-shadow:var(--o-s);padding:14px 14px 14px 26px;font-family:var(--police);font-size:14px;line-height:1.45;animation:carte var(--d-3) var(--es)}
.cbwc::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--orange)}
.cbwc[data-k="fin"]::before{background:var(--texte-3)}
@keyframes carte{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.cbwc .c-lab{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px;font:500 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec)}
.cbwc .c-lab span{display:inline-flex;align-items:center;gap:8px}
.cbwc .c-lab span::before{content:"";width:10px;height:10px;background:var(--orange)}
.cbwc[data-k="fin"] .c-lab span::before{background:var(--texte-3)}
.cbwc .c-x{margin:-8px -8px -8px 0}
.cbwc .c-x svg.i{width:18px;height:18px}
.cbwc h2{margin:6px 0 4px;font-size:18px;line-height:23px;font-weight:800}
.cbwc p{margin:0;font-size:14px;line-height:20px;color:var(--texte-sec)}
.cbwc .c-temps{height:4px;background:var(--fil);margin:12px 0 0;position:relative;overflow:hidden}
.cbwc .c-temps i{position:absolute;inset:0;background:var(--texte);transform-origin:left;transform:scaleX(var(--r,1));transition:transform 1s linear}
.cbwc .c-act{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.cbwc .split{display:inline-flex}
.cbwc .split .chev{padding:0;width:44px;justify-content:center;border-left:1px solid color-mix(in srgb,var(--inverse-texte) 35%,transparent)}
.cbwc .split .chev[aria-expanded="true"] svg{transform:rotate(180deg)}
.cbwc .c-menu{margin-top:8px;border:2px solid var(--trait);padding:4px;background:var(--surface)}
.cbwc .tg{margin-left:auto;width:36px;height:20px;border:1.5px solid var(--champ);position:relative;flex:none}
.cbwc .tg::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border:1.5px solid var(--champ);background:var(--surface);transition:transform var(--d-3) var(--ease-ressort,var(--ease))}
.cbwc [aria-checked="true"] .tg{background:var(--inverse-fond);border-color:var(--inverse-fond)}
.cbwc [aria-checked="true"] .tg::after{transform:translateX(16px);background:var(--inverse-texte);border-color:var(--inverse-texte)}
/* ── Fenêtre étroite ── */
@container win (max-width: 900px){.cbwr .apercu{display:none}.cbwr .l1-cadre{grid-template-columns:minmax(0,1fr)}}
@container win (max-width: 680px){
  .cbwr .l1-cadre{padding:var(--s4,32px) 18px 48px}
  .cbwr .dock{padding:8px 18px 14px}
  .cbwr .np-tete{flex-wrap:wrap}
  .cbwr .cherche{width:100%}
  .cbwr .feuille{--marge:0px;--gi:24px;padding:0 18px 200px}
  .cbwr .p-haut{padding:8px 18px 0}
  .cbwr .titre,.cbwr .page-head h1{font-size:40px}
  .cbwr .tr{margin-left:0}
  .cbwr .tr .tt{position:static;width:auto;text-align:left}
  .cbwr .o-lab .genre,.cbwr .prive{display:none}
  .cbwr .dv-c{grid-template-columns:1fr}
}
@media (prefers-reduced-motion: reduce){
  .cbwr *,.cbwr *::before,.cbwr *::after,.cbwc,.cbwc *{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}
}`;

  const SVG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="ri-loupe" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></symbol>
<symbol id="ri-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="ri-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="ri-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></symbol>
<symbol id="ri-pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></symbol>
<symbol id="ri-copie" viewBox="0 0 24 24"><path d="M8 8h12v12H8zM4 16V4h12"/></symbol>
<symbol id="ri-plus3" viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/></symbol>
<symbol id="ri-retour" viewBox="0 0 24 24"><path d="M20 12H5M11 6l-6 6 6 6"/></symbol>
<symbol id="ri-haut" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></symbol>
<symbol id="ri-bas" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="ri-reglage" viewBox="0 0 16 16"><g stroke-width="1.5"><path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7"/><rect x="9" y="3" width="3" height="3"/><rect x="4" y="10" width="3" height="3"/></g></symbol>
<symbol id="ri-sync" viewBox="0 0 24 24"><path d="M20 11A8 8 0 0 0 5.7 6.1M4 3v4h4M4 13a8 8 0 0 0 14.3 4.9M20 21v-4h-4"/></symbol>
<symbol id="ri-voix" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 5c1.5 1 1.5 5 0 6M19.5 3c2.7 2 2.7 8 0 10"/></symbol>
</svg>`;
  const ic = (id) => `<svg class="i" aria-hidden="true"><use href="#ri-${id}"/></svg>`;
  const ICX = '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICBAS = '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';

  /* ═════════ Utilitaires ═════════ */
  const NB = ' ';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const fr = (s) => String(s == null ? '' : s).replace(/ ([?!;:»])/g, NB + '$1').replace(/« /g, '«' + NB);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? h + ':' + pad(m) + ':' + pad(x) : pad(m) + ':' + pad(x); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const errMsg = (e) => String((e && e.message) || e || 'Erreur').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const injectCss = () => { if (!document.getElementById('cbwr-css')) { const s = document.createElement('style'); s.id = 'cbwr-css'; s.textContent = CSS; document.head.appendChild(s); } };
  const editable = (t) => !!(t && t.closest && t.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]'));
  /* Dates : surtitres « Aujourd’hui, 15 oct. », agenda « Demain », puce « Hier » */
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const jourDiff = (d) => { const t = new Date(); t.setHours(0, 0, 0, 0); const k = new Date(d); k.setHours(0, 0, 0, 0); return Math.round((k - t) / 864e5); };
  const jourCourt = (d) => d.getDate() + NB + MOIS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  const surtitre = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const x = jourDiff(d); return x === 0 ? 'Aujourd’hui, ' + jourCourt(d) : x === -1 ? 'Hier, ' + jourCourt(d) : JOURS[d.getDay()] + ' ' + jourCourt(d); };
  const puceDate = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const x = jourDiff(d); return x === 0 ? 'Aujourd’hui' : x === -1 ? 'Hier' : jourCourt(d); };
  const jourAgenda = (ms) => { const d = new Date(ms); const x = jourDiff(d); if (x === 0) return 'Aujourd’hui'; if (x === 1) return 'Demain'; const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
  const hm = (v) => { const d = new Date(v); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const durLab = (ms) => { const s = Math.round((ms || 0) / 1000); if (s < 60) return s + NB + 's'; const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + NB + 'h' + NB + pad(m % 60) : m + NB + 'min'; };
  const compteur = (ev) => {
    const now = Date.now(); if (ev.start <= now && ev.end > now) return 'Maintenant';
    const m = Math.round((ev.start - now) / 60000); if (m <= 0) return 'Maintenant'; if (m < 60) return 'Dans ' + m + NB + 'min';
    return jourDiff(new Date(ev.start)) === 0 ? 'Dans ' + Math.round(m / 60) + NB + 'h' : '';
  };
  const initiales = (n) => { const s = String(n || '').trim(); const p = /^Personne (\d+)$/.exec(s); if (p) return 'P' + p[1]; if (s === 'Moi') return 'MOI'; return s.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?'; };

  /* Copie de src/llm/notes.ts › parseAnnotated (même grammaire, lignes « > » comprises, tolérante au flux). */
  const TAG_RE = /\[\[(\/?)ia((?:\s+\d{1,3}(?::\d{2}){1,2})*)\s*\]\]/g;
  const PREFIX_RE = /^(\s*>\s*(?:(?:[-*+•]|\d+[.)])\s+)?|\s*(?:[-*+•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|\s*)/;
  const dropPartial = (s) => s.replace(/\[\[[^\]\n]{0,40}$/, '').replace(/\[$/, '');
  const clock = (l) => { const p = l.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  function parseAnnotated(md) {
    const lines = [];
    for (const raw of dropPartial(String(md || '')).replace(/\r/g, '').split('\n')) {
      if (!raw.trim()) { lines.push({ kind: 'blank', prefix: '', spans: [] }); continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(raw);
      if (h) { lines.push({ kind: 'heading', level: h[1].length, prefix: '', spans: [{ kind: 'user', text: h[2].replace(TAG_RE, '').trim(), refs: [] }] }); continue; }
      const prefix = PREFIX_RE.exec(raw)[1];
      const body = raw.slice(prefix.length);
      const spans = []; let open = null, last = 0;
      const push = (text) => { if (text) spans.push(open ? { kind: 'ia', text, refs: open } : { kind: 'user', text, refs: [] }); };
      for (const m of body.matchAll(TAG_RE)) {
        push(body.slice(last, m.index)); last = m.index + m[0].length;
        if (m[1]) open = null; else open = (m[2].match(/\d{1,3}(?::\d{2}){1,2}/g) || []).slice(0, 3).map((label) => ({ t: clock(label), label }));
      }
      push(body.slice(last));
      lines.push({ kind: 'text', prefix, spans: spans.filter((s) => s.text.trim() || s.kind === 'user') });
    }
    return lines;
  }
  const lineToMd = (l) => l.kind === 'blank' ? '' : l.kind === 'heading' ? '#'.repeat(l.level || 2) + ' ' + ((l.spans[0] && l.spans[0].text) || '')
    : l.prefix + l.spans.map((s) => s.kind === 'ia' ? '[[ia' + (s.refs.length ? ' ' + s.refs.map((r) => r.label).join(' ') : '') + ']]' + s.text + '[[/ia]]' : s.text).join('');
  const linesToMd = (ls) => ls.map(lineToMd).join('\n');
  const plainOf = (l) => l.spans.map((s) => s.text).join('');
  const sansMd = (s) => String(s || '').replace(/\*\*([^*]+)\*\*/g, '$1');

  /* Sections du résumé (plans de src/llm/templates.ts) */
  const SEC = (t) => {
    const k = norm(t);
    if (/^en bref$/.test(k)) return 'bref';
    if (/^(decisions?|accords?|idees retenues|choix retenus|decision et suite)$/.test(k)) return 'decide';
    if (/^(actions?|engagements|prochaines etapes|suites?|a faire|taches)$/.test(k)) return 'faire';
    return 'autre';
  };
  /* Genre reconnu par l'IA (NotesResult.kind, api-llm.md §3) */
  const GENRES = { reunion: 'Réunion de travail', brainstorm: 'Brainstorm / atelier', cours: 'Cours / conférence', collegues: 'Conversation entre collègues', client: 'Entretien client', recrutement: 'Entretien de recrutement' };
  /* Presque rien capté (même seuil que le main, notes.ts › TINY_WORDS) : « Démarré par erreur ? Garder / Jeter ». Toujours un résumé sinon, quelle que soit la durée. */
  const quasiVide = (m) => (m.words || 0) < 15 && m.provider === 'passthrough';
  const PHRASE = 'Je prends des notes avec CBW AI : l’audio reste sur mon ordinateur.';
  /* Fiche courte d'une note (aperçu, pile de voix) : voix nommées + début du paragraphe général (ou de l’ancien « En bref ») */
  function ficheDe(n) {
    const fix = (k) => k === 'Moi' || k === 'Micro' || k === 'Les autres';
    const sp = []; (n.segments || []).forEach((s) => { const k = s.speaker; if (k && !fix(k) && !sp.includes(k)) sp.push(k); });
    const voix = sp.length ? sp : (n.participants || []).slice();
    const ls = parseAnnotated(n.annotated || '');
    let dans = true, out = [];
    for (const l of ls) {
      if (l.kind === 'heading') { if (l.level === 2) { if (out.length) break; dans = SEC((l.spans[0] && l.spans[0].text) || '') === 'bref'; } continue; }
      if (l.kind === 'text' && dans) out.push(sansMd(plainOf(l)));
    }
    if (!out.length) out = ls.filter((l) => l.kind === 'text').slice(0, 2).map((l) => sansMd(plainOf(l)));
    const b = out.join(' ').replace(/\s+/g, ' ').trim();
    return { voix, bref: b.length > 420 ? b.slice(0, 417) + '…' : b, resume: !!n.annotated, moi: (n.segments || []).some((s) => s.speaker === 'Moi') };
  }

  const DEMANDES = [
    { id: 'mail', nom: 'E-mail de suivi', desc: 'Un brouillon pour les participants', q: 'Rédige un e-mail de suivi pour les participants : décisions et prochaines étapes.' },
    { id: 'moi', nom: 'Mes actions', desc: 'Ce que tu dois faire, avec les dates', q: 'Quelles sont mes actions (Moi), avec les dates ?' },
    { id: 'ouvert', nom: 'Ce qui reste ouvert', desc: 'Les points sans décision', q: 'Qu’est-ce qui reste ouvert ou sans décision ?' },
    { id: 'court', nom: 'Raccourcir le résumé', desc: 'Une version plus courte, à valider', q: 'Raccourcis le résumé : garde l’essentiel, les décisions et les prochaines étapes.' },
  ];
  // Demandes de modification : renommer et changer le titre se font ici ; le reste propose de remplacer le résumé.
  const RE_RENOMME = /^renomme[rz]?\s+(.{1,60}?)\s+en\s+(.{1,60})$/i;
  const RE_TITRE = /^(?:change|modifie|mets?)\s+(?:le\s+)?titre\s+(?:en|à|:)\s*(.{1,120})$/i;
  const RE_MODIF = /^(raccourci|rallonge|réécri|reecri|reformule|simplifie|traduis|résume|resume|ajoute|enlève|enleve|supprime|retire|développe|developpe)/i;

  /* ═════════ Pont : api.notesV2 réel, sinon démo ═════════ */
  function adapter(api) {
    const v = api && api.notesV2;
    if (!v) return demo();
    const f = (o, k) => (o && typeof o[k] === 'function' ? o[k].bind(o) : null);
    const on = (fn) => (cb) => { try { if (fn) fn(cb); } catch (e) { console.error(e); } };
    const cal = api.calendar || null;
    return {
      demo: false,
      start: (o) => api.startNote(o), resume: () => api.resumeNote(), stop: (o) => api.stopNote(o),
      list: () => api.listNotes(), get: (id) => api.getNote(id), rename: (id, a, b) => api.renameSpeaker(id, a, b),
      renameSegment: v.renameSegment, copy: (id) => api.copyNote(id), del: (id) => api.deleteNote(id), reveal: (id) => api.revealNote(id),
      current: v.current, regenerate: v.regenerate, restorePrevious: v.restorePrevious,
      save: v.save, templates: v.templates, ask: v.ask, search: v.search, audio: v.audio, privacy: v.privacy,
      meeting: v.meeting || (async () => false), keep: v.keep || (async () => {}),
      call: v.call || (async () => {}), callState: v.callState || (async () => null),
      onProgress: on(f(api, 'onNoteProgress')), onStatus: on(f(api, 'onStatus')),
      onLive: on(v.onLive), onStage: on(v.onStage), onVoices: on(v.onVoices), onDevice: on(v.onDevice), onDelta: on(v.onDelta),
      onAskDelta: on(v.onAskDelta), onMeetingSoon: on(v.onMeetingSoon), onCallDetected: on(v.onCallDetected), onAutoStop: on(v.onAutoStop),
      hubAvailable: () => (api.hub ? api.hub.available() : Promise.resolve(false)), hubSend: (t) => api.hub.send(t),
      calendarCurrent: () => (cal && cal.current ? cal.current() : Promise.resolve(null)),
      upcoming: () => (cal && cal.upcoming ? cal.upcoming() : Promise.resolve({ enabled: false, events: [] })),
      join: (url) => (/^https:\/\//i.test(String(url || '')) && api.openExternal ? api.openExternal(url) : Promise.resolve()),
      getConfig: () => (api.getConfig ? api.getConfig() : Promise.resolve({})), setConfig: (k, x) => (api.setConfig ? api.setConfig(k, x) : Promise.resolve()),
    };
  }

  /* ═════════ Démo (navigateur sans pont) ═════════ */
  let demoApi = null;
  function demo() {
    if (demoApi) return demoApi;
    const TR = [
      ['00:12', 'Moi', 'Bon, on est tous là ? Inès, tu nous entends ?'], ['00:18', 'Inès Garnier', 'Oui, c’est bon, je vous entends bien.'],
      ['00:24', 'Moi', 'Parfait. Trois sujets aujourd’hui : le site Morel, les photos et l’alternance.'],
      ['03:40', 'Personne 3', 'Côté dev, le site tourne en préproduction depuis mardi. Il reste le formulaire de contact.'],
      ['04:05', 'Moi', 'Le formulaire, tu le vois pour quand ?'], ['04:11', 'Personne 3', 'Fin de semaine prochaine, sans problème.'],
      ['12:40', 'Léa Fontaine', 'Pour la maquette de l’accueil, je pense qu’on peut la valider. Mon seul doute, c’est la photo d’en-tête : elle est trop petite sur grand écran.'],
      ['12:58', 'Personne 3', 'D’accord pour valider. On agrandit la photo et c’est bon pour moi.'], ['13:05', 'Léa Fontaine', 'Je vous envoie la version finale lundi, le 19.'],
      ['15:50', 'Inès Garnier', 'Pour les photos, j’ai eu le devis du photographe : mille huit cents euros hors taxe la journée.'],
      ['16:05', 'Personne 3', 'C’est beaucoup. On a déjà six photos de l’atelier qui sont très bien. On les réutilise et on ne photographie que l’équipe.'],
      ['16:31', 'Inès Garnier', 'Dans ce cas, il descend à mille deux cents.'], ['16:48', 'Moi', 'Alors on plafonne à mille deux cents hors taxe. Inès, tu lui confirmes ?'],
      ['16:55', 'Inès Garnier', 'Je lui écris cet après-midi.'], ['19:22', 'Moi', 'Pour la mise en ligne, on vise toujours le 6 novembre ?'],
      ['19:30', 'Personne 3', 'Si la recette du 30 octobre se passe bien, oui. Je préfère garder une marge.'],
      ['22:10', 'Personne 3', 'Pour l’alternance, j’appelle l’école vendredi. On a reçu deux profils sérieux.'], ['22:31', 'Moi', 'On fait les entretiens la semaine du 26 ?'],
      ['22:36', 'Personne 3', 'Oui, je cale ça avec eux.'], ['24:12', 'Moi', 'Et moi je renvoie le devis révisé à Morel avant vendredi, avec le nouveau budget photos.'],
      ['24:20', 'Léa Fontaine', 'Pense à ajouter la ligne pour la maintenance.'], ['24:26', 'Moi', 'Bien vu, je l’ajoute.'], ['31:40', 'Moi', 'Merci à tous, à jeudi prochain.'],
    ];
    const segsOf = () => TR.map(([t, sp, x], i) => ({ startMs: clock(t) * 1000, endMs: (TR[i + 1] ? Math.min(clock(TR[i + 1][0]), clock(t) + 30) : clock(t) + 12) * 1000, speaker: sp, text: x }));
    const ANN = `# Point équipe du jeudi
[[ia]]Le point d’avancement sur le **site Morel** est bon : la maquette d’accueil est validée, avec une photo d’en-tête plus grande, et le **budget photos** est plafonné à **1 200 € HT**. La mise en ligne reste visée au **6 novembre**, à condition que la recette du 30 octobre se passe bien.[[/ia]]

[[ia]]Il reste deux points à régler : le formulaire de contact, prévu fin de semaine prochaine, et la ligne de maintenance, à chiffrer dans le devis révisé. Côté recrutement, deux profils sérieux sont arrivés pour l’alternance ; les entretiens auront lieu la semaine du 26 octobre.[[/ia]]

## Refonte du site Morel
[[ia]]La préproduction est en ligne depuis mardi. La maquette d’accueil est validée, avec une photo d’en-tête plus grande que prévu ; il ne manque que le **formulaire de contact**, que Léa doit livrer d’ici la fin de la semaine prochaine.[[/ia]]

[[ia]]Pour le calendrier, la recette du site est fixée au vendredi 30 octobre et la mise en ligne au vendredi 6 novembre. Personne 3 a insisté pour garder une marge : « Je préfère garder une marge. »[[/ia]]

## Budget photos
[[ia]]Le photographe a chiffré sa journée à 1 800 € HT. En réutilisant six photos de l’atelier et en ne photographiant que l’équipe, le montant tombe à **1 200 € HT**, ce qui a été retenu comme plafond. Inès doit confirmer ce montant au photographe.[[/ia]]

## Recrutement
[[ia]]Deux profils sérieux ont répondu à l’offre d’alternance. Les entretiens se tiendront la semaine du 26 octobre ; Personne 3 appelle l’école d’ici vendredi pour préciser le calendrier de la formation.[[/ia]]

## Devis
[[ia]]Le devis révisé doit intégrer le budget photos et une ligne dédiée à la maintenance, restée à chiffrer. Il repart chez Morel vendredi 16 octobre.[[/ia]]

## Prochaines étapes
- [ ] [[ia]]**Moi** : renvoyer le devis révisé à Morel, avec le budget photos et la ligne maintenance (ven. 16 oct.)[[/ia]]
- [ ] [[ia]]**Léa Fontaine** : envoyer la maquette finale de l’accueil (lun. 19 oct.)[[/ia]]
- [ ] [[ia]]**Inès Garnier** : confirmer 1 200 € HT au photographe (aujourd’hui)[[/ia]]
- [ ] [[ia]]**Personne 3** : appeler l’école pour l’alternance (ven. 16 oct.)[[/ia]]`;
    const DAY = 864e5, now = Date.now();
    const PAST = [
      ['Atelier Morel : arborescence', 1, 58, 'brainstorm', ['Léa Fontaine', 'Marc Diallo'], 'Trois pistes d’arborescence comparées pour le site Morel ; la version « par métier » est retenue, avec une page atelier mise en avant.'],
      ['1:1 avec Marc', 3, 25, 'collegues', ['Marc Diallo'], 'Point sur la charge de Marc : il garde le site Morel et lâche la refonte de la newsletter ; on reparle des congés de décembre la semaine prochaine.'],
      ['Entretien alternant : Sami Benali', 6, 40, 'recrutement', ['Sami Benali'], 'Profil motivé, solide en intégration HTML/CSS, à l’aise avec Figma ; disponible en janvier. Deuxième entretien à caler avec Personne 3.'],
      ['Boulangerie Ravel : premier rendez-vous', 8, 47, 'client', ['Claire Ravel'], 'Besoin d’un site vitrine avec commande de gâteaux en ligne ; budget autour de 4 000 € ; devis attendu pour le 30 octobre.'],
      ['Cours : droit des contrats', 10, 65, 'cours', [], 'La formation du contrat : offre, acceptation, consentement et ses vices (erreur, dol, violence), avec deux exemples d’arrêts.'],
    ];
    const store = new Map();
    PAST.forEach(([title, d, min, kind, voix, bref], k) => {
      const id = 'demo-' + k;
      store.set(id, { meta: { id, title, createdAt: new Date(now - d * DAY - k * 3600e3).toISOString(), durationMs: min * 60e3, words: min * 120, path: '', provider: 'groq', kind },
        annotated: `# ${title}\n[[ia]]${bref}[[/ia]]`, segments: segsOf().slice(0, 4).map((s, i) => Object.assign({}, s, { speaker: i % 2 ? (voix[0] || 'Personne 2') : 'Moi' })), templateId: 'auto', templatePick: 'auto', kind, participants: voix, hasAudio: false });
    });
    store.set('demo-court', { meta: { id: 'demo-court', title: 'Appel rapide avec Inès', createdAt: new Date(now - 2 * 3600e3).toISOString(), durationMs: 3 * 60e3 + 12e3, words: 380, path: '', provider: 'passthrough' }, annotated: '', segments: segsOf().slice(9, 15), participants: ['Inès Garnier'], hasAudio: false });
    store.set('demo-vide', { meta: { id: 'demo-vide', title: 'Note du 15 octobre', createdAt: new Date(now - 4 * 3600e3).toISOString(), durationMs: 9e3, words: 3, path: '', provider: 'passthrough' }, annotated: '', segments: [{ startMs: 2000, endMs: 4000, speaker: 'Moi', text: 'Euh, test.' }], participants: [], hasAudio: false });
    const L = { progress: [], status: [], live: [], stage: [], voices: [], device: [], delta: [], ask: [], soon: [], call: [], auto: [] };
    const emit = (k, v) => L[k].forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
    let st = 'idle', t0 = 0, acc = 0, timer = null, liveI = 0, ann = ANN, hold = false;
    const cfg = { 'notes.autoStart': false };
    const el = () => acc + (st === 'recording' ? Date.now() - t0 : 0);
    const tick = () => {
      emit('progress', { state: st, elapsedMs: el(), words: liveI * 14 });
      emit('status', { state: 'recording', mode: 'note', level: st === 'recording' ? 0.25 + Math.random() * 0.6 : 0 });
    };
    let liveT = null;
    const stream = async (id, tpl) => {
      emit('progress', { state: 'organizing', stage: 'summary', elapsedMs: 32 * 60e3, words: 3400, noteId: id });
      emit('stage', { noteId: id, stage: 'summary' });
      await sleep(400);
      const stopAt = hold ? Math.floor(ann.length * 0.45) : ann.length + 60;
      for (let i = 60; i < stopAt; i += 60) { emit('delta', { noteId: id, annotated: ann.slice(0, i) }); await sleep(hold ? 4 : 60); }
      if (hold) return;
      const n = store.get(id); n.annotated = ann; n.templateId = 'auto'; n.templatePick = tpl || 'auto'; n.kind = 'reunion'; n.meta.provider = 'groq'; n.meta.kind = n.kind;
      emit('progress', { state: 'done', elapsedMs: 32 * 60e3, words: 3400, noteId: id });
      emit('stage', { noteId: id, stage: 'done' });
    };
    const m5 = Math.ceil(now / 3e5) * 3e5, today = new Date(); today.setHours(0, 0, 0, 0);
    const at = (dayOff, h, mi) => { const d = new Date(today); d.setDate(d.getDate() + dayOff); d.setHours(h, mi, 0, 0); return d.getTime(); };
    const EVENTS = [
      { id: 'ev1', title: 'Revue maquette Morel', start: m5 + 10 * 60e3, end: m5 + 40 * 60e3, location: '', url: 'https://meet.google.com/abc-defg-hij', attendees: [{ name: 'Camille Breton', me: true }, { name: 'Léa Fontaine', me: false }, { name: 'Marc Diallo', me: false }] },
      { id: 'ev2', title: 'Appel imprimeur : cartes de visite', start: m5 + 125 * 60e3, end: m5 + 145 * 60e3, location: 'Téléphone', url: '', attendees: [{ name: 'Inès Garnier', me: false }] },
      { id: 'ev3', title: 'Point budget Q4', start: m5 + 200 * 60e3, end: m5 + 230 * 60e3, location: '', url: 'https://zoom.us/j/123', attendees: [{ name: 'Marc Diallo', me: false }] },
      { id: 'ev4', title: 'Atelier contenus Boulangerie Ravel', start: at(1, 10, 0), end: at(1, 11, 30), location: 'Atelier', url: '', attendees: [{ name: 'Claire Ravel', me: false }, { name: 'Léa Fontaine', me: false }] },
      { id: 'ev5', title: 'Entretien alternant : 2e tour', start: at(1, 14, 0), end: at(1, 14, 45), location: '', url: 'https://meet.google.com/xyz', attendees: [{ name: 'Sami Benali', me: false }, { name: 'Personne 3', me: false }] },
    ];
    const api = {
      demo: true,
      start: async () => { st = 'recording'; t0 = Date.now(); acc = 0; liveI = 0; clearInterval(timer); timer = setInterval(tick, 250); tick();
        clearInterval(liveT); liveT = setInterval(() => { if (st !== 'recording' || liveI >= TR.length) return; const [t, sp, x] = TR[liveI++]; emit('live', { noteId: 'demo-now', source: sp === 'Moi' ? 'mic' : 'system', startMs: clock(t) * 1000, endMs: clock(t) * 1000 + 5000, text: x }); }, 1400); },
      pause: async () => { if (st !== 'recording') return; acc = el(); st = 'paused'; tick(); },
      resume: async () => { if (st !== 'paused') return; st = 'recording'; t0 = Date.now(); tick(); },
      stop: async (o) => {
        clearInterval(timer); clearInterval(liveT); st = 'transcribing';
        const id = 'demo-now';
        emit('progress', { state: 'transcribing', elapsedMs: el(), words: 3400 });
        await sleep(hold ? 20 : 900);
        store.set(id, { meta: { id, title: (o && o.title) || 'Point équipe du jeudi', createdAt: new Date().toISOString(), durationMs: 32 * 60e3, words: 3400, path: '', provider: 'pending' },
          annotated: '', segments: segsOf().map((s) => Object.assign({}, s, { speaker: s.speaker === 'Moi' ? 'Moi' : 'Les autres' })), participants: ['Léa Fontaine', 'Marc Diallo', 'Inès Garnier'], hasAudio: false });
        emit('stage', { noteId: id, stage: 'transcript' });
        emit('progress', { state: 'transcribing', stage: 'transcript', elapsedMs: 32 * 60e3, words: 3400, noteId: id });
        await sleep(hold ? 20 : 900); emit('stage', { noteId: id, stage: 'voices' });
        await sleep(hold ? 20 : 900); store.get(id).segments = segsOf(); emit('voices', { noteId: id, segments: segsOf(), diarized: true, mode: 'two-track' });
        st = 'organizing'; await stream(id, o && o.template); if (!hold) st = 'idle';
      },
      list: async () => [...store.values()].filter((n) => n.meta.provider !== 'pending' || n.annotated).map((n) => Object.assign({}, n.meta)),
      get: async (id) => { const n = store.get(id); if (!n) throw new Error('Note introuvable'); return JSON.parse(JSON.stringify(Object.assign({ transcript: '', markdown: '' }, n))); },
      rename: async (id, a, b) => { const n = store.get(id); if (!n) return; n.segments.forEach((s) => { if (s.speaker === a) s.speaker = b; }); n.annotated = n.annotated.split(a).join(b); if (id === 'demo-now') ann = n.annotated; },
      renameSegment: async (id, ms, b) => { const n = store.get(id); const s = n && n.segments.find((x) => Math.abs(x.startMs - ms) < 1); if (s) s.speaker = b; return !!s; },
      copy: async () => {}, del: async (id) => { store.delete(id); }, reveal: async () => {},
      current: async () => ({ state: st, active: st === 'recording' || st === 'paused', busy: st !== 'idle', elapsedMs: el(), meeting: null }),
      regenerate: async (id, o) => { const n = store.get(id); if (n) n.previous = { annotated: n.annotated }; await sleep(300); await stream(id, o && o.template); },
      restorePrevious: async (id) => { const n = store.get(id); if (n && n.previous) { n.annotated = n.previous.annotated; return true; } return false; },
      save: async (id, p) => { const n = store.get(id); if (n && p.annotated != null) n.annotated = p.annotated; if (n && p.title) n.meta.title = p.title; return true; },
      templates: async () => [
        { id: 'auto', label: 'Auto', hint: 'Résumé court complet : l’IA reconnaît le genre et adapte le plan' }, { id: 'equipe', label: 'Point d’équipe', hint: 'Avancement, blocages, décisions' },
        { id: 'un-a-un', label: '1:1', hint: 'Échange entre deux personnes' }, { id: 'client', label: 'Rendez-vous client', hint: 'Besoins, objections, prochaines étapes' },
        { id: 'recrutement', label: 'Recrutement', hint: 'Entretien avec un candidat' }, { id: 'atelier', label: 'Atelier / brainstorm', hint: 'Idées, regroupements, choix' },
        { id: 'cours', label: 'Cours / conférence', hint: 'Notes d’apprentissage d’un intervenant' }],
      ask: async (qid, q) => {
        const a = /photo|budget|€/.test(norm(q)) ? 'Le budget photos est plafonné à 1 200 € HT [S1]. Le photographe demandait 1 800 € HT la journée [S2].'
          : 'Deux points restent ouverts :\n- la mise en ligne du 6 novembre dépend de la recette du 30 octobre [S3] ;\n- la ligne maintenance n’est pas encore chiffrée [S4].';
        for (let i = 12; i < a.length + 12; i += 12) { emit('ask', { qid, answer: a.slice(0, i) }); await sleep(30); }
        const C = { S1: [16 * 60 + 48, '16:48'], S2: [15 * 60 + 50, '15:50'], S3: [19 * 60 + 30, '19:30'], S4: [24 * 60 + 20, '24:20'] };
        return { answer: a, citations: Object.keys(C).filter((k) => a.includes('[' + k + ']')).map((k) => ({ ref: k, noteId: 'demo-now', title: 'Point équipe du jeudi', t: C[k][0], label: C[k][1], source: 'transcript', quote: '' })), provider: 'groq' };
      },
      search: async (q) => { const k = norm(q); const hit = TR.find((r) => norm(r[2]).includes(k)); return hit && store.has('demo-now') ? [{ id: 'demo-now', snippet: hit[2] }] : []; },
      audio: async () => ({ ok: false, message: 'Démo : pas d’audio' }),
      privacy: async () => ({ local: false, provider: 'groq', label: 'Groq' }),
      meeting: async () => true, keep: async () => {},
      call: async (a) => {
        if (a === 'start') { emit('call', null); await api.start(); }
        else if (a === 'snooze' || a === 'dismiss') emit('call', null);
        else if (a === 'keep' || a === 'resume') { if (st === 'paused') api.resume(); emit('auto', { phase: 'cancel' }); }
        else if (a === 'stopNow') emit('auto', { phase: 'done' });
      },
      callState: async () => null,
      onProgress: (cb) => L.progress.push(cb), onStatus: (cb) => L.status.push(cb), onLive: (cb) => L.live.push(cb), onStage: (cb) => L.stage.push(cb),
      onVoices: (cb) => L.voices.push(cb), onDevice: (cb) => L.device.push(cb), onDelta: (cb) => L.delta.push(cb), onAskDelta: (cb) => L.ask.push(cb), onMeetingSoon: (cb) => L.soon.push(cb),
      onCallDetected: (cb) => L.call.push(cb), onAutoStop: (cb) => L.auto.push(cb),
      hubAvailable: async () => false, hubSend: async (t) => ({ ok: true, sent: t.length, failed: 0 }),
      calendarCurrent: async () => null,
      upcoming: async () => ({ enabled: true, events: EVENTS.filter((e) => e.end > Date.now()) }),
      join: async () => {}, getConfig: async () => Object.assign({}, cfg), setConfig: async (k, v) => { cfg[k] = v; },
      _seed: () => { store.set('demo-now', { meta: { id: 'demo-now', title: 'Point équipe du jeudi', createdAt: new Date(now - 3600e3).toISOString(), durationMs: 32 * 60e3, words: 3400, path: '', provider: 'groq', kind: 'reunion' }, annotated: ANN, segments: segsOf(), templateId: 'auto', templatePick: 'auto', kind: 'reunion', participants: ['Léa Fontaine', 'Marc Diallo', 'Inès Garnier'], hasAudio: true }); },
      _emit: emit, _hold: (v) => { hold = v; },
    };
    demoApi = api;
    return api;
  }

  /* ═════════ Cartes flottantes (toutes pages) ═════════ */
  const Cartes = (function () {
    let el = null, V = null, tic = null, reste = 0, total = 0, tenu = false, k = '', branche = false;
    const fermer = () => { clearInterval(tic); tic = null; if (el) { el.remove(); el = null; } k = ''; };
    function montrer(kind, html, secondes, onFin) {
      injectCss(); fermer(); k = kind;
      el = document.createElement('section');
      el.className = 'cbwc'; el.dataset.k = kind; el.setAttribute('role', kind === 'fin' ? 'alertdialog' : 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'cbwcT');
      el.innerHTML = html + (secondes ? '<div class="c-temps" aria-hidden="true"><i></i></div>' : '');
      document.body.appendChild(el);
      total = reste = secondes || 0; tenu = false;
      const libre = () => !el || !el.querySelector('.c-menu:not([hidden])');
      el.addEventListener('mouseenter', () => { tenu = true; }); el.addEventListener('mouseleave', () => { tenu = !libre(); });
      el.addEventListener('focusin', () => { tenu = true; }); el.addEventListener('focusout', () => { tenu = !libre(); });
      if (secondes) {
        const bar = el.querySelector('.c-temps i'), cpt = el.querySelector('[data-cpt]');
        requestAnimationFrame(() => bar.style.setProperty('--r', 1));
        tic = setInterval(() => {
          if (tenu) return;
          reste -= 1; bar.style.setProperty('--r', Math.max(0, reste / total)); if (cpt) cpt.textContent = Math.max(0, reste);
          if (reste <= 0) { clearInterval(tic); tic = null; const f = onFin; if (f) f(); }
        }, 1000);
      }
      return el;
    }
    const aller = (h) => { if (location.hash !== '#' + h) location.hash = '#' + h; window.dispatchEvent(new CustomEvent('dicta:navigate', { detail: h })); };
    function menuDetect(c, ouvrir) {
      const b = c.querySelector('[data-c="menu"]'), m = c.querySelector('.c-menu');
      const on = ouvrir == null ? m.hidden : ouvrir;
      m.hidden = !on; b.setAttribute('aria-expanded', String(on)); tenu = on;
      if (on) {
        const t = m.querySelector('[data-c="auto"]');
        Promise.resolve(V.getConfig()).then((cfg) => { t.setAttribute('aria-checked', String(!!(cfg && cfg['notes.autoStart'] === true))); }).catch(() => {});
        setTimeout(() => { const f = m.querySelector('button'); if (f) f.focus(); }, 0);
      }
    }
    function detectee(d) {
      if (!d) { if (k === 'detect') fermer(); return; }
      const app = d.app ? String(d.app) : '';
      const s = Math.max(5, Math.min(60, Number(d.seconds) || 10));
      const c = montrer('detect', `<div class="c-lab"><span>Réunion détectée</span><button type="button" class="btn-i c-x" data-c="dismiss" aria-label="Fermer : pas de notes pour cet appel" title="Fermer">${ICX}</button></div>
<h2 id="cbwcT">${esc(app ? app + ' utilise le micro' : 'Un appel utilise le micro')}</h2>
<p>Prendre des notes de cet appel${NB}? La carte se ferme dans <span data-cpt>${s}</span>${NB}s.</p>
<div class="c-act"><span class="split"><button type="button" class="btn1" data-c="start">Démarrer les notes</button><button type="button" class="btn1 chev" data-c="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Autres choix" title="Autres choix">${ICBAS}</button></span></div>
<div class="c-menu" role="menu" aria-label="Autres choix" hidden><div class="menu-l"><button type="button" role="menuitem" data-c="snooze">Plus tard (2${NB}min)</button><hr><button type="button" role="menuitemcheckbox" aria-checked="false" data-c="auto"><span>Démarrer automatiquement</span><span class="tg" aria-hidden="true"></span></button><button type="button" role="menuitem" data-c="regl">Réglages des notifications</button></div></div>`, s, fermer);
      c.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]'); if (!b) return; const a = b.dataset.c;
        if (a === 'menu') { menuDetect(c); return; }
        if (a === 'auto') { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); Promise.resolve(V.setConfig('notes.autoStart', v)).catch((err) => console.error(err)); return; }
        if (a === 'regl') { fermer(); aller('reglages:settings-notes'); return; }
        fermer(); if (a === 'start') aller('notes:direct');
        Promise.resolve(V.call(a)).catch((err) => console.error(err));
      });
      c.addEventListener('keydown', (e) => {
        const m = c.querySelector('.c-menu'); if (m.hidden) return;
        if (e.key === 'Escape') { e.stopPropagation(); menuDetect(c, false); c.querySelector('[data-c="menu"]').focus(); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
        const l = Array.from(m.querySelectorAll('button')), i = l.indexOf(document.activeElement); l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus();
      });
      return c;
    }
    function arretAuto(p) {
      if (!p || p.phase === 'cancel' || p.phase === 'done') { if (k === 'fin') fermer(); return; }
      if (p.phase === 'warn') {
        const s = Number(p.seconds) || 15;
        const c = montrer('fin', `<div class="c-lab"><span>Appel terminé</span></div>
<h2 id="cbwcT">Toujours là${NB}?</h2>
<p>La prise de notes s’arrête dans <span data-cpt>${s}</span>${NB}s. Le résumé se prépare ensuite.</p>
<div class="c-act"><button type="button" class="btn1" data-c="keep">Continuer les notes</button><button type="button" class="btn3" data-c="stopNow">Arrêter maintenant</button></div>`, s, null);
        c.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; fermer(); Promise.resolve(V.call(b.dataset.c)).catch((err) => console.error(err)); });
        setTimeout(() => { const b = c.querySelector('[data-c="keep"]'); if (b && !editable(document.activeElement)) b.focus({ preventScroll: true }); }, 50);
      } else if (p.phase === 'stopped') {
        const s = Number(p.seconds) || 4;
        const c = montrer('fin', `<div class="c-lab"><span>Notes arrêtées</span></div>
<h2 id="cbwcT">Notes arrêtées</h2>
<p>Le résumé se prépare dans <span data-cpt>${s}</span>${NB}s. Tu peux encore reprendre.</p>
<div class="c-act"><button type="button" class="btn1" data-c="resume">Reprendre</button></div>`, s, null);
        c.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; fermer(); Promise.resolve(V.call('resume')).catch((err) => console.error(err)); });
      }
    }
    function bientot(ev, demarrer) {
      if (!ev) return;
      const autres = (ev.attendees || []).filter((a) => !a.me).map((a) => a.name);
      const mins = Math.round((ev.start - Date.now()) / 60000);
      const c = montrer('cal', `<div class="c-lab"><span>Réunion sur le point de commencer</span><button type="button" class="btn-i c-x" data-c="x" aria-label="Fermer" title="Fermer">${ICX}</button></div>
<h2 id="cbwcT">${esc(fr((ev.title || 'Réunion') + (mins >= 1 ? ' dans ' + mins + ' min' : ' commence')))}</h2>
<p>${esc(fr((autres.length ? 'Avec ' + autres.slice(0, 3).join(', ') + (autres.length > 3 ? '…' : '') + '. ' : '') + (ev.location || '')))}</p>
<div class="c-act"><button type="button" class="btn1" data-c="go">Démarrer les notes</button><button type="button" class="btn3" data-c="x">Pas cette fois</button></div>`, 0, null);
      c.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; fermer(); if (b.dataset.c === 'go') { aller('notes'); demarrer(ev); } });
    }
    function brancher(v) {
      if (branche) return; branche = true; V = v;
      V.onCallDetected(detectee); V.onAutoStop(arretAuto);
      Promise.resolve(V.callState()).then((s) => { if (s && s.offer) detectee({ app: s.app, seconds: 10 }); }).catch(() => {});
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el && el.contains(document.activeElement) && k !== 'fin') { fermer(); } });
    }
    const ouvrirMenu = () => { if (el && k === 'detect') menuDetect(el, true); };
    return { brancher, detectee, arretAuto, bientot, fermer, ouvrirMenu };
  })();
  // Le pont réel est là dès le chargement : les cartes marchent sur toutes les pages, même avant d'ouvrir Notes.
  if (window.dictaApp && window.dictaApp.notesV2) { try { Cartes.brancher(adapter(window.dictaApp)); } catch (e) { console.error(e); } }

  /* ═════════ Montage ═════════ */
  let mounted = null;
  function mount(container, opts) {
    if (mounted) { mounted.open(opts && opts.noteId); return mounted; }
    opts = opts || {};
    const api = opts.api || window.dictaApp || {};
    const V = adapter(api);
    Cartes.brancher(V);
    const navigate = typeof opts.navigate === 'function' ? opts.navigate : () => {};
    injectCss();

    container.innerHTML = SVG + `
<div class="cbwr" data-niveau="liste" data-etape="avant" data-etat="repos">
  <section class="l1" aria-labelledby="rH1">
    <div class="l1-cadre">
      <header class="page-head l1-tete">
        <div class="ph-t"><h1 id="rH1"><span class="ln"><span>Notes</span></span></h1><p class="lede">Tes réunions et notes vocales${NB}: transcription, résumé et qui a dit quoi.</p></div>
        <div class="ph-a">
          <button type="button" class="btn-i" data-act="reglages" aria-label="Réglages des notes" title="Réglages des notes">${ic('reglage')}</button>
          <button type="button" class="btn2" data-act="nouvelle" title="Nouvelle note (⌘N)">${ic('plus')}Nouvelle note<kbd>⌘N</kbd></button>
        </div>
      </header>
      <div class="l1-main" data-r="l1Main">
        <div class="l1-in">
          <section class="avenir" data-r="avenir" aria-labelledby="rAvT" hidden>
            <div class="av-h"><h2 class="lab" id="rAvT">À venir</h2><span class="esp"></span><button type="button" class="btn-i" data-act="avSync" aria-label="Actualiser l’agenda" title="Actualiser l’agenda">${ic('sync')}</button></div>
            <div data-r="avListe"></div>
          </section>
          <div class="np-tete">
            <h2 class="lab" id="rNpT">Notes précédentes</h2><span class="esp"></span>
            <div class="cherche" role="search">${ic('loupe')}<input type="search" data-r="lCherche" placeholder="Rechercher dans les notes" aria-label="Rechercher dans les notes et leurs transcriptions"></div>
          </div>
          <div data-r="lListe" aria-labelledby="rNpT"></div>
        </div>
      </div>
      <aside class="apercu" data-r="apercu" aria-label="Aperçu"></aside>
    </div>
  </section>
  <section class="l2" data-r="l2" aria-label="Note">
    <div class="p-haut">
      <button type="button" class="btn3" data-act="retour" data-r="bRetour" aria-label="Retour à la liste des notes" title="Retour (Échap)">${ic('retour')}Retour</button>
      <span class="esp"></span>
      <span class="prive" data-r="prive" hidden></span>
      <button type="button" class="btn-i" data-r="bPlus" aria-label="Plus d’actions sur la note" title="Plus d’actions" aria-haspopup="menu" hidden>${ic('plus3')}</button>
      <button type="button" class="btn-i" data-act="prev" data-r="bPrev" aria-label="Note précédente (J)" title="Note précédente (J)">${ic('haut')}</button>
      <button type="button" class="btn-i" data-act="next" data-r="bNext" aria-label="Note suivante (K)" title="Note suivante (K)">${ic('bas')}</button>
    </div>
    <div class="defile" data-r="defile">
      <article class="feuille">
        <header class="page-head tete">
          <div class="ln-m"><h1 class="titre" data-r="titre" contenteditable="plaintext-only" spellcheck="false" aria-label="Titre de la note">Nouvelle note</h1></div>
          <div class="s-ligne"><span class="puce-d" data-r="sDate"></span><span class="s-h" data-r="heure"></span><span class="s-voix" data-r="sVoix"></span></div>
        </header>
        <div class="onglets" role="tablist" aria-label="Contenu de la note" data-r="onglets">
          <button type="button" role="tab" id="rTabTr" data-tab="tr" aria-selected="true" aria-controls="rPTr"><span class="onde" data-r="ondeTab" aria-hidden="true" hidden><i></i><i></i><i></i></span>Transcription</button>
          <button type="button" role="tab" id="rTabRes" data-tab="res" aria-selected="false" aria-controls="rPRes" tabindex="-1"><span class="charge" data-r="chargeTab" aria-hidden="true" hidden><i></i><i></i><i></i></span>Résumé</button>
        </div>
        <div class="corps">
        <div class="regle" data-r="regle" aria-hidden="true"><i></i></div>
        <section class="tab" id="rPTr" role="tabpanel" aria-labelledby="rTabTr">
          <div class="outils" data-r="oTr">
            <span class="o-lab" data-r="oTrLab"></span>
            <button type="button" class="btn-i" data-act="trCherche" data-r="bTrCherche" aria-label="Chercher dans la transcription (⌘F)" title="Chercher (⌘F)" aria-pressed="false">${ic('loupe')}</button>
            <button type="button" class="btn-i" data-act="trCopie" data-r="bTrCopie" aria-label="Copier toute la transcription" title="Copier tout">${ic('copie')}</button>
            <button type="button" class="btn2" data-act="nommer" data-r="bNommer" aria-haspopup="dialog">${ic('voix')}Nommer les voix</button>
          </div>
          <div class="o-ch" data-r="trChBox" hidden><input type="search" data-r="trCherche" placeholder="Chercher dans la transcription" aria-label="Chercher dans la transcription"><span class="n" data-r="trCpt" aria-live="polite"></span><button type="button" class="btn-i" data-act="trChX" aria-label="Fermer la recherche">${ic('x')}</button></div>
          <p class="p-info" data-r="pInfo"></p>
          <div class="frise" data-r="frise" aria-hidden="true" hidden></div>
          <div class="ecoute" data-r="ecoute" hidden>
            <button type="button" class="jouer" data-r="jouer" aria-label="Réécouter le passage">${ic('play')}</button>
            <div class="e-t"><b>Réécouter le passage</b><span data-r="eDuree"></span></div>
            <button type="button" class="btn3" data-act="retourRes">Revenir au résumé</button>
            <div class="piste" aria-hidden="true"><i data-r="ePiste"></i></div>
          </div>
          <div data-r="trListe"></div>
        </section>
        <section class="tab" id="rPRes" role="tabpanel" aria-labelledby="rTabRes" hidden>
          <div class="outils" data-r="oRes" hidden>
            <span class="o-lab"><span data-r="lecture"></span><span class="genre" data-r="genre" hidden></span></span>
            <button type="button" class="btn-i" data-act="resCherche" data-r="bResCherche" aria-label="Chercher dans le résumé (⌘F)" title="Chercher (⌘F)" aria-pressed="false">${ic('loupe')}</button>
            <button type="button" class="btn-i" data-act="copieRes" aria-label="Copier le résumé en Markdown" title="Copier">${ic('copie')}</button>
            <button type="button" class="btn-i" data-r="bRes" aria-label="Options du résumé" title="Options du résumé" aria-haspopup="menu">${ic('plus3')}</button>
          </div>
          <div class="o-ch" data-r="resChBox" hidden><input type="search" data-r="resCherche" placeholder="Chercher dans le résumé" aria-label="Chercher dans le résumé"><span class="n" data-r="resCpt" aria-live="polite"></span><button type="button" class="btn-i" data-act="resChX" aria-label="Fermer la recherche">${ic('x')}</button></div>
          <ol class="etapes" data-r="etapes" aria-label="Préparation du résumé" hidden></ol>
          <div data-r="cas"></div>
          <p class="att" data-r="att" hidden></p>
          <p class="legende" data-r="legende" id="rLeg" hidden><span>Texte gris${NB}: écrit par CBW AI. Ce que tu retouches passe en noir.</span><span><kbd>⌘⏎</kbd> cocher</span></p>
          <div class="note" data-r="note" role="textbox" aria-multiline="true" aria-label="Résumé" aria-describedby="rLeg" hidden></div>
          <p class="pied" data-r="pied" hidden>CBW AI peut se tromper sur un chiffre ou un nom. Vérifie dans l’onglet Transcription.</p>
        </section>
        </div>
      </article>
    </div>
    <div class="dock" data-r="dock">
      <section class="tiroir" data-r="tiroir" aria-labelledby="rTiT" hidden><div class="ti-h"><h2 class="lab" id="rTiT">Questions</h2><button type="button" class="btn3" data-act="tiroirX">Réduire</button></div><div data-r="qListe"></div></section>
      <p class="d-info" data-r="dInfo" hidden></p>
      <div class="barre" data-r="barre"></div>
    </div>
  </section>
  <div class="toast" data-r="toast" role="status" hidden></div>
  <section class="pop" data-r="popNom" role="dialog" aria-modal="false" aria-labelledby="rPNT" hidden>
    <h2 id="rPNT" data-r="popNomT">Qui est Personne 2 ?</h2>
    <p data-r="popNomP">Écoute deux passages, puis choisis un nom.</p>
    <ul class="extraits" data-r="extraits" aria-label="Deux passages de cette voix"></ul>
    <div class="choix" data-r="popChoix"></div>
    <form class="champ" data-r="popForm"><label for="rPopAutre">Autre nom</label><input id="rPopAutre" data-r="popAutre" autocomplete="off" placeholder="Prénom Nom"></form>
    <div class="portee" role="radiogroup" aria-label="Où renommer" data-r="portee"><button type="button" role="radio" data-p="partout" aria-checked="true">Partout</button><button type="button" role="radio" data-p="passage" aria-checked="false" tabindex="-1">Ce passage seulement</button></div>
    <div class="p-act"><button type="button" class="btn3" data-ferme>Annuler</button><button type="button" class="btn2" data-act="renommer">Renommer</button></div>
  </section>
  <section class="pop" data-r="popGab" role="dialog" aria-modal="false" aria-labelledby="rPGT" hidden>
    <h2 id="rPGT">Type de résumé</h2>
    <p>Auto reconnaît le genre (réunion, brainstorm, cours…) et adapte le plan. Tes retouches seront remplacées${NB}; la version actuelle reste récupérable.</p>
    <ul class="gabs" data-r="gabs" role="radiogroup" aria-labelledby="rPGT"></ul>
    <div class="p-act"><button type="button" class="btn3" data-ferme>Annuler</button><button type="button" class="btn1" data-act="gabGo">Refaire le résumé</button></div>
  </section>
  <section class="pop menu" data-r="popRes" role="menu" aria-label="Options du résumé" hidden>
    <div class="menu-l"><button type="button" role="menuitem" data-act="ouvrirGab">Type de résumé…</button><button type="button" role="menuitem" data-act="copyActs">Copier les prochaines étapes</button><button type="button" role="menuitem" data-act="hub" data-r="mHub" hidden>Envoyer les étapes au Hub</button><button type="button" role="menuitem" data-act="precedent" data-r="mPrev" hidden>Revenir à la version précédente</button><button type="button" role="menuitem" data-act="regen" data-r="mRegen">Régénérer le résumé</button></div>
  </section>
  <section class="pop menu" data-r="popPlus" role="menu" aria-label="Plus d’actions" hidden>
    <div class="menu-l"><button type="button" role="menuitem" data-act="copieNote">Copier au format Markdown</button><button type="button" role="menuitem" data-act="finder">Afficher dans le Finder</button><hr><button type="button" role="menuitem" class="danger" data-act="suppr">Supprimer…</button></div>
  </section>
  <section class="pop menu" data-r="popEv" role="menu" aria-label="Autres choix pour cette réunion" hidden>
    <div class="menu-l"><button type="button" role="menuitem" data-act="evSans">Démarrer sans rejoindre</button><button type="button" role="menuitem" data-act="evJoin">Rejoindre seulement</button></div>
  </section>
  <dialog class="dlg" data-r="dlgVoix" aria-labelledby="rDVT">
    <form data-r="dvForm">
      <div class="dlg-h"><h2 id="rDVT">Nommer les voix</h2><p>Donne un nom à chaque voix${NB}: toute la transcription et le résumé sont mis à jour. « Moi », c’est ton micro.</p><p class="sugg" data-r="dvSuggT" hidden></p></div>
      <div class="dlg-c"><ul class="dv-l" data-r="dvListe"></ul><datalist id="rDvSugg" data-r="dvSugg"></datalist></div>
      <div class="dlg-p"><button type="button" class="btn3" data-dv="annuler">Annuler</button><button type="submit" class="btn1">Enregistrer les noms</button></div>
    </form>
  </dialog>
  <div class="sr" data-r="live" aria-live="polite"></div>
</div>`;

    const root = container.querySelector('.cbwr');
    const pg = container.closest('.page'); if (pg) pg.classList.add('v2');
    const R = {};
    root.querySelectorAll('[data-r]').forEach((e) => { R[e.dataset.r] = e; });
    const $ = (s, r) => (r || root).querySelector(s);
    const $$ = (s, r) => Array.from((r || root).querySelectorAll(s));

    /* ── état ── */
    let E = 'avant', niveau = 'liste', sec = 0, paused = false, chronoT = null, sujet = {};
    let cur = null, curId = null, lines = [], segs = [], speakers = [], mode = 'two-track', live = [], sawSystem = false;
    let stageNow = '', partie = null, runId = null, privacy = null, templates = [], hubOK = false, allNotes = [];
    let ancre = null, saveT = null, deviceMsg = null, demandeHist = [], tab = 'tr';
    let audioEl = null, ecoute = null, arretT0 = 0, arretTic = null, legacy = false, gardees = new Set();
    let calOn = false, events = [], voirPlus = false, sel = null, apTout = false, cible = null, evCible = null, attendDirect = 0, listeCharge = false;
    const fiches = new Map();
    try { gardees = new Set(JSON.parse(localStorage.getItem('cbw.notes.gardees') || '[]')); } catch (e) { /* stockage indisponible */ }
    const say = (m) => { R.live.textContent = ''; setTimeout(() => { R.live.textContent = m; }, 30); };
    const enSession = () => E === 'pendant' || E === 'arret';
    const visible = () => root.isConnected && root.offsetParent !== null;

    /* ── toast (10 s avec action, pause au survol/focus, ⌘Z = Annuler) ── */
    let toastT = null, toastUndo = null;
    function toast(msg, undo, undoLabel) {
      clearTimeout(toastT); toastUndo = undo || null;
      R.toast.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">' + esc(undoLabel || 'Annuler') + '</button>' : '');
      R.toast.hidden = false;
      if (undo) R.toast.querySelector('button').onclick = () => { const f = toastUndo; hideToast(); if (f) f(); };
      armToast();
    }
    const hideToast = () => { R.toast.hidden = true; toastUndo = null; clearTimeout(toastT); };
    const armToast = () => { clearTimeout(toastT); toastT = setTimeout(hideToast, toastUndo ? 10000 : 6000); };
    R.toast.addEventListener('mouseenter', () => clearTimeout(toastT));
    R.toast.addEventListener('focusin', () => clearTimeout(toastT));
    R.toast.addEventListener('mouseleave', armToast);

    /* ── voix : couleurs, noms cliquables ── */
    const estPersonne = (sp) => /^Personne \d+$/.test(sp);
    const fixe = (sp) => sp === 'Moi' || sp === 'Micro' || sp === 'Les autres';
    const colorOf = (sp) => { if (sp === 'Moi' || sp === 'Micro') return 'var(--c-moi)'; if (sp === 'Les autres') return 'var(--c-autres)'; const i = speakers.filter((s) => s !== 'Moi').indexOf(sp); return 'var(--c-p' + (2 + ((i < 0 ? 0 : i) % 5)) + ')'; };
    let spkRe = null;
    function majSpeakers() {
      const seen = []; segs.forEach((s) => { if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker); });
      speakers = seen.sort((a, b) => (a === 'Moi' ? -1 : b === 'Moi' ? 1 : 0));
      const names = speakers.filter((s) => !fixe(s)).sort((a, b) => b.length - a.length).map((s) => esc(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      spkRe = names.length ? new RegExp('(^|[^\\p{L}\\p{N}])(' + names.join('|') + ')(?![\\p{L}\\p{N}])', 'gu') : null;
    }
    let bulles = new Set();
    const linkify = (h) => (spkRe ? h.replace(spkRe, (m, a, n) => {
      const q = estPersonne(n) && !bulles.has(n); if (q) bulles.add(n);
      return a + `<button type="button" class="spk" contenteditable="false" tabindex="-1" data-spk="${n}"${q ? ` data-inconnu aria-label="${n}, qui est-ce${NB}? Renommer"` : ''}>${n}</button>`;
    }) : h);
    const T = (s) => linkify(esc(fr(s)).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'));
    const pileHtml = (noms, max) => {
      const l = (noms || []).slice(0, max || 3);
      if (!l.length) return '';
      return l.map((n, i) => `<i style="--c:${n === 'Moi' ? 'var(--c-moi)' : 'var(--c-p' + (2 + (i % 5)) + ')'}">${esc(initiales(n))}</i>`).join('') + ((noms.length > (max || 3)) ? `<i class="neutre">+${noms.length - (max || 3)}</i>` : '');
    };

    /* ═════════ L1 : liste, À venir, aperçu ═════════ */
    const ordre = () => allNotes.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).filter((n) => !(E === 'arret' && n.id === runId)).map((n) => n.id);
    const metaDe = (id) => allNotes.find((n) => n.id === id) || null;
    async function refreshList() {
      try { allNotes = (await V.list()) || []; } catch (e) { allNotes = []; }
      listeCharge = true; rendListe(); rendApercu(); majVoisins(); prefetch();
    }
    let prefetchSeq = 0;
    async function prefetch() {
      const seq = ++prefetchSeq;
      const ids = ordre().filter((id) => !fiches.has(id)).slice(0, 40);
      if (!ids.length) return;
      for (let i = 0; i < ids.length; i += 3) {
        if (seq !== prefetchSeq) return;
        await Promise.all(ids.slice(i, i + 3).map(async (id) => { try { fiches.set(id, ficheDe(await V.get(id))); } catch (e) { fiches.set(id, { voix: [], bref: '', resume: false }); } }));
      }
      if (seq === prefetchSeq) { rendListe(); rendApercu(); }
    }
    let searchHits = new Map(), searchSeq = 0;
    async function chercher() {
      const q = R.lCherche.value.trim(); const id = ++searchSeq;
      if (q.length >= 2 && V.search) { try { const r = await V.search(q); if (id !== searchSeq) return; searchHits = new Map((r || []).map((x) => [x.id, x.snippet])); } catch (e) { searchHits = new Map(); } } else searchHits = new Map();
      rendListe();
    }
    const etapeNo = () => (stageNow === 'summary' || stageNow === 'retry' ? 3 : stageNow === 'transcript' || stageNow === 'voices' ? 2 : 1);
    const ETAPES = ['Sauvegarde de l’audio', 'Transcription', 'Résumé'];
    function sousEtape() {
      if (stageNow === 'retry') return 'autre moteur, on reprend';
      if (stageNow === 'voices') return 'séparation des voix';
      if (etapeNo() === 3 && partie && partie.total > 1) return 'partie ' + Math.min(partie.step || 1, partie.total) + ' sur ' + partie.total;
      return '';
    }
    function stageLabel() { const n = etapeNo(), s = sousEtape(); return 'Étape ' + n + ' sur 3' + NB + ': ' + ETAPES[n - 1].toLowerCase() + (s ? ', ' + s : '') + '…'; }
    const titreSession = () => (R.titre.textContent || '').trim() || 'Nouvelle note';
    function ligneLive() {
      const rec = E === 'pendant';
      const sub = rec
        ? `<span class="ondes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span data-chrono>${fmt(sec)}</span><span>${paused ? 'en pause' : 'en cours'}</span>`
        : `<span class="charge st-l" aria-hidden="true"><i></i><i></i><i></i></span><span class="st-l">${esc(stageLabel())}</span>`;
      return `<div class="ligne endirect${sel && sel.k === 'live' ? ' sel' : ''}"><button type="button" class="reu" data-reu="__live" aria-current="false" aria-label="${rec ? 'Ouvrir la note de réunion en direct' : 'Ouvrir la note en préparation'}${NB}: ${esc(titreSession())}"><span class="pile" aria-hidden="true"><i class="rec">${rec ? '●' : '…'}</i></span><span><b>${esc(fr(titreSession()))}</b><small>${sub}</small></span></button></div>`;
    }
    function statutLigne(n) {
      if (n.provider === 'passthrough') return quasiVide(n) ? '<span class="st-l">Presque rien capté</span>' : '<span class="st-e">Résumé non préparé</span>';
      if (n.provider === 'pending') return '<span class="st-l">Résumé en préparation…</span>';
      return '';
    }
    function rendListe() {
      const q = norm(R.lCherche.value);
      const groups = [];
      const add = (j, h) => { let g = groups.find((x) => x.j === j); if (!g) groups.push(g = { j, l: [] }); g.l.push(h); };
      if (enSession() && !q) add(surtitre(new Date().toISOString()), ligneLive());
      ordre().forEach((id) => {
        const n = metaDe(id), f = fiches.get(id);
        const inT = !q || norm(n.title).includes(q) || (f && f.voix.some((v) => norm(v).includes(q))), hit = q && searchHits.get(n.id);
        if (!inT && !hit) return;
        const voix = f ? f.voix : [];
        const pile = pileHtml(voix, 3) || `<i class="neutre">${esc(initiales(n.title || '?').slice(0, 1))}</i>`;
        const cour = n.id === curId && E === 'apres';
        add(surtitre(n.createdAt), `<div class="ligne${sel && sel.k === 'note' && sel.id === n.id ? ' sel' : ''}" data-id="${esc(n.id)}"><button type="button" class="reu" data-reu="${esc(n.id)}" aria-current="${cour}"><span class="pile" aria-hidden="true">${pile}</span><span><b>${esc(fr(n.title || 'Sans titre'))}</b><small><span>${esc(hm(n.createdAt))}</span>${statutLigne(n)}</small>${!inT && hit ? `<span class="ex">Trouvé dans la transcription${NB}: « ${esc(String(hit).slice(0, 90))} »</span>` : ''}</span></button><button type="button" class="btn-i plus" data-menu="${esc(n.id)}" aria-haspopup="menu" aria-label="Plus d’actions${NB}: ${esc(n.title || 'Sans titre')}" title="Plus d’actions">${ic('plus3')}</button></div>`);
      });
      if (!listeCharge) { R.lListe.innerHTML = '<div class="squel"></div><div class="squel"></div><div class="squel"></div>'; return; }
      R.lListe.innerHTML = groups.length ? groups.map((g) => `<h3 class="lab jour">${esc(g.j)}</h3>` + g.l.join('')).join('')
        : q ? `<div class="vide-l"><b>Aucune note trouvée pour « ${esc(R.lCherche.value.trim())} »</b><span>Essaie un nom, un client ou un chiffre.</span></div>`
          : `<div class="vide-l"><b>Aucune note pour le moment</b><span>Les notes de tes réunions apparaîtront ici. Lance « Nouvelle note » au début de ta prochaine visio.</span><button type="button" class="btn2" data-act="nouvelle">${ic('plus')}Nouvelle note</button></div>`;
      roving(R.lListe, '.reu', '[aria-current="true"]');
    }
    function roving(box, s, pref) {
      const items = $$(s, box); if (!items.length) return;
      const act = (pref && box.querySelector(s + pref)) || items[0];
      items.forEach((b) => { b.tabIndex = b === act ? 0 : -1; });
    }
    function rovingKeys(box, s) {
      box.addEventListener('keydown', (e) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const items = $$(s, box).filter((x) => !x.closest('[hidden]') && x.offsetParent !== null); const i = items.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault();
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        items.forEach((b) => { b.tabIndex = -1; }); items[n].tabIndex = 0; items[n].focus();
      });
    }
    rovingKeys(R.lListe, '.reu');
    let chT = null;
    R.lCherche.addEventListener('input', () => { rendListe(); clearTimeout(chT); chT = setTimeout(chercher, 250); });
    R.lCherche.addEventListener('keydown', (e) => { if (e.key === 'Escape' && R.lCherche.value) { e.stopPropagation(); R.lCherche.value = ''; searchHits = new Map(); rendListe(); } });

    /* À venir (agenda) */
    async function majAgenda(annonce) {
      try { const r = await V.upcoming(); calOn = !!(r && r.enabled); events = ((r && r.events) || []).filter((e) => e && e.end > Date.now()).sort((a, b) => a.start - b.start); }
      catch (e) { calOn = false; events = []; }
      rendAvenir(); rendApercu();
      if (annonce) say(calOn ? (events.length ? events.length + ' réunion' + (events.length > 1 ? 's' : '') + ' à venir.' : 'Aucune réunion à venir.') : 'Agenda désactivé.');
    }
    function rendAvenir() {
      if (!calOn) { R.avenir.hidden = true; return; }
      R.avenir.hidden = false;
      const now = Date.now();
      const auj = events.filter((e) => jourDiff(new Date(e.start)) <= 0);
      const vis = voirPlus ? events : events.slice(0, 3);
      const groupes = [];
      vis.forEach((ev) => { const j = jourAgenda(Math.max(ev.start, ev.start <= now ? now : ev.start)); let g = groupes.find((x) => x.j === j); if (!g) groupes.push(g = { j, l: [] }); g.l.push(ev); });
      let h = '';
      if (!auj.length) h += `<h3 class="lab av-j">Aujourd’hui</h3><p class="av-vide">Aucune réunion aujourd’hui</p>`;
      h += groupes.map((g) => `<h3 class="lab av-j">${esc(g.j)}</h3>` + g.l.map((ev) => {
        const encours = ev.start <= now && ev.end > now, cpt = compteur(ev);
        const autres = (ev.attendees || []).filter((a) => !a.me).map((a) => a.name);
        const actif = enSession() && sujet.eventId && sujet.eventId === ev.id;
        const act = actif ? `<span class="enreg"><span class="ondes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="chrono" data-chrono>${fmt(sec)}</span></span>`
          : ev.url ? `<button type="button" class="btn2" data-evgo="${esc(ev.id)}" data-join="1">Rejoindre et démarrer</button><button type="button" class="btn-i" data-evmenu="${esc(ev.id)}" aria-haspopup="menu" aria-label="Autres choix${NB}: ${esc(ev.title || 'Réunion')}" title="Autres choix">${ic('bas')}</button>`
            : `<button type="button" class="btn2" data-evgo="${esc(ev.id)}">Démarrer</button>`;
        return `<div class="ev${sel && sel.k === 'ev' && sel.id === ev.id ? ' sel' : ''}" data-ev="${esc(ev.id)}"${encours ? ' data-now' : ''}><span class="bar" aria-hidden="true"></span><button type="button" class="ev-m" data-evsel="${esc(ev.id)}"><b>${esc(fr(ev.title || 'Réunion'))}</b><small>${esc(hm(ev.start))}–${esc(hm(ev.end))}${autres.length ? ' · ' + esc(autres.slice(0, 2).join(', ')) + (autres.length > 2 ? ' +' + (autres.length - 2) : '') : ''}</small></button><span class="ev-d">${cpt ? `<span class="cpt">${esc(cpt)}</span>` : ''}<span class="ev-act">${act}</span></span></div>`;
      }).join('')).join('');
      if (events.length > 3) h += `<div class="av-plus"><button type="button" class="btn3" data-act="avPlus" aria-expanded="${voirPlus}">${voirPlus ? 'Afficher moins' : 'Afficher ' + (events.length - 3) + ' de plus'}</button></div>`;
      R.avListe.innerHTML = h;
    }
    const evDe = (id) => events.find((e) => e.id === id) || null;
    const autresDe = (ev) => (ev.attendees || []).filter((a) => !a.me).map((a) => a.name);
    async function demarrerEv(ev, rejoindre) {
      if (!ev) return;
      if (rejoindre && ev.url) { try { await V.join(ev.url); } catch (e) { toast('Impossible d’ouvrir le lien de la réunion.'); } }
      demarrer({ title: ev.title || undefined, participants: autresDe(ev), eventId: ev.id });
    }
    R.avenir.addEventListener('click', (e) => {
      const go = e.target.closest('[data-evgo]'); if (go) { demarrerEv(evDe(go.dataset.evgo), !!go.dataset.join); return; }
      const mn = e.target.closest('[data-evmenu]'); if (mn) { e.stopPropagation(); evCible = mn.dataset.evmenu; ancre = mn; mn.setAttribute('aria-expanded', 'true'); placer(R.popEv, mn); $('button', R.popEv).focus(); return; }
      const s = e.target.closest('[data-evsel]'); if (s) { sel = { k: 'ev', id: s.dataset.evsel }; rendAvenir(); rendApercu(); const b = $(`[data-evsel="${CSS_ESC(s.dataset.evsel)}"]`, R.avenir); if (b) b.focus(); }
    });
    const CSS_ESC = (s) => (window.CSS && window.CSS.escape ? window.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));

    /* Aperçu (280 px) : suit le survol ou la sélection */
    function defaut() {
      if (sel && ((sel.k === 'note' && metaDe(sel.id)) || (sel.k === 'ev' && evDe(sel.id)) || (sel.k === 'live' && enSession()))) return sel;
      if (enSession()) return { k: 'live' };
      if (calOn && events.length) return { k: 'ev', id: events[0].id };
      const o = ordre(); return o.length ? { k: 'note', id: o[0] } : null;
    }
    const participantsHtml = (noms, moiEn) => {
      if (!noms.length) return '';
      const l = apTout ? noms : noms.slice(0, 5);
      return `<div class="ap-s"><h3 class="lab">Participants</h3><ul class="ap-p">${l.map((n, i) => `<li style="--c:${n.me ? 'var(--c-moi)' : 'var(--c-p' + (2 + (i % 5)) + ')'}">${esc(n.name || n)}${n.me ? ' <em>(toi)</em>' : ''}</li>`).join('')}</ul>${noms.length > 5 ? `<button type="button" class="btn3" data-act="apPlus" style="padding-left:0">${apTout ? 'Afficher moins' : '+' + (noms.length - 5) + ' de plus'}</button>` : ''}</div>`;
    };
    let apCle = '';
    function rendApercu(it) {
      it = it || defaut();
      const cle = it ? it.k + ':' + (it.id || '') + ':' + apTout : '';
      if (!it) { apCle = ''; R.apercu.innerHTML = `<p class="ap-vide">${listeCharge ? 'Survole une note pour voir son aperçu.' : ''}</p>`; return; }
      apCle = cle;
      if (it.k === 'ev') {
        const ev = evDe(it.id); if (!ev) return;
        const prochain = events.find((e) => e.start > Date.now());
        const cpt = compteur(ev);
        const att = (ev.attendees || []).map((a) => ({ name: a.name, me: a.me })).sort((a, b) => (a.me ? -1 : b.me ? 1 : 0));
        R.apercu.innerHTML = `${prochain && prochain.id === ev.id ? '<span class="ap-badge">À venir</span>' : ev.start <= Date.now() ? '<span class="ap-badge rec">Maintenant</span>' : ''}<h2>${esc(fr(ev.title || 'Réunion'))}</h2><p class="ap-l">${esc(jourAgenda(ev.start))} • ${esc(hm(ev.start))}–${esc(hm(ev.end))}${cpt && cpt !== 'Maintenant' ? ' • ' + esc(cpt) : ''}</p>${ev.location ? `<p class="ap-l">${esc(ev.location)}</p>` : ''}${participantsHtml(att)}`;
        return;
      }
      if (it.k === 'live') {
        const voix = (sujet.participants || []).map((n) => ({ name: n }));
        R.apercu.innerHTML = `<span class="ap-badge rec">${E === 'pendant' ? 'En direct' : 'Finalisation'}</span><h2>${esc(fr(titreSession()))}</h2><p class="ap-l">Aujourd’hui • ${esc(hm(Date.now() - sec * 1000))} • ${E === 'pendant' ? '<span data-chrono>' + fmt(sec) + '</span>' : esc(durLab(sec * 1000))}</p>${participantsHtml(voix)}<div class="ap-s"><h3 class="lab">Vue d’ensemble</h3><p class="ap-bref${E === 'arret' ? ' st' : ''}">${E === 'pendant' ? 'Le résumé apparaît à la fin de la réunion. Les noms des voix arrivent après l’arrêt.' : esc(stageLabel())}</p></div>`;
        return;
      }
      const n = metaDe(it.id); if (!n) return;
      const f = fiches.get(n.id);
      const voix = f ? (f.moi ? [{ name: 'Moi', me: true }] : []).concat(f.voix.map((v) => ({ name: v }))) : [];
      const g = n.kind && GENRES[n.kind] ? GENRES[n.kind] : '';
      const bref = !f ? '<p class="ap-bref st">Chargement…</p>' : f.bref ? `<p class="ap-bref">${esc(fr(f.bref))}</p>`
        : `<p class="ap-bref st">${n.provider === 'passthrough' ? (quasiVide(n) ? 'Presque rien n’a été capté.' : 'Le résumé n’a pas pu être préparé. La transcription est enregistrée.') : 'Pas encore de résumé.'}</p>`;
      R.apercu.innerHTML = `<h2>${esc(fr(n.title || 'Sans titre'))}</h2><p class="ap-l">${esc(puceDate(n.createdAt))} • ${esc(hm(n.createdAt))} • ${esc(durLab(n.durationMs))}</p>${g ? `<p class="ap-l">${esc(g)}</p>` : ''}${participantsHtml(voix)}<div class="ap-s"><h3 class="lab">Vue d’ensemble</h3>${bref}</div>`;
    }
    const itemDe = (el) => {
      const r = el.closest('[data-reu]'); if (r) return r.dataset.reu === '__live' ? { k: 'live' } : { k: 'note', id: r.dataset.reu };
      const v = el.closest('[data-ev]'); if (v) return { k: 'ev', id: v.dataset.ev };
      return null;
    };
    R.l1Main.addEventListener('mouseover', (e) => { const it = itemDe(e.target); if (!it) return; const k = it.k + ':' + (it.id || '') + ':' + apTout; if (k !== apCle) rendApercu(it); });
    R.l1Main.addEventListener('mouseleave', () => rendApercu());
    R.l1Main.addEventListener('focusin', (e) => {
      const it = itemDe(e.target); if (!it) return; sel = it;
      $$('.ligne.sel,.ev.sel', root).forEach((x) => x.classList.remove('sel'));
      const box = e.target.closest('.ligne,.ev'); if (box) box.classList.add('sel');
      rendApercu(it);
    });
    R.lListe.addEventListener('click', (e) => {
      const m = e.target.closest('[data-menu]'); if (m) { e.stopPropagation(); ouvrirMenuNote(m.dataset.menu, m); return; }
      const b = e.target.closest('[data-reu]'); if (!b) return;
      if (b.dataset.reu === '__live') { montrerNote(); navigate('#notes:' + (E === 'arret' && runId ? runId : 'direct')); return; }
      allerNote(b.dataset.reu);
    });
    function ouvrirMenuNote(id, el) { cible = id; ancre = el; el.setAttribute('aria-expanded', 'true'); placer(R.popPlus, el); $('button', R.popPlus).focus(); }

    /* ── Niveaux ── */
    function allerListe(o) {
      o = o || {};
      const venant = niveau === 'note' ? curId : null;
      niveau = 'liste'; root.dataset.niveau = 'liste';
      fermerPops(false); arreterEcoute();
      if (!o.silencieux) navigate('#notes');
      rendListe(); rendAvenir(); rendApercu();
      if (o.focus !== false && venant !== undefined) {
        const b = (venant && $(`[data-reu="${CSS_ESC(venant)}"]`, R.lListe)) || (enSession() && $('[data-reu="__live"]', R.lListe));
        if (b && !o.silencieux) { $$('.reu', R.lListe).forEach((x) => { x.tabIndex = -1; }); b.tabIndex = 0; b.focus({ preventScroll: false }); }
      }
    }
    function montrerNote() {
      const deja = niveau === 'note';
      niveau = 'note'; root.dataset.niveau = 'note';
      if (!deja) { R.bRetour.focus({ preventScroll: true }); }
    }
    function allerNote(id) {
      if (enSession() && id !== runId) { toast('Arrête la prise de notes avant d’ouvrir une autre note.'); return; }
      if (enSession()) { montrerNote(); return; }
      ouvrirNote(id);
    }
    function majVoisins() {
      const ids = ordre(), i = ids.indexOf(curId), ok = E === 'apres' && i >= 0;
      R.bPrev.disabled = !ok || i <= 0; R.bNext.disabled = !ok || i >= ids.length - 1;
    }
    function voisin(d) {
      if (E !== 'apres') return;
      const ids = ordre(), i = ids.indexOf(curId); const id = ids[i + d]; if (!id) return;
      ouvrirNote(id, { focus: d < 0 ? R.bPrev : R.bNext }).then(() => say((cur && cur.meta.title) || ''));
    }

    /* ── onglets Transcription · Résumé (tabindex itinérant, flèches) ── */
    function choisirOnglet(t) {
      tab = t; root.dataset.onglet = t;
      $$('[role="tab"]', R.onglets).forEach((b) => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      $('#rPTr').hidden = t !== 'tr'; $('#rPRes').hidden = t !== 'res';
      if (t !== 'tr') arreterEcoute();
      if (t === 'tr') rendTR();
    }
    R.onglets.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) choisirOnglet(t.dataset.tab); });
    R.onglets.addEventListener('keydown', (e) => {
      if (!e.target.matches('[role="tab"]') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      e.preventDefault(); const n = tab === 'tr' ? 'res' : 'tr'; choisirOnglet(n); $(`[data-tab="${n}"]`, R.onglets).focus();
    });
    function majOnglets() { R.ondeTab.hidden = E !== 'pendant' || paused; R.chargeTab.hidden = E !== 'arret'; }

    /* ── en-tête de la note : puce date + voix ── */
    function majSousLigne() {
      const iso = cur && E === 'apres' ? cur.meta.createdAt : new Date().toISOString();
      R.sDate.textContent = puceDate(iso);
      R.heure.textContent = hm(iso);
      if (E === 'apres' && segs.length) {
        const vs = speakers.filter((s) => !fixe(s));
        const tous = (speakers.includes('Moi') ? ['Moi'] : []).concat(vs);
        R.sVoix.innerHTML = vs.length ? `<span class="pile" aria-hidden="true">${tous.slice(0, 4).map((k) => `<i style="--c:${colorOf(k)}">${esc(initiales(k))}</i>`).join('')}</span><span>${vs.map((k) => `<button type="button" class="spk" data-spk="${esc(k)}"${estPersonne(k) ? ' data-inconnu' : ''}>${esc(k)}</button>`).join(', ')}</span>` : '';
        roving(R.sVoix, '.spk');
      } else {
        const p = (E === 'apres' ? (cur && cur.participants) : sujet.participants) || [];
        R.sVoix.innerHTML = p.length ? `<span>Avec ${esc(p.slice(0, 4).join(', '))}${p.length > 4 ? '…' : ''}</span>` : '';
      }
    }
    R.sVoix.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const it = $$('.spk', R.sVoix), i = it.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); const n = it[(i + (e.key === 'ArrowRight' ? 1 : -1) + it.length) % it.length]; it.forEach((x) => { x.tabIndex = -1; }); n.tabIndex = 0; n.focus();
    });

    /* ── transcription ── */
    function trRows() {
      if (E === 'pendant') return live.map((x) => ({ startMs: x.startMs, speaker: x.source === 'system' ? 'Les autres' : (sawSystem ? 'Moi' : 'Micro'), text: x.text }));
      return segs;
    }
    function majOutilsTr(rows) {
      rows = rows || trRows();
      const nomm = E === 'apres' && speakers.some((s) => !fixe(s));
      if (E === 'pendant') { R.oTrLab.className = 'o-lab rec'; R.oTrLab.innerHTML = `<span data-chrono role="timer" aria-label="Durée">${fmt(sec)}</span><span>${paused ? 'En pause' : 'Écoute en cours'}</span>`; }
      else if (E === 'apres') { R.oTrLab.className = 'o-lab'; R.oTrLab.textContent = speakers.length ? `${speakers.length} voix • ${durLab(cur && cur.meta.durationMs)}` : durLab(cur && cur.meta.durationMs); }
      else if (E === 'arret') { R.oTrLab.className = 'o-lab'; R.oTrLab.textContent = etapeNo() >= 2 ? 'Transcription prête • voix à la fin' : 'Transcription en cours'; }
      else { R.oTrLab.className = 'o-lab'; R.oTrLab.textContent = 'Rien n’est enregistré pour l’instant'; }
      R.bTrCherche.hidden = R.bTrCopie.hidden = !rows.length;
      R.bNommer.hidden = !nomm;
    }
    function rendTR() {
      const rows = trRows(), q = norm(R.trCherche.value);
      const pend = E === 'pendant';
      let n = 0;
      R.trListe.innerHTML = rows.map((s, i) => {
        if (q && !norm(s.speaker + ' ' + s.text).includes(q)) return '';
        n++;
        const who = fixe(s.speaker) || E !== 'apres'
          ? `<span class="qui">${esc(s.speaker)}</span>` : `<button type="button" class="spk qui" data-spk="${esc(s.speaker)}" data-ms="${s.startMs}"${estPersonne(s.speaker) ? ' title="Qui est-ce ? Clique pour renommer"' : ''}>${esc(s.speaker)}</button>`;
        return `<div class="tr" data-i="${i}" style="--c:${colorOf(s.speaker)}"><button type="button" class="tt" ${pend ? 'disabled' : `data-ecoute="${s.startMs}"`} aria-label="${pend ? fmt(s.startMs / 1000) : 'Réécouter à ' + fmt(s.startMs / 1000)}">${fmt(s.startMs / 1000)}</button>${who}<p>${esc(fr(s.text))}</p></div>`;
      }).join('') || (q ? '<p class="vide-t">Rien ne correspond. Essaie un autre mot.</p>'
        : E === 'avant' ? `<div class="bienvenue"><b>Bienvenue dans Notes</b><p>Lance « Démarrer » au début d’une visio ou d’une réunion en salle. Rien à faire ensuite${NB}: le résumé arrive à la fin.</p><small>CBW AI reconnaît seul qui parle. Tu corriges les noms après coup, d’un clic.</small></div>`
          : `<p class="vide-t">${pend ? 'Les passages transcrits arrivent ici au fil de l’appel. Les noms arrivent après l’arrêt.' : E === 'arret' ? 'La transcription arrive à l’étape 2.' : 'Pas de transcription pour cette note.'}</p>`);
      R.trCpt.textContent = q ? n + NB + 'passage' + (n > 1 ? 's' : '') : '';
      roving(R.trListe, '.tt');
      R.pInfo.classList.toggle('direct', pend);
      R.pInfo.textContent = pend ? (sawSystem ? 'En direct. « Moi », c’est ton micro ; « Les autres », le son du Mac. Les noms arrivent à la fin. L’IA ne lit rien avant.' : 'En direct, sur le micro. Les voix sont séparées à la fin. L’IA ne lit rien avant.')
        : rows.length && E === 'apres' ? (mode === 'mix' ? 'Voix séparées automatiquement : vérifie qui est qui. Clique sur un nom pour le corriger.' : '« Moi », c’est ton micro. Clique sur un nom pour le corriger, sur une heure pour réécouter.') : '';
      R.pInfo.hidden = !R.pInfo.textContent;
      majOutilsTr(rows); rendFrise();
    }
    rovingKeys(R.trListe, '.tt');
    R.trCherche.addEventListener('input', rendTR);
    function rendFrise() {
      if (E === 'pendant' || !segs.length || !segs.some((s) => !fixe(s.speaker))) { R.frise.hidden = true; return; }
      const fin = Math.max(60e3, ...segs.map((s) => s.endMs || s.startMs + 5000));
      R.frise.hidden = false;
      R.frise.innerHTML = speakers.map((k) => `<div class="f-l" style="--c:${colorOf(k)}"><span>${esc(k)}</span><div class="f-p">${segs.filter((x) => x.speaker === k).map((x) => `<button type="button" tabindex="-1" data-ecoute="${x.startMs}" title="${esc(k)}, ${fmt(x.startMs / 1000)}" style="left:${(x.startMs / fin * 100).toFixed(2)}%;width:${(Math.max((x.endMs || x.startMs + 4000) - x.startMs, 4000) / fin * 100).toFixed(2)}%"></button>`).join('')}</div></div>`).join('')
        + `<div class="f-ax"><span>00:00</span><span>${fmt(fin / 1000)}</span></div>`;
    }
    /* recherche dans l'onglet (⌘F, /) */
    function ouvrirCherche(t, on) {
      const box = t === 'tr' ? R.trChBox : R.resChBox, inp = t === 'tr' ? R.trCherche : R.resCherche, b = t === 'tr' ? R.bTrCherche : R.bResCherche;
      on = on == null ? box.hidden : on;
      box.hidden = !on; b.setAttribute('aria-pressed', String(on));
      if (on) { inp.focus(); inp.select(); } else { inp.value = ''; if (t === 'tr') rendTR(); else chercherRes(); b.focus({ preventScroll: true }); }
    }
    let resHits = [], resI = 0;
    function chercherRes() {
      const q = norm(R.resCherche.value);
      $$('.u.trouve', R.note).forEach((x) => x.classList.remove('trouve', 'trouve-cur'));
      resHits = q.length >= 2 ? $$('.u', R.note).filter((u) => norm(u.textContent).includes(q)) : [];
      resHits.forEach((u) => u.classList.add('trouve')); resI = 0; allerHit(0);
    }
    function allerHit(d) {
      if (!resHits.length) { R.resCpt.textContent = norm(R.resCherche.value).length >= 2 ? '0/0' : ''; return; }
      resI = (resI + d + resHits.length) % resHits.length;
      resHits.forEach((u, i) => u.classList.toggle('trouve-cur', i === resI));
      R.resCpt.textContent = (resI + 1) + '/' + resHits.length;
      resHits[resI].scrollIntoView({ block: 'center', behavior: rm() ? 'auto' : 'smooth' });
    }
    R.resCherche.addEventListener('input', chercherRes);
    R.resCherche.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); allerHit(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ouvrirCherche('res', false); } });
    R.trCherche.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ouvrirCherche('tr', false); } });

    /* ── source (loupe) → onglet Transcription + réécoute ── */
    const nearest = (ms) => { let best = -1, d = Infinity; segs.forEach((s, i) => { const x = Math.abs(s.startMs - ms); if (x < d) { d = x; best = i; } }); return best; };
    let depuisResume = false;
    function montrerSource(times, from) {
      if (!segs.length) { toast('La transcription n’est pas encore prête.'); return; }
      ancre = from || document.activeElement;
      depuisResume = !!(from && from.closest && from.closest('#rPRes'));
      $$('.u.actif', root).forEach((u) => u.classList.remove('actif'));
      const u = from && from.closest && from.closest('.u'); if (u) u.classList.add('actif');
      R.trCherche.value = ''; R.trChBox.hidden = true; R.bTrCherche.setAttribute('aria-pressed', 'false'); choisirOnglet('tr');
      const idx = [...new Set(times.map((t) => nearest(t * 1000)))].filter((i) => i >= 0).sort((a, b) => a - b);
      const rows = idx.map((i) => $(`.tr[data-i="${i}"]`, R.trListe)).filter(Boolean);
      rows.forEach((r) => r.classList.add('hl'));
      const a = segs[idx[0]], b = segs[idx[idx.length - 1]];
      $('[data-act="retourRes"]', R.ecoute).hidden = !depuisResume;
      if (a && cur && cur.hasAudio) {
        const fromMs = a.startMs, toMs = Math.min(fromMs + 60000, Math.max((b.endMs || b.startMs + 8000), fromMs + 4000));
        ecoute = { fromMs, toMs }; R.ePiste.style.setProperty('--a', 0);
        R.eDuree.textContent = fmt(fromMs / 1000) + ' à ' + fmt(toMs / 1000) + ', ' + Math.round((toMs - fromMs) / 1000) + NB + 's';
        R.ecoute.hidden = false; R.jouer.hidden = false; $('.e-t b', R.ecoute).textContent = 'Réécouter le passage';
      } else {
        ecoute = null; R.ecoute.hidden = !depuisResume; R.jouer.hidden = true; $('.e-t b', R.ecoute).textContent = 'Passage surligné';
        R.eDuree.textContent = a ? fmt(a.startMs / 1000) + (cur && !cur.hasAudio ? ', audio non conservé' : '') : '';
      }
      if (rows[0]) rows[0].scrollIntoView({ block: 'center', behavior: rm() ? 'auto' : 'smooth' });
      if (a && cur && cur.hasAudio) R.jouer.focus({ preventScroll: true });
      else { const tt = rows[0] && $('.tt', rows[0]); if (tt) { $$('.tt', R.trListe).forEach((x) => { x.tabIndex = -1; }); tt.tabIndex = 0; tt.focus({ preventScroll: true }); } }
      if (a) say('Passage surligné dans la transcription, à ' + fmt(a.startMs / 1000) + '. Échap pour revenir au résumé.');
    }
    function retourResume() {
      choisirOnglet('res'); R.ecoute.hidden = true; depuisResume = false;
      if (ancre && document.contains(ancre)) (ancre.matches('button,[tabindex]') ? ancre : R.note).focus({ preventScroll: false });
    }
    function arreterEcoute() { if (audioEl) audioEl.pause(); R.jouer.innerHTML = ic('play'); R.jouer.setAttribute('aria-label', 'Réécouter le passage'); }
    async function jouer(fromMs, toMs, btn, onTime) {
      if (!curId) return null;
      const r = await V.audio(curId, fromMs, toMs);
      if (!r || !r.ok) { toast((r && r.message) || 'Audio indisponible.'); return null; }
      const a = new Audio(r.dataUrl);
      if (onTime) a.ontimeupdate = () => { if (a.duration) onTime(a.currentTime / a.duration); };
      a.onended = () => { if (btn) { btn.innerHTML = ic('play'); btn.setAttribute('aria-label', 'Écouter'); } };
      await a.play(); if (btn) { btn.innerHTML = ic('pause'); btn.setAttribute('aria-label', 'Mettre en pause'); }
      return a;
    }
    R.jouer.onclick = async () => {
      if (audioEl && !audioEl.paused) { arreterEcoute(); return; }
      if (!ecoute) return;
      try {
        if (!audioEl || audioEl.dataset.k !== ecoute.fromMs + '-' + ecoute.toMs) {
          if (audioEl) audioEl.pause();
          audioEl = await jouer(ecoute.fromMs, ecoute.toMs, R.jouer, (p) => R.ePiste.style.setProperty('--a', p));
          if (audioEl) { audioEl.dataset.k = ecoute.fromMs + '-' + ecoute.toMs; audioEl.onended = arreterEcoute; }
        } else { await audioEl.play(); R.jouer.innerHTML = ic('pause'); R.jouer.setAttribute('aria-label', 'Mettre en pause'); }
      } catch (e) { toast('Lecture impossible : ' + errMsg(e)); }
    };

    /* ═════════ Rendu du résumé ═════════ */
    function rowHtml(l, i) {
      if (l.kind === 'heading') {
        const t = (l.spans[0] && l.spans[0].text) || '';
        return `<h3 class="u h${l.level >= 3 ? ' h3' : ''}" data-i="${i}"><span class="tx">${T(t)}</span></h3>`;
      }
      const spans = legacy ? l.spans.map((s) => ({ kind: 'ia', text: s.text, refs: [] })) : l.spans;
      const pre = l.prefix || '', q = /^\s*>/.test(pre), todo = /\[[ xX]\]/.test(pre), done = /\[[xX]\]/.test(pre), li = /[-*+•]|\d+[.)]/.test(pre.replace(/^\s*>\s*/, '').trim()) && !todo, sub = /^\s{2,}/.test(pre);
      const anyIa = spans.some((s) => s.kind === 'ia'), allIa = anyIa && spans.every((s) => s.kind === 'ia');
      const body = spans.map((s) => s.kind === 'ia'
        ? (allIa ? `<span class="tx"><span class="sr" contenteditable="false">IA${NB}: </span>${T(s.text)}</span>` : `<span class="ia-in"><span class="sr" contenteditable="false">IA${NB}: </span>${T(s.text)}</span>`)
        : `<span class="tx">${T(s.text)}</span>`).join('');
      const plain = sansMd(plainOf(l)).trim();
      const cit = q && /^[«"“]/.test(plain);
      const cls = ['u', allIa ? 'ia' : 'me', q ? 'q' : '', cit ? 'cit' : '', todo ? 'todo' : li ? 'li' : '', sub && !q ? 'sub' : '', done ? 'fait' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}" data-i="${i}">`
        + (todo ? `<span class="coche" contenteditable="false"><input type="checkbox" tabindex="-1"${done ? ' checked' : ''} aria-label="Fait${NB}: ${esc(plain.slice(0, 120))}"></span>` : '')
        + body
        + '</div>';
    }
    /* Lignes → rangées (clé = index de ligne). En flux : ordre du document ; à la fin : paragraphe général, thèmes, puis « Prochaines étapes » en dernier. */
    function buildRows(ls, final) {
      bulles = new Set();
      const titleIdx = ls.findIndex((l) => l.kind === 'heading' && l.level === 1);
      let s = { key: 'top', label: null, idx: -1, rows: [] }; const secs = [s];
      ls.forEach((l, i) => {
        if (i === titleIdx || l.kind === 'blank') return;
        if (l.kind === 'heading' && l.level <= 2) { const t = (l.spans[0] && l.spans[0].text) || ''; s = { key: SEC(t), label: t, idx: i, rows: [] }; secs.push(s); return; }
        s.rows.push(i);
      });
      let order = secs.filter((x) => x.rows.length || x.label);
      if (final) { const by = (k) => order.filter((x) => x.key === k); order = by('top').concat(by('bref'), order.filter((x) => !['top', 'bref', 'faire'].includes(x.key)), by('faire')); }
      const out = [];
      order.forEach((x) => {
        if (x.label) out.push({ k: 'h' + x.idx, html: `<div class="bh" contenteditable="false"><h2 class="mgh">${esc(fr(sansMd(x.label)))}</h2></div>` });
        x.rows.forEach((i) => out.push({ k: 'r' + i, html: rowHtml(ls[i], i) }));
        if (final && x.key === 'faire' && x.rows.length) out.push({ k: 'acts' + x.idx, html: `<div class="acts" contenteditable="false"><button type="button" class="btn3" data-act="copyActs">Copier les prochaines étapes</button>${hubOK ? '<button type="button" class="btn3" data-act="hub">Envoyer au Hub</button>' : ''}<span>Les cases non cochées, en Markdown.</span></div>` });
      });
      return out;
    }
    function paint(rows, fade) {
      const ex = new Map($$(':scope > [data-k]', R.note).map((c) => [c.dataset.k, c]));
      $$(':scope > :not([data-k])', R.note).forEach((x) => x.remove());
      let prev = null;
      rows.forEach((r) => {
        let el = ex.get(r.k);
        if (el && el.__h === r.html) ex.delete(r.k);
        else {
          const t = document.createElement('template'); t.innerHTML = r.html; const n = t.content.firstElementChild;
          n.dataset.k = r.k; n.__h = r.html; if (fade && !el) n.classList.add('nouv');
          if (el) { el.replaceWith(n); ex.delete(r.k); }
          el = n;
        }
        const want = prev ? prev.nextSibling : R.note.firstChild;
        if (want !== el) R.note.insertBefore(el, want);
        prev = el;
      });
      ex.forEach((x) => x.remove());
    }
    const lecture = () => { const mots = lines.reduce((a, l) => a + plainOf(l).split(/\s+/).filter(Boolean).length, 0); return Math.max(1, Math.round(mots / 200)) + NB + 'min de lecture'; };

    /* ── édition : une seule zone (audit M9) ; retoucher un ajout gris le rend noir ── */
    const rowOf = (n) => { while (n && n !== R.note) { if (n.nodeType === 1 && n.classList.contains('u') && n.parentNode === R.note) return n; n = n.parentNode; } return null; };
    function textNodes(row) {
      const out = []; const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement.closest('[contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      let t; while ((t = w.nextNode())) out.push(t); return out;
    }
    function serial(n) {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1) return '';
      if (n.classList.contains('sr') || n.classList.contains('loupe') || n.classList.contains('coche')) return '';
      if (n.classList.contains('spk')) return n.dataset.spk || n.textContent;
      const inner = Array.from(n.childNodes).map(serial).join('');
      return n.tagName === 'B' && inner.trim() ? '**' + inner + '**' : inner;
    }
    const rowText = (row) => Array.from(row.childNodes).map(serial).join('').replace(/ /g, ' ');
    function caretEdge(row, end) {
      const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false;
      const r = s.getRangeAt(0), tn = textNodes(row); if (!tn.length) return true;
      const p = document.createRange();
      if (end) { const l = tn[tn.length - 1]; p.setStart(r.endContainer, r.endOffset); p.setEnd(l, l.length); } else { p.setStart(tn[0], 0); p.setEnd(r.startContainer, r.startOffset); }
      return p.toString().replace(/\s/g, '').length === 0 && (end ? true : p.toString().length === 0);
    }
    R.note.addEventListener('beforeinput', (e) => {
      if (R.note.contentEditable !== 'true') return;
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') { e.preventDefault(); return; }
      const s = getSelection(); if (!s.rangeCount) return;
      const r = s.getRangeAt(0), a = rowOf(r.startContainer), b = rowOf(r.endContainer);
      if (!a || a !== b) { e.preventDefault(); return; }
      if (e.inputType === 'deleteContentBackward' && caretEdge(a, false)) e.preventDefault();
      if (e.inputType === 'deleteContentForward' && caretEdge(a, true)) e.preventDefault();
    });
    R.note.addEventListener('input', (e) => {
      const s = getSelection(); const row = rowOf(s.anchorNode || e.target); if (!row) return;
      const l = lines[+row.dataset.i]; if (!l) return;
      const txt = rowText(row);
      if (l.kind === 'heading') l.spans = [{ kind: 'user', text: txt.trim(), refs: [] }];
      else {
        l.spans = [{ kind: 'user', text: txt, refs: [] }];
        row.classList.replace('ia', 'me'); $$('.ia-in', row).forEach((x) => x.classList.replace('ia-in', 'tx')); $$('.sr', row).forEach((x) => x.remove());
      }
      row.__h = null; sauver();
    });
    R.note.addEventListener('change', (e) => {
      const cb = e.target.closest('.coche input'); if (!cb) return;
      const row = cb.closest('.u'), l = lines[+row.dataset.i]; if (!l) return;
      l.prefix = l.prefix.replace(/\[[ xX]\]/, cb.checked ? '[x]' : '[ ]'); row.classList.toggle('fait', cb.checked); row.__h = null; sauver();
    });
    R.note.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.metaKey) return;
      const row = rowOf(getSelection().anchorNode); if (!row) return;
      e.preventDefault();
      const cb = $('.coche input', row); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); say(cb.checked ? 'Cochée.' : 'Décochée.'); }
    });
    const majCur = () => { const r = rowOf(getSelection().anchorNode); $$('.u.cur', R.note).forEach((x) => { if (x !== r) x.classList.remove('cur'); }); if (r) r.classList.add('cur'); };
    R.note.addEventListener('focusin', majCur);
    const onSel = () => { if (root.isConnected && (R.note.contains(document.activeElement) || document.activeElement === R.note)) majCur(); };
    document.addEventListener('selectionchange', onSel);
    function sauver() {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        if (!curId || !V.save) return; const md = linesToMd(lines); if (cur) cur.annotated = md;
        Promise.resolve(V.save(curId, { annotated: md })).then(() => { if (cur) fiches.set(curId, ficheDe(cur)); }).catch((e) => toast('Enregistrement impossible : ' + errMsg(e)));
      }, 700);
    }
    R.titre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); R.titre.blur(); } });
    R.titre.addEventListener('blur', () => {
      const t = R.titre.textContent.trim(); if (!t) { R.titre.textContent = (cur && E === 'apres' && cur.meta.title) || 'Nouvelle note'; return; }
      if (E === 'apres' && curId && cur && t !== cur.meta.title) changerTitre(t);
      else if (enSession()) { sujet.title = t; rendListe(); if (E === 'pendant') Promise.resolve(V.meeting({ title: t })).catch(() => {}); }
    });
    function changerTitre(t) { cur.meta.title = t; R.titre.textContent = t; Promise.resolve(V.save(curId, { title: t })).then(refreshList).catch(() => {}); }

    /* ═════════ Barre du bas : Démarrer / Arrêter / Reprendre / Finalisation… + Demander… ═════════ */
    function rendInfo() {
      const d = R.dInfo;
      d.classList.toggle('err', !!(deviceMsg && deviceMsg.err));
      if (E === 'pendant' && deviceMsg) { d.hidden = false; d.setAttribute('role', 'status'); d.textContent = deviceMsg.t; return; }
      d.removeAttribute('role');
      if (E === 'avant' || E === 'pendant') { d.hidden = false; d.innerHTML = `<span>Préviens toujours les participants que tu prends des notes.</span><button type="button" class="btn3" data-act="phrase">Copier la phrase</button>`; return; }
      d.hidden = true; d.innerHTML = '';
    }
    function rendBarre() {
      const b = R.barre;
      if (E === 'avant') {
        b.innerHTML = `<button type="button" class="btn1" data-act="go"><span class="carre" aria-hidden="true"></span>Démarrer</button><span class="etat-l">Rien n’est enregistré pour l’instant.</span>`;
      } else if (E === 'pendant') {
        const ondes = `<span class="ondes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="chrono" data-chrono role="timer" aria-label="Durée">${fmt(sec)}</span>`;
        b.innerHTML = paused
          ? `<button type="button" class="btn1" data-act="reprendre">Reprendre</button><button type="button" class="btn3" data-act="stop" title="Arrêter (⌘.)">Arrêter</button><span class="esp"></span><div class="enreg">${ondes}<span class="etat-l" role="status">En pause</span></div>`
          : `<button type="button" class="btn1" data-act="stop" title="Arrêter (⌘.)"><span class="carre" aria-hidden="true"></span>Arrêter</button><span class="esp"></span><div class="enreg">${ondes}<span class="etat-l" role="status">Écoute en cours</span></div>`;
      } else if (E === 'arret') {
        b.innerHTML = cur && cur.panne
          ? `<span class="st-err">Le résumé n’a pas pu être préparé.</span><span class="esp"></span><button type="button" class="btn1" data-act="retry">Réessayer</button>`
          : `<button type="button" class="btn2" disabled><span class="charge" aria-hidden="true"><i></i><i></i><i></i></span>Finalisation…</button><span class="st-ia" role="status"><span data-stl>${esc(stageLabel())}</span><span class="mono" data-sts>${Math.round((Date.now() - arretT0) / 1000)}${NB}s</span></span>`;
      } else {
        b.innerHTML = `<button type="button" class="btn2" data-act="suite" title="Reprendre l’enregistrement dans cette note : la transcription et le résumé seront mis à jour">Reprendre</button><div class="demande"><input data-ask autocomplete="off" placeholder="Demander… une question ou une modification (/ pour les demandes rapides)" aria-label="Demander : une question à cette note, ou une modification du résumé" aria-autocomplete="list" aria-controls="rRap" aria-expanded="false"><kbd>⌘J</kbd><ul class="rapides" id="rRap" role="listbox" aria-label="Demandes rapides" hidden></ul></div>`;
        brancherAsk();
      }
      rendInfo(); majOnglets();
    }
    function rendEtapes() {
      const n = etapeNo(), s = sousEtape();
      R.etapes.innerHTML = ETAPES.map((l, i) => { const k = i + 1, st = k < n ? 'fait' : k === n ? 'cours' : 'attente';
        return `<li data-s="${st}"><span class="n" aria-hidden="true">${st === 'fait' ? '✓' : k + '/3'}</span><span>${esc(l)}<span class="sr">${st === 'fait' ? ', fait' : st === 'cours' ? ', en cours' : ', à venir'}</span></span>${st === 'cours' ? `<small>${esc(s || (k === 3 ? 'le texte s’écrit ci-dessous' : 'en cours'))}</small>` : '<span></span>'}</li>`; }).join('');
    }
    const majStage = () => { rendEtapes(); const l = $('[data-stl]', R.barre); if (l) l.textContent = stageLabel(); else if (E === 'arret') rendBarre(); if (E === 'arret') { majOutilsTr(); if (niveau === 'liste') { rendListe(); rendApercu(); } } };
    R.barre.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'go') demarrer({ title: R.titre.textContent.trim() !== 'Nouvelle note' ? R.titre.textContent.trim() : undefined, participants: sujet.participants, eventId: sujet.eventId });
      else if (a === 'stop') terminer();
      else if (a === 'reprendre') { try { await V.resume(); } catch (err) { toast(errMsg(err)); } }
      else if (a === 'suite') reprendreSuite();
      else if (a === 'retry') refaire(cur && (cur.templatePick || cur.templateId));
    });
    /* Reprendre = continuer la MÊME note (même fichier) : la capture s'ajoute, transcription, voix et résumé sont refaits sur l'ensemble. */
    function reprendreSuite() {
      if (E !== 'apres' || !cur || !curId) return;
      const id = curId, t = String(cur.meta.title || 'Note');
      demarrer({ title: t, participants: cur.participants || [], continueId: id });
      toast(`Reprise de « ${t} ». Le résumé sera mis à jour à l’arrêt.`);
    }

    /* ═════════ « Demander… » : questions + modifications (tiroir vers le haut) ═════════ */
    let qSeq = 0;
    const askDeltas = new Map();
    V.onAskDelta((d) => { const f = d && askDeltas.get(d.qid); if (f) f(d.answer || ''); });
    function mdLite(txt, cites) {
      const cite = (refs) => refs.split(/\s*,\s*/).map((r) => { const c = cites && cites.find((x) => x.ref === r); if (!c) return ''; const lab = c.noteId !== curId ? (c.title + (c.label ? ', ' + c.label : '')) : (c.label || 'dans le résumé'); return `<button type="button" class="cite" data-cite="${esc(c.ref)}" aria-label="Voir la source ${esc(lab)}">${esc(lab)}</button>`; }).join(' ');
      const inl = (s) => esc(fr(s)).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g, (m, r) => (cites ? cite(r) : ''));
      const out = []; let ul = false;
      String(txt).split('\n').forEach((l) => {
        const m = /^\s*[-*•]\s+(.*)$/.exec(l);
        if (m) { if (!ul) { out.push('<ul>'); ul = true; } out.push('<li>' + inl(m[1]) + '</li>'); return; }
        if (ul) { out.push('</ul>'); ul = false; }
        if (l.trim()) out.push('<p>' + inl(l.replace(/^#{1,6}\s+/, '')) + '</p>');
      });
      if (ul) out.push('</ul>');
      return out.join('');
    }
    function carteQA(q) {
      R.tiroir.hidden = false;
      const art = document.createElement('article'); art.className = 'qa'; art.setAttribute('aria-busy', 'true');
      art.innerHTML = `<h3>${esc(fr(q))}</h3><p class="attente"><span class="charge" aria-hidden="true"><i></i><i></i><i></i></span>Lecture de la note</p><div class="rep"></div>`;
      R.qListe.appendChild(art); art.scrollIntoView({ block: 'end', behavior: rm() ? 'auto' : 'smooth' });
      return art;
    }
    async function demander(q) {
      if (!curId) return;
      let m;
      if ((m = RE_RENOMME.exec(q)) && speakers.includes(m[1].trim())) { await renommer(m[1].trim(), m[2].trim().replace(/[.!]$/, '')); return; }
      if ((m = RE_TITRE.exec(q))) { const t = m[1].trim().replace(/^[«"“]\s*|\s*[»"”]$/g, ''); const old = cur.meta.title; changerTitre(t); toast('Titre changé.', () => changerTitre(old)); return; }
      const modif = RE_MODIF.test(q.trim());
      const art = carteQA(q);
      const rep = $('.rep', art), qid = 'q' + (++qSeq);
      askDeltas.set(qid, (a) => { const w = $('.attente', art); if (w && a) w.remove(); rep.innerHTML = mdLite(a, null); });
      try {
        const r = await V.ask(qid, q, [curId], demandeHist.slice(-6));
        const w = $('.attente', art); if (w) w.remove();
        const ans = (r && r.answer) || 'Je ne trouve pas ça dans tes réunions.';
        rep.innerHTML = mdLite(ans, (r && r.citations) || []);
        rep.__cites = (r && r.citations) || [];
        if (modif && r && r.answer) {
          const d = document.createElement('div'); d.className = 'acts';
          d.innerHTML = '<button type="button" class="btn2" data-act="remplacer">Remplacer le résumé par cette version</button><span>La version actuelle reste récupérable.</span>';
          d.querySelector('button').__txt = r.answer; art.appendChild(d);
        }
        demandeHist.push({ role: 'user', content: q }, { role: 'assistant', content: (r && r.answer) || '' });
        say('Réponse prête : ' + rep.textContent.slice(0, 140));
      } catch (err) {
        const w = $('.attente', art); if (w) w.remove();
        rep.innerHTML = `<p class="err">Pas de réponse${NB}: ${esc(errMsg(err))}</p>`;
        say('La demande n’a pas abouti.');
      } finally { askDeltas.delete(qid); art.setAttribute('aria-busy', 'false'); }
    }
    function remplacerResume(txt) {
      const old = linesToMd(lines);
      const titre = (lines.find((l) => l.kind === 'heading' && l.level === 1) || null);
      const corps = String(txt).replace(/\s*\[S\d+(?:\s*,\s*S\d+)*\]/g, '').split('\n').map((l) => {
        if (!l.trim() || /^#{1,6}\s/.test(l)) return l;
        const p = PREFIX_RE.exec(l)[1]; const b = l.slice(p.length); return b.trim() ? p + '[[ia]]' + b + '[[/ia]]' : l;
      }).join('\n');
      const md = (titre ? lineToMd(titre) + '\n' : '') + corps;
      lines = parseAnnotated(md); cur.annotated = md; paint(buildRows(lines, true), false); choisirOnglet('res');
      Promise.resolve(V.save(curId, { annotated: md })).catch((e) => toast(errMsg(e)));
      toast('Résumé remplacé.', () => { lines = parseAnnotated(old); cur.annotated = old; paint(buildRows(lines, true), false); V.save(curId, { annotated: old }); }, 'Revenir');
      R.defile.scrollTop = 0;
    }
    R.qListe.addEventListener('click', (e) => {
      const rp = e.target.closest('[data-act="remplacer"]'); if (rp) { e.stopPropagation(); remplacerResume(rp.__txt); return; }
      const c = e.target.closest('[data-cite]'); if (!c) return;
      const rep = c.closest('.rep'), ci = rep && (rep.__cites || []).find((x) => x.ref === c.dataset.cite); if (!ci) return;
      if (ci.noteId === curId) { if (ci.t != null) montrerSource([ci.t], c); else { choisirOnglet('res'); R.note.focus(); toast('Cette source est dans le résumé.'); } }
      else allerNote(ci.noteId);
    });
    function brancherAsk() {
      const inp = $('[data-ask]', R.barre), ul = $('#rRap', R.barre); let s = 0, ouvert = false;
      const fermer = () => { ul.hidden = true; ouvert = false; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); };
      const rend = () => {
        const f = norm(inp.value.slice(1)); const l = DEMANDES.filter((r) => !f || norm(r.nom).includes(f));
        if (!l.length) { fermer(); return; }
        s = Math.min(s, l.length - 1);
        ul.innerHTML = '<li class="r-t" role="presentation">Demandes rapides</li>' + l.map((r, i) => `<li role="option" id="rRp-${r.id}" data-rec="${r.id}" aria-selected="${i === s}"><b>${esc(r.nom)}</b><span>${esc(r.desc)}</span></li>`).join('');
        ul.hidden = false; ouvert = true; inp.setAttribute('aria-expanded', 'true'); inp.setAttribute('aria-activedescendant', 'rRp-' + l[s].id);
      };
      const lancer = (id) => { const r = DEMANDES.find((x) => x.id === id); fermer(); inp.value = ''; demander(r.q); };
      inp.addEventListener('focus', () => { if (R.qListe.children.length) R.tiroir.hidden = false; });
      inp.addEventListener('input', () => { if (inp.value.startsWith('/')) rend(); else fermer(); });
      inp.addEventListener('keydown', (e) => {
        const o = $$('[role="option"]', ul);
        if (ouvert && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); s = (s + (e.key === 'ArrowDown' ? 1 : -1) + o.length) % o.length; rend(); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ouvert && o[s]) lancer(o[s].dataset.rec); else if (inp.value.trim()) { demander(inp.value.trim()); inp.value = ''; } }
        else if (e.key === 'Escape') { e.stopPropagation(); if (ouvert) fermer(); else if (!R.tiroir.hidden) R.tiroir.hidden = true; else inp.blur(); }
      });
      ul.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-rec]'); if (li) { e.preventDefault(); lancer(li.dataset.rec); } });
      inp.addEventListener('blur', () => setTimeout(fermer, 120));
    }

    /* ═════════ Renommer une voix : 2 extraits audio, noms suggérés, Partout / Ce passage ═════════ */
    function placer(pop, el) {
      pop.hidden = false;
      const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      let top = r.bottom + 8; const left = Math.min(r.left, innerWidth - w - 12);
      if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 8);
      pop.style.top = top + 'px'; pop.style.left = Math.max(12, left) + 'px';
    }
    let popAudio = null;
    function fermerPops(rendre) {
      $$('.pop', root).forEach((p) => { p.hidden = true; });
      $$('[aria-expanded="true"][data-menu],[aria-expanded="true"][data-evmenu]', root).forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (popAudio) { popAudio.pause(); popAudio = null; }
      if (rendre && ancre && document.contains(ancre)) ancre.focus({ preventScroll: true });
    }
    function extraitsDe(k) {
      const l = segs.filter((s) => s.speaker === k && s.text).sort((a, b) => b.text.length - a.text.length);
      const out = [];
      for (const s of l) { if (out.every((o) => Math.abs(o.startMs - s.startMs) > 30000)) out.push(s); if (out.length === 2) break; }
      if (out.length < 2) for (const s of l) { if (!out.includes(s)) out.push(s); if (out.length === 2) break; }
      return out.sort((a, b) => a.startMs - b.startMs);
    }
    function portee(p) { $$('[data-p]', R.portee).forEach((b) => { const on = b.dataset.p === p; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); }
    function ouvrirNom(k, el) {
      if (!curId || E !== 'apres' || fixe(k)) return;
      ancre = el; R.popNom.dataset.k = k; R.popNom.dataset.ms = el.dataset.ms || '';
      R.popNomT.textContent = (estPersonne(k) ? 'Qui est ' : 'Renommer ') + k + (estPersonne(k) ? NB + '?' : '');
      const ex = extraitsDe(k), audio = !!(cur && cur.hasAudio);
      R.popNomP.textContent = audio ? 'Écoute deux passages de cette voix, puis choisis un nom.' : 'Deux passages de cette voix. Pour les réécouter, active « Garder l’audio » dans Réglages › Notes.';
      R.extraits.innerHTML = ex.map((s) => `<li class="${audio ? '' : 'sans'}">${audio ? `<button type="button" class="jouer" data-x="${s.startMs}-${s.endMs || s.startMs + 8000}" aria-label="Écouter le passage à ${fmt(s.startMs / 1000)}">${ic('play')}</button>` : ''}<div><span>${fmt(s.startMs / 1000)}</span><q>${esc(fr(s.text.length > 110 ? s.text.slice(0, 108) + '…' : s.text))}</q></div></li>`).join('');
      const pris = new Set(speakers);
      const sugg = [...new Set(((cur && cur.participants) || []).filter((n) => !pris.has(n)).concat(speakers.filter((s) => !fixe(s) && !estPersonne(s) && s !== k)))].slice(0, 8);
      R.popChoix.innerHTML = sugg.map((n) => `<button type="button" data-nom="${esc(n)}">${esc(n)}</button>`).join('') || '<span class="legende" style="margin:0">Aucun invité à proposer. Tape le nom ci-dessous.</span>';
      R.popAutre.value = ''; portee('partout'); R.portee.hidden = !el.dataset.ms;
      placer(R.popNom, el);
      ($('button', R.extraits) || $('button', R.popChoix) || R.popAutre).focus();
    }
    async function basculerExtrait(b, box) {
      if (popAudio && !popAudio.paused && popAudio.__b === b) { popAudio.pause(); b.innerHTML = ic('play'); return; }
      if (popAudio) { popAudio.pause(); $$('[data-x]', box).forEach((x) => { x.innerHTML = ic('play'); }); }
      const [a, z] = b.dataset.x.split('-').map(Number);
      try { popAudio = await jouer(a, Math.min(z, a + 12000), b); if (popAudio) popAudio.__b = b; } catch (err) { toast('Lecture impossible : ' + errMsg(err)); }
    }
    R.extraits.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) basculerExtrait(b, R.extraits); });
    R.portee.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) portee(b.dataset.p); });
    R.portee.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const n = $('[aria-checked="false"]', R.portee); portee(n.dataset.p); n.focus(); });
    async function renommer(from, to, o) {
      o = o || {};
      to = String(to || '').trim(); if (!to || to === from || !curId) return;
      try {
        if (o.ms) { const ok = await V.renameSegment(curId, Number(o.ms), to); if (!ok) throw new Error('passage introuvable'); }
        else await V.rename(curId, from, to);
        await charger(curId); entrerApres({ garderScroll: true, garderOnglet: true });
        if (!o.silencieux) {
          if (o.ms) toast(`Ce passage est attribué à ${to}.`);
          else { toast(`« ${from} » s’appelle maintenant ${to}, partout dans la note.`, () => renommer(to, from, { silencieux: true })); say(from + ' renommé ' + to + ' partout.'); }
        }
      } catch (e) { toast('Renommage impossible : ' + errMsg(e)); }
    }
    const valider = (nom) => { const k = R.popNom.dataset.k, ms = $('[aria-checked="true"]', R.portee).dataset.p === 'passage' ? R.popNom.dataset.ms : ''; fermerPops(true); renommer(k, nom, { ms }); };
    R.popChoix.addEventListener('click', (e) => { const b = e.target.closest('[data-nom]'); if (b) valider(b.dataset.nom); });
    R.popForm.addEventListener('submit', (e) => { e.preventDefault(); const v = R.popAutre.value.trim(); if (!v) { R.popAutre.focus(); return; } valider(v); });

    /* ═════════ Fenêtre « Nommer les voix » : toutes les voix d'un coup ═════════ */
    function ouvrirVoix() {
      if (E !== 'apres' || !curId) return;
      const vs = speakers.filter((s) => !fixe(s));
      if (!vs.length) { toast('Aucune voix à nommer : seule ta voix a été captée.'); return; }
      fermerPops(false);
      const audio = !!(cur && cur.hasAudio);
      const invites = ((cur && cur.participants) || []).filter(Boolean);
      const sugg = [...new Set(invites.concat(vs.filter((s) => !estPersonne(s))))];
      R.dvSugg.innerHTML = sugg.map((n) => `<option value="${esc(n)}"></option>`).join('');
      R.dvSuggT.hidden = !invites.length; R.dvSuggT.textContent = invites.length ? 'Dans cette réunion' + NB + ': ' + invites.join(', ') + '.' : '';
      R.dvListe.innerHTML = vs.map((k, i) => {
        const ex = extraitsDe(k)[0], nb = segs.filter((s) => s.speaker === k).length;
        return `<li class="dv" data-v="${esc(k)}" style="--c:${colorOf(k)}">
<div class="dv-t"><span class="carre" aria-hidden="true"></span><b id="rDv${i}">${esc(k)}</b><span class="mono">${nb} passage${nb > 1 ? 's' : ''}</span></div>
${ex ? `<div class="dv-x">${audio ? `<button type="button" class="jouer" data-x="${ex.startMs}-${ex.endMs || ex.startMs + 8000}" aria-label="Écouter ${esc(k)} à ${fmt(ex.startMs / 1000)}">${ic('play')}</button>` : ''}<span class="mono" style="font:500 12px var(--mono)">${fmt(ex.startMs / 1000)}</span><q>${esc(fr(ex.text.length > 120 ? ex.text.slice(0, 118) + '…' : ex.text))}</q></div>` : ''}
<div class="dv-c"><label>Nom<input data-dvnom list="rDvSugg" autocomplete="off" placeholder="Saisis un nom" value="${estPersonne(k) ? '' : esc(k)}" aria-label="Nom de ${esc(k)}"></label>${vs.length > 1 ? `<label>Même personne que<select data-dvsame aria-label="${esc(k)} : même personne que"><option value="">Personne d’autre</option>${vs.filter((x) => x !== k).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>` : ''}</div>
</li>`;
      }).join('');
      ancre = document.activeElement;
      R.dlgVoix.showModal();
      const f = $('[data-dvnom]', R.dvListe); if (f) f.focus();
    }
    R.dvListe.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) basculerExtrait(b, R.dvListe); });
    R.dvListe.addEventListener('change', (e) => { const s = e.target.closest('[data-dvsame]'); if (!s) return; const inp = $('[data-dvnom]', s.closest('.dv')); inp.disabled = !!s.value; });
    R.dlgVoix.addEventListener('close', () => { if (popAudio) { popAudio.pause(); popAudio = null; } if (ancre && document.contains(ancre)) ancre.focus({ preventScroll: true }); });
    R.dlgVoix.addEventListener('click', (e) => { if (e.target.closest('[data-dv="annuler"]')) R.dlgVoix.close(); });
    R.dvForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rows = $$('.dv', R.dvListe);
      const nomDe = new Map(rows.map((r) => [r.dataset.v, ($('[data-dvnom]', r).value || '').trim() || r.dataset.v]));
      const plan = [];
      rows.forEach((r) => { const v = r.dataset.v, s = $('[data-dvsame]', r); const to = s && s.value ? nomDe.get(s.value) : nomDe.get(v); if (to && to !== v) plan.push([v, to]); });
      R.dlgVoix.close();
      if (!plan.length) return;
      try {
        for (const [a, b] of plan) await V.rename(curId, a, b);
        await charger(curId); entrerApres({ garderScroll: true, garderOnglet: true });
        toast(plan.length > 1 ? `${plan.length} voix renommées dans toute la note.` : `« ${plan[0][0]} » s’appelle maintenant ${plan[0][1]}, partout dans la note.`);
        say('Noms enregistrés.');
      } catch (err) { toast('Renommage impossible : ' + errMsg(err)); }
    });

    /* ═════════ Type de résumé (menu … de l'onglet Résumé) ═════════ */
    function ouvrirGab() {
      ancre = R.bRes;
      const pick = (cur && cur.templatePick) || 'auto';
      R.gabs.innerHTML = templates.map((g) => `<li><button type="button" role="radio" data-gab="${esc(g.id)}" aria-checked="${g.id === pick}" tabindex="${g.id === pick ? 0 : -1}"><b>${esc(g.label)}</b><span>${esc(fr(g.hint))}</span></button></li>`).join('');
      placer(R.popGab, R.bRes); const c = $('[aria-checked="true"]', R.gabs); if (c) c.focus();
    }
    R.gabs.addEventListener('click', (e) => { const b = e.target.closest('[data-gab]'); if (!b) return; $$('[role="radio"]', R.gabs).forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; }); });
    R.gabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
      const l = $$('[role="radio"]', R.gabs), i = l.indexOf(document.activeElement), n = l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]; n.click(); n.focus();
    });
    let pendingUndoPrev = false;
    async function refaire(tpl) {
      if (!curId) return;
      fermerPops(false);
      const id = curId;
      entrerArret({ refaire: true });
      try { await V.regenerate(id, { template: tpl }); }
      catch (e) { toast('Le résumé n’a pas pu être refait : ' + errMsg(e)); await charger(id); entrerApres(); }
    }
    function majGenre() {
      const k = cur && cur.kind, pick = cur && cur.templatePick;
      const g = k && GENRES[k] ? GENRES[k] : '';
      const t = pick && pick !== 'auto' ? ((templates.find((x) => x.id === pick) || {}).label || '') : '';
      R.genre.hidden = !(g || t);
      R.genre.textContent = t || g;
      R.genre.title = t ? 'Type de résumé choisi : ' + t : 'Genre reconnu par l’IA : ' + g + '. Change-le dans le menu … du résumé.';
    }

    /* ═════════ Menus, copier, Hub, actions ═════════ */
    const etapesOuvertes = () => $$('.u.todo', R.note).filter((r) => { const cb = $('.coche input', r); return cb && !cb.checked; });
    async function supprimer(id, sansConfirmer) {
      if (!id) return;
      const n = metaDe(id) || (cur && cur.meta.id === id ? cur.meta : null);
      const ok = sansConfirmer || (typeof opts.confirm === 'function' ? await opts.confirm({ title: 'Supprimer la note ?', body: `« ${(n && n.title) || 'Sans titre'} » : le résumé, la transcription et l’audio éventuel seront supprimés de ce Mac.`, ok: 'Supprimer' }) : confirm('Supprimer la note ?'));
      if (!ok) return;
      try {
        await V.del(id); fiches.delete(id);
        if (sel && sel.id === id) sel = null;
        if (id === curId) { repos(); allerListe(); }
        await refreshList(); toast(sansConfirmer ? 'Note jetée.' : 'Note supprimée.');
      } catch (err) { toast(errMsg(err)); }
    }
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.closest('.barre')) return;
      const a = b.dataset.act;
      if (a === 'copyActs') {
        fermerPops(false);
        const t = etapesOuvertes().map((r) => '- [ ] ' + lineToMd(lines[+r.dataset.i]).replace(PREFIX_RE, '').replace(TAG_RE, '')).join('\n');
        if (!t) { toast('Toutes les étapes sont cochées : rien à copier.'); return; }
        try { await (window.dictaApp && window.dictaApp.copyText ? window.dictaApp.copyText : (t) => navigator.clipboard.writeText(t))(t); toast('Prochaines étapes copiées en Markdown.'); } catch (err) { toast('Copie impossible.'); }
      } else if (a === 'hub') {
        fermerPops(false);
        const rows = etapesOuvertes(); if (!rows.length) { toast('Toutes les étapes sont cochées : rien à envoyer.'); return; }
        const tasks = rows.map((r) => {
          const p = plainOf(lines[+r.dataset.i]).replace(TAG_RE, ''), m = /^\s*\*\*([^*]{1,60})\*\*\s*:\s*(.*)$/.exec(p), w = m ? m[2] : sansMd(p), d = /\(([^()]{1,40})\)\s*\.?\s*$/.exec(w);
          return { titre: (d ? w.slice(0, d.index) : w).trim().slice(0, 200), pour: m && m[1] !== 'Moi' && !/attribuer/i.test(m[1]) ? m[1] : '', date: '', pourquoi: 'Note « ' + ((cur && cur.meta.title) || '') + ' »' + (d ? ', échéance dite : ' + d[1] : '') };
        });
        let annule = false;
        toast(`${tasks.length} étape${tasks.length > 1 ? 's partent' : ' part'} dans CBW Hub dans 10 s.`, () => { annule = true; say('Envoi annulé.'); });
        await sleep(10000); if (annule) return;
        try { const r = await V.hubSend(tasks); toast(`${r.sent} étape${r.sent > 1 ? 's envoyées' : ' envoyée'} dans CBW Hub${r.failed ? ', ' + r.failed + ' en échec' : ''}.`); } catch (err) { toast('Envoi impossible : ' + errMsg(err)); }
      } else if (a === 'ouvrirGab') { fermerPops(false); ouvrirGab(); }
      else if (a === 'gabGo') { const c = $('[aria-checked="true"]', R.gabs); pendingUndoPrev = true; refaire(c ? c.dataset.gab : 'auto'); }
      else if (a === 'regen') { pendingUndoPrev = true; refaire(cur && (cur.templatePick || 'auto')); }
      else if (a === 'precedent') { fermerPops(false); try { if (await V.restorePrevious(curId)) { await charger(curId); entrerApres({ garderOnglet: true }); toast('Version précédente rétablie.'); } } catch (err) { toast(errMsg(err)); } }
      else if (a === 'copieRes') { try { await (window.dictaApp && window.dictaApp.copyText ? window.dictaApp.copyText : (t) => navigator.clipboard.writeText(t))(linesToMd(lines).replace(TAG_RE, '')); toast('Résumé copié en Markdown.'); } catch (err) { toast('Copie impossible.'); } }
      else if (a === 'trCopie') { const t = trRows().map((s) => `[${fmt(s.startMs / 1000)}] ${s.speaker} : ${s.text}`).join('\n'); try { await (window.dictaApp && window.dictaApp.copyText ? window.dictaApp.copyText : (t) => navigator.clipboard.writeText(t))(t); toast('Transcription copiée.'); } catch (err) { toast('Copie impossible.'); } }
      else if (a === 'copieNote') { fermerPops(true); const id = cible || curId; if (!id) return; try { await V.copy(id); toast('Contenu de la note copié au format Markdown.'); } catch (err) { toast(errMsg(err)); } }
      else if (a === 'finder') { fermerPops(true); const id = cible || curId; if (id) V.reveal(id); }
      else if (a === 'suppr') { fermerPops(false); supprimer(cible || curId); }
      else if (a === 'jeter') supprimer(curId, true);
      else if (a === 'garder') { Promise.resolve(V.keep(curId)).then(refreshList).catch(() => {}); gardees.add(curId); try { localStorage.setItem('cbw.notes.gardees', JSON.stringify([...gardees].slice(-200))); } catch (err) { /* */ } entrerApres({ garderOnglet: true }); }
      else if (a === 'generer' || a === 'retry2') { pendingUndoPrev = false; refaire(cur && (cur.templatePick || cur.templateId)); }
      else if (a === 'renommer') R.popForm.requestSubmit();
      else if (a === 'phrase') { try { await (window.dictaApp && window.dictaApp.copyText ? window.dictaApp.copyText : (t) => navigator.clipboard.writeText(t))(PHRASE); toast('Phrase copiée. Colle-la dans le chat de la visio.'); } catch (err) { toast('Copie impossible.'); } }
      else if (a === 'nouvelle') demarrer({});
      else if (a === 'reglages' || a === 'panneReglages') navigate(a === 'reglages' ? '#reglages:settings-notes' : '#reglages');
      else if (a === 'retour') allerListe();
      else if (a === 'prev') voisin(-1);
      else if (a === 'next') voisin(1);
      else if (a === 'retourRes') retourResume();
      else if (a === 'avPlus') { voirPlus = !voirPlus; rendAvenir(); const p = $('[data-act="avPlus"]', R.avenir); if (p) p.focus(); }
      else if (a === 'avSync') majAgenda(true);
      else if (a === 'apPlus') { apTout = !apTout; rendApercu(); }
      else if (a === 'nommer') ouvrirVoix();
      else if (a === 'trCherche' || a === 'trChX') ouvrirCherche('tr', a === 'trCherche' ? null : false);
      else if (a === 'resCherche' || a === 'resChX') ouvrirCherche('res', a === 'resCherche' ? null : false);
      else if (a === 'tiroirX') { R.tiroir.hidden = true; const i = $('[data-ask]', R.barre); if (i) i.focus(); }
      else if (a === 'evSans' || a === 'evJoin') { fermerPops(false); const ev = evDe(evCible); if (!ev) return; if (a === 'evJoin') { try { await V.join(ev.url); } catch (err) { toast('Impossible d’ouvrir le lien.'); } } else demarrerEv(ev, false); }
    });
    R.bPlus.onclick = (e) => { e.stopPropagation(); cible = curId; ancre = R.bPlus; placer(R.popPlus, R.bPlus); $('button', R.popPlus).focus(); };
    R.bRes.onclick = (e) => {
      e.stopPropagation(); ancre = R.bRes;
      R.mPrev.hidden = !(cur && cur.previous); R.mHub.hidden = !hubOK; R.mRegen.hidden = false;
      placer(R.popRes, R.bRes); $('button', R.popRes).focus();
    };
    [R.popRes, R.popPlus, R.popEv].forEach((m) => m.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
      const l = $$('button', m).filter((x) => !x.hidden), i = l.indexOf(document.activeElement); l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus();
    }));

    /* ── clics globaux : voix, loupe, réécoute, fermeture des popovers ── */
    root.addEventListener('click', (e) => {
      const sp = e.target.closest('.spk'); if (sp) { e.preventDefault(); ouvrirNom(sp.dataset.spk, sp); return; }
      const tt = e.target.closest('[data-ecoute]'); if (tt && E !== 'pendant') { montrerSource([Number(tt.dataset.ecoute) / 1000], tt); return; }
      if (e.target.closest('[data-ferme]')) { fermerPops(true); return; }
      if (!e.target.closest('.pop') && !e.target.closest('[data-r="bRes"],[data-r="bPlus"],[data-menu],[data-evmenu]')) fermerPops(false);
    });
    const onKey = (e) => {
      if (!visible() || R.dlgVoix.open) return;
      const ed = editable(e.target), mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        if ($$('.pop', root).some((p) => !p.hidden)) { fermerPops(true); return; }
        if (niveau === 'note' && tab === 'tr' && depuisResume && E === 'apres') { retourResume(); return; }
        if (niveau === 'note' && !ed && !e.defaultPrevented && !document.querySelector('.cbwc:focus-within')) { e.preventDefault(); allerListe(); return; }
      }
      if (mod && e.key.toLowerCase() === 'j') { const a = $('[data-ask]', R.barre); if (a && niveau === 'note') { e.preventDefault(); a.focus(); } }
      if (e.metaKey && e.key === '.' && E === 'pendant') { e.preventDefault(); terminer(); }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); demarrer({}); return; }
      if ((mod && e.key.toLowerCase() === 'f') || (e.key === '/' && !ed && !mod)) {
        if (niveau === 'liste') { e.preventDefault(); R.lCherche.focus(); R.lCherche.select(); return; }
        if (tab === 'res' && !R.oRes.hidden) { e.preventDefault(); ouvrirCherche('res', true); return; }
        if (tab === 'tr' && !R.bTrCherche.hidden) { e.preventDefault(); ouvrirCherche('tr', true); return; }
      }
      if (niveau === 'note' && !ed && !mod && !e.altKey && (e.key === 'j' || e.key === 'k')) { e.preventDefault(); voisin(e.key === 'j' ? -1 : 1); return; }
      if (e.metaKey && e.key.toLowerCase() === 'z' && toastUndo && !R.toast.hidden && !ed) { e.preventDefault(); const f = toastUndo; hideToast(); f(); }
    };
    document.addEventListener('keydown', onKey);

    /* ═════════ États de la note (L2) ═════════ */
    function commun(e) {
      E = e; root.dataset.etape = e; fermerPops(false);
      [R.prive, R.bPlus, R.oRes, R.etapes, R.att, R.legende, R.note, R.pied, R.ecoute, R.resChBox, R.trChBox].forEach((x) => { x.hidden = true; });
      R.bResCherche.setAttribute('aria-pressed', 'false'); R.bTrCherche.setAttribute('aria-pressed', 'false'); R.resCherche.value = ''; R.trCherche.value = '';
      R.cas.innerHTML = ''; R.regle.style.setProperty('--p', 0); depuisResume = false;
    }
    /* repos : aucune note ouverte, rien n'est enregistré (L2 = « Nouvelle note » avant Démarrer) */
    function repos(o) {
      o = o || {};
      commun('avant');
      cur = null; curId = null; legacy = false; segs = []; speakers = []; lines = []; live = []; runId = null; sujet = { title: o.title, participants: o.participants || [], eventId: o.eventId };
      root.dataset.etat = 'repos'; root.dataset.muet = '';
      R.titre.textContent = o.title || 'Nouvelle note';
      R.att.hidden = false; R.att.innerHTML = '<b>Pas encore de résumé</b>Le résumé apparaît à la fin de la réunion.';
      majSousLigne(); choisirOnglet('tr'); rendBarre(); majVoisins();
    }
    async function majPrive() {
      try { privacy = await V.privacy(); } catch (e) { privacy = null; }
      R.prive.textContent = !privacy ? 'L’audio reste sur ce Mac.' : privacy.local ? 'Tout reste sur ce Mac.' : privacy.label ? `L’audio reste sur ce Mac. Le texte part chez ${privacy.label} pour le résumé.` : 'L’audio reste sur ce Mac. Aucun moteur d’IA prêt : tu auras la transcription.';
    }
    async function demarrer(o) {
      o = o || {};
      if (enSession()) { montrerNote(); navigate('#notes:' + (E === 'arret' && runId ? runId : 'direct')); if (E === 'pendant') toast('Une note est déjà en cours.'); return; }
      const reprise = o.continueId && cur && cur.meta ? Math.floor((cur.meta.durationMs || 0) / 1000) : 0;
      repos(o);
      sec = reprise; paused = false; entrerPendant(); montrerNote(); navigate('#notes:direct');
      try { await V.start(o.continueId ? { continueId: o.continueId } : { title: o.title || undefined, participants: o.participants || [], eventId: o.eventId }); }
      catch (e) { toast('Impossible de démarrer : ' + errMsg(e)); repos(); allerListe(); }
    }
    function entrerPendant() {
      if (E === 'pendant') return;
      commun('pendant');
      root.dataset.etat = paused ? 'pause' : 'enregistre';
      R.prive.hidden = false; majPrive();
      live = []; sawSystem = false; segs = []; speakers = [];
      R.att.hidden = false; R.att.innerHTML = '<b>Pas encore de résumé</b>Le résumé apparaît à la fin de la réunion. Rien à faire d’ici là${NB}: une notification te prévient quand il est prêt.'.replace('${NB}', NB);
      deviceMsg = null; choisirOnglet('tr'); majSousLigne(); rendBarre(); rendListe(); rendAvenir(); rendApercu(); demarrerChrono(); majVoisins();
      if (!sujet.title) Promise.resolve(V.current()).then((c) => { const m = c && c.meeting; if (m && E === 'pendant') { if (m.title && R.titre.textContent === 'Nouvelle note') { R.titre.textContent = m.title; sujet.title = m.title; } if (m.participants && m.participants.length) sujet.participants = m.participants; if (m.eventId) sujet.eventId = m.eventId; majSousLigne(); rendListe(); } }).catch(() => {});
      if (attendDirect && Date.now() - attendDirect < 8000) { attendDirect = 0; montrerNote(); }
      say('Prise de notes démarrée. Rien à faire : le résumé arrive à la fin.');
    }
    function demarrerChrono() {
      clearInterval(chronoT);
      chronoT = setInterval(() => { if (E !== 'pendant') { clearInterval(chronoT); return; } if (!paused) sec += 1; $$('[data-chrono]', root).forEach((c) => { c.textContent = fmt(sec); }); }, 1000);
    }
    async function terminer() {
      if (E !== 'pendant') return;
      const titre = R.titre.textContent.trim();
      entrerArret({});
      try { await V.stop({ title: titre && titre !== 'Nouvelle note' ? titre : undefined, participants: sujet.participants || [] }); }
      catch (e) { toast('Arrêt : ' + errMsg(e)); }
    }
    function entrerArret(o) {
      o = o || {};
      if (E === 'arret') return;
      const garder = o.refaire && cur;
      commun('arret');
      clearInterval(chronoT);
      root.dataset.etat = 'ecrit'; stageNow = o.refaire ? 'summary' : ''; partie = null; arretT0 = Date.now();
      clearInterval(arretTic); arretTic = setInterval(() => { if (E !== 'arret') { clearInterval(arretTic); return; } const s = $('[data-sts]', R.barre); if (s) s.textContent = Math.round((Date.now() - arretT0) / 1000) + NB + 's'; }, 500);
      if (!garder) { cur = null; curId = null; legacy = false; segs = []; speakers = []; } else { cur.panne = false; runId = curId; }
      R.etapes.hidden = false; rendEtapes();
      R.note.hidden = false; R.note.contentEditable = 'false'; R.note.setAttribute('aria-busy', 'true'); lines = []; paint([], false);
      choisirOnglet('res');
      rendBarre(); majSousLigne(); rendListe(); rendAvenir(); rendApercu(); majVoisins();
      say(o.refaire ? 'CBW AI refait le résumé.' : 'Étape 1 sur 3 : sauvegarde de l’audio.');
      R.defile.scrollTop = 0;
    }
    async function charger(id) {
      const n = await V.get(id);
      cur = n; curId = id; legacy = !n.annotated && n.meta.provider !== 'passthrough' && n.meta.provider !== 'pending' && !!n.markdown;
      cur.panne = (n.meta.provider === 'passthrough' || n.meta.provider === 'pending') && !n.annotated;
      cur.kind = n.kind || n.meta.kind || null;
      segs = (n.segments || []).map((s) => ({ startMs: s.startMs, endMs: s.endMs, speaker: s.speaker || 'Moi', text: s.text }));
      if (!segs.length && n.transcript) segs = String(n.transcript).split('\n').map((l) => { const m = /^\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*([^:]{1,60}?)\s*:\s*(.*)$/.exec(l); return m ? { startMs: clock(m[1]) * 1000, endMs: 0, speaker: m[2], text: m[3] } : null; }).filter(Boolean);
      mode = n.mode || (segs.some((s) => s.speaker === 'Moi') ? 'two-track' : 'mix');
      majSpeakers();
      lines = parseAnnotated(n.annotated || (legacy ? n.markdown : '') || '');
      fiches.set(id, ficheDe(n));
      return n;
    }
    function entrerApres(o) {
      o = o || {};
      const ongletAvant = tab;
      commun('apres');
      root.dataset.etat = 'repos'; clearInterval(arretTic); runId = null;
      const m = cur.meta;
      R.titre.textContent = m.title || 'Sans titre';
      majSousLigne();
      R.bPlus.hidden = false; majGenre();
      R.note.setAttribute('aria-busy', 'false');
      const vide = quasiVide(m) && !gardees.has(curId);
      if (vide) {
        R.cas.innerHTML = `<div class="cas" role="alert"><p><b>Démarré par erreur${NB}?</b> Presque rien n’a été capté (${esc(durLab(m.durationMs))}).</p><div class="act"><button type="button" class="btn2" data-act="garder">Garder</button><button type="button" class="btn3" data-act="jeter">Jeter</button></div></div>`;
        lines = []; paint([], false); R.note.hidden = true;
      } else if (cur.panne) {
        R.cas.innerHTML = `<div class="cas panne" role="alert"><p><span class="err">Le résumé n’a pas pu être préparé.</span> Aucun moteur d’IA n’a répondu (clé absente, plus de crédit ou pas de réseau). La transcription complète est enregistrée${NB}: rien n’est perdu.</p><div class="act"><button type="button" class="btn2" data-act="retry2">Réessayer</button><button type="button" class="btn3" data-act="panneReglages">Ouvrir Réglages</button></div></div>`;
        lines = []; paint([], false); R.note.hidden = true;
      } else {
        R.oRes.hidden = false; R.lecture.textContent = lecture();
        R.legende.hidden = false; R.note.hidden = false; R.pied.hidden = false;
        paint(buildRows(lines, true), false);
        R.note.contentEditable = 'true'; // ancienne note (sans fichier UI) : modifiable et « Régénérer » possible, comme les autres
        if (!lines.some((l) => l.kind === 'text')) paint([{ k: 'msg', html: '<p class="att" contenteditable="false">Résumé vide : rien d’exploitable n’a été entendu.</p>' }], false);
      }
      if (o.nouvelle) { R.qListe.innerHTML = ''; R.tiroir.hidden = true; }
      const t = o.onglet || (o.garderOnglet ? ongletAvant : 'res');
      choisirOnglet(vide || cur.panne ? (o.onglet || 'res') : t === 'tr' ? 'tr' : 'res');
      if (tab !== 'tr') majOutilsTr();
      rendBarre(); rendListe(); rendApercu(); majVoisins();
      if (!o.garderScroll) R.defile.scrollTop = 0;
    }
    async function ouvrirNote(id, o) {
      o = o || {};
      try {
        if (id !== curId) { R.qListe.innerHTML = ''; R.tiroir.hidden = true; demandeHist = []; }
        await charger(id); entrerApres(o);
        sel = { k: 'note', id };
        const deja = niveau === 'note'; montrerNote(); navigate('#notes:' + id);
        if (deja) { R.titre.style.animation = 'none'; void R.titre.offsetWidth; R.titre.style.animation = ''; }
        if (deja && o.focus && !o.focus.disabled) o.focus.focus({ preventScroll: true });
        else if (deja) R.bRetour.focus({ preventScroll: true });
      } catch (e) { toast('Note introuvable.'); repos(); allerListe(); }
    }

    /* ═════════ Événements du main ═════════ */
    V.onProgress((p) => {
      if (!p || !root.isConnected) return;
      if (p.state === 'recording' || p.state === 'paused') {
        const avant = paused; paused = p.state === 'paused';
        if (E !== 'pendant') { if (E === 'apres' || E === 'arret') { cur = null; curId = null; } if (E !== 'avant') sujet = {}; sec = Math.floor((p.elapsedMs || 0) / 1000); entrerPendant(); }
        if (Math.abs(p.elapsedMs / 1000 - sec) > 1.5) sec = Math.floor(p.elapsedMs / 1000);
        root.dataset.etat = paused ? 'pause' : 'enregistre';
        if (avant !== paused) { rendBarre(); majOutilsTr(); if (niveau === 'liste') rendListe(); say(paused ? 'Enregistrement en pause.' : 'Enregistrement repris.'); }
      } else if (p.state === 'transcribing' || p.state === 'organizing') {
        if (E === 'pendant' || E === 'avant' || E === 'apres') entrerArret({});
        if (p.noteId) runId = p.noteId;
        if (p.total > 1) { partie = { step: p.step, total: p.total }; R.regle.style.setProperty('--p', (p.step || 0) / p.total); majStage(); }
        if (p.stage && p.stage !== stageNow && stageNow !== 'retry') { stageNow = p.stage; majStage(); }
      } else if (p.state === 'done') {
        const id = p.noteId || runId;
        if (E === 'arret' && id) fin(id, p.message);
        refreshList();
      } else if (p.state === 'error') {
        if (enSession()) {
          const m = String(p.message || '');
          const etaitNote = niveau === 'note';
          repos(); if (etaitNote) allerListe(); else rendListe();
          toast(/rien entendu/i.test(m) ? 'Aucune parole captée. Vérifie le micro dans Réglages.' : /annul/i.test(m) ? 'Prise de notes annulée.' : m || 'La prise de notes s’est arrêtée.');
        }
      }
    });
    async function fin(id, warn) {
      const refait = pendingUndoPrev; pendingUndoPrev = false;
      try { await charger(id); } catch (e) { toast('Note introuvable.'); return; }
      R.regle.style.setProperty('--p', 1);
      if (cur.panne) { entrerApres({ nouvelle: true }); if (warn && !quasiVide(cur.meta)) toast(warn); return; }
      root.dataset.etat = 'pret';
      R.barre.innerHTML = '<span class="st-ok" role="status">Tes notes sont prêtes</span>';
      R.chargeTab.hidden = true;
      say('Résumé prêt : ' + (cur.meta.title || ''));
      await sleep(rm() ? 300 : 1200);
      if (E !== 'arret') return;
      entrerApres({ onglet: 'res', nouvelle: true });
      if (niveau === 'note') navigate('#notes:' + id);
      if (refait && cur.previous) toast('Résumé refait.', async () => { try { await V.restorePrevious(id); await charger(id); entrerApres({ garderScroll: true, garderOnglet: true }); } catch (e) { toast(errMsg(e)); } }, 'Revenir à la version précédente');
    }
    V.onStage((s) => {
      if (!s || !root.isConnected) return;
      if (s.noteId) runId = s.noteId;
      if (E !== 'arret') return;
      if (stageNow !== 'retry') stageNow = s.stage; majStage();
      if (s.stage === 'transcript' && s.noteId) {
        V.get(s.noteId).then((n) => { if (E !== 'arret') return; const deuxPistes = (n.segments || []).some((x) => x.source === 'system'); segs = (n.segments || []).map((x) => ({ startMs: x.startMs, endMs: x.endMs, speaker: x.speaker || (x.source === 'system' ? 'Les autres' : deuxPistes ? 'Moi' : 'Micro'), text: x.text })); majSpeakers(); if (tab === 'tr') rendTR(); say('Étape 2 sur 3 : transcription prête, séparation des voix.'); }).catch(() => {});
      }
      if (s.stage === 'summary') say('Étape 3 sur 3 : rédaction du résumé.');
    });
    V.onVoices((v) => {
      if (!v || E !== 'arret') return;
      segs = (v.segments || []).map((x) => ({ startMs: x.startMs, endMs: x.endMs, speaker: x.speaker || 'Moi', text: x.text })); mode = v.mode || mode;
      majSpeakers(); if (tab === 'tr') rendTR();
    });
    let deltaRaf = 0, deltaTxt = '';
    V.onDelta((d) => {
      if (!d || E !== 'arret') return;
      if (!d.annotated) { stageNow = 'retry'; majStage(); return; }
      if (stageNow === 'retry' || stageNow !== 'summary') { stageNow = 'summary'; majStage(); }
      deltaTxt = d.annotated;
      if (deltaRaf) return;
      deltaRaf = requestAnimationFrame(() => {
        deltaRaf = 0; lines = parseAnnotated(deltaTxt);
        const rows = buildRows(lines, false);
        rows.push({ k: 'cur', html: '<span class="curseur" aria-hidden="true" contenteditable="false"></span>' });
        paint(rows, !rm());
        if (!partie) R.regle.style.setProperty('--p', Math.min(0.92, deltaTxt.length / (deltaTxt.length + 1500)));
      });
    });
    V.onLive((x) => {
      if (!x || E !== 'pendant') return;
      if (x.source === 'system') sawSystem = true;
      live.push(x); if (live.length > 600) live.shift();
      if (tab === 'tr' && niveau === 'note') rendTR();
    });
    V.onDevice((d) => {
      if (!d || E !== 'pendant') return;
      const M = { lost: ['Micro débranché. On continue avec le micro du Mac.', true], fallback: ['Micro débranché. On continue avec le micro du Mac.', true], muted: ['Micro coupé dans macOS. Rien n’est capté.', true], recovered: ['Micro revenu.', false] };
      const m = M[d.state]; if (!m) return;
      deviceMsg = { t: m[0], err: m[1] }; root.dataset.muet = d.state === 'muted' ? '1' : '';
      rendInfo(); say(m[0]);
      if (d.state === 'recovered') setTimeout(() => { if (deviceMsg && deviceMsg.t === m[0]) { deviceMsg = null; rendInfo(); } }, 4000);
    });
    V.onStatus((s) => {
      if (!s || s.mode !== 'note' || E !== 'pendant' || rm() || paused || !visible()) return;
      const lv = Math.max(0, Math.min(1, Number(s.level) || 0));
      $$('.ondes', root).forEach((g) => $$('i', g).forEach((i, k) => { const env = [.55, .8, 1, .8, .55][k] || .7; i.style.transform = 'scaleY(' + Math.max(.15, Math.min(1, Math.pow(lv, .6) * env + (Math.random() - .5) * .2)).toFixed(2) + ')'; }));
    });
    V.onMeetingSoon((ev) => {
      majAgenda();
      if (!ev || enSession()) return;
      Cartes.bientot(ev, () => demarrerEv(ev, false));
    });

    /* ═════════ Démarrage ═════════ */
    let agendaT = null;
    async function init(noteId) {
      repos(); allerListe({ silencieux: true });
      try { templates = (await V.templates()) || []; } catch (e) { templates = []; }
      try { hubOK = !!(await V.hubAvailable()); } catch (e) { hubOK = false; }
      if (V.demo && V._seed) V._seed();
      await Promise.all([refreshList(), majAgenda()]);
      agendaT = setInterval(() => { if (visible() && niveau === 'liste') majAgenda(); }, 60e3);
      let c = null; try { c = await V.current(); } catch (e) { c = null; }
      if (c && c.active) {
        paused = c.state === 'paused'; sec = Math.floor((c.elapsedMs || 0) / 1000);
        const m = c.meeting || {}; repos({ title: m.title, participants: m.participants, eventId: m.eventId });
        entrerPendant(); if (noteId) montrerNote(); else rendListe(); return;
      }
      if (c && c.busy) { entrerArret({}); if (noteId) montrerNote(); return; }
      const q = V.demo ? new URLSearchParams(location.search).get('notes') : null;
      if (q === 'pendant' || q === 'pendant-liste') { await demarrer({ title: 'Point équipe du jeudi', participants: ['Léa Fontaine', 'Marc Diallo', 'Inès Garnier'] }); if (q === 'pendant-liste') { await sleep(3200); allerListe(); } return; }
      if (q === 'detection' || q === 'detection-menu') { V._emit('call', { app: 'Zoom', seconds: 10 }); if (q === 'detection-menu') Cartes.ouvrirMenu(); return; }
      if (q === 'autostop') { await demarrer({}); await sleep(3200); V._emit('auto', { phase: 'warn', seconds: 15 }); return; }
      if (q === 'arret' || q === 'progression') { if (q === 'progression') V._hold(true); await demarrer({}); await sleep(300); terminer(); return; }
      if (q === 'court' || q === 'vide') { await ouvrirNote('demo-' + q); return; }
      if (q === 'transcription') { await ouvrirNote('demo-now', { onglet: 'tr' }); return; }
      if (q === 'voix') { await ouvrirNote('demo-now', { onglet: 'tr' }); ouvrirVoix(); return; }
      if (q === 'renommer') { await ouvrirNote('demo-now', { onglet: 'tr' }); const b = $('.s-voix .spk[data-spk="Personne 3"]'); if (b) ouvrirNom('Personne 3', b); return; }
      if (q === 'apres') { await ouvrirNote('demo-now'); return; }
      if (noteId && noteId !== 'direct') { await ouvrirNote(noteId); return; }
    }
    const ready = init(opts.noteId && opts.noteId !== 'start' ? opts.noteId : null).catch((e) => console.error('CBWNotes', e));

    mounted = {
      open(sub) { ready.then(() => this._open(sub)); },
      _open(sub) {
        if (!sub) { if (niveau !== 'liste') allerListe({ silencieux: true }); return; }
        if (sub === 'start') return;
        if (sub === 'direct') { if (enSession()) montrerNote(); else { attendDirect = Date.now(); if (niveau !== 'liste') allerListe({ silencieux: true }); } return; }
        if (enSession()) { montrerNote(); return; }
        if (sub === curId && E === 'apres') { montrerNote(); return; }
        ouvrirNote(sub);
      },
      start() { return ready.then(() => demarrer({})); },
      unmount() { document.removeEventListener('keydown', onKey); document.removeEventListener('selectionchange', onSel); clearInterval(chronoT); clearInterval(arretTic); clearInterval(agendaT); container.innerHTML = ''; mounted = null; },
    };
    return mounted;
  }

  window.CBWNotes = { mount, parseAnnotated };
})();

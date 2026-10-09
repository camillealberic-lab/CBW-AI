/* CBW AI — écran « Prise de notes », variante C : « recording-first ».
   L'écran est construit autour de l'acte de prendre une note :
   - en haut, une grande zone « Enregistrer » (gros bouton point orange + raccourci) qui, pendant la
     session, s'ouvre en douceur en bande live : minuteur, forme d'onde des dernières secondes (niveau micro),
     mots, repères horodatés, Pause / Terminer ;
   - en dessous, une grille de cartes (2 à 4 colonnes) : titre, date, durée, premières lignes de « En bref » ;
   - clic sur une carte → la note s'ouvre en feuille de lecture centrée (Échap / × pour fermer).
   Vanilla JS, sans dépendance, compatible CSP (aucun handler inline, aucun eval).
   Contrat : docs/APP_API.md › Mode « Prise de notes ».
   Usage : window.CBWNotes.mount(container, { api, navigate, noteId }) → { open(id), list(), unmount() }
   Tout texte venant de l'utilisateur / du LLM passe par esc() avant d'entrer dans innerHTML. */
(function () {
  'use strict';

  /* ---------- styles (injectés une seule fois, scopés sous .cbnc) ---------- */
  var CSS = `
.cbnc{--c-ink:var(--encre,var(--inverse-fond,#1C1C1E));--c-ink-t:var(--inverse-texte,#fff);--c-f3:var(--fond-3,#ECECE8);
--c-ease:var(--ease,cubic-bezier(.2,.7,.2,1));--c-out:var(--ease-sortie,cubic-bezier(.16,1,.3,1));--c-r:2px;
--c-or:var(--orange,#FF5A1F);--c-bl:var(--bleu,#2B3BFF);--c-or-bg:color-mix(in srgb,var(--c-or) 8%,var(--fond,#fff));
--c-or-bg2:color-mix(in srgb,var(--c-or) 15%,var(--fond,#fff));--c-bl-bg:color-mix(in srgb,var(--c-bl) 6%,var(--fond,#fff));
font-family:var(--police,"Archivo",system-ui,sans-serif);color:var(--texte,#111);background:var(--fond,#fff);font-size:15px;line-height:1.55;min-height:100%;-webkit-font-smoothing:antialiased}
.cbnc *,.cbnc *::before,.cbnc *::after{box-sizing:border-box}
.cbnc .lbl{font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#4A4A4A);line-height:1}
.cbnc .pst{display:inline-block;width:10px;height:10px;margin-right:8px;background:currentColor;vertical-align:-1px}
.cbnc kbd{font-family:var(--mono,monospace);font-size:11px;border:1px solid var(--fil-fort,#C4C4BF);padding:1px 6px;color:var(--texte,#111);background:var(--surface,#fff)}
.cbnc :focus-visible{outline:3px solid var(--focus,#2B3BFF);outline-offset:2px}
.cbnc svg{display:block;flex:none}
.cbnc .btn{appearance:none;font:inherit;font-weight:800;font-size:14px;border:0;border-radius:var(--c-r);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;text-decoration:none;transition:background var(--d-rapide,.15s),color var(--d-rapide,.15s),transform .12s,box-shadow var(--d-rapide,.15s)}
.cbnc .btn:disabled{cursor:not-allowed;opacity:.45}
.cbnc .btn:not(:disabled):active{transform:scale(.98)}
.cbnc .b1{background:var(--c-ink);color:var(--c-ink-t);min-height:44px;padding:0 20px}
.cbnc .b1:not(:disabled):hover{background:color-mix(in srgb,var(--c-ink) 86%,var(--fond,#fff))}
.cbnc .b1 .ar{display:inline-block;transition:transform .2s var(--c-ease)}
.cbnc .b1:not(:disabled):hover .ar{transform:translateX(4px)}
.cbnc .b2{background:var(--surface,#fff);color:var(--texte,#111);min-height:36px;padding:0 13px;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1px var(--fil-fort,#C4C4BF)}
.cbnc .b2:not(:disabled):hover{background:var(--fond-2,#F4F4F2);box-shadow:inset 0 0 0 1px var(--texte,#111)}
.cbnc .b2.lg{min-height:44px;padding:0 18px;font-size:14px}
.cbnc .b3{background:none;color:var(--texte-sec,#4A4A4A);min-height:36px;padding:0 6px;font-weight:700;font-size:13px;position:relative}
.cbnc .b3::after{content:"";position:absolute;left:6px;right:6px;bottom:8px;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s var(--c-ease)}
.cbnc .b3:not(:disabled):hover{color:var(--texte,#111)}
.cbnc .b3:not(:disabled):hover::after{transform:scaleX(1)}
.cbnc .b3.danger:not(:disabled):hover{color:var(--erreur,#B3261E)}
.cbnc .bi{background:none;color:var(--texte-sec,#4A4A4A);width:36px;height:36px;padding:0}
.cbnc .bi:not(:disabled):hover{background:var(--fond-2,#F4F4F2);color:var(--texte,#111)}
.cbnc .bdanger{background:var(--erreur,#B3261E);color:#fff}
.cbnc .bdanger:not(:disabled):hover{background:color-mix(in srgb,var(--erreur,#B3261E) 85%,#000)}
.cbnc .in{animation:cbncIn .42s var(--c-out) both}
@keyframes cbncIn{from{opacity:0;transform:translateY(8px)}}
.cbnc .shim{background:linear-gradient(90deg,var(--texte,#111) 0 40%,var(--texte-sec,#888) 50%,var(--texte,#111) 60% 100%) 0/300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cbncSh 1.6s linear infinite}
@keyframes cbncSh{from{background-position:100% 0}to{background-position:0 0}}
@keyframes cbncBlink{50%{opacity:.15}}

/* page */
.cbnc-page{max-width:1440px;margin:0 auto;padding:clamp(20px,2.6vw,40px) clamp(20px,3vw,48px) 72px}
.cbnc-hd{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.cbnc-hd h1{margin:0;font-size:clamp(26px,2.4vw,34px);font-weight:900;font-stretch:85%;line-height:1;letter-spacing:-.03em;flex:1}
.cbnc-srch{position:relative;display:flex;align-items:center}
.cbnc-srch svg{position:absolute;left:10px;color:var(--texte-3,#6E6E6A);pointer-events:none}
.cbnc-srch input{width:clamp(180px,18vw,260px);height:36px;border:1px solid var(--fil-fort,#C4C4BF);border-radius:var(--c-r);background:var(--surface,#fff);color:var(--texte,#111);font:inherit;font-size:14px;padding:0 30px 0 34px;transition:border-color .15s}
.cbnc-srch input::placeholder{color:var(--texte-3,#6E6E6A)}
.cbnc-srch input:focus{outline:3px solid var(--focus,#2B3BFF);outline-offset:1px;border-color:var(--texte,#111)}
.cbnc-srch kbd{position:absolute;right:8px;pointer-events:none}
.cbnc-srch input:focus+kbd,.cbnc-srch input:not(:placeholder-shown)+kbd{display:none}

/* hero (record zone) */
.cbnc-hero{position:relative;overflow:hidden;background:var(--c-or-bg);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c-or) 30%,transparent);transition:background .32s var(--c-ease),box-shadow .32s var(--c-ease)}
.cbnc-hero.morph{transition:height .42s var(--c-out),background .32s var(--c-ease),box-shadow .32s var(--c-ease)}
.cbnc-idle{display:flex;align-items:center;gap:clamp(20px,3vw,40px);padding:clamp(22px,2.6vw,36px) clamp(22px,3vw,40px)}
.cbnc-rec{appearance:none;border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer;display:flex;align-items:center;gap:clamp(18px,2.4vw,32px);text-align:left;flex:1;min-width:0}
.cbnc-rec .ring{position:relative;width:clamp(76px,7vw,104px);height:clamp(76px,7vw,104px);border-radius:50%;background:var(--surface,#fff);box-shadow:inset 0 0 0 2px var(--c-or);display:grid;place-items:center;flex:none;transition:transform .32s var(--c-out),box-shadow .2s}
.cbnc-rec .ring::before{content:"";position:absolute;inset:-10px;border-radius:50%;border:1px solid color-mix(in srgb,var(--c-or) 45%,transparent);opacity:0;transform:scale(.9);transition:opacity .32s,transform .42s var(--c-out)}
.cbnc-rec .dot{width:34%;height:34%;border-radius:50%;background:var(--c-or);transition:transform .32s var(--c-out)}
.cbnc-rec:not(:disabled):hover .ring{transform:scale(1.04)}
.cbnc-rec:not(:disabled):hover .ring::before{opacity:1;transform:scale(1)}
.cbnc-rec:not(:disabled):hover .dot{transform:scale(1.18)}
.cbnc-rec:not(:disabled):active .ring{transform:scale(.97)}
.cbnc-rec:disabled{cursor:not-allowed;opacity:.5}
.cbnc-rec .tx{min-width:0}
.cbnc-rec .tx b{display:block;font-size:clamp(30px,3.4vw,48px);font-weight:900;font-stretch:80%;line-height:.95;letter-spacing:-.035em}
.cbnc-rec .tx span{display:block;margin-top:10px;font-size:14px;color:var(--texte-sec,#4A4A4A);max-width:52ch}
.cbnc-keys{display:grid;gap:8px;justify-items:end;font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A);white-space:nowrap}
.cbnc-keys div{display:flex;align-items:center;gap:8px}
.cbnc-keys .x{font-weight:700;color:var(--texte,#111)}
@media (max-width:820px){.cbnc-keys{display:none}}
.cbnc-off{padding:22px 28px;font-size:14px}

/* live strip */
.cbnc-hero.live{background:var(--surface,#fff);box-shadow:inset 0 0 0 2px var(--c-or)}
.cbnc-hero.live.paused{box-shadow:inset 0 0 0 2px var(--fil-fort,#C4C4BF)}
.cbnc-live{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"tm wave acts" "fields fields fields";align-items:center;gap:20px clamp(20px,2.6vw,40px);padding:24px clamp(22px,2.6vw,36px) 22px}
.cbnc-live .tmw{grid-area:tm}
.cbnc-live .st{color:var(--c-or);font-weight:700}
.cbnc-live .st .pst{border-radius:50%;animation:cbncBlink 1.2s steps(1) infinite}
.paused .cbnc-live .st{color:var(--texte-sec,#4A4A4A)}
.paused .cbnc-live .st .pst{animation:none;border-radius:0}
.cbnc-timer{font-size:clamp(60px,6.4vw,104px);font-weight:900;font-stretch:70%;line-height:.8;letter-spacing:-.05em;font-variant-numeric:tabular-nums;white-space:nowrap;margin-top:14px}
.cbnc-timer .c{display:inline-block;width:.12em;height:.5em;margin:0 .06em;vertical-align:.06em;background:linear-gradient(var(--c-or) 0 0) top/100% .12em no-repeat,linear-gradient(var(--c-or) 0 0) bottom/100% .12em no-repeat}
.paused .cbnc-timer{color:var(--texte-sec,#4A4A4A)}
.paused .cbnc-timer .c{background-image:linear-gradient(currentColor 0 0),linear-gradient(currentColor 0 0)}
.cbnc-stat{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#4A4A4A);margin-top:12px;font-variant-numeric:tabular-nums}
.cbnc-stat b{color:var(--texte,#111);font-weight:700}
.cbnc-wave{grid-area:wave;position:relative;height:112px;min-width:0;border-left:1px solid var(--fil,#ddd);border-right:1px solid var(--fil,#ddd)}
.cbnc-wave canvas{position:absolute;inset:0;width:100%;height:100%}
.cbnc-wave .ax{position:absolute;left:10px;right:10px;bottom:-20px;display:flex;justify-content:space-between;font-family:var(--mono,monospace);font-size:10px;color:var(--texte-3,#6E6E6A)}
.cbnc-live .acts{grid-area:acts;display:flex;flex-direction:column;gap:8px;min-width:168px}
.cbnc-live .acts .b3{align-self:center}
.cbnc-fields{grid-area:fields;display:grid;grid-template-columns:minmax(180px,.8fr) minmax(0,2fr);gap:12px;padding-top:18px;margin-top:6px;border-top:1px solid var(--fil,#ddd)}
.cbnc-fld{display:flex;align-items:center;gap:10px;min-width:0;height:40px;border:1px solid var(--fil-fort,#C4C4BF);background:var(--fond,#fff);padding:0 0 0 12px}
.cbnc-fld:focus-within{border-color:var(--texte,#111);outline:3px solid var(--focus,#2B3BFF);outline-offset:1px}
.cbnc-fld .lbl{font-size:11px;white-space:nowrap}
.cbnc-fld input{flex:1;min-width:0;height:100%;border:0;background:none;color:var(--texte,#111);font:inherit;font-size:14px;outline:0}
.cbnc-fld input::placeholder{color:var(--texte-3,#6E6E6A)}
.cbnc-fld kbd{margin-right:8px}
.cbnc-marks{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px 14px;list-style:none;margin:0;padding:0;font-size:13px}
.cbnc-marks:empty{display:none}
.cbnc-marks li{display:flex;align-items:baseline;gap:8px;animation:cbncIn .3s var(--c-out) both}
.cbnc-marks time{font-family:var(--mono,monospace);font-size:11px;font-weight:700;color:var(--c-or)}
.cbnc-live .hint{grid-column:1/-1;font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A)}
@media (max-width:1100px){.cbnc-live{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"tm acts" "wave wave" "fields fields"}.cbnc-live .acts{flex-direction:row;justify-self:end;align-self:end;min-width:0}.cbnc-wave{height:84px;margin-bottom:16px}}
@media (max-width:720px){.cbnc-fields{grid-template-columns:1fr}}

/* processing strip */
.cbnc-hero.proc{background:var(--c-bl-bg);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c-bl) 40%,transparent)}
.cbnc-pro{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:16px 40px;padding:26px clamp(22px,2.6vw,36px) 24px}
.cbnc-pro .st{color:var(--c-bl)}
.cbnc-pro h2{margin:14px 0 0;font-size:clamp(34px,3.6vw,52px);font-weight:900;font-stretch:80%;letter-spacing:-.035em;line-height:.95}
.cbnc-pro .side{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#4A4A4A);text-align:right;line-height:1.7}
.cbnc-pro .bot{grid-column:1/-1}
.cbnc-prog{height:3px;background:color-mix(in srgb,var(--c-bl) 18%,var(--fil,#ddd));position:relative;overflow:hidden}
.cbnc-prog i{position:absolute;inset:0;background:var(--c-bl);transform-origin:left;transition:transform var(--d-moyen,.35s) var(--ease-barre,cubic-bezier(.7,0,.2,1))}
.cbnc-prog.ind i{width:30%;animation:cbncInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite}
@keyframes cbncInd{from{transform:translateX(-100%)}to{transform:translateX(340%)}}
.cbnc-steps{display:flex;gap:22px;margin-top:14px;flex-wrap:wrap}
.cbnc-steps .lbl.on{color:var(--c-bl)}.cbnc-steps .lbl.ok{color:var(--texte,#111)}
.cbnc-pro.err{grid-template-columns:1fr}
.cbnc-pro.err .st{color:var(--erreur,#B3261E)}
.cbnc-pro.err p{margin:0 0 4px;color:var(--texte-sec,#4A4A4A)}

/* library grid */
.cbnc-lib{margin-top:clamp(28px,3vw,44px)}
.cbnc-libhd{display:flex;align-items:baseline;gap:12px;padding-bottom:12px;margin-bottom:20px;border-bottom:2px solid var(--trait,#1E1E1C)}
.cbnc-libhd h2{margin:0;font-size:20px;font-weight:900;font-stretch:85%;letter-spacing:-.02em}
.cbnc-grid{list-style:none;margin:0;padding:0;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(max(250px,calc((100% - 42px) / 4)),1fr))}
.cbnc-card{position:relative;width:100%;height:100%;min-height:196px;display:flex;flex-direction:column;align-items:stretch;gap:0;padding:20px 20px 16px;border:1px solid var(--fil-fort,#C4C4BF);border-radius:var(--c-r);background:var(--surface,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:transform .2s var(--c-out),box-shadow .2s var(--c-out),border-color .15s}
button.cbnc-card:hover{border-color:var(--trait,#1E1E1C);transform:translateY(-3px);box-shadow:0 4px 0 var(--trait,#1E1E1C)}
button.cbnc-card:active{transform:translateY(-1px);box-shadow:0 2px 0 var(--trait,#1E1E1C)}
.cbnc-card .bar{position:absolute;left:-1px;top:-1px;width:44px;height:4px;background:var(--c-ink);transition:width .32s var(--c-out)}
button.cbnc-card:hover .bar{width:calc(100% + 2px)}
.cbnc-card.raw .bar{background:var(--fil-fort,#C4C4BF)}
.cbnc-card.new .bar{background:var(--vert,#1FD26A)}
.cbnc-card .top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.cbnc-card .top .lbl{font-size:11px}
.cbnc-card .ti{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:12px;font-size:18px;font-weight:800;line-height:1.2;letter-spacing:-.012em}
.cbnc-card .br{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:8px;font-size:13.5px;line-height:1.5;color:var(--texte-sec,#4A4A4A)}
.cbnc-card .br.ld{height:3em;background:linear-gradient(var(--fond-2,#F4F4F2) 0 0) 0 .3em/90% .9em no-repeat,linear-gradient(var(--fond-2,#F4F4F2) 0 0) 0 1.8em/60% .9em no-repeat}
.cbnc-card .ft{margin-top:auto;padding-top:14px;display:flex;align-items:center;gap:10px;font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A);font-variant-numeric:tabular-nums}
.cbnc-card .ft .sp{flex:1}
.cbnc-chip{font-family:var(--mono,monospace);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 6px;background:var(--fond-2,#F4F4F2);color:var(--texte-sec,#4A4A4A)}
.cbnc-chip.ok{background:color-mix(in srgb,var(--vert,#1FD26A) 22%,var(--fond,#fff));color:var(--texte,#111)}
.cbnc-chip.mk{background:var(--c-or-bg2);color:var(--texte,#111)}
.cbnc-card.pend{cursor:default;border-color:color-mix(in srgb,var(--c-bl) 55%,transparent);background:var(--c-bl-bg)}
.cbnc-card.pend .bar{width:calc(100% + 2px);background:color-mix(in srgb,var(--c-bl) 22%,transparent);overflow:hidden}
.cbnc-card.pend .bar::after{content:"";position:absolute;inset:0;width:30%;background:var(--c-bl);animation:cbncInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite}
.cbnc-card.pend .top .lbl{color:var(--c-bl)}
.cbnc-card.busy{opacity:.6}
.cbnc-none{padding:36px 4px;color:var(--texte-sec,#4A4A4A);font-size:14px}
.cbnc-empty{margin-top:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(max(250px,calc((100% - 42px) / 4)),1fr));gap:14px}
.cbnc-empty i{display:block;min-height:150px;border:1px dashed var(--fil-fort,#C4C4BF)}
.cbnc-empty p{grid-column:1/-1;margin:4px 0 0;color:var(--texte-sec,#4A4A4A);font-size:14px}

/* reading sheet */
.cbnc-scrim{position:fixed;inset:0;z-index:50;background:color-mix(in srgb,#111 42%,transparent);display:flex;justify-content:center;align-items:flex-start;padding:clamp(16px,4vh,48px) 16px;overflow:auto;animation:cbncFade .24s var(--c-ease) both}
.cbnc-scrim.out{animation:cbncFadeOut .2s var(--c-ease) forwards}
@keyframes cbncFade{from{opacity:0}}
@keyframes cbncFadeOut{to{opacity:0}}
.cbnc-sheet{position:relative;width:min(820px,100%);min-height:min(560px,100%);background:var(--fond,#fff);color:var(--texte,#111);border:2px solid var(--trait,#1E1E1C);box-shadow:var(--ombre-dure,8px 8px 0 #1E1E1C);animation:cbncSheet .38s var(--c-out) both}
.cbnc-scrim.out .cbnc-sheet{animation:cbncSheetOut .2s var(--c-ease) forwards}
@keyframes cbncSheet{from{opacity:0;transform:translateY(18px) scale(.985)}}
@keyframes cbncSheetOut{to{opacity:0;transform:translateY(10px) scale(.99)}}
.cbnc-sbar{position:sticky;top:calc(-1 * clamp(16px,4vh,48px));z-index:2;display:flex;align-items:center;gap:6px;padding:10px 12px 10px 24px;background:var(--fond,#fff);border-bottom:1px solid var(--fil,#ddd)}
.cbnc-sbar .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.cbnc-sbar .sep{width:1px;height:20px;background:var(--fil,#ddd);margin:0 4px}
.cbnc-sbody{padding:clamp(28px,4vw,48px) clamp(24px,5vw,64px) 56px}
.cbnc-sbody>*{max-width:680px}
.cbnc-sbody h2.ti{margin:0;font-size:clamp(28px,3vw,40px);font-weight:900;font-stretch:85%;line-height:1;letter-spacing:-.035em}
.cbnc-sbody .meta{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 28px}
.cbnc-sbody .warn{font-size:13px;color:var(--texte-sec,#4A4A4A);background:var(--fond-2,#F4F4F2);padding:10px 12px;margin:0 0 24px;border-left:3px solid var(--fil-fort,#C4C4BF)}
.cbnc-smarks{margin:0 0 28px;padding:14px 16px;background:var(--c-or-bg);border-left:3px solid var(--c-or)}
.cbnc-smarks ul{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:4px;font-size:14px}
.cbnc-smarks time{font-family:var(--mono,monospace);font-size:12px;font-weight:700;margin-right:10px;color:var(--texte,#111)}
.cbnc-sbody .path{font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A);word-break:break-all;margin-top:24px}
.cbnc-sload{padding:80px 0;text-align:center}
@media (max-width:640px){.cbnc-sbar .b2 .tl{display:none}}

/* markdown */
.cbnc-md{font-size:16px;line-height:1.65}
.cbnc-md h1,.cbnc-md h2{font-size:21px;font-weight:900;font-stretch:90%;letter-spacing:-.02em;line-height:1.15;margin:32px 0 10px}
.cbnc-md h3{font-size:17px;font-weight:800;margin:22px 0 6px;line-height:1.3}
.cbnc-md h4{font-family:var(--mono,monospace);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:18px 0 6px;color:var(--texte-sec,#4A4A4A)}
.cbnc-md>:first-child{margin-top:0}
.cbnc-md .brief{background:var(--fond-2,#F4F4F2);padding:16px 20px 4px;margin:0 0 8px}
.cbnc-md .brief h2{font-family:var(--mono,monospace);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#4A4A4A);margin:0 0 8px;font-stretch:100%}
.cbnc-md p{margin:0 0 12px}
.cbnc-md ul,.cbnc-md ol{margin:0 0 12px;padding-left:22px}
.cbnc-md li{margin:4px 0}
.cbnc-md li>ul,.cbnc-md li>ol{margin:3px 0}
.cbnc-md ul{list-style:none}
.cbnc-md ul>li{position:relative}
.cbnc-md ul>li::before{content:"";position:absolute;left:-16px;top:.7em;width:6px;height:6px;background:var(--texte,#111)}
.cbnc-md ul ul>li::before{background:none;box-shadow:inset 0 0 0 1.5px var(--texte,#111)}
.cbnc-md li.tk::before{display:none}
.cbnc-md .bx{position:absolute;left:-22px;top:.32em;width:15px;height:15px;border:1.5px solid var(--texte,#111);display:block}
.cbnc-md li.tk.dn>.bx{background:var(--c-ink);border-color:var(--c-ink)}
.cbnc-md li.tk.dn>.bx::after{content:"";position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid var(--c-ink-t);border-width:0 2px 2px 0;transform:rotate(45deg)}
.cbnc-md li.tk.dn>.tx{color:var(--texte-sec,#4A4A4A);text-decoration:line-through;text-decoration-thickness:1px}
.cbnc-md strong{font-weight:800}
.cbnc-md code{font-family:var(--mono,monospace);font-size:.86em;background:var(--fond-2,#F4F4F2);padding:1px 5px}
.cbnc-md pre{font-family:var(--mono,monospace);font-size:12px;background:var(--fond-2,#F4F4F2);padding:12px 14px;overflow:auto;margin:0 0 12px}
.cbnc-md pre code{background:none;padding:0}
.cbnc-md blockquote{margin:0 0 12px;padding:2px 0 2px 14px;border-left:3px solid var(--fil,#ddd);color:var(--texte-sec,#4A4A4A)}
.cbnc-md hr{border:0;border-top:1px solid var(--fil,#ddd);margin:22px 0}
.cbnc-raw{margin-top:36px;border-top:2px solid var(--trait,#1E1E1C)}
.cbnc-raw summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 0;font-weight:800;font-size:14px}
.cbnc-raw summary::-webkit-details-marker{display:none}
.cbnc-raw summary .pl{width:28px;height:28px;display:grid;place-items:center;background:var(--fond-2,#F4F4F2);transition:transform var(--d-moyen,.35s) var(--c-ease),background .2s}
.cbnc-raw[open] summary .pl{transform:rotate(45deg);background:var(--c-bl);color:#fff}
.cbnc-raw .txt{white-space:pre-wrap;font-size:13px;line-height:1.65;color:var(--texte-sec,#4A4A4A);padding-bottom:12px}

/* modal + toast */
.cbnc-mscrim{position:fixed;inset:0;z-index:70;background:color-mix(in srgb,#111 45%,transparent);display:grid;place-items:center;padding:24px;animation:cbncFade .2s var(--c-ease) both}
.cbnc-dlg{width:min(460px,100%);background:var(--surface,#fff);color:var(--texte,#111);border:2px solid var(--trait,#1E1E1C);padding:24px;animation:cbncIn .3s var(--c-out) both}
.cbnc-dlg h2{margin:12px 0 8px;font-size:22px;font-weight:900;font-stretch:88%;letter-spacing:-.025em;line-height:1.1}
.cbnc-dlg p{margin:0;color:var(--texte-sec,#4A4A4A);font-size:14px}
.cbnc-dlg .ft{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;flex-wrap:wrap}
.cbnc-toast{min-height:0;line-height:1.3;position:fixed;left:50%;bottom:24px;z-index:80;transform:translateX(-50%);background:var(--c-ink);color:var(--c-ink-t);font-family:var(--mono,monospace);font-size:13px;font-weight:500;padding:11px 14px;display:flex;align-items:center;gap:10px;animation:cbncToast .22s var(--c-out) both}
.cbnc-toast .pst{color:var(--vert,#1FD26A);margin:0}
.cbnc-toast.err .pst{color:var(--erreur,#FF6B5E)}
.cbnc-toast.out{animation:cbncToastOut .2s var(--c-ease) forwards}
@keyframes cbncToast{from{opacity:0;transform:translate(-50%,10px)}}
@keyframes cbncToastOut{to{opacity:0;transform:translate(-50%,10px)}}
@media (prefers-reduced-motion:reduce){.cbnc *,.cbnc-scrim,.cbnc-sheet,.cbnc-toast,.cbnc-mscrim,.cbnc-dlg{animation:none!important;transition:none!important}.cbnc .shim{color:var(--texte,#111);background:none}}
`;

  function injectCSS() {
    if (document.getElementById('cbnc-css')) return;
    var s = document.createElement('style');
    s.id = 'cbnc-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- icons (static SVG, no user data) ---------- */
  function svg(d, s) { return '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>', 16),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    copy: svg('<path d="M8 8h12v12H8z"/><path d="M4 16V4h12"/>', 16),
    dir: svg('<path d="M3 6h7l2 2h9v11H3z"/>', 16),
    redo: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>', 16)
  };

  /* ---------- helpers ---------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var NF = new Intl.NumberFormat('fr-FR');
  function num(n) { return NF.format(Math.max(0, Math.round(n || 0))); }
  function words(n) { return num(n) + ' mot' + ((n || 0) > 1 ? 's' : ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60);
  }
  function durLong(ms) {
    var s = Math.round((ms || 0) / 1000), m = Math.floor(s / 60);
    if (m < 1) return s + ' secondes';
    return m + ' min ' + pad(s % 60) + ' s';
  }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function hm(d) { return d.getHours() + ' h ' + pad(d.getMinutes()); }
  function dayKey(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(iso) {
    var d = new Date(iso); if (isNaN(d)) return '—';
    var now = new Date(), y = new Date(now.getTime() - 864e5);
    if (dayKey(iso) === dayKey(now.toISOString())) return 'Aujourd’hui';
    if (dayKey(iso) === dayKey(y.toISOString())) return 'Hier';
    return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
  }
  function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : hm(d); }
  var PROV = { passthrough: 'Brut', ollama: 'Ollama', groq: 'Groq', zai: 'Z.ai', mistral: 'Mistral', cloudflare: 'Cloudflare', gemini: 'Gemini', openrouter: 'OpenRouter' };
  function prov(p) { return PROV[p] || (p ? String(p) : '—'); }
  function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- tiny safe Markdown renderer (repris de notes.js) ---------- */
  function inline(src) {
    return String(src).split(/(`[^`]+`)/).map(function (part) {
      if (/^`[^`]+`$/.test(part)) return '<code>' + esc(part.slice(1, -1)) + '</code>';
      return esc(part)
        .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    }).join('');
  }
  function renderMarkdown(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], para = [], stack = [];
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    function closeLists(toIndent) { while (stack.length && stack[stack.length - 1].indent > toIndent) out.push('</li></' + stack.pop().type + '>'); }
    function closeAll() { closeLists(-1); }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], m;
      if (/^\s*```/.test(ln)) {
        flushPara(); closeAll();
        var buf = [];
        for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) buf.push(lines[i]);
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (!ln.trim()) { flushPara(); if (stack.length && !(lines[i + 1] && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1]))) closeAll(); continue; }
      if ((m = /^(#{1,4})\s+(.*?)\s*#*\s*$/.exec(ln))) {
        flushPara(); closeAll();
        var lv = m[1].length;
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { flushPara(); closeAll(); out.push('<hr>'); continue; }
      if ((m = /^\s*>\s?(.*)$/.exec(ln))) { flushPara(); closeAll(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
      if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(ln))) {
        flushPara();
        var indent = m[1].replace(/\t/g, '  ').length, type = /\d/.test(m[2]) ? 'ol' : 'ul', text = m[3];
        var top = stack[stack.length - 1];
        if (!top || indent > top.indent) { out.push('<' + type + '>'); stack.push({ type: type, indent: indent }); }
        else {
          closeLists(indent);
          top = stack[stack.length - 1];
          if (top && top.type !== type && top.indent === indent) { out.push('</li></' + stack.pop().type + '>'); out.push('<' + type + '>'); stack.push({ type: type, indent: indent }); }
          else if (!top) { out.push('<' + type + '>'); stack.push({ type: type, indent: indent }); }
          else out.push('</li>');
        }
        var tk = /^\[([ xX])\]\s+(.*)$/.exec(text);
        if (tk) {
          var done = tk[1] !== ' ';
          out.push('<li class="tk' + (done ? ' dn' : '') + '"><span class="bx" role="img" aria-label="' + (done ? 'Fait' : 'À faire') + '"></span><span class="tx">' + inline(tk[2]) + '</span>');
        } else out.push('<li>' + inline(text));
        continue;
      }
      if (stack.length && /^\s+\S/.test(ln)) { out.push(' ' + inline(ln.trim())); continue; }
      closeAll();
      para.push(ln.trim());
    }
    flushPara(); closeAll();
    return out.join('\n');
  }
  /* « En bref » → texte brut (pour les cartes) ; repli : premier paragraphe. */
  function plain(s) { return String(s).replace(/`([^`]+)`/g, '$1').replace(/\*\*|__|\*/g, '').replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '').trim(); }
  function briefOf(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n'), i, out = [];
    for (i = 0; i < lines.length; i++) if (/^#{2,3}\s+en bref\s*$/i.test(lines[i].trim())) break;
    if (i < lines.length) {
      for (i++; i < lines.length && !/^#{1,4}\s/.test(lines[i]); i++) if (lines[i].trim()) out.push(plain(lines[i]));
    } else {
      for (i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (!l || /^#/.test(l)) { if (out.length) break; continue; }
        out.push(plain(l)); if (out.join(' ').length > 240) break;
      }
    }
    return out.join(' ');
  }
  /* Le Markdown de la note, avec « En bref » mis en encadré. */
  function renderNoteBody(md) {
    var html = renderMarkdown(md);
    return html.replace(/<h2>En bref<\/h2>([\s\S]*?)(?=<h[1-4]>|$)/i, '<section class="brief"><h2>En bref</h2>$1</section>');
  }

  /* ---------- progress fan-out (onNoteProgress has no unsubscribe) ---------- */
  var subs = typeof WeakMap === 'function' ? new WeakMap() : null;
  function subscribe(api, fn) {
    if (!api || typeof api.onNoteProgress !== 'function' || !subs) return null;
    var set = subs.get(api);
    if (!set) {
      set = new Set(); subs.set(api, set);
      try { api.onNoteProgress(function (p) { set.forEach(function (f) { try { f(p); } catch (e) { console.error(e); } }); }); } catch (e) { console.error(e); }
    }
    set.add(fn);
    return function () { set.delete(fn); };
  }
  /* Titre saisi + repères : l'API ne les transporte pas encore → gardés localement, par note. */
  var XKEY = 'cbnc.extras';
  function extrasAll() { try { return JSON.parse(window.localStorage.getItem(XKEY) || '{}') || {}; } catch (e) { return {}; } }
  function extrasOf(id) { var x = extrasAll()[id]; return x && typeof x === 'object' ? x : null; }
  function extrasSave(id, v) { try { var a = extrasAll(); if (v) a[id] = v; else delete a[id]; window.localStorage.setItem(XKEY, JSON.stringify(a)); } catch (e) { /* stockage indisponible */ } }

  /* ---------- mount ---------- */
  function mount(container, opts) {
    injectCSS();
    opts = opts || {};
    var api = opts.api || null;
    var navigate = typeof opts.navigate === 'function' ? opts.navigate : function () {};
    function has(m) { return !!(api && typeof api[m] === 'function'); }
    var CORE = has('listNotes') && has('getNote');

    var root = document.createElement('div');
    root.className = 'cbnc';
    container.innerHTML = '';
    container.appendChild(root);

    // mode: 'idle' | 'session' | 'processing'
    var st = { mode: 'idle', notes: null, listErr: null, q: '', sel: null, note: null, noteErr: null,
      prog: null, progAt: 0, reorgId: null, busy: false, alive: true, draft: null, fresh: null };
    var cache = {}; // id → { brief, md } (cartes)
    var tick = 0, raf = 0, toastT = 0, modal = null, sheet = null, lastNav = '';
    var hist = [], histAt = 0, lvl = 0;

    function go(hash) { if (hash !== lastNav) { lastNav = hash; try { navigate(hash); } catch (e) { console.error(e); } } }
    function call(m) {
      var args = [].slice.call(arguments, 1);
      if (!has(m)) return Promise.reject(new Error('Méthode indisponible : ' + m));
      try { return Promise.resolve(api[m].apply(api, args)); } catch (e) { return Promise.reject(e); }
    }
    function errMsg(e) { return (e && e.message) || String(e); }
    function $(sel) { return root.querySelector(sel); }
    function stopLoops() { clearInterval(tick); tick = 0; cancelAnimationFrame(raf); raf = 0; }
    function cssVar(n, fb) { var v = getComputedStyle(root).getPropertyValue(n).trim(); return v || fb; }

    /* ---- toast ---- */
    function toast(msg, isErr) {
      var old = document.querySelector('.cbnc-toast'); if (old) old.remove();
      var t = document.createElement('div');
      t.className = 'cbnc cbnc-toast' + (isErr ? ' err' : '');
      t.setAttribute('role', 'status');
      t.innerHTML = '<span class="pst"></span>' + esc(msg);
      document.body.appendChild(t);
      clearTimeout(toastT);
      toastT = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }, isErr ? 3200 : 1800);
    }

    /* ---- confirm modal (in-page, never confirm()) ---- */
    function confirmModal(o) {
      closeModal(false);
      return new Promise(function (resolve) {
        var prev = document.activeElement;
        var sc = document.createElement('div');
        sc.className = 'cbnc cbnc-mscrim';
        sc.innerHTML = '<div class="cbnc-dlg" role="alertdialog" aria-modal="true" aria-labelledby="cbnc-dt" aria-describedby="cbnc-dd">' +
          '<div class="lbl">' + esc(o.label || 'Confirmation') + '</div>' +
          '<h2 id="cbnc-dt">' + esc(o.title) + '</h2><p id="cbnc-dd">' + esc(o.body) + '</p>' +
          '<div class="ft"><button class="btn b2 lg" data-m="no">' + esc(o.no || 'Annuler') + '</button>' +
          '<button class="btn b1' + (o.danger ? ' bdanger' : '') + '" data-m="yes">' + esc(o.yes) + '</button></div></div>';
        document.body.appendChild(sc);
        var yes = sc.querySelector('[data-m="yes"]'), no = sc.querySelector('[data-m="no"]');
        modal = { done: function (v) { sc.remove(); modal = null; if (prev && prev.focus) prev.focus(); resolve(v); } };
        sc.addEventListener('click', function (e) {
          var b = e.target.closest('[data-m]');
          if (b) modal.done(b.getAttribute('data-m') === 'yes');
          else if (e.target === sc) modal.done(false);
        });
        sc.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === yes ? no : yes).focus(); } });
        (o.danger ? no : yes).focus();
      });
    }
    function closeModal(v) { if (modal) modal.done(v); }

    /* ---- skeleton ---- */
    function render() {
      root.innerHTML = '<div class="cbnc-page">' +
        '<header class="cbnc-hd"><h1>Prise de notes</h1>' +
        '<label class="cbnc-srch">' + I.search + '<input type="search" placeholder="Rechercher" aria-label="Rechercher une note" data-act="q" autocomplete="off" spellcheck="false"' + (CORE ? '' : ' disabled') + '><kbd>/</kbd></label>' +
        '<button class="btn bi" data-act="settings" aria-label="Réglages de la prise de notes" title="Réglages">' + I.gear + '</button></header>' +
        '<section class="cbnc-hero" data-r="hero" aria-label="Enregistrement"></section>' +
        '<section class="cbnc-lib" aria-labelledby="cbnc-lt"><div class="cbnc-libhd"><h2 id="cbnc-lt">Mes notes</h2><span class="lbl" data-r="count"></span></div>' +
        '<div data-r="list"></div></section></div>';
      renderHero(); renderList();
    }

    /* ---- hero: idle / live session / processing — height morphs between states ---- */
    function morph(fn) {
      var el = $('[data-r="hero"]');
      if (!el || reduced) { fn(); return; }
      var h0 = el.offsetHeight;
      fn();
      var h1 = el.offsetHeight;
      if (Math.abs(h1 - h0) < 2) return;
      el.classList.remove('morph');
      el.style.height = h0 + 'px';
      void el.offsetHeight;
      el.classList.add('morph');
      el.style.height = h1 + 'px';
      var done = function (e) { if (e && e.target !== el) return; el.style.height = ''; el.classList.remove('morph'); el.removeEventListener('transitionend', done); };
      el.addEventListener('transitionend', done);
      setTimeout(done, 600);
    }
    function renderHero(anim) {
      var el = $('[data-r="hero"]'); if (!el) return;
      if (anim) { morph(function () { renderHero(false); }); return; }
      stopLoops();
      el.className = 'cbnc-hero';
      if (st.mode === 'session') return renderSession(el);
      if (st.mode === 'processing') return renderProcessing(el);
      if (!CORE || !has('startNote')) {
        el.innerHTML = '<div class="cbnc-off"><b>Indisponible.</b> La prise de notes n’est pas disponible dans cette version de CBW AI. Mets l’application à jour pour l’utiliser.</div>';
        return;
      }
      el.innerHTML = '<div class="cbnc-idle in">' +
        '<button class="cbnc-rec" data-act="start"' + (st.busy ? ' disabled' : '') + '><span class="ring"><span class="dot"></span></span>' +
        '<span class="tx"><b>Démarrer une note</b><span>Réunion, appel, réflexion à voix haute : parle librement, CBW transcrit au fil de l’eau puis range tes idées.</span></span></button>' +
        '<div class="cbnc-keys"><div><kbd>Control gauche</kbd><span class="x">×3</span> démarrer</div><div><kbd>Control gauche</kbd><span class="x">×1</span> terminer</div></div></div>';
    }

    /* session */
    function elapsed() {
      var p = st.prog || {};
      return (p.elapsedMs || 0) + (p.state === 'recording' ? performance.now() - st.progAt : 0);
    }
    function renderSession(el) {
      var p = st.prog || { state: 'recording' }, paused = p.state === 'paused', d = st.draft || (st.draft = { title: '', marks: [] });
      el.className = 'cbnc-hero live' + (paused ? ' paused' : '');
      el.innerHTML = '<div class="cbnc-live">' +
        '<div class="tmw"><div class="lbl st"><span class="pst"></span>' + (paused ? 'En pause' : 'Enregistrement') + '</div>' +
        '<div class="cbnc-timer" data-s="tm" role="timer" aria-label="Durée"></div><div class="cbnc-stat" data-s="wd"></div></div>' +
        '<div class="cbnc-wave" aria-hidden="true"><canvas></canvas><div class="ax"><span data-s="ax0"></span><span>maintenant</span></div></div>' +
        '<div class="acts">' +
        '<button class="btn b1" data-act="stop"' + (has('stopNote') ? '' : ' disabled') + '>Terminer <span class="ar">→</span></button>' +
        '<button class="btn b2 lg" data-act="pause"' + (has(paused ? 'resumeNote' : 'pauseNote') ? '' : ' disabled') + '>' + (paused ? 'Reprendre' : 'Pause') + '</button>' +
        '<button class="btn b3" data-act="cancel"' + (has('cancelNote') ? '' : ' disabled') + '>Annuler</button></div>' +
        '<div class="cbnc-fields">' +
        '<label class="cbnc-fld"><span class="lbl">Titre</span><input data-act="title" maxlength="120" placeholder="Facultatif" autocomplete="off" value="' + esc(d.title) + '"></label>' +
        '<label class="cbnc-fld"><span class="lbl">Repère</span><input data-act="mark" maxlength="200" placeholder="Tape une ligne pendant que tu parles…" autocomplete="off"><kbd>↵</kbd></label>' +
        '<ul class="cbnc-marks" data-s="marks"></ul>' +
        '<div class="hint"><kbd>Control gauche</kbd> terminer · <kbd>Échap</kbd> annuler · rien n’est collé pendant la note</div></div></div>';
      renderMarks();
      updateSession();
      tick = setInterval(updateSession, 250);
      startWave();
    }
    function renderMarks() {
      var ul = $('[data-s="marks"]'); if (!ul || !st.draft) return;
      ul.innerHTML = st.draft.marks.map(function (m) { return '<li><time>' + esc(clock(m.t)) + '</time>' + esc(m.text) + '</li>'; }).join('');
    }
    function addMark(inp) {
      var v = inp.value.trim(); if (!v || st.mode !== 'session') return;
      st.draft.marks.push({ t: Math.round(elapsed()), text: v });
      inp.value = ''; renderMarks();
    }
    function updateSession() {
      var p = st.prog || {}, tm = $('[data-s="tm"]'), wd = $('[data-s="wd"]');
      if (!tm) return;
      var txt = clock(elapsed()), html = txt.split(':').map(esc).join('<span class="c"></span>');
      if (tm.innerHTML !== html) { tm.innerHTML = html; tm.setAttribute('aria-label', 'Durée ' + txt); }
      var n = st.draft ? st.draft.marks.length : 0;
      var w = '<b>' + esc(num(p.words)) + '</b> mot' + ((p.words || 0) > 1 ? 's' : '') + (n ? ' · <b>' + n + '</b> repère' + (n > 1 ? 's' : '') : '');
      if (wd.innerHTML !== w) wd.innerHTML = w;
    }
    /* Forme d'onde des ~12 dernières secondes (niveau micro), repères en orange. */
    var WIN = 12000, BUCKET = 100;
    function startWave() {
      var cv = $('.cbnc-wave canvas'); if (!cv) return;
      var ctx = cv.getContext('2d'), ax0 = $('[data-s="ax0"]');
      if (ax0) ax0.textContent = '−' + (WIN / 1000) + ' s';
      var cOr = cssVar('--orange', '#FF5A1F'), cIdle = cssVar('--fil-fort', '#C4C4BF'), cTx = cssVar('--texte-sec', '#5F5F5A');
      function frame(t) {
        if (st.mode !== 'session' || !cv.isConnected) return;
        var p = st.prog || {}, paused = p.state === 'paused', now = elapsed();
        var target = paused ? 0 : (typeof p.level === 'number' ? Math.max(0, Math.min(1, p.level)) : .18 + .12 * Math.sin(t / 380) * Math.sin(t / 170));
        lvl += (target - lvl) * (target > lvl ? .5 : .12);
        if (!paused) {
          if (!hist.length || now - histAt >= BUCKET) { hist.push({ t: now, v: lvl }); histAt = now; if (hist.length > 400) hist.splice(0, hist.length - 300); }
          else if (lvl > hist[hist.length - 1].v) hist[hist.length - 1].v = lvl;
        }
        var dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var pad = 12, iw = W - pad * 2, mid = H / 2, step = iw / (WIN / BUCKET), bw = Math.max(2, step * .55);
        ctx.fillStyle = cIdle; ctx.fillRect(pad, mid - .5, iw, 1);
        ctx.fillStyle = paused ? cIdle : cOr;
        for (var i = hist.length - 1; i >= 0; i--) {
          var age = now - hist[i].t; if (age > WIN) break;
          var x = pad + iw - (age / WIN) * iw - bw, h = Math.max(2, hist[i].v * (H - 8));
          ctx.globalAlpha = paused ? 1 : .35 + .65 * (1 - age / WIN);
          ctx.fillRect(Math.round(x), Math.round(mid - h / 2), Math.round(bw), Math.round(h));
        }
        ctx.globalAlpha = 1;
        (st.draft ? st.draft.marks : []).forEach(function (m) {
          var age = now - m.t; if (age < 0 || age > WIN) return;
          var x = Math.round(pad + iw - (age / WIN) * iw);
          ctx.fillStyle = cTx; ctx.fillRect(x, 0, 1, H);
          ctx.fillRect(x - 3, 0, 7, 7);
        });
        if (!reduced) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      if (reduced) tick2();
      function tick2() { var id = setInterval(function () { if (st.mode !== 'session' || !cv.isConnected) { clearInterval(id); return; } frame(performance.now()); }, 500); }
    }

    /* processing */
    function renderProcessing(el) {
      var p = st.prog || { state: 'transcribing' };
      el.className = 'cbnc-hero proc';
      if (p.state === 'error') {
        el.innerHTML = '<div class="cbnc-pro err in"><div><div class="lbl st"><span class="pst"></span>Erreur</div>' +
          '<h2>La note n’a pas pu être terminée</h2></div><p>' + esc(p.message || 'Une erreur inattendue est survenue.') + '</p>' +
          '<div><button class="btn b2" data-act="dismiss">Fermer</button></div></div>';
        return;
      }
      el.innerHTML = '<div class="cbnc-pro" aria-live="polite"><div><div class="lbl st"><span class="pst"></span>Traitement IA</div>' +
        '<h2 class="shim" data-s="h"></h2></div><div class="side" data-s="sum"></div>' +
        '<div class="bot"><div class="cbnc-prog" data-s="pg"><i></i></div><div class="cbnc-steps" data-s="steps"></div></div></div>';
      updateProcessing();
    }
    function procLabel(p) {
      var org = p.state === 'organizing', total = p.total || 3, step = Math.min(p.step || 1, total);
      return org ? 'Organisation ' + step + '/' + total + '…' : 'Transcription…';
    }
    function updateProcessing() {
      var p = st.prog || {}, h = $('[data-s="h"]');
      if (p.state === 'error' || !h) { renderHero(true); return; }
      var org = p.state === 'organizing', total = p.total || 3, step = Math.min(p.step || 1, total), label = procLabel(p);
      if (h.textContent !== label) h.textContent = label;
      var pg = $('[data-s="pg"]');
      if (!org) { pg.classList.add('ind'); pg.firstChild.style.transform = ''; }
      else { pg.classList.remove('ind'); pg.firstChild.style.transform = 'scaleX(' + ((step - .5) / total).toFixed(3) + ')'; }
      $('[data-s="steps"]').innerHTML = '<span class="lbl ' + (org ? 'ok' : 'on') + '">' + (org ? '✓ ' : '') + 'Transcription</span>' +
        '<span class="lbl' + (org ? ' on' : '') + '">Organisation</span><span class="lbl">Note</span>';
      var bits = [];
      if (p.elapsedMs) bits.push(esc(durLong(p.elapsedMs)));
      if (p.words) bits.push(esc(words(p.words)));
      $('[data-s="sum"]').innerHTML = bits.join(' · ') + (bits.length ? '<br>' : '') + esc(p.message || 'La note s’ouvrira dès qu’elle est prête.');
      var pc = $('[data-s="pend"]'); if (pc) pc.textContent = label;
    }

    /* ---- library: day groups of cards ---- */
    function titleOf(n) { var x = extrasOf(n.id); return (x && x.title) || n.title || 'Note sans titre'; }
    function cardHTML(n) {
      var c = cache[n.id], raw = n.provider === 'passthrough', busy = st.reorgId === n.id, x = extrasOf(n.id), mk = x && x.marks ? x.marks.length : 0;
      return '<li><button class="cbnc-card' + (raw ? ' raw' : '') + (st.fresh === n.id ? ' new' : '') + (busy ? ' busy' : '') + '" data-act="open" data-id="' + esc(n.id) + '">' +
        '<span class="bar" aria-hidden="true"></span>' +
        '<span class="top"><span class="lbl">' + esc(dayLabel(n.createdAt) + ' · ' + timeOf(n.createdAt)) + '</span><span class="lbl">' + esc(clock(n.durationMs)) + '</span></span>' +
        '<span class="ti">' + esc(titleOf(n)) + '</span>' +
        (busy ? '<span class="br shim">Réorganisation…</span>' : c ? (c.brief ? '<span class="br">' + esc(c.brief) + '</span>' : '') : '<span class="br ld" aria-hidden="true"></span>') +
        '<span class="ft"><span>' + esc(words(n.words)) + '</span><span class="sp"></span>' +
        (mk ? '<span class="cbnc-chip mk">' + mk + ' repère' + (mk > 1 ? 's' : '') + '</span>' : '') +
        '<span class="cbnc-chip' + (raw ? '' : ' ok') + '">' + esc(prov(n.provider)) + '</span></span></button></li>';
    }
    function pendingHTML() {
      var p = st.prog || {}, t = st.draft && st.draft.title;
      return '<li><div class="cbnc-card pend in" aria-live="polite"><span class="bar" aria-hidden="true"></span>' +
        '<span class="top"><span class="lbl"><span class="pst"></span>En cours</span><span class="lbl">' + esc(clock(p.elapsedMs)) + '</span></span>' +
        '<span class="ti">' + esc(t || 'Nouvelle note') + '</span><span class="br shim" data-s="pend">' + esc(procLabel(p)) + '</span>' +
        '<span class="ft"><span>' + esc(words(p.words)) + '</span></span></div></li>';
    }
    function renderList() {
      var el = $('[data-r="list"]'), cnt = $('[data-r="count"]'); if (!el) return;
      if (!CORE) { el.innerHTML = '<div class="cbnc-none">Aucune note.</div>'; return; }
      if (st.listErr) { el.innerHTML = '<div class="cbnc-none">Impossible de lire tes notes : ' + esc(st.listErr) + ' <button class="btn b3" data-act="reload">Réessayer</button></div>'; return; }
      if (!st.notes) { el.innerHTML = '<div class="cbnc-none lbl">Chargement…</div>'; return; }
      if (cnt) cnt.textContent = st.notes.length ? st.notes.length + ' note' + (st.notes.length > 1 ? 's' : '') : '';
      var q = fold(st.q.trim());
      var list = st.notes.filter(function (n) { return !q || fold(titleOf(n) + ' ' + (cache[n.id] ? cache[n.id].brief : '')).indexOf(q) !== -1; });
      var pend = st.mode === 'processing' && !st.reorgId && st.prog && st.prog.state !== 'error' && !q;
      if (!list.length && !pend) {
        el.innerHTML = q ? '<div class="cbnc-none">Aucune note ne correspond à « ' + esc(st.q.trim()) + ' ».</div>'
          : '<div class="cbnc-empty"><i></i><i></i><i></i><i></i><p>Tes notes apparaîtront ici, la plus récente en premier.</p></div>';
        return;
      }
      // Une seule grille continue (pas de groupes par jour : ils laissaient des rangées à moitié vides) ;
      // le jour est porté par chaque carte.
      el.innerHTML = '<ul class="cbnc-grid">' + (pend ? pendingHTML() : '') + list.map(cardHTML).join('') + '</ul>';
    }
    /* Premières lignes de « En bref » : lues note par note (4 en parallèle), mises en cache. */
    var queue = [], inflight = 0;
    function fetchBriefs() {
      queue = (st.notes || []).filter(function (n) { return !cache[n.id]; }).map(function (n) { return n.id; });
      pump();
    }
    function pump() {
      while (inflight < 4 && queue.length && st.alive) {
        var id = queue.shift(); inflight++;
        call('getNote', id).then(function (n) {
          if (n && n.meta) cache[n.meta.id] = { brief: briefOf(n.markdown).slice(0, 320) };
        }, function () { /* carte sans résumé */ }).then(function (id) { return function () { if (!cache[id]) cache[id] = { brief: '' }; inflight--; if (st.alive) { schedList(); pump(); } }; }(id));
      }
    }
    var listT = 0;
    function schedList() { if (listT) return; listT = requestAnimationFrame(function () { listT = 0; renderList(); }); }
    function loadList() {
      if (!CORE) { st.notes = []; renderList(); return Promise.resolve(); }
      return call('listNotes').then(function (list) {
        st.listErr = null;
        st.notes = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }, function (e) { st.listErr = errMsg(e); })
        .then(function () { if (!st.alive) return; renderList(); fetchBriefs(); });
    }

    /* ---- reading sheet (centred overlay) ---- */
    function sheetHTML() {
      var dis = function (k) { return has(k) ? '' : ' disabled'; };
      var n = st.note, close = '<button class="btn bi" data-act="close" aria-label="Fermer (Échap)" title="Fermer · Échap">' + I.x + '</button>';
      if (st.noteErr) return '<div class="cbnc-sbar"><span class="lbl">Note</span>' + close + '</div><div class="cbnc-sbody"><div class="cbnc-none">' + esc(st.noteErr) + '</div></div>';
      if (!n || !n.meta || n.meta.id !== st.sel) return '<div class="cbnc-sbar"><span class="lbl">Note</span>' + close + '</div><div class="cbnc-sbody"><div class="cbnc-sload lbl">Chargement…</div></div>';
      var m = n.meta, md = String(n.markdown || ''), raw = m.provider === 'passthrough', x = extrasOf(m.id), title = (x && x.title) || m.title || 'Note sans titre';
      var mt = /^\s*#\s+(.+)\n?/.exec(md);
      if (mt && (fold(mt[1].trim()) === fold(m.title || '') || fold(mt[1].trim()) === fold(title))) md = md.slice(mt[0].length);
      return '<div class="cbnc-sbar"><span class="lbl">' + esc(dayLabel(m.createdAt) + ' · ' + timeOf(m.createdAt)) + '</span>' +
        '<button class="btn b2" data-act="copy"' + dis('copyNote') + ' title="Copier le Markdown (⌘C)">' + I.copy + '<span class="tl">Copier</span></button>' +
        '<button class="btn b2" data-act="reveal"' + dis('revealNote') + ' title="Afficher dans le Finder">' + I.dir + '<span class="tl">Finder</span></button>' +
        '<button class="btn b2" data-act="reorg"' + dis('reorganizeNote') + (st.mode === 'idle' ? '' : ' disabled') + ' title="Relancer l’organisation depuis la transcription">' + I.redo + '<span class="tl">Réorganiser</span></button>' +
        '<button class="btn b3 danger" data-act="del"' + dis('deleteNote') + '>Supprimer</button><span class="sep"></span>' + close + '</div>' +
        '<div class="cbnc-sbody"><h2 class="ti" id="cbnc-st">' + esc(title) + '</h2>' +
        '<div class="meta"><span class="cbnc-chip">' + esc(clock(m.durationMs)) + '</span><span class="cbnc-chip">' + esc(words(m.words)) + '</span>' +
        '<span class="cbnc-chip' + (raw ? '' : ' ok') + '">' + esc(raw ? 'Transcription brute' : prov(m.provider)) + '</span></div>' +
        (raw ? '<p class="warn">Aucun moteur IA n’était disponible : voici la transcription telle quelle. « Réorganiser » la reprend quand un moteur est prêt.</p>' : '') +
        (x && x.marks && x.marks.length ? '<div class="cbnc-smarks"><span class="lbl">Tes repères</span><ul>' + x.marks.map(function (k) { return '<li><time>' + esc(clock(k.t)) + '</time>' + esc(k.text) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="cbnc-md">' + (md.trim() ? renderNoteBody(md) : '<p>Cette note est vide.</p>') + '</div>' +
        (n.transcript ? '<details class="cbnc-raw"><summary>Transcription brute <span class="pl" aria-hidden="true">+</span></summary><div class="txt">' + esc(n.transcript) + '</div></details>' : '') +
        (m.path ? '<div class="path">' + esc(m.path) + '</div>' : '') + '</div>';
    }
    function renderSheet() {
      if (!st.sel) { closeSheetEl(); return; }
      if (!sheet) {
        var sc = document.createElement('div');
        sc.className = 'cbnc-scrim';
        sc.innerHTML = '<article class="cbnc-sheet" role="dialog" aria-modal="true" aria-labelledby="cbnc-st"></article>';
        root.appendChild(sc);
        sheet = { sc: sc, art: sc.firstChild, prev: document.activeElement, ov: document.documentElement.style.overflow };
        document.documentElement.style.overflow = 'hidden';
        sc.addEventListener('mousedown', function (e) { if (e.target === sc) sheet.bg = true; });
        sc.addEventListener('click', function (e) { if (e.target === sc && sheet && sheet.bg) closeNote(); if (sheet) sheet.bg = false; });
        sc.addEventListener('keydown', trapTab);
      }
      var id = st.note && st.note.meta && st.note.meta.id;
      sheet.art.innerHTML = sheetHTML();
      if (sheet.shown !== id) { sheet.shown = id; sheet.sc.scrollTop = 0; }
      var f = sheet.art.querySelector('[data-act="close"]'); if (f && !sheet.art.contains(document.activeElement)) f.focus({ preventScroll: true });
    }
    function trapTab(e) {
      if (e.key !== 'Tab' || !sheet) return;
      var f = [].filter.call(sheet.art.querySelectorAll('button:not(:disabled),summary,[tabindex]'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    function closeSheetEl() {
      if (!sheet) return;
      var s = sheet; sheet = null;
      document.documentElement.style.overflow = s.ov || '';
      var back = s.prev && s.prev.isConnected ? s.prev : null;
      if (!back && s.shown) back = root.querySelector('.cbnc-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(s.shown) : s.shown) + '"]');
      if (back && back.focus) back.focus({ preventScroll: true });
      if (reduced) { s.sc.remove(); return; }
      s.sc.classList.add('out');
      setTimeout(function () { s.sc.remove(); }, 200);
    }
    function openNote(id) {
      if (!CORE || !id) return;
      st.sel = id; st.noteErr = null;
      if (!st.note || st.note.meta.id !== id) st.note = null;
      renderSheet(); go('#notes:' + id);
      call('getNote', id).then(function (n) {
        if (!st.alive || st.sel !== id) return;
        if (!n || !n.meta) throw new Error('Note introuvable.');
        st.note = n; cache[id] = { brief: briefOf(n.markdown).slice(0, 320) }; renderSheet();
      }).catch(function (e) { if (st.sel === id) { st.noteErr = errMsg(e); renderSheet(); } });
    }
    function closeNote() { st.sel = null; st.note = null; closeSheetEl(); go('#notes'); }

    /* ---- actions ---- */
    function setMode(mode) { st.mode = mode; renderHero(true); renderList(); var r = sheet && sheet.art.querySelector('[data-act="reorg"]'); if (r) r.disabled = mode !== 'idle' || !has('reorganizeNote'); }
    function startSession() {
      if (!has('startNote') || st.busy || st.mode !== 'idle') return;
      st.busy = true; st.fresh = null;
      if (st.sel) closeNote();
      st.prog = { state: 'recording', elapsedMs: 0, words: 0 }; st.progAt = performance.now();
      st.draft = { title: '', marks: [] }; hist = []; histAt = 0; lvl = 0;
      setMode('session');
      try { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { /* noop */ }
      call('startNote').catch(function (e) { toast('Impossible de démarrer : ' + errMsg(e), true); st.draft = null; setMode('idle'); })
        .then(function () { st.busy = false; });
    }
    function togglePause() {
      var paused = st.prog && st.prog.state === 'paused';
      st.prog = Object.assign({}, st.prog, { state: paused ? 'recording' : 'paused', elapsedMs: elapsed() }); st.progAt = performance.now();
      renderHero(false);
      call(paused ? 'resumeNote' : 'pauseNote').catch(function (e) { toast(errMsg(e), true); });
    }
    function syncTitle() { var t = $('[data-act="title"]'); if (t && st.draft) st.draft.title = t.value.trim(); }
    function stopSession() {
      syncTitle();
      var mk = $('[data-act="mark"]'); if (mk && mk.value.trim()) addMark(mk);
      st.prog = Object.assign({}, st.prog, { state: 'transcribing', elapsedMs: elapsed() });
      setMode('processing');
      call('stopNote').catch(function (e) { st.prog = { state: 'error', message: errMsg(e) }; renderHero(true); renderList(); });
    }
    function cancelSession() {
      if (st.mode !== 'session' || modal) return;
      var ms = elapsed();
      var doIt = function () {
        call('cancelNote').then(function () { st.prog = null; st.draft = null; setMode('idle'); toast('Note annulée'); }, function (e) { toast(errMsg(e), true); });
      };
      if (ms <= 30000) { doIt(); return; }
      confirmModal({ label: 'Annuler la note', title: 'Abandonner cet enregistrement ?', body: 'Les ' + durLong(ms) + ' enregistrées seront perdues. Cette action est définitive.', no: 'Continuer', yes: 'Abandonner', danger: true })
        .then(function (ok) { if (ok) doIt(); });
    }
    function noteAction(act) {
      var id = st.note && st.note.meta && st.note.meta.id; if (!id) return;
      if (act === 'copy') call('copyNote', id).then(function () { toast('Copié'); }, function (e) { toast(errMsg(e), true); });
      else if (act === 'reveal') call('revealNote', id).catch(function (e) { toast(errMsg(e), true); });
      else if (act === 'reorg') {
        if (st.mode !== 'idle') return;
        st.reorgId = id;
        st.prog = { state: 'organizing', step: 1, total: 3, elapsedMs: st.note.meta.durationMs, words: st.note.meta.words };
        closeNote(); setMode('processing');
        call('reorganizeNote', id).then(function () {
          if (st.alive && st.reorgId === id && st.mode === 'processing') { st.reorgId = null; delete cache[id]; setMode('idle'); toast('Note réorganisée'); loadList(); openNote(id); }
        }, function (e) { st.reorgId = null; setMode('idle'); toast(errMsg(e), true); });
      } else if (act === 'del') {
        var t = (extrasOf(id) || {}).title || st.note.meta.title || 'cette note';
        confirmModal({ label: 'Supprimer', title: 'Supprimer « ' + t + ' » ?', body: 'La note et sa transcription brute seront supprimées du Mac. Cette action est définitive.', no: 'Garder', yes: 'Supprimer', danger: true })
          .then(function (ok) {
            if (!ok) return;
            call('deleteNote', id).then(function () {
              st.notes = (st.notes || []).filter(function (n) { return n.id !== id; });
              delete cache[id]; extrasSave(id, null);
              closeNote(); renderList(); loadList(); toast('Note supprimée');
            }, function (e) { toast(errMsg(e), true); });
          });
      }
    }

    /* ---- progress events ---- */
    function onProg(p) {
      if (!st.alive || !p) return;
      var prev = st.prog && st.prog.state;
      st.prog = p; st.progAt = performance.now();
      if (p.state === 'recording' || p.state === 'paused') {
        if (st.mode !== 'session') { if (!st.draft) { st.draft = { title: '', marks: [] }; hist = []; } if (st.sel) closeNote(); setMode('session'); }
        else if (prev !== p.state) { syncTitle(); renderHero(false); }
        else updateSession();
      } else if (p.state === 'transcribing' || p.state === 'organizing') {
        if (st.mode === 'session') syncTitle();
        if (st.mode !== 'processing') setMode('processing'); else updateProcessing();
      } else if (p.state === 'done') {
        var id = p.noteId || st.reorgId, wasReorg = !!st.reorgId; st.reorgId = null;
        if (id && !wasReorg && st.draft && (st.draft.title || st.draft.marks.length)) extrasSave(id, st.draft);
        if (id) delete cache[id];
        st.draft = null; st.fresh = wasReorg ? null : id;
        setMode('idle');
        toast(p.message || (wasReorg ? 'Note réorganisée' : 'Note prête'));
        loadList().then(function () { if (id && st.alive && st.mode === 'idle') { st.note = null; openNote(id); } });
      } else if (p.state === 'error') {
        st.reorgId = null;
        if (st.mode !== 'idle') { st.mode = 'processing'; renderHero(true); renderList(); }
        else toast(p.message || 'Erreur pendant la note', true);
      }
    }
    var unsub = subscribe(api, onProg);

    /* ---- events (delegated, CSP-safe) ---- */
    function onClick(e) {
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-act');
      if (a === 'start') startSession();
      else if (a === 'open') openNote(b.getAttribute('data-id'));
      else if (a === 'close') closeNote();
      else if (a === 'pause') togglePause();
      else if (a === 'stop') stopSession();
      else if (a === 'cancel') cancelSession();
      else if (a === 'dismiss') { st.prog = null; st.draft = null; setMode('idle'); }
      else if (a === 'settings') go('#reglages');
      else if (a === 'reload') { st.listErr = null; st.notes = null; renderList(); loadList(); }
      else if (a === 'copy' || a === 'reveal' || a === 'reorg' || a === 'del') noteAction(a);
    }
    function onInput(e) {
      var a = e.target.getAttribute('data-act');
      if (a === 'q') { st.q = e.target.value; renderList(); }
      else if (a === 'title' && st.draft) st.draft.title = e.target.value.trim();
    }
    function onKey(e) {
      if (!st.alive || !root.isConnected) return;
      var t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable, act = t.getAttribute && t.getAttribute('data-act');
      if (e.key === 'Enter' && act === 'mark') { e.preventDefault(); addMark(t); return; }
      if (e.key === 'Escape') {
        if (modal) { e.preventDefault(); closeModal(false); return; }
        if (sheet) { e.preventDefault(); closeNote(); return; }
        if ((act === 'mark' || act === 'title' || act === 'q') && t.value) { e.preventDefault(); t.value = ''; if (act === 'q') { st.q = ''; renderList(); } if (act === 'title' && st.draft) st.draft.title = ''; return; }
        if (st.mode === 'session') { e.preventDefault(); cancelSession(); return; }
        if (typing) t.blur();
        return;
      }
      if (modal || typing) return;
      if (e.key === '/' && CORE && !sheet) { e.preventDefault(); var q = $('[data-act="q"]'); if (q) q.focus(); }
      else if (e.key === 'c' && e.metaKey && sheet && st.note && !String(window.getSelection ? window.getSelection() : '').length) { e.preventDefault(); noteAction('copy'); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);

    /* ---- initial view ---- */
    lastNav = opts.noteId ? '#notes:' + opts.noteId : '#notes';
    render();
    if (opts.noteId && CORE) openNote(opts.noteId);
    loadList();

    return {
      open: function (id) { if (id) openNote(id); else closeNote(); },
      list: function () { closeNote(); loadList(); },
      unmount: function () {
        st.alive = false; stopLoops(); closeModal(false); closeSheetEl();
        if (listT) cancelAnimationFrame(listT);
        if (unsub) unsub();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput);
        document.removeEventListener('keydown', onKey);
        root.remove();
      }
    };
  }

  window.CBWNotes = { mount: mount, renderMarkdown: renderMarkdown };
})();

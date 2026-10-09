/* CBW AI — écran « Brainstorm → master prompt » (CRAFT+, cible Claude Code / Cursor).
   Parcours v2 (conversation en direct) : vidage libre à la voix ; pendant qu'on parle, l'IA remplit la grille
   CRAFT+ et pose de petites questions (fil de conversation ici + bulles en bas à droite, design/bubbles/)
   auxquelles on répond à l'oral ou d'un clic → à l'arrêt, compilation directe du master prompt.
   « Encore une question » (écran résultat) rouvre l'ancien flux de questions ciblées.
   Même langage visuel que notes.js (écran Notes validé) : colonne calme, mode focus pour l'enregistrement,
   boutons à trois niveaux, toasts, modale maison.
   Vanilla JS, sans dépendance, compatible CSP (aucun handler inline, aucun eval).
   Contrat : docs/APP_API.md › Mode « Brainstorm → master prompt » + « Brainstorm v2 — conversation en direct ».
   Usage : window.CBWBrainstorm.mount(container, { api, navigate, id }) → { open(id), unmount() }
   Tout texte venant de l'utilisateur / du LLM passe par esc() avant d'entrer dans innerHTML. */
(function () {
  'use strict';

  /* ---------- styles (injectés une seule fois, scopés sous .cbwb) ---------- */
  var CSS = [
    '.cbwb{--b-ink:var(--encre,var(--inverse-fond,#1C1C1E));--b-ink-t:var(--inverse-texte,#fff);--b-f2:var(--fond-2,#F4F4F2);--b-f3:var(--fond-3,#ECECE8);--b-sec:var(--texte-sec,#5F5F5A);--b-t3:var(--texte-3,#6E6E6A);--b-fil:var(--fil,#ddd);--b-ff:var(--fil-fort,#C4C4BF);',
    '--b-ease:var(--ease,cubic-bezier(.2,.7,.2,1));--b-out:var(--ease-sortie,cubic-bezier(.16,1,.3,1));--b-spring:var(--ease-ressort,cubic-bezier(.3,1.35,.5,1));--b-r:3px;--b-r2:4px;',
    '--b-or:var(--orange,#FF5A1F);--b-bl:var(--bleu,#2B3BFF);--b-vt:var(--vert,#1FD26A);--b-or-bg:color-mix(in srgb,var(--b-or) 15%,var(--fond,#fff));--b-bl-bg:color-mix(in srgb,var(--b-bl) 8%,var(--fond,#fff));',
    'font-family:var(--police,"Archivo",system-ui,sans-serif);color:var(--texte,#111);background:var(--fond,#fff);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}',
    '.cbwb *,.cbwb *::before,.cbwb *::after{box-sizing:border-box}',
    '.cbwb .lbl{font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--b-sec);line-height:1}',
    '.cbwb .pst{display:inline-block;width:10px;height:10px;margin-right:8px;background:currentColor;vertical-align:-1px;flex:none}',
    '.cbwb kbd{font-family:var(--mono,monospace);font-size:11px;border:1px solid var(--b-fil);padding:1px 5px;color:var(--b-sec);background:var(--surface,#fff)}',
    '.cbwb :focus-visible{outline:3px solid var(--focus,#2B3BFF);outline-offset:2px}',
    '.cbwb svg{display:block;flex:none}',
    '.cbwb [hidden]{display:none!important}',
    /* buttons (identiques à notes.js) */
    '.cbwb .btn{appearance:none;font:inherit;font-weight:800;font-size:14px;border:0;border-radius:var(--b-r);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;text-decoration:none;transition:background var(--d-rapide,.15s),color var(--d-rapide,.15s),transform .12s,box-shadow var(--d-rapide,.15s)}',
    '.cbwb .btn:disabled{cursor:not-allowed;opacity:.42}',
    '.cbwb .btn:not(:disabled):active{transform:scale(.98)}',
    '.cbwb .b1{background:var(--b-ink);color:var(--b-ink-t);min-height:44px;padding:0 20px;position:relative;overflow:hidden}',
    '.cbwb .b1:not(:disabled):hover{background:color-mix(in srgb,var(--b-ink) 86%,var(--fond,#fff))}',
    '.cbwb .b1::before{content:"";position:absolute;top:0;bottom:0;left:-40%;width:30%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--b-ink-t) 16%,transparent),transparent);transform:skewX(-18deg);transition:left .5s var(--b-ease);pointer-events:none}',
    '.cbwb .b1:not(:disabled):hover::before{left:120%}',
    '.cbwb .ar{display:inline-block;transition:transform .2s var(--b-ease)}',
    '.cbwb .btn:not(:disabled):hover .ar{transform:translateX(4px)}',
    '.cbwb .b1 .dot{width:10px;height:10px;border-radius:50%;background:var(--b-or);flex:none}',
    '.cbwb .b2{background:var(--surface,#fff);color:var(--texte,#111);min-height:36px;padding:0 14px;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1px var(--b-ff)}',
    '.cbwb .b2:not(:disabled):hover{background:var(--b-f2);box-shadow:inset 0 0 0 1px var(--texte,#111)}',
    '.cbwb .lg{min-height:52px;padding:0 26px;font-size:15px}',
    '.cbwb .b2.lg{font-size:14.5px}',
    '.cbwb .b3{background:none;color:var(--b-sec);min-height:36px;padding:0 8px;font-weight:700;font-size:13px;position:relative}',
    '.cbwb .b3::after{content:"";position:absolute;left:8px;right:8px;bottom:8px;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s var(--b-ease)}',
    '.cbwb .b3:not(:disabled):hover{color:var(--texte,#111)}',
    '.cbwb .b3:not(:disabled):hover::after{transform:scaleX(1)}',
    '.cbwb .b3.lg{min-height:52px;font-size:14.5px;padding:0 12px}.cbwb .b3.lg::after{bottom:15px;left:12px;right:12px}',
    '.cbwb .bi{background:none;color:var(--b-sec);width:36px;height:36px;padding:0}',
    '.cbwb .bi:not(:disabled):hover{background:var(--b-f2);color:var(--texte,#111)}',
    '.cbwb .bt{background:none;color:var(--b-sec);min-height:32px;padding:0 10px;font-weight:700;font-size:13px}',
    '.cbwb .bt:not(:disabled):hover{background:var(--b-f2);color:var(--texte,#111)}',
    '.cbwb .bdanger{background:var(--erreur,#B3261E);color:#fff}',
    '.cbwb .bdanger:not(:disabled):hover{background:color-mix(in srgb,var(--erreur,#B3261E) 85%,#000)}',
    '.cbwb .btn.ok{background:var(--b-vt);color:var(--sur-vert,#1E1E1C)}',
    '.cbwb .ck{width:16px;height:16px}.cbwb .ck path{stroke-dasharray:24;stroke-dashoffset:24;animation:cbwbCk .32s var(--b-ease) forwards}',
    '@keyframes cbwbCk{to{stroke-dashoffset:0}}',
    '.cbwb .in{animation:cbwbIn .42s var(--b-out) both}',
    '.cbwb .in2{animation:cbwbIn .42s var(--b-out) .06s both}.cbwb .in3{animation:cbwbIn .42s var(--b-out) .12s both}',
    '@keyframes cbwbIn{from{opacity:0;transform:translateY(8px)}}',
    '.cbwb .shim{background:linear-gradient(90deg,var(--texte,#111) 0 40%,var(--b-sec) 50%,var(--texte,#111) 60% 100%) 0/300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cbwbSh 1.6s linear infinite}',
    '@keyframes cbwbSh{from{background-position:100% 0}to{background-position:0 0}}',
    '.cbwb .ind{position:relative;height:3px;background:color-mix(in srgb,var(--b-bl) 14%,transparent);overflow:hidden}',
    '.cbwb .ind i{position:absolute;top:0;bottom:0;left:0;width:28%;background:var(--b-bl);animation:cbwbInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite}',
    '@keyframes cbwbInd{from{transform:translateX(-100%)}to{transform:translateX(360%)}}',

    /* ---- frame ---- */
    '.cbwb.bs{position:relative;container:cbwb / inline-size;min-height:min(100vh,100%)}',
    '.bs-view{min-height:100vh}',
    '.bs-pad{padding:clamp(28px,4vh,56px) clamp(20px,4cqw,56px) 72px}',
    '.bs-col{max-width:clamp(780px,58cqw,980px);margin:0 auto}',

    /* ---- accueil ---- */
    '.bs-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px}',
    '.bs-hd h1{margin:0;font-size:clamp(30px,4.8cqw,40px);font-weight:900;font-stretch:85%;line-height:1;letter-spacing:-.035em}',
    '.bs-lede{margin:12px 0 0;max-width:56ch;font-size:16px;line-height:1.5;color:var(--b-sec);text-wrap:pretty}',
    '.bs-start{background:var(--b-f2);border-radius:var(--b-r2);padding:clamp(18px,2.4cqw,28px)}',
    '.bs-steps{list-style:none;margin:0 0 clamp(20px,2.4cqw,28px);padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}',
    '.bs-steps li{display:flex;flex-direction:column;gap:9px}',
    '.bs-steps li::before{content:"";display:block;height:var(--barre-h,8px);width:44px;background:var(--c);transform-origin:left;animation:cbwbBar .6s var(--ease-barre,cubic-bezier(.7,0,.2,1)) both}',
    '.bs-steps li:nth-child(2)::before{animation-delay:.08s}.bs-steps li:nth-child(3)::before{animation-delay:.16s}',
    '@keyframes cbwbBar{from{transform:scaleX(0)}}',
    '.bs-steps b{display:block;font-size:15px;font-weight:800;line-height:1.25}',
    '.bs-steps span:not(.lbl){font-size:13px;color:var(--b-sec);line-height:1.45}',
    '.bs-go{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:clamp(18px,2.2cqw,24px);border-top:1px solid var(--b-fil)}',
    '.bs-go .tg{display:flex;align-items:center;gap:12px}',
    '@container cbwb (max-width:720px){.bs-steps{grid-template-columns:1fr;gap:16px}.bs-steps li{display:grid;grid-template-columns:44px 1fr;column-gap:14px;row-gap:4px}.bs-steps li::before{grid-row:span 3;margin-top:4px}}',
    /* segmented (thumb glissant) */
    '.bs-seg{position:relative;display:grid;grid-template-columns:1fr 1fr;background:var(--surface,#fff);box-shadow:inset 0 0 0 1px var(--b-ff);border-radius:var(--b-r);padding:3px;min-width:240px}',
    '.bs-seg .th{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);background:var(--b-ink);border-radius:2px;transition:transform .32s var(--b-spring)}',
    '.bs-seg[data-v="cursor"] .th{transform:translateX(100%)}',
    '.bs-seg button{position:relative;z-index:1;appearance:none;border:0;background:none;font:inherit;font-weight:700;font-size:13.5px;color:var(--b-sec);height:38px;padding:0 16px;cursor:pointer;transition:color .2s;white-space:nowrap}',
    '.bs-seg button[aria-checked="true"]{color:var(--b-ink-t)}',
    '.bs-seg button[aria-checked="false"]:hover{color:var(--texte,#111)}',
    '.bs-seg.sm{min-width:0}.bs-seg.sm button{height:30px;font-size:12.5px;padding:0 12px}',
    /* history */
    '.bs-past{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:40px 0 4px;padding:0 10px 10px;border-bottom:1px solid var(--b-fil)}',
    '.bs-past h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em}',
    '.bs-rows{list-style:none;margin:0;padding:0}',
    '.bs-row{width:100%;display:flex;align-items:center;gap:14px;min-height:58px;padding:9px 10px;border:0;border-radius:var(--b-r2);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background var(--d-rapide,.15s)}',
    '.bs-row:hover{background:var(--b-f2)}',
    '.bs-row .ic{width:38px;height:38px;border-radius:var(--b-r);background:var(--b-f2);display:grid;place-items:center;color:var(--b-sec);flex:none}',
    '.bs-row:hover .ic{background:var(--fond,#fff)}',
    '.bs-row .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.bs-row .t{font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25}',
    '.bs-row .s{font-family:var(--mono,monospace);font-size:11.5px;color:var(--b-sec);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bs-bdg{font-family:var(--mono,monospace);font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;white-space:nowrap;line-height:1;flex:none;background:var(--b-f3);color:var(--b-sec)}',
    '.bs-bdg.ok{background:var(--b-vt);color:var(--sur-vert,#1E1E1C)}',
    '.bs-bdg.ia{background:var(--b-bl-bg);color:var(--b-bl)}',
    '.bs-bdg.live{background:var(--b-or);color:var(--sur-orange,#1E1E1C)}',
    '.bs-bdg.err{background:color-mix(in srgb,var(--erreur,#B3261E) 14%,var(--fond,#fff));color:var(--erreur,#B3261E)}',
    '.bs-none{padding:28px 10px;color:var(--b-sec);font-size:14px}',
    '.bs-zero{display:flex;align-items:center;gap:16px;padding:22px 10px}',
    '.bs-zero .ic{width:40px;height:40px;border-radius:var(--b-r);background:var(--b-f2);display:grid;place-items:center;color:var(--b-sec);flex:none}',
    '.bs-zero b{display:block;font-size:15px;font-weight:800}',
    '.bs-zero span{font-size:13px;color:var(--b-sec)}',
    '.bs-off{background:var(--fond,#fff);border-left:3px solid var(--b-sec);padding:14px 16px;font-size:14px}',

    /* ---- CRAFT+ chips (vidage / analyse / résultat replié) ---- */
    '.bs-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}',
    '.bs-chip{height:34px;min-width:34px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--mono,monospace);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:2px;background:transparent;color:var(--b-t3);box-shadow:inset 0 0 0 1px var(--b-ff);transition:background .32s var(--b-ease),color .32s var(--b-ease),box-shadow .32s var(--b-ease)}',
    '.bs-chip.l{padding:0;width:34px;font-size:14px}',
    '.bs-chip[data-s="wait"]{box-shadow:none;background:repeating-linear-gradient(-45deg,var(--b-f2) 0 4px,transparent 4px 8px);outline:1px dashed var(--b-ff);outline-offset:-1px}',
    '.bs-chip[data-s="vide"]{background:var(--b-f3);color:var(--b-sec);box-shadow:none}',
    '.bs-chip[data-s="partiel"]{background:var(--b-or);color:var(--sur-orange,#1E1E1C);box-shadow:none}',
    '.bs-chip[data-s="ok"]{background:var(--b-vt);color:var(--sur-vert,#1E1E1C);box-shadow:none}',
    '.bs-chip.pop{animation:cbwbPop .42s var(--b-spring)}',
    '@keyframes cbwbPop{0%{transform:scale(.82)}100%{transform:none}}',
    '.bs-chips.big .bs-chip{height:44px;min-width:44px;font-size:12.5px;padding:0 14px}.bs-chips.big .bs-chip.l{width:44px;padding:0;font-size:17px}',
    '.bs-chcap{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px}',
    '.bs-legend{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:12px}',
    '.bs-legend span{display:inline-flex;align-items:center;gap:6px}',
    '.bs-legend i{width:10px;height:10px;display:block}',

    /* ---- focus (vidage + analyse) ---- */
    '.bs-fx{position:sticky;top:0;height:100vh;display:grid;grid-template-rows:auto 1fr auto;padding:20px clamp(20px,4cqw,56px) clamp(20px,3.5vh,32px);background:var(--fond,#fff)}',
    '.bs-fx .top{display:flex;align-items:center;justify-content:space-between;gap:16px}',
    '.bs-fx .st{color:var(--b-or);font-weight:700;display:flex;align-items:center}',
    '.bs-fx .st .pst{border-radius:50%;animation:cbwbBlink 1.2s steps(1) infinite}',
    '.bs-fx.ia .st{color:var(--b-bl)}.bs-fx.ia .st .pst{border-radius:0;animation:none}',
    '@keyframes cbwbBlink{50%{opacity:.15}}',
    '.bs-fx .keys{font-family:var(--mono,monospace);font-size:11px;color:var(--b-sec);display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
    '.bs-fx .mid{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;text-align:center}',
    '.bs-hint{margin:0;max-width:44ch;font-size:clamp(16px,1.5cqw,20px);font-weight:700;line-height:1.35;letter-spacing:-.01em;text-wrap:balance}',
    '.bs-hint em{font-style:normal;color:var(--b-sec);font-weight:500}',
    '.bs-timer{font-size:clamp(84px,min(17cqw,24vh),232px);font-weight:900;font-stretch:70%;line-height:.8;letter-spacing:-.055em;font-variant-numeric:tabular-nums;white-space:nowrap;margin:clamp(16px,3.5vh,40px) 0 clamp(18px,3.5vh,36px)}',
    '.bs-timer .c{display:inline-block;width:.11em;height:.5em;margin:0 .07em;vertical-align:.07em;background:linear-gradient(var(--b-or) 0 0) top/100% .11em no-repeat,linear-gradient(var(--b-or) 0 0) bottom/100% .11em no-repeat}',
    '.bs-wave{display:flex;align-items:center;justify-content:center;gap:4px;height:clamp(32px,6vh,56px);width:min(440px,80%)}',
    '.bs-wave i{flex:1;max-width:6px;height:100%;background:var(--b-or);transform:scaleY(.08);transition:transform .1s linear}',
    '.bs-fx .wd{font-family:var(--mono,monospace);font-size:13px;color:var(--b-sec);font-variant-numeric:tabular-nums;margin-top:14px}',
    '.bs-fx .wd b{color:var(--texte,#111);font-weight:700}',
    '.bs-fx .acts{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:clamp(18px,4vh,40px);flex-wrap:wrap}',
    '.bs-fx .acts .b1.lg{min-width:200px}',
    '.bs-fx .bot{width:min(620px,100%);margin:0 auto}',
    '.bs-big{margin:0;font-size:clamp(56px,min(10cqw,15vh),136px);font-weight:900;font-stretch:70%;line-height:.86;letter-spacing:-.05em}',
    '.bs-fx .sub{margin:clamp(14px,2.4vh,24px) 0 0;max-width:46ch;color:var(--b-sec);font-size:15px}',
    '.bs-fx .ind{width:min(440px,80%);margin-top:clamp(20px,4vh,36px)}',
    '@container cbwb (max-width:720px){.bs-fx .keys .k2{display:none}}',
    '@media (max-height:700px){.bs-fx{padding-top:14px;padding-bottom:14px}.bs-hint{font-size:16px}}',

    /* ---- barre haute (questions / résultat) ---- */
    '.bs-bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:12px clamp(16px,3cqw,40px);background:var(--fond,#fff);border-bottom:1px solid var(--b-fil)}',
    '.bs-bar .ttl{font-weight:800;font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.bs-bar .sp{flex:1}',
    '.bs-bar .sep{width:1px;height:20px;background:var(--b-fil);margin:0 4px}',

    /* ---- questions ---- */
    '.bs-qw{display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,30cqw,460px);min-height:calc(100vh - 61px)}',
    '.bs-qm{padding:clamp(28px,6vh,72px) clamp(24px,5cqw,88px) 64px;min-width:0}',
    '.bs-qc{max-width:720px;margin:0 auto}',
    '.bs-prog{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:clamp(20px,3.5vh,32px)}',
    '.bs-steps2{display:flex;gap:4px}',
    '.bs-steps2 button{appearance:none;border:0;padding:0;width:26px;height:8px;background:var(--b-f3);cursor:pointer;border-radius:0;transition:background .25s,transform .12s}',
    '.bs-steps2 button[data-s="ans"]{background:var(--texte,#111)}',
    '.bs-steps2 button[data-s="skip"]{background:transparent;box-shadow:inset 0 0 0 1.5px var(--b-ff)}',
    '.bs-steps2 button[aria-current="step"]{background:var(--b-bl)}',
    '.bs-steps2 button:disabled{cursor:default}',
    '.bs-steps2 button:not(:disabled):hover{transform:scaleY(1.5)}',
    '.bs-vise{display:inline-flex;align-items:center;gap:8px}',
    '.bs-vise .tile{width:20px;height:20px;display:grid;place-items:center;font-family:var(--mono,monospace);font-size:11px;font-weight:700;background:var(--b-bl);color:var(--sur-bleu,#fff)}',
    '.bs-qh{margin:0;font-size:clamp(28px,3.4cqw,44px);font-weight:900;font-stretch:85%;line-height:1.02;letter-spacing:-.035em;text-wrap:balance}',
    '.bs-why{display:flex;gap:10px;align-items:baseline;margin:16px 0 0;color:var(--b-sec);font-size:14.5px;line-height:1.5;max-width:60ch}',
    '.bs-why .lbl{flex:none;color:var(--focus,#2B3BFF)}',
    '.bs-sugg{display:flex;flex-wrap:wrap;gap:8px;margin-top:clamp(22px,3.5vh,32px)}',
    '.bs-sg{appearance:none;font:inherit;font-weight:700;font-size:14px;min-height:44px;padding:0 16px;border:0;border-radius:var(--b-r);background:var(--surface,#fff);color:var(--texte,#111);box-shadow:inset 0 0 0 1px var(--b-ff);cursor:pointer;display:inline-flex;align-items:center;gap:10px;text-align:left;transition:background .15s,box-shadow .15s,color .15s,transform .12s}',
    '.bs-sg .n{font-family:var(--mono,monospace);font-size:11px;font-weight:500;color:var(--b-t3)}',
    '.bs-sg:hover{background:var(--b-f2);box-shadow:inset 0 0 0 1px var(--texte,#111)}',
    '.bs-sg:active{transform:scale(.98)}',
    '.bs-sg[aria-pressed="true"]{background:var(--b-ink);color:var(--b-ink-t);box-shadow:none}',
    '.bs-sg[aria-pressed="true"] .n{color:inherit;opacity:.6}',
    '.bs-ans{position:relative;margin-top:16px}',
    '.bs-ans textarea{display:block;width:100%;min-height:clamp(112px,16vh,168px);resize:vertical;appearance:none;border:0;border-radius:var(--b-r);background:var(--surface,#fff);color:var(--texte,#111);font:inherit;font-size:16px;line-height:1.55;padding:14px 16px 40px;box-shadow:inset 0 0 0 1.5px var(--champ,#949490);transition:box-shadow .2s}',
    '.bs-ans textarea::placeholder{color:var(--b-t3)}',
    '.bs-ans textarea:focus{outline:0;box-shadow:inset 0 0 0 2px var(--texte,#111)}',
    '.bs-ans .mic{position:absolute;left:16px;bottom:12px;display:flex;align-items:center;gap:8px;pointer-events:none}',
    '.bs-ans .mic .k{font-family:var(--mono,monospace);font-size:11px;color:var(--b-t3);display:flex;gap:6px;align-items:center}',
    '.bs-ans[data-mic="rec"] textarea{box-shadow:inset 0 0 0 2px var(--b-or)}',
    '.bs-ans[data-mic="rec"] .mic .lbl{color:var(--b-or)}',
    '.bs-ans[data-mic="rec"] .mic .pst{border-radius:50%;animation:cbwbBlink 1.2s steps(1) infinite}',
    '.bs-ans[data-mic="proc"] .mic .lbl{color:var(--b-bl)}',
    '.bs-qa{display:flex;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}',
    '.bs-qa .b1{min-width:150px}',
    '.bs-qa .sp{flex:1}',
    '.bs-qa .kh{font-family:var(--mono,monospace);font-size:11px;color:var(--b-t3);display:flex;gap:6px;align-items:center}',
    /* fin des questions */
    '.bs-end .bs-qh{font-size:clamp(30px,3.8cqw,52px)}',
    '.bs-sum{display:flex;gap:clamp(20px,3cqw,40px);margin:clamp(20px,3.5vh,32px) 0 0;flex-wrap:wrap}',
    '.bs-sum div{display:flex;flex-direction:column;gap:8px}',
    '.bs-sum b{font-size:clamp(40px,4.5cqw,64px);font-weight:900;font-stretch:70%;line-height:.8;letter-spacing:-.04em;font-variant-numeric:tabular-nums}',
    '.bs-sum b small{font-size:.5em;color:var(--b-t3);letter-spacing:-.02em}',
    '.bs-end p{margin:18px 0 0;color:var(--b-sec);max-width:58ch}',
    '.bs-end .bs-qa{margin-top:clamp(24px,4vh,36px)}',
    /* grille CRAFT+ */
    '.bs-side{border-left:1px solid var(--b-fil);background:var(--fond,#fff);padding:clamp(24px,4vh,40px) clamp(18px,2cqw,28px) 40px;min-width:0}',
    '.bs-side .in-st{position:sticky;top:85px}',
    '.bs-gh{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 14px}',
    '.bs-gh h3{margin:0;font-size:17px;font-weight:900;font-stretch:88%;letter-spacing:-.01em}',
    '.bs-slots{list-style:none;margin:0;padding:0;border-top:2px solid var(--trait,#1E1E1C)}',
    '.bs-slot{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr) auto;column-gap:12px;row-gap:3px;align-items:center;padding:11px 8px 11px 0;border-bottom:1px solid var(--b-fil);transition:background .25s}',
    '.bs-slot .tl{grid-row:span 2;align-self:start;width:28px;height:28px;display:grid;place-items:center;font-family:var(--mono,monospace);font-size:13px;font-weight:700;background:var(--b-f3);color:var(--b-sec);transition:background .32s var(--b-ease),color .32s}',
    '.bs-slot[data-s="partiel"] .tl{background:var(--b-or);color:var(--sur-orange,#1E1E1C)}',
    '.bs-slot[data-s="ok"] .tl{background:var(--b-vt);color:var(--sur-vert,#1E1E1C)}',
    '.bs-slot .nm{font-weight:800;font-size:14px;line-height:1.2}',
    '.bs-slot .stt{font-family:var(--mono,monospace);font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--b-t3)}',
    '.bs-slot[data-s="partiel"] .stt{color:color-mix(in srgb,var(--b-or) 78%,var(--texte,#111))}',
    '.bs-slot[data-s="ok"] .stt{color:var(--vert-pt,#15803D)}',
    '.bs-slot .vl{grid-column:2 / -1;font-size:13px;line-height:1.42;color:var(--b-sec);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '.bs-slot[data-s="vide"] .vl{color:var(--b-t3);font-style:italic}',
    '.bs-slot.cur{background:var(--b-bl-bg)}',
    '.bs-slot.cur::before{content:"";position:absolute;left:-12px;top:0;bottom:0;width:3px;background:var(--b-bl)}',
    '.bs-slot.cur .stt{color:var(--b-bl)}',
    '.bs-slot.pop .tl{animation:cbwbPop .42s var(--b-spring)}',
    '.bs-gnote{margin:14px 0 0;font-size:12.5px;color:var(--b-sec);line-height:1.45}',
    '@container cbwb (max-width:980px){.bs-qw{grid-template-columns:1fr}.bs-side{border-left:0;border-top:1px solid var(--b-fil);order:-1;padding:14px clamp(16px,3cqw,40px)}.bs-side .in-st{position:static}.bs-side .bs-gh{margin:0 0 10px}.bs-side .bs-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;border-top:0}.bs-side .bs-slot{grid-template-columns:24px minmax(0,1fr);border:0;padding:6px 8px 6px 6px;background:var(--b-f2);row-gap:0}.bs-side .bs-slot .tl{width:24px;height:24px;font-size:12px}.bs-side .bs-slot .vl,.bs-side .bs-gnote{display:none}.bs-side .bs-slot .stt{grid-column:2}.bs-side .bs-slot.cur{background:var(--b-bl-bg);box-shadow:inset 0 0 0 1.5px var(--b-bl)}.bs-side .bs-slot.cur::before{display:none}.bs-qm{padding-top:28px}}',

    /* ---- résultat ---- */
    '.bs-rw{display:grid;grid-template-columns:minmax(0,1fr) clamp(280px,24cqw,380px);gap:0;min-height:calc(100vh - 61px)}',
    '.bs-rm{padding:clamp(24px,4.5vh,56px) clamp(24px,4cqw,72px) 72px;min-width:0}',
    '.bs-rc{max-width:min(100%,104ch);margin:0 auto}',
    '.bs-rh .lbl{display:block;margin-bottom:12px}',
    '.bs-rh h2{margin:0;font-size:clamp(26px,2.8cqw,40px);font-weight:900;font-stretch:85%;line-height:1.04;letter-spacing:-.035em;text-wrap:balance}',
    '.bs-ra{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:22px}',
    '.bs-ra .b1{min-width:170px}',
    '.bs-saved{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;font-size:13px;color:var(--b-sec)}',
    '.bs-saved .pst{color:var(--vert-pt,#15803D);margin-right:0}',
    '.bs-saved code{font-family:var(--mono,monospace);font-size:12px;color:var(--texte,#111)}',
    '.bs-pr{margin-top:clamp(22px,3.5vh,32px);border:2px solid var(--trait,#1E1E1C);background:var(--surface,#fff)}',
    '.bs-prh{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 8px 8px 16px;border-bottom:1px solid var(--b-fil);background:var(--b-f2)}',
    '.bs-prb{padding:clamp(20px,2.4cqw,32px) clamp(20px,2.6cqw,36px) 36px;max-height:none}',
    '.bs-src{margin:0;font-family:var(--mono,monospace);font-size:13.5px;line-height:1.72;white-space:pre-wrap;word-break:break-word;tab-size:2;color:var(--texte,#111)}',
    '.bs-src .h{font-weight:700;color:var(--texte,#111)}',
    '.bs-src .h1{font-weight:700;font-size:1.08em}',
    '.bs-src .x{color:var(--focus,#2B3BFF)}',
    '.bs-src .m{color:var(--b-or)}',
    '.bs-src .q{color:var(--b-sec)}',
    '.bs-src .d{color:var(--b-t3)}',
    '.bs-busy{display:flex;flex-direction:column;gap:12px}',
    '.bs-busy .t{font-size:clamp(22px,2.2cqw,30px);font-weight:900;font-stretch:85%;letter-spacing:-.03em}',
    '.bs-sk{height:12px;background:var(--b-f2);position:relative;overflow:hidden}',
    '.bs-sk::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--b-bl) 10%,transparent),transparent);transform:translateX(-100%);animation:cbwbSk 1.4s var(--b-ease) infinite}',
    '@keyframes cbwbSk{to{transform:translateX(100%)}}',
    '.bs-rside{border-left:1px solid var(--b-fil);padding:clamp(24px,4.5vh,56px) clamp(18px,2cqw,28px) 40px;min-width:0}',
    '.bs-rside .in-st{position:sticky;top:85px;display:flex;flex-direction:column;gap:6px}',
    '.bs-dt{border-top:2px solid var(--trait,#1E1E1C)}',
    '.bs-dt+.bs-dt{margin-top:18px}',
    '.bs-dt summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:14px 0 12px;font-weight:900;font-stretch:88%;font-size:17px;letter-spacing:-.01em}',
    '.bs-dt summary::-webkit-details-marker{display:none}',
    '.bs-dt summary .lbl{margin-left:auto}',
    '.bs-dt summary .pl{width:26px;height:26px;display:grid;place-items:center;background:var(--b-f2);transition:transform var(--d-moyen,.35s) var(--b-ease),background .2s;font-weight:500;font-family:var(--mono,monospace)}',
    '.bs-dt[open] summary .pl{transform:rotate(45deg);background:var(--b-f3)}',
    '.bs-dt .bs-chips{justify-content:flex-start;padding-bottom:14px}',
    '.bs-dt .bs-chip{height:28px;min-width:28px;font-size:11px;padding:0 8px}.bs-dt .bs-chip.l{width:28px;padding:0;font-size:12.5px}',
    '.bs-dt[open] .bs-chips{display:none}',
    '.bs-dt .bs-slots{border-top:1px solid var(--b-fil)}',
    '.bs-qal{list-style:none;margin:0;padding:0 0 8px;font-size:13.5px}',
    '.bs-qal li{padding:10px 0;border-top:1px solid var(--b-fil)}',
    '.bs-qal b{display:block;font-weight:700;line-height:1.35}',
    '.bs-qal span{display:block;color:var(--b-sec);margin-top:3px;line-height:1.45}',
    '.bs-qal span.sk{color:var(--b-t3);font-style:italic}',
    '@container cbwb (max-width:980px){.bs-rw{grid-template-columns:1fr}.bs-rside{border-left:0;border-top:1px solid var(--b-fil);padding-top:8px}.bs-rside .in-st{position:static}}',
    /* markdown lu */
    '.bs-md{font-size:15.5px;line-height:1.65;max-width:76ch}',
    '.bs-md h1,.bs-md h2{font-size:19px;font-weight:900;font-stretch:90%;letter-spacing:-.02em;line-height:1.15;margin:30px 0 8px}',
    '.bs-md h3{font-size:16px;font-weight:800;margin:22px 0 6px}',
    '.bs-md>:first-child{margin-top:0}',
    '.bs-md p{margin:0 0 12px}',
    '.bs-md ul,.bs-md ol{margin:0 0 12px;padding-left:24px}',
    '.bs-md li{margin:4px 0}',
    '.bs-md ul{list-style:none}.bs-md ul>li{position:relative}',
    '.bs-md ul>li::before{content:"";position:absolute;left:-17px;top:.68em;width:6px;height:6px;background:var(--texte,#111)}',
    '.bs-md code{font-family:var(--mono,monospace);font-size:.86em;background:var(--b-f2);padding:1px 5px}',
    '.bs-md pre{font-family:var(--mono,monospace);font-size:12.5px;background:var(--b-f2);padding:12px 14px;overflow:auto;margin:0 0 12px}',
    '.bs-md pre code{background:none;padding:0}',
    '.bs-md .xt{display:block;font-family:var(--mono,monospace);font-size:11.5px;color:var(--b-bl);margin:14px 0 4px}',
    '.bs-md blockquote{margin:0 0 12px;padding:2px 0 2px 14px;border-left:3px solid var(--b-fil);color:var(--b-sec)}',
    '.bs-md strong{font-weight:800}',
    /* erreur */
    '.bs-err{display:flex;gap:14px;align-items:flex-start;padding:18px;border-radius:var(--b-r2);box-shadow:inset 0 0 0 1px var(--erreur,#B3261E);margin-top:24px}',
    '.bs-err .ic{color:var(--erreur,#B3261E);margin-top:2px}',
    '.bs-err b{display:block;font-size:16px;font-weight:800}',
    '.bs-err p{margin:4px 0 14px;color:var(--b-sec);font-size:14px}',

    /* modal + toast (même dessin que notes.js) */
    '.cbwb-scrim{position:fixed;inset:0;z-index:50;background:rgba(17,17,17,.45);display:grid;place-items:center;padding:24px;animation:cbwbFade .2s var(--b-ease) both}',
    '@keyframes cbwbFade{from{opacity:0}}',
    '.cbwb-dlg{width:min(460px,100%);background:var(--surface,#fff);color:var(--texte,#111);border:2px solid var(--trait,#1E1E1C);border-radius:0;box-shadow:var(--ombre-dure,8px 8px 0 #1E1E1C);padding:24px;animation:cbwbIn .3s var(--b-out) both}',
    '.cbwb-dlg h2{margin:12px 0 8px;font-size:22px;font-weight:900;font-stretch:88%;letter-spacing:-.025em;line-height:1.1}',
    '.cbwb-dlg p{margin:0;color:var(--b-sec);font-size:14px}',
    '.cbwb-dlg .ft{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;flex-wrap:wrap}',
    '.cbwb-toast{position:fixed;right:24px;bottom:24px;z-index:60;background:var(--b-ink);color:var(--b-ink-t);border-radius:var(--b-r);font-family:var(--mono,monospace);font-size:13px;font-weight:500;line-height:1.3;padding:11px 14px;display:flex;align-items:center;gap:10px;animation:cbwbToast .2s var(--b-ease) both}',
    '.cbwb-toast .pst{color:var(--vert,#1FD26A);margin:0}',
    '.cbwb-toast.err .pst{color:var(--erreur,#FF6B5E)}',
    '.cbwb-toast.out{animation:cbwbToastOut .2s var(--b-ease) forwards}',
    '@keyframes cbwbToast{from{opacity:0;transform:translateY(10px)}}',
    '@keyframes cbwbToastOut{to{opacity:0;transform:translateY(10px)}}',
    /* ---- vidage en direct : enregistreur · conversation · CRAFT+ ---- */
    '.bs-live{min-height:100vh;display:grid;grid-template-rows:auto 1fr;background:var(--fond,#fff)}',
    '.bs-ltop{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(20px,3cqw,40px);background:var(--fond,#fff);border-bottom:1px solid var(--b-fil)}',
    '.bs-ltop .st{color:var(--b-or);font-weight:700;display:flex;align-items:center}',
    '.bs-ltop .st .pst{border-radius:50%;animation:cbwbBlink 1.2s steps(1) infinite}',
    '.bs-ltop .keys{font-family:var(--mono,monospace);font-size:11px;color:var(--b-sec);display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
    '.bs-lg{display:grid;grid-template-columns:minmax(250px,.78fr) minmax(0,1.3fr) clamp(290px,24cqw,370px);align-items:start;min-height:0}',
    '.bs-lg>*{min-width:0}',
    '.bs-rec{position:sticky;top:53px;display:flex;flex-direction:column;align-items:flex-start;padding:clamp(24px,4vh,44px) clamp(20px,2.4cqw,36px) 32px}',
    '.bs-rec .bs-hint{font-size:15px;max-width:30ch;text-wrap:pretty}',
    '.bs-rec .bs-timer{font-size:clamp(72px,min(8.4cqw,15vh),136px);margin:clamp(14px,2.6vh,28px) 0 clamp(14px,2.4vh,24px)}',
    '.bs-rec .bs-wave{justify-content:flex-start;width:100%;max-width:300px;height:clamp(28px,5vh,44px)}',
    '.bs-rec .wd{font-family:var(--mono,monospace);font-size:13px;color:var(--b-sec);font-variant-numeric:tabular-nums;margin-top:12px}',
    '.bs-rec .wd b{color:var(--texte,#111);font-weight:700}',
    '.bs-rec .acts{display:flex;align-items:center;gap:8px;margin-top:clamp(20px,3.5vh,32px);flex-wrap:wrap}',
    '.bs-rec .acts .b1{min-width:170px}',
    '.bs-rec .tip{margin:clamp(20px,3.5vh,32px) 0 0;padding-top:14px;border-top:1px solid var(--b-fil);font-size:13px;line-height:1.5;color:var(--b-sec);max-width:34ch}',
    '.bs-rec .tip b{color:var(--texte,#111);font-weight:700}',
    '.bs-feed{border-left:1px solid var(--b-fil);padding:clamp(24px,4vh,44px) clamp(20px,2.6cqw,40px) 64px;min-height:calc(100vh - 53px)}',
    '.bs-fhd{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 16px}',
    '.bs-fhd h3{margin:0;font-size:17px;font-weight:900;font-stretch:88%;letter-spacing:-.01em}',
    '.bs-fl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}',
    '.bs-fi{position:relative;background:var(--surface,#fff);border-radius:var(--b-r);box-shadow:inset 0 0 0 1px var(--b-fil);padding:14px 16px 15px;transition:box-shadow .18s var(--b-ease),transform .18s var(--b-ease),background .18s var(--b-ease),opacity .24s var(--b-ease)}',
    '.bs-fi:hover{box-shadow:inset 0 0 0 1px var(--b-ff),0 4px 14px -6px color-mix(in srgb,var(--texte,#111) 22%,transparent);transform:translateY(-1px)}',
    '.bs-fi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:transparent;transition:background .24s var(--b-ease)}',
    '.bs-fi[data-s="open"]::before{background:var(--b-bl)}',
    '.bs-fi[data-s="answered"]::before{background:var(--b-vt)}',
    '.bs-fi[data-s="dismissed"]{opacity:.62;background:transparent}',
    '.bs-fi[data-s="dismissed"]:hover{opacity:.9}',
    '.bs-fi.new{animation:cbwbFeed .24s var(--b-out) both}',
    '@keyframes cbwbFeed{from{opacity:0;transform:translateY(-8px)}}',
    '.bs-fi.chg::before{animation:cbwbFlash .5s var(--b-out)}',
    '@keyframes cbwbFlash{from{width:100%;opacity:.18}}',
    '.bs-fi .fh{display:flex;align-items:center;gap:8px;min-height:20px}',
    '.bs-fi .tl{width:20px;height:20px;display:grid;place-items:center;flex:none;font-family:var(--mono,monospace);font-size:11px;font-weight:700;background:var(--b-bl);color:var(--sur-bleu,#fff);transition:background .24s,color .24s}',
    '.bs-fi[data-s="answered"] .tl{background:var(--b-vt);color:var(--sur-vert,#1E1E1C)}',
    '.bs-fi[data-s="dismissed"] .tl{background:var(--b-f3);color:var(--b-sec)}',
    '.bs-fi .fh .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4}',
    '.bs-bdg.ia{color:var(--focus,#2B3BFF)}',
    '.bs-fi .fh .tm{flex:none;font-family:var(--mono,monospace);font-size:11px;color:var(--b-t3);font-variant-numeric:tabular-nums}',
    '.bs-fi .fq{margin:8px 0 0;font-size:16px;font-weight:700;line-height:1.35;letter-spacing:-.005em;text-wrap:pretty}',
    '.bs-fi[data-s="answered"] .fq{font-weight:600;color:var(--b-sec);font-size:15px}',
    '.bs-fi[data-s="dismissed"] .fq{font-weight:500;color:var(--b-sec);font-size:15px;text-decoration:line-through;text-decoration-color:var(--b-ff)}',
    '.bs-fi .fa{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;font-size:15px;font-weight:600;line-height:1.45}',
    '.bs-fi .fa .ck{color:var(--vert-pt,#15803D);margin-top:3px}',
    '.bs-fi .fc{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;align-items:center}',
    '.bs-fs{appearance:none;font:inherit;font-weight:700;font-size:13px;min-height:32px;padding:0 12px;border:0;border-radius:2px;background:var(--surface,#fff);color:var(--texte,#111);box-shadow:inset 0 0 0 1px var(--b-ff);cursor:pointer;transition:background .15s var(--b-ease),box-shadow .15s var(--b-ease),transform .15s var(--b-ease)}',
    '.bs-fs:hover{background:var(--b-f2);box-shadow:inset 0 0 0 1px var(--texte,#111);transform:translateY(-1px)}',
    '.bs-fs:active{transform:scale(.97)}',
    '.bs-fi .fc .sp{flex:1}',
    '.bs-fi .fc .bt{min-height:32px;font-size:12.5px;color:var(--b-t3)}',
    '.bs-fi .hint{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--b-fil);font-family:var(--mono,monospace);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--b-t3)}',
    '.bs-fi .hint i{width:7px;height:7px;border-radius:50%;background:var(--b-or);flex:none;animation:cbwbBreath 1.6s ease-in-out infinite}',
    '@keyframes cbwbBreath{50%{opacity:.3}}',
    '.bs-fempty{display:flex;gap:14px;align-items:flex-start;padding:18px;border-radius:var(--b-r);background:var(--b-f2);color:var(--b-sec);font-size:14px;line-height:1.5}',
    '.bs-fempty b{display:block;color:var(--texte,#111);font-weight:800;font-size:15px;margin-bottom:2px}',
    '.bs-fempty .dots{display:flex;gap:4px;margin-top:6px}.bs-fempty .dots i{width:6px;height:6px;background:var(--b-bl);animation:cbwbBreath 1.2s ease-in-out infinite}.bs-fempty .dots i:nth-child(2){animation-delay:.2s}.bs-fempty .dots i:nth-child(3){animation-delay:.4s}',
    '.bs-live .bs-side{padding:clamp(24px,4vh,44px) clamp(18px,2cqw,28px) 40px;align-self:stretch}',
    '.bs-live .bs-side .in-st{top:85px}',
    '@container cbwb (max-width:1180px){.bs-lg{grid-template-columns:minmax(0,1fr) clamp(280px,32cqw,360px)}.bs-rec{position:static;grid-column:1 / -1;flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:28px;padding-bottom:20px;border-bottom:1px solid var(--b-fil)}.bs-rec .bs-hint,.bs-rec .tip{display:none}.bs-rec .bs-timer{margin:0;font-size:72px}.bs-rec .acts{margin-top:0}.bs-feed{border-left:0;min-height:0}}',
    '@container cbwb (max-width:760px){.bs-lg{grid-template-columns:1fr}.bs-live .bs-side{border-left:0;border-top:1px solid var(--b-fil)}.bs-live .bs-side .in-st{position:static}.bs-ltop .keys .k2{display:none}}',

    /* ---- survols (cohérents, 120–240 ms) ---- */
    '.cbwb .b2:not(:disabled):hover{transform:translateY(-1px)}',
    '.cbwb .b2:not(:disabled):active{transform:scale(.98)}',
    '.bs-sg:hover{transform:translateY(-1px)}',
    '.bs-row .t{transition:transform .2s var(--b-ease)}',
    '.bs-row .ic{transition:background .18s var(--b-ease),color .18s var(--b-ease)}',
    '.bs-row:hover .ic{color:var(--texte,#111)}',
    '.bs-row:hover .t{transform:translateX(3px)}',
    '.bs-row .go{flex:none;width:16px;color:var(--b-sec);opacity:0;transform:translateX(-6px);transition:opacity .18s var(--b-ease),transform .2s var(--b-ease)}',
    '.bs-row:hover .go,.bs-row:focus-visible .go{opacity:1;transform:none}',
    '.bs-steps li::before{transition:width .24s var(--b-ease)}',
    '.bs-steps li:hover::before{width:72px}',
    '.bs-slot:hover{background:var(--b-f2)}',
    '.bs-slot:hover .tl{transform:scale(1.06)}',
    '.bs-slot .tl{transition:background .32s var(--b-ease),color .32s,transform .18s var(--b-ease)}',
    '.bs-dt summary .pl{transition:transform var(--d-moyen,.35s) var(--b-ease),background .18s,color .18s}',
    '.bs-dt summary:hover .pl{background:var(--b-f3);color:var(--texte,#111)}',
    '.bs-dt summary{transition:color .18s}.bs-dt summary:hover{color:var(--texte,#111)}',
    '.bs-qal li{transition:background .18s var(--b-ease);padding-left:6px;padding-right:6px;margin:0 -6px}',
    '.bs-qal li:hover{background:var(--b-f2)}',
    '.bs-qal span.td{color:color-mix(in srgb,var(--b-or) 78%,var(--texte,#111));font-style:normal;font-family:var(--mono,monospace);font-size:11px;letter-spacing:.06em;text-transform:uppercase}',
    '.bs-chip{transition:background .32s var(--b-ease),color .32s var(--b-ease),box-shadow .32s var(--b-ease),transform .15s var(--b-ease)}',
    '.bs-chip:hover{transform:translateY(-1px)}',
    '.bs-bar .bi:hover svg{transform:translateX(-2px)}.bs-bar .bi svg{transition:transform .18s var(--b-ease)}',
    '.bs-steps2 button{transition:background .25s,transform .15s var(--b-ease)}',
    '.bs-err .b2:hover,.bs-ra .b2:hover{transform:translateY(-1px)}',
    '@media (prefers-reduced-motion:reduce){.cbwb *,.cbwb,.cbwb-scrim,.cbwb-dlg,.cbwb-toast{animation:none!important;transition:none!important}.cbwb .shim{color:var(--texte,#111);background:none}.cbwb .b1::before{display:none}.cbwb .b2:hover,.bs-sg:hover,.bs-fi:hover,.bs-fs:hover,.bs-chip:hover,.bs-row:hover .t,.bs-slot:hover .tl{transform:none!important}.cbwb .ck path{stroke-dashoffset:0}.bs-sk::after{display:none}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('cbwb-css')) return;
    var s = document.createElement('style');
    s.id = 'cbwb-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- icons (static SVG, no user data) ---------- */
  function svg(d, s) { return '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    spark: svg('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5"/>'),
    back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    copy: svg('<path d="M8 8h12v12H8z"/><path d="M16 8V4H4v12h4"/>', 16),
    folder: svg('<path d="M3 6h7l2 2h9v11H3z"/>', 16),
    redo: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>', 16),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
    alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>'),
    check: '<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- helpers (mêmes conventions que notes.js) ---------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var NF = new Intl.NumberFormat('fr-FR');
  function num(n) { return NF.format(Math.max(0, Math.round(n || 0))); }
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
  function when(iso) {
    var d = new Date(iso); if (isNaN(d)) return '—';
    var now = new Date(), k = function (x) { return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(); };
    var y = new Date(now.getTime() - 864e5);
    if (k(d) === k(now)) return 'Aujourd’hui · ' + hm(d);
    if (k(d) === k(y)) return 'Hier · ' + hm(d);
    return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '') + ' · ' + hm(d);
  }
  function wordCount(s) { return String(s || '').split(/\s+/).filter(Boolean).length; }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function store(k, v) {
    try { if (v === undefined) return window.localStorage.getItem(k); window.localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }

  /* ---------- CRAFT+ ---------- */
  var SLOTS = [
    { k: 'contexte', l: 'C', n: 'Contexte', h: 'Le projet, ce qui existe, pourquoi maintenant' },
    { k: 'role', l: 'R', n: 'Rôle', h: 'L’expert que l’IA doit incarner' },
    { k: 'action', l: 'A', n: 'Action', h: 'La tâche précise et le livrable' },
    { k: 'format', l: 'F', n: 'Format', h: 'Forme, structure, longueur de la réponse' },
    { k: 'cible', l: 'T', n: 'Cible & ton', h: 'Pour qui, quel niveau, quel registre' },
    { k: 'contraintes', l: '+', n: 'Contraintes', h: 'À faire, à éviter, stack imposée' },
    { k: 'criteres', l: '+', n: 'Critères', h: '« C’est réussi si… »' },
    { k: 'exemples', l: '+', n: 'Exemples', h: 'Modèles, références, données' }
  ];
  var SLOT = {}; SLOTS.forEach(function (s) { SLOT[s.k] = s; });
  var ST_LBL = { ok: 'OK', partiel: 'Partiel', vide: 'Vide' };
  var TARGET = { 'claude-code': 'Claude Code', cursor: 'Cursor' };
  function tgName(t) { return TARGET[t] || TARGET['claude-code']; }
  function other(t) { return t === 'cursor' ? 'claude-code' : 'cursor'; }
  function slotOf(b, k) { var s = b && b.slots && b.slots[k]; return s && typeof s === 'object' ? s : { value: '', status: 'vide' }; }
  function stOf(b, k) { var s = slotOf(b, k).status; return s === 'ok' || s === 'partiel' ? s : 'vide'; }
  function okCount(b) { return SLOTS.filter(function (s) { return stOf(b, s.k) === 'ok'; }).length; }
  function hasSlots(b) { return !!(b && b.slots && Object.keys(b.slots).length); }

  function chipsHTML(b, mode, cls) {
    // mode 'wait' : grises (avant analyse) ; sinon état réel
    return '<div class="bs-chips' + (cls ? ' ' + cls : '') + '" role="list" aria-label="Cases CRAFT+">' + SLOTS.map(function (s) {
      var stt = mode === 'wait' || !b || !b.slots || !b.slots[s.k] ? 'wait' : stOf(b, s.k);
      var txt = s.l === '+' ? s.n : s.l;
      return '<span class="bs-chip' + (s.l === '+' ? '' : ' l') + '" role="listitem" data-k="' + s.k + '" data-s="' + stt + '" title="' + esc(s.n + (stt === 'wait' ? '' : ' · ' + ST_LBL[stt])) + '" aria-label="' + esc(s.n + ' : ' + (stt === 'wait' ? 'en attente' : ST_LBL[stt])) + '">' + esc(txt) + '</span>';
    }).join('') + '</div>';
  }
  function slotsHTML(b, cur) {
    return '<ol class="bs-slots">' + SLOTS.map(function (s) {
      var o = slotOf(b, s.k), stt = stOf(b, s.k), v = String(o.value || '').trim();
      return '<li class="bs-slot' + (cur === s.k ? ' cur' : '') + '" data-k="' + s.k + '" data-s="' + stt + '">' +
        '<span class="tl" aria-hidden="true">' + esc(s.l) + '</span><span class="nm">' + esc(s.n) + '</span>' +
        '<span class="stt">' + (cur === s.k ? 'Question en cours' : esc(ST_LBL[stt])) + '</span>' +
        '<span class="vl">' + (v ? esc(v) : esc(s.h)) + '</span></li>';
    }).join('') + '</ol>';
  }

  /* ---------- master prompt : vue source (Markdown teinté) et vue lecture ---------- */
  function srcHTML(md) {
    var inFence = false;
    return String(md || '').replace(/\r\n?/g, '\n').split('\n').map(function (ln) {
      if (/^\s*```/.test(ln)) { inFence = !inFence; return '<span class="d">' + esc(ln) + '</span>'; }
      if (inFence) return '<span class="q">' + esc(ln) + '</span>';
      var m;
      if ((m = /^(#{1,6})(\s.*)$/.exec(ln))) return '<span class="h' + (m[1].length === 1 ? ' h1' : '') + '"><span class="d">' + esc(m[1]) + '</span>' + esc(m[2]) + '</span>';
      if (/^\s*<\/?[A-Za-z_][\w.-]*(\s[^>]*)?>\s*$/.test(ln)) return '<span class="x">' + esc(ln) + '</span>';
      if ((m = /^(\s*)([-*+]|\d+[.)])(\s.*)$/.exec(ln))) return esc(m[1]) + '<span class="m">' + esc(m[2]) + '</span>' + tint(m[3]);
      if ((m = /^(\s*>)(.*)$/.exec(ln))) return '<span class="q">' + esc(m[1] + m[2]) + '</span>';
      return tint(ln);
    }).join('\n');
  }
  function tint(s) { // **gras** et <balises> en ligne, sur texte échappé
    return esc(s).replace(/\*\*([^*]+?)\*\*/g, '<span class="d">**</span><span class="h">$1</span><span class="d">**</span>')
      .replace(/&lt;\/?[A-Za-z_][\w.-]*&gt;/g, function (t) { return '<span class="x">' + t + '</span>'; });
  }
  function inline(src) {
    return String(src).split(/(`[^`]+`)/).map(function (part) {
      if (/^`[^`]+`$/.test(part)) return '<code>' + esc(part.slice(1, -1)) + '</code>';
      return esc(part).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    }).join('');
  }
  function readHTML(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n'), out = [], para = [], list = null;
    function fp() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    function fl() { if (list) { out.push('</' + list + '>'); list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], m;
      if (/^\s*```/.test(ln)) { fp(); fl(); var buf = []; for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) buf.push(lines[i]); out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue; }
      if (!ln.trim()) { fp(); fl(); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) { fp(); fl(); var lv = Math.min(3, m[1].length); out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>'); continue; }
      if (/^\s*<\/?[A-Za-z_][\w.-]*(\s[^>]*)?>\s*$/.test(ln)) { fp(); fl(); out.push('<span class="xt">' + esc(ln.trim()) + '</span>'); continue; }
      if ((m = /^\s*>\s?(.*)$/.exec(ln))) { fp(); fl(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
      if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(ln))) {
        fp(); var t = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (list !== t) { fl(); out.push('<' + t + '>'); list = t; }
        out.push('<li>' + inline(m[2]) + '</li>'); continue;
      }
      fl(); para.push(ln.trim());
    }
    fp(); fl();
    return out.join('\n');
  }

  /* ---------- fan-out des abonnements (le pont n'a pas de désabonnement) ---------- */
  var subs = typeof WeakMap === 'function' ? new WeakMap() : null;
  function subscribe(api, method, fn) {
    if (!api || typeof api[method] !== 'function' || !subs) return function () {};
    var per = subs.get(api); if (!per) { per = {}; subs.set(api, per); }
    var set = per[method];
    if (!set) {
      set = per[method] = new Set();
      try { api[method](function (p) { set.forEach(function (f) { try { f(p); } catch (e) { console.error(e); } }); }); } catch (e) { console.error(e); }
    }
    set.add(fn);
    return function () { set.delete(fn); };
  }

  /* ---------- mount ---------- */
  function mount(container, opts) {
    injectCSS();
    opts = opts || {};
    var api = opts.api || null;
    var navigate = typeof opts.navigate === 'function' ? opts.navigate : function () {};
    function has(m) { return !!(api && typeof api[m] === 'function'); }
    var CORE = has('startBrainstorm') && has('onBrainstorm');

    var root = document.createElement('div');
    root.className = 'cbwb bs';
    container.innerHTML = '';
    container.appendChild(root);

    // view: 'home' | 'record' | 'analyze' | 'questions' | 'compile' | 'result' | 'error'
    var st = { view: 'home', list: null, listErr: null, b: null, target: store('cbw.bs.target') === 'cursor' ? 'cursor' : 'claude-code',
      tm: { elapsedMs: 0, words: 0, level: null, at: 0, running: false }, qi: -1, drafts: {}, mic: '', src: store('cbw.bs.src') !== 'read',
      alive: true, busy: false, fillAt: 0, lastQ: null, starting: false };
    var tick = 0, raf = 0, toastT = 0, modal = null, lastNav = '', fillT = [], holdT = 0;

    function go(hash) { if (hash !== lastNav) { lastNav = hash; try { navigate(hash); } catch (e) { console.error(e); } } }
    function call(m) {
      var args = [].slice.call(arguments, 1);
      if (!has(m)) return Promise.reject(new Error('Méthode indisponible : ' + m));
      try { return Promise.resolve(api[m].apply(api, args)); } catch (e) { return Promise.reject(e); }
    }
    function errMsg(e) { return (e && e.message) || String(e); }
    function $(sel) { return root.querySelector(sel); }
    function stopLoops() { clearInterval(tick); tick = 0; cancelAnimationFrame(raf); raf = 0; }
    function clearFill() { fillT.forEach(clearTimeout); fillT = []; }

    /* ---- toast ---- */
    function toast(msg, isErr) {
      var old = document.querySelector('.cbwb-toast'); if (old) old.remove();
      var t = document.createElement('div');
      t.className = 'cbwb cbwb-toast' + (isErr ? ' err' : '');
      t.setAttribute('role', 'status');
      t.innerHTML = '<span class="pst"></span>' + esc(msg);
      document.body.appendChild(t);
      clearTimeout(toastT);
      toastT = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }, isErr ? 3200 : 2200);
    }
    /* ---- modal (in-page, jamais confirm()) ---- */
    function confirmModal(o) {
      closeModal(false);
      return new Promise(function (resolve) {
        var prev = document.activeElement;
        var sc = document.createElement('div');
        sc.className = 'cbwb cbwb-scrim';
        sc.innerHTML = '<div class="cbwb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="cbwb-dt" aria-describedby="cbwb-dd">' +
          '<div class="lbl">' + esc(o.label || 'Confirmation') + '</div>' +
          '<h2 id="cbwb-dt">' + esc(o.title) + '</h2><p id="cbwb-dd">' + esc(o.body) + '</p>' +
          '<div class="ft"><button class="btn b2 lg" data-m="no">' + esc(o.no || 'Annuler') + '</button>' +
          '<button class="btn b1 lg' + (o.danger ? ' bdanger' : '') + '" data-m="yes">' + esc(o.yes) + '</button></div></div>';
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

    /* ================= vues ================= */
    function setView(v, force) {
      var changed = v !== st.view;
      if (!changed && !force) return;
      st.view = v; stopLoops(); clearFill();
      root.setAttribute('data-view', v);
      if (v === 'home') renderHome();
      else if (v === 'record') renderRecord();
      else if (v === 'analyze') renderAnalyze();
      else if (v === 'questions') renderQuestions(true);
      else if (v === 'compile' || v === 'result') renderResult();
      else if (v === 'error') renderError();
      if (changed) { var sc = root.closest('.main') || document.scrollingElement; if (sc && (v === 'home' || changed)) sc.scrollTop = 0; }
    }

    /* ---- accueil ---- */
    function segHTML(sm) {
      return '<div class="bs-seg' + (sm ? ' sm' : '') + '" role="radiogroup" aria-label="Cible du master prompt" data-v="' + st.target + '"><span class="th" aria-hidden="true"></span>' +
        ['claude-code', 'cursor'].map(function (t) { return '<button type="button" role="radio" data-act="target" data-t="' + t + '" aria-checked="' + (st.target === t) + '" tabindex="' + (st.target === t ? 0 : -1) + '">' + tgName(t) + '</button>'; }).join('') + '</div>';
    }
    function renderHome() {
      root.innerHTML = '<section class="bs-view bs-pad" aria-labelledby="bs-h"><div class="bs-col">' +
        '<header class="bs-hd in"><div><h1 id="bs-h">Brainstorm</h1>' +
        '<p class="bs-lede">Raconte ton projet à voix haute. Pendant que tu parles, CBW repère ce qui reste flou et te pose de petites questions ; à la fin, il écrit le master prompt pour Claude Code ou Cursor.</p></div></header>' +
        (CORE ? '<section class="bs-start in2" aria-label="Nouveau brainstorm"><ol class="bs-steps">' +
          '<li style="--c:var(--b-or)"><span class="lbl">01 · Vidage</span><b>Parle librement</b><span>Le projet, le contexte, ce que tu veux obtenir. 1 à 10 min, rien n’est collé.</span></li>' +
          '<li style="--c:var(--b-bl)"><span class="lbl">02 · En direct</span><b>De petites questions, au fil de l’eau</b><span>Elles apparaissent en bas à droite de l’écran. Réponds simplement à l’oral, comme dans une conversation.</span></li>' +
          '<li style="--c:var(--b-vt)"><span class="lbl">03 · Master prompt</span><b>Prêt à coller</b><span>Structuré en CRAFT+, enregistré dans Documents › CBW AI › Prompts.</span></li></ol>' +
          '<div class="bs-go"><div class="tg"><span class="lbl">Pour</span>' + segHTML() + '</div>' +
          '<button class="btn b1 lg" data-act="start"><span class="dot" aria-hidden="true"></span>Démarrer le brainstorm<span class="ar" aria-hidden="true">→</span></button></div></section>'
          : '<div class="bs-off in2"><b>Indisponible.</b> Le brainstorm n’est pas disponible dans cette version de CBW AI. Mets l’application à jour pour l’utiliser.</div>') +
        '<div class="bs-past in3"><h2>Sessions</h2><span class="lbl" data-r="count"></span></div>' +
        '<div data-r="list" class="in3"></div></div></section>';
      renderList();
    }
    function badge(s) {
      if (s === 'done') return '<span class="bs-bdg ok">Prompt prêt</span>';
      if (s === 'questions') return '<span class="bs-bdg ia">Questions en cours</span>';
      if (s === 'analyzing' || s === 'compiling') return '<span class="bs-bdg ia">IA en cours</span>';
      if (s === 'recording') return '<span class="bs-bdg live">Vidage en cours</span>';
      if (s === 'error') return '<span class="bs-bdg err">Erreur</span>';
      return '<span class="bs-bdg">' + esc(s || '—') + '</span>';
    }
    function renderList() {
      var el = $('[data-r="list"]'); if (!el) return;
      var c = $('[data-r="count"]');
      if (!has('listBrainstorms')) { el.innerHTML = '<div class="bs-none">Aucune session.</div>'; return; }
      if (st.listErr) { el.innerHTML = '<div class="bs-none">Impossible de lire tes sessions : ' + esc(st.listErr) + ' <button class="btn b3" data-act="reload">Réessayer</button></div>'; return; }
      if (!st.list) { el.innerHTML = '<div class="bs-none lbl">Chargement…</div>'; return; }
      if (c) c.textContent = st.list.length ? st.list.length + ' session' + (st.list.length > 1 ? 's' : '') : '';
      if (!st.list.length) {
        el.innerHTML = '<div class="bs-zero"><span class="ic">' + I.spark + '</span><div><b>Aucun brainstorm pour l’instant</b>' +
          '<span>Ton premier master prompt t’attend : une idée floue suffit pour commencer.</span></div></div>';
        return;
      }
      el.innerHTML = '<ul class="bs-rows">' + st.list.map(function (x) {
        return '<li><button class="bs-row" data-act="open" data-id="' + esc(x.id) + '"><span class="ic">' + I.spark + '</span>' +
          '<span class="tx"><span class="t">' + esc(x.title || 'Brainstorm sans titre') + '</span>' +
          '<span class="s">' + esc(when(x.createdAt)) + (x.target ? ' · ' + esc(tgName(x.target)) : '') + '</span></span>' + badge(x.state) + '<span class="go" aria-hidden="true">→</span></button></li>';
      }).join('') + '</ul>';
    }
    function loadList() {
      if (!has('listBrainstorms')) { st.list = []; renderList(); return Promise.resolve(); }
      return call('listBrainstorms').then(function (l) {
        st.listErr = null;
        st.list = (Array.isArray(l) ? l : []).slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }, function (e) { st.listErr = errMsg(e); }).then(function () { if (st.alive && st.view === 'home') renderList(); });
    }

    /* ---- vidage (mode focus) ---- */
    function elapsed() { var t = st.tm; return (t.elapsedMs || 0) + (t.running ? Math.min(1500, performance.now() - t.at) : 0); }
    var WAVE = 36;
    function renderRecord() {
      var bars = ''; for (var i = 0; i < WAVE; i++) bars += '<i></i>';
      var tg = (st.b && st.b.target) || st.target;
      st.feedSig = null; st.slotSig = '';
      root.innerHTML = '<section class="bs-view bs-live" aria-label="Brainstorm · conversation en direct">' +
        '<div class="bs-ltop"><span class="lbl st"><span class="pst"></span>Brainstorm · en direct · rien n’est collé</span>' +
        '<span class="keys"><span class="lbl">Pour ' + esc(tgName(tg)) + '</span><span class="k2"><kbd>Échap</kbd> annuler</span></span></div>' +
        '<div class="bs-lg">' +
        '<div class="bs-rec">' +
        '<p class="bs-hint in">Parle librement : le projet, le contexte, ce que tu veux obtenir… <em>CBW range au fil de l’eau.</em></p>' +
        '<div class="bs-timer" data-s="tm" role="timer" aria-label="Durée"></div>' +
        '<div class="bs-wave" aria-hidden="true">' + bars + '</div>' +
        '<div class="wd" data-s="wd" aria-live="off"></div>' +
        '<div class="acts"><button class="btn b1 lg" data-act="stop"' + (has('stopBrainstorm') ? '' : ' disabled') + '>Terminer <span class="ar">→</span></button>' +
        '<button class="btn b3 lg" data-act="cancel"' + (has('cancelBrainstorm') ? '' : ' disabled') + '>Annuler</button></div>' +
        '<p class="tip in3"><b>Réponds en parlant.</b> Les questions s’affichent aussi en bas à droite de l’écran : pas besoin de revenir ici.</p>' +
        '</div>' +
        '<section class="bs-feed" aria-label="Conversation"><div class="bs-fhd"><h3>Conversation</h3><span class="lbl" data-r="fcount"></span></div>' +
        '<ol class="bs-fl" data-r="feed" aria-live="polite"></ol></section>' +
        '<aside class="bs-side" aria-label="Cases CRAFT+"><div class="in-st" data-r="grid"></div></aside>' +
        '</div></section>';
      updateRecord();
      updateLive();
      tick = setInterval(updateRecord, 250);
      animWave();
      setTimeout(function () { var s = $('[data-act="stop"]'); if (s && st.view === 'record') s.focus({ preventScroll: true }); }, 60);
    }
    /* ---- conversation en direct (fil + grille) ---- */
    function lives(b) { return (b && Array.isArray(b.live)) ? b.live : []; }
    var LST = { open: ['ia', 'À toi'], answered: ['ok', 'Répondu'], dismissed: ['', 'Ignorée'] };
    function t0Of(b) { var t = b && Date.parse(b.createdAt); return isNaN(t) ? 0 : t; }
    function fiHTML(q, newest) {
      var s = SLOT[q.slot] || { l: '?', n: q.slot || 'Question' }, stt = LST[q.state] ? q.state : 'open';
      var t0 = t0Of(st.b), at = q.askedAt && t0 && q.askedAt >= t0 ? clock(q.askedAt - t0) : '';
      var sug = Array.isArray(q.suggestions) ? q.suggestions.slice(0, 3) : [];
      return '<div class="fh"><span class="tl" aria-hidden="true">' + esc(s.l) + '</span><span class="lbl">' + esc(s.n) + '</span>' +
        (at ? '<span class="tm">' + esc(at) + '</span>' : '') + '<span class="bs-bdg ' + LST[stt][0] + '">' + LST[stt][1] + '</span></div>' +
        '<p class="fq">' + esc(q.question) + '</p>' +
        (stt === 'answered' ? '<p class="fa">' + I.check + '<span>' + esc(q.answer || 'Répondu') + '</span></p>' : '') +
        (stt === 'open' ? '<div class="fc">' + sug.map(function (x, i) {
          return '<button type="button" class="bs-fs" data-act="lans" data-q="' + esc(q.id) + '" data-i="' + i + '">' + esc(x) + '</button>';
        }).join('') + '<span class="sp"></span><button type="button" class="btn bt" data-act="ldis" data-q="' + esc(q.id) + '" title="Ignorer cette question">Ignorer</button></div>' +
          (newest ? '<div class="hint"><i aria-hidden="true"></i>Réponds en parlant</div>' : '') : '');
    }
    function updateLive() {
      var b = st.b; if (st.view !== 'record') return;
      // grille : seulement si les cases ont changé
      var sig = JSON.stringify((b && b.slots) || {});
      if (sig !== st.slotSig || !$('[data-r="grid"] .bs-slots')) {
        st.slotSig = sig; renderGrid(null);
        var gn = $('[data-r="grid"] .bs-gnote'); if (gn) gn.textContent = 'Les cases se remplissent pendant que tu parles, avec tes mots. Celles qui restent vides deviendront des points ouverts.';
      }
      // fil : plus récente en haut ; on ne touche qu'aux éléments qui changent
      var fl = $('[data-r="feed"]'); if (!fl) return;
      var l = lives(b).slice().sort(function (x, y) { return (y.askedAt || 0) - (x.askedAt || 0); });
      var open = l.filter(function (q) { return q.state === 'open'; }), newest = open[0] ? open[0].id : '';
      var fsig = l.map(function (q) { return q.id + ':' + q.state + ':' + (q.answer || '') + (q.id === newest ? '*' : ''); }).join('|');
      if (st.feedSig != null && fsig === st.feedSig) return;
      var first = !st.feedSig; st.feedSig = fsig;
      var c = $('[data-r="fcount"]'), na = l.filter(function (q) { return q.state === 'answered'; }).length;
      if (c) c.textContent = l.length ? l.length + ' question' + (l.length > 1 ? 's' : '') + ' · ' + na + ' répondue' + (na > 1 ? 's' : '') : '';
      if (!l.length) {
        fl.innerHTML = '<li class="bs-fempty"><div><b>CBW écoute.</b>Dès qu’un point mérite d’être précisé, une petite question apparaît ici et en bas à droite de l’écran.<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div></div></li>';
        return;
      }
      var empty = fl.querySelector('.bs-fempty'); if (empty) empty.remove();
      var have = {}; [].forEach.call(fl.children, function (n) { have[n.getAttribute('data-id')] = n; });
      l.forEach(function (q, i) {
        var n = have[q.id], key = q.state + ':' + (q.answer || '') + (q.id === newest ? '*' : '');
        if (!n) {
          n = document.createElement('li'); n.className = 'bs-fi' + (first || reduced ? '' : ' new');
          n.setAttribute('data-id', q.id);
        } else delete have[q.id];
        if (n.getAttribute('data-k') !== key) {
          var was = n.getAttribute('data-s');
          n.setAttribute('data-k', key); n.setAttribute('data-s', q.state);
          n.innerHTML = fiHTML(q, q.id === newest);
          if (was && was !== q.state && !reduced) { n.classList.remove('chg'); void n.offsetWidth; n.classList.add('chg'); }
        }
        if (fl.children[i] !== n) fl.insertBefore(n, fl.children[i] || null);
      });
      Object.keys(have).forEach(function (k) { have[k].remove(); });
    }
    function liveAct(qid, ans) { // optimiste ; l'état suivant du pont confirme
      var b = st.b; if (!b) return;
      b.live = lives(b).map(function (q) { return q.id !== qid ? q : Object.assign({}, q, ans == null ? { state: 'dismissed' } : { state: 'answered', answer: ans }); });
      updateLive();
      var p = ans == null ? call('dismissLive', b.id, qid) : call('answerLive', b.id, qid, ans);
      p.catch(function (e) { toast(errMsg(e), true); });
    }
    function updateRecord() {
      var tm = $('[data-s="tm"]'), wd = $('[data-s="wd"]'); if (!tm) return;
      var txt = clock(elapsed()), html = txt.split(':').map(esc).join('<span class="c"></span>');
      if (tm.innerHTML !== html) { tm.innerHTML = html; tm.setAttribute('aria-label', 'Durée ' + txt); }
      var w = st.tm.words || 0, h = '<b>' + esc(num(w)) + '</b> mot' + (w > 1 ? 's' : '') + ' transcrits';
      if (wd.innerHTML !== h) wd.innerHTML = h;
    }
    function animWave() {
      var bars = [].slice.call(root.querySelectorAll('.bs-wave i'));
      var hist = []; for (var i = 0; i < WAVE; i++) hist.push(.06);
      var env = bars.map(function (_, i) { var x = (i - (WAVE - 1) / 2) / ((WAVE - 1) / 2); return .35 + .65 * Math.cos(x * Math.PI / 2); });
      if (reduced) { bars.forEach(function (b, i) { b.style.transform = 'scaleY(' + (.25 * env[i]).toFixed(3) + ')'; }); return; }
      var last = 0, sm = 0;
      function frame(t) {
        if (st.view !== 'record') return;
        if (t - last > 70) {
          last = t;
          var lv = typeof st.tm.level === 'number' ? Math.max(0, Math.min(1, st.tm.level)) : null;
          var target = lv != null ? .08 + lv * (.7 + .3 * Math.random()) : .1 + .12 * (1 + Math.sin(t / 420)) / 2;
          sm += (target - sm) * .6; hist.push(sm); hist.shift();
          for (var j = 0; j < WAVE; j++) {
            var d = Math.abs(j - (WAVE - 1) / 2), v = hist[WAVE - 1 - Math.min(WAVE - 1, Math.round(d * 2))];
            bars[j].style.transform = 'scaleY(' + Math.max(.06, Math.min(1, v * env[j])).toFixed(3) + ')';
          }
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    /* ---- analyse ---- */
    function renderAnalyze() {
      var b = st.b || {}, w = st.tm.words || wordCount(b.transcript);
      var again = b.questions && b.questions.length;
      root.innerHTML = '<section class="bs-view bs-fx ia" aria-label="Brainstorm · analyse" aria-busy="true">' +
        '<div class="top"><span class="lbl st"><span class="pst"></span>' + (again ? 'Analyse · nouvelle question' : 'Analyse · IA') + '</span>' +
        '<span class="keys"><span class="lbl">Pour ' + esc(tgName(b.target || st.target)) + '</span></span></div>' +
        '<div class="mid"><h2 class="bs-big shim in">Analyse…</h2>' +
        '<p class="sub in2">' + (again ? 'CBW relit tes réponses et cherche la case encore floue.' : 'CBW range ce que tu as dit dans les cases CRAFT+ et prépare les questions sur ce qui manque.') + '</p>' +
        '<div class="ind in2" role="progressbar" aria-label="Analyse en cours"><i></i></div>' +
        (w ? '<div class="wd in3"><b>' + esc(num(w)) + '</b> mots' + (st.tm.elapsedMs ? ' · ' + esc(clock(st.tm.elapsedMs)) : '') + '</div>' : '') + '</div>' +
        '<div class="bot"><div class="bs-chcap"><span class="lbl" data-s="cap">CRAFT+ · lecture du vidage</span></div><div data-r="chips">' + chipsHTML(null, 'wait', 'big') + '</div>' + legendHTML() + '</div>' +
        '</section>';
      fillChips();
    }
    function legendHTML() {
      return '<div class="bs-legend lbl" aria-hidden="true"><span><i style="background:var(--b-vt)"></i>OK</span><span><i style="background:var(--b-or)"></i>Partiel</span><span><i style="background:var(--b-f3)"></i>Vide</span></div>';
    }
    // Les cases s'allument une à une (même si le pont pousse tout d'un coup).
    function fillChips(done) {
      var wrap = $('[data-r="chips"]'); if (!wrap) { if (done) done(); return; }
      var b = st.b; clearFill();
      var chips = [].slice.call(wrap.querySelectorAll('.bs-chip')), n = 0, lit = 0;
      chips.forEach(function (c) {
        var k = c.getAttribute('data-k');
        if (!b || !b.slots || !b.slots[k]) return;
        var s = stOf(b, k);
        if (c.getAttribute('data-s') === s) { lit++; return; }
        var d = reduced ? 0 : 140 * n++;
        fillT.push(setTimeout(function () { c.setAttribute('data-s', s); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); c.title = SLOT[k].n + ' · ' + ST_LBL[s]; c.setAttribute('aria-label', SLOT[k].n + ' : ' + ST_LBL[s]); }, d));
        lit++;
      });
      var cap = $('[data-s="cap"]');
      if (cap && lit) cap.textContent = 'CRAFT+ · ' + okCount(b) + ' / 8 cases complètes';
      if (done) fillT.push(setTimeout(done, (reduced ? 0 : 140 * n) + (reduced ? 200 : 700)));
    }

    /* ---- questions ---- */
    function qs() { return (st.b && Array.isArray(st.b.questions)) ? st.b.questions : []; }
    function answered(q) { var a = st.b && st.b.answers; return !!(a && Object.prototype.hasOwnProperty.call(a, q.id)); }
    function firstOpen() { var l = qs(); for (var i = 0; i < l.length; i++) if (!answered(l[i])) return i; return l.length; }
    function maxQ() { return 6; }
    function canMore() { return has('askMore') && qs().length < maxQ(); }
    function barHTML(extra) {
      var b = st.b || {};
      return '<div class="bs-bar"><button class="btn bi" data-act="home" aria-label="Retour aux sessions" title="Sessions">' + I.back + '</button>' +
        '<span class="ttl">' + esc(b.title || 'Nouveau brainstorm') + '</span><span class="bs-bdg">' + esc(tgName(b.target)) + '</span>' +
        '<span class="sp"></span>' + (extra || '') + '</div>';
    }
    function renderQuestions(full) {
      var b = st.b; if (!b) return;
      var l = qs();
      if (st.qi < 0 || st.qi > l.length) st.qi = firstOpen();
      var q = l[st.qi] || null, key = q ? q.id : '__end' + l.length;
      if (full || !$('.bs-qw') || st.lastQ !== key) {
        st.lastQ = key;
        root.innerHTML = '<section class="bs-view" aria-label="Brainstorm · questions">' +
          barHTML(q ? '<button class="btn bt" data-act="compile"' + (has('compileBrainstorm') ? '' : ' disabled') + ' title="Les cases encore floues deviendront des points ouverts">Générer maintenant</button>' : '') +
          '<div class="bs-qw"><div class="bs-qm"><div class="bs-qc" data-r="card">' + (q ? cardHTML(q) : endHTML()) + '</div></div>' +
          '<aside class="bs-side" aria-label="Cases CRAFT+"><div class="in-st" data-r="grid"></div></aside></div></section>';
        renderGrid(q ? q.slot : null);
        if (q) setTimeout(function () { var t = $('[data-r="ans"]'); if (t && st.view === 'questions') { t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); } }, reduced ? 0 : 80);
        else setTimeout(function () { var g = $('[data-act="compile"]'); if (g && st.view === 'questions') g.focus({ preventScroll: true }); }, 60);
      } else {
        renderGrid(q ? q.slot : null);
        var p = $('[data-r="steps"]'); if (p) p.innerHTML = stepsHTML();
      }
      syncMic();
    }
    function stepsHTML() {
      return qs().map(function (x, i) {
        var s = answered(x) ? (String(st.b.answers[x.id] || '').trim() ? 'ans' : 'skip') : 'todo';
        var can = i <= firstOpen() && i !== st.qi;
        return '<button type="button" data-act="goq" data-i="' + i + '" data-s="' + s + '"' + (i === st.qi ? ' aria-current="step"' : '') + (can ? '' : ' disabled') +
          ' aria-label="Question ' + (i + 1) + (s === 'ans' ? ', répondue' : s === 'skip' ? ', passée' : '') + '"></button>';
      }).join('');
    }
    function cardHTML(q) {
      var l = qs(), s = SLOT[q.slot] || { l: '?', n: q.slot }, sug = Array.isArray(q.suggestions) ? q.suggestions.slice(0, 3) : [];
      var draft = st.drafts[q.id] != null ? st.drafts[q.id] : (answered(q) ? String(st.b.answers[q.id] || '') : '');
      return '<div class="bs-prog in"><span class="lbl">Question ' + (st.qi + 1) + ' / ' + l.length + '</span><span class="bs-steps2" data-r="steps">' + stepsHTML() + '</span></div>' +
        '<div class="bs-vise lbl in"><span class="tile">' + esc(s.l) + '</span>Vise ' + esc(s.n) + '</div>' +
        '<h2 class="bs-qh in" id="bs-qt" style="margin-top:14px">' + esc(q.question) + '</h2>' +
        (q.why ? '<p class="bs-why in2"><span class="lbl">Pourquoi</span><span>' + esc(q.why) + '</span></p>' : '') +
        (sug.length ? '<div class="bs-sugg in2" role="group" aria-label="Suggestions">' + sug.map(function (x, i) {
          return '<button type="button" class="bs-sg" data-act="sug" data-i="' + i + '" aria-pressed="' + (draft.trim() === String(x).trim()) + '"><span class="n">' + (i + 1) + '</span>' + esc(x) + '</button>';
        }).join('') + '</div>' : '') +
        '<div class="bs-ans in3" data-r="mic"><textarea data-r="ans" data-act="ans" rows="3" aria-labelledby="bs-qt" placeholder="Réponds à la voix (Control gauche ×2) ou écris…" spellcheck="true">' + esc(draft) + '</textarea>' +
        '<span class="mic"><span class="lbl" data-r="micl"></span></span></div>' +
        '<div class="bs-qa in3"><button class="btn b1 lg" data-act="valid"' + (has('answerBrainstorm') ? '' : ' disabled') + '>Valider <span class="ar">→</span></button>' +
        '<button class="btn b3 lg" data-act="skip"' + (has('answerBrainstorm') ? '' : ' disabled') + '>Passer</button><span class="sp"></span>' +
        '<span class="kh"><kbd>↵</kbd> valider · <kbd>⇧↵</kbd> retour à la ligne</span></div>';
    }
    function endHTML() {
      var b = st.b, ok = okCount(b), open = 8 - ok, ans = qs().filter(function (q) { return String((b.answers || {})[q.id] || '').trim(); }).length;
      return '<div class="bs-end"><div class="bs-prog in"><span class="lbl">Questions terminées</span><span class="bs-steps2" data-r="steps">' + stepsHTML() + '</span></div>' +
        '<h2 class="bs-qh in">Prêt à écrire le master prompt.</h2>' +
        '<div class="bs-sum in2"><div><span class="lbl">Cases complètes</span><b>' + ok + '<small>/8</small></b></div>' +
        '<div><span class="lbl">Réponses</span><b>' + ans + '<small>/' + qs().length + '</small></b></div></div>' +
        '<p class="in2">' + (open ? (open > 1 ? 'Les ' + open + ' cases encore floues deviendront des « points ouverts » : ' : 'La case encore floue deviendra un « point ouvert » : ') + tgName(b.target) + ' te posera la question avant de commencer. Rien n’est inventé.' : 'Toutes les cases sont remplies. Rien n’est inventé : tout vient de ce que tu as dit.') + '</p>' +
        '<div class="bs-qa in3"><button class="btn b1 lg" data-act="compile"' + (has('compileBrainstorm') ? '' : ' disabled') + '>Générer le master prompt <span class="ar">→</span></button>' +
        (canMore() ? '<button class="btn b2 lg" data-act="more">Encore une question</button>' : '') +
        (qs().length ? '<button class="btn b3 lg" data-act="goq" data-i="0">Revoir mes réponses</button>' : '') + '</div></div>';
    }
    function renderGrid(cur) {
      var el = $('[data-r="grid"]'); if (!el) return;
      var b = st.b, prev = {};
      [].forEach.call(el.querySelectorAll('.bs-slot'), function (n) { prev[n.getAttribute('data-k')] = n.getAttribute('data-s'); });
      el.innerHTML = '<div class="bs-gh"><h3>CRAFT+</h3><span class="lbl">' + okCount(b) + ' / 8 OK</span></div>' + slotsHTML(b, cur) +
        '<p class="bs-gnote">Chaque case ne contient que ce que tu as dit. Les cases vides deviennent des points ouverts.</p>';
      [].forEach.call(el.querySelectorAll('.bs-slot'), function (n) { var k = n.getAttribute('data-k'); if (prev[k] && prev[k] !== n.getAttribute('data-s')) n.classList.add('pop'); });
    }
    function goQ(i) {
      var l = qs(); if (i < 0 || i > l.length) return;
      saveDraft(); st.qi = i; renderQuestions();
    }
    function saveDraft() { var t = $('[data-r="ans"]'), q = qs()[st.qi]; if (t && q) st.drafts[q.id] = t.value; }
    function submit(skip) {
      var q = qs()[st.qi]; if (!q || !st.b) return;
      var t = $('[data-r="ans"]'), v = skip ? '' : String(t ? t.value : '').trim();
      if (!skip && !v) { if (t) { t.focus(); t.placeholder = 'Écris ou dicte une réponse, ou « Passer ».'; } return; }
      var id = st.b.id;
      st.b.answers = Object.assign({}, st.b.answers); st.b.answers[q.id] = v; delete st.drafts[q.id];
      // optimiste : la case visée passe au moins en « partiel » jusqu'au prochain état du pont
      if (v && st.b.slots && stOf(st.b, q.slot) === 'vide') { st.b.slots = Object.assign({}, st.b.slots); st.b.slots[q.slot] = Object.assign({}, slotOf(st.b, q.slot), { status: 'partiel', value: v }); }
      var nx = firstOpen(); st.qi = nx > st.qi ? nx : Math.min(qs().length, st.qi + 1);
      if (st.qi < qs().length && answered(qs()[st.qi])) st.qi = firstOpen();
      renderQuestions();
      call('answerBrainstorm', id, q.id, v).catch(function (e) { toast(errMsg(e), true); });
    }
    function syncMic() {
      var w = $('[data-r="mic"]'), l = $('[data-r="micl"]'); if (!w || !l) return;
      w.setAttribute('data-mic', st.mic);
      l.innerHTML = st.mic === 'rec' ? '<span class="pst"></span>Écoute… Control gauche pour finir' : st.mic === 'proc' ? '<span class="pst"></span>Transcription…' : '<span class="k"><kbd>Control gauche</kbd>×2 pour dicter</span>';
    }

    /* ---- compilation + résultat ---- */
    function busyLine(b) {
      var l = lives(b), na = l.filter(function (q) { return q.state === 'answered'; }).length, no = l.filter(function (q) { return q.state === 'open'; }).length;
      na += qs().filter(function (q) { return String((b.answers || {})[q.id] || '').trim(); }).length;
      if (!l.length && !qs().length) return 'Rôle · contexte · tâche · contraintes · format · critères';
      return okCount(b) + ' / 8 cases · ' + na + ' réponse' + (na > 1 ? 's' : '') + ' intégrée' + (na > 1 ? 's' : '') + (no ? ' · ' + no + ' à clarifier' : '');
    }
    function renderResult() {
      var b = st.b || {}, busy = st.view === 'compile' || b.state === 'compiling', tg = b.target || st.target;
      var md = String(b.prompt || ''), w = wordCount(md), path = b.path || '';
      var dir = path ? path.replace(/\/[^/]*$/, '') : '~/Documents/CBW AI/Prompts';
      var head = '<div class="bs-rh"><span class="lbl">' + (busy ? 'Compilation · IA' : 'Master prompt · ' + esc(tgName(tg)) + (w ? ' · ' + esc(num(w)) + ' mots' : '')) + '</span>' +
        '<h2>' + esc(b.title || 'Master prompt') + '</h2></div>';
      var acts = busy ? '' :
        '<div class="bs-ra"><button class="btn b1 lg" data-act="copy"' + (md ? '' : ' disabled') + '>' + I.copy + '<span data-r="cpl">Copier</span></button>' +
        '<button class="btn b2 lg" data-act="regen"' + (has('compileBrainstorm') ? '' : ' disabled') + '>' + I.redo + 'Regénérer pour ' + esc(tgName(other(tg))) + '</button>' +
        (canMore() ? '<button class="btn b3 lg" data-act="more" title="Une question ciblée de plus sur ce qui reste flou, puis le prompt est réécrit">Encore une question</button>' : '') + '</div>' +
        '<div class="bs-saved"><span class="pst" aria-hidden="true"></span><span>Enregistré dans <code>' + esc(dir) + '</code></span>' +
        '<button class="btn bt" data-act="reveal"' + (has('revealBrainstorm') || (path && has('openPath')) ? '' : ' disabled') + ' title="Afficher dans le Finder">' + I.folder + 'Finder</button></div>';
      var block = busy
        ? '<div class="bs-pr" aria-busy="true"><div class="bs-prh"><span class="lbl">' + esc(tgName(tg)) + '</span></div><div class="bs-prb"><div class="bs-busy"><span class="t shim">Compilation du master prompt…</span>' +
          '<span class="lbl">' + esc(busyLine(b)) + '</span>' +
          [92, 78, 85, 40, 88, 70, 60, 82, 35].map(function (p, i) { return '<div class="bs-sk" style="width:' + p + '%;' + (i === 3 || i === 7 ? 'margin-bottom:10px' : '') + '"></div>'; }).join('') + '</div></div></div>'
        : '<div class="bs-pr in2"><div class="bs-prh"><span class="lbl">' + (md ? 'prompt.md' : 'Vide') + '</span>' +
          '<div class="bs-seg sm" role="radiogroup" aria-label="Affichage" data-v="' + (st.src ? 'claude-code' : 'cursor') + '"><span class="th" aria-hidden="true"></span>' +
          '<button type="button" role="radio" data-act="srcv" data-v="src" aria-checked="' + st.src + '">Markdown</button><button type="button" role="radio" data-act="srcv" data-v="read" aria-checked="' + !st.src + '">Lecture</button></div></div>' +
          '<div class="bs-prb">' + (md ? (st.src ? '<pre class="bs-src" tabindex="0" aria-label="Master prompt (Markdown)">' + srcHTML(md) + '</pre>' : '<div class="bs-md">' + readHTML(md) + '</div>') : '<p class="lbl">Le prompt est vide.</p>') + '</div></div>';
      var qal = lives(b).filter(function (q) { return q.state !== 'dismissed'; }).sort(function (x, y) { return (x.askedAt || 0) - (y.askedAt || 0); }).map(function (q) {
        var a = q.state === 'answered' ? String(q.answer || '').trim() : '';
        return '<li><b>' + esc(q.question) + '</b>' + (a ? '<span>' + esc(a) + '</span>' : '<span class="td">À clarifier</span>') + '</li>';
      }).concat(qs().map(function (q) {
        var a = String((b.answers || {})[q.id] || '').trim();
        return '<li><b>' + esc(q.question) + '</b><span' + (a ? '' : ' class="sk"') + '>' + (a ? esc(a) : 'Passée') + '</span></li>';
      }));
      var qa = qal.join('');
      root.innerHTML = '<section class="bs-view" aria-label="Brainstorm · master prompt">' +
        barHTML(busy ? '' : '<button class="btn bt" data-act="del"' + (has('deleteBrainstorm') ? '' : ' disabled') + '>' + I.trash + 'Supprimer</button>') +
        '<div class="bs-rw"><div class="bs-rm"><div class="bs-rc in">' + head + acts + block + '</div></div>' +
        '<aside class="bs-rside" aria-label="Détails"><div class="in-st">' +
        '<details class="bs-dt"><summary>CRAFT+<span class="lbl">' + okCount(b) + ' / 8</span><span class="pl" aria-hidden="true">+</span></summary>' +
        chipsHTML(b, hasSlots(b) ? '' : 'wait') + slotsHTML(b, null) + '</details>' +
        (qa ? '<details class="bs-dt"><summary>Questions &amp; réponses<span class="lbl">' + qal.length + '</span><span class="pl" aria-hidden="true">+</span></summary><ol class="bs-qal">' + qa + '</ol></details>' : '') +
        (b.transcript ? '<details class="bs-dt"><summary>Vidage<span class="lbl">' + esc(num(wordCount(b.transcript))) + ' mots</span><span class="pl" aria-hidden="true">+</span></summary><p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:var(--b-sec);white-space:pre-wrap">' + esc(b.transcript) + '</p></details>' : '') +
        '</div></aside></div></section>';
      if (!busy && md) setTimeout(function () { var c = $('[data-act="copy"]'); if (c && st.view === 'result') c.focus({ preventScroll: true }); }, 60);
    }
    function copyPrompt() {
      var b = st.b; if (!b || !b.prompt) return;
      var p = has('copyBrainstormPrompt') ? call('copyBrainstormPrompt', b.id)
        : (navigator.clipboard ? navigator.clipboard.writeText(b.prompt) : Promise.reject(new Error('Presse-papiers indisponible')));
      p.then(function () {
        toast('Copié — colle-le dans ' + tgName(b.target));
        var btn = $('[data-act="copy"]'), l = $('[data-r="cpl"]');
        if (btn && l) { btn.classList.add('ok'); btn.firstChild.outerHTML = I.check; l.textContent = 'Copié'; clearTimeout(holdT); holdT = setTimeout(function () { if (btn.isConnected) { btn.classList.remove('ok'); var s = btn.querySelector('svg'); if (s) s.outerHTML = I.copy; l.textContent = 'Copier'; } }, 1800); }
      }, function (e) { toast(errMsg(e), true); });
    }

    /* ---- erreur ---- */
    function renderError() {
      var b = st.b || {};
      root.innerHTML = '<section class="bs-view">' + barHTML('') + '<div class="bs-pad"><div class="bs-col"><div class="bs-err in" role="alert"><span class="ic">' + I.alert + '</span><div>' +
        '<b>Le brainstorm n’a pas pu aller au bout</b><p>' + esc(b.message || 'Une erreur inattendue est survenue.') + (b.transcript ? ' Ton vidage est conservé.' : '') + '</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' + (qs().length && has('compileBrainstorm') ? '<button class="btn b1" data-act="compile">Réessayer la compilation</button>' : (b.transcript && has('askMore') ? '<button class="btn b1" data-act="more">Relancer l’analyse</button>' : '')) +
        '<button class="btn b2" data-act="home">Retour aux sessions</button></div></div></div></div></div></section>';
    }

    /* ================= actions ================= */
    function viewFor(b) {
      var s = b && b.state;
      return s === 'recording' ? 'record' : s === 'analyzing' ? 'analyze' : s === 'questions' ? 'questions' : s === 'compiling' ? 'compile' : s === 'done' ? 'result' : s === 'error' ? 'error' : 'home';
    }
    function start() {
      if (!CORE || st.starting) return;
      if (st.b && (st.b.state === 'recording' || st.b.state === 'analyzing' || st.b.state === 'compiling')) { setView(viewFor(st.b)); return; }
      st.starting = true; st.qi = -1; st.drafts = {}; st.lastQ = null; st.auto = false;
      st.b = { id: '', title: '', target: st.target, state: 'recording', transcript: '', slots: {}, questions: [], answers: {}, live: [] };
      st.tm = { elapsedMs: 0, words: 0, level: null, at: performance.now(), running: true };
      setView('record'); go('#brainstorm');
      call('startBrainstorm', st.target).catch(function (e) { toast('Impossible de démarrer : ' + errMsg(e), true); st.b = null; setView('home', true); loadList(); })
        .then(function () { st.starting = false; });
    }
    function stop() {
      if (st.view !== 'record') return;
      st.tm.elapsedMs = elapsed(); st.tm.running = false;
      if (st.b) st.b.state = 'compiling';
      st.auto = true;
      setView('compile');
      if (st.b && st.b.id) go('#brainstorm:' + st.b.id);
      call('stopBrainstorm').catch(function (e) { st.b = Object.assign({}, st.b, { state: 'error', message: errMsg(e) }); setView('error'); });
    }
    function cancel() {
      if (st.view !== 'record' || modal) return;
      var ms = elapsed();
      var doIt = function () { call('cancelBrainstorm').then(function () { st.b = null; st.tm.running = false; setView('home'); loadList(); toast('Brainstorm annulé'); }, function (e) { toast(errMsg(e), true); }); };
      if (ms <= 30000) { doIt(); return; }
      confirmModal({ label: 'Annuler le brainstorm', title: 'Abandonner ce vidage ?', body: 'Les ' + durLong(ms) + ' enregistrées seront perdues. Cette action est définitive.', no: 'Continuer', yes: 'Abandonner', danger: true })
        .then(function (ok) { if (ok) doIt(); });
    }
    function compile(target) {
      var b = st.b; if (!b || !b.id) return;
      saveDraft();
      var tg = target || b.target || st.target;
      st.b = Object.assign({}, b, { state: 'compiling', target: tg });
      setView('compile', true); go('#brainstorm:' + b.id);
      call('compileBrainstorm', b.id, tg).catch(function (e) { st.b = Object.assign({}, st.b, { state: 'error', message: errMsg(e) }); setView('error'); });
    }
    function more() {
      var b = st.b; if (!b || !b.id) return;
      st.b = Object.assign({}, b, { state: 'analyzing' }); st.qi = -1;
      setView('analyze', true);
      call('askMore', b.id).catch(function (e) { toast(errMsg(e), true); st.b = Object.assign({}, st.b, { state: 'questions' }); setView('questions', true); });
    }
    function openId(id) {
      if (!id) { if (st.view !== 'home' && !(st.b && (st.b.state === 'recording'))) { st.b = null; setView('home'); loadList(); } return; }
      if (st.b && st.b.id === id && st.view !== 'home') return;
      if (!has('getBrainstorm')) return;
      st.qi = -1; st.drafts = {}; st.lastQ = null;
      call('getBrainstorm', id).then(function (b) {
        if (!st.alive) return;
        if (!b || !b.id) throw new Error('Session introuvable.');
        st.b = b; go('#brainstorm:' + b.id); setView(viewFor(b), true);
      }).catch(function (e) { toast(errMsg(e), true); setView('home'); loadList(); });
    }
    function del() {
      var b = st.b; if (!b || !b.id) return;
      confirmModal({ label: 'Supprimer', title: 'Supprimer « ' + (b.title || 'ce brainstorm') + ' » ?', body: 'La session, ses réponses et le fichier du master prompt seront supprimés du Mac. Cette action est définitive.', no: 'Garder', yes: 'Supprimer', danger: true })
        .then(function (ok) {
          if (!ok) return;
          call('deleteBrainstorm', b.id).then(function () { st.b = null; setView('home'); go('#brainstorm'); loadList(); toast('Brainstorm supprimé'); }, function (e) { toast(errMsg(e), true); });
        });
    }

    /* ---- événements du pont ---- */
    function onB(b) {
      if (!st.alive || !b || typeof b !== 'object') return;
      // une autre session que celle affichée : on ne la suit que si elle démarre (pastille, menu)
      if (st.b && st.b.id && b.id && b.id !== st.b.id && b.state !== 'recording') { if (st.view === 'home') loadList(); return; }
      var prev = st.b, prevState = prev && prev.state;
      if (typeof b.elapsedMs === 'number') { st.tm.elapsedMs = b.elapsedMs; st.tm.at = performance.now(); }
      if (typeof b.words === 'number') st.tm.words = b.words;
      if (typeof b.level === 'number') st.tm.level = b.level;
      st.tm.running = b.state === 'recording';
      // garder les réponses optimistes non encore confirmées
      var merged = Object.assign({}, b);
      if (prev && prev.id === b.id && prev.answers) merged.answers = Object.assign({}, prev.answers, b.answers || {});
      if (prev && prev.id === b.id && !Array.isArray(b.live) && Array.isArray(prev.live)) merged.live = prev.live;
      st.b = merged;
      if (b.id && st.view !== 'home' && prevState !== b.state && b.state !== 'recording') go('#brainstorm:' + b.id);
      var v = viewFor(b);
      if (b.state === 'recording') { if (st.view !== 'record') { st.qi = -1; st.drafts = {}; setView('record'); go('#brainstorm'); } else updateLive(); return; }
      // après « Terminer » : compilation directe (on ignore une éventuelle étape d'analyse intermédiaire)
      if (st.auto && v === 'analyze') { if (st.view !== 'compile') setView('compile'); return; }
      if (v !== 'compile') st.auto = false;
      if (st.view === 'analyze' && v === 'questions') {
        // laisser les cases s'allumer avant de passer aux questions
        fillChips(function () { if (st.view === 'analyze') { st.qi = -1; st.lastQ = null; setView('questions'); } });
        return;
      }
      if (v === 'analyze') { if (st.view !== 'analyze') setView('analyze'); else fillChips(); return; }
      if (v === 'questions') { if (st.view !== 'questions') { st.qi = -1; setView('questions'); } else renderQuestions(); return; }
      if (v === 'result') {
        if (st.view !== 'result') { setView('result'); if (prevState === 'compiling') toast('Master prompt prêt'); if (st.list) loadList(); }
        else if (b.prompt !== (prev && prev.prompt)) renderResult();
        return;
      }
      if (v === 'compile') {
        var csig = JSON.stringify([b.slots || {}, lives(b).map(function (q) { return q.state; }), b.title || '']);
        if (st.view !== 'compile') { st.compSig = csig; setView('compile'); }
        else if (csig !== st.compSig) { st.compSig = csig; renderResult(); }
        return;
      }
      if (v === 'error') setView('error', true);
    }
    function onProgress(p) { // minuteur via onNoteProgress (mode 'brainstorm') ou onBrainstormProgress
      if (!st.alive || !p || st.view !== 'record') return;
      if (p.mode && p.mode !== 'brainstorm') return;
      if (typeof p.elapsedMs === 'number') { st.tm.elapsedMs = p.elapsedMs; st.tm.at = performance.now(); }
      if (typeof p.words === 'number') st.tm.words = p.words;
      if (typeof p.level === 'number') st.tm.level = p.level;
    }
    function onStatus(s) {
      if (!st.alive || !s) return;
      if (st.view === 'record' && s.mode === 'brainstorm' && typeof s.level === 'number') st.tm.level = s.level;
      if (st.view !== 'questions' || s.mode === 'note' || s.mode === 'brainstorm') return;
      var m = s.state === 'recording' ? 'rec' : (s.state === 'transcribing' || s.state === 'cleaning' || s.state === 'inserting') ? 'proc' : '';
      if (m !== st.mic) { st.mic = m; syncMic(); }
    }
    var unsubs = [subscribe(api, 'onBrainstorm', onB), subscribe(api, 'onBrainstormProgress', onProgress), subscribe(api, 'onStatus', onStatus)];
    if (!has('onBrainstormProgress')) unsubs.push(subscribe(api, 'onNoteProgress', function (p) { if (p && p.mode === 'brainstorm') onProgress(p); }));

    /* ---- événements DOM (délégués, compatibles CSP) ---- */
    function setTarget(t) {
      st.target = t === 'cursor' ? 'cursor' : 'claude-code'; store('cbw.bs.target', st.target);
      var s = $('.bs-start .bs-seg'); if (!s) return;
      s.setAttribute('data-v', st.target);
      [].forEach.call(s.querySelectorAll('[role="radio"]'), function (r) { var on = r.getAttribute('data-t') === st.target; r.setAttribute('aria-checked', on); r.tabIndex = on ? 0 : -1; if (on) r.focus({ preventScroll: true }); });
    }
    function onClick(e) {
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-act');
      if (a === 'start') start();
      else if (a === 'target') setTarget(b.getAttribute('data-t'));
      else if (a === 'open') openId(b.getAttribute('data-id'));
      else if (a === 'reload') { st.listErr = null; st.list = null; renderList(); loadList(); }
      else if (a === 'stop') stop();
      else if (a === 'lans') { var lq = lives(st.b).filter(function (x) { return x.id === b.getAttribute('data-q'); })[0]; if (lq) liveAct(lq.id, String((lq.suggestions || [])[+b.getAttribute('data-i')] || '')); }
      else if (a === 'ldis') liveAct(b.getAttribute('data-q'), null);
      else if (a === 'cancel') cancel();
      else if (a === 'home') { saveDraft(); st.b = st.b && st.b.state === 'recording' ? st.b : null; setView('home'); go('#brainstorm'); loadList(); }
      else if (a === 'sug') {
        var q = qs()[st.qi], t = $('[data-r="ans"]'); if (!q || !t) return;
        var v = String((q.suggestions || [])[+b.getAttribute('data-i')] || '');
        var on = b.getAttribute('aria-pressed') === 'true';
        t.value = on ? '' : v; st.drafts[q.id] = t.value;
        [].forEach.call(root.querySelectorAll('.bs-sg'), function (x) { x.setAttribute('aria-pressed', String(!on && x === b)); });
        t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      }
      else if (a === 'valid') submit(false);
      else if (a === 'skip') submit(true);
      else if (a === 'goq') goQ(+b.getAttribute('data-i'));
      else if (a === 'compile') compile();
      else if (a === 'more') more();
      else if (a === 'copy') copyPrompt();
      else if (a === 'regen') compile(other((st.b && st.b.target) || st.target));
      else if (a === 'reveal') { var id = st.b && st.b.id; (has('revealBrainstorm') ? call('revealBrainstorm', id) : call('openPath', st.b.path)).catch(function (er) { toast(errMsg(er), true); }); }
      else if (a === 'srcv') { st.src = b.getAttribute('data-v') === 'src'; store('cbw.bs.src', st.src ? 'src' : 'read'); renderResult(); var f = $('[data-act="srcv"][aria-checked="true"]'); if (f) f.focus({ preventScroll: true }); }
      else if (a === 'del') del();
    }
    function onInput(e) {
      if (e.target.getAttribute('data-act') !== 'ans') return;
      var q = qs()[st.qi]; if (!q) return;
      st.drafts[q.id] = e.target.value;
      var v = e.target.value.trim();
      [].forEach.call(root.querySelectorAll('.bs-sg'), function (x) { x.setAttribute('aria-pressed', String((q.suggestions || [])[+x.getAttribute('data-i')] === v)); });
    }
    function onKey(e) {
      if (!st.alive || !root.isConnected || !root.offsetParent && root.getClientRects().length === 0) return;
      var tg = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable;
      if (e.key === 'Escape') {
        if (modal) { e.preventDefault(); closeModal(false); return; }
        if (st.view === 'record') { e.preventDefault(); cancel(); return; }
        if (typing && root.contains(tg)) { tg.blur(); return; }
        return;
      }
      if (modal) return;
      if (tg.getAttribute && tg.getAttribute('data-act') === 'ans' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(false); return; }
      if (tg.getAttribute && tg.getAttribute('data-act') === 'target' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setTarget(e.key === 'ArrowRight' ? 'cursor' : 'claude-code'); return; }
      if (typing) return;
      if (st.view === 'result' && e.key === 'c' && e.metaKey && !String(window.getSelection ? window.getSelection() : '').length) { e.preventDefault(); copyPrompt(); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);

    /* ---- vue initiale ---- */
    lastNav = opts.id ? '#brainstorm:' + opts.id : '#brainstorm';
    setView('home', true);
    loadList();
    if (opts.id) openId(opts.id);

    return {
      open: function (id) { openId(id || null); },
      start: start,
      unmount: function () {
        st.alive = false; stopLoops(); clearFill(); closeModal(false); clearTimeout(holdT);
        unsubs.forEach(function (u) { u(); });
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput);
        document.removeEventListener('keydown', onKey);
        root.remove();
      }
    };
  }

  window.CBWBrainstorm = { mount: mount };
})();

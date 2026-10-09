/* CBW AI — écran « Prise de notes », variante B « éditoriale » : bibliothèque à deux volets.
   Colonne liste étroite (recherche + jours) à gauche ; le volet de lecture occupe tout le reste.
   Rien de sélectionné → carte de départ calme. Session → le volet devient la session (liste visible mais atténuée).
   Traitement → ligne « Organisation… » en tête de liste, la note s'ouvre seule à la fin.
   Vanilla JS, sans dépendance, compatible CSP (aucun handler inline, aucun eval).
   Contrat : docs/APP_API.md › Mode « Prise de notes ».
   Usage : window.CBWNotes.mount(container, { api, navigate, noteId }) → { open(id), list(), unmount() }
   Tout texte venant de l'utilisateur / du LLM passe par esc() avant d'entrer dans innerHTML. */
(function () {
  'use strict';

  /* ---------- styles (injectés une seule fois, scopés sous .cbwb) ---------- */
  var CSS = [
    '.cbwb{--b-ink:var(--inverse-fond,#1C1C1E);--b-ink-t:var(--inverse-texte,#fff);--b-f3:var(--fond-3,#ECECE8);--b-ease:var(--ease,cubic-bezier(.2,.7,.2,1));--b-out:var(--ease-sortie,cubic-bezier(.16,1,.3,1));--b-r:2px;',
    '--b-or:var(--orange,#FF5A1F);--b-or-bg:color-mix(in srgb,var(--b-or) 8%,var(--fond,#fff));--b-or-bg2:color-mix(in srgb,var(--b-or) 15%,var(--fond,#fff));--b-bl:var(--bleu,#2B3BFF);--b-bl-bg:color-mix(in srgb,var(--b-bl) 7%,var(--fond,#fff));--b-list:340px;',
    'font-family:var(--police,"Archivo",system-ui,sans-serif);color:var(--texte,#111);background:var(--fond,#fff);font-size:15px;line-height:1.55;height:100vh;-webkit-font-smoothing:antialiased}',
    '@media (max-width:1180px){.cbwb{--b-list:300px}}',
    '.cbwb *,.cbwb *::before,.cbwb *::after{box-sizing:border-box}',
    '.cbwb .lbl{font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#5F5F5A);line-height:1}',
    '.cbwb .pst{display:inline-block;width:10px;height:10px;margin-right:8px;background:currentColor;flex:none}',
    '.cbwb kbd{font-family:var(--mono,monospace);font-size:11px;font-weight:500;border:1px solid var(--fil-fort,#C4C4BF);padding:2px 6px;color:var(--texte,#111);background:var(--surface,#fff)}',
    '.cbwb :focus-visible{outline:3px solid var(--focus,#2B3BFF);outline-offset:2px}',
    '.cbwb svg{display:block;flex:none}',
    /* buttons */
    '.cbwb .btn{appearance:none;font:inherit;font-weight:800;font-size:14px;border:0;border-radius:var(--b-r);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;transition:background var(--d-2,.2s),color var(--d-2,.2s),transform .12s,box-shadow var(--d-2,.2s)}',
    '.cbwb .btn:disabled{cursor:not-allowed;opacity:.45}',
    '.cbwb .btn:not(:disabled):active{transform:scale(.98)}',
    '.cbwb .b1{background:var(--b-ink);color:var(--b-ink-t);min-height:46px;padding:0 22px;font-size:15px}',
    '.cbwb .b1:not(:disabled):hover{background:color-mix(in srgb,var(--b-ink) 86%,var(--fond,#fff))}',
    '.cbwb .ar{display:inline-block;transition:transform .2s var(--b-ease)}',
    '.cbwb .btn:not(:disabled):hover .ar{transform:translateX(4px)}',
    '.cbwb .brec{background:var(--b-or-bg2);color:var(--texte,#111);min-height:56px;padding:0 26px 0 22px;font-size:16px;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--b-or) 45%,transparent)}',
    '.cbwb .brec:not(:disabled):hover{background:color-mix(in srgb,var(--b-or) 24%,var(--fond,#fff));box-shadow:inset 0 0 0 1.5px var(--b-or)}',
    '.cbwb .dot{width:11px;height:11px;border-radius:50%;background:var(--b-or);flex:none}',
    '.cbwb .brec:not(:disabled):hover .dot{animation:cbwbPulse 1.2s var(--b-ease) infinite}',
    '@keyframes cbwbPulse{50%{transform:scale(.7)}}',
    '.cbwb .b2{background:var(--surface,#fff);color:var(--texte,#111);min-height:36px;padding:0 13px;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1px var(--fil-fort,#C4C4BF)}',
    '.cbwb .b2:not(:disabled):hover{background:var(--fond-2,#F4F4F2);box-shadow:inset 0 0 0 1px var(--texte,#111)}',
    '.cbwb .b2.lg{min-height:46px;padding:0 20px;font-size:15px}',
    '.cbwb .b3{background:none;color:var(--texte-sec,#5F5F5A);min-height:36px;padding:0 6px;font-weight:700;font-size:13px;position:relative}',
    '.cbwb .b3::after{content:"";position:absolute;left:6px;right:6px;bottom:8px;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s var(--b-ease)}',
    '.cbwb .b3:not(:disabled):hover{color:var(--texte,#111)}',
    '.cbwb .b3:not(:disabled):hover::after{transform:scaleX(1)}',
    '.cbwb .b3.danger:not(:disabled):hover{color:var(--erreur,#B3261E)}',
    '.cbwb .bi{background:none;color:var(--texte-sec,#5F5F5A);width:34px;height:34px;padding:0}',
    '.cbwb .bi:not(:disabled):hover,.cbwb .bi[aria-pressed="true"]{background:var(--fond-2,#F4F4F2);color:var(--texte,#111)}',
    '.cbwb .bdanger{background:var(--erreur,#B3261E);color:#fff}',
    '.cbwb .in{animation:cbwbIn .42s var(--b-out) both}',
    '.cbwb .in2{animation:cbwbIn .42s var(--b-out) .06s both}',
    '.cbwb .in3{animation:cbwbIn .42s var(--b-out) .12s both}',
    '@keyframes cbwbIn{from{opacity:0;transform:translateY(8px)}}',
    /* shell — 2 volets */
    '.b-shell{display:grid;grid-template-columns:var(--b-list) minmax(0,1fr);height:100%;transition:grid-template-columns .42s var(--b-out)}',
    '.b-shell.full{grid-template-columns:0 minmax(0,1fr)}',
    '.b-lib{min-width:0;display:flex;flex-direction:column;border-right:2px solid var(--trait,#1E1E1C);background:var(--fond-2,#F4F4F2);overflow:hidden;transition:opacity .32s var(--b-ease),filter .32s var(--b-ease)}',
    '.b-shell.full .b-lib{visibility:hidden;border-right-width:0}',
    '.b-shell.live .b-lib{opacity:.42;filter:grayscale(1);pointer-events:none;user-select:none}',
    '.b-pane{min-width:0;overflow:auto;position:relative;background:var(--fond,#fff);scroll-behavior:smooth}',
    /* list column */
    '.b-lhd{padding:22px 20px 14px;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}',
    '.b-lhd h1{margin:0;font-size:34px;font-weight:900;font-stretch:85%;letter-spacing:-.035em;line-height:.95}',
    '.b-lhd .cnt{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#5F5F5A);margin-left:8px;letter-spacing:0;font-stretch:100%;font-weight:500;vertical-align:4px}',
    '.b-lhd .r{display:flex;gap:2px;align-items:center}',
    '.b-lhd .rec{color:var(--texte,#111)}.b-lhd .rec .dot{width:10px;height:10px}',
    '.b-srch{margin:0 20px 10px;position:relative}',
    '.b-srch svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--texte-3,#6E6E6A);pointer-events:none}',
    '.b-srch input{width:100%;height:38px;font:inherit;font-size:14px;color:var(--texte,#111);background:var(--surface,#fff);border:1px solid var(--fil-fort,#C4C4BF);border-radius:var(--b-r);padding:0 34px 0 34px;outline:0;transition:border-color .2s}',
    '.b-srch input:hover{border-color:var(--champ,#949490)}',
    '.b-srch input:focus{border-color:var(--texte,#111);box-shadow:0 0 0 1px var(--texte,#111)}',
    '.b-srch input::placeholder{color:var(--texte-3,#6E6E6A)}',
    '.b-srch input::-webkit-search-cancel-button{display:none}',
    '.b-srch kbd{position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--texte-3,#6E6E6A);border-color:var(--fil,#ddd);background:none;pointer-events:none}',
    '.b-srch input:focus~kbd,.b-srch input:not(:placeholder-shown)~kbd{display:none}',
    '.b-list{flex:1;overflow:auto;padding:0 0 28px;overscroll-behavior:contain}',
    '.b-day{position:sticky;top:0;z-index:1;background:var(--fond-2,#F4F4F2);padding:16px 20px 8px;font-size:11px;display:flex;justify-content:space-between}',
    '.b-day span{color:var(--texte-3,#6E6E6A)}',
    '.b-rows{list-style:none;margin:0;padding:0}',
    '.b-row{appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;width:100%;display:block;padding:11px 20px 12px 20px;position:relative;transition:background .2s}',
    '.b-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--texte,#111);transform:scaleY(0);transition:transform .32s var(--b-out)}',
    '.b-row:hover{background:var(--fond-3,#ECECE8)}',
    '.b-row[aria-current="true"]{background:var(--surface,#fff)}',
    '.b-row[aria-current="true"]::before{transform:scaleY(1)}',
    '.b-row+.b-row,.b-rows li+li .b-row{box-shadow:inset 0 1px 0 var(--fil,#ddd)}',
    '.b-row .t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:700;font-size:14px;line-height:1.3;letter-spacing:-.005em}',
    '.b-row .m{display:flex;gap:10px;margin-top:5px;font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#5F5F5A);line-height:1.2}',
    '.b-row .m .raw{color:var(--texte,#111);background:var(--b-f3);padding:1px 5px;font-weight:700;letter-spacing:.04em}',
    '.b-row .m .sp{flex:1}',
    /* processing row */
    '.b-row.proc{background:var(--b-bl-bg);margin-top:4px}',
    '.b-row.proc::before{background:var(--b-bl);transform:scaleY(1)}',
    '.b-row.proc .m{color:var(--b-bl)}',
    '.b-row.proc .mini{display:block;height:2px;background:color-mix(in srgb,var(--b-bl) 20%,transparent);margin-top:9px;position:relative;overflow:hidden}',
    '.b-row.proc .mini i{position:absolute;inset:0;background:var(--b-bl);transform-origin:left;transition:transform .35s var(--ease-barre,cubic-bezier(.7,0,.2,1))}',
    '.b-row.proc .mini.ind i{width:35%;animation:cbwbInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite}',
    '.b-row.live{background:var(--b-or-bg)}.b-row.live::before{background:var(--b-or);transform:scaleY(1)}.b-row.live .m{color:var(--texte,#111)}',
    '.b-none{padding:18px 20px;color:var(--texte-sec,#5F5F5A);font-size:13px}',
    '.b-load{padding:18px 20px}',
    /* pane : start card */
    '.b-start{min-height:100%;display:grid;place-items:center;padding:48px clamp(24px,5vw,72px)}',
    '.b-card{width:min(560px,100%);border:2px solid var(--trait,#1E1E1C);background:var(--surface,#fff);padding:30px 32px 26px;position:relative}',
    '.b-card .bars{position:absolute;left:-2px;top:-2px;display:flex;gap:6px}',
    '.b-card .bars i{display:block;width:44px;height:8px;background:var(--b-or);transform-origin:left;animation:cbwbBar .6s var(--ease-barre,cubic-bezier(.7,0,.2,1)) both}',
    '.b-card .bars i:nth-child(2){background:var(--b-bl);animation-delay:.08s}.b-card .bars i:nth-child(3){background:var(--vert,#1FD26A);animation-delay:.16s}',
    '@keyframes cbwbBar{from{transform:scaleX(0)}}',
    '.b-card h2{margin:18px 0 10px;font-size:clamp(40px,4.4vw,60px);font-weight:900;font-stretch:85%;letter-spacing:-.04em;line-height:.92}',
    '.b-card p{margin:0 0 26px;color:var(--texte-sec,#5F5F5A);font-size:15px;max-width:42ch}',
    '.b-card .go{display:flex;align-items:center;gap:18px;flex-wrap:wrap}',
    '.b-card .sc{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#5F5F5A);display:flex;align-items:center;gap:6px}',
    '.b-card .ft{margin-top:26px;padding-top:14px;border-top:1px solid var(--fil,#ddd);display:flex;gap:22px;flex-wrap:wrap}',
    '.b-card .ft div{font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#5F5F5A);letter-spacing:.04em;text-transform:uppercase}',
    '.b-card .ft b{display:block;font-family:var(--police,sans-serif);font-size:22px;font-weight:900;font-stretch:85%;color:var(--texte,#111);letter-spacing:-.02em;text-transform:none;margin-bottom:2px}',
    '.b-off{max-width:480px;font-size:14px;color:var(--texte-sec,#5F5F5A)}',
    /* pane : reading */
    '.b-bar{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--fond,#fff) 100%,transparent);border-bottom:1px solid var(--fil,#ddd);display:flex;align-items:center;gap:4px;padding:10px clamp(16px,2.4vw,28px);min-height:56px}',
    '.b-bar .crumb{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}',
    '.b-bar .grp{display:flex;align-items:center;gap:2px;padding-right:6px;margin-right:4px;border-right:1px solid var(--fil,#ddd)}',
    '.b-bar .grp .b3{padding:0 8px}.b-bar .grp .b3::after{left:8px;right:8px}',
    '.b-doc{max-width:calc(70ch + 2 * clamp(24px,5vw,80px));padding:clamp(28px,4vw,56px) clamp(24px,5vw,80px) 96px;margin:0 auto}',
    '.b-shell.full .b-doc{max-width:calc(74ch + 2 * clamp(24px,5vw,80px))}',
    '.b-doc .when{display:flex;align-items:center;gap:10px}',
    '.b-doc .ti{margin:14px 0 18px;font-size:clamp(32px,3.4vw,48px);font-weight:900;font-stretch:85%;letter-spacing:-.035em;line-height:.98;text-wrap:balance}',
    '.b-meta{display:flex;flex-wrap:wrap;border-top:2px solid var(--trait,#1E1E1C);border-bottom:1px solid var(--fil,#ddd);margin-bottom:30px}',
    '.b-meta div{padding:10px 22px 10px 0;margin-right:22px;border-right:1px solid var(--fil,#ddd)}',
    '.b-meta div:last-child{border-right:0}',
    '.b-meta .lbl{font-size:10px;display:block;margin-bottom:5px}',
    '.b-meta b{font-family:var(--mono,monospace);font-size:13px;font-weight:700}',
    '.b-meta .ok b::before{content:"";display:inline-block;width:8px;height:8px;background:var(--vert-pt,#15803D);margin-right:7px;vertical-align:1px}',
    '.b-warn{margin:-12px 0 26px;padding:12px 14px;background:var(--b-or-bg);border-left:3px solid var(--b-or);font-size:13px;color:var(--texte,#111)}',
    '.b-md{font-size:16.5px;line-height:1.68;max-width:70ch}',
    '.b-md h1,.b-md h2{font-size:22px;font-weight:900;font-stretch:88%;letter-spacing:-.02em;line-height:1.15;margin:36px 0 10px}',
    '.b-md h3{font-size:17px;font-weight:800;margin:26px 0 6px;line-height:1.3}',
    '.b-md h4{font-family:var(--mono,monospace);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:20px 0 6px;color:var(--texte-sec,#5F5F5A)}',
    '.b-md>:first-child{margin-top:0}',
    '.b-md p{margin:0 0 14px}',
    '.b-md ul,.b-md ol{margin:0 0 14px;padding-left:24px}',
    '.b-md li{margin:4px 0}',
    '.b-md li>ul,.b-md li>ol{margin:4px 0}',
    '.b-md ol>li::marker{font-family:var(--mono,monospace);font-size:.82em;color:var(--texte-sec,#5F5F5A)}',
    '.b-md ul{list-style:none}',
    '.b-md ul>li{position:relative}',
    '.b-md ul>li::before{content:"";position:absolute;left:-17px;top:.68em;width:6px;height:6px;background:var(--texte,#111)}',
    '.b-md ul ul>li::before{background:none;box-shadow:inset 0 0 0 1.5px var(--texte,#111)}',
    '.b-md li.tk::before{display:none}',
    '.b-md .bx{position:absolute;left:-24px;top:.32em;width:15px;height:15px;border:1.5px solid var(--texte,#111);display:block}',
    '.b-md li.tk.dn>.bx{background:var(--b-ink);border-color:var(--b-ink)}',
    '.b-md li.tk.dn>.bx::after{content:"";position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid var(--b-ink-t);border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '.b-md li.tk.dn>.tx{color:var(--texte-sec,#5F5F5A);text-decoration:line-through;text-decoration-thickness:1px}',
    '.b-md strong{font-weight:800}',
    '.b-md code{font-family:var(--mono,monospace);font-size:.84em;background:var(--fond-2,#F4F4F2);padding:1px 5px}',
    '.b-md pre{font-family:var(--mono,monospace);font-size:12px;background:var(--fond-2,#F4F4F2);padding:12px 14px;overflow:auto;margin:0 0 14px}',
    '.b-md pre code{background:none;padding:0}',
    '.b-md blockquote{margin:0 0 14px;padding:2px 0 2px 16px;border-left:3px solid var(--fil-fort,#C4C4BF);color:var(--texte-sec,#5F5F5A)}',
    '.b-md hr{border:0;border-top:1px solid var(--fil,#ddd);margin:26px 0}',
    '.b-raw{margin-top:44px;border-top:2px solid var(--trait,#1E1E1C);max-width:70ch}',
    '.b-raw summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 0;font-weight:800;font-size:14px}',
    '.b-raw summary::-webkit-details-marker{display:none}',
    '.b-raw summary .lbl{margin-left:10px;font-size:11px}',
    '.b-raw summary .pl{width:30px;height:30px;display:grid;place-items:center;background:var(--fond-2,#F4F4F2);font-weight:500;font-size:18px;transition:transform .35s var(--b-ease),background .2s}',
    '.b-raw[open] summary .pl{transform:rotate(45deg);background:var(--b-ink);color:var(--b-ink-t)}',
    '.b-raw .txt{white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--texte-sec,#5F5F5A);padding-bottom:14px}',
    '.b-path{margin-top:26px;font-family:var(--mono,monospace);font-size:11px;color:var(--texte-3,#6E6E6A);word-break:break-all}',
    /* pane : live session */
    '.b-ses{min-height:100%;display:flex;flex-direction:column;padding:clamp(24px,3.2vw,44px) clamp(24px,4.4vw,72px) 28px;background:var(--fond,#fff)}',
    '.b-ses .top{display:flex;align-items:center;justify-content:space-between;gap:16px}',
    '.b-ses .st{color:var(--b-or);display:flex;align-items:center}',
    '.b-ses .st .pst{animation:cbwbBlink 1.4s steps(1) infinite}',
    '.b-ses.paused .st{color:var(--texte-sec,#5F5F5A)}.b-ses.paused .st .pst{animation:none}',
    '@keyframes cbwbBlink{50%{opacity:.25}}',
    '.b-ses .tti{width:100%;margin:22px 0 0;font:inherit;font-size:clamp(22px,2.2vw,30px);font-weight:800;letter-spacing:-.02em;color:var(--texte,#111);background:none;border:0;border-bottom:1px solid var(--fil,#ddd);padding:4px 0 10px;outline:0;border-radius:0;transition:border-color .2s}',
    '.b-ses .tti::placeholder{color:var(--texte-3,#6E6E6A);opacity:.7}',
    '.b-ses .tti:hover{border-bottom-color:var(--champ,#949490)}.b-ses .tti:focus{border-bottom-color:var(--texte,#111)}',
    '.b-ses .mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding:clamp(18px,3vh,40px) 0;min-height:0}',
    '.b-tm{font-size:clamp(104px,15vw,248px);font-weight:900;font-stretch:70%;line-height:.78;letter-spacing:-.055em;font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:-.04em}',
    '.b-tm .c{color:var(--b-or);margin:0 .02em}',
    '.b-ses.paused .b-tm{color:var(--texte-sec,#5F5F5A)}.b-ses.paused .b-tm .c{color:inherit}',
    '.b-wave{display:flex;align-items:center;gap:4px;height:64px;margin:clamp(18px,3vh,34px) 0 14px}',
    '.b-wave i{flex:1;height:100%;background:var(--b-or);transform:scaleY(.06);transform-origin:center;min-width:3px}',
    '.b-ses.paused .b-wave i{background:var(--fil-fort,#C4C4BF)}',
    '.b-ses .stats{display:flex;gap:26px;flex-wrap:wrap;font-family:var(--mono,monospace);font-size:13px;color:var(--texte-sec,#5F5F5A)}',
    '.b-ses .stats b{color:var(--texte,#111);font-weight:700}',
    '.b-ses .acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:18px;border-top:2px solid var(--trait,#1E1E1C)}',
    '.b-ses .acts .sp{flex:1}',
    '.b-ses .keys{font-family:var(--mono,monospace);font-size:11px;color:var(--texte-3,#6E6E6A);display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
    /* markers */
    '.b-mk{margin:0 0 18px}',
    '.b-mk .add{display:flex;align-items:center;gap:10px;border:1px solid var(--fil-fort,#C4C4BF);background:var(--surface,#fff);padding:0 8px 0 12px;height:44px;transition:border-color .2s,box-shadow .2s}',
    '.b-mk .add:focus-within{border-color:var(--texte,#111);box-shadow:0 0 0 1px var(--texte,#111)}',
    '.b-mk .add .ts{font-family:var(--mono,monospace);font-size:12px;color:var(--b-or);font-weight:700;min-width:44px}',
    '.b-mk .add input{flex:1;min-width:0;height:100%;border:0;background:none;font:inherit;font-size:14px;color:var(--texte,#111);outline:0}',
    '.b-mk .add input::placeholder{color:var(--texte-3,#6E6E6A)}',
    '.b-mk ol{list-style:none;margin:0 0 10px;padding:0;max-height:132px;overflow:auto}',
    '.b-mk li{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--fil,#ddd);font-size:14px;animation:cbwbIn .32s var(--b-out) both}',
    '.b-mk li .ts{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#5F5F5A);min-width:44px;padding-top:2px}',
    /* pane : processing */
    '.b-pro{min-height:100%;display:flex;flex-direction:column;justify-content:center;padding:48px clamp(24px,5vw,80px);max-width:900px}',
    '.b-pro .st{color:var(--b-bl);display:flex;align-items:center}',
    '.b-pro h2{margin:18px 0 26px;font-size:clamp(48px,6.4vw,96px);font-weight:900;font-stretch:75%;letter-spacing:-.045em;line-height:.9}',
    '.cbwb .shim{background:linear-gradient(90deg,var(--texte,#111) 0 40%,var(--texte-3,#999) 50%,var(--texte,#111) 60% 100%) 0/300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cbwbSh 1.6s linear infinite}',
    '@keyframes cbwbSh{from{background-position:100% 0}to{background-position:0 0}}',
    '.b-prog{height:8px;background:var(--fond-2,#F4F4F2);position:relative;overflow:hidden}',
    '.b-prog i{position:absolute;inset:0;background:var(--b-bl);transform-origin:left;transition:transform .35s var(--ease-barre,cubic-bezier(.7,0,.2,1))}',
    '.b-prog.ind i{width:30%;animation:cbwbInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite}',
    '@keyframes cbwbInd{from{transform:translateX(-100%)}to{transform:translateX(340%)}}',
    '.b-steps{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14px}',
    '.b-steps .lbl{padding-top:2px}.b-steps .lbl.on{color:var(--b-bl)}.b-steps .lbl.ok{color:var(--texte,#111)}',
    '.b-pro .sum{margin-top:28px;font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#5F5F5A)}',
    '.b-pro .hint{margin-top:8px;font-size:13px;color:var(--texte-sec,#5F5F5A)}',
    '.b-pro.err .st{color:var(--erreur,#B3261E)}.b-pro.err h2{font-size:clamp(32px,3.6vw,48px)}.b-pro.err p{margin:0 0 20px;color:var(--texte-sec,#5F5F5A)}',
    /* small widths : un seul volet */
    '@media (max-width:760px){.b-shell{grid-template-columns:minmax(0,1fr)}.b-shell.pane-on .b-lib{display:none}.b-shell:not(.pane-on) .b-pane{display:none}.b-lib{border-right:0}}',
    '@media (min-width:761px){.b-lhd .rec.sm{display:none}}',
    /* modal + toast */
    '.cbwb-scrim{position:fixed;inset:0;z-index:50;background:rgba(20,20,20,.5);display:grid;place-items:center;padding:24px;height:auto;animation:cbwbFade .2s var(--b-ease) both}',
    '@keyframes cbwbFade{from{opacity:0}}',
    '.cbwb-dlg{width:min(460px,100%);background:var(--surface,#fff);color:var(--texte,#111);border:2px solid var(--trait,#1E1E1C);box-shadow:var(--ombre-dure,8px 8px 0 #1E1E1C);padding:24px;animation:cbwbIn .3s var(--b-out) both}',
    '.cbwb-dlg h2{margin:12px 0 8px;font-size:24px;font-weight:900;font-stretch:88%;letter-spacing:-.025em;line-height:1.1}',
    '.cbwb-dlg p{margin:0;color:var(--texte-sec,#5F5F5A);font-size:14px}',
    '.cbwb-dlg .ft{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;flex-wrap:wrap}',
    '.cbwb-toast{position:fixed;right:24px;bottom:24px;z-index:60;height:auto;background:var(--b-ink);color:var(--b-ink-t);font-family:var(--mono,monospace);font-size:13px;font-weight:500;line-height:1.3;padding:11px 14px;display:flex;align-items:center;gap:10px;animation:cbwbToast .2s var(--b-ease) both}',
    '.cbwb-toast .pst{color:var(--vert,#1FD26A);margin:0}',
    '.cbwb-toast.err .pst{color:var(--erreur,#FF6B5E)}',
    '.cbwb-toast.out{animation:cbwbToastOut .2s var(--b-ease) forwards}',
    '@keyframes cbwbToast{from{opacity:0;transform:translateY(10px)}}',
    '@keyframes cbwbToastOut{to{opacity:0;transform:translateY(10px)}}',
    '@media (prefers-reduced-motion:reduce){.cbwb *,.cbwb-scrim,.cbwb-dlg,.cbwb-toast,.b-shell{animation:none!important;transition:none!important}.cbwb .shim{color:var(--texte,#111);background:none}}'
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
    doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>'),
    cal: svg('<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/><path d="M8 14h3v3H8z"/>', 22),
    mic: svg('<path d="M9 4h6v9H9zM5 11v1a7 7 0 0 0 14 0v-1M12 19v3"/>', 20)
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
  function dur(ms) {
    var s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + ' s';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + pad(m % 60);
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
    var y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
    return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + y;
  }
  function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '' : hm(d); }
  function longDate(iso) { var d = new Date(iso); return isNaN(d) ? '—' : dayLabel(iso) + ' · ' + hm(d); }
  function date(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
    return d.getDate() + ' ' + MOIS[d.getMonth()] + y + ' · ' + d.getHours() + ' h ' + pad(d.getMinutes());
  }
  var PROV = { passthrough: 'Aucun (brut)', ollama: 'Ollama (local)', groq: 'Groq', zai: 'Z.ai', mistral: 'Mistral', cloudflare: 'Cloudflare', gemini: 'Gemini', openrouter: 'OpenRouter' };
  function prov(p) { return PROV[p] || (p ? String(p) : '—'); }
  function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- tiny safe Markdown renderer ---------- */
  function inline(src) {
    // `code` first (verbatim), then **bold**, *italic*, on escaped text.
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
    var out = [], para = [], stack = []; // stack of {type:'ul'|'ol', indent}
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    function closeLists(toIndent) {
      while (stack.length && stack[stack.length - 1].indent > toIndent) { out.push('</li></' + stack.pop().type + '>'); }
    }
    function closeAll() { closeLists(-1); }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], m;
      if (/^\s*```/.test(ln)) { // fenced code
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
        if (!top || indent > top.indent) {
          out.push('<' + type + '>'); stack.push({ type: type, indent: indent });
        } else {
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
      if (stack.length && /^\s+\S/.test(ln)) { out.push(' ' + inline(ln.trim())); continue; } // lazy continuation
      closeAll();
      para.push(ln.trim());
    }
    flushPara(); closeAll();
    return out.join('\n');
  }

  /* ---------- progress fan-out (onNoteProgress has no unsubscribe) ---------- */
  var subs = typeof WeakMap === 'function' ? new WeakMap() : null;
  function subscribe(api, fn) {
    if (!api || typeof api.onNoteProgress !== 'function' || !subs) return;
    var set = subs.get(api);
    if (!set) {
      set = new Set(); subs.set(api, set);
      try { api.onNoteProgress(function (p) { set.forEach(function (f) { try { f(p); } catch (e) { console.error(e); } }); }); } catch (e) { console.error(e); }
    }
    set.add(fn);
    return function () { set.delete(fn); };
  }

  I.x = svg('<path d="M6 6l12 12M18 6L6 18"/>');
  I.grow = svg('<path d="M14 4h6v6M10 20H4v-14M20 4l-7 7"/>');
  I.shrink = svg('<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>');
  I.search = svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>', 16);

  /* ---------- mount ---------- */
  function mount(container, opts) {
    injectCSS();
    opts = opts || {};
    var api = opts.api || null;
    var navigate = typeof opts.navigate === 'function' ? opts.navigate : function () {};
    function has(m) { return !!(api && typeof api[m] === 'function'); }
    var CORE = has('listNotes') && has('getNote');

    var root = document.createElement('div');
    root.className = 'cbwb';
    container.innerHTML = '';
    container.appendChild(root);

    // mode: 'idle' | 'session' | 'processing'
    var st = { mode: 'idle', notes: null, listErr: null, q: '', sel: null, note: null, noteErr: null, full: false,
      prog: null, progAt: 0, reorgId: null, busy: false, alive: true, title: '', marks: [], lastMarks: [] };
    var tick = 0, raf = 0, toastT = 0, modal = null, lastNav = '', paneKey = '';

    function go(hash) { if (hash !== lastNav) { lastNav = hash; try { navigate(hash); } catch (e) { console.error(e); } } }
    function call(m) {
      var args = [].slice.call(arguments, 1);
      if (!has(m)) return Promise.reject(new Error('Méthode indisponible : ' + m));
      try { return Promise.resolve(api[m].apply(api, args)); } catch (e) { return Promise.reject(e); }
    }
    function errMsg(e) { return (e && e.message) || String(e); }
    function $(sel) { return root.querySelector(sel); }
    function stopLoops() { clearInterval(tick); tick = 0; cancelAnimationFrame(raf); raf = 0; }

    /* ---- toast ---- */
    function toast(msg, isErr) {
      var old = document.querySelector('.cbwb-toast'); if (old) old.remove();
      var t = document.createElement('div');
      t.className = 'cbwb cbwb-toast' + (isErr ? ' err' : '');
      t.setAttribute('role', 'status');
      t.innerHTML = '<span class="pst"></span>' + esc(msg);
      document.body.appendChild(t);
      clearTimeout(toastT);
      toastT = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }, isErr ? 3200 : 1800);
    }

    /* ---- modal (in-page, never confirm()) ---- */
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
      root.innerHTML = '<div class="b-shell" data-r="shell">' +
        '<aside class="b-lib" aria-label="Bibliothèque de notes">' +
        '<header class="b-lhd"><h1>Notes<span class="cnt" data-r="cnt"></span></h1><div class="r">' +
        '<button class="btn bi rec" data-act="start" aria-label="Démarrer une note" title="Démarrer une note"' + (has('startNote') ? '' : ' disabled') + '><span class="dot"></span></button>' +
        '</div></header>' +
        '<label class="b-srch">' + I.search + '<input type="search" placeholder="Rechercher" aria-label="Rechercher une note" data-act="q" autocomplete="off" spellcheck="false"' + (CORE ? '' : ' disabled') + '><kbd>/</kbd></label>' +
        '<div class="b-list" data-r="list"></div></aside>' +
        '<section class="b-pane" data-r="pane" aria-live="polite"></section></div>';
      renderList(); renderPane();
    }
    function syncShell() {
      var sh = $('[data-r="shell"]'); if (!sh) return;
      sh.classList.toggle('live', st.mode === 'session');
      sh.classList.toggle('full', st.full && !!st.sel && st.mode !== 'session');
      sh.classList.toggle('pane-on', !!st.sel || st.mode !== 'idle');
      var b = $('.b-lhd [data-act="start"]'); if (b) b.disabled = !has('startNote') || st.mode !== 'idle';
      var c = $('[data-r="cnt"]'); if (c) c.textContent = st.notes && st.notes.length ? String(st.notes.length) : '';
    }

    /* ---- list column ---- */
    var todayKey = function () { return dayKey(new Date().toISOString()); };
    function rowHTML(n) {
      return '<li><button class="b-row" data-act="open" data-id="' + esc(n.id) + '"' + (st.sel === n.id ? ' aria-current="true"' : '') + '>' +
        '<span class="t">' + esc(n.title || 'Note sans titre') + '</span>' +
        '<span class="m"><span>' + esc(timeOf(n.createdAt)) + '</span><span>' + esc(dur(n.durationMs)) + '</span><span>' + esc(words(n.words)) + '</span>' +
        '<span class="sp"></span>' + (n.provider === 'passthrough' ? '<span class="raw">BRUT</span>' : '') + '</span></button></li>';
    }
    function liveRowHTML() {
      var p = st.prog || {};
      if (st.mode === 'session') {
        return '<ul class="b-rows"><li><button class="b-row live" tabindex="-1"><span class="t">' + esc(st.title.trim() || 'Note en cours') + '</span>' +
          '<span class="m"><span class="lbl" style="color:inherit">● ' + (p.state === 'paused' ? 'En pause' : 'Enregistrement') + '</span></span></button></li></ul>';
      }
      var org = p.state === 'organizing', total = p.total || 3, step = Math.min(p.step || 1, total);
      var ttl = st.reorgId && st.note && st.note.meta && st.note.meta.id === st.reorgId ? st.note.meta.title : (st.lastTitle || 'Nouvelle note');
      return '<ul class="b-rows"><li><button class="b-row proc" data-act="proc"' + (!st.sel ? ' aria-current="true"' : '') + '><span class="t">' + esc(ttl) + '</span>' +
        '<span class="m"><span data-s="rowlbl">' + (p.state === 'error' ? 'Erreur' : org ? 'Organisation ' + step + '/' + total + '…' : 'Transcription…') + '</span></span>' +
        '<span class="mini' + (org ? '' : ' ind') + '" data-s="rowpg"><i' + (org ? ' style="transform:scaleX(' + ((step - .5) / total).toFixed(3) + ')"' : '') + '></i></span></button></li></ul>';
    }
    function renderList() {
      var el = $('[data-r="list"]'); if (!el) return;
      syncShell();
      if (!CORE) { el.innerHTML = '<div class="b-none">La prise de notes n’est pas disponible dans cette version.</div>'; return; }
      if (st.listErr) { el.innerHTML = '<div class="b-none">Impossible de lire tes notes : ' + esc(st.listErr) + ' <button class="btn b3" data-act="reload">Réessayer</button></div>'; return; }
      if (!st.notes) { el.innerHTML = '<div class="b-load lbl">Chargement…</div>'; return; }
      var q = fold(st.q.trim()), tk = todayKey();
      var list = st.notes.filter(function (n) { return !q || fold(n.title).indexOf(q) !== -1; });
      var h = '';
      if (st.mode !== 'idle' && !q) h += '<div class="b-day lbl">En cours</div>' + liveRowHTML();
      if (!list.length) {
        h += '<div class="b-none">' + (q ? 'Aucune note ne correspond à « ' + esc(st.q.trim()) + ' ».' : 'Tes notes apparaîtront ici, classées par jour.') + '</div>';
        el.innerHTML = h; return;
      }
      var groups = [], cur = null;
      list.forEach(function (n) {
        var k = dayKey(n.createdAt);
        if (!cur || cur.k !== k) { cur = { k: k, iso: n.createdAt, items: [] }; groups.push(cur); }
        cur.items.push(n);
      });
      var y = new Date(Date.now() - 864e5), yk = y.getFullYear() + '-' + y.getMonth() + '-' + y.getDate();
      groups.forEach(function (g) {
        var name = g.k === tk ? 'Aujourd’hui' : g.k === yk ? 'Hier' : dayLabel(g.iso);
        h += '<div class="b-day lbl">' + esc(name) + '<span>' + g.items.length + '</span></div><ul class="b-rows">' + g.items.map(rowHTML).join('') + '</ul>';
      });
      el.innerHTML = h;
    }
    function markSel() {
      [].forEach.call(root.querySelectorAll('.b-row[data-act="open"]'), function (r) {
        if (r.getAttribute('data-id') === st.sel) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
      });
      var pr = $('.b-row.proc'); if (pr) { if (st.sel) pr.removeAttribute('aria-current'); else pr.setAttribute('aria-current', 'true'); }
      syncShell();
    }
    function loadList() {
      if (!CORE) { st.notes = []; renderList(); renderPane(); return Promise.resolve(); }
      return call('listNotes').then(function (list) {
        st.listErr = null;
        st.notes = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }, function (e) { st.listErr = errMsg(e); })
        .then(function () { if (!st.alive) return; renderList(); if (paneKey === 'start') renderPane(true); });
    }

    /* ---- reading pane : one of start / note / session / processing ---- */
    function renderPane(force) {
      var el = $('[data-r="pane"]'); if (!el) return;
      var key = st.mode === 'session' ? 'session' : (st.sel ? 'note:' + st.sel + ':' + (st.note ? 1 : 0) + (st.noteErr ? 'e' : '') : (st.mode === 'processing' ? 'proc' : 'start'));
      if (key === paneKey && !force) return;
      paneKey = key;
      stopLoops();
      syncShell();
      if (st.mode === 'session') return renderSession(el);
      if (st.sel) return renderNote(el);
      if (st.mode === 'processing') return renderProcessing(el);
      renderStart(el);
    }

    function renderStart(el) {
      if (!CORE) {
        el.innerHTML = '<div class="b-start"><div class="b-off in"><div class="lbl">Indisponible</div><p>La prise de notes n’est pas disponible dans cette version de CBW AI. Mets l’application à jour pour l’utiliser.</p></div></div>';
        return;
      }
      var all = st.notes || [], ms = 0, w = 0;
      all.forEach(function (n) { ms += n.durationMs || 0; w += n.words || 0; });
      el.innerHTML = '<div class="b-start"><div class="b-card in">' +
        '<div class="bars" aria-hidden="true"><i></i><i></i><i></i></div>' +
        '<div class="lbl in2" style="margin-top:6px">Prise de notes</div>' +
        '<h2 class="in2">Démarrer une note</h2>' +
        '<p class="in3">Parle librement pendant une réunion, un appel ou une réflexion. CBW transcrit au fil de l’eau, puis range tes idées dans une note claire.</p>' +
        '<div class="go in3"><button class="btn brec" data-act="start"' + (has('startNote') ? '' : ' disabled') + '><span class="dot"></span>Démarrer une note</button>' +
        '<span class="sc">ou <kbd>Control gauche</kbd> ×3</span></div>' +
        (all.length ? '<div class="ft in3"><div><b>' + esc(num(all.length)) + '</b>note' + (all.length > 1 ? 's' : '') + '</div><div><b>' + esc(dur(ms)) + '</b>enregistrées</div><div><b>' + esc(num(w)) + '</b>mots</div></div>' : '') +
        '</div></div>';
    }

    function renderNote(el) {
      var close = '<button class="btn bi" data-act="full" aria-pressed="' + st.full + '" aria-label="' + (st.full ? 'Réduire' : 'Lecture pleine page') + '" title="' + (st.full ? 'Réduire' : 'Pleine page') + '">' + (st.full ? I.shrink : I.grow) + '</button>' +
        '<button class="btn bi" data-act="back" aria-label="Fermer la note" title="Fermer (Échap)">' + I.x + '</button>';
      if (st.noteErr) { el.innerHTML = '<div class="b-bar"><span class="crumb lbl">Note</span>' + close + '</div><div class="b-doc"><div class="b-none">' + esc(st.noteErr) + '</div></div>'; return; }
      var n = st.note;
      if (!n || !n.meta || n.meta.id !== st.sel) { el.innerHTML = '<div class="b-bar"><span class="crumb lbl">Note</span>' + close + '</div><div class="b-doc"><div class="lbl">Chargement…</div></div>'; return; }
      var m = n.meta, md = String(n.markdown || '');
      var mt = /^\s*#\s+(.+)\n?/.exec(md); // évite le titre en double
      if (mt && fold(mt[1].trim()) === fold(m.title || '')) md = md.slice(mt[0].length);
      var raw = m.provider === 'passthrough';
      var dis = function (k) { return has(k) ? '' : ' disabled'; };
      el.innerHTML = '<div class="b-bar"><span class="crumb lbl">' + esc(longDate(m.createdAt)) + '</span>' +
        '<span class="grp"><button class="btn b3" data-act="copy"' + dis('copyNote') + ' title="Copier le Markdown (⌘C)">Copier</button>' +
        '<button class="btn b3" data-act="reveal"' + dis('revealNote') + '>Finder</button>' +
        '<button class="btn b3" data-act="reorg"' + dis('reorganizeNote') + (st.mode === 'idle' ? '' : ' disabled') + '>Réorganiser</button>' +
        '<button class="btn b3 danger" data-act="del"' + dis('deleteNote') + '>Supprimer</button></span>' + close + '</div>' +
        '<article class="b-doc">' +
        '<div class="when lbl in">' + (raw ? '<span class="pst" style="color:var(--b-or)"></span>Transcription brute' : '<span class="pst" style="color:var(--vert-pt,#15803D)"></span>Note organisée') + '</div>' +
        '<h1 class="ti in">' + esc(m.title || 'Note sans titre') + '</h1>' +
        '<div class="b-meta in2"><div><span class="lbl">Durée</span><b>' + esc(clock(m.durationMs)) + '</b></div><div><span class="lbl">Mots</span><b>' + esc(num(m.words)) + '</b></div>' +
        '<div class="' + (raw ? '' : 'ok') + '"><span class="lbl">Moteur</span><b>' + esc(prov(m.provider)) + '</b></div></div>' +
        (raw ? '<p class="b-warn in2">Aucun moteur IA n’était disponible : voici la transcription telle quelle. « Réorganiser » la reprend quand un moteur est prêt.</p>' : '') +
        '<div class="b-md in3">' + (md.trim() ? renderMarkdown(md) : '<p>Cette note est vide.</p>') + '</div>' +
        (n.transcript && !raw ? '<details class="b-raw"><summary><span>Transcription brute<span class="lbl">' + esc(words(m.words)) + '</span></span><span class="pl" aria-hidden="true">+</span></summary><div class="txt">' + esc(n.transcript) + '</div></details>' : '') +
        (m.path ? '<div class="b-path">' + esc(m.path) + '</div>' : '') + '</article>';
      el.scrollTop = 0;
    }

    /* session */
    function elapsed() {
      var p = st.prog || {};
      return (p.elapsedMs || 0) + (p.state === 'recording' ? performance.now() - st.progAt : 0);
    }
    function marksHTML() {
      return st.marks.map(function (k) { return '<li><span class="ts">' + esc(clock(k.t)) + '</span><span>' + esc(k.text) + '</span></li>'; }).join('');
    }
    var NB = 64;
    function renderSession(el) {
      var p = st.prog || { state: 'recording' }, paused = p.state === 'paused';
      var bars = ''; for (var i = 0; i < NB; i++) bars += '<i></i>';
      el.innerHTML = '<div class="b-ses' + (paused ? ' paused' : '') + '" data-s="ses">' +
        '<div class="top in"><div class="lbl st" data-s="stl"><span class="pst"></span>' + (paused ? 'En pause' : 'Enregistrement en cours') + '</div>' +
        '<div class="keys"><kbd>Control gauche</kbd> terminer · <kbd>Échap</kbd> annuler</div></div>' +
        '<input class="tti in" data-act="title" placeholder="Titre (facultatif)" aria-label="Titre de la note (facultatif)" maxlength="140" autocomplete="off" value="' + esc(st.title) + '">' +
        '<div class="mid"><div class="b-tm in2" data-s="tm" role="timer" aria-label="Durée"></div>' +
        '<div class="b-wave in2" aria-hidden="true" data-s="wave">' + bars + '</div>' +
        '<div class="stats in3"><span><b data-s="wd">0</b> mots transcrits</span><span><b data-s="mkn">' + st.marks.length + '</b> repère' + (st.marks.length > 1 ? 's' : '') + '</span><span>Rien n’est collé pendant la note</span></div></div>' +
        '<div class="b-mk in3"><ol data-s="mks">' + marksHTML() + '</ol>' +
        '<label class="add"><span class="ts" data-s="mkts">00:00</span><input data-act="mark" placeholder="Repère (facultatif) — tape une ligne puis Entrée" aria-label="Ajouter un repère horodaté" maxlength="200" autocomplete="off"></label></div>' +
        '<div class="acts in3"><button class="btn b1" data-act="stop"' + (has('stopNote') ? '' : ' disabled') + '>Terminer <span class="ar">→</span></button>' +
        '<button class="btn b2 lg" data-act="pause"' + (has(paused ? 'resumeNote' : 'pauseNote') ? '' : ' disabled') + '>' + (paused ? 'Reprendre' : 'Pause') + '</button>' +
        '<span class="sp"></span><button class="btn b3" data-act="cancel"' + (has('cancelNote') ? '' : ' disabled') + '>Annuler la note</button></div></div>';
      updateSession();
      tick = setInterval(updateSession, 250);
      animWave();
    }
    function updateSession() {
      var p = st.prog || {}, tm = $('[data-s="tm"]'); if (!tm) return;
      var txt = clock(elapsed()), html = txt.split(':').map(esc).join('<span class="c">:</span>');
      if (tm.innerHTML !== html) { tm.innerHTML = html; tm.setAttribute('aria-label', 'Durée ' + txt); }
      var wd = $('[data-s="wd"]'), w = num(p.words); if (wd.textContent !== w) wd.textContent = w;
      var ts = $('[data-s="mkts"]'); if (ts) ts.textContent = txt;
    }
    function setSessionPaused(paused) {
      var s = $('[data-s="ses"]'); if (!s) return;
      s.classList.toggle('paused', paused);
      $('[data-s="stl"]').innerHTML = '<span class="pst"></span>' + (paused ? 'En pause' : 'Enregistrement en cours');
      var b = $('[data-act="pause"]'); b.textContent = paused ? 'Reprendre' : 'Pause'; b.disabled = !has(paused ? 'resumeNote' : 'pauseNote');
      renderList();
    }
    function animWave() {
      var bars = [].slice.call(root.querySelectorAll('.b-wave i'));
      var hist = []; for (var i = 0; i < NB; i++) hist.push(.08 + .14 * Math.abs(Math.sin(i * .9) * Math.cos(i * .37)));
      var last = 0, smooth = 0;
      function paint() { for (var j = 0; j < NB; j++) bars[j].style.transform = 'scaleY(' + Math.max(.05, Math.min(1, hist[j])).toFixed(3) + ')'; }
      if (reduced) { hist = hist.map(function (_, j) { return .12 + .1 * Math.abs(Math.sin(j * .7)); }); paint(); return; }
      function frame(t) {
        if (st.mode !== 'session') return;
        var p = st.prog || {}, paused = p.state === 'paused';
        if (t - last > 70) {
          last = t;
          var lv = typeof p.level === 'number' ? Math.max(0, Math.min(1, p.level)) : .12 + .1 * (1 + Math.sin(t / 480)) / 2;
          smooth += ((paused ? .05 : lv) - smooth) * .5;
          hist.shift(); hist.push(paused ? .05 : Math.max(.05, smooth * (.7 + Math.random() * .3)));
          paint();
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }
    function addMark(inp) {
      var text = inp.value.trim(); if (!text || st.mode !== 'session') return;
      var k = { t: elapsed(), text: text }; st.marks.push(k); inp.value = '';
      if (has('addNoteMarker')) call('addNoteMarker', k).catch(function () {}); // extension facultative du pont
      var ol = $('[data-s="mks"]'); if (ol) { ol.insertAdjacentHTML('beforeend', '<li><span class="ts">' + esc(clock(k.t)) + '</span><span>' + esc(k.text) + '</span></li>'); ol.scrollTop = ol.scrollHeight; }
      var n = $('[data-s="mkn"]'); if (n) { n.textContent = st.marks.length; n.nextSibling.textContent = ' repère' + (st.marks.length > 1 ? 's' : ''); }
    }

    /* processing */
    function renderProcessing(el) {
      var p = st.prog || { state: 'transcribing' };
      if (p.state === 'error') {
        el.innerHTML = '<div class="b-pro err in"><div class="lbl st"><span class="pst"></span>Erreur</div>' +
          '<h2>La note n’a pas pu être terminée</h2><p>' + esc(p.message || 'Une erreur inattendue est survenue.') + '</p>' +
          '<div><button class="btn b2 lg" data-act="dismiss">Fermer</button></div></div>';
        return;
      }
      el.innerHTML = '<div class="b-pro"><div class="lbl st in"><span class="pst"></span>Traitement IA</div>' +
        '<h2 class="shim in" data-s="h"></h2><div class="b-prog in2" data-s="pg"><i></i></div>' +
        '<div class="b-steps in2" data-s="steps"></div><div class="sum in3" data-s="sum"></div>' +
        '<div class="hint in3">Tu peux lire une autre note pendant ce temps : celle-ci s’ouvrira toute seule.</div></div>';
      updateProcessing();
    }
    function updateProcessing() {
      var p = st.prog || {};
      var org = p.state === 'organizing', total = p.total || 3, step = Math.min(p.step || 1, total);
      var label = org ? 'Organisation ' + step + '/' + total + '…' : 'Transcription…';
      var rl = $('[data-s="rowlbl"]'), rp = $('[data-s="rowpg"]');
      if (rl) rl.textContent = label;
      if (rp) { rp.classList.toggle('ind', !org); rp.firstChild.style.transform = org ? 'scaleX(' + ((step - .5) / total).toFixed(3) + ')' : ''; }
      var h = $('[data-s="h"]'); if (!h) return;
      if (h.textContent !== label) h.textContent = label;
      var pg = $('[data-s="pg"]');
      if (!org) { pg.classList.add('ind'); pg.firstChild.style.transform = ''; }
      else { pg.classList.remove('ind'); pg.firstChild.style.transform = 'scaleX(' + ((step - .5) / total).toFixed(3) + ')'; }
      $('[data-s="steps"]').innerHTML = '<span class="lbl ' + (org ? 'ok' : 'on') + '">' + (org ? '✓ ' : '') + '1 · Transcription</span>' +
        '<span class="lbl' + (org ? ' on' : '') + '">2 · Organisation</span><span class="lbl">3 · Note prête</span>';
      var bits = [];
      if (p.elapsedMs) bits.push(durLong(p.elapsedMs));
      if (p.words) bits.push(words(p.words));
      if (st.lastMarks.length) bits.push(st.lastMarks.length + ' repère' + (st.lastMarks.length > 1 ? 's' : ''));
      if (p.message) bits.push(p.message);
      $('[data-s="sum"]').textContent = bits.join(' · ');
    }

    function openNote(id) {
      if (!CORE || !id) return;
      st.sel = id; st.noteErr = null;
      if (!st.note || st.note.meta.id !== id) st.note = null;
      markSel(); renderPane(); go('#notes:' + id);
      call('getNote', id).then(function (n) {
        if (!st.alive || st.sel !== id) return;
        if (!n || !n.meta) throw new Error('Note introuvable.');
        st.note = n; renderPane();
      }).catch(function (e) { if (st.sel === id) { st.noteErr = errMsg(e); renderPane(); } });
    }
    function closeNote() { st.sel = null; st.note = null; st.full = false; markSel(); renderPane(); go('#notes'); }

    /* ---- actions ---- */
    function setMode(mode) { st.mode = mode; renderList(); renderPane(true); }
    function startSession() {
      if (!has('startNote') || st.busy || st.mode !== 'idle') return;
      st.busy = true; st.title = ''; st.marks = []; st.full = false;
      st.prog = { state: 'recording', elapsedMs: 0, words: 0 }; st.progAt = performance.now();
      setMode('session'); go(st.sel ? '#notes:' + st.sel : '#notes');
      call('startNote').catch(function (e) { toast('Impossible de démarrer : ' + errMsg(e), true); setMode('idle'); })
        .then(function () { st.busy = false; });
    }
    function togglePause() {
      var paused = st.prog && st.prog.state === 'paused';
      st.prog = Object.assign({}, st.prog, { state: paused ? 'recording' : 'paused', elapsedMs: elapsed() }); st.progAt = performance.now();
      setSessionPaused(!paused);
      call(paused ? 'resumeNote' : 'pauseNote').catch(function (e) { toast(errMsg(e), true); });
    }
    function stopSession() {
      st.prog = Object.assign({}, st.prog, { state: 'transcribing', elapsedMs: elapsed() });
      st.lastTitle = st.title.trim(); st.lastMarks = st.marks.slice();
      st.sel = null; st.note = null;
      setMode('processing');
      // Titre + repères : arguments facultatifs (ignorés par un pont qui ne les gère pas encore).
      call('stopNote', { title: st.lastTitle || undefined, markers: st.lastMarks }).catch(function (e) { st.prog = { state: 'error', message: errMsg(e) }; renderPane(true); });
    }
    function cancelSession() {
      if (st.mode !== 'session' || modal) return;
      var ms = elapsed();
      var doIt = function () {
        call('cancelNote').then(function () { st.prog = null; setMode('idle'); toast('Note annulée'); }, function (e) { toast(errMsg(e), true); });
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
        st.reorgId = id; st.lastMarks = [];
        st.prog = { state: 'organizing', step: 1, total: 3, elapsedMs: st.note.meta.durationMs, words: st.note.meta.words };
        st.sel = null; st.full = false;
        setMode('processing');
        call('reorganizeNote', id).then(function () {
          if (st.alive && st.reorgId === id && st.mode === 'processing') { st.reorgId = null; setMode('idle'); toast('Note réorganisée'); loadList(); st.note = null; openNote(id); }
        }, function (e) { st.reorgId = null; setMode('idle'); toast(errMsg(e), true); });
      } else if (act === 'del') {
        confirmModal({ label: 'Supprimer', title: 'Supprimer « ' + (st.note.meta.title || 'cette note') + ' » ?', body: 'La note et sa transcription brute seront supprimées du Mac. Cette action est définitive.', no: 'Garder', yes: 'Supprimer', danger: true })
          .then(function (ok) {
            if (!ok) return;
            call('deleteNote', id).then(function () {
              st.notes = (st.notes || []).filter(function (n) { return n.id !== id; });
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
        if (st.mode !== 'session') setMode('session');
        else { if (prev !== p.state) setSessionPaused(p.state === 'paused'); updateSession(); }
      } else if (p.state === 'transcribing' || p.state === 'organizing') {
        if (st.mode !== 'processing') { if (st.mode === 'session') { st.lastTitle = st.title.trim(); st.lastMarks = st.marks.slice(); st.sel = null; } setMode('processing'); }
        else updateProcessing();
      } else if (p.state === 'done') {
        var id = p.noteId || st.reorgId, viewing = !st.sel; st.reorgId = null;
        setMode('idle');
        toast(p.message || 'Note prête');
        loadList().then(function () { if (id && (viewing || st.sel === id)) { st.note = null; openNote(id); } });
      } else if (p.state === 'error') {
        st.reorgId = null;
        if (st.mode !== 'idle') { st.mode = 'processing'; st.sel = null; renderList(); renderPane(true); }
        else toast(p.message || 'Erreur pendant la note', true);
      }
    }
    var unsub = subscribe(api, onProg);

    /* ---- events (delegated, CSP-safe) ---- */
    function onClick(e) {
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-act');
      if (a === 'start') startSession();
      else if (a === 'open') { if (st.mode !== 'session') openNote(b.getAttribute('data-id')); }
      else if (a === 'proc') closeNote();
      else if (a === 'pause') togglePause();
      else if (a === 'stop') stopSession();
      else if (a === 'cancel') cancelSession();
      else if (a === 'back') closeNote();
      else if (a === 'full') { st.full = !st.full; syncShell(); renderPane(true); }
      else if (a === 'dismiss') { st.prog = null; setMode('idle'); }
      else if (a === 'reload') { st.listErr = null; st.notes = null; renderList(); loadList(); }
      else if (a === 'copy' || a === 'reveal' || a === 'reorg' || a === 'del') noteAction(a);
    }
    function onInput(e) {
      var a = e.target.getAttribute('data-act');
      if (a === 'q') { st.q = e.target.value; renderList(); markSel(); }
      else if (a === 'title') { st.title = e.target.value; var r = $('.b-row.live .t'); if (r) r.textContent = st.title.trim() || 'Note en cours'; }
    }
    function onKey(e) {
      if (!st.alive || !root.isConnected) return;
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (e.key === 'Enter' && (act === 'mark' || act === 'title') && !e.isComposing) {
        e.preventDefault();
        if (act === 'mark') addMark(e.target); else { var m = $('[data-act="mark"]'); if (m) m.focus(); }
        return;
      }
      if (e.key === 'Escape') {
        if (modal) { e.preventDefault(); closeModal(false); return; }
        if (st.mode === 'session') {
          e.preventDefault();
          if (typing && e.target.value) { e.target.value = ''; if (act === 'title') { st.title = ''; } return; }
          if (typing) { e.target.blur(); return; }
          cancelSession(); return;
        }
        if (act === 'q') { e.preventDefault(); if (e.target.value) { e.target.value = ''; st.q = ''; renderList(); } else e.target.blur(); return; }
        if (st.full) { e.preventDefault(); st.full = false; syncShell(); renderPane(true); return; }
        if (st.sel) { e.preventDefault(); closeNote(); }
        return;
      }
      if (modal || typing) return;
      if (e.key === '/' && CORE && st.mode !== 'session') { e.preventDefault(); var q = $('[data-act="q"]'); if (q) q.focus(); }
      else if (e.key === 'c' && e.metaKey && st.note && st.sel && !String(window.getSelection ? window.getSelection() : '').length) { e.preventDefault(); noteAction('copy'); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && st.mode !== 'session' && st.notes && st.notes.length) {
        var rows = [].slice.call(root.querySelectorAll('.b-row[data-act="open"]')), i = -1;
        rows.forEach(function (r, j) { if (r.getAttribute('data-id') === st.sel) i = j; });
        var nx = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (nx) { e.preventDefault(); openNote(nx.getAttribute('data-id')); nx.scrollIntoView({ block: 'nearest' }); }
      }
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
        st.alive = false; stopLoops(); closeModal(false);
        if (unsub) unsub();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput);
        document.removeEventListener('keydown', onKey);
        root.remove();
      }
    };
  }

  window.CBWNotes = { mount: mount, renderMarkdown: renderMarkdown };
})();

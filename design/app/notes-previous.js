/* CBW AI — écran « Prise de notes » (hub › Notes), mise en page type « Notetaker ».
   Vanilla JS, sans dépendance, compatible CSP (aucun handler inline, aucun eval).
   Contrat : docs/APP_API.md › Mode « Prise de notes ».
   Usage : window.CBWNotes.mount(container, { api, navigate, noteId }) → { open(id), list(), unmount() }
   Tout texte venant de l'utilisateur / du LLM passe par esc() avant d'entrer dans innerHTML. */
(function () {
  'use strict';

  /* ---------- styles (injectés une seule fois, scopés sous .cbwn) ---------- */
  var CSS = [
    '.cbwn{--n-ink:var(--encre,var(--inverse-fond,#1C1C1E));--n-ink-t:var(--inverse-texte,#fff);--n-f3:var(--fond-3,var(--fil,#ECECE8));--n-ease:var(--ease,cubic-bezier(.2,.7,.2,1));--n-r:4px;--n-r2:8px;',
    '--n-or:var(--orange,#FF5A1F);--n-or-bg:color-mix(in srgb,var(--n-or) 9%,var(--fond,#fff));--n-or-bg2:color-mix(in srgb,var(--n-or) 16%,var(--fond,#fff));',
    'font-family:var(--police,"Archivo",system-ui,sans-serif);color:var(--texte,#111);background:var(--fond,#fff);font-size:15px;line-height:1.55;min-height:100%;-webkit-font-smoothing:antialiased}',
    '.cbwn *,.cbwn *::before,.cbwn *::after{box-sizing:border-box}',
    '.cbwn .lbl{font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#4A4A4A);line-height:1}',
    '.cbwn .pst{display:inline-block;width:10px;height:10px;margin-right:8px;background:currentColor}',
    '.cbwn kbd{font-family:var(--mono,monospace);font-size:11px;border:1px solid var(--fil,#ddd);border-radius:3px;padding:1px 5px;color:var(--texte-sec,#4A4A4A);background:var(--surface,#fff)}',
    '.cbwn :focus-visible{outline:3px solid var(--focus,#2B3BFF);outline-offset:2px}',
    '.cbwn svg{display:block;flex:none}',
    /* buttons — 3 levels (AUDIT §4.1) */
    '.cbwn .btn{appearance:none;font:inherit;font-weight:800;font-size:14px;border:0;border-radius:var(--n-r);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;text-decoration:none;transition:background var(--d-rapide,.15s),color var(--d-rapide,.15s),transform .12s,box-shadow var(--d-rapide,.15s)}',
    '.cbwn .btn:disabled{cursor:not-allowed;opacity:.42}',
    '.cbwn .btn:not(:disabled):active{transform:scale(.98)}',
    '.cbwn .b1{background:var(--n-ink);color:var(--n-ink-t);min-height:40px;padding:0 18px}',
    '.cbwn .b1:not(:disabled):hover{background:color-mix(in srgb,var(--n-ink) 86%,var(--fond,#fff))}',
    '.cbwn .b1 .ar{display:inline-block;transition:transform .2s var(--n-ease)}',
    '.cbwn .b1:not(:disabled):hover .ar{transform:translateX(4px)}',
    '.cbwn .brec{background:var(--n-or-bg2);color:var(--texte,#111);min-height:44px;padding:0 18px 0 16px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--n-or) 35%,transparent)}',
    '.cbwn .brec:not(:disabled):hover{background:color-mix(in srgb,var(--n-or) 24%,var(--fond,#fff));box-shadow:inset 0 0 0 1px var(--n-or)}',
    '.cbwn .brec .dot{width:10px;height:10px;border-radius:50%;background:var(--n-or)}',
    '.cbwn .b2{background:var(--fond-2,#F4F4F2);color:var(--texte,#111);min-height:36px;padding:0 14px;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1px transparent}',
    '.cbwn .b2:not(:disabled):hover{background:var(--n-f3);box-shadow:inset 0 0 0 1px var(--texte,#111)}',
    '.cbwn .b2.lg,.cbwn .b1.lg{min-height:48px;padding:0 22px;font-size:15px}',
    '.cbwn .b3{background:none;color:var(--texte-sec,#4A4A4A);min-height:36px;padding:0 6px;font-weight:700;font-size:13px;position:relative}',
    '.cbwn .b3::after{content:"";position:absolute;left:6px;right:6px;bottom:8px;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s var(--n-ease)}',
    '.cbwn .b3:not(:disabled):hover{color:var(--texte,#111)}',
    '.cbwn .b3:not(:disabled):hover::after{transform:scaleX(1)}',
    '.cbwn .b3.danger:not(:disabled):hover{color:var(--erreur,#B3261E)}',
    '.cbwn .bi{background:none;color:var(--texte-sec,#4A4A4A);width:36px;height:36px;padding:0}',
    '.cbwn .bi:not(:disabled):hover,.cbwn .bi[aria-pressed="true"]{background:var(--fond-2,#F4F4F2);color:var(--texte,#111)}',
    '.cbwn .bdanger{background:var(--erreur,#B3261E);color:#fff}',
    '.cbwn .bdanger:not(:disabled):hover{background:color-mix(in srgb,var(--erreur,#B3261E) 85%,#000)}',
    '.cbwn .in{animation:cbwnIn .45s var(--n-ease) both}',
    '@keyframes cbwnIn{from{opacity:0;transform:translateY(6px)}}',
    /* layout */
    '.cbwn-grid{display:grid;grid-template-columns:minmax(0,1fr);min-height:100vh}',
    '@media (min-width:1100px){.cbwn-grid{grid-template-columns:minmax(0,1fr) 380px}}',
    '@media (min-width:1280px){.cbwn-grid{grid-template-columns:minmax(0,1fr) 420px}}',
    '.cbwn-main{padding:clamp(24px,3.4vw,44px) clamp(20px,3.4vw,48px) 64px;min-width:0}',
    '.cbwn-main>*{max-width:980px;margin-left:auto;margin-right:auto}',
    '.cbwn-side{border-left:1px solid var(--fil,#ddd);min-width:0;background:var(--fond,#fff)}',
    '@media (min-width:1100px){.cbwn-side{position:sticky;top:0;height:100vh;overflow:auto}.cbwn-side .back{display:none}}',
    '@media (max-width:1099px){.cbwn-side{border-left:0}.cbwn-grid.has-sel .cbwn-main{display:none}.cbwn-grid:not(.has-sel) .cbwn-side{display:none}}',
    /* header */
    '.cbwn-hd{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}',
    '.cbwn-hd h1{margin:0;font-size:clamp(30px,3.2vw,40px);font-weight:900;font-stretch:85%;line-height:1;letter-spacing:-.03em}',
    '.cbwn-hd .r{display:flex;align-items:center;gap:8px}',
    '.cbwn-hd .hint{font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A);margin-right:6px}',
    '@media (max-width:760px){.cbwn-hd .hint{display:none}}',
    /* today panel */
    '.cbwn-today{background:var(--fond-2,#F4F4F2);border-radius:var(--n-r2);padding:18px 18px 20px}',
    '.cbwn-today>.lbl{display:block;margin:2px 2px 14px}',
    '.cbwn-intro{background:var(--n-or-bg);border:1px solid var(--n-or);border-radius:var(--n-r2);padding:18px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}',
    '.cbwn-intro .tx{flex:1 1 300px;min-width:0}',
    '.cbwn-intro b{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em}',
    '.cbwn-intro span{font-size:13px;color:var(--texte-sec,#4A4A4A)}',
    '.cbwn-intro .ac{display:flex;gap:10px;align-items:center}',
    '.cbwn-intro .ic{width:40px;height:40px;border-radius:var(--n-r);background:var(--fond,#fff);display:grid;place-items:center;color:var(--n-or)}',
    '.cbwn-zero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 16px 20px;color:var(--texte-sec,#4A4A4A)}',
    '.cbwn-zero .ic{width:48px;height:48px;border-radius:var(--n-r2);background:var(--fond,#fff);display:grid;place-items:center;color:var(--texte,#111);margin-bottom:14px}',
    '.cbwn-zero b{color:var(--texte,#111);font-size:16px;font-weight:800}',
    '.cbwn-zero p{margin:4px 0 0;font-size:14px;max-width:46ch}',
    '.cbwn-today .cbwn-rows{margin-top:6px}',
    '.cbwn-intro+.cbwn-rows{margin-top:14px}',
    '.cbwn-off{background:var(--fond,#fff);border-left:3px solid var(--texte-sec,#4A4A4A);padding:14px 16px;border-radius:var(--n-r);font-size:14px}',
    /* live session inside the panel */
    '.cbwn-today.live{background:var(--n-or-bg);box-shadow:inset 0 0 0 1px var(--n-or)}',
    '.cbwn-today.live.paused{background:var(--fond-2,#F4F4F2);box-shadow:inset 0 0 0 1px var(--fil,#ddd)}',
    '.cbwn-ses{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px 32px;padding:4px 4px 0}',
    '.cbwn-ses .st{color:var(--n-or);font-weight:700}',
    '.cbwn-ses .st .pst{border-radius:50%;animation:cbwnBlink 1.2s steps(1) infinite}',
    '.paused .cbwn-ses .st{color:var(--texte-sec,#4A4A4A)}',
    '.paused .cbwn-ses .st .pst{animation:none;border-radius:0}',
    '@keyframes cbwnBlink{50%{opacity:.15}}',
    '.cbwn-timer{font-size:clamp(72px,9vw,128px);font-weight:900;font-stretch:70%;line-height:.8;letter-spacing:-.05em;font-variant-numeric:tabular-nums;white-space:nowrap;margin-top:12px}',
    '.cbwn-timer .c{display:inline-block;width:.12em;height:.5em;margin:0 .06em;vertical-align:.06em;background:linear-gradient(var(--n-or) 0 0) top/100% .12em no-repeat,linear-gradient(var(--n-or) 0 0) bottom/100% .12em no-repeat}',
    '.paused .cbwn-timer{color:var(--texte-sec,#4A4A4A)}.paused .cbwn-timer .c{background-image:linear-gradient(currentColor 0 0),linear-gradient(currentColor 0 0)}',
    '.cbwn-bars{display:flex;gap:7px;align-items:center;height:72px}',
    '.cbwn-bars i{display:block;width:14px;height:72px;background:var(--n-or);transform:scaleY(.22);transition:transform .12s linear}',
    '.paused .cbwn-bars i{background:var(--texte-sec,#4A4A4A)}',
    '.cbwn-words{font-family:var(--mono,monospace);font-size:13px;font-variant-numeric:tabular-nums;margin-top:12px}',
    '.cbwn-words b{font-weight:700}',
    '.cbwn-ses .acts{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:170px}',
    '.cbwn-ses .keys{grid-column:1/-1;font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A);padding-top:12px;border-top:1px solid color-mix(in srgb,var(--n-or) 30%,transparent);margin-top:6px}',
    '@media (max-width:860px){.cbwn-ses{grid-template-columns:1fr}.cbwn-ses .acts{flex-direction:row;flex-wrap:wrap}.cbwn-bars{height:48px}.cbwn-bars i{height:48px}}',
    /* processing inside the panel */
    '.cbwn-today.proc{background:var(--fond-2,#F4F4F2);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bleu,#2B3BFF) 40%,transparent)}',
    '.cbwn-pro{padding:6px 4px 4px}',
    '.cbwn-pro .st{color:var(--bleu,#2B3BFF)}',
    '.cbwn-pro h2{margin:16px 0 20px;font-size:clamp(34px,4vw,52px);font-weight:900;font-stretch:80%;letter-spacing:-.035em;line-height:.95}',
    '.cbwn .shim{background:linear-gradient(90deg,var(--texte,#111) 0 40%,var(--texte-sec,#888) 50%,var(--texte,#111) 60% 100%) 0/300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cbwnSh 1.6s linear infinite}',
    '@keyframes cbwnSh{from{background-position:100% 0}to{background-position:0 0}}',
    '.cbwn-prog{height:3px;background:var(--fil,#ddd);position:relative;overflow:hidden}',
    '.cbwn-prog i{position:absolute;inset:0;background:var(--bleu,#2B3BFF);transform-origin:left;transition:transform var(--d-moyen,.35s) var(--ease-barre,cubic-bezier(.7,0,.2,1))}',
    '.cbwn-prog.ind i{width:30%;animation:cbwnInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite}',
    '@keyframes cbwnInd{from{transform:translateX(-100%)}to{transform:translateX(340%)}}',
    '.cbwn-steps{display:flex;gap:20px;margin-top:14px;flex-wrap:wrap}',
    '.cbwn-steps .lbl.on{color:var(--bleu,#2B3BFF)}.cbwn-steps .lbl.ok{color:var(--texte,#111)}',
    '.cbwn-pro .sum{margin-top:14px;font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#4A4A4A)}',
    '.cbwn-pro.err .st{color:var(--erreur,#B3261E)}.cbwn-pro.err p{margin:0 0 18px;color:var(--texte-sec,#4A4A4A)}',
    /* tabs */
    '.cbwn-tabs{display:flex;align-items:center;gap:8px;margin-top:36px;border-bottom:1px solid var(--fil,#ddd);position:relative}',
    '.cbwn-tabs .tab{appearance:none;background:none;border:0;font:inherit;font-weight:800;font-size:15px;color:var(--texte-sec,#4A4A4A);padding:10px 2px 12px;margin-right:22px;cursor:pointer}',
    '.cbwn-tabs .tab[aria-selected="true"]{color:var(--texte,#111)}',
    '.cbwn-tabs .ind{position:absolute;left:0;bottom:-1px;height:2px;width:0;background:var(--texte,#111);transition:transform .32s var(--n-ease),width .32s var(--n-ease)}',
    '.cbwn-tabs .sp{flex:1}',
    '.cbwn-tabs .srch{display:flex;align-items:center;gap:4px}',
    '.cbwn-tabs input{width:0;opacity:0;height:34px;border:1px solid var(--fil,#ddd);border-radius:var(--n-r);background:var(--surface,#fff);color:var(--texte,#111);font:inherit;font-size:14px;padding:0 10px;transition:width .3s var(--n-ease),opacity .2s}',
    '.cbwn-tabs .srch.on input{width:min(260px,40vw);opacity:1}',
    '.cbwn-tabs input:focus{outline:3px solid var(--focus,#2B3BFF);outline-offset:1px;border-color:var(--texte,#111)}',
    /* rows */
    '.cbwn-day{margin:26px 0 6px;padding:0 10px}',
    '.cbwn-rows{list-style:none;margin:0;padding:0}',
    '.cbwn-row{width:100%;display:flex;align-items:center;gap:14px;min-height:56px;padding:8px 10px;border:0;border-radius:var(--n-r2);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background var(--d-rapide,.15s)}',
    '.cbwn-row:hover{background:color-mix(in srgb,var(--fond-2,#F4F4F2) 70%,transparent)}',
    '.cbwn-today .cbwn-row:hover{background:var(--fond,#fff)}',
    '.cbwn-row[aria-current="true"]{background:var(--fond-2,#F4F4F2)}',
    '.cbwn-today .cbwn-row[aria-current="true"]{background:var(--fond,#fff)}',
    '.cbwn-row .ic{width:36px;height:36px;border-radius:var(--n-r);background:var(--fond-2,#F4F4F2);display:grid;place-items:center;color:var(--texte-sec,#4A4A4A);flex:none}',
    '.cbwn-row[aria-current="true"] .ic,.cbwn-today .cbwn-row .ic{background:var(--fond,#fff)}',
    '.cbwn-today .cbwn-row[aria-current="true"] .ic{background:var(--fond-2,#F4F4F2)}',
    '.cbwn-row .t{flex:1;min-width:0;font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cbwn-row .raw{font-family:var(--mono,monospace);font-size:10px;font-weight:700;letter-spacing:.06em;margin-left:8px;padding:2px 5px;border-radius:3px;background:var(--n-f3);color:var(--texte-sec,#4A4A4A);vertical-align:2px}',
    '.cbwn-row .m{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#4A4A4A);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.cbwn-row .m.d{min-width:64px;text-align:right}',
    '@media (max-width:760px){.cbwn-row .m:not(.d){display:none}}',
    '.cbwn-none{padding:28px 10px;color:var(--texte-sec,#4A4A4A);font-size:14px}',
    '.cbwn-load{padding:28px 10px}',
    /* side: detail */
    '.cbwn-det{padding:28px 28px 48px}',
    '.cbwn-det .back{margin:-6px 0 14px -6px}',
    '.cbwn-det h2.ti{margin:0;font-size:24px;font-weight:800;line-height:1.15;letter-spacing:-.02em}',
    '.cbwn-det .when{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#4A4A4A);margin-top:8px}',
    '.cbwn-det .meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}',
    '.cbwn-det .chip{font-family:var(--mono,monospace);font-size:11px;font-weight:500;padding:3px 7px;border-radius:3px;background:var(--fond-2,#F4F4F2);color:var(--texte-sec,#4A4A4A)}',
    '.cbwn-det .chip.ok{background:color-mix(in srgb,var(--vert,#1FD26A) 22%,var(--fond,#fff));color:var(--texte,#111)}',
    '.cbwn-det .acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:14px 0;margin:18px 0 22px;border-top:1px solid var(--fil,#ddd);border-bottom:1px solid var(--fil,#ddd);position:sticky;top:0;background:var(--fond,#fff);z-index:2}',
    '.cbwn-det .acts .sp{flex:1}',
    '.cbwn-det .warn{font-size:13px;color:var(--texte-sec,#4A4A4A);background:var(--fond-2,#F4F4F2);border-radius:var(--n-r);padding:10px 12px;margin:0 0 18px}',
    '.cbwn-det .path{font-family:var(--mono,monospace);font-size:11px;color:var(--texte-sec,#4A4A4A);word-break:break-all;margin-top:22px}',
    '@media (max-width:1099px){.cbwn-det{max-width:820px;margin:0 auto;padding:28px clamp(20px,4vw,48px) 64px}.cbwn-det h2.ti{font-size:32px}}',
    '.cbwn-ph{height:100%;min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;color:var(--texte-sec,#4A4A4A);font-size:14px}',
    '.cbwn-mini{display:flex;gap:5px;align-items:center;height:44px;margin-bottom:16px}',
    '.cbwn-mini i{display:block;width:8px;background:var(--fil,#ddd)}',
    '.cbwn-mini i:nth-child(1),.cbwn-mini i:nth-child(5){height:16px}.cbwn-mini i:nth-child(2),.cbwn-mini i:nth-child(4){height:28px}.cbwn-mini i:nth-child(3){height:44px;background:var(--n-or)}',
    /* markdown */
    '.cbwn-md{font-size:15px;line-height:1.6}',
    '.cbwn-md h1,.cbwn-md h2{font-size:19px;font-weight:900;font-stretch:90%;letter-spacing:-.02em;line-height:1.15;margin:28px 0 8px}',
    '.cbwn-md h3{font-size:16px;font-weight:800;margin:20px 0 6px;line-height:1.3}',
    '.cbwn-md h4{font-family:var(--mono,monospace);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:18px 0 6px;color:var(--texte-sec,#4A4A4A)}',
    '.cbwn-md>:first-child{margin-top:0}',
    '.cbwn-md p{margin:0 0 12px}',
    '.cbwn-md ul,.cbwn-md ol{margin:0 0 12px;padding-left:22px}',
    '.cbwn-md li{margin:3px 0}',
    '.cbwn-md li>ul,.cbwn-md li>ol{margin:3px 0}',
    '.cbwn-md ul{list-style:none}',
    '.cbwn-md ul>li{position:relative}',
    '.cbwn-md ul>li::before{content:"";position:absolute;left:-16px;top:.66em;width:6px;height:6px;background:var(--texte,#111)}',
    '.cbwn-md ul ul>li::before{background:none;box-shadow:inset 0 0 0 1.5px var(--texte,#111)}',
    '.cbwn-md li.tk::before{display:none}',
    '.cbwn-md .bx{position:absolute;left:-22px;top:.3em;width:15px;height:15px;border:1.5px solid var(--texte,#111);border-radius:2px;display:block}',
    '.cbwn-md li.tk.dn>.bx{background:var(--n-ink);border-color:var(--n-ink)}',
    '.cbwn-md li.tk.dn>.bx::after{content:"";position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid var(--n-ink-t);border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '.cbwn-md li.tk.dn>.tx{color:var(--texte-sec,#4A4A4A);text-decoration:line-through;text-decoration-thickness:1px}',
    '.cbwn-md strong{font-weight:800}',
    '.cbwn-md code{font-family:var(--mono,monospace);font-size:.86em;background:var(--fond-2,#F4F4F2);padding:1px 5px;border-radius:3px}',
    '.cbwn-md pre{font-family:var(--mono,monospace);font-size:12px;background:var(--fond-2,#F4F4F2);padding:12px 14px;overflow:auto;margin:0 0 12px;border-radius:var(--n-r)}',
    '.cbwn-md pre code{background:none;padding:0}',
    '.cbwn-md blockquote{margin:0 0 12px;padding:2px 0 2px 14px;border-left:3px solid var(--fil,#ddd);color:var(--texte-sec,#4A4A4A)}',
    '.cbwn-md hr{border:0;border-top:1px solid var(--fil,#ddd);margin:22px 0}',
    '.cbwn-raw{margin-top:32px;border-top:1px solid var(--fil,#ddd)}',
    '.cbwn-raw summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 0;font-weight:800;font-size:14px}',
    '.cbwn-raw summary::-webkit-details-marker{display:none}',
    '.cbwn-raw summary .pl{width:26px;height:26px;border-radius:var(--n-r);display:grid;place-items:center;background:var(--fond-2,#F4F4F2);transition:transform var(--d-moyen,.35s) var(--n-ease)}',
    '.cbwn-raw[open] summary .pl{transform:rotate(45deg)}',
    '.cbwn-raw .txt{white-space:pre-wrap;font-size:13px;line-height:1.65;color:var(--texte-sec,#4A4A4A);padding-bottom:12px}',
    /* modal + toast */
    '.cbwn-scrim{min-height:0;position:fixed;inset:0;z-index:50;background:rgba(17,17,17,.45);display:grid;place-items:center;padding:24px;animation:cbwnFade .2s var(--n-ease) both}',
    '@keyframes cbwnFade{from{opacity:0}}',
    '.cbwn-dlg{width:min(460px,100%);background:var(--surface,#fff);color:var(--texte,#111);border:1px solid var(--fil,#ddd);border-radius:var(--n-r2);box-shadow:0 18px 50px rgba(0,0,0,.18);padding:24px;animation:cbwnIn .3s var(--n-ease) both}',
    '.cbwn-dlg h2{margin:12px 0 8px;font-size:22px;font-weight:900;font-stretch:88%;letter-spacing:-.025em;line-height:1.1}',
    '.cbwn-dlg p{margin:0;color:var(--texte-sec,#4A4A4A);font-size:14px}',
    '.cbwn-dlg .ft{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;flex-wrap:wrap}',
    '.cbwn-toast{min-height:0;line-height:1.3;position:fixed;right:24px;bottom:24px;z-index:60;background:var(--n-ink);color:var(--n-ink-t);border-radius:var(--n-r);font-family:var(--mono,monospace);font-size:13px;font-weight:500;padding:11px 14px;display:flex;align-items:center;gap:10px;animation:cbwnToast .2s var(--n-ease) both}',
    '.cbwn-toast .pst{color:var(--vert,#1FD26A);margin:0}',
    '.cbwn-toast.err .pst{color:var(--erreur,#FF6B5E)}',
    '.cbwn-toast.out{animation:cbwnToastOut .2s var(--n-ease) forwards}',
    '@keyframes cbwnToast{from{opacity:0;transform:translateY(10px)}}',
    '@keyframes cbwnToastOut{to{opacity:0;transform:translateY(10px)}}',
    '@media (prefers-reduced-motion:reduce){.cbwn *,.cbwn-scrim,.cbwn-dlg,.cbwn-toast{animation:none!important;transition:none!important}.cbwn .shim{color:var(--texte,#111);background:none}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('cbwn-css')) return;
    var s = document.createElement('style');
    s.id = 'cbwn-css';
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
  function store(k, v) {
    try { if (v === undefined) return window.localStorage.getItem(k); window.localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  var TABS = [{ id: 'past', label: 'Notes passées' }]; // une 2e vue (ex. « Partagées ») pourra s'ajouter ici

  /* ---------- mount ---------- */
  function mount(container, opts) {
    injectCSS();
    opts = opts || {};
    var api = opts.api || null;
    var navigate = typeof opts.navigate === 'function' ? opts.navigate : function () {};
    function has(m) { return !!(api && typeof api[m] === 'function'); }
    var CORE = has('listNotes') && has('getNote');

    var root = document.createElement('div');
    root.className = 'cbwn';
    container.innerHTML = '';
    container.appendChild(root);

    // mode: 'idle' | 'session' | 'processing' — the « Aujourd'hui » panel
    var st = { mode: 'idle', notes: null, listErr: null, q: '', searchOn: false, tab: 'past', sel: null, note: null, noteErr: null,
      prog: null, progAt: 0, reorgId: null, busy: false, alive: true, introOff: store('cbwn.introSkipped') === '1' };
    var tick = 0, raf = 0, toastT = 0, modal = null, lastNav = '';

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
      var old = document.querySelector('.cbwn-toast'); if (old) old.remove();
      var t = document.createElement('div');
      t.className = 'cbwn cbwn-toast' + (isErr ? ' err' : '');
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
        sc.className = 'cbwn cbwn-scrim';
        sc.innerHTML = '<div class="cbwn-dlg" role="alertdialog" aria-modal="true" aria-labelledby="cbwn-dt" aria-describedby="cbwn-dd">' +
          '<div class="lbl">' + esc(o.label || 'Confirmation') + '</div>' +
          '<h2 id="cbwn-dt">' + esc(o.title) + '</h2><p id="cbwn-dd">' + esc(o.body) + '</p>' +
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

    /* ---- skeleton ---- */
    function render() {
      root.innerHTML = '<div class="cbwn-grid">' +
        '<section class="cbwn-main">' + headerHTML() + '<div class="cbwn-today" data-r="today"></div>' +
        '<div class="cbwn-tabs" role="tablist">' + TABS.map(function (t) {
          return '<button class="tab" role="tab" data-act="tab" data-id="' + t.id + '" aria-selected="' + (st.tab === t.id) + '">' + esc(t.label) + '</button>';
        }).join('') + '<span class="ind" aria-hidden="true"></span><span class="sp"></span>' +
        '<span class="srch' + (st.searchOn ? ' on' : '') + '"><input type="search" placeholder="Rechercher" aria-label="Rechercher une note" data-act="q" autocomplete="off" spellcheck="false" value="' + esc(st.q) + '" tabindex="' + (st.searchOn ? 0 : -1) + '">' +
        '<button class="btn bi" data-act="search" aria-label="Rechercher" aria-pressed="' + st.searchOn + '"' + (CORE ? '' : ' disabled') + '>' + I.search + '</button></span></div>' +
        '<div data-r="list"></div></section>' +
        '<aside class="cbwn-side" data-r="side" aria-label="Note sélectionnée"></aside></div>';
      renderToday(); renderList(); renderSide(); placeInd();
    }
    function headerHTML() {
      return '<header class="cbwn-hd"><h1>Prise de notes</h1><div class="r">' +
        '<span class="hint"><kbd>Control gauche</kbd> ×3</span>' +
        '<button class="btn bi" data-act="settings" aria-label="Réglages de la prise de notes" title="Réglages">' + I.gear + '</button>' +
        '<button class="btn brec" data-act="start"' + (has('startNote') ? '' : ' disabled') + '><span class="dot"></span>Démarrer une note</button>' +
        '</div></header>';
    }
    function placeInd() {
      var t = $('.cbwn-tabs .tab[aria-selected="true"]'), ind = $('.cbwn-tabs .ind');
      if (!t || !ind) return;
      ind.style.width = t.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + t.offsetLeft + 'px)';
    }
    function setStartDisabled() {
      var b = $('[data-act="start"]'); if (b) b.disabled = !has('startNote') || st.mode !== 'idle';
    }

    /* ---- rows ---- */
    function rowHTML(n, showDay) {
      return '<li><button class="cbwn-row" data-act="open" data-id="' + esc(n.id) + '"' + (st.sel === n.id ? ' aria-current="true"' : '') + '>' +
        '<span class="ic">' + I.doc + '</span>' +
        '<span class="t">' + esc(n.title || 'Note sans titre') + (n.provider === 'passthrough' ? '<span class="raw">BRUT</span>' : '') + '</span>' +
        '<span class="m">' + esc(dur(n.durationMs)) + ' · ' + esc(words(n.words)) + '</span>' +
        '<span class="m d">' + esc(showDay ? dayLabel(n.createdAt) : timeOf(n.createdAt)) + '</span></button></li>';
    }
    var todayKey = function () { return dayKey(new Date().toISOString()); };

    /* ---- « Aujourd'hui » panel: idle / live session / processing ---- */
    function renderToday() {
      var el = $('[data-r="today"]'); if (!el) return;
      stopLoops();
      el.className = 'cbwn-today';
      setStartDisabled();
      if (st.mode === 'session') return renderSession(el);
      if (st.mode === 'processing') return renderProcessing(el);
      var h = '<span class="lbl">Aujourd’hui</span>';
      if (!CORE) {
        h += '<div class="cbwn-off"><b>Indisponible.</b> La prise de notes n’est pas disponible dans cette version de CBW AI. Mets l’application à jour pour l’utiliser.</div>';
        el.innerHTML = h; return;
      }
      var all = st.notes || [];
      if (!st.introOff && st.notes && has('startNote')) {
        h += '<div class="cbwn-intro in"><span class="ic">' + I.mic + '</span><div class="tx"><b>Essaie la prise de notes — 2 min pour découvrir</b>' +
          '<span>Parle librement : CBW transcrit au fil de l’eau, puis range tes idées dans une note.</span></div>' +
          '<div class="ac"><button class="btn b3" data-act="skip">Passer</button><button class="btn b1" data-act="start">Démarrer <span class="ar">→</span></button></div></div>';
      }
      var tk = todayKey(), today = all.filter(function (n) { return dayKey(n.createdAt) === tk; });
      if (!st.notes) h += '<div class="cbwn-load lbl">Chargement…</div>';
      else if (today.length) h += '<ul class="cbwn-rows">' + today.map(function (n) { return rowHTML(n, false); }).join('') + '</ul>';
      else h += '<div class="cbwn-zero"><span class="ic">' + I.cal + '</span><b>Aucune note aujourd’hui</b>' +
        '<p>Lance une note pendant un appel, une réunion ou une réflexion à voix haute.</p></div>';
      el.innerHTML = h;
    }

    /* session */
    function elapsed() {
      var p = st.prog || {};
      return (p.elapsedMs || 0) + (p.state === 'recording' ? performance.now() - st.progAt : 0);
    }
    function renderSession(el) {
      var p = st.prog || { state: 'recording' }, paused = p.state === 'paused';
      el.className = 'cbwn-today live' + (paused ? ' paused' : '');
      el.innerHTML = '<div class="cbwn-ses in">' +
        '<div><div class="lbl st"><span class="pst"></span>' + (paused ? 'En pause' : 'Enregistrement en cours') + '</div>' +
        '<div class="cbwn-timer" data-s="tm" role="timer" aria-label="Durée"></div><div class="cbwn-words" data-s="wd"></div></div>' +
        '<div class="cbwn-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="acts">' +
        '<button class="btn b1 lg" data-act="stop"' + (has('stopNote') ? '' : ' disabled') + '>Terminer <span class="ar">→</span></button>' +
        '<button class="btn b2 lg" data-act="pause"' + (has(paused ? 'resumeNote' : 'pauseNote') ? '' : ' disabled') + '>' + (paused ? 'Reprendre' : 'Pause') + '</button>' +
        '<button class="btn b3" data-act="cancel"' + (has('cancelNote') ? '' : ' disabled') + '>Annuler</button></div>' +
        '<div class="keys"><kbd>Control gauche</kbd> pour terminer · <kbd>Échap</kbd> pour annuler · rien n’est collé pendant la note</div></div>';
      updateSession();
      tick = setInterval(updateSession, 250);
      animBars();
    }
    function updateSession() {
      var p = st.prog || {}, tm = $('[data-s="tm"]'), wd = $('[data-s="wd"]');
      if (!tm) return;
      var txt = clock(elapsed()), html = txt.split(':').map(esc).join('<span class="c"></span>');
      if (tm.innerHTML !== html) { tm.innerHTML = html; tm.setAttribute('aria-label', 'Durée ' + txt); }
      var w = '<b>' + esc(num(p.words)) + '</b> mot' + ((p.words || 0) > 1 ? 's' : '') + ' transcrits';
      if (wd.innerHTML !== w) wd.innerHTML = w;
    }
    function animBars() {
      var bars = [].slice.call(root.querySelectorAll('.cbwn-bars i'));
      var shape = [.55, .8, 1, .8, .55], cur = [0, 0, 0, 0, 0];
      if (reduced) { bars.forEach(function (b, i) { b.style.transform = 'scaleY(' + (.2 + .3 * shape[i]) + ')'; }); return; }
      function frame(t) {
        if (st.mode !== 'session') return;
        var p = st.prog || {}, paused = p.state === 'paused';
        var lv = typeof p.level === 'number' ? Math.max(0, Math.min(1, p.level)) : null;
        for (var i = 0; i < 5; i++) {
          var target;
          if (paused) target = .16;
          else if (lv != null) target = .12 + lv * shape[i] * (.75 + .25 * Math.sin(t / 90 + i * 1.7));
          else target = .18 + .14 * (1 + Math.sin(t / 520 + i * .9)) / 2 * shape[i]; // idle doux sans niveau micro
          cur[i] += (target - cur[i]) * .35;
          bars[i].style.transform = 'scaleY(' + Math.max(.08, Math.min(1, cur[i])).toFixed(3) + ')';
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    /* processing */
    function renderProcessing(el) {
      var p = st.prog || { state: 'transcribing' };
      el.className = 'cbwn-today proc';
      if (p.state === 'error') {
        el.innerHTML = '<div class="cbwn-pro err in"><div class="lbl st"><span class="pst"></span>Erreur</div>' +
          '<h2>La note n’a pas pu être terminée</h2><p>' + esc(p.message || 'Une erreur inattendue est survenue.') + '</p>' +
          '<button class="btn b2" data-act="dismiss">Fermer</button></div>';
        return;
      }
      el.innerHTML = '<div class="cbwn-pro in" aria-live="polite"><div class="lbl st"><span class="pst"></span>Traitement IA</div>' +
        '<h2 class="shim" data-s="h"></h2><div class="cbwn-prog" data-s="pg"><i></i></div>' +
        '<div class="cbwn-steps" data-s="steps"></div><div class="sum" data-s="sum"></div></div>';
      updateProcessing();
    }
    function updateProcessing() {
      var p = st.prog || {}, h = $('[data-s="h"]');
      if (p.state === 'error' || !h) { renderToday(); return; }
      var org = p.state === 'organizing', total = p.total || 3, step = Math.min(p.step || 1, total);
      var label = org ? 'Organisation ' + step + '/' + total + '…' : 'Transcription…';
      if (h.textContent !== label) h.textContent = label;
      var pg = $('[data-s="pg"]');
      if (!org) { pg.classList.add('ind'); pg.firstChild.style.transform = ''; }
      else { pg.classList.remove('ind'); pg.firstChild.style.transform = 'scaleX(' + ((step - .5) / total).toFixed(3) + ')'; }
      $('[data-s="steps"]').innerHTML = '<span class="lbl ' + (org ? 'ok' : 'on') + '">' + (org ? '✓ ' : '') + 'Transcription</span>' +
        '<span class="lbl' + (org ? ' on' : '') + '">Organisation</span><span class="lbl">Note</span>';
      var bits = [];
      if (p.elapsedMs) bits.push(durLong(p.elapsedMs));
      if (p.words) bits.push(words(p.words));
      if (p.message) bits.push(p.message);
      $('[data-s="sum"]').textContent = bits.join(' · ');
    }

    /* ---- past notes list (grouped by day) ---- */
    function renderList() {
      var el = $('[data-r="list"]'); if (!el) return;
      if (!CORE) { el.innerHTML = '<div class="cbwn-none">Aucune note.</div>'; return; }
      if (st.listErr) { el.innerHTML = '<div class="cbwn-none">Impossible de lire tes notes : ' + esc(st.listErr) + ' <button class="btn b3" data-act="reload">Réessayer</button></div>'; return; }
      if (!st.notes) { el.innerHTML = '<div class="cbwn-load lbl">Chargement…</div>'; return; }
      var q = fold(st.q.trim()), tk = todayKey();
      var list = st.notes.filter(function (n) { return q ? fold(n.title).indexOf(q) !== -1 : dayKey(n.createdAt) !== tk; });
      if (!list.length) {
        el.innerHTML = '<div class="cbwn-none">' + (q ? 'Aucune note ne correspond à « ' + esc(st.q.trim()) + ' ».' : (st.notes.length ? 'Pas d’autre note pour l’instant.' : 'Tes notes terminées apparaîtront ici, classées par jour.')) + '</div>';
        return;
      }
      var h = '', cur = null;
      list.forEach(function (n) {
        var k = dayKey(n.createdAt);
        if (k !== cur) { if (cur !== null) h += '</ul>'; cur = k; h += '<div class="cbwn-day lbl">' + esc(k === tk ? 'Aujourd’hui' : dayLabel(n.createdAt)) + '</div><ul class="cbwn-rows">'; }
        h += rowHTML(n, false);
      });
      el.innerHTML = h + '</ul>';
    }
    function markSel() {
      [].forEach.call(root.querySelectorAll('.cbwn-row'), function (r) {
        if (r.getAttribute('data-id') === st.sel) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
      });
      var g = $('.cbwn-grid'); if (g) g.classList.toggle('has-sel', !!st.sel);
    }
    function loadList() {
      if (!CORE) { st.notes = []; renderToday(); renderList(); return Promise.resolve(); }
      return call('listNotes').then(function (list) {
        st.listErr = null;
        st.notes = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }, function (e) { st.listErr = errMsg(e); })
        .then(function () { if (!st.alive) return; if (st.mode === 'idle') renderToday(); renderList(); });
    }

    /* ---- right panel: note detail ---- */
    function renderSide() {
      var el = $('[data-r="side"]'); if (!el) return;
      markSel();
      if (!st.sel) {
        el.innerHTML = '<div class="cbwn-ph"><div class="cbwn-mini" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
          (st.notes && st.notes.length ? 'Sélectionne une note pour la lire ici.' : 'Ta prochaine note s’affichera ici.') + '</div>';
        return;
      }
      var back = '<button class="btn b3 back" data-act="back">← Prise de notes</button>';
      if (st.noteErr) { el.innerHTML = '<div class="cbwn-det">' + back + '<div class="cbwn-none">' + esc(st.noteErr) + '</div></div>'; return; }
      var n = st.note;
      if (!n || !n.meta || n.meta.id !== st.sel) { el.innerHTML = '<div class="cbwn-det">' + back + '<div class="cbwn-load lbl">Chargement…</div></div>'; return; }
      var m = n.meta, md = String(n.markdown || '');
      var mt = /^\s*#\s+(.+)\n?/.exec(md); // évite le titre en double
      if (mt && fold(mt[1].trim()) === fold(m.title || '')) md = md.slice(mt[0].length);
      var raw = m.provider === 'passthrough';
      var dis = function (k) { return has(k) ? '' : ' disabled'; };
      el.innerHTML = '<article class="cbwn-det in">' + back +
        '<h2 class="ti">' + esc(m.title || 'Note sans titre') + '</h2>' +
        '<div class="when">' + esc(longDate(m.createdAt)) + '</div>' +
        '<div class="meta"><span class="chip">' + esc(clock(m.durationMs)) + '</span><span class="chip">' + esc(words(m.words)) + '</span>' +
        '<span class="chip' + (raw ? '' : ' ok') + '">' + esc(raw ? 'Transcription brute' : prov(m.provider)) + '</span></div>' +
        '<div class="acts"><button class="btn b2" data-act="copy"' + dis('copyNote') + '>Copier</button>' +
        '<button class="btn b2" data-act="reveal"' + dis('revealNote') + '>Finder</button>' +
        '<button class="btn b2" data-act="reorg"' + dis('reorganizeNote') + (st.mode === 'idle' ? '' : ' disabled') + '>Réorganiser</button><span class="sp"></span>' +
        '<button class="btn b3 danger" data-act="del"' + dis('deleteNote') + '>Supprimer</button></div>' +
        (raw ? '<p class="warn">Aucun moteur IA n’était disponible : voici la transcription telle quelle. « Réorganiser » la reprend quand un moteur est prêt.</p>' : '') +
        '<div class="cbwn-md">' + (md.trim() ? renderMarkdown(md) : '<p>Cette note est vide.</p>') + '</div>' +
        (n.transcript ? '<details class="cbwn-raw"><summary>Transcription brute <span class="pl" aria-hidden="true">+</span></summary><div class="txt">' + esc(n.transcript) + '</div></details>' : '') +
        (m.path ? '<div class="path">' + esc(m.path) + '</div>' : '') + '</article>';
      el.scrollTop = 0;
    }
    function openNote(id) {
      if (!CORE || !id) return;
      st.sel = id; st.noteErr = null;
      if (!st.note || st.note.meta.id !== id) st.note = null;
      renderSide(); go('#notes:' + id);
      call('getNote', id).then(function (n) {
        if (!st.alive || st.sel !== id) return;
        if (!n || !n.meta) throw new Error('Note introuvable.');
        st.note = n; renderSide();
      }).catch(function (e) { if (st.sel === id) { st.noteErr = errMsg(e); renderSide(); } });
    }
    function closeNote() { st.sel = null; st.note = null; renderSide(); go('#notes'); }

    /* ---- actions ---- */
    function setMode(mode) { st.mode = mode; renderToday(); var r = $('[data-act="reorg"]'); if (r) r.disabled = mode !== 'idle' || !has('reorganizeNote'); }
    function startSession() {
      if (!has('startNote') || st.busy || st.mode !== 'idle') return;
      st.busy = true;
      if (!st.introOff) { st.introOff = true; store('cbwn.introSkipped', '1'); }
      st.prog = { state: 'recording', elapsedMs: 0, words: 0 }; st.progAt = performance.now();
      setMode('session'); go(st.sel ? '#notes:' + st.sel : '#notes');
      call('startNote').catch(function (e) { toast('Impossible de démarrer : ' + errMsg(e), true); setMode('idle'); })
        .then(function () { st.busy = false; });
    }
    function togglePause() {
      var paused = st.prog && st.prog.state === 'paused';
      st.prog = Object.assign({}, st.prog, { state: paused ? 'recording' : 'paused', elapsedMs: elapsed() }); st.progAt = performance.now();
      renderToday();
      call(paused ? 'resumeNote' : 'pauseNote').catch(function (e) { toast(errMsg(e), true); });
    }
    function stopSession() {
      st.prog = Object.assign({}, st.prog, { state: 'transcribing', elapsedMs: elapsed() });
      setMode('processing');
      call('stopNote').catch(function (e) { st.prog = { state: 'error', message: errMsg(e) }; renderToday(); });
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
        st.reorgId = id;
        st.prog = { state: 'organizing', step: 1, total: 3, elapsedMs: st.note.meta.durationMs, words: st.note.meta.words };
        setMode('processing');
        call('reorganizeNote', id).then(function () {
          if (st.alive && st.reorgId === id && st.mode === 'processing') { st.reorgId = null; setMode('idle'); toast('Note réorganisée'); loadList(); openNote(id); }
        }, function (e) { st.reorgId = null; setMode('idle'); toast(errMsg(e), true); });
      } else if (act === 'del') {
        confirmModal({ label: 'Supprimer', title: 'Supprimer « ' + (st.note.meta.title || 'cette note') + ' » ?', body: 'La note et sa transcription brute seront supprimées du Mac. Cette action est définitive.', no: 'Garder', yes: 'Supprimer', danger: true })
          .then(function (ok) {
            if (!ok) return;
            call('deleteNote', id).then(function () {
              st.notes = (st.notes || []).filter(function (n) { return n.id !== id; });
              closeNote(); renderToday(); renderList(); loadList(); toast('Note supprimée');
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
        if (st.mode !== 'session' || prev !== p.state) setMode('session'); else updateSession();
      } else if (p.state === 'transcribing' || p.state === 'organizing') {
        if (st.mode !== 'processing') setMode('processing'); else updateProcessing();
      } else if (p.state === 'done') {
        var id = p.noteId || st.reorgId; st.reorgId = null;
        setMode('idle');
        if (p.message) toast(p.message); else toast('Note prête');
        loadList().then(function () { if (id) { st.note = null; openNote(id); } });
      } else if (p.state === 'error') {
        st.reorgId = null;
        if (st.mode !== 'idle') { st.mode = 'processing'; renderToday(); }
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
      else if (a === 'pause') togglePause();
      else if (a === 'stop') stopSession();
      else if (a === 'cancel') cancelSession();
      else if (a === 'back') closeNote();
      else if (a === 'skip') { st.introOff = true; store('cbwn.introSkipped', '1'); renderToday(); }
      else if (a === 'dismiss') { st.prog = null; setMode('idle'); }
      else if (a === 'settings') go('#reglages');
      else if (a === 'reload') { st.listErr = null; st.notes = null; renderList(); loadList(); }
      else if (a === 'tab') { st.tab = b.getAttribute('data-id'); [].forEach.call(root.querySelectorAll('.cbwn-tabs .tab'), function (t) { t.setAttribute('aria-selected', t === b); }); placeInd(); renderList(); }
      else if (a === 'search') toggleSearch(!st.searchOn);
      else if (a !== 'q') noteAction(a);
    }
    function toggleSearch(on) {
      st.searchOn = on;
      var s = $('.cbwn-tabs .srch'), i = s.querySelector('input'), b = s.querySelector('[data-act="search"]');
      s.classList.toggle('on', on); b.setAttribute('aria-pressed', on); i.tabIndex = on ? 0 : -1;
      if (on) i.focus(); else if (st.q) { st.q = ''; i.value = ''; renderList(); }
    }
    function onInput(e) {
      if (e.target.getAttribute('data-act') !== 'q') return;
      st.q = e.target.value; renderList(); markSel();
    }
    function onKey(e) {
      if (!st.alive || !root.isConnected) return;
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === 'Escape') {
        if (modal) { e.preventDefault(); closeModal(false); return; }
        if (st.mode === 'session') { e.preventDefault(); cancelSession(); return; }
        if (typing && st.searchOn) { e.preventDefault(); toggleSearch(false); return; }
        if (st.sel) { e.preventDefault(); closeNote(); }
        return;
      }
      if (modal || typing) return;
      if (e.key === '/' && CORE) { e.preventDefault(); toggleSearch(true); }
      else if (e.key === 'c' && e.metaKey && st.note && !String(window.getSelection ? window.getSelection() : '').length) { e.preventDefault(); noteAction('copy'); }
    }
    function onResize() { placeInd(); }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeInd);

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
        document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
        root.remove();
      }
    };
  }

  window.CBWNotes = { mount: mount, renderMarkdown: renderMarkdown };
})();

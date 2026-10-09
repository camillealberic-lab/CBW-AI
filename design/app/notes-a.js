/* CBW AI — écran « Prise de notes », variante A (« au plus près de Wispr Flow »).
   - Une colonne centrale calme (liste) qui occupe toute la largeur utile.
   - Le panneau de lecture glisse depuis la droite UNIQUEMENT quand une note est sélectionnée
     (Échap / × pour fermer, ⤢ pour la lecture pleine page).
   - Une session = mode focus : la vue prend toute la zone de contenu, grand minuteur centré.
   - Le traitement s'affiche comme une ligne en tête de liste, puis la note s'ouvre seule.
   Vanilla JS, sans dépendance, compatible CSP (aucun handler inline, aucun eval).
   Contrat : docs/APP_API.md › Mode « Prise de notes ».
   Usage : window.CBWNotes.mount(container, { api, navigate, noteId }) → { open(id), list(), unmount() }
   Tout texte venant de l'utilisateur / du LLM passe par esc() avant d'entrer dans innerHTML. */
(function () {
  'use strict';

  /* ---------- styles (injectés une seule fois, scopés sous .cbwn) ---------- */
  var CSS = [
    '.cbwn{--n-ink:var(--encre,var(--inverse-fond,#1C1C1E));--n-ink-t:var(--inverse-texte,#fff);--n-f2:var(--fond-2,#F4F4F2);--n-f3:var(--fond-3,#ECECE8);--n-sec:var(--texte-sec,#5F5F5A);--n-fil:var(--fil,#ddd);',
    '--n-ease:var(--ease,cubic-bezier(.2,.7,.2,1));--n-out:var(--ease-sortie,cubic-bezier(.16,1,.3,1));--n-r:3px;--n-r2:4px;',
    '--n-or:var(--orange,#FF5A1F);--n-bl:var(--bleu,#2B3BFF);--n-or-bg:color-mix(in srgb,var(--n-or) 9%,var(--fond,#fff));--n-or-bg2:color-mix(in srgb,var(--n-or) 15%,var(--fond,#fff));',
    'font-family:var(--police,"Archivo",system-ui,sans-serif);color:var(--texte,#111);background:var(--fond,#fff);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}',
    '.cbwn *,.cbwn *::before,.cbwn *::after{box-sizing:border-box}',
    '.cbwn .lbl{font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--n-sec);line-height:1}',
    '.cbwn .pst{display:inline-block;width:10px;height:10px;margin-right:8px;background:currentColor;vertical-align:-1px}',
    '.cbwn kbd{font-family:var(--mono,monospace);font-size:11px;border:1px solid var(--n-fil);padding:1px 5px;color:var(--n-sec);background:var(--surface,#fff)}',
    '.cbwn :focus-visible{outline:3px solid var(--focus,#2B3BFF);outline-offset:2px}',
    '.cbwn svg{display:block;flex:none}',
    '.cbwn [hidden]{display:none!important}',
    /* buttons */
    '.cbwn .btn{appearance:none;font:inherit;font-weight:800;font-size:14px;border:0;border-radius:var(--n-r);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;text-decoration:none;transition:background var(--d-rapide,.15s),color var(--d-rapide,.15s),transform .12s,box-shadow var(--d-rapide,.15s)}',
    '.cbwn .btn:disabled{cursor:not-allowed;opacity:.42}',
    '.cbwn .btn:not(:disabled):active{transform:scale(.98)}',
    '.cbwn .b1{background:var(--n-ink);color:var(--n-ink-t);min-height:44px;padding:0 20px}',
    '.cbwn .b1:not(:disabled):hover{background:color-mix(in srgb,var(--n-ink) 86%,var(--fond,#fff))}',
    '.cbwn .ar{display:inline-block;transition:transform .2s var(--n-ease)}',
    '.cbwn .btn:not(:disabled):hover .ar{transform:translateX(4px)}',
    '.cbwn .brec{background:var(--n-or-bg2);color:var(--texte,#111);min-height:42px;padding:0 18px 0 15px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--n-or) 38%,transparent)}',
    '.cbwn .brec:not(:disabled):hover{background:color-mix(in srgb,var(--n-or) 24%,var(--fond,#fff));box-shadow:inset 0 0 0 1px var(--n-or)}',
    '.cbwn .brec .dot{width:10px;height:10px;border-radius:50%;background:var(--n-or)}',
    '.cbwn .b2{background:var(--surface,#fff);color:var(--texte,#111);min-height:36px;padding:0 14px;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1px var(--fil-fort,#C4C4BF)}',
    '.cbwn .b2:not(:disabled):hover{background:var(--n-f2);box-shadow:inset 0 0 0 1px var(--texte,#111)}',
    '.cbwn .lg{min-height:52px;padding:0 26px;font-size:15px}',
    '.cbwn .b3{background:none;color:var(--n-sec);min-height:36px;padding:0 8px;font-weight:700;font-size:13px;position:relative}',
    '.cbwn .b3::after{content:"";position:absolute;left:8px;right:8px;bottom:8px;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s var(--n-ease)}',
    '.cbwn .b3:not(:disabled):hover{color:var(--texte,#111)}',
    '.cbwn .b3:not(:disabled):hover::after{transform:scaleX(1)}',
    '.cbwn .bi{background:none;color:var(--n-sec);width:36px;height:36px;padding:0}',
    '.cbwn .bi:not(:disabled):hover,.cbwn .bi[aria-expanded="true"]{background:var(--n-f2);color:var(--texte,#111)}',
    '.cbwn .bt{background:none;color:var(--n-sec);min-height:32px;padding:0 10px;font-weight:700;font-size:13px}',
    '.cbwn .bt:not(:disabled):hover{background:var(--n-f2);color:var(--texte,#111)}',
    '.cbwn .bdanger{background:var(--erreur,#B3261E);color:#fff}',
    '.cbwn .bdanger:not(:disabled):hover{background:color-mix(in srgb,var(--erreur,#B3261E) 85%,#000)}',
    '.cbwn .in{animation:cbwnIn .42s var(--n-out) both}',
    '@keyframes cbwnIn{from{opacity:0;transform:translateY(8px)}}',

    /* ---- frame: shell (list + panel) and focus layer ---- */
    '.cbwn.na{position:relative;container:cbwn / inline-size;min-height:min(100vh,100%)}',
    '.na{--pw:clamp(400px,42cqw,700px)}',
    '.na-shell{display:flex;align-items:flex-start;min-height:100vh;transition:opacity .32s var(--n-ease),transform .42s var(--n-out),filter .32s}',
    '.na-main{flex:1 1 auto;min-width:0;overflow:hidden;container:namain / inline-size;padding:clamp(28px,4vh,56px) clamp(20px,4cqw,56px) 72px;transition:opacity .25s}',
    '.na-col{max-width:780px;margin:0 auto}',
    '.na-panel{position:sticky;top:0;height:100vh;width:0;flex:none;overflow:hidden;display:flex;justify-content:flex-end;background:var(--fond,#fff);transition:width .46s var(--n-out)}',
    '.na[data-panel="open"] .na-panel{width:var(--pw)}',
    '.na[data-panel="open"] .na-pin{border-left:1px solid var(--n-fil)}',
    '.na[data-panel="full"] .na-panel{width:100cqw}',
    '.na[data-panel="full"] .na-main{opacity:0;pointer-events:none;padding-left:0;padding-right:0}',
    '.na[data-panel="full"] .na-bar{padding-left:max(16px,calc(50% - 36ch - 44px));padding-right:max(16px,calc(50% - 36ch - 44px))}',
    '.na-pin{width:var(--pw);flex:none;height:100%;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}',
    '.na[data-panel="full"] .na-pin{width:100cqw}',
    '@container cbwn (max-width:860px){.na[data-panel="open"] .na-panel{width:100cqw}.na[data-panel="open"] .na-pin{width:100cqw}.na[data-panel="open"] .na-main{opacity:0;pointer-events:none;padding-left:0;padding-right:0}.na[data-panel="open"] .na-pin{border-left:0}.na-bar [data-act="full"]{display:none}}',
    /* focus layer (session) */
    '.na-focus{position:absolute;inset:0;z-index:5;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .32s var(--n-ease),visibility 0s .32s}',
    '.na[data-mode="session"] .na-focus{visibility:visible;opacity:1;pointer-events:auto;transition:opacity .4s var(--n-ease) .08s,visibility 0s}',
    '.na[data-mode="session"] .na-shell{opacity:0;transform:scale(.985);pointer-events:none;max-height:100vh;overflow:hidden}',
    '.na[data-mode="session"]{overflow:hidden;max-height:100vh}',

    /* ---- header ---- */
    '.na-hd{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px}',
    '.na-hd h1{margin:0;font-size:clamp(30px,4.8cqw,40px);font-weight:900;font-stretch:85%;line-height:1;letter-spacing:-.035em}',
    '.na-hd .sub{display:block;margin-top:10px}',
    '.na-hd .r{display:flex;align-items:center;gap:6px}',
    '@container namain (max-width:640px){.na-hd h1{font-size:30px}.na-hd .lgo{display:none}.na-hd{flex-wrap:nowrap}}',
    /* today block */
    '.na-today{background:var(--n-f2);border-radius:var(--n-r2);padding:16px 12px 12px}',
    '.na-today>.lbl{display:flex;justify-content:space-between;margin:2px 8px 12px}',
    '.na-zero{display:flex;align-items:center;gap:16px;padding:6px 8px 8px}',
    '.na-zero .ic{width:40px;height:40px;border-radius:var(--n-r);background:var(--fond,#fff);display:grid;place-items:center;color:var(--n-sec);flex:none}',
    '.na-zero b{display:block;font-size:15px;font-weight:800}',
    '.na-zero span{font-size:13px;color:var(--n-sec)}',
    '.na-off{background:var(--fond,#fff);border-left:3px solid var(--n-sec);padding:14px 16px;font-size:14px}',
    /* rows */
    '.na-rows{list-style:none;margin:0;padding:0}',
    '.na-row{width:100%;display:flex;align-items:center;gap:14px;min-height:58px;padding:9px 10px;border:0;border-radius:var(--n-r2);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;position:relative;transition:background var(--d-rapide,.15s)}',
    '.na-row:hover{background:var(--n-f2)}',
    '.na-today .na-row:hover{background:var(--fond,#fff)}',
    '.na-row[aria-current="true"]{background:var(--n-f3)}',
    '.na-today .na-row[aria-current="true"]{background:var(--fond,#fff);box-shadow:inset 0 0 0 1px var(--n-fil)}',
    '.na-row[aria-current="true"]::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;background:var(--texte,#111)}',
    '.na-row .ic{width:38px;height:38px;border-radius:var(--n-r);background:var(--n-f2);display:grid;place-items:center;color:var(--n-sec);flex:none}',
    '.na-today .na-row .ic,.na-row[aria-current="true"] .ic{background:var(--fond,#fff)}',
    '.na-today .na-row[aria-current="true"] .ic{background:var(--n-f2)}',
    '.na-row .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.na-row .t{font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25}',
    '.na-row .s{font-family:var(--mono,monospace);font-size:11.5px;color:var(--n-sec);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.na-row .raw{font-family:var(--mono,monospace);font-size:10px;font-weight:700;letter-spacing:.06em;margin-left:8px;padding:2px 5px;background:var(--n-f3);color:var(--n-sec);vertical-align:2px}',
    '.na-row .m{font-family:var(--mono,monospace);font-size:12px;color:var(--n-sec);font-variant-numeric:tabular-nums;white-space:nowrap;min-width:56px;text-align:right}',
    /* processing row (head of list) */
    '.na-proc{display:flex;align-items:center;gap:14px;padding:12px 10px 14px;border-radius:var(--n-r2);background:var(--fond,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--n-bl) 35%,transparent);position:relative;overflow:hidden;margin-bottom:6px}',
    '.na-proc .ic{width:38px;height:38px;border-radius:var(--n-r);background:color-mix(in srgb,var(--n-bl) 10%,var(--fond,#fff));display:flex;align-items:center;justify-content:center;gap:3px;flex:none}',
    '.na-proc .ic i{display:block;width:4px;height:16px;background:var(--n-bl);animation:naBob 1s var(--n-ease) infinite alternate}',
    '.na-proc .ic i:nth-child(2){animation-delay:.15s}.na-proc .ic i:nth-child(3){animation-delay:.3s}',
    '@keyframes naBob{from{transform:scaleY(.35)}to{transform:scaleY(1)}}',
    '.na-proc .tx{flex:1;min-width:0}',
    '.na-proc .t{font-weight:800;font-size:15px;line-height:1.25;display:block}',
    '.na-proc .s{display:block;margin-top:5px;color:var(--n-bl)}',
    '.na-proc .m{font-family:var(--mono,monospace);font-size:12px;color:var(--n-sec);white-space:nowrap}',
    '.na-proc .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:color-mix(in srgb,var(--n-bl) 14%,transparent)}',
    '.na-proc .bar i{position:absolute;inset:0;background:var(--n-bl);transform-origin:left;transform:scaleX(0);transition:transform var(--d-moyen,.35s) var(--ease-barre,cubic-bezier(.7,0,.2,1))}',
    '.na-proc .bar.ind i{width:28%;animation:cbwnInd 1.3s var(--ease-barre,cubic-bezier(.7,0,.2,1)) infinite;transform:none}',
    '@keyframes cbwnInd{from{transform:translateX(-100%)}to{transform:translateX(360%)}}',
    '.na-proc.err{box-shadow:inset 0 0 0 1px var(--erreur,#B3261E)}',
    '.na-proc.err .s{color:var(--erreur,#B3261E)}',
    '.na-proc.err .ic{background:color-mix(in srgb,var(--erreur,#B3261E) 10%,var(--fond,#fff));color:var(--erreur,#B3261E)}',
    '.cbwn .shim{background:linear-gradient(90deg,var(--texte,#111) 0 40%,var(--n-sec) 50%,var(--texte,#111) 60% 100%) 0/300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cbwnSh 1.6s linear infinite}',
    '@keyframes cbwnSh{from{background-position:100% 0}to{background-position:0 0}}',
    /* past notes head + search */
    '.na-past{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:40px 0 4px;padding:0 10px 10px;border-bottom:1px solid var(--n-fil)}',
    '.na-past h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em}',
    '.na-srch{display:flex;align-items:center;gap:8px;color:var(--n-sec);border-bottom:1px solid transparent;transition:border-color .2s}',
    '.na-srch:focus-within{border-bottom-color:var(--texte,#111);color:var(--texte,#111)}',
    '.na-srch input{appearance:none;width:min(220px,34cqw);height:32px;border:0;background:none;color:var(--texte,#111);font:inherit;font-size:14px;padding:0}',
    '.na-srch input::placeholder{color:var(--texte-3,#6E6E6A)}',
    '.na-srch input:focus{outline:0}',
    '.na-srch:focus-within{outline:0}',
    '.na-day{margin:22px 0 6px;padding:0 10px}',
    '.na-none{padding:28px 10px;color:var(--n-sec);font-size:14px}',
    '.na-load{padding:22px 10px}',

    /* ---- reading panel ---- */
    '.na-bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:2px;padding:12px 16px;background:var(--fond,#fff);border-bottom:1px solid transparent;transition:border-color .2s}',
    '.na-bar.sc{border-bottom-color:var(--n-fil)}',
    '.na-bar .sp{flex:1}',
    '.na-bar .sep{width:1px;height:20px;background:var(--n-fil);margin:0 6px}',
    '.na-menu{position:absolute;right:16px;top:52px;min-width:210px;background:var(--surface,#fff);border:1px solid var(--n-fil);border-radius:var(--n-r2);box-shadow:4px 4px 0 var(--n-fil);padding:6px;display:flex;flex-direction:column;animation:cbwnIn .2s var(--n-out) both}',
    '.na-menu .btn{justify-content:flex-start;width:100%;min-height:36px;padding:0 10px;font-weight:700;font-size:13.5px;background:none;color:var(--texte,#111)}',
    '.na-menu .btn:not(:disabled):hover{background:var(--n-f2)}',
    '.na-menu .btn.danger{color:var(--erreur,#B3261E)}',
    '.na-menu hr{border:0;border-top:1px solid var(--n-fil);margin:5px 4px}',
    '.na-menu .k{margin-left:auto;font-family:var(--mono,monospace);font-size:11px;color:var(--n-sec);font-weight:500}',
    '.na-read{padding:18px clamp(24px,3.2cqw,44px) 72px;max-width:calc(68ch + 88px);margin:0 auto}',
    '.na[data-panel="full"] .na-read{padding-top:clamp(24px,5vh,64px)}',
    '.na-read .when{display:block;margin-bottom:12px}',
    '.na-read h2.ti{margin:0;font-size:clamp(24px,2cqw,30px);font-weight:900;font-stretch:88%;line-height:1.08;letter-spacing:-.03em;text-wrap:balance}',
    '.na[data-panel="full"] .na-read h2.ti{font-size:clamp(32px,3.6cqw,48px)}',
    '.na-read .meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}',
    '.na-read .chip{font-family:var(--mono,monospace);font-size:11.5px;font-weight:500;padding:3px 8px;background:var(--n-f2);color:var(--n-sec);font-variant-numeric:tabular-nums}',
    '.na-read .chip.ok{background:color-mix(in srgb,var(--vert,#1FD26A) 22%,var(--fond,#fff));color:var(--texte,#111)}',
    '.na-read .warn{font-size:13.5px;color:var(--n-sec);background:var(--n-f2);border-left:3px solid var(--n-sec);padding:10px 14px;margin:22px 0 0}',
    '.na-read .rule{height:1px;background:var(--n-fil);margin:26px 0 28px}',
    '.na-read .path{font-family:var(--mono,monospace);font-size:11px;color:var(--n-sec);word-break:break-all;margin-top:26px}',
    '.na-busy{display:flex;align-items:center;gap:10px;margin-top:18px;color:var(--n-bl)}',
    /* markdown */
    '.cbwn-md{font-size:16px;line-height:1.68;max-width:68ch}',
    '.cbwn-md h1,.cbwn-md h2{font-size:20px;font-weight:900;font-stretch:90%;letter-spacing:-.02em;line-height:1.15;margin:34px 0 10px}',
    '.cbwn-md h3{font-size:16.5px;font-weight:800;margin:24px 0 6px;line-height:1.3}',
    '.cbwn-md h4{font-family:var(--mono,monospace);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:20px 0 6px;color:var(--n-sec)}',
    '.cbwn-md>:first-child{margin-top:0}',
    '.cbwn-md p{margin:0 0 14px}',
    '.cbwn-md ul,.cbwn-md ol{margin:0 0 14px;padding-left:24px}',
    '.cbwn-md li{margin:4px 0}',
    '.cbwn-md li>ul,.cbwn-md li>ol{margin:4px 0}',
    '.cbwn-md ul{list-style:none}',
    '.cbwn-md ul>li{position:relative}',
    '.cbwn-md ul>li::before{content:"";position:absolute;left:-17px;top:.7em;width:6px;height:6px;background:var(--texte,#111)}',
    '.cbwn-md ul ul>li::before{background:none;box-shadow:inset 0 0 0 1.5px var(--texte,#111)}',
    '.cbwn-md li.tk::before{display:none}',
    '.cbwn-md .bx{position:absolute;left:-24px;top:.34em;width:15px;height:15px;border:1.5px solid var(--texte,#111);border-radius:2px;display:block}',
    '.cbwn-md li.tk.dn>.bx{background:var(--n-ink);border-color:var(--n-ink)}',
    '.cbwn-md li.tk.dn>.bx::after{content:"";position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid var(--n-ink-t);border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '.cbwn-md li.tk.dn>.tx{color:var(--n-sec);text-decoration:line-through;text-decoration-thickness:1px}',
    '.cbwn-md strong{font-weight:800}',
    '.cbwn-md code{font-family:var(--mono,monospace);font-size:.84em;background:var(--n-f2);padding:1px 5px}',
    '.cbwn-md pre{font-family:var(--mono,monospace);font-size:12.5px;background:var(--n-f2);padding:12px 14px;overflow:auto;margin:0 0 14px}',
    '.cbwn-md pre code{background:none;padding:0}',
    '.cbwn-md blockquote{margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid var(--n-fil);color:var(--n-sec)}',
    '.cbwn-md hr{border:0;border-top:1px solid var(--n-fil);margin:24px 0}',
    '.na-raw{margin-top:40px;border-top:1px solid var(--n-fil);max-width:68ch}',
    '.na-raw summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 0;font-weight:800;font-size:14px}',
    '.na-raw summary::-webkit-details-marker{display:none}',
    '.na-raw summary .lbl{margin-left:10px}',
    '.na-raw summary .pl{width:26px;height:26px;display:grid;place-items:center;background:var(--n-f2);margin-left:auto;transition:transform var(--d-moyen,.35s) var(--n-ease),background .2s}',
    '.na-raw[open] summary .pl{transform:rotate(45deg);background:var(--n-f3)}',
    '.na-raw .txt{white-space:pre-wrap;font-size:13.5px;line-height:1.7;color:var(--n-sec);padding-bottom:12px}',

    /* ---- focus (session) ---- */
    '.na-fx{position:sticky;top:0;height:100vh;display:grid;grid-template-rows:auto 1fr auto;padding:20px clamp(20px,4cqw,56px) 24px;background:var(--fond,#fff)}',
    '.na-fx .top{display:flex;align-items:center;justify-content:space-between;gap:16px}',
    '.na-fx .st{color:var(--n-or);font-weight:700}',
    '.na-fx .st .pst{border-radius:50%;animation:cbwnBlink 1.2s steps(1) infinite}',
    '.na-fx.paused .st{color:var(--n-sec)}.na-fx.paused .st .pst{animation:none;border-radius:0}',
    '@keyframes cbwnBlink{50%{opacity:.15}}',
    '.na-fx .keys{font-family:var(--mono,monospace);font-size:11px;color:var(--n-sec);display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-end}',
    '.na-fx .mid{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;text-align:center;gap:0}',
    '.na-fx .ttl{appearance:none;border:0;background:none;color:var(--texte,#111);font:inherit;font-size:clamp(17px,1.6cqw,22px);font-weight:800;letter-spacing:-.01em;text-align:center;width:min(560px,100%);padding:6px 10px;border-bottom:1px dashed transparent;transition:border-color .2s}',
    '.na-fx .ttl::placeholder{color:var(--texte-3,#6E6E6A);font-weight:700}',
    '.na-fx .ttl:hover{border-bottom-color:var(--n-fil)}',
    '.na-fx .ttl:focus{outline:0;border-bottom:1px solid var(--texte,#111)}',
    '.na-timer{font-size:clamp(84px,min(17cqw,25vh),232px);font-weight:900;font-stretch:70%;line-height:.8;letter-spacing:-.055em;font-variant-numeric:tabular-nums;white-space:nowrap;margin:clamp(16px,3.5vh,40px) 0 clamp(18px,3.5vh,36px);transition:color .3s}',
    '.na-timer .c{display:inline-block;width:.11em;height:.5em;margin:0 .07em;vertical-align:.07em;background:linear-gradient(var(--n-or) 0 0) top/100% .11em no-repeat,linear-gradient(var(--n-or) 0 0) bottom/100% .11em no-repeat}',
    '.na-fx.paused .na-timer{color:var(--n-sec)}.na-fx.paused .na-timer .c{background-image:linear-gradient(currentColor 0 0),linear-gradient(currentColor 0 0)}',
    '.na-wave{display:flex;align-items:center;justify-content:center;gap:4px;height:clamp(32px,6vh,56px);width:min(440px,80%)}',
    '.na-wave i{flex:1;max-width:6px;height:100%;background:var(--n-or);transform:scaleY(.08);transition:transform .1s linear}',
    '.na-fx.paused .na-wave i{background:var(--n-fil)}',
    '.na-fx .wd{font-family:var(--mono,monospace);font-size:13px;color:var(--n-sec);font-variant-numeric:tabular-nums;margin-top:14px}',
    '.na-fx .wd b{color:var(--texte,#111);font-weight:700}',
    '.na-fx .acts{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:clamp(18px,4vh,40px);flex-wrap:wrap}',
    '.na-fx .acts .b2.lg{min-width:150px}',
    '.na-fx .acts .b1.lg{min-width:180px}',
    /* markers */
    '.na-mk{width:min(620px,100%);margin:0 auto}',
    '.na-mk ol{list-style:none;margin:0 0 8px;padding:0;max-height:min(132px,16vh);overflow:auto;display:flex;flex-direction:column;gap:2px}',
    '.na-mk li{display:flex;gap:12px;align-items:baseline;font-size:14px;padding:3px 2px;animation:cbwnIn .3s var(--n-out) both}',
    '.na-mk li time{font-family:var(--mono,monospace);font-size:12px;color:var(--n-or);font-variant-numeric:tabular-nums;flex:none;font-weight:700}',
    '.na-mk .fld{display:flex;align-items:center;gap:10px;border-top:1px solid var(--n-fil);padding-top:10px}',
    '.na-mk .fld .lbl{flex:none}',
    '.na-mk input{appearance:none;flex:1;min-width:0;height:36px;border:0;background:none;color:var(--texte,#111);font:inherit;font-size:14.5px;padding:0}',
    '.na-mk input::placeholder{color:var(--texte-3,#6E6E6A)}',
    '.na-mk input:focus{outline:0}',
    '.na-mk .fld:focus-within{border-top-color:var(--texte,#111)}',
    '.na-mk .fld kbd{flex:none}',
    '@container cbwn (max-width:720px){.na-fx .keys{display:none}}',
    '@media (max-height:700px){.na-mk ol{max-height:64px}.na-fx{padding-top:14px;padding-bottom:14px}}',

    /* modal + toast */
    '.cbwn-scrim{position:fixed;inset:0;z-index:50;background:rgba(17,17,17,.45);display:grid;place-items:center;padding:24px;animation:cbwnFade .2s var(--n-ease) both}',
    '@keyframes cbwnFade{from{opacity:0}}',
    '.cbwn-dlg{width:min(460px,100%);background:var(--surface,#fff);color:var(--texte,#111);border:2px solid var(--trait,#1E1E1C);border-radius:0;box-shadow:var(--ombre-dure,8px 8px 0 #1E1E1C);padding:24px;animation:cbwnIn .3s var(--n-out) both}',
    '.cbwn-dlg h2{margin:12px 0 8px;font-size:22px;font-weight:900;font-stretch:88%;letter-spacing:-.025em;line-height:1.1}',
    '.cbwn-dlg p{margin:0;color:var(--n-sec);font-size:14px}',
    '.cbwn-dlg .ft{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;flex-wrap:wrap}',
    '.cbwn-toast{position:fixed;right:24px;bottom:24px;z-index:60;background:var(--n-ink);color:var(--n-ink-t);border-radius:var(--n-r);font-family:var(--mono,monospace);font-size:13px;font-weight:500;line-height:1.3;padding:11px 14px;display:flex;align-items:center;gap:10px;animation:cbwnToast .2s var(--n-ease) both}',
    '.cbwn-toast .pst{color:var(--vert,#1FD26A);margin:0}',
    '.cbwn-toast.err .pst{color:var(--erreur,#FF6B5E)}',
    '.cbwn-toast.out{animation:cbwnToastOut .2s var(--n-ease) forwards}',
    '@keyframes cbwnToast{from{opacity:0;transform:translateY(10px)}}',
    '@keyframes cbwnToastOut{to{opacity:0;transform:translateY(10px)}}',
    '@media (prefers-reduced-motion:reduce){.cbwn *,.cbwn,.cbwn-scrim,.cbwn-dlg,.cbwn-toast,.na-shell,.na-panel,.na-focus{animation:none!important;transition:none!important}.cbwn .shim{color:var(--texte,#111);background:none}.na[data-mode="session"] .na-shell{transform:none}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('cbwn-a-css')) return;
    var s = document.createElement('style');
    s.id = 'cbwn-a-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- icons (static SVG, no user data) ---------- */
  function svg(d, s) { return '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>', 16),
    cal: svg('<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/><path d="M8 14h3v3H8z"/>', 20),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    grow: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
    shrink: svg('<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>'),
    more: svg('<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>'),
    copy: svg('<path d="M8 8h12v12H8z"/><path d="M16 8V4H4v12h4"/>', 16),
    folder: svg('<path d="M3 6h7l2 2h9v11H3z"/>', 16),
    alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>')
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

  /* ---------- mount ---------- */
  function mount(container, opts) {
    injectCSS();
    opts = opts || {};
    var api = opts.api || null;
    var navigate = typeof opts.navigate === 'function' ? opts.navigate : function () {};
    function has(m) { return !!(api && typeof api[m] === 'function'); }
    var CORE = has('listNotes') && has('getNote');

    var root = document.createElement('div');
    root.className = 'cbwn na';
    root.setAttribute('data-mode', 'idle');
    root.setAttribute('data-panel', 'closed');
    container.innerHTML = '';
    container.appendChild(root);

    // mode: 'idle' | 'session' | 'processing' ; panel: 'closed' | 'open' | 'full'
    var st = { mode: 'idle', panel: 'closed', notes: null, listErr: null, q: '', sel: null, note: null, noteErr: null,
      prog: null, progAt: 0, reorgId: null, busy: false, alive: true, title: '', marks: [], menu: false };
    var tick = 0, raf = 0, toastT = 0, modal = null, lastNav = '', closeT = 0, sideT = 0;

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
      root.innerHTML = '<div class="na-shell">' +
        '<section class="na-main" aria-label="Prise de notes"><div class="na-col">' + headerHTML() +
        '<div class="na-today" data-r="today"></div>' +
        '<div class="na-past"><h2>Notes passées</h2>' +
        '<label class="na-srch">' + I.search + '<input type="search" placeholder="Rechercher  /" aria-label="Rechercher une note" data-act="q" autocomplete="off" spellcheck="false"' + (CORE ? '' : ' disabled') + '></label></div>' +
        '<div data-r="list"></div></div></section>' +
        '<aside class="na-panel" aria-label="Note sélectionnée"><div class="na-pin" data-r="side"></div></aside></div>' +
        '<section class="na-focus" data-r="focus" aria-label="Note en cours"></section>';
      $('[data-r="side"]').addEventListener('scroll', onPanelScroll, { passive: true });
      renderToday(); renderList(); renderSide();
    }
    function headerHTML() {
      return '<header class="na-hd"><div><h1>Prise de notes</h1><span class="lbl sub" data-r="count">&nbsp;</span></div><div class="r">' +
        '<button class="btn bi" data-act="settings" aria-label="Réglages de la prise de notes" title="Réglages">' + I.gear + '</button>' +
        '<button class="btn brec" data-act="start" title="Ou Control gauche ×3"' + (has('startNote') ? '' : ' disabled') + '><span class="dot"></span><span>Démarrer<span class="lgo"> une note</span></span></button>' +
        '</div></header>';
    }
    function setFrame() {
      root.setAttribute('data-mode', st.mode);
      root.setAttribute('data-panel', st.sel ? (st.panel === 'closed' ? 'open' : st.panel) : 'closed');
      var b = $('[data-act="start"]'); if (b) b.disabled = !has('startNote') || st.mode !== 'idle';
      var main = $('.na-main'), panel = $('.na-panel'), focus = $('.na-focus');
      var sess = st.mode === 'session', full = !!st.sel && st.panel === 'full';
      if (main) main.inert = sess || full;
      if (panel) panel.inert = sess || !st.sel;
      if (focus) focus.inert = !sess;
    }

    /* ---- rows ---- */
    function rowHTML(n) {
      return '<li><button class="na-row" data-act="open" data-id="' + esc(n.id) + '"' + (st.sel === n.id ? ' aria-current="true"' : '') + '>' +
        '<span class="ic">' + I.doc + '</span>' +
        '<span class="tx"><span class="t">' + esc(n.title || 'Note sans titre') + (n.provider === 'passthrough' ? '<span class="raw">BRUT</span>' : '') + '</span>' +
        '<span class="s">' + esc(dur(n.durationMs)) + ' · ' + esc(words(n.words)) + '</span></span>' +
        '<span class="m">' + esc(timeOf(n.createdAt)) + '</span></button></li>';
    }
    var todayKey = function () { return dayKey(new Date().toISOString()); };

    /* ---- « Aujourd'hui » : processing row + today's notes ---- */
    function renderToday() {
      var el = $('[data-r="today"]'); if (!el) return;
      if (!CORE) {
        el.innerHTML = '<span class="lbl">Aujourd’hui</span><div class="na-off"><b>Indisponible.</b> La prise de notes n’est pas disponible dans cette version de CBW AI. Mets l’application à jour pour l’utiliser.</div>';
        return;
      }
      var all = st.notes || [], tk = todayKey();
      var today = all.filter(function (n) { return dayKey(n.createdAt) === tk && n.id !== st.reorgId; });
      var h = '<span class="lbl"><span>Aujourd’hui</span><span>' + (st.notes ? esc(today.length ? today.length + ' note' + (today.length > 1 ? 's' : '') : '') : '') + '</span></span>';
      if (st.mode === 'processing') h += procHTML();
      if (!st.notes) h += '<div class="na-load lbl">Chargement…</div>';
      else if (today.length) h += '<ul class="na-rows">' + today.map(rowHTML).join('') + '</ul>';
      else if (st.mode !== 'processing') h += '<div class="na-zero"><span class="ic">' + I.cal + '</span><div><b>Aucune note aujourd’hui</b>' +
        '<span>Lance une note pendant un appel, une réunion ou une réflexion à voix haute — ou <kbd>Control gauche</kbd> ×3, où que tu sois.</span></div></div>';
      el.innerHTML = h;
      if (st.mode === 'processing') updateProcessing();
      var c = $('[data-r="count"]');
      if (c && st.notes) c.textContent = all.length ? all.length + ' note' + (all.length > 1 ? 's' : '') + ' · ' + 'enregistrées sur ce Mac' : 'Parle, CBW range';
    }

    /* processing row */
    function procHTML() {
      var p = st.prog || { state: 'transcribing' };
      var t = st.reorgId && st.note && st.note.meta && st.note.meta.id === st.reorgId ? st.note.meta.title : (st.title.trim() || 'Nouvelle note');
      if (p.state === 'error') {
        return '<div class="na-proc err in" role="alert"><span class="ic">' + I.alert + '</span><span class="tx"><span class="t">La note n’a pas pu être terminée</span>' +
          '<span class="s lbl">' + esc(p.message || 'Une erreur inattendue est survenue.') + '</span></span>' +
          '<button class="btn b3" data-act="dismiss">Fermer</button></div>';
      }
      return '<div class="na-proc in" aria-live="polite"><span class="ic" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="tx"><span class="t shim">' + esc(t) + '</span><span class="s lbl" data-s="ps"></span></span>' +
        '<span class="m" data-s="pm"></span><span class="bar" data-s="pg"><i></i></span></div>';
    }
    function updateProcessing() {
      var p = st.prog || {}, s = $('[data-s="ps"]'); if (!s) return;
      var org = p.state === 'organizing', total = p.total || 3, step = Math.min(p.step || 1, total);
      var label = org ? (st.reorgId ? 'Réorganisation ' : 'Organisation ') + step + '/' + total + '…' : 'Transcription…';
      if (s.textContent !== label) s.textContent = label;
      var pg = $('[data-s="pg"]');
      if (!org) { pg.classList.add('ind'); pg.firstChild.style.transform = ''; }
      else { pg.classList.remove('ind'); pg.firstChild.style.transform = 'scaleX(' + ((step - .4) / total).toFixed(3) + ')'; }
      var bits = [];
      if (p.elapsedMs) bits.push(clock(p.elapsedMs));
      if (p.words) bits.push(words(p.words));
      $('[data-s="pm"]').textContent = bits.join(' · ');
    }

    /* ---- focus view (session) ---- */
    function elapsed() {
      var p = st.prog || {};
      return (p.elapsedMs || 0) + (p.state === 'recording' ? performance.now() - st.progAt : 0);
    }
    var WAVE = 36;
    function renderFocus() {
      var el = $('[data-r="focus"]'); if (!el) return;
      stopLoops();
      if (st.mode !== 'session') { clearTimeout(closeT); closeT = setTimeout(function () { if (st.mode !== 'session' && el.isConnected) el.innerHTML = ''; }, 420); return; }
      clearTimeout(closeT);
      var p = st.prog || { state: 'recording' }, paused = p.state === 'paused';
      var fx = el.querySelector('.na-fx');
      if (!fx) {
        var bars = ''; for (var i = 0; i < WAVE; i++) bars += '<i></i>';
        el.innerHTML = '<div class="na-fx">' +
          '<div class="top"><span class="lbl st" data-s="st"></span>' +
          '<span class="keys"><span><kbd>Control gauche</kbd> terminer</span><span><kbd>Espace</kbd> pause</span><span><kbd>Échap</kbd> annuler</span></span></div>' +
          '<div class="mid">' +
          '<input class="ttl" data-act="title" placeholder="Titre (facultatif)" aria-label="Titre de la note (facultatif)" maxlength="140" autocomplete="off" spellcheck="false" value="' + esc(st.title) + '">' +
          '<div class="na-timer" data-s="tm" role="timer" aria-label="Durée"></div>' +
          '<div class="na-wave" aria-hidden="true">' + bars + '</div>' +
          '<div class="wd" data-s="wd" aria-live="off"></div>' +
          '<div class="acts">' +
          '<button class="btn b2 lg" data-act="pause"></button>' +
          '<button class="btn b1 lg" data-act="stop"' + (has('stopNote') ? '' : ' disabled') + '>Terminer <span class="ar">→</span></button>' +
          '<button class="btn b3" data-act="cancel"' + (has('cancelNote') ? '' : ' disabled') + '>Annuler</button></div></div>' +
          '<div class="na-mk"><ol data-s="mk" aria-label="Repères"></ol>' +
          '<label class="fld"><span class="lbl">Repère</span><input data-act="mark" placeholder="Tape une idée pendant que tu parles — elle sera horodatée" aria-label="Ajouter un repère horodaté (facultatif)" autocomplete="off" maxlength="200"><kbd>↵</kbd></label></div>' +
          '</div>';
        fx = el.querySelector('.na-fx');
        renderMarks();
      }
      fx.classList.toggle('paused', paused);
      $('[data-s="st"]').innerHTML = '<span class="pst"></span>' + (paused ? 'En pause' : 'Enregistrement · rien n’est collé');
      var pb = $('[data-act="pause"]');
      pb.textContent = paused ? 'Reprendre' : 'Pause';
      pb.disabled = !has(paused ? 'resumeNote' : 'pauseNote');
      updateSession();
      tick = setInterval(updateSession, 250);
      animWave();
    }
    function renderMarks() {
      var ol = $('[data-s="mk"]'); if (!ol) return;
      ol.innerHTML = st.marks.map(function (m) { return '<li><time>' + esc(clock(m.t)) + '</time><span>' + esc(m.text) + '</span></li>'; }).join('');
      ol.hidden = !st.marks.length;
      ol.scrollTop = ol.scrollHeight;
    }
    function updateSession() {
      var p = st.prog || {}, tm = $('[data-s="tm"]'), wd = $('[data-s="wd"]');
      if (!tm) return;
      var txt = clock(elapsed()), html = txt.split(':').map(esc).join('<span class="c"></span>');
      if (tm.innerHTML !== html) { tm.innerHTML = html; tm.setAttribute('aria-label', 'Durée ' + txt); }
      var w = '<b>' + esc(num(p.words)) + '</b> mot' + ((p.words || 0) > 1 ? 's' : '') + ' transcrits' + (st.marks.length ? ' · ' + st.marks.length + ' repère' + (st.marks.length > 1 ? 's' : '') : '');
      if (wd.innerHTML !== w) wd.innerHTML = w;
    }
    function animWave() {
      var bars = [].slice.call(root.querySelectorAll('.na-wave i'));
      var hist = []; for (var i = 0; i < WAVE; i++) hist.push(.06);
      var env = bars.map(function (_, i) { var x = (i - (WAVE - 1) / 2) / ((WAVE - 1) / 2); return .35 + .65 * Math.cos(x * Math.PI / 2); });
      if (reduced) { bars.forEach(function (b, i) { b.style.transform = 'scaleY(' + (.25 * env[i]).toFixed(3) + ')'; }); return; }
      var last = 0, sm = 0;
      function frame(t) {
        if (st.mode !== 'session') return;
        if (t - last > 70) {
          last = t;
          var p = st.prog || {}, paused = p.state === 'paused';
          var lv = typeof p.level === 'number' ? Math.max(0, Math.min(1, p.level)) : null;
          var target = paused ? .05 : lv != null ? .08 + lv * (.7 + .3 * Math.random()) : .1 + .12 * (1 + Math.sin(t / 420)) / 2;
          sm += (target - sm) * .6;
          hist.push(sm); hist.shift();
          // symétrique depuis le centre : la voix « rayonne » vers les bords
          for (var j = 0; j < WAVE; j++) {
            var d = Math.abs(j - (WAVE - 1) / 2), v = hist[WAVE - 1 - Math.min(WAVE - 1, Math.round(d * 2))];
            bars[j].style.transform = 'scaleY(' + Math.max(.06, Math.min(1, v * env[j])).toFixed(3) + ')';
          }
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    /* ---- past notes list (grouped by day) ---- */
    function renderList() {
      var el = $('[data-r="list"]'); if (!el) return;
      if (!CORE) { el.innerHTML = '<div class="na-none">Aucune note.</div>'; return; }
      if (st.listErr) { el.innerHTML = '<div class="na-none">Impossible de lire tes notes : ' + esc(st.listErr) + ' <button class="btn b3" data-act="reload">Réessayer</button></div>'; return; }
      if (!st.notes) { el.innerHTML = '<div class="na-load lbl">Chargement…</div>'; return; }
      var q = fold(st.q.trim()), tk = todayKey();
      var list = st.notes.filter(function (n) { return q ? fold(n.title).indexOf(q) !== -1 : dayKey(n.createdAt) !== tk; });
      if (!list.length) {
        el.innerHTML = '<div class="na-none">' + (q ? 'Aucune note ne correspond à « ' + esc(st.q.trim()) + ' ».' : (st.notes.length ? 'Pas d’autre note pour l’instant.' : 'Tes notes terminées apparaîtront ici, classées par jour.')) + '</div>';
        return;
      }
      var h = '', cur = null;
      list.forEach(function (n) {
        var k = dayKey(n.createdAt);
        if (k !== cur) { if (cur !== null) h += '</ul>'; cur = k; h += '<div class="na-day lbl">' + esc(k === tk ? 'Aujourd’hui' : dayLabel(n.createdAt)) + '</div><ul class="na-rows">'; }
        h += rowHTML(n);
      });
      el.innerHTML = h + '</ul>';
    }
    function markSel() {
      [].forEach.call(root.querySelectorAll('.na-row'), function (r) {
        if (r.getAttribute('data-id') === st.sel) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
      });
      setFrame();
    }
    function loadList() {
      if (!CORE) { st.notes = []; renderToday(); renderList(); return Promise.resolve(); }
      return call('listNotes').then(function (list) {
        st.listErr = null;
        st.notes = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }, function (e) { st.listErr = errMsg(e); })
        .then(function () { if (!st.alive) return; renderToday(); renderList(); });
    }

    /* ---- reading panel ---- */
    function onPanelScroll(e) { var b = $('.na-bar'); if (b) b.classList.toggle('sc', e.target.scrollTop > 4); }
    function barHTML(ready) {
      var full = st.panel === 'full', dis = function (k) { return ready && has(k) ? '' : ' disabled'; };
      return '<div class="na-bar">' +
        '<button class="btn bi" data-act="close" aria-label="Fermer la note (Échap)" title="Fermer · Échap">' + I.x + '</button>' +
        '<button class="btn bi" data-act="full" aria-label="' + (full ? 'Réduire en panneau' : 'Lire en pleine page') + '" title="' + (full ? 'Réduire' : 'Pleine page') + '">' + (full ? I.shrink : I.grow) + '</button>' +
        '<span class="sp"></span>' +
        '<button class="btn bt" data-act="copy"' + dis('copyNote') + ' title="Copier le Markdown · ⌘C">' + I.copy + 'Copier</button>' +
        '<button class="btn bt" data-act="reveal"' + dis('revealNote') + ' title="Afficher dans le Finder">' + I.folder + 'Finder</button>' +
        '<span class="sep" aria-hidden="true"></span>' +
        '<button class="btn bi" data-act="more" aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded="' + st.menu + '"' + (ready ? '' : ' disabled') + '>' + I.more + '</button>' +
        (st.menu ? '<div class="na-menu" role="menu">' +
          '<button class="btn" role="menuitem" data-act="reorg"' + dis('reorganizeNote') + (st.mode === 'idle' ? '' : ' disabled') + '>Réorganiser avec l’IA</button><hr>' +
          '<button class="btn danger" role="menuitem" data-act="del"' + dis('deleteNote') + '>Supprimer la note…</button></div>' : '') +
        '</div>';
    }
    function renderSide() {
      var el = $('[data-r="side"]'); if (!el) return;
      markSel();
      if (!st.sel) return;
      if (st.noteErr) { el.innerHTML = barHTML(false) + '<div class="na-read"><div class="na-none">' + esc(st.noteErr) + '</div></div>'; return; }
      var n = st.note;
      if (!n || !n.meta || n.meta.id !== st.sel) { el.innerHTML = barHTML(false) + '<div class="na-read"><div class="na-load lbl">Chargement…</div></div>'; return; }
      var m = n.meta, md = String(n.markdown || '');
      var mt = /^\s*#\s+(.+)\n?/.exec(md); // évite le titre en double
      if (mt && fold(mt[1].trim()) === fold(m.title || '')) md = md.slice(mt[0].length);
      var raw = m.provider === 'passthrough', busy = st.reorgId === m.id && st.mode === 'processing';
      var keep = el.scrollTop;
      el.innerHTML = barHTML(true) + '<article class="na-read in">' +
        '<span class="lbl when">' + esc(longDate(m.createdAt)) + '</span>' +
        '<h2 class="ti">' + esc(m.title || 'Note sans titre') + '</h2>' +
        '<div class="meta"><span class="chip">' + esc(clock(m.durationMs)) + '</span><span class="chip">' + esc(words(m.words)) + '</span>' +
        '<span class="chip' + (raw ? '' : ' ok') + '">' + esc(raw ? 'Transcription brute' : prov(m.provider)) + '</span></div>' +
        (busy ? '<div class="na-busy lbl"><span class="pst"></span>Réorganisation en cours…</div>' : '') +
        (raw ? '<p class="warn">Aucun moteur IA n’était disponible : voici la transcription telle quelle. « Réorganiser » (menu ⋯) la reprend quand un moteur est prêt.</p>' : '') +
        '<div class="rule"></div>' +
        '<div class="cbwn-md">' + (md.trim() ? renderMarkdown(md) : '<p>Cette note est vide.</p>') + '</div>' +
        (n.transcript ? '<details class="na-raw"><summary>Transcription brute<span class="lbl">' + esc(words(String(n.transcript).split(/\s+/).filter(Boolean).length)) + '</span><span class="pl" aria-hidden="true">+</span></summary><div class="txt">' + esc(n.transcript) + '</div></details>' : '') +
        (m.path ? '<div class="path">' + esc(m.path) + '</div>' : '') + '</article>';
      el.scrollTop = st.keepScroll ? keep : 0; st.keepScroll = false;
    }
    function openNote(id, focusPanel) {
      if (!CORE || !id) return;
      var was = st.sel; clearTimeout(sideT);
      st.sel = id; st.noteErr = null; st.menu = false;
      if (st.panel === 'closed') st.panel = 'open';
      if (!st.note || st.note.meta.id !== id) st.note = null;
      renderSide(); go('#notes:' + id);
      if (!was) { var r = $('.na-row[aria-current="true"]'); if (r && r.scrollIntoView) setTimeout(function () { r.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }, 480); }
      call('getNote', id).then(function (n) {
        if (!st.alive || st.sel !== id) return;
        if (!n || !n.meta) throw new Error('Note introuvable.');
        st.note = n; renderSide();
        if (focusPanel) { var c = $('[data-act="close"]'); if (c) c.focus({ preventScroll: true }); }
      }).catch(function (e) { if (st.sel === id) { st.noteErr = errMsg(e); renderSide(); } });
    }
    function closeNote() {
      var id = st.sel;
      st.sel = null; st.note = null; st.menu = false; st.panel = 'closed';
      markSel(); go('#notes');
      var el = $('[data-r="side"]');
      clearTimeout(sideT); sideT = setTimeout(function () { if (!st.sel && el && el.isConnected) el.innerHTML = ''; }, 480);
      var r = id && root.querySelector('.na-row[data-id="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]'); if (r) r.focus({ preventScroll: true });
    }
    function toggleFull() {
      if (!st.sel) return;
      st.panel = st.panel === 'full' ? 'open' : 'full'; st.menu = false; st.keepScroll = true;
      renderSide();
      var b = $('[data-act="full"]'); if (b) b.focus({ preventScroll: true });
    }
    function setMenu(on) {
      if (st.menu === on) return;
      st.menu = on; st.keepScroll = true; renderSide();
      var t = on ? $('.na-menu .btn:not(:disabled)') : $('[data-act="more"]'); if (t) t.focus({ preventScroll: true });
    }

    /* ---- actions ---- */
    function setMode(mode) {
      st.mode = mode;
      setFrame(); renderFocus(); renderToday();
      if (st.sel && st.note) { st.keepScroll = true; renderSide(); }
    }
    function startSession() {
      if (!has('startNote') || st.busy || st.mode !== 'idle') return;
      st.busy = true; st.title = ''; st.marks = [];
      if (st.sel) { st.sel = null; st.note = null; st.panel = 'closed'; st.menu = false; markSel(); }
      st.prog = { state: 'recording', elapsedMs: 0, words: 0 }; st.progAt = performance.now();
      setMode('session'); go('#notes');
      setTimeout(function () { var s = $('[data-act="stop"]'); if (s && st.mode === 'session') s.focus({ preventScroll: true }); }, 60);
      call('startNote').catch(function (e) { toast('Impossible de démarrer : ' + errMsg(e), true); setMode('idle'); })
        .then(function () { st.busy = false; });
    }
    function togglePause() {
      if (st.mode !== 'session') return;
      var paused = st.prog && st.prog.state === 'paused';
      st.prog = Object.assign({}, st.prog, { state: paused ? 'recording' : 'paused', elapsedMs: elapsed() }); st.progAt = performance.now();
      renderFocus();
      call(paused ? 'resumeNote' : 'pauseNote').catch(function (e) { toast(errMsg(e), true); });
    }
    function stopSession() {
      if (st.mode !== 'session') return;
      st.prog = Object.assign({}, st.prog, { state: 'transcribing', elapsedMs: elapsed() });
      setMode('processing');
      // Titre et repères sont facultatifs : transmis au pont s'il sait les utiliser (argument ignoré sinon).
      var extra = st.title.trim() || st.marks.length ? { title: st.title.trim() || undefined, markers: st.marks.map(function (m) { return { atMs: Math.round(m.t), text: m.text }; }) } : undefined;
      call('stopNote', extra).catch(function (e) { st.prog = { state: 'error', message: errMsg(e) }; renderToday(); });
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
    function addMark(input) {
      var v = input.value.trim(); if (!v || st.mode !== 'session') return;
      st.marks.push({ t: elapsed(), text: v.slice(0, 200) });
      input.value = ''; renderMarks(); updateSession();
    }
    function noteAction(act) {
      var id = st.note && st.note.meta && st.note.meta.id; if (!id) return;
      if (act === 'copy') call('copyNote', id).then(function () { toast('Copié dans le presse-papiers'); }, function (e) { toast(errMsg(e), true); });
      else if (act === 'reveal') call('revealNote', id).catch(function (e) { toast(errMsg(e), true); });
      else if (act === 'reorg') {
        st.menu = false;
        if (st.mode !== 'idle') return;
        st.reorgId = id;
        st.prog = { state: 'organizing', step: 1, total: 3, elapsedMs: st.note.meta.durationMs, words: st.note.meta.words };
        setMode('processing');
        call('reorganizeNote', id).then(function () {
          if (st.alive && st.reorgId === id && st.mode === 'processing') { st.reorgId = null; setMode('idle'); toast('Note réorganisée'); loadList(); st.note = null; openNote(id); }
        }, function (e) { st.reorgId = null; setMode('idle'); toast(errMsg(e), true); });
      } else if (act === 'del') {
        st.menu = false; st.keepScroll = true; renderSide();
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
        if (st.mode !== 'session') { if (st.sel) { st.sel = null; st.note = null; st.panel = 'closed'; markSel(); } setMode('session'); }
        else if (prev !== p.state) renderFocus(); else updateSession();
      } else if (p.state === 'transcribing' || p.state === 'organizing') {
        if (st.mode !== 'processing') setMode('processing'); else updateProcessing();
      } else if (p.state === 'done') {
        var id = p.noteId || st.reorgId; st.reorgId = null;
        setMode('idle');
        toast(p.message || 'Note prête');
        loadList().then(function () { if (id) { st.note = null; openNote(id); } });
      } else if (p.state === 'error') {
        st.reorgId = null;
        if (st.mode !== 'idle') { st.mode = 'processing'; setFrame(); renderFocus(); renderToday(); }
        else toast(p.message || 'Erreur pendant la note', true);
      }
    }
    var unsub = subscribe(api, onProg);

    /* ---- events (delegated, CSP-safe) ---- */
    function onClick(e) {
      if (st.menu && !e.target.closest('.na-menu,[data-act="more"]')) setMenu(false);
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-act');
      if (a === 'start') startSession();
      else if (a === 'open') { if (st.sel === b.getAttribute('data-id')) closeNote(); else openNote(b.getAttribute('data-id')); }
      else if (a === 'pause') togglePause();
      else if (a === 'stop') stopSession();
      else if (a === 'cancel') cancelSession();
      else if (a === 'close') closeNote();
      else if (a === 'full') toggleFull();
      else if (a === 'more') setMenu(!st.menu);
      else if (a === 'dismiss') { st.prog = null; setMode('idle'); }
      else if (a === 'settings') go('#reglages');
      else if (a === 'reload') { st.listErr = null; st.notes = null; renderList(); loadList(); }
      else if (a === 'copy' || a === 'reveal' || a === 'reorg' || a === 'del') noteAction(a);
    }
    function onInput(e) {
      var a = e.target.getAttribute('data-act');
      if (a === 'q') { st.q = e.target.value; renderList(); markSel(); }
      else if (a === 'title') st.title = e.target.value;
    }
    function moveSel(d) {
      var rows = [].slice.call(root.querySelectorAll('.na-row')); if (!rows.length) return;
      var i = rows.findIndex(function (r) { return r.getAttribute('data-id') === st.sel; });
      var n = rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + d))];
      if (n) { openNote(n.getAttribute('data-id')); n.focus({ preventScroll: false }); }
    }
    function onKey(e) {
      if (!st.alive || !root.isConnected) return;
      var tg = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable;
      if (e.key === 'Escape') {
        if (modal) { e.preventDefault(); closeModal(false); return; }
        if (st.menu) { e.preventDefault(); setMenu(false); return; }
        if (st.mode === 'session') {
          e.preventDefault();
          if (typing && root.contains(tg)) { tg.blur(); var s = $('[data-act="stop"]'); if (s) s.focus({ preventScroll: true }); return; }
          cancelSession(); return;
        }
        if (typing && tg.getAttribute('data-act') === 'q') { e.preventDefault(); if (st.q) { tg.value = ''; st.q = ''; renderList(); markSel(); } else tg.blur(); return; }
        if (st.sel && st.panel === 'full') { e.preventDefault(); toggleFull(); return; }
        if (st.sel) { e.preventDefault(); closeNote(); }
        return;
      }
      if (e.key === 'Enter' && tg.getAttribute && tg.getAttribute('data-act') === 'mark') { e.preventDefault(); addMark(tg); return; }
      if (e.key === 'Enter' && tg.getAttribute && tg.getAttribute('data-act') === 'title') { e.preventDefault(); var mk = $('[data-act="mark"]'); if (mk) mk.focus(); return; }
      if (modal || typing) return;
      if (st.mode === 'session') {
        if (e.key === ' ' && !(tg.tagName === 'BUTTON')) { e.preventDefault(); togglePause(); }
        return;
      }
      if (e.key === '/' && CORE) { e.preventDefault(); var q = $('[data-act="q"]'); if (q) q.focus(); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && st.sel && st.panel !== 'full' && (tg === document.body || root.contains(tg))) { e.preventDefault(); moveSel(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'c' && e.metaKey && st.note && !String(window.getSelection ? window.getSelection() : '').length) { e.preventDefault(); noteAction('copy'); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);

    /* ---- initial view ---- */
    lastNav = opts.noteId ? '#notes:' + opts.noteId : '#notes';
    render();
    setFrame();
    if (opts.noteId && CORE) openNote(opts.noteId);
    loadList();

    return {
      open: function (id) { if (id) openNote(id); else if (st.sel) closeNote(); },
      list: function () { if (st.sel) closeNote(); loadList(); },
      unmount: function () {
        st.alive = false; stopLoops(); closeModal(false); clearTimeout(closeT); clearTimeout(sideT);
        if (unsub) unsub();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput);
        document.removeEventListener('keydown', onKey);
        root.remove();
      }
    };
  }

  window.CBWNotes = { mount: mount, renderMarkdown: renderMarkdown };
})();

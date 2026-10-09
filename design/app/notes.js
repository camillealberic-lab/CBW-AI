/* CBW AI — écran « Prise de notes », variante A (« au plus près de Wispr Flow »).
   - Une colonne centrale calme (liste) qui occupe toute la largeur utile.
   - Le panneau de lecture glisse depuis la droite UNIQUEMENT quand une note est sélectionnée
     (Échap / × pour fermer, ⤢ pour la lecture pleine page).
   - Une session = mode focus : la vue prend toute la zone de contenu, grand minuteur centré.
   - Le traitement s'affiche comme une ligne en tête de liste, puis la note s'ouvre seule.
   Vanilla JS, sans dépendance, compatible CSP (aucun handler inline, aucun eval).
   - Notes v2 : le panneau de lecture a des onglets (Résumé, Par personne, Décisions & actions,
     Transcription, Chronologie ; ←/→), découpés d'après les sections H2 de la note ; une note
     ancienne (v1) s'affiche entière dans Résumé. Clic sur une puce de locuteur = renommer
     (api.renameSpeaker puis getNote). Pleine page : sommaire des sujets collant, colonnes larges.
   Contrat : docs/APP_API.md › Mode « Prise de notes » + « Notes v2 ».
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
    /* même gabarit que les autres pages : la marge et la largeur viennent de .page (app.html) */
    '.na-main{flex:1 1 auto;min-width:0;overflow:hidden;container:namain / inline-size;padding:0 0 72px;transition:opacity .25s,padding .46s var(--n-out)}',
    '.na[data-panel="open"] .na-main{padding-right:clamp(20px,3cqw,40px)}',
    '.na-col{max-width:none;margin:0}',
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

    /* ---- v2 : onglets du compte rendu ---- */
    '.na-pin{container:napin / inline-size}',
    '.na[data-panel="full"] .na-read{max-width:calc(68ch + 88px)}',
    '@container napin (min-width:980px){.na[data-panel="full"] .na-read{max-width:1320px;padding-left:48px;padding-right:48px}}',
    '.na-tabs{position:sticky;top:61px;z-index:2;display:flex;gap:2px;margin:26px 0 26px;background:var(--fond,#fff);border-bottom:1px solid var(--n-fil);overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-mask:linear-gradient(90deg,#000 calc(100% - 24px),transparent);mask:linear-gradient(90deg,#000 calc(100% - 24px),transparent)}',
    '.na-tabs::-webkit-scrollbar{display:none}',
    '.na-tabs .tab{appearance:none;border:0;background:none;font:inherit;font-weight:700;font-size:13.5px;color:var(--n-sec);padding:12px 10px 13px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:7px;transition:color .2s;position:relative}',
    '.na-tabs .tab:first-child{padding-left:2px}',
    '.na-tabs .tab:hover{color:var(--texte,#111)}',
    '.na-tabs .tab[aria-selected="true"]{color:var(--texte,#111)}',
    '.na-tabs .tab:focus-visible{outline-offset:-3px}',
    '.na-tabs .ct{font-family:var(--mono,monospace);font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;padding:1px 5px;background:var(--n-f2);color:var(--n-sec);transition:background .2s,color .2s}',
    '.na-tabs .tab[aria-selected="true"] .ct{background:var(--n-ink);color:var(--n-ink-t)}',
    '.na-tabs .ul{position:absolute;left:0;bottom:0;height:2px;width:0;background:var(--texte,#111);transition:transform .34s var(--n-out),width .34s var(--n-out);pointer-events:none}',
    '.na-tabs.i .ul{transition:none}',
    '.na-pane{min-height:40vh}',
    '.na-pane.in{animation:cbwnIn .32s var(--n-out) both}',
    '.na-pane .sec-t{margin:34px 0 12px;display:flex;align-items:center;gap:10px}',
    '.na-pane .sec-t:first-child{margin-top:0}',
    '.na-pane .lead{font-size:17px;line-height:1.62;max-width:68ch;margin:0 0 6px}',
    '.na-pane .lead p{margin:0 0 10px}',
    /* speaker chips (palette : encre, bleu, orange, vert, puis gris) */
    '.cbwn .sp0{--sp:var(--texte,#1E1E1C)}.cbwn .sp1{--sp:var(--n-bl)}.cbwn .sp2{--sp:var(--n-or)}.cbwn .sp3{--sp:var(--vert,#1FD26A)}.cbwn .sp4{--sp:var(--texte-sec,#5F5F5A)}.cbwn .sp5{--sp:var(--texte-3,#8C8C88)}.cbwn .sp6{--sp:var(--fil-fort,#C4C4BF)}',
    '.cbwn .spk{appearance:none;border:0;font:inherit;font-family:var(--police,"Archivo",system-ui,sans-serif);letter-spacing:0;text-transform:none;font-weight:700;font-size:13px;line-height:1.35;color:var(--texte,#111);background:var(--n-f2);border-radius:var(--n-r);padding:3px 9px 3px 7px;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;vertical-align:baseline;transition:background .15s,box-shadow .15s}',
    '.cbwn .spk::before{content:"";width:9px;height:9px;flex:none;background:var(--sp,var(--texte,#111))}',
    '.cbwn button.spk{cursor:pointer}',
    '.cbwn button.spk:hover{background:var(--n-f3);box-shadow:inset 0 0 0 1px var(--sp)}',
    '.cbwn button.spk .pen{opacity:0;width:0;margin-left:-7px;overflow:hidden;transition:opacity .15s,width .15s,margin .15s;color:var(--n-sec)}',
    '.cbwn button.spk.it .pen{margin-left:-5px}.cbwn button.spk.lg .pen{margin-left:-9px}',
    '.cbwn button.spk:hover .pen,.cbwn button.spk:focus-visible .pen{opacity:1;width:12px;margin-left:0}',
    '.cbwn .spk.it{font-size:.84em;padding:0 6px 0 5px;gap:5px;vertical-align:.05em}',
    '.cbwn .spk.it::before{width:7px;height:7px}',
    '.cbwn .spk.lg{font-size:16px;font-weight:800;padding:5px 12px 5px 9px;gap:9px}',
    '.cbwn .spk.lg::before{width:12px;height:12px}',
    '.cbwn .spk-ed{display:inline-flex;align-items:center;gap:6px;background:var(--surface,#fff);box-shadow:inset 0 0 0 1.5px var(--sp,var(--texte)),3px 3px 0 var(--n-fil);border-radius:var(--n-r);padding:2px 6px 2px 8px;vertical-align:baseline;animation:naPop .2s var(--n-out) both}',
    '.cbwn .spk-ed::before{content:"";width:9px;height:9px;flex:none;background:var(--sp)}',
    '.cbwn .spk-ed input{appearance:none;border:0;background:none;color:var(--texte,#111);font:inherit;font-weight:700;font-size:13px;width:15ch;padding:2px 0;outline:0}',
    '.cbwn .spk-ed kbd{font-size:10px;padding:0 4px}',
    '@keyframes naPop{from{opacity:0;transform:scale(.94)}}',
    '.na-parts{display:flex;flex-wrap:wrap;gap:8px 18px;list-style:none;margin:0;padding:0}',
    '.na-parts li{display:flex;align-items:baseline;gap:8px;font-size:14px;color:var(--n-sec);min-width:0}',
    '.na-parts.col{flex-direction:column;gap:10px}',
    '.na-parts.col li{flex-direction:column;gap:4px;align-items:flex-start}',
    /* résumé : sommaire + colonnes */
    '.rs{display:flex;flex-direction:column}',
    '.rs-lead{order:1}.rs-side{order:2}.rs-toc{order:3}.rs-main{order:4}',
    '.rs-side .wo{display:none}',
    '.rs-toc{display:none}',
    '.na[data-panel="full"] .rs-toc{display:block;margin:30px 0 0}',
    '.rs-toc ol{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}',
    '.rs-toc a{display:block;font-size:13px;font-weight:700;color:var(--n-sec);text-decoration:none;padding:5px 10px;background:var(--n-f2);border-radius:var(--n-r);transition:color .15s,background .15s,box-shadow .15s}',
    '.rs-toc a:hover{color:var(--texte,#111)}',
    '.rs-toc a[aria-current="true"]{color:var(--texte,#111);box-shadow:inset 0 0 0 1px var(--texte,#111)}',
    '.rs-toc .n{font-family:var(--mono,monospace);font-weight:500;font-size:11px;margin-right:6px;color:var(--texte-3,#6E6E6A)}',
    '.rs-main .cbwn-md h3{scroll-margin-top:130px;display:flex;align-items:baseline;gap:10px}',
    '.rs-main .cbwn-md h3 .n{font-family:var(--mono,monospace);font-size:11px;font-weight:500;color:var(--texte-3,#6E6E6A);flex:none}',
    '.rs-main .cbwn-md h3:focus{outline:0}',
    '.rs-side .blk{margin-top:26px}',
    '.cbwn .att{white-space:nowrap}.rs-main{margin-top:34px}.na-da>div+div{margin-top:34px}',
    '.rs-side .blk>.lbl{display:block;margin-bottom:12px}',
    '@container napin (min-width:980px){',
    '  .na[data-panel="full"] .rs{display:grid;grid-template-columns:210px minmax(0,72ch);column-gap:56px;grid-template-areas:"toc lead" "toc side" "toc main";align-items:start}',
    '  .na[data-panel="full"] .rs-lead{grid-area:lead}.na[data-panel="full"] .rs-main{grid-area:main}.na[data-panel="full"] .rs-side{grid-area:side}',
    '  .na[data-panel="full"] .rs-toc{grid-area:toc;position:sticky;top:130px;margin:0;max-height:calc(100vh - 160px);overflow:auto}',
    '  .na[data-panel="full"] .rs-toc ol{flex-direction:column;gap:1px;margin-top:12px}',
    '  .na[data-panel="full"] .rs-toc a{background:none;padding:7px 10px 7px 12px;border-left:2px solid var(--n-fil);border-radius:0;line-height:1.35}',
    '  .na[data-panel="full"] .rs-toc a[aria-current="true"]{box-shadow:none;border-left-color:var(--texte,#111);background:var(--n-f2)}',
    '  .na[data-panel="full"] .rs-toc .n{display:block;margin:0 0 2px}',
    '  .na[data-panel="full"] .na-pd{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px;align-items:start}',
    '  .na[data-panel="full"] .na-pd .pp{margin:0}',
    '  .na[data-panel="full"] .na-da>div+div{margin-top:0}.na[data-panel="full"] .rs-main{margin-top:0}.na[data-panel="full"] .rs-lead{margin-bottom:34px}',
    '  .na[data-panel="full"] .na-da{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:56px;align-items:start}',
    '  .na[data-panel="full"] .na-tr{display:grid;grid-template-columns:250px minmax(0,78ch);column-gap:48px;align-items:start}',
    '  .na[data-panel="full"] .na-tr .tr-side{position:sticky;top:130px}',
    '  .na[data-panel="full"] .na-tr .tr-leg{flex-direction:column;align-items:stretch}',
    '  .na[data-panel="full"] .na-chr{max-width:820px}',
    '}',
    '@media (min-width:1400px){@container napin (min-width:1180px){',
    '  .na[data-panel="full"] .rs{grid-template-columns:210px minmax(0,1fr) 340px;grid-template-areas:"toc lead side" "toc main side"}',
    '  .na[data-panel="full"] .rs-side{position:sticky;top:130px;max-height:calc(100vh - 150px);overflow:auto;padding:4px 2px 4px 28px;border-left:1px solid var(--n-fil)}',
    '  .na[data-panel="full"] .rs-side .blk:first-child{margin-top:0}',
    '  .na[data-panel="full"] .rs-side .wo{display:block}',
    '  .na[data-panel="full"] .rs-side .na-parts{flex-direction:column;gap:10px}',
    '  .na[data-panel="full"] .rs-side .na-parts li{flex-direction:column;gap:4px;align-items:flex-start}',
    '}}',
    /* par personne */
    '.pp{background:var(--n-f2);border-radius:var(--n-r2);padding:18px 20px 16px;margin:0 0 14px;border-top:3px solid var(--sp)}',
    '.pp .hd{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '.pp .role{font-size:13.5px;color:var(--n-sec);margin-top:8px}',
    '.pp .spk{background:var(--fond,#fff)}',
    '.pp .st{display:flex;align-items:center;gap:10px;margin:14px 0 4px}',
    '.pp .st .lbl{font-size:11px;white-space:nowrap}',
    '.pp .meter{flex:1;height:4px;background:var(--fond,#fff);position:relative;overflow:hidden}',
    '.pp .meter i{position:absolute;inset:0;background:var(--sp);transform-origin:left;transform:scaleX(var(--v,0));animation:naGrow .7s var(--n-out) both}',
    '@keyframes naGrow{from{transform:scaleX(0)}}',
    '.pp .cbwn-md{font-size:14.5px;line-height:1.6;margin-top:14px}',
    '.pp .cbwn-md ul{margin-bottom:8px}',
    '.pp .cbwn-md ul>li::before{background:var(--sp)}',
    '.pp .acts{margin-top:12px;padding-top:12px;border-top:1px solid var(--n-fil)}',
    '.pp .acts .lbl{display:block;margin-bottom:6px}',
    /* décisions & actions */
    '.na-dec{list-style:none;margin:0 0 6px;padding:0;counter-reset:d}',
    '.na-dec li{display:flex;gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--n-fil);font-size:15px;line-height:1.55}',
    '.na-dec li:first-child{padding-top:0}',
    '.na-dec li::before{counter-increment:d;content:"D" counter(d);font-family:var(--mono,monospace);font-size:11px;font-weight:700;color:var(--vert-pt,#15803D);background:color-mix(in srgb,var(--vert,#1FD26A) 16%,transparent);padding:2px 6px;flex:none}',
    '.na-qo li::before{content:"?";color:var(--n-bl);background:color-mix(in srgb,var(--n-bl) 10%,transparent);padding:2px 8px}',
    '.na-grp{margin:0 0 18px}',
    '.na-grp .gh{display:flex;align-items:center;gap:10px;margin-bottom:6px}',
    '.na-grp .gh .lbl{font-size:11px}',
    '.na-chk{list-style:none;margin:0;padding:0}',
    '.na-chk li{display:flex;gap:12px;align-items:flex-start;padding:7px 0;font-size:14.5px;line-height:1.5}',
    '.na-chk .bx{width:15px;height:15px;border:1.5px solid var(--texte,#111);border-radius:2px;flex:none;margin-top:3px;position:relative}',
    '.na-chk li.dn .bx{background:var(--n-ink);border-color:var(--n-ink)}',
    '.na-chk li.dn .bx::after{content:"";position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid var(--n-ink-t);border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '.na-chk li.dn .w{color:var(--n-sec);text-decoration:line-through;text-decoration-thickness:1px}',
    '.na-chk .due{display:inline-block;font-family:var(--mono,monospace);font-size:11px;padding:1px 6px;margin-left:8px;background:var(--n-or-bg);color:var(--texte,#111);white-space:nowrap;vertical-align:1px}',
    /* transcription */
    '.tr-side{margin-bottom:18px}',
    '.tr-leg{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}',
    '.tr-leg .li{display:flex;align-items:center;gap:8px;font-family:var(--mono,monospace);font-size:11.5px;color:var(--n-sec);font-variant-numeric:tabular-nums}',
    '.tr-q{display:flex;align-items:center;gap:8px;color:var(--n-sec);border:1px solid var(--n-fil);border-radius:var(--n-r);padding:0 10px;background:var(--fond,#fff);transition:border-color .2s}',
    '.tr-q:focus-within{border-color:var(--texte,#111);color:var(--texte,#111)}',
    '.tr-q input{appearance:none;flex:1;min-width:0;height:36px;border:0;background:none;color:var(--texte,#111);font:inherit;font-size:14px;outline:0}',
    '.tr-q input::placeholder{color:var(--texte-3,#6E6E6A)}',
    '.tr-q .lbl{font-size:10.5px;white-space:nowrap}',
    '.tl{list-style:none;margin:0;padding:0}',
    '.tl li{display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;padding:9px 0 9px;border-bottom:1px solid color-mix(in srgb,var(--n-fil) 60%,transparent);scroll-margin-top:140px;transition:background .6s}',
    '.tl li.flash{background:var(--n-f2)}',
    '.tl .tt{appearance:none;border:0;background:none;font-family:var(--mono,monospace);font-size:12px;color:var(--n-sec);font-variant-numeric:tabular-nums;padding:3px 0 0;text-align:left;cursor:copy;align-self:start;transition:color .15s}',
    '.tl .tt:hover{color:var(--n-bl);text-decoration:underline;text-underline-offset:3px}',
    '.tl .bd{border-left:2px solid var(--sp);padding-left:12px;font-size:14.5px;line-height:1.6}',
    '.tl .bd .spk{margin:0 6px 2px 0;font-size:12px;padding:1px 7px 1px 6px}',
    '.tl .bd .spk::before{width:7px;height:7px}',
    '.tl li.cont .bd .who{display:none}',
    '.tl li.cont{border-top:0}',
    '.tl mark{background:color-mix(in srgb,var(--n-or) 30%,transparent);color:inherit;padding:0 1px}',
    '.tr-raw{white-space:pre-wrap;font-size:14px;line-height:1.7;color:var(--n-sec);max-width:72ch}',
    /* chronologie */
    '.na-chr{list-style:none;margin:0;padding:0;position:relative}',
    '.na-chr li{display:grid;grid-template-columns:64px 22px minmax(0,1fr);align-items:start;position:relative;padding-bottom:22px}',
    '.na-chr li::before{content:"";position:absolute;left:69px;top:14px;bottom:-4px;width:2px;background:var(--n-fil)}',
    '.na-chr li:last-child::before{display:none}',
    '.na-chr .dot{width:12px;height:12px;margin:5px 0 0 0;background:var(--fond,#fff);box-shadow:inset 0 0 0 2px var(--texte,#111);position:relative;z-index:1;transition:background .2s}',
    '.na-chr li:first-child .dot{background:var(--texte,#111)}',
    '.na-chr li:hover .dot{background:var(--n-bl);box-shadow:inset 0 0 0 2px var(--n-bl)}',
    '.na-chr .tt{appearance:none;border:0;background:none;font-family:var(--mono,monospace);font-size:12.5px;color:var(--n-sec);font-variant-numeric:tabular-nums;padding:2px 0 0;text-align:left;cursor:pointer}',
    '.na-chr button.tt:hover{color:var(--n-bl);text-decoration:underline;text-underline-offset:3px}',
    '.na-chr .s{font-size:15.5px;font-weight:700;line-height:1.4}',
    '.na-chr .d{display:block;font-family:var(--mono,monospace);font-size:11px;color:var(--n-sec);margin-top:4px;font-weight:500}',
    '.na-chr .bar{display:block;height:3px;margin-top:8px;background:var(--n-f2);max-width:320px;overflow:hidden}',
    '.na-chr .bar i{display:block;height:100%;background:var(--texte,#111);transform-origin:left;transform:scaleX(var(--v,0));animation:naGrow .7s var(--n-out) both}',

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
    /* ---- micro-interactions au survol (couleurs partout ; déplacements seulement sans mouvement réduit) ---- */
    '.na-row .ic{transition:background .2s var(--n-ease),color .2s var(--n-ease)}',
    '.na-row:hover .ic,.na-row:focus-visible .ic{background:var(--n-ink);color:var(--n-ink-t)}',
    '.na-row .ic svg,.na-row .t,.na-row .m{transition:transform .24s var(--n-out),color .2s}',
    '.na-row:hover .m,.na-row:focus-visible .m{color:var(--texte,#111)}',
    '.cbwn .bi svg,.cbwn .bt svg,.cbwn .brec .dot{transition:transform .2s var(--n-ease),box-shadow .2s var(--n-ease)}',
    '.cbwn .brec:not(:disabled):hover .dot,.cbwn .brec:focus-visible .dot{box-shadow:0 0 0 4px color-mix(in srgb,var(--n-or) 28%,transparent)}',
    '.na-tabs .tab::after{content:"";position:absolute;left:10px;right:10px;bottom:0;height:2px;background:var(--fil-fort,#C4C4BF);transform:scaleX(0);transform-origin:left;transition:transform .2s var(--n-out)}',
    '.na-tabs .tab:first-child::after{left:2px}',
    '.na-tabs .tab[aria-selected="false"]:hover::after,.na-tabs .tab[aria-selected="false"]:focus-visible::after{transform:scaleX(1)}',
    '.na-tabs .tab[aria-selected="false"]:hover .ct{background:var(--n-f3);color:var(--texte,#111)}',
    '.rs-toc a:hover,.rs-toc a:focus-visible{background:var(--n-f3)}',
    '.rs-toc a:hover .n,.rs-toc a:focus-visible .n{color:var(--texte,#111)}',
    '.na[data-panel="full"] .rs-toc a:hover{border-left-color:var(--texte-3,#6E6E6A)}',
    '.na-chr .dot{transition:background .2s,box-shadow .2s,transform .24s var(--n-out)}',
    '.na-chr .s{display:inline-block;transition:transform .24s var(--n-out)}',
    '.na-chr li:hover .tt{color:var(--n-bl)}',
    '.tl li:hover{background:color-mix(in srgb,var(--n-f2) 70%,transparent);transition:background .2s}',
    '.tl li:hover .tt{color:var(--texte,#111)}',
    '.cbwn .spk::before{transition:transform .24s var(--n-out)}',
    '.na-srch:hover{border-bottom-color:var(--n-fil)}',
    '.tr-q:hover{border-color:var(--texte-3,#6E6E6A)}',
    '.na-raw summary:hover .pl,.na-raw summary:focus-visible .pl{background:var(--n-f3)}',
    '.pp{transition:box-shadow .2s var(--n-ease)}',
    '.pp:hover{box-shadow:0 2px 0 var(--n-fil)}',
    '.na-menu .btn:not(:disabled):hover,.na-menu .btn:focus-visible{box-shadow:inset 2px 0 0 currentColor}',
    '@media (prefers-reduced-motion:no-preference){',
    '  .na-row:hover .ic svg,.na-row:focus-visible .ic svg{transform:translateY(-2px) rotate(-6deg)}',
    '  .na-row:hover .t,.na-row:focus-visible .t{transform:translateX(3px)}',
    '  .cbwn .bi:not(:disabled):hover svg,.cbwn .bi:focus-visible svg{transform:scale(1.12)}',
    '  .cbwn .bt:not(:disabled):hover svg,.cbwn .bt:focus-visible svg{transform:translateY(-1px)}',
    '  .na-chr li:hover .dot{transform:rotate(45deg) scale(.9)}',
    '  .na-chr li:hover .s{transform:translateX(3px)}',
    '  .cbwn button.spk:hover::before,.cbwn button.spk:focus-visible::before{transform:rotate(45deg) scale(.85)}',
    '  .na-raw:not([open]) summary:hover .pl{transform:rotate(90deg)}',
    '}',
    '@media (prefers-reduced-motion:reduce){.cbwn *,.cbwn,.cbwn-scrim,.cbwn-dlg,.cbwn-toast,.na-shell,.na-panel,.na-focus{animation:none!important;transition:none!important}.cbwn .meter i,.cbwn .na-chr .bar i{animation:none!important}.cbwn .shim{color:var(--texte,#111);background:none}.na[data-mode="session"] .na-shell{transform:none}}'
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

  /* ---------- Notes v2 : sections H2, locuteurs, segments ---------- */
  var SEC_KEYS = { 'en bref': 'bref', 'participants': 'parts', 'sujets abordes': 'sujets', 'decisions': 'dec', 'actions': 'act',
    'questions ouvertes': 'qo', 'par personne': 'pp', 'chronologie': 'chrono' };
  function secKey(t) { return SEC_KEYS[fold(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()] || null; }
  function splitSections(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var h1 = null, intro = [], secs = [], cur = null, fence = false;
    lines.forEach(function (ln) {
      if (/^\s*```/.test(ln)) fence = !fence;
      var m;
      if (!fence && !cur && h1 === null && !intro.join('').trim() && (m = /^#\s+(.+?)\s*#*\s*$/.exec(ln))) { h1 = m[1]; return; }
      if (!fence && (m = /^##\s+(.+?)\s*#*\s*$/.exec(ln))) { cur = { title: m[1], key: secKey(m[1]), body: [] }; secs.push(cur); return; }
      (cur ? cur.body : intro).push(ln);
    });
    secs.forEach(function (s) { s.body = s.body.join('\n').trim(); });
    return { h1: h1, intro: intro.join('\n').trim(), secs: secs };
  }
  function cleanName(s) { return String(s || '').replace(/[*_`]/g, '').replace(/\s*[:：]\s*$/, '').trim(); }
  function listItems(body) { // items de 1er niveau (les sous-points sont rattachés)
    var out = [];
    String(body || '').split('\n').forEach(function (ln) {
      var m = /^([-*+]|\d+[.)])\s+(.*)$/.exec(ln);
      if (m) out.push(m[2].trim());
      else if (out.length && /^\s+\S/.test(ln)) out[out.length - 1] += ' ' + ln.trim().replace(/^([-*+]|\d+[.)])\s+/, '· ');
    });
    return out;
  }
  function splitDash(s) { return String(s).split(/\s+[—–]\s+|\s+-\s+(?=\S)/); }
  function parseTime(s) {
    var p = String(s).split(':').map(Number); if (p.some(isNaN)) return null;
    return (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * 1000;
  }
  function segsFromTranscript(t) {
    var segs = [], re = /^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:\n]{1,48}?)\s*:\s*(.*)$/;
    String(t || '').split('\n').forEach(function (ln) {
      var m = re.exec(ln);
      if (m) segs.push({ startMs: parseTime(m[1]), speaker: m[2].trim(), text: m[3] });
      else if (segs.length && ln.trim()) segs[segs.length - 1].text += ' ' + ln.trim();
    });
    return segs.length >= 2 ? segs : [];
  }
  function parseNote(n) {
    var sp = splitSections(n.markdown), S = {};
    sp.secs.forEach(function (s) { if (s.key && !S[s.key]) S[s.key] = s; });
    var v2 = !!(S.bref || S.parts || S.sujets || S.pp || S.chrono);
    var segs = (Array.isArray(n.segments) && n.segments.length ? n.segments : segsFromTranscript(n.transcript))
      .filter(function (s) { return s && s.text; })
      .map(function (s) { return { startMs: +s.startMs || 0, endMs: +s.endMs || 0, speaker: String(s.speaker || '—'), text: String(s.text) }; });
    var D = { v2: v2, h1: sp.h1, intro: sp.intro, secs: sp.secs, S: S, segs: segs, names: [], idx: {}, stats: {}, parts: [], pp: [], dec: [], qo: [], acts: [], chrono: [] };
    function addName(nm) { nm = cleanName(nm); if (nm && nm.length <= 48 && !(nm in D.idx)) { D.idx[nm] = D.names.length; D.names.push(nm); } return nm; }
    segs.forEach(function (s) { addName(s.speaker); });
    if (S.parts) listItems(S.parts.body).forEach(function (it) {
      var p = splitDash(it), nm = cleanName(p[0]), role = p.slice(1).join(' — ');
      if (p.length < 2) { var c = /^([^:]{1,48}):\s*(.*)$/.exec(it); if (c) { nm = cleanName(c[1]); role = c[2]; } }
      D.parts.push({ name: addName(nm), role: role });
    });
    if (S.pp) {
      var cur = null;
      S.pp.body.split('\n').forEach(function (ln) {
        var m = /^###\s+(.+?)\s*#*\s*$/.exec(ln);
        if (m) { var h = splitDash(m[1]); cur = { name: addName(h[0].replace(/\s*\(.*\)\s*$/, '')), role: h.slice(1).join(' — '), body: [] }; D.pp.push(cur); }
        else if (cur) cur.body.push(ln);
      });
      D.pp.forEach(function (p) { p.body = p.body.join('\n').trim(); });
    }
    if (S.dec) D.dec = listItems(S.dec.body);
    if (S.qo) D.qo = listItems(S.qo.body);
    if (S.act) listItems(S.act.body).forEach(function (it) {
      var tk = /^\[([ xX])\]\s*(.*)$/.exec(it), done = !!(tk && tk[1] !== ' '), txt = tk ? tk[2] : it;
      var p = splitDash(txt), who = '', what = txt, due = '';
      if (p.length >= 2 && cleanName(p[0]).length <= 48) { who = cleanName(p[0]); what = p[1]; due = p.slice(2).join(' — '); }
      D.acts.push({ done: done, who: who, what: what, due: due });
    });
    if (S.chrono) listItems(S.chrono.body).forEach(function (it) {
      var m = /^\**(\d{1,2}:\d{2}(?::\d{2})?)\**\s*[—–-]?\s*(.*)$/.exec(it);
      if (m) D.chrono.push({ ms: parseTime(m[1]), t: m[1], s: m[2] });
    });
    // temps de parole
    var tot = 0;
    segs.forEach(function (s, i) {
      var end = s.endMs > s.startMs ? s.endMs : (segs[i + 1] ? segs[i + 1].startMs : s.startMs + 4000);
      var d = Math.max(0, end - s.startMs), k = cleanName(s.speaker);
      var o = D.stats[k] || (D.stats[k] = { ms: 0, turns: 0 }); o.ms += d; o.turns++; tot += d;
    });
    D.totalMs = tot;
    // sujets (### du bloc « Sujets abordés ») pour le sommaire
    D.topics = S.sujets ? S.sujets.body.split('\n').filter(function (l) { return /^###\s+/.test(l); }).map(function (l) { return l.replace(/^###\s+/, '').replace(/\s*#*\s*$/, ''); }) : [];
    // regex des noms (le plus long d'abord), appliquée au texte hors balises
    var esced = D.names.filter(function (x) { return x.length >= 2; }).map(esc).sort(function (a, b) { return b.length - a.length; });
    D.re = esced.length ? new RegExp('(^|[^\\w\\u00C0-\\u024F])(' + esced.map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![\\w\\u00C0-\\u024F])', 'g') : null;
    D.byEsc = {}; D.names.forEach(function (x) { D.byEsc[esc(x)] = x; });
    return D;
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
      prog: null, progAt: 0, reorgId: null, busy: false, alive: true, title: '', marks: [], menu: false, tab: 'res', tq: '', parsed: null, renaming: null };
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
    function onPanelScroll(e) { var b = $('.na-bar'); if (b) b.classList.toggle('sc', e.target.scrollTop > 4); onTocScroll(); }
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
    /* ---- v2 : rendu du compte rendu (onglets) ---- */
    var PEN = '<svg class="pen" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
    function D() {
      var n = st.note;
      if (!n) return null;
      if (!st.parsed || st.parsed.n !== n) st.parsed = { n: n, d: parseNote(n) };
      return st.parsed.d;
    }
    function spCls(name) { var d = D(), i = d && name in d.idx ? d.idx[name] : 4; return 'sp' + (i % 7); }
    function chip(name, extra) {
      name = cleanName(name) || '—';
      var cls = 'spk ' + spCls(name) + (extra ? ' ' + extra : '');
      if (!has('renameSpeaker')) return '<span class="' + cls + '">' + esc(name) + '</span>';
      return '<button type="button" class="' + cls + '" data-act="spk" data-spk="' + esc(name) + '" title="Renommer « ' + esc(name) + ' »">' + esc(name) + PEN + '</button>';
    }
    function spkify(html) {
      var d = D(); if (!d || !d.re) return html;
      return html.split(/(<[^>]*>)/).map(function (part, i, arr) {
        if (i % 2 || !part) return part;
        // pas de puce dans une puce ni dans du code
        var prev = arr[i - 1] || '';
        if (/^<(code|button)/.test(prev)) return part;
        return part.replace(d.re, function (_, pre, nm) { return pre + chip(d.byEsc[nm] || nm, 'it'); });
      }).join('');
    }
    function md(body) { return body && body.trim() ? spkify(renderMarkdown(body)).replace(/ — (<(button|span) class="spk [\s\S]*?<\/\2>)/g, ' <span class="att">—&nbsp;$1</span>') : ''; }
    function share(d, name) { var s = d.stats[name]; return s && d.totalMs ? s.ms / d.totalMs : 0; }
    function tabsFor(d, n) {
      var t = [{ k: 'res', l: 'Résumé' }];
      if (d.v2 && (d.pp.length || d.names.length)) t.push({ k: 'pp', l: 'Par personne', n: d.names.length });
      if (d.v2 && (d.dec.length || d.acts.length || d.qo.length)) t.push({ k: 'da', l: 'Décisions & actions', n: d.dec.length + d.acts.length });
      if (d.segs.length || String(n.transcript || '').trim()) t.push({ k: 'tr', l: 'Transcription', n: d.segs.length || null });
      if (d.chrono.length) t.push({ k: 'ch', l: 'Chronologie', n: d.chrono.length });
      return t;
    }
    function tabsHTML(tabs) {
      return '<div class="na-tabs i" role="tablist" aria-label="Sections du compte rendu">' + tabs.map(function (t) {
        var on = t.k === st.tab;
        return '<button type="button" class="tab" role="tab" id="na-tab-' + t.k + '" data-act="tab" data-tab="' + t.k + '" aria-controls="na-pane" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' +
          esc(t.l) + (t.n ? '<span class="ct">' + esc(t.n) + '</span>' : '') + '</button>';
      }).join('') + '<span class="ul" aria-hidden="true"></span></div>';
    }
    function partsHTML(d, col) {
      var list = d.parts.length ? d.parts : d.names.map(function (x) { return { name: x, role: '' }; });
      if (!list.length) return '';
      return '<ul class="na-parts' + (col ? ' col' : '') + '">' + list.map(function (p) {
        return '<li>' + chip(p.name) + (p.role ? '<span>' + spkify(inline(p.role)) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    function decHTML(items, qo) {
      return '<ol class="na-dec' + (qo ? ' na-qo' : '') + '">' + items.map(function (x) { return '<li><span>' + spkify(inline(x)) + '</span></li>'; }).join('') + '</ol>';
    }
    function actItem(a) {
      return '<li class="' + (a.done ? 'dn' : '') + '"><span class="bx" role="img" aria-label="' + (a.done ? 'Fait' : 'À faire') + '"></span><span><span class="w">' + spkify(inline(a.what)) + '</span>' +
        (a.due ? '<span class="due">' + esc(a.due.replace(/[*_`]/g, '')) + '</span>' : '') + '</span></li>';
    }
    function paneRes(d, n, m) {
      var src = String(n.markdown || '');
      if (!d.v2) { // note v1 / inconnue : tout le Markdown, comme avant
        var mt = /^\s*#\s+(.+)\n?/.exec(src);
        if (mt && fold(mt[1].trim()) === fold(m.title || '')) src = src.slice(mt[0].length);
        return '<div class="cbwn-md">' + (src.trim() ? md(src) : '<p>Cette note est vide.</p>') + '</div>';
      }
      var S = d.S, h = '';
      var h1 = d.h1 && fold(d.h1.trim()) !== fold(m.title || '') ? '<div class="cbwn-md"><h1>' + inline(d.h1) + '</h1></div>' : '';
      var lead = h1 + (d.intro ? '<div class="lead">' + md(d.intro) + '</div>' : '') +
        (S.bref ? '<div class="lbl sec-t">En bref</div><div class="lead">' + md(S.bref.body) + '</div>' : '');
      // sujets : titres numérotés + ancres pour le sommaire
      var k = 0, sujets = S.sujets ? md(S.sujets.body).replace(/<h3>/g, function () { k++; return '<h3 id="na-s-' + k + '" tabindex="-1"><span class="n">' + pad(k) + '</span>'; }) : '';
      var others = d.secs.filter(function (s) { return !s.key && s.body; }).map(function (s) { return '<div class="cbwn-md"><h2>' + inline(s.title) + '</h2>' + md(s.body) + '</div>'; }).join('');
      var toc = d.topics.length > 1 ? '<nav class="rs-toc" aria-label="Sommaire des sujets"><span class="lbl">Sommaire</span><ol>' + d.topics.map(function (t, i) {
        return '<li><a href="#na-s-' + (i + 1) + '" data-act="toc" data-to="na-s-' + (i + 1) + '"' + (i ? '' : ' aria-current="true"') + '><span class="n">' + pad(i + 1) + '</span>' + inline(t.replace(/^\d+[.)]\s*/, '')) + '</a></li>';
      }).join('') + '</ol></nav>' : '';
      var parts = partsHTML(d);
      var side = (parts ? '<div class="blk"><span class="lbl">Participants · ' + (d.parts.length || d.names.length) + '</span>' + parts + '</div>' : '') +
        (d.dec.length ? '<div class="blk wo"><span class="lbl">Décisions · ' + d.dec.length + '</span>' + decHTML(d.dec) +
          '<button class="btn b3" data-act="tab" data-tab="da">Toutes les actions <span class="ar">→</span></button></div>' : '');
      h = '<div class="rs"><div class="rs-lead">' + lead + '</div>' + (side ? '<aside class="rs-side">' + side + '</aside>' : '') + toc +
        '<div class="rs-main">' + (sujets ? '<div class="lbl sec-t">Sujets abordés · ' + d.topics.length + '</div><div class="cbwn-md">' + sujets.replace(/^<h3/, '<h3') + '</div>' : '') + others + '</div></div>';
      return h;
    }
    function panePP(d) {
      var byName = {}; d.pp.forEach(function (p) { byName[p.name] = p; });
      var roles = {}; d.parts.forEach(function (p) { roles[p.name] = p.role; });
      var names = d.names.slice();
      return '<div class="na-pd">' + names.map(function (nm) {
        var p = byName[nm] || { body: '', role: '' }, s = d.stats[nm], sh = share(d, nm), role = p.role || roles[nm] || '';
        var acts = d.acts.filter(function (a) { return a.who === nm; });
        return '<section class="pp ' + spCls(nm) + '"><div class="hd">' + chip(nm, 'lg') + '</div>' +
          (role ? '<div class="role">' + spkify(inline(role)) + '</div>' : '') +
          (s ? '<div class="st"><span class="lbl">' + esc(Math.round(sh * 100)) + ' % · ' + esc(dur(s.ms)) + ' · ' + esc(s.turns) + ' interv.</span><span class="meter"><i style="--v:' + sh.toFixed(3) + '"></i></span></div>' : '') +
          (p.body ? '<div class="cbwn-md">' + md(p.body) + '</div>' : '') +
          (acts.length ? '<div class="acts"><span class="lbl">Ses actions · ' + acts.length + '</span><ul class="na-chk">' + acts.map(actItem).join('') + '</ul></div>' : '') +
          '</section>';
      }).join('') + '</div>';
    }
    function paneDA(d) {
      var groups = [], gi = {};
      d.acts.forEach(function (a) { var k = a.who || ''; if (!(k in gi)) { gi[k] = groups.length; groups.push({ who: k, items: [] }); } groups[gi[k]].items.push(a); });
      groups.sort(function (a, b) { return (a.who ? (a.who in d.idx ? d.idx[a.who] : 50) : 99) - (b.who ? (b.who in d.idx ? d.idx[b.who] : 50) : 99); });
      var left = (d.dec.length ? '<div class="lbl sec-t">Décisions · ' + d.dec.length + '</div>' + decHTML(d.dec) : '') +
        (d.qo.length ? '<div class="lbl sec-t">Questions ouvertes · ' + d.qo.length + '</div>' + decHTML(d.qo, true) : '');
      var right = d.acts.length ? '<div class="lbl sec-t">Actions · ' + d.acts.length + '</div>' + groups.map(function (g) {
        return '<div class="na-grp"><div class="gh">' + (g.who ? chip(g.who) : '<span class="spk sp6">Non attribué</span>') + '<span class="lbl">' + g.items.filter(function (a) { return !a.done; }).length + ' à faire</span></div>' +
          '<ul class="na-chk">' + g.items.map(actItem).join('') + '</ul></div>';
      }).join('') : '';
      return '<div class="na-da"><div>' + left + '</div><div>' + right + '</div></div>';
    }
    function hl(text, q) { // surligne q (sans accents ni casse) dans text, tout échappé
      if (!q) return esc(text);
      var f = fold(text), out = '', i = 0, j;
      if (f.length !== text.length) return esc(text);
      while ((j = f.indexOf(q, i)) !== -1) { out += esc(text.slice(i, j)) + '<mark>' + esc(text.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
      return out + esc(text.slice(i));
    }
    function trLines(d) {
      var q = fold(st.tq.trim()), prev = null, n = 0;
      var h = d.segs.map(function (s, i) {
        var nm = cleanName(s.speaker);
        if (q && fold(s.text).indexOf(q) === -1 && fold(nm).indexOf(q) === -1) { prev = null; return ''; }
        n++;
        var cont = prev === nm; prev = nm;
        var t = clock(s.startMs);
        return '<li class="' + spCls(nm) + (cont ? ' cont' : '') + '" data-i="' + i + '"><button type="button" class="tt" data-act="tcopy" data-t="' + esc(t) + '" title="Copier ' + esc(t) + '">' + esc(t) + '</button>' +
          '<div class="bd"><span class="who">' + chip(nm) + '</span>' + hl(s.text, q) + '</div></li>';
      }).join('');
      if (!n) return '<div class="na-none">Aucun passage ne contient « ' + esc(st.tq.trim()) + ' ».</div>';
      return '<ol class="tl" aria-label="Transcription horodatée">' + h + '</ol>';
    }
    function paneTR(d, n) {
      if (!d.segs.length) return '<div class="tr-raw">' + esc(n.transcript) + '</div>';
      var leg = d.names.map(function (nm) { return '<span class="li">' + chip(nm) + esc(Math.round(share(d, nm) * 100)) + ' %</span>'; }).join('');
      return '<div class="na-tr"><div class="tr-side"><div class="tr-leg">' + leg + '</div>' +
        '<label class="tr-q">' + I.search + '<input type="search" data-act="tq" placeholder="Chercher dans la transcription" aria-label="Chercher dans la transcription" autocomplete="off" spellcheck="false" value="' + esc(st.tq) + '"><span class="lbl" data-r="tqn"></span></label></div>' +
        '<div data-r="tl">' + trLines(d) + '</div></div>';
    }
    function paneCH(d, m) {
      var end = Math.max(m.durationMs || 0, d.chrono.length ? d.chrono[d.chrono.length - 1].ms + 60000 : 0);
      var canJump = d.segs.length > 0;
      return '<ol class="na-chr">' + d.chrono.map(function (c, i) {
        var nx = d.chrono[i + 1] ? d.chrono[i + 1].ms : end, len = Math.max(0, nx - c.ms);
        return '<li><' + (canJump ? 'button type="button" data-act="jump" data-ms="' + c.ms + '" title="Voir dans la transcription"' : 'span') + ' class="tt">' + esc(c.t) + '</' + (canJump ? 'button' : 'span') + '>' +
          '<span class="dot" aria-hidden="true"></span><div><span class="s">' + spkify(inline(c.s)) + '</span>' +
          (len ? '<span class="d">≈ ' + esc(dur(len)) + '</span><span class="bar" aria-hidden="true"><i style="--v:' + (end ? Math.min(1, len / end * 3).toFixed(3) : 0) + '"></i></span>' : '') + '</div></li>';
      }).join('') + '</ol>';
    }
    function paneHTML(k) {
      var d = D(), n = st.note, m = n.meta;
      if (k === 'pp') return panePP(d);
      if (k === 'da') return paneDA(d);
      if (k === 'tr') return paneTR(d, n);
      if (k === 'ch') return paneCH(d, m);
      return paneRes(d, n, m) + (m.path ? '<div class="path">' + esc(m.path) + '</div>' : '');
    }
    function moveUl(anim) {
      var tl = $('.na-tabs'), b = tl && tl.querySelector('.tab[aria-selected="true"]'), ul = tl && tl.querySelector('.ul');
      if (!b || !ul) return;
      if (!anim) tl.classList.add('i');
      var pad0 = b === tl.firstElementChild ? 2 : 10;
      ul.style.width = (b.offsetWidth - pad0 - 10) + 'px';
      ul.style.transform = 'translateX(' + (b.offsetLeft + pad0) + 'px)';
      if (!anim) requestAnimationFrame(function () { requestAnimationFrame(function () { tl.classList.remove('i'); }); });
    }
    function updateTqCount() {
      var c = $('[data-r="tqn"]'); if (!c) return;
      var n = root.querySelectorAll('.tl li').length;
      c.textContent = st.tq.trim() ? n + ' / ' + D().segs.length : '';
    }
    function switchTab(k, focus) {
      var tl = $('.na-tabs'); if (!tl || !st.note) return;
      var b = tl.querySelector('[data-tab="' + k + '"]'); if (!b) return;
      st.tab = k;
      [].forEach.call(tl.querySelectorAll('.tab'), function (t) { var on = t === b; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
      moveUl(true);
      if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      var pane = $('[data-r="pane"]'), pin = $('[data-r="side"]');
      pane.setAttribute('aria-labelledby', 'na-tab-' + k);
      pane.innerHTML = paneHTML(k);
      pane.classList.remove('in'); void pane.offsetWidth; pane.classList.add('in');
      updateTqCount();
      var top = tl.offsetTop - 61; // garde les onglets en haut si on avait défilé plus bas
      if (pin && pin.scrollTop > top) pin.scrollTop = top;
      if (focus) b.focus({ preventScroll: true });
      onTocScroll();
    }
    function cycleTab(dir, focus) {
      var tabs = [].slice.call(root.querySelectorAll('.na-tabs .tab')); if (!tabs.length) return;
      var i = tabs.findIndex(function (t) { return t.getAttribute('data-tab') === st.tab; });
      switchTab(tabs[(i + dir + tabs.length) % tabs.length].getAttribute('data-tab'), focus);
    }
    var tocRaf = 0;
    function onTocScroll() {
      if (tocRaf) return;
      tocRaf = requestAnimationFrame(function () {
        tocRaf = 0;
        var pin = $('[data-r="side"]'), links = root.querySelectorAll('.rs-toc a'); if (!pin || !links.length) return;
        var lim = pin.getBoundingClientRect().top + 170, cur = links[0].getAttribute('data-to');
        [].forEach.call(links, function (a) { var h = root.querySelector('#' + a.getAttribute('data-to')); if (h && h.getBoundingClientRect().top < lim) cur = a.getAttribute('data-to'); });
        if (pin.scrollTop + pin.clientHeight >= pin.scrollHeight - 4) cur = links[links.length - 1].getAttribute('data-to');
        [].forEach.call(links, function (a) { if (a.getAttribute('data-to') === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      });
    }
    function jumpTo(ms) {
      st.tq = ''; switchTab('tr');
      var d = D(), best = 0;
      d.segs.forEach(function (s, i) { if (s.startMs <= ms + 999) best = i; });
      var li = root.querySelector('.tl li[data-i="' + best + '"]'); if (!li) return;
      li.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      li.classList.add('flash'); setTimeout(function () { li.classList.remove('flash'); }, 1400);
    }
    function copyText(t) {
      var ok = function () { toast('Copié : ' + t); };
      var fallback = function () {
        var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); ok(); } catch (e) { toast('Copie impossible', true); }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fallback); else fallback();
    }
    /* renommage d'un locuteur (puce → champ en ligne) */
    function startRename(b) {
      if (!has('renameSpeaker') || !st.note) return;
      cancelRename(true);
      var from = b.getAttribute('data-spk');
      var w = document.createElement('span');
      w.className = 'spk-ed ' + spCls(from);
      w.innerHTML = '<input data-act="spkin" maxlength="48" autocomplete="off" spellcheck="false" aria-label="Nouveau nom pour ' + esc(from) + ' — Entrée pour valider, Échap pour annuler"><kbd>↵</kbd>';
      var inp = w.firstChild; inp.value = from; inp.setAttribute('data-from', from);
      b.replaceWith(w); st.renaming = w;
      inp.focus({ preventScroll: true }); inp.select();
    }
    function cancelRename(silent) {
      var w = st.renaming; st.renaming = null;
      if (!w || !w.isConnected) return;
      if (!silent) { st.keepScroll = true; refreshPane(); }
    }
    function refreshPane() { var pane = $('[data-r="pane"]'); if (pane && st.note) { pane.innerHTML = paneHTML(st.tab); updateTqCount(); } }
    function commitRename(inp) {
      var from = inp.getAttribute('data-from'), to = inp.value.replace(/\s+/g, ' ').trim().slice(0, 48), id = st.note && st.note.meta.id;
      st.renaming = null;
      if (!to || to === from || !id) { refreshPane(); return; }
      inp.disabled = true;
      call('renameSpeaker', id, from, to).then(function () { return call('getNote', id); }).then(function (n) {
        if (!st.alive || st.sel !== id || !n || !n.meta) return;
        st.note = n; st.keepScroll = true; renderSide();
        toast('« ' + from + ' » s’appelle maintenant « ' + to + ' »');
      }).catch(function (e) { refreshPane(); toast(errMsg(e), true); });
    }
    function renderSide() {
      var el = $('[data-r="side"]'); if (!el) return;
      markSel();
      if (!st.sel) return;
      if (st.noteErr) { el.innerHTML = barHTML(false) + '<div class="na-read"><div class="na-none">' + esc(st.noteErr) + '</div></div>'; return; }
      var n = st.note;
      if (!n || !n.meta || n.meta.id !== st.sel) { el.innerHTML = barHTML(false) + '<div class="na-read"><div class="na-load lbl">Chargement…</div></div>'; return; }
      var m = n.meta, d = D(), tabs = tabsFor(d, n);
      if (!tabs.some(function (t) { return t.k === st.tab; })) st.tab = 'res';
      var raw = m.provider === 'passthrough', busy = st.reorgId === m.id && st.mode === 'processing';
      var keep = el.scrollTop; st.renaming = null;
      el.innerHTML = barHTML(true) + '<article class="na-read in">' +
        '<span class="lbl when">' + esc(longDate(m.createdAt)) + '</span>' +
        '<h2 class="ti">' + esc(m.title || 'Note sans titre') + '</h2>' +
        '<div class="meta"><span class="chip">' + esc(clock(m.durationMs)) + '</span><span class="chip">' + esc(words(m.words)) + '</span>' +
        (d.names.length ? '<span class="chip">' + esc(d.names.length + ' personne' + (d.names.length > 1 ? 's' : '')) + '</span>' : '') +
        '<span class="chip' + (raw ? '' : ' ok') + '">' + esc(raw ? 'Transcription brute' : prov(m.provider)) + '</span></div>' +
        (busy ? '<div class="na-busy lbl"><span class="pst"></span>Réorganisation en cours…</div>' : '') +
        (raw ? '<p class="warn">Aucun moteur IA n’était disponible : voici la transcription telle quelle. « Réorganiser » (menu ⋯) la reprend quand un moteur est prêt.</p>' : '') +
        tabsHTML(tabs) +
        '<div class="na-pane" id="na-pane" role="tabpanel" data-r="pane" aria-labelledby="na-tab-' + st.tab + '">' + paneHTML(st.tab) + '</div></article>';
      el.scrollTop = st.keepScroll ? keep : 0; st.keepScroll = false;
      moveUl(false); updateTqCount(); onTocScroll();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveUl(false); });
    }
    function openNote(id, focusPanel) {
      if (!CORE || !id) return;
      var was = st.sel; clearTimeout(sideT);
      st.sel = id; st.noteErr = null; st.menu = false;
      if (st.panel === 'closed') st.panel = 'open';
      if (!st.note || st.note.meta.id !== id) { st.note = null; if (was !== id) { st.tab = 'res'; st.tq = ''; } }
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
      else if (a === 'tab') switchTab(b.getAttribute('data-tab'), b.getAttribute('role') === 'tab');
      else if (a === 'spk') { e.preventDefault(); startRename(b); }
      else if (a === 'tcopy') copyText(b.getAttribute('data-t'));
      else if (a === 'jump') jumpTo(+b.getAttribute('data-ms') || 0);
      else if (a === 'toc') {
        e.preventDefault();
        var h = root.querySelector('#' + b.getAttribute('data-to'));
        if (h) { h.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }); h.focus({ preventScroll: true }); }
      }
    }
    function onInput(e) {
      var a = e.target.getAttribute('data-act');
      if (a === 'q') { st.q = e.target.value; renderList(); markSel(); }
      else if (a === 'title') st.title = e.target.value;
      else if (a === 'tq') { st.tq = e.target.value; refreshTr(); }
    }
    function refreshTr() { var tl = $('[data-r="tl"]'), d = D(); if (tl && d) { tl.innerHTML = trLines(d); updateTqCount(); } }
    function onFocusOut(e) {
      // quitter le champ de renommage sans valider = annuler
      if (e.target.getAttribute && e.target.getAttribute('data-act') === 'spkin' && st.renaming && !e.target.disabled) setTimeout(function () { if (st.renaming && !st.renaming.contains(document.activeElement)) cancelRename(); }, 0);
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
        if (tg.getAttribute && tg.getAttribute('data-act') === 'spkin') { e.preventDefault(); cancelRename(); return; }
        if (typing && tg.getAttribute('data-act') === 'tq') { e.preventDefault(); if (st.tq) { tg.value = ''; st.tq = ''; refreshTr(); } else tg.blur(); return; }
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
      if (e.key === 'Enter' && tg.getAttribute && tg.getAttribute('data-act') === 'spkin') { e.preventDefault(); commitRename(tg); return; }
      if (e.key === 'Enter' && tg.getAttribute && tg.getAttribute('data-act') === 'mark') { e.preventDefault(); addMark(tg); return; }
      if (e.key === 'Enter' && tg.getAttribute && tg.getAttribute('data-act') === 'title') { e.preventDefault(); var mk = $('[data-act="mark"]'); if (mk) mk.focus(); return; }
      if (modal || typing) return;
      if (st.mode === 'session') {
        if (e.key === ' ' && !(tg.tagName === 'BUTTON')) { e.preventDefault(); togglePause(); }
        return;
      }
      if (e.key === '/' && CORE) { e.preventDefault(); var q = $('[data-act="q"]'); if (q) q.focus(); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && st.sel && st.panel !== 'full' && (tg === document.body || root.contains(tg))) { e.preventDefault(); moveSel(e.key === 'ArrowDown' ? 1 : -1); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.metaKey && !e.altKey && !e.ctrlKey && st.sel && st.note && (tg === document.body || root.contains(tg)) && $('.na-tabs')) { e.preventDefault(); cycleTab(e.key === 'ArrowRight' ? 1 : -1, !!(tg.getAttribute && tg.getAttribute('role') === 'tab')); }
      else if (e.key === 'c' && e.metaKey && st.note && !String(window.getSelection ? window.getSelection() : '').length) { e.preventDefault(); noteAction('copy'); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('focusout', onFocusOut);
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
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('focusout', onFocusOut);
        document.removeEventListener('keydown', onKey);
        root.remove();
      }
    };
  }

  window.CBWNotes = { mount: mount, renderMarkdown: renderMarkdown };
})();

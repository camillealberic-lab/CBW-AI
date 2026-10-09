/* CBW AI — site : thème, démo avant/après, mini UI pilotées par le défilement, défilement doux, aide. Vanilla, sans dépendance. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqPin = window.matchMedia('(min-width:1081px) and (min-height:700px)');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var borne = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ENTETE = 66;

  /* ── Thème clair / sombre ── */
  function majTheme() {
    var sombre = doc.getAttribute('data-theme') === 'dark';
    $$('[data-theme-toggle]').forEach(function (b) { b.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre'); });
    var m = $('meta[name="theme-color"]'); if (m) m.content = sombre ? '#1A1B1D' : '#FFFFFF';
  }
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      doc.setAttribute('data-theme', t);
      try { localStorage.setItem('cbw-theme', t); } catch (e) {}
      majTheme();
    });
  });
  majTheme();

  /* ── Presse-papiers ── */
  function copier(texte) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texte);
    return new Promise(function (ok, ko) {
      var t = document.createElement('textarea'); t.value = texte; t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : ko(); } catch (e) { ko(e); }
      document.body.removeChild(t);
    });
  }

  /* ── Lien de téléchargement : une seule source, la redirection /download de vercel.json ── */
  if (/^https?:$/.test(location.protocol))
    $$('[data-dl-url]').forEach(function (el) { el.textContent = location.origin + '/download'; });

  /* ── Guide « Premier lancement » (après Télécharger, ou via [data-guide]) ── */
  var guide = null;
  function creerGuide() {
    if (guide || typeof HTMLDialogElement !== 'function') return guide;
    guide = document.createElement('dialog');
    guide.className = 'guide';
    guide.setAttribute('aria-labelledby', 'guide-titre');
    guide.innerHTML =
      '<div class="guide-tete"><span class="label sec">macOS 15 et plus</span>' +
      '<button class="guide-x" type="button" aria-label="Fermer" data-fermer>×</button></div>' +
      '<h2 class="guide-titre" id="guide-titre">Premier lancement&nbsp;: 3 étapes<span class="o">.</span></h2>' +
      '<p class="guide-sous">macOS demande une confirmation, une seule fois. C\'est normal&nbsp;: l\'app n\'est pas encore notarisée par Apple.</p>' +
      '<ol class="guide-etapes">' +
        '<li style="--accent:var(--orange)"><div class="ill ill-glisse" aria-hidden="true"><span class="ill-app">CBW</span><span class="ill-fl">→</span><span class="ill-dossier"><i></i>Applications</span></div>' +
          '<span class="k">01</span><p>Glisse <b>CBW AI</b> dans Applications et ouvre-le.</p></li>' +
        '<li style="--accent:var(--bleu)"><div class="ill" aria-hidden="true"><div class="ill-alerte"><span class="ill-ico"></span><b>«&nbsp;CBW AI&nbsp;» non ouvert</b><span class="ill-gris"></span><span class="ill-gris court"></span>' +
          '<span class="ill-b non">Placer dans la corbeille</span><span class="ill-b oui">Terminé</span></div></div>' +
          '<span class="k">02</span><p>macOS affiche «&nbsp;Élément non ouvert&nbsp;»&nbsp;: clique <b>Terminé</b> (pas Corbeille).</p></li>' +
        '<li style="--accent:var(--vert)"><div class="ill" aria-hidden="true"><div class="ill-reglages"><div class="ill-cote"><span></span><span class="on">Confidentialité</span><span></span><span></span></div>' +
          '<div class="ill-panneau"><span class="ill-gris"></span><span class="ill-gris court"></span><small>«&nbsp;CBW AI&nbsp;» a été bloqué</small><span class="ill-b oui">Ouvrir quand même</span></div></div></div>' +
          '<span class="k">03</span><p>Réglages Système › Confidentialité et sécurité › tout en bas <b>Ouvrir quand même</b> › mot de passe › <b>Ouvrir</b>.</p></li>' +
      '</ol>' +
      '<p class="guide-14"><b>macOS 14&nbsp;:</b> clic droit sur CBW AI › Ouvrir › Ouvrir.</p>' +
      '<div class="guide-alt"><span class="label sec">Plus simple&nbsp;: sans avertissement</span>' +
        '<div class="cmd"><code id="cmd-guide">curl -fsSL https://cbw-ai-liard.vercel.app/install.sh | bash</code><button class="btn btn-secondaire btn-s btn-copier" type="button" data-copier="cmd-guide">Copier</button></div>' +
        '<p class="cmd-note">À coller dans Terminal. <a href="/install.sh">Lire le script</a></p></div>' +
      '<div class="guide-pied"><a class="lien" href="aide.html#installation">Le pas à pas complet</a><button class="btn btn-primaire btn-s" type="button" data-fermer>J\'ai compris</button></div>';
    document.body.appendChild(guide);
    $$('[data-fermer]', guide).forEach(function (b) { b.addEventListener('click', function () { guide.close(); }); });
    guide.addEventListener('click', function (e) { if (e.target === guide) guide.close(); });
    return guide;
  }
  function ouvrirGuide() {
    var g = creerGuide(); if (!g || g.open) return;
    try { g.showModal(); } catch (e) { return; }
    var b = $('.guide-pied .btn', g); if (b) b.focus({ preventScroll: true });
  }
  creerGuide();
  $$('[data-guide]').forEach(function (b) { b.addEventListener('click', ouvrirGuide); });

  /* ── Téléchargement : Mac seulement ── */
  var estMac = /Macintosh|Mac OS X/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1);
  $$('a.dl').forEach(function (a) {
    var t = $('.dl-txt', a), petit = a.classList.contains('btn-s');
    if (!estMac) {
      if (t) t.textContent = petit ? 'Lien Mac' : 'Disponible sur Mac · copier le lien';
      $('.fleche', a).textContent = '⧉';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        copier(location.origin + location.pathname).catch(function () {});
        if (t) { var o = t.textContent; t.textContent = 'Lien copié ✓'; setTimeout(function () { t.textContent = o; }, 2200); }
      });
      return;
    }
    a.addEventListener('click', function () {
      setTimeout(ouvrirGuide, 700);
      if (!t || petit) return;
      var o = t.textContent; t.textContent = 'Téléchargement lancé ✓';
      setTimeout(function () { t.textContent = o; }, 3000);
    });
  });

  /* ── Démo avant / après (héros) ── */
  var EX = [
    { fin: '.', seg: [{ o: 'Euh', c: '', k: 'Hésitation retirée' }, ' bonjour Claire, ', { o: 'alors', c: '', k: 'Hésitation retirée' }, ' je voulais savoir si ', { o: 'si', c: '', k: 'Répétition retirée' }, ' on peut décaler le rendez-vous à ', { o: 'jeudi, enfin non vendredi', c: 'vendredi', k: 'Reprise appliquée' }] },
    { fin: '.', seg: [{ o: 'Alors', c: '', k: 'Hésitation retirée' }, ' le devis c’est ', { o: 'euh', c: '', k: 'Hésitation retirée' }, ' ', { o: 'trois cents euros, non pardon,', c: '', k: 'Reprise appliquée' }, ' trois cent cinquante euros hors taxes, on part là-dessus ', { o: 'du coup', c: '', k: 'Tic de langage retiré' }] },
    { fin: ' ?', seg: ['est-ce que tu peux ', { o: 'euh', c: '', k: 'Hésitation retirée' }, ' ', { o: 'me me', c: 'me', k: 'Répétition retirée' }, ' créer un composant React ', { o: 'qui, enfin, qui', c: 'qui', k: 'Répétition retirée' }, ' affiche la liste des notes, triées par date'] }
  ];
  var dit = $('#dit'), ecrit = $('#ecrit'), indice = $('#indice'), etat = $('#etat'), etatTxt = $('#etat-txt');
  var cur = 0, fait = [];
  function propre(s) {
    s = s.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').replace(/^[\s,]+/, '').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function rendre() {
    var ex = EX[cur], out = '', nb = 0, total = 0;
    ex.seg.forEach(function (s, i) {
      if (typeof s === 'string') { out += s; return; }
      total++; if (fait[i]) { nb++; out += s.c; } else out += s.o;
    });
    var fini = nb === total;
    ecrit.textContent = propre(out) + (fini ? ex.fin : '');
    etat.setAttribute('data-s', fini ? 'fini' : nb ? 'traite' : 'attente');
    etatTxt.textContent = fini ? 'Collé · ' + total + ' corrections' : nb ? 'Nettoyage · ' + nb + ' / ' + total : 'En attente · 0 / ' + total;
    $('#tout').disabled = fini;
  }
  function construire() {
    var ex = EX[cur]; fait = [];
    dit.textContent = '';
    dit.appendChild(document.createTextNode('« '));
    ex.seg.forEach(function (s, i) {
      if (typeof s === 'string') { dit.appendChild(document.createTextNode(s)); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'defaut';
      b.setAttribute('aria-label', 'Nettoyer « ' + s.o + ' » : ' + s.k.toLowerCase());
      b.innerHTML = '<span class="orig"></span><span class="corr"></span>';
      b.firstChild.textContent = s.o; b.lastChild.textContent = s.c;
      b.addEventListener('click', function () { corriger(i, b); });
      dit.appendChild(b);
    });
    dit.appendChild(document.createTextNode(' »'));
    indice.textContent = 'Clique sur chaque passage surligné.';
    rendre();
  }
  function corriger(i, b) {
    if (fait[i]) return;
    var s = EX[cur].seg[i];
    fait[i] = true;
    b.classList.add('fait'); if (s.c) b.classList.add('remplace');
    b.setAttribute('aria-disabled', 'true');
    indice.innerHTML = '';
    var l = document.createElement('span'); l.className = 'label';
    l.innerHTML = '<span class="pastille ' + (s.k.indexOf('Reprise') === 0 ? 'p-v' : s.k.indexOf('Répétition') === 0 ? 'p-b' : 'p-o') + '"></span>';
    l.appendChild(document.createTextNode(s.k));
    indice.appendChild(l);
    rendre();
  }
  if (dit) {
    var ongl = $$('.onglets [role="tab"]');
    var choisir = function (n) {
      cur = n;
      ongl.forEach(function (t, j) { t.setAttribute('aria-selected', j === n); t.tabIndex = j === n ? 0 : -1; });
      construire();
    };
    ongl.forEach(function (t, n, all) {
      t.addEventListener('click', function () { choisir(n); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); var j = (n + d + all.length) % all.length; choisir(j); all[j].focus(); }
      });
    });
    $('#tout').addEventListener('click', function () {
      var btns = $$('.defaut', dit), k = 0;
      EX[cur].seg.forEach(function (s, i) {
        if (typeof s === 'string') return;
        var b = btns[k++]; if (fait[i]) return;
        setTimeout(function () { corriger(i, b); }, reduit ? 0 : 160 * k);
      });
    });
    $('#reset').addEventListener('click', construire);
    construire();
  }

  /* ── Chapitres épinglés : progression 0 → 1 pendant que la page reste à l'écran ── */
  function progression(el) {
    var r = el.getBoundingClientRect();
    var course = el.offsetHeight - (window.innerHeight - ENTETE);
    return course > 0 ? borne((ENTETE - r.top) / course, 0, 1) : 0;
  }
  var pins = $$('.pin');
  function epingle() { return mqPin.matches; }

  /* Dictée : écoute (orange) → nettoyage (bleu) → collé (vert) */
  var pil = $('#pilule'), corps = $('#mail-corps'), pDictee = $('#p-dictee');
  var TXT = 'Bonjour Claire, on peut décaler le rendez-vous à vendredi ?';
  var CURSEUR = '<span class="curseur" aria-hidden="true"></span>';
  var etapes = $$('#etapes > div');
  function phase(s, lbl, n) {
    if (pil.getAttribute('data-s') !== s) { pil.setAttribute('data-s', s); $('#pilule-txt').textContent = lbl; }
    etapes.forEach(function (e, j) { e.classList.toggle('on', j < n); });
  }
  function ecrireMail(nb) {
    corps.textContent = TXT.slice(0, nb);
    corps.insertAdjacentHTML('beforeend', CURSEUR);
  }
  var dernierNb = -1;
  function dicteeScroll(p) {
    if (p < .22) { phase('rec', 'Écoute…', 1); if (dernierNb) { ecrireMail(0); dernierNb = 0; } }
    else if (p < .42) { phase('ia', 'Nettoyage…', 2); if (dernierNb) { ecrireMail(0); dernierNb = 0; } }
    else {
      phase('ok', 'Collé', 3);
      var nb = Math.round(TXT.length * borne((p - .42) / .36, 0, 1));
      if (nb !== dernierNb) { ecrireMail(nb); dernierNb = nb; }
    }
  }
  // Hors épinglage (mobile) : boucle automatique quand la scène est visible
  var timer = null, boucle = false, visible = false;
  function cycle() {
    ecrireMail(0); phase('rec', 'Écoute…', 1);
    timer = setTimeout(function () {
      phase('ia', 'Nettoyage…', 2);
      timer = setTimeout(function () {
        phase('ok', 'Collé', 3);
        var i = 0;
        (function tape() {
          i += 3; ecrireMail(Math.min(i, TXT.length));
          timer = i < TXT.length ? setTimeout(tape, 22) : setTimeout(cycle, 3200);
        })();
      }, 1100);
    }, 2000);
  }
  function majBoucle() {
    var doit = pil && !reduit && !epingle() && visible;
    if (doit && !boucle) { boucle = true; cycle(); }
    else if (!doit && boucle) { boucle = false; clearTimeout(timer); ecrireMail(TXT.length); phase('ok', 'Collé', 3); }
  }
  if (pil && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; majBoucle(); }, { threshold: .3 }).observe(pil.parentNode);
  }

  /* Notes : segmenté Résumé / Qui / Fil */
  var seg = $('#seg'), tabs = [], pouce, selNotes = function () {};
  if (seg) {
    tabs = $$('[role="tab"]', seg); pouce = $('.pouce', seg);
    var place = function (n) { var t = tabs[n]; pouce.style.width = t.offsetWidth + 'px'; pouce.style.transform = 'translateX(' + t.offsetLeft + 'px)'; };
    selNotes = function (n) {
      tabs.forEach(function (t, j) {
        t.setAttribute('aria-selected', j === n); t.tabIndex = j === n ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = j !== n;
      });
      place(n);
    };
    tabs.forEach(function (t, n) {
      t.addEventListener('click', function () { selNotes(n); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); var j = (n + d + tabs.length) % tabs.length; selNotes(j); tabs[j].focus(); }
      });
    });
    place(0);
    window.addEventListener('resize', function () { place(Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }))); });
  }
  var etapeNotes = -1;
  function notesScroll(p) {
    var n = p < .36 ? 0 : p < .68 ? 1 : 2;
    if (n !== etapeNotes) { etapeNotes = n; selNotes(n); } // un clic garde la main jusqu'à l'étape suivante
  }

  /* Brainstorm : cases qui se remplissent, réponse cliquable, prompt */
  var pre = $('#prompt-txt'), puces = $$('#puces .puce'), caseFmt = $('#case-format');
  var format = 'À préciser.', cible = 'Claude Code', choixUtil = false, choixAuto = false;
  function prompt() {
    var h = function (t) { return '<span class="h"># ' + t + '</span> '; };
    pre.innerHTML = h('Rôle') + 'Dev senior, dans ' + cible + '.\n' + h('Contexte') + 'App de dictée, déjà en place.\n' +
      h('Tâche') + 'Exporter les notes en PDF.\n' + h('Format') + format + '\n' + h('Limite') + 'Ne pas toucher à la dictée.';
  }
  function repondre(p) {
    puces.forEach(function (q) { q.setAttribute('aria-pressed', q === p); });
    if (!p) {
      format = 'À préciser.'; caseFmt.setAttribute('data-st', 'vide');
      var v = $('p', caseFmt); v.textContent = 'à préciser'; v.classList.add('vide');
      $('#bs-score').textContent = '3 / 4 cases'; prompt(); return;
    }
    format = p.textContent + '.';
    caseFmt.setAttribute('data-st', 'ok');
    var para = $('p', caseFmt); para.textContent = p.textContent + '.'; para.classList.remove('vide');
    caseFmt.classList.remove('flash'); void caseFmt.offsetWidth; caseFmt.classList.add('flash');
    setTimeout(function () { caseFmt.classList.remove('flash'); }, 900);
    $('#bs-score').textContent = '4 / 4 cases';
    prompt();
  }
  if (pre) {
    puces.forEach(function (p) { p.addEventListener('click', function () { choixUtil = true; choixAuto = false; repondre(p); }); });
    $$('#cible button').forEach(function (b, n, all) {
      b.addEventListener('click', function () { all.forEach(function (q) { q.setAttribute('aria-pressed', q === b); }); cible = b.dataset.c; prompt(); });
    });
    $('#copier').addEventListener('click', function () {
      var b = this;
      copier(pre.textContent).catch(function () {});
      b.textContent = 'Copié ✓'; setTimeout(function () { b.textContent = 'Copier'; }, 1800);
    });
  }
  var casesBs = $$('#craft .case');
  function brainstormScroll(p) {
    casesBs.forEach(function (c, i) { c.classList.toggle('cache', p < .06 + i * .08); });
    if (choixUtil) return;
    if (p >= .55 && !choixAuto) { choixAuto = true; repondre(puces[0]); }
    else if (p < .55 && choixAuto) { choixAuto = false; repondre(null); }
  }

  /* Boucle de défilement (une seule, en rAF) */
  var enAttente = false;
  function majPins() {
    enAttente = false;
    var on = epingle();
    pins.forEach(function (el) {
      el.classList.toggle('actif', on);
      if (!on) return;
      var p = progression(el);
      el.style.setProperty('--p', p.toFixed(3));
      if (el.id === 'p-dictee' && pil) dicteeScroll(p);
      else if (el.id === 'p-notes' && seg) notesScroll(p);
      else if (el.id === 'p-brainstorm' && pre) brainstormScroll(p);
    });
    if (!on) casesBs.forEach(function (c) { c.classList.remove('cache'); });
    majBoucle();
  }
  function demander() { if (!enAttente) { enAttente = true; requestAnimationFrame(majPins); } }
  if (pins.length) {
    window.addEventListener('scroll', demander, { passive: true });
    window.addEventListener('resize', demander);
    if (mqPin.addEventListener) mqPin.addEventListener('change', demander);
    majPins();
  }

  /* ── Défilement doux (molette souris uniquement ; trackpad, clavier et mouvement réduit restent natifs) ── */
  var cibleY = 0, courantY = 0, anim = false;
  function maxY() { return doc.scrollHeight - window.innerHeight; }
  function pas() {
    courantY += (cibleY - courantY) * 0.1;
    if (Math.abs(cibleY - courantY) < 0.6) { courantY = cibleY; anim = false; }
    window.scrollTo(0, courantY);
    if (anim) requestAnimationFrame(pas);
  }
  function lancer(y) {
    if (!anim) { courantY = window.scrollY; anim = true; requestAnimationFrame(pas); }
    cibleY = borne(y, 0, maxY());
  }
  function stop() { anim = false; }
  function estTrackpad(e) {
    if (e.deltaMode !== 0) return false;
    if (e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0 && e.deltaX === 0) return false;
    return e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40;
  }
  function defilable(el, dy) {
    for (; el && el !== document.body && el !== doc; el = el.parentElement) {
      var st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
      }
    }
    return false;
  }
  if (!reduit) {
    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.defaultPrevented || estTrackpad(e) || defilable(e.target, e.deltaY)) { if (anim) stop(); return; }
      e.preventDefault();
      var d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      lancer((anim ? cibleY : window.scrollY) + d);
    }, { passive: false });
    ['keydown', 'mousedown', 'touchstart'].forEach(function (t) { window.addEventListener(t, stop, { passive: true }); });
  }
  // Ancres internes en défilement doux
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1), el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      var y = el.getBoundingClientRect().top + window.scrollY - 80;
      if (reduit) window.scrollTo(0, y); else lancer(y);
      if (history.pushState) history.pushState(null, '', '#' + id);
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
  });

  /* ── Bloc « Copier le prompt d'installation » (aide) ── */
  $$('[data-copier]').forEach(function (b) {
    var src = document.getElementById(b.getAttribute('data-copier'));
    if (!src) return;
    var lib = b.textContent;
    b.addEventListener('click', function () {
      copier(src.textContent).then(function () { b.textContent = 'Copié ✓'; b.setAttribute('data-ok', ''); },
        function () { b.textContent = 'Sélectionne le texte puis ⌘ C'; });
      setTimeout(function () { b.textContent = lib; b.removeAttribute('data-ok'); }, 2200);
    });
  });

  /* ── Révélations + compteurs ── */
  function compte(el) {
    var fin = +el.dataset.count; if (reduit || !fin) { el.textContent = fin; return; }
    var t0 = performance.now(), d = 700;
    (function f(t) {
      var p = Math.min(1, (t - t0) / d), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = Math.round(fin * e); if (p < 1) requestAnimationFrame(f);
    })(t0);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('vu');
        $$('[data-count]', e.target).forEach(compte);
        var ch = e.target.closest('.chapitre'); if (ch) ch.classList.add('vu');
        io.unobserve(e.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    $$('.rv').forEach(function (el) { io.observe(el); });
  } else { $$('.rv').forEach(function (el) { el.classList.add('vu'); }); }

  /* ── Aide : sommaire actif ── */
  var liens = $$('.toc a');
  if (liens.length && 'IntersectionObserver' in window) {
    var parId = {}; liens.forEach(function (a) { parId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        liens.forEach(function (a) { a.classList.remove('actif'); a.removeAttribute('aria-current'); });
        var a = parId[e.target.id]; if (a) { a.classList.add('actif'); a.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    $$('.doc section[id]').forEach(function (s) { spy.observe(s); });
  }
  $$('.toc-mobile a').forEach(function (a) { a.addEventListener('click', function () { a.closest('details').open = false; }); });
})();

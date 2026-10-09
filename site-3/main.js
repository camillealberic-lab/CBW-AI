/* CBW AI — site · histoire en 4 scènes. Vanilla, sans dépendance.
   Tout le contenu final est dans le HTML : ce script ne fait qu'animer (et s'efface en mouvement réduit). */
(function () {
  'use strict';
  var d = document, html = d.documentElement;
  var reduced = !html.classList.contains('motion');
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------- Thème ---------- */
  var tbtn = $('[data-theme-toggle]');
  function syncTheme() {
    var dark = html.getAttribute('data-theme') === 'dark';
    if (tbtn) tbtn.setAttribute('aria-label', dark ? 'Passer en thème clair' : 'Passer en thème sombre');
    var m = $('meta[name="theme-color"]'); if (m) m.content = dark ? '#1A1B1D' : '#FFFFFF';
  }
  if (tbtn) tbtn.addEventListener('click', function () {
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('cbw-theme', next); } catch (e) {}
    syncTheme();
  });
  syncTheme();

  /* ---------- Révélations ---------- */
  var io = 'IntersectionObserver' in window;
  if (io && !reduced) {
    var rv = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('[data-reveal]').forEach(function (el) { rv.observe(el); });
  } else {
    $$('[data-reveal]').forEach(function (el) { el.classList.add('in'); });
  }

  function onceVisible(el, cb, th) {
    if (!el) return;
    if (!io || reduced) return;
    var o = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { o.disconnect(); cb(); }
    }, { threshold: th || 0.35 });
    o.observe(el);
  }
  function visibility(el, cb) {
    if (!io) return;
    new IntersectionObserver(function (es) { cb(es[0].isIntersecting); }, { threshold: 0.15 }).observe(el);
  }

  /* ---------- Scène 1 : le titre s'écrit ---------- */
  var h1 = $('[data-type]');
  if (h1 && !reduced) {
    var chars = [];
    (function wrap(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = d.createDocumentFragment();
          n.textContent.split('').forEach(function (c) {
            var s = d.createElement('span'); s.className = 'ch'; s.textContent = c; frag.appendChild(s); chars.push(s);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) wrap(n);
      });
    })(h1);
    var caret = d.createElement('span'); caret.className = 'type-c'; caret.setAttribute('aria-hidden', 'true');
    h1.classList.add('typing');
    var k = 0;
    (function tick() {
      if (k < chars.length) {
        var c = chars[k++]; c.classList.add('on'); c.parentNode.insertBefore(caret, c.nextSibling);
        var ch = c.textContent;
        setTimeout(tick, ch === '.' ? 380 : ch === ' ' ? 70 : 42 + Math.random() * 40);
      } else {
        setTimeout(function () { caret.remove(); }, 2400);
      }
    })();
  }

  /* ---------- Scène 1 : les 5 barres parlent (algorithme de l'overlay) ---------- */
  var barsBox = $('[data-bars]');
  var caption = $('[data-caption]');
  var clock = $('[data-clock]');
  if (barsBox && !reduced) {
    var bars = $$('i', barsBox);
    var RATIOS = [240, 400, 560, 400, 240].map(function (h) { return h / 560; });
    var REST = RATIOS.map(function (r) { return r * 0.42; });
    var PEAK = RATIOS.map(function (r) { return 0.62 + 0.38 * r; });
    var SPEEDS = [5.1, 6.3, 4.4, 5.9, 6.6], PHASES = [0, 1.7, 3.1, 4.0, 5.2];
    var LINES = [
      { raw: [['euh', 1], ['bonjour'], ['Claire,'], ['alors', 1], ['je'], ['voulais'], ['savoir'], ['si'], ['si', 1], ['on'], ['peut'], ['décaler'], ['le'], ['rendez-vous'], ['à'], ['jeudi,', 1], ['enfin', 1], ['non', 1], ['vendredi']],
        clean: 'Bonjour Claire, je voulais savoir si on peut décaler le rendez-vous à vendredi.' },
      { raw: [['alors', 1], ['le'], ['devis'], ['c\'est'], ['euh', 1], ['trois', 1], ['cents', 1], ['non', 1], ['pardon', 1], ['trois'], ['cent'], ['cinquante'], ['euros'], ['hors'], ['taxes']],
        clean: 'Le devis est de trois cent cinquante euros hors taxes.' },
      { raw: [['tu'], ['peux'], ['m\'envoyer'], ['le', 1], ['le'], ['fichier'], ['euh', 1], ['avant'], ['midi'], ['s\'il'], ['te'], ['plaît']],
        clean: 'Est-ce que tu peux m\'envoyer le fichier avant midi, s\'il te plaît ?' }
    ];
    var level = 0, smooth = 0, raf = 0, t0 = 0, running = false, speakUntil = 0, sec = 0;
    var recLbl = $('.voice-top .rec');
    function frame(ts) {
      if (!t0) t0 = ts;
      var t = (ts - t0) / 1000;
      var speaking = ts < speakUntil;
      // enveloppe de parole : syllabes (≈ 6 Hz) modulées par des mots (≈ 1.6 Hz)
      var target = speaking ? Math.min(1, 0.25 + 0.75 * Math.abs(Math.sin(t * 6.1)) * (0.55 + 0.45 * Math.sin(t * 1.6 + 1))) : 0;
      var kk = target > smooth ? 0.45 : 0.12;
      smooth += (target - smooth) * kk;
      var lv = Math.pow(smooth, 0.6);
      for (var i = 0; i < 5; i++) {
        var jitter = 0.62 + 0.38 * Math.sin(t * SPEEDS[i] + PHASES[i]);
        var breath = 0.92 + 0.08 * Math.sin(t * 2.4);
        var v = Math.min(1, lv * jitter);
        bars[i].style.transform = 'scaleY(' + (REST[i] * breath + (PEAK[i] - REST[i]) * v).toFixed(3) + ')';
      }
      raf = running ? requestAnimationFrame(frame) : 0;
    }
    function setRec(on, txt) { if (recLbl) { recLbl.lastChild.textContent = txt; recLbl.firstChild.style.background = on; } }
    var lineIx = 0, scriptToken = 0;
    async function script() {
      var my = ++scriptToken;
      while (running && my === scriptToken) {
        var L = LINES[lineIx++ % LINES.length];
        caption.textContent = '';
        var spans = L.raw.map(function (w) {
          var s = d.createElement('span'); s.className = 'w'; s.textContent = w[0] + ' ';
          if (w[1]) s.dataset.f = '1';
          caption.appendChild(s); return s;
        });
        setRec('var(--orange)', 'Écoute'); sec = 0;
        for (var i = 0; i < spans.length; i++) {
          if (!running || my !== scriptToken) return;
          speakUntil = performance.now() + 420;
          spans[i].classList.add('on');
          clock.textContent = '00:0' + Math.min(9, Math.floor(i / 3));
          await sleep(260 + Math.random() * 120);
        }
        speakUntil = 0;
        setRec('var(--bleu)', 'Nettoyage');
        await sleep(300);
        spans.forEach(function (s) { if (s.dataset.f) s.classList.add('f'); });
        await sleep(1100);
        if (!running || my !== scriptToken) return;
        caption.textContent = L.clean;
        setRec('var(--vert)', 'Collé');
        await sleep(2600);
      }
    }
    visibility(barsBox, function (vis) {
      if (vis && !running) { running = true; t0 = 0; raf = requestAnimationFrame(frame); script(); }
      else if (!vis && running) { running = false; scriptToken++; }
    });
    d.addEventListener('visibilitychange', function () {
      if (d.hidden) { running = false; scriptToken++; }
      else if (!running) { running = true; t0 = 0; raf = requestAnimationFrame(frame); script(); }
    });
  }

  /* ---------- Scène 2 : dictée → texte collé ---------- */
  var demo = $('[data-demo]');
  if (demo) {
    var tabs = $$('[data-tab]', demo), apps = $$('[data-app]', demo);
    var titleEl = $('[data-app-title]', demo), said = $('[data-said]', demo);
    var pill = $('.pill', demo), pillT = $('[data-pill-t]', demo);
    var TITLES = ['Mail · Nouveau message', 'Slack · #devis-atelier', 'ChatGPT · Nouvelle conversation'];
    var RAW = [
      [['Euh', 1], ['bonjour Claire,'], ['alors', 1], ['je voulais savoir si'], ['si', 1], ['on peut décaler le rendez-vous à'], ['jeudi, enfin non', 1], ['vendredi']],
      [['Alors', 1], ['le devis'], ['c\'est euh trois cents euros, non pardon,', 1], ['trois cent cinquante euros hors taxes']],
      [['Est-ce que tu peux m\'écrire un mail de relance'], ['euh', 1], ['pour un client qui n\'a pas payé sa facture'], ['enfin', 1], ['depuis un mois']]
    ];
    var CLEAN = apps.map(function (a) { return $('[data-out]', a).textContent; });
    var cur = 0, tok = 0, autoplay = true, inView = false;
    function show(i) {
      cur = i;
      tabs.forEach(function (t, j) { t.setAttribute('aria-selected', String(j === i)); t.tabIndex = j === i ? 0 : -1; });
      apps.forEach(function (a, j) { a.classList.toggle('on', j === i); });
      titleEl.textContent = TITLES[i];
    }
    function setPill(s, txt) { pill.dataset.s = s; pillT.textContent = txt; pillT.classList.toggle('live', s === 'rec'); }
    function staticSaid(i) {
      said.innerHTML = '';
      RAW[i].forEach(function (seg) { var s = d.createElement('span'); s.textContent = seg[0] + ' '; if (seg[1]) s.className = 'cut'; said.appendChild(s); });
    }
    async function play(i) {
      var my = ++tok; show(i);
      var out = $('[data-out]', apps[i]);
      if (reduced) { staticSaid(i); out.textContent = CLEAN[i]; setPill('done', 'Collé'); return; }
      out.textContent = ''; said.innerHTML = ''; setPill('rec', 'Écoute…');
      var spans = [];
      for (var s = 0; s < RAW[i].length; s++) {
        var words = RAW[i][s][0].split(' ');
        var sp = d.createElement('span'); if (RAW[i][s][1]) sp.dataset.cut = '1';
        said.appendChild(sp); spans.push(sp);
        for (var w = 0; w < words.length; w++) {
          if (my !== tok) return;
          sp.textContent += words[w] + ' ';
          await sleep(150 + Math.random() * 90);
        }
      }
      await sleep(250); if (my !== tok) return;
      setPill('proc', 'Nettoyage');
      spans.forEach(function (x, n) { if (x.dataset.cut) setTimeout(function () { x.className = 'cut'; }, n * 60); });
      await sleep(1000); if (my !== tok) return;
      var txt = CLEAN[i];
      for (var c = 0; c <= txt.length; c += 3) { if (my !== tok) return; out.textContent = txt.slice(0, c); await sleep(14); }
      out.textContent = txt;
      out.classList.add('flash'); setTimeout(function () { out.classList.remove('flash'); }, 700);
      setPill('done', 'Collé');
      await sleep(3200);
      if (my === tok && autoplay && inView) play((i + 1) % apps.length);
    }
    tabs.forEach(function (t, j) {
      t.addEventListener('click', function () { autoplay = false; play(j); });
      t.addEventListener('keydown', function (e) {
        var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (k) { e.preventDefault(); var n = (j + k + tabs.length) % tabs.length; tabs[n].focus(); autoplay = false; play(n); }
      });
    });
    staticSaid(0);
    if (io && !reduced) visibility(demo, function (v) { var was = inView; inView = v; if (v && !was && autoplay) play(cur); });
  }

  /* ---------- Scène 3 : la note se construit ---------- */
  var note = $('[data-note]');
  if (note) {
    var lines = $$('[data-line]', note), st = $('[data-note-st]', note);
    onceVisible(note, async function () {
      note.dataset.s = 'proc'; st.textContent = 'Organisation…';
      for (var i = 0; i < lines.length; i++) { lines[i].classList.add('on'); await sleep(i < 4 ? 160 : 110); }
      await sleep(300);
      note.dataset.s = 'done'; st.textContent = 'Prête';
    }, 0.2);
  }

  /* ---------- Scène 4 : bulles en bas à droite, puis le master prompt ---------- */
  var brain = $('[data-brain]'), prompt = $('[data-prompt]');
  if (brain) {
    var bubs = $$('[data-bub]', brain);
    if (!reduced && io) {
      bubs.forEach(function (b) { b.classList.remove('ok'); $$('.chip', b).forEach(function (c) { c.dataset.was = c.classList.contains('sel') ? '1' : ''; c.classList.remove('sel'); }); });
      onceVisible(brain, async function () {
        for (var i = 0; i < bubs.length; i++) {
          bubs[i].classList.add('on'); await sleep(900);
          var pick = $$('.chip', bubs[i]).filter(function (c) { return c.dataset.was; })[0] || $$('.chip', bubs[i])[0];
          if (i < 2) { pick.classList.add('sel'); await sleep(350); bubs[i].classList.add('ok'); await sleep(500); }
        }
        await sleep(400);
        bubs[2].querySelector('.chip').classList.add('sel'); bubs[2].classList.add('ok');
        await sleep(600);
        prompt.classList.add('on');
      }, 0.3);
    } else if (prompt) prompt.classList.add('on');
  }
  var copyBtn = $('[data-copy]');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var txt = $$('.pr', prompt).map(function (r) { return '## ' + $('dt', r).textContent.replace(/^./, '') + '\n' + $('dd', r).textContent; }).join('\n\n');
    var done = function () { copyBtn.textContent = 'Copié ✓'; copyBtn.classList.add('ok'); setTimeout(function () { copyBtn.textContent = 'Copier le prompt'; copyBtn.classList.remove('ok'); }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
  });

  /* ---------- Progression de l'histoire + nav active ---------- */
  var scenes = $$('[data-scene]'), segs = $$('.story-bar i'), navLinks = $$('.nav a[href^="#"]');
  var ticking = false;
  function prog() {
    ticking = false;
    var vh = innerHeight;
    scenes.forEach(function (s, i) {
      var r = s.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (vh * 0.55 - r.top) / r.height));
      if (segs[i]) segs[i].style.setProperty('--p', p.toFixed(3));
    });
    var act = null;
    $$('main section[id]').forEach(function (s) { if (s.getBoundingClientRect().top < vh * 0.45) act = s.id; });
    navLinks.forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + act)); });
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(prog); } }, { passive: true });
  addEventListener('resize', prog);
  prog();

  /* ---------- Barre de téléchargement (mobile) ---------- */
  var dock = $('[data-dock]'), heroCta = $('[data-hero-cta]');
  if (dock && heroCta && io) {
    new IntersectionObserver(function (es) { dock.classList.toggle('on', !es[0].isIntersecting && es[0].boundingClientRect.top < 0); }).observe(heroCta);
  } else if (dock) dock.classList.add('on');

  /* ---------- Aide : sommaire actif ---------- */
  var toc = $$('.toc a[href^="#"]');
  if (toc.length && io) {
    var map = {};
    toc.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var secs = Object.keys(map).map(function (id) { return d.getElementById(id); }).filter(Boolean);
    function tocSync() {
      var cur = secs[0];
      secs.forEach(function (s) { if (s.getBoundingClientRect().top < 160) cur = s; });
      if (innerHeight + scrollY >= d.body.scrollHeight - 4) cur = secs[secs.length - 1];
      toc.forEach(function (a) { var on = a === map[cur.id]; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
    addEventListener('scroll', function () { requestAnimationFrame(tocSync); }, { passive: true });
    tocSync();
  }

  /* ---------- Téléchargement : retour visuel, puis page d'installation ; mobile = copier le lien ---------- */
  var mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  $$('[data-dl]').forEach(function (a) {
    if (mobile) {
      a.lastChild && (a.childNodes.forEach(function (n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Disponible sur Mac · copier le lien '; }));
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var url = location.origin + location.pathname.replace(/[^/]*$/, '');
        var ok = function () { a.classList.add('sent'); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, ok); else ok();
      });
      return;
    }
    a.addEventListener('click', function () {
      a.classList.add('sent');
      setTimeout(function () { location.href = 'aide.html#installation'; }, 1400);
    });
  });
})();

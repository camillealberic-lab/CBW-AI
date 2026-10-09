/* CBW AI site — minimal vanilla JS (demo, reveal, header, TOC). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const y = $('#y'); if (y) y.textContent = new Date().getFullYear();

  // Header rule on scroll
  const top = $('#top');
  const onScroll = () => top && top.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Reveal on scroll
  const rv = $$('.rv, .colorbars');
  if (reduce || !('IntersectionObserver' in window)) rv.forEach(e => e.classList.add('seen'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(e => io.observe(e));
  }

  // ---------- Product demo ----------
  const pill = $('#pill');
  if (pill) {
    const raw = $('#raw'), clean = $('#clean'), txt = $('#pillTxt'), note = $('#demoNote');
    const bars = $$('.bars i', pill), k1 = $('.k1'), k2 = $('.k2');
    const caps = $$('.demo-cap span');
    const tags = $$('.tag');
    const WORDS = ['euh', 'je', 'veux', 'trois', 'boutons', 'enfin', 'non', 'quatre'];
    const CUT = new Set([0, 3, 5, 6]);
    const BASE = [6, 9, 12, 9, 6];
    const showClean = () => { raw.classList.add('hide'); clean.classList.add('show', 'in'); };

    const setState = (s, label) => {
      pill.dataset.s = s; txt.textContent = label;
      caps.forEach(c => c.classList.toggle('on', c.dataset.c === s));
    };

    if (reduce) { setState('done', 'COLLÉ'); showClean(); tags.forEach(t => t.classList.add('in')); bars.forEach(b => b.style.removeProperty('--h')); }
    else demo();
    function demo() {

    let level = 0, target = 0, raf = 0, live = false, timers = [], running = false;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const loopBars = () => {
      level += (target - level) * (target > level ? .45 : .12);
      const t = performance.now() / 1000;
      bars.forEach((b, i) => {
        const j = .55 + .45 * Math.sin(t * (7 + i * 1.7) + i * 1.3);
        b.style.setProperty('--h', Math.round(BASE[i] + level * j * (26 - BASE[i])) + 'px');
      });
      if (live) raf = requestAnimationFrame(loopBars);
    };
    const flash = (k, ms) => { at(ms, () => k.classList.add('on')); at(ms + 160, () => k.classList.remove('on')); };

    const run = () => {
      timers.forEach(clearTimeout); timers = [];
      raw.className = 'raw'; raw.innerHTML = '';
      clean.classList.remove('show', 'in'); tags.forEach(t => t.classList.remove('in'));
      bars.forEach(b => b.style.removeProperty('--h'));
      setState('idle', 'PRÊT'); note.textContent = 'Appuie deux fois sur Control';
      const words = WORDS.map((w, i) => {
        const s = document.createElement('span'); s.className = 'w'; s.textContent = w;
        if (i) { const sp = document.createElement('span'); sp.className = 'w sp'; sp.textContent = ' '; raw.appendChild(sp); s.sp = sp; }
        raw.appendChild(s); return s;
      });
      flash(k1, 700); flash(k2, 950);
      at(1150, () => {
        setState('rec', 'ÉCOUTE'); note.textContent = 'Transcription locale · Whisper';
        live = true; cancelAnimationFrame(raf); loopBars();
      });
      let t = 1500;
      words.forEach((w, i) => {
        at(t, () => { w.classList.add('in'); if (w.sp) w.sp.classList.add('in'); target = .55 + Math.random() * .45; });
        at(t + 180, () => { target = .15 + Math.random() * .2; });
        t += i === 0 ? 520 : i === 4 ? 480 : 300;
      });
      t += 500;
      at(t, () => { target = 0; });
      flash(k1, t + 300);
      at(t + 450, () => { live = false; bars.forEach(b => b.style.removeProperty('--h')); setState('ai', 'MISE AU PROPRE'); note.textContent = 'Nettoyage IA'; });
      let c = t + 650;
      words.forEach((w, i) => { if (CUT.has(i)) { at(c, () => w.classList.add('cut')); c += 170; } });
      at(t + 820, () => tags[0] && tags[0].classList.add('in'));
      at(t + 1250, () => tags[1] && tags[1].classList.add('in'));
      at(c + 350, () => raw.classList.add('gone'));
      at(c + 700, () => { raw.classList.add('hide'); clean.classList.add('show'); requestAnimationFrame(() => requestAnimationFrame(() => clean.classList.add('in'))); setState('done', 'COLLÉ'); note.textContent = 'Collé dans Messages'; });
      at(c + 4200, run);
    };

    const fig = pill.closest('.demo');
    const vis = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !running) { running = true; run(); }
      else if (!e.isIntersecting && running) { running = false; live = false; timers.forEach(clearTimeout); timers = []; }
    }), { threshold: .25 });
    vis.observe(fig);
    }
  }

  // ---------- Download buttons ----------
  const ua = navigator.userAgent;
  const notMac = /iPhone|iPad|iPod|Android|Windows|CrOS|Linux(?!.*Mac)/i.test(ua) && !/Macintosh/i.test(ua);
  $$('.js-dl').forEach(a => {
    if (notMac && !a.closest('.nav')) {
      const url = a.href;
      a.removeAttribute('href'); a.setAttribute('role', 'button'); a.tabIndex = 0;
      a.innerHTML = 'Copier le lien pour ton Mac <span class="arr" aria-hidden="true">→</span>';
      const p = document.createElement('p'); p.className = 'notmac-msg';
      p.textContent = 'CBW AI est disponible sur Mac uniquement (Apple Silicon, macOS 14+).';
      (a.closest('.cta-row') || a.parentNode).after(p);
      const copy = () => {
        const done = () => { a.innerHTML = 'Lien copié ✓'; a.classList.add('ok'); };
        (navigator.clipboard ? navigator.clipboard.writeText(location.origin + '/') : Promise.reject()).then(done, () => { location.href = url; });
      };
      a.addEventListener('click', copy);
      a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); } });
      return;
    }
    if (a.classList.contains('btn-p')) a.addEventListener('click', () => {
      const html = a.innerHTML;
      a.innerHTML = 'Téléchargement lancé ✓'; a.classList.add('ok');
      setTimeout(() => { a.innerHTML = html; a.classList.remove('ok'); const i = document.getElementById('installer'); if (i) i.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }, 1800);
    });
  });

  initToc();

  // ---------- Help page TOC scroll-spy ----------
  function initToc() {
    const links = $$('.toc a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const secs = [...map.keys()].map(id => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(a => { a.classList.remove('cur'); a.removeAttribute('aria-current'); });
        const a = map.get(e.target.id); if (a) { a.classList.add('cur'); a.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    secs.forEach(s => io.observe(s));
  }
})();

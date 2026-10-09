/* CBW AI — Accueil : tableau de bord (graphiques SVG faits main).
   Vanilla JS, sans dépendance, compatible CSP (pas d'eval, pas de gestionnaires inline).
   API : window.CBWCharts.renderHome(container, stats)
   stats = { words, dictations, wpm, streakDays, timeSavedMin,
             daily:[{date:'YYYY-MM-DD', words, dictations, avgMs, wpm?}],
             byProvider:{ groq, gemini, mistral, cloudflare, zai, ollama, openrouter, passthrough, … } }
   Les couleurs sont lues sur la page (getComputedStyle, jetons de design/cbw/tokens.css),
   donc clair et sombre fonctionnent ; on redessine quand le thème change. */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var LOCALE = 'fr-FR';
  var STYLE_ID = 'cbwc-style';

  /* ---------- utilitaires ---------- */
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function h(tag, attrs, parent, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function s(tag, attrs, parent, text) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }

  var fmtInt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
  var fmt1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var fmtDay = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
  var fmtLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  var fmtWd = new Intl.DateTimeFormat(LOCALE, { weekday: 'narrow' });

  function parseDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN);
  }
  function plural(n, one, many) { return Math.abs(n) >= 2 ? many : one; }

  /* ---------- couleurs (lues sur la page) ---------- */
  function parseColor(c) {
    c = String(c || '').trim();
    var m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16); });
    if ((m = /^#([0-9a-f]{6})/i.exec(c))) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
    if ((m = /rgba?\(([^)]+)\)/.exec(c))) return m[1].split(/[ ,/]+/).slice(0, 3).map(Number);
    return null;
  }
  function mix(a, b, t) {
    var A = parseColor(a), B = parseColor(b);
    if (!A || !B) return a;
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
  }
  function readTheme(node) {
    var cs = getComputedStyle(node);
    function v(name, fb) { var x = cs.getPropertyValue(name).trim(); return x || fb; }
    var t = {
      fond: v('--fond', '#FFFFFF'),
      surface: v('--surface', '#FFFFFF'),
      texte: v('--texte', '#1C1C1E'),
      texteSec: v('--texte-sec', '#4A4A4A'),
      trait: v('--trait', '#1C1C1E'),
      fil: v('--fil', '#DDDDDD'),
      orange: v('--orange', '#FF5A1F'),
      bleu: v('--bleu', '#2B3BFF'),
      vert: v('--vert', '#1FD26A'),
      police: v('--police', "'Archivo',system-ui,sans-serif"),
      mono: v('--mono', "'JetBrains Mono',ui-monospace,Menlo,monospace")
    };
    t.grille = mix(t.fil, t.fond, 0.35);
    t.gris1 = mix(t.texte, t.fond, 0.45);
    t.gris2 = mix(t.texte, t.fond, 0.68);
    t.gris3 = mix(t.texte, t.fond, 0.84);
    return t;
  }

  /* ---------- échelles ---------- */
  function niceStep(raw) {
    if (raw <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function niceTicks(max, count) {
    if (!(max > 0)) max = 1;
    var step = niceStep(max / (count || 4));
    var top = Math.ceil(max / step) * step;
    var out = [];
    for (var v = 0; v <= top + step / 2; v += step) out.push(+v.toFixed(6));
    return { top: top, ticks: out, step: step };
  }

  /* Courbe monotone (Fritsch–Carlson) : ne dépasse jamais les données. */
  function monotonePath(pts) {
    var n = pts.length;
    if (!n) return '';
    if (n === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
    var m = [], t = [], i;
    for (i = 0; i < n - 1; i++) {
      var dx = pts[i + 1][0] - pts[i][0];
      m.push(dx ? (pts[i + 1][1] - pts[i][1]) / dx : 0);
    }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], q = a * a + b * b;
      if (q > 9) { var tau = 3 / Math.sqrt(q); t[i] = tau * a * m[i]; t[i + 1] = tau * b * m[i]; }
    }
    var d = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2);
    for (i = 0; i < n - 1; i++) {
      var x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1], h3 = (x1 - x0) / 3;
      d += 'C' + (x0 + h3).toFixed(2) + ',' + (y0 + t[i] * h3).toFixed(2) + ' ' +
        (x1 - h3).toFixed(2) + ',' + (y1 - t[i + 1] * h3).toFixed(2) + ' ' + x1.toFixed(2) + ',' + y1.toFixed(2);
    }
    return d;
  }

  /* ---------- animation ---------- */
  function easeOutExpo(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
  function ticker(node, to, format, animate) {
    if (node.__raf) cancelAnimationFrame(node.__raf);
    if (!animate) { node.textContent = format(to); return; }
    var t0 = null, dur = 900;
    function frame(ts) {
      if (t0 == null) t0 = ts;
      var p = clamp((ts - t0) / dur, 0, 1);
      node.textContent = format(to * easeOutExpo(p));
      if (p < 1) node.__raf = requestAnimationFrame(frame);
    }
    node.textContent = format(0);
    node.__raf = requestAnimationFrame(frame);
  }
  function drawIn(path, ms, delay) {
    if (!path.animate || typeof path.getTotalLength !== 'function') return;
    var len = path.getTotalLength();
    if (!len) return;
    path.style.strokeDasharray = len + ' ' + len;
    var a = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: ms, delay: delay || 0, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    a.onfinish = function () { path.style.strokeDasharray = ''; };
  }
  function fadeIn(node, ms, delay) {
    if (node.animate) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, delay: delay || 0, easing: 'ease-out', fill: 'backwards' });
  }

  /* ---------- styles (injectés une fois) ---------- */
  var CSS = [
    '#stats.kpis{display:none!important}',
    '.cbwc-soon{padding-top:8px;text-transform:none;letter-spacing:0;font-size:13px}',
    '.cbwc{--g:16px;font-family:var(--police,system-ui);color:var(--texte,#111);display:grid;gap:var(--g);min-width:0}',
    '.cbwc *{box-sizing:border-box}',
    '.cbwc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:2px solid var(--trait,#111);border-bottom:1px solid var(--fil,#ddd)}',
    '.cbwc-kpi{padding:14px 18px 12px;border-left:1px solid var(--fil,#ddd);min-width:0;display:flex;flex-direction:column;gap:8px}',
    '.cbwc-kpi:first-child{border-left:0;padding-left:0}',
    '.cbwc-lab{font-family:var(--mono,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;line-height:1.3;color:var(--texte-sec,#4a4a4a);display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cbwc-lab i{flex:none;width:10px;height:10px;display:inline-block}',
    '.cbwc-big{display:flex;align-items:baseline;gap:6px;min-width:0}',
    '.cbwc-n{font-weight:900;font-stretch:70%;letter-spacing:-.055em;line-height:.82;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.cbwc-u{font-family:var(--mono,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#4a4a4a);white-space:nowrap}',
    '.cbwc-spark{display:block;width:100%;height:34px;overflow:visible}',
    '.cbwc-cap{font-family:var(--mono,monospace);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#4a4a4a);line-height:1}',
    '.cbwc-panel{position:relative;border-top:2px solid var(--trait,#111);padding-top:14px;min-width:0}',
    '.cbwc-panel:focus-visible{outline:3px solid var(--focus,#2B3BFF);outline-offset:2px}',
    '.cbwc-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap}',
    '.cbwc-h{margin:0;font-family:var(--mono,monospace);font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;line-height:1}',
    '.cbwc-meta{font-family:var(--mono,monospace);font-size:12px;color:var(--texte-sec,#4a4a4a);font-variant-numeric:tabular-nums}',
    '.cbwc-meta b{color:var(--texte,#111);font-weight:700}',
    '.cbwc-svg{display:block;width:100%;overflow:visible;touch-action:none}',
    '.cbwc-row{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:32px}',
    '.cbwc-tip{position:absolute;pointer-events:none;z-index:2;background:var(--surface,#fff);color:var(--texte,#111);border:2px solid var(--trait,#111);padding:8px 10px;font-family:var(--mono,monospace);font-size:12px;line-height:1.5;white-space:nowrap;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .15s}',
    '.cbwc-tip.on{opacity:1}',
    '.cbwc-tip b{font-family:var(--police,system-ui);font-size:13px;font-weight:800;display:block;margin-bottom:2px;text-transform:none}',
    '.cbwc-tip span{color:var(--texte-sec,#4a4a4a)}',
    '.cbwc-stack{display:flex;gap:2px;height:28px;margin:4px 0 14px}',
    '.cbwc-stack i{display:block;height:100%;min-width:3px;transform-origin:left}',
    '.cbwc-leg{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px}',
    '.cbwc-leg li{display:grid;grid-template-columns:10px 1fr auto auto;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--fil,#ddd);font-size:13px;font-weight:700;min-width:0}',
    '.cbwc-leg li i{width:10px;height:10px;display:block}',
    '.cbwc-leg li span{font-family:var(--mono,monospace);font-size:12px;font-weight:500;color:var(--texte-sec,#4a4a4a);font-variant-numeric:tabular-nums;text-align:right}',
    '.cbwc-leg li em{font-style:normal;font-family:var(--mono,monospace);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;min-width:4ch;text-align:right}',
    '.cbwc-total{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}',
    '.cbwc-total .cbwc-n{font-size:44px}',
    '.cbwc-empty{position:relative;border-top:2px solid var(--trait,#111);padding-top:14px}',
    '.cbwc-empty p{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);margin:0;padding:14px 20px;background:var(--fond,#fff);border:2px solid var(--trait,#111);font-size:17px;font-weight:800;letter-spacing:-.01em;text-align:center;max-width:calc(100% - 32px)}',
    '.cbwc-empty p small{display:block;margin-top:6px;font-family:var(--mono,monospace);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--texte-sec,#4a4a4a)}',
    '.cbwc.narrow .cbwc-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.cbwc.narrow .cbwc-kpi:nth-child(3){border-left:0;padding-left:0}',
    '.cbwc.narrow .cbwc-kpi:nth-child(n+3){border-top:1px solid var(--fil,#ddd)}',
    '.cbwc.narrow .cbwc-row{grid-template-columns:minmax(0,1fr);gap:var(--g)}',
    '.cbwc.narrow .cbwc-leg{grid-template-columns:minmax(0,1fr)}',
    '@media (prefers-reduced-motion:reduce){.cbwc-tip{transition:none}}'
  ].join('\n');
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- données ---------- */
  var PROVIDERS = [
    { keys: ['groq'], label: 'Groq', color: 'texte' },
    { keys: ['gemini', 'google'], label: 'Gemini', color: 'bleu' },
    { keys: ['mistral'], label: 'Mistral', color: 'orange' },
    { keys: ['cloudflare', 'workersai', 'workers-ai'], label: 'Cloudflare', color: 'vert' },
    { keys: ['zai', 'z.ai', 'z-ai', 'glm'], label: 'Z.ai', color: 'gris1' },
    { keys: ['ollama', 'local'], label: 'Local', color: 'gris2' },
    { keys: ['openrouter'], label: 'OpenRouter', color: 'texteSec' },
    { keys: ['passthrough', 'raw', 'none', 'brut'], label: 'Texte brut', color: 'gris3' }
  ];
  function providerRows(by) {
    var rows = [], seen = {};
    by = by || {};
    PROVIDERS.forEach(function (p, idx) {
      var n = 0;
      p.keys.forEach(function (k) { if (by[k] != null) { n += num(by[k]); seen[k] = 1; } });
      if (n > 0) rows.push({ label: p.label, n: n, color: p.color, order: idx });
    });
    Object.keys(by).forEach(function (k) {
      if (seen[k] || !(num(by[k]) > 0)) return;
      rows.push({ label: k.charAt(0).toUpperCase() + k.slice(1), n: num(by[k]), color: 'gris2', order: 99 });
    });
    rows.sort(function (a, b) { return b.n - a.n || a.order - b.order; });
    return rows;
  }
  function normDaily(daily) {
    return (Array.isArray(daily) ? daily : []).map(function (d) {
      var dt = parseDate(d && d.date);
      return {
        date: dt, iso: d && d.date,
        words: num(d && d.words), dictations: num(d && d.dictations),
        avgMs: num(d && d.avgMs), wpm: d && d.wpm != null ? num(d.wpm) : null
      };
    }).filter(function (d) { return !isNaN(d.date); })
      .sort(function (a, b) { return a.date - b.date; });
  }
  function isEmpty(st, daily) {
    if (num(st.words) || num(st.dictations)) return false;
    return !daily.some(function (d) { return d.words || d.dictations; });
  }

  /* ---------- tooltip ---------- */
  function makeTip(panel) {
    var tip = h('div', { class: 'cbwc-tip', 'aria-hidden': 'true' }, panel);
    return {
      show: function (html, x, y) {
        tip.textContent = '';
        html.forEach(function (row, i) {
          if (i === 0) h('b', null, tip, row);
          else { var line = h('div', null, tip); h('span', null, line, row[0] + ' '); line.appendChild(document.createTextNode(row[1])); }
        });
        tip.classList.add('on');
        var pw = panel.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = x + 14;
        if (left + tw > pw) left = x - tw - 14;
        tip.style.left = clamp(left, 0, Math.max(0, pw - tw)) + 'px';
        tip.style.top = Math.max(0, y - th - 10) + 'px';
      },
      hide: function () { tip.classList.remove('on'); }
    };
  }

  /* ---------- 1. KPI ---------- */
  function sparkLine(svg, values, w, hgt, th, accent) {
    var max = Math.max.apply(null, values.concat([1])), min = 0;
    var n = values.length, pad = 3;
    var pts = values.map(function (v, i) {
      return [n > 1 ? (i / (n - 1)) * (w - pad * 2) + pad : w / 2, hgt - pad - ((v - min) / (max - min || 1)) * (hgt - pad * 2)];
    });
    s('line', { x1: 0, x2: w, y1: hgt - 0.5, y2: hgt - 0.5, stroke: th.fil, 'stroke-width': 1 }, svg);
    var p = s('path', { d: monotonePath(pts), fill: 'none', stroke: th.texte, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'square' }, svg);
    var last = pts[pts.length - 1];
    if (last) s('rect', { x: last[0] - 3, y: last[1] - 3, width: 6, height: 6, fill: accent }, svg);
    return p;
  }
  function sparkBlocks(svg, active, w, hgt, th, accent) {
    var n = active.length, gap = 3, bw = (w - gap * (n - 1)) / n, size = Math.min(bw, hgt - 6);
    // dernière série consécutive en accent
    var run = 0;
    for (var k = n - 1; k >= 0 && active[k]; k--) run++;
    var nodes = [];
    active.forEach(function (on, i) {
      var inRun = i >= n - run;
      nodes.push(s('rect', {
        x: i * (bw + gap), y: hgt - size, width: bw, height: size,
        fill: on ? (inRun ? accent : th.texte) : 'none',
        stroke: on ? 'none' : th.fil, 'stroke-width': on ? null : 1
      }, svg));
    });
    return nodes;
  }

  function renderKpis(root, st, daily, th, animate, width) {
    var wrap = h('div', { class: 'cbwc-kpis' }, root);
    var last14 = daily.slice(-14);
    while (last14.length < 14) last14.unshift({ words: 0, dictations: 0, avgMs: 0, wpm: null });
    var mins = num(st.timeSavedMin);
    var useH = mins >= 60;
    var streak = Math.round(num(st.streakDays));
    var wpm = Math.round(num(st.wpm));
    // cumul estimé du temps gagné sur 14 j (proportionnel aux mots)
    var totWords = daily.reduce(function (a, d) { return a + d.words; }, 0) || 1;
    var acc = 0, cumul = last14.map(function (d) { acc += d.words; return acc; });
    var hasWpm = last14.some(function (d) { return d.wpm != null; });
    var speed = last14.map(function (d) {
      if (hasWpm) return d.wpm || 0;
      return d.dictations ? d.words / d.dictations : 0;
    });

    var tiles = [
      { lab: 'Mots dictés', pas: th.texte, val: num(st.words), unit: '',
        fmt: function (v) { return fmtInt.format(Math.round(v)); },
        aria: fmtInt.format(num(st.words)) + ' mots dictés',
        spark: { kind: 'line', v: last14.map(function (d) { return d.words; }) }, cap: '14 j · mots / jour' },
      { lab: 'Temps gagné', pas: th.vert, val: useH ? r1(mins / 60) : Math.round(mins), unit: useH ? 'h' : 'min',
        fmt: useH ? function (v) { return fmt1.format(v); } : function (v) { return fmtInt.format(Math.round(v)); },
        aria: (useH ? fmt1.format(r1(mins / 60)) + ' heures' : fmtInt.format(Math.round(mins)) + ' minutes') + ' gagnées',
        spark: { kind: 'line', v: cumul.map(function (c) { return c / totWords; }) }, cap: '14 j · cumul' },
      { lab: 'Série en cours', pas: th.orange, val: streak, unit: plural(streak, 'jour', 'jours'),
        fmt: function (v) { return fmtInt.format(Math.round(v)); },
        aria: 'Série de ' + streak + ' ' + plural(streak, 'jour', 'jours'),
        spark: { kind: 'blocks', v: last14.map(function (d) { return d.dictations > 0; }) }, cap: '14 j · jours actifs' },
      { lab: 'Vitesse', pas: th.bleu, val: wpm, unit: 'mots/min',
        fmt: function (v) { return fmtInt.format(Math.round(v)); },
        aria: wpm + ' mots par minute',
        spark: { kind: 'line', v: speed }, cap: hasWpm ? '14 j · mots / min' : '14 j · mots / dictée' }
    ];

    var cols = width < 640 ? 2 : 4;
    var tileW = (width - (cols === 4 ? 18 * 3 + 18 * 3 : 18)) / cols;
    var size = Math.round(clamp(tileW * 0.24, 40, 76));

    tiles.forEach(function (t) {
      var tile = h('div', { class: 'cbwc-kpi', role: 'group', 'aria-label': t.lab + ' : ' + t.aria }, wrap);
      var lab = h('div', { class: 'cbwc-lab', 'aria-hidden': 'true' }, tile);
      var pas = h('i', null, lab); pas.style.background = t.pas;
      lab.appendChild(document.createTextNode(t.lab));
      var big = h('div', { class: 'cbwc-big', 'aria-hidden': 'true' }, tile);
      var n = h('span', { class: 'cbwc-n' }, big);
      n.style.fontSize = size + 'px';
      if (t.unit) h('span', { class: 'cbwc-u' }, big, t.unit);
      ticker(n, t.val, t.fmt, animate);
      // Accueil épuré : chiffres seuls, pas de mini-courbes (retour utilisateur « trop de courbes »).
      h('div', { class: 'cbwc-cap', 'aria-hidden': 'true' }, tile, t.cap);
    });
  }

  /* ---------- panneau générique ---------- */
  function panel(root, title, meta, ariaHint) {
    var p = h('section', { class: 'cbwc-panel' }, root);
    var head = h('div', { class: 'cbwc-head' }, p);
    h('h3', { class: 'cbwc-h' }, head, title);
    var m = h('div', { class: 'cbwc-meta' }, head);
    if (meta) meta(m);
    return p;
  }
  function axisText(svg, th, x, y, str, anchor) {
    return s('text', {
      x: x, y: y, 'text-anchor': anchor || 'start', fill: th.texteSec,
      'font-size': 11, 'font-family': th.mono, style: 'font-variant-numeric:tabular-nums'
    }, svg, str);
  }

  /* ---------- 2. Aire « Mots dictés · 30 jours » ---------- */
  function renderArea(root, daily, th, animate, width, uid) {
    var d30 = daily.slice(-30);
    var total = d30.reduce(function (a, d) { return a + d.words; }, 0);
    var best = d30.reduce(function (a, d) { return d.words > a.words ? d : a; }, d30[0] || { words: 0 });
    var p = panel(root, 'Mots dictés · 30 jours', function (m) {
      h('b', null, m, fmtInt.format(total)); m.appendChild(document.createTextNode(' mots · moy. ' + fmtInt.format(Math.round(total / (d30.length || 1))) + ' / jour'));
    });
    p.setAttribute('tabindex', '0');
    var W = Math.max(280, Math.round(width)), H = Math.round(clamp(W * 0.25, 220, 320));
    var ml = 46, mr = 12, mt = 12, mb = 28, iw = W - ml - mr, ih = H - mt - mb;
    var n = d30.length;
    var max = Math.max.apply(null, d30.map(function (d) { return d.words; }).concat([1]));
    var ax = niceTicks(max, 4);
    function X(i) { return ml + (n > 1 ? (i / (n - 1)) * iw : iw / 2); }
    function Y(v) { return mt + ih - (v / ax.top) * ih; }
    var last = d30[n - 1];
    var svg = s('svg', {
      class: 'cbwc-svg', viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img',
      'aria-label': 'Mots dictés sur ' + n + ' jours : ' + fmtInt.format(total) + ' au total, maximum ' +
        fmtInt.format(best.words) + ' le ' + (best.date ? fmtDay.format(best.date) : '') +
        (last ? ', ' + fmtInt.format(last.words) + ' le dernier jour.' : '.') + ' Flèches gauche et droite pour parcourir.'
    }, p);
    p.setAttribute('aria-label', svg.getAttribute('aria-label'));
    var defs = s('defs', null, svg);
    var gid = 'cbwc-grad-' + uid;
    var g = s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    s('stop', { offset: '0%', 'stop-color': th.texte, 'stop-opacity': 0.16 }, g);
    s('stop', { offset: '100%', 'stop-color': th.texte, 'stop-opacity': 0 }, g);

    ax.ticks.forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      s('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: v === 0 ? th.trait : th.grille, 'stroke-width': v === 0 ? 1 : 1 }, svg);
      axisText(svg, th, ml - 10, y + 4, fmtInt.format(v), 'end');
    });
    var every = n > 20 ? 7 : n > 10 ? 3 : 1;
    for (var i = n - 1; i >= 0; i -= every) {
      var anchor = i === n - 1 ? 'end' : 'middle';
      if (i < every / 2 && i !== n - 1) anchor = 'start';
      axisText(svg, th, X(i), H - 8, fmtDay.format(d30[i].date), anchor);
      s('line', { x1: X(i), x2: X(i), y1: mt + ih, y2: mt + ih + 4, stroke: th.trait, 'stroke-width': 1 }, svg);
    }

    var pts = d30.map(function (d, i) { return [X(i), Y(d.words)]; });
    var line = monotonePath(pts);
    if (n) {
      var area = s('path', { d: line + 'L' + X(n - 1) + ',' + (mt + ih) + 'L' + X(0) + ',' + (mt + ih) + 'Z', fill: 'url(#' + gid + ')' }, svg);
      var stroke = s('path', { d: line, fill: 'none', stroke: th.texte, 'stroke-width': 2.25, 'stroke-linejoin': 'round' }, svg);
      var lp = pts[n - 1];
      var lastG = s('g', null, svg);
      s('line', { x1: lp[0], x2: lp[0], y1: lp[1], y2: mt + ih, stroke: th.texte, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, lastG);
      s('rect', { x: lp[0] - 6, y: lp[1] - 6, width: 12, height: 12, fill: th.orange, stroke: th.fond, 'stroke-width': 2 }, lastG);
      if (animate) { drawIn(stroke, 800); fadeIn(area, 600, 300); fadeIn(lastG, 250, 750); }
    }

    // survol : réticule + info-bulle
    var cross = s('g', { opacity: 0, 'pointer-events': 'none' }, svg);
    var cl = s('line', { y1: mt, y2: mt + ih, stroke: th.texte, 'stroke-width': 1 }, cross);
    var cd = s('rect', { width: 10, height: 10, fill: th.fond, stroke: th.texte, 'stroke-width': 2 }, cross);
    var hit = s('rect', { x: ml, y: mt, width: iw, height: ih + mb, fill: 'transparent' }, svg);
    var tip = makeTip(p);
    var cur = -1;
    function show(i) {
      if (!n) return;
      cur = clamp(i, 0, n - 1);
      var d = d30[cur], x = X(cur), y = Y(d.words);
      cl.setAttribute('x1', x); cl.setAttribute('x2', x);
      cd.setAttribute('x', x - 5); cd.setAttribute('y', y - 5);
      cross.setAttribute('opacity', 1);
      var o = origin(svg, p, W);
      tip.show([cap(fmtLong.format(d.date)), ['mots', fmtInt.format(d.words)], ['dictées', fmtInt.format(d.dictations)]],
        o.x + x * o.k, o.y + y * o.k);
    }
    function hide() { cross.setAttribute('opacity', 0); tip.hide(); cur = -1; }
    hit.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
      show(Math.round(((x - ml) / iw) * (n - 1)));
    });
    hit.addEventListener('pointerleave', hide);
    p.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(cur < 0 ? n - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Escape') hide();
    });
    p.addEventListener('blur', hide);
  }
  function origin(svg, panelEl, W) {
    var r = svg.getBoundingClientRect(), pr = panelEl.getBoundingClientRect();
    return { x: r.left - pr.left, y: r.top - pr.top, k: r.width / W || 1 };
  }
  function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  /* ---------- 3a. Barres « Dictées par jour » ---------- */
  function renderBars(root, daily, th, animate, width) {
    var d14 = daily.slice(-14);
    var total = d14.reduce(function (a, d) { return a + d.dictations; }, 0);
    var p = panel(root, 'Dictées par jour · 14 jours', function (m) {
      h('b', null, m, fmtInt.format(total)); m.appendChild(document.createTextNode(' ' + plural(total, 'dictée', 'dictées')));
    });
    var W = Math.max(240, Math.round(width)), H = 230;
    var ml = 34, mr = 4, mt = 18, mb = 34, iw = W - ml - mr, ih = H - mt - mb;
    var n = d14.length || 1;
    var max = Math.max.apply(null, d14.map(function (d) { return d.dictations; }).concat([1]));
    var ax = niceTicks(max, 4);
    var slot = iw / n, bw = Math.max(4, Math.min(44, slot * 0.62));
    function Y(v) { return mt + ih - (v / ax.top) * ih; }
    var best = d14.reduce(function (a, d) { return d.dictations > a.dictations ? d : a; }, d14[0] || { dictations: 0 });
    var svg = s('svg', {
      class: 'cbwc-svg', viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img',
      'aria-label': 'Dictées par jour sur 14 jours : ' + total + ' au total, maximum ' + best.dictations +
        (best.date ? ' le ' + fmtDay.format(best.date) : '') + '.'
    }, p);
    ax.ticks.forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      s('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: v === 0 ? th.trait : th.grille, 'stroke-width': 1 }, svg);
      axisText(svg, th, ml - 8, y + 4, fmtInt.format(v), 'end');
    });
    var tip = makeTip(p);
    var showVals = slot >= 26;
    d14.forEach(function (d, i) {
      var cx = ml + slot * i + slot / 2, y = Y(d.dictations), isLast = i === d14.length - 1;
      var hgt = Math.max(0, mt + ih - y);
      var bar = s('rect', { x: cx - bw / 2, y: y, width: bw, height: hgt, fill: isLast ? th.orange : th.texte }, svg);
      if (animate && bar.animate && hgt > 0) {
        bar.style.transformBox = 'fill-box'; bar.style.transformOrigin = '50% 100%';
        bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
          { duration: 600, delay: i * 35, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'backwards' });
      }
      if (showVals && d.dictations > 0) {
        var t = axisText(svg, th, cx, y - 6, fmtInt.format(d.dictations), 'middle');
        t.setAttribute('fill', th.texte); t.setAttribute('font-weight', 700);
        if (animate) fadeIn(t, 200, 500 + i * 35);
      }
      var wd = axisText(svg, th, cx, H - 19, fmtWd.format(d.date).toUpperCase(), 'middle');
      var dn = axisText(svg, th, cx, H - 5, String(d.date.getDate()), 'middle');
      if (isLast) { wd.setAttribute('fill', th.texte); dn.setAttribute('fill', th.texte); dn.setAttribute('font-weight', 700); }
      var hitR = s('rect', { x: cx - slot / 2, y: mt, width: slot, height: ih, fill: 'transparent' }, svg);
      hitR.addEventListener('pointerenter', function () {
        bar.setAttribute('fill', th.bleu);
        var o = origin(svg, p, W);
        tip.show([cap(fmtLong.format(d.date)), ['dictées', fmtInt.format(d.dictations)], ['mots', fmtInt.format(d.words)]],
          o.x + cx * o.k, o.y + y * o.k);
      });
      hitR.addEventListener('pointerleave', function () { bar.setAttribute('fill', isLast ? th.orange : th.texte); tip.hide(); });
    });
  }

  /* ---------- 3b. « Moteurs utilisés » ---------- */
  function renderProviders(root, byProvider, th, animate) {
    var rows = providerRows(byProvider);
    var total = rows.reduce(function (a, r) { return a + r.n; }, 0);
    var p = panel(root, 'Moteurs utilisés', function (m) { m.textContent = rows.length + ' ' + plural(rows.length, 'moteur', 'moteurs'); });
    var summary = rows.map(function (r) { return r.label + ' ' + Math.round((r.n / (total || 1)) * 100) + ' %'; }).join(', ');
    var box = h('div', { role: 'img', 'aria-label': 'Moteurs utilisés sur ' + total + ' dictées : ' + (summary || 'aucune donnée') + '.' }, p);
    var tot = h('div', { class: 'cbwc-total', 'aria-hidden': 'true' }, box);
    var n = h('span', { class: 'cbwc-n' }, tot);
    h('span', { class: 'cbwc-u' }, tot, plural(total, 'dictée', 'dictées'));
    ticker(n, total, function (v) { return fmtInt.format(Math.round(v)); }, animate);
    var bar = h('div', { class: 'cbwc-stack', 'aria-hidden': 'true' }, box);
    if (!total) { var e = h('i', null, bar); e.style.flex = '1'; e.style.background = th.fil; }
    rows.forEach(function (r, i) {
      var seg = h('i', { title: r.label + ' · ' + fmtInt.format(r.n) }, bar);
      seg.style.flex = r.n + ' 1 0';
      seg.style.background = th[r.color] || r.color;
      if (r.color === 'gris3') seg.style.boxShadow = 'inset 0 0 0 1px ' + th.gris2;
      if (animate && seg.animate) seg.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        { duration: 600, delay: 100 + i * 60, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'backwards' });
    });
    var ul = h('ul', { class: 'cbwc-leg', 'aria-hidden': 'true' }, box);
    rows.forEach(function (r) {
      var li = h('li', null, ul);
      var sw = h('i', null, li); sw.style.background = th[r.color] || r.color;
      if (r.color === 'gris3') sw.style.boxShadow = 'inset 0 0 0 1px ' + th.gris2;
      h('div', null, li, r.label);
      h('span', null, li, fmtInt.format(r.n));
      h('em', null, li, Math.round((r.n / total) * 100) + ' %');
    });
  }

  /* ---------- 4. « Latence moyenne (s) » ---------- */
  function renderLatency(root, daily, th, animate, width) {
    var d30 = daily.slice(-30);
    var vals = d30.map(function (d) { return d.dictations > 0 && d.avgMs > 0 ? d.avgMs / 1000 : null; });
    var have = vals.filter(function (v) { return v != null; });
    var avg = have.length ? have.reduce(function (a, b) { return a + b; }, 0) / have.length : 0;
    var lastV = null;
    for (var k = vals.length - 1; k >= 0; k--) if (vals[k] != null) { lastV = vals[k]; break; }
    var p = panel(root, 'Latence moyenne (s) · 30 jours', function (m) {
      m.appendChild(document.createTextNode('moy. ')); h('b', null, m, fmt1.format(avg) + ' s');
      if (lastV != null) m.appendChild(document.createTextNode(' · dernier jour ' + fmt1.format(lastV) + ' s'));
    });
    var W = Math.max(240, Math.round(width)), H = 150;
    var ml = 46, mr = 12, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
    var n = d30.length;
    var ax = niceTicks(Math.max.apply(null, have.concat([0.5])), 2);
    function X(i) { return ml + (n > 1 ? (i / (n - 1)) * iw : iw / 2); }
    function Y(v) { return mt + ih - (v / ax.top) * ih; }
    var svg = s('svg', {
      class: 'cbwc-svg', viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img',
      'aria-label': 'Latence moyenne par jour sur ' + n + ' jours : ' + fmt1.format(avg) + ' seconde en moyenne, entre ' +
        fmt1.format(have.length ? Math.min.apply(null, have) : 0) + ' et ' + fmt1.format(have.length ? Math.max.apply(null, have) : 0) + ' s.'
    }, p);
    ax.ticks.forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      s('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: v === 0 ? th.trait : th.grille, 'stroke-width': 1 }, svg);
      axisText(svg, th, ml - 10, y + 4, ax.step < 1 ? fmt1.format(v) : fmtInt.format(v), 'end');
    });
    var every = n > 20 ? 7 : n > 10 ? 3 : 1;
    for (var i = n - 1; i >= 0; i -= every) {
      axisText(svg, th, X(i), H - 6, fmtDay.format(d30[i].date), i === n - 1 ? 'end' : (i < every / 2 ? 'start' : 'middle'));
    }
    if (have.length) {
      var ya = Math.round(Y(avg)) + 0.5;
      s('line', { x1: ml, x2: W - mr, y1: ya, y2: ya, stroke: th.bleu, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.6 }, svg);
    }
    // les jours sans dictée n'ont pas de latence : on relie les jours mesurés
    var segs = [[]];
    vals.forEach(function (v, i) { if (v != null) segs[0].push([X(i), Y(v)]); });
    if (!segs[0].length) segs = [];
    segs.forEach(function (pts, j) {
      if (pts.length === 1) { s('rect', { x: pts[0][0] - 2, y: pts[0][1] - 2, width: 4, height: 4, fill: th.bleu }, svg); return; }
      var path = s('path', { d: monotonePath(pts), fill: 'none', stroke: th.bleu, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
      if (animate) drawIn(path, 800, j * 40);
    });
    if (lastV != null) {
      var li = vals.lastIndexOf(lastV);
      s('rect', { x: X(li) - 4, y: Y(lastV) - 4, width: 8, height: 8, fill: th.bleu, stroke: th.fond, 'stroke-width': 2 }, svg);
    }
  }

  /* ---------- état vide ---------- */
  function renderEmpty(root, th, width) {
    var box = h('section', { class: 'cbwc-empty' }, root);
    var W = Math.max(280, Math.round(width)), H = Math.round(clamp(W * 0.28, 220, 340));
    var svg = s('svg', { class: 'cbwc-svg', viewBox: '0 0 ' + W + ' ' + H, height: H, 'aria-hidden': 'true' }, box);
    for (var i = 0; i <= 4; i++) {
      var y = Math.round(10 + (i / 4) * (H - 40)) + 0.5;
      s('line', { x1: 0, x2: W, y1: y, y2: y, stroke: i === 4 ? th.fil : th.grille, 'stroke-width': 1 }, svg);
    }
    var pts = [];
    for (var j = 0; j < 30; j++) {
      var t = j / 29;
      pts.push([t * W, 10 + (H - 40) * (0.78 - 0.42 * t - 0.12 * Math.sin(t * 9))]);
    }
    s('path', { d: monotonePath(pts), fill: 'none', stroke: th.fil, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, svg);
    var bw = W / 30;
    for (var b = 0; b < 30; b++) {
      var bh = (H - 40) * (0.12 + 0.1 * Math.abs(Math.sin(b * 1.7)));
      s('rect', { x: b * bw + bw * 0.25, y: H - 30 - bh, width: bw * 0.5, height: bh, fill: th.grille }, svg);
    }
    var msg = h('p', { role: 'status' }, box, 'Tes courbes apparaîtront après ta première dictée');
    h('small', null, msg, 'Maintiens ton raccourci, parle, relâche');
  }

  /* ---------- rendu principal ---------- */
  var uidSeq = 0;
  function draw(container, animate) {
    var st = container.__cbwc;
    if (!st) return;
    var stats = st.stats || {};
    var width = container.clientWidth || 900;
    st.width = width;
    var th = readTheme(container);
    var anim = animate && !reducedMotion();
    var daily = normDaily(stats.daily);
    var narrow = width < 760;

    var root = document.createElement('div');
    root.className = 'cbwc' + (narrow ? ' narrow' : '');
    root.style.setProperty('--police', th.police);
    root.style.setProperty('--mono', th.mono);

    // Accueil épuré : une rangée de chiffres + UN graphique d'activité, seulement quand il y a de quoi tracer.
    renderKpis(root, stats, daily, th, anim, width);
    var activeDays = daily.filter(function (d) { return d.dictations > 0; }).length;
    if (activeDays >= 3) {
      var row = h('div', { class: 'cbwc-row' }, root);
      var colW = narrow ? width : (width - 32) * 7 / 12;
      renderBars(row, daily, th, anim, colW);
      if (Object.keys(stats.byProvider || {}).length > 1) renderProviders(row, stats.byProvider, th, anim);
    } else {
      h('p', { class: 'cbwc-cap cbwc-soon' }, root, 'Ton activité s’affichera ici après quelques jours de dictée.');
    }
    container.textContent = '';
    container.appendChild(root);
  }

  function renderHome(container, stats) {
    if (!container) return;
    ensureStyle();
    var st = container.__cbwc;
    if (!st) {
      st = container.__cbwc = { uid: ++uidSeq, width: 0, timer: 0 };
      var redraw = function () { if (st.stats) draw(container, false); };
      if (typeof ResizeObserver === 'function') {
        st.ro = new ResizeObserver(function () {
          var w = container.clientWidth;
          if (!w || Math.abs(w - st.width) < 1) return;
          cancelAnimationFrame(st.timer);
          st.timer = requestAnimationFrame(redraw);
        });
        st.ro.observe(container);
      }
      // changement de thème : attribut data-theme ou préférence système
      if (typeof MutationObserver === 'function') {
        st.mo = new MutationObserver(redraw);
        st.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
      }
      if (window.matchMedia) {
        st.mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (st.mq.addEventListener) st.mq.addEventListener('change', redraw);
      }
      st.destroy = function () {
        if (st.ro) st.ro.disconnect();
        if (st.mo) st.mo.disconnect();
        if (st.mq && st.mq.removeEventListener) st.mq.removeEventListener('change', redraw);
        delete container.__cbwc;
        container.textContent = '';
      };
    }
    st.stats = stats || {};
    draw(container, true);
    return { destroy: st.destroy };
  }

  window.CBWCharts = { renderHome: renderHome };
})();

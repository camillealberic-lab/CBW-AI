# Préchargement — intégration dans `design/app/app.html`

Trois propositions, mêmes règles : **une fois par session**, **passable** (clic ou n'importe quelle touche → fondu 120 ms), **purement visuel** (ne bloque ni le pont `window.dictaApp` ni le routage, l'appli se construit derrière), durée **1000 ms**, puis le nœud `#preload` est retiré du DOM.

Le contrat existant est conservé tel quel :
- le script de `<head>` pose `html.preloading` (ou `html.no-preload` si `?preload=0`, déjà vu dans la session, ou `prefers-reduced-motion`) — **inchangé** ;
- `html.preloading #onboarding *, html.preloading #hub * { animation-play-state: paused }` — **inchangé** (les entrées d'écran démarrent quand le rideau s'ouvre) ;
- `preload()` dans le script principal retire `preloading`, pose `no-preload`, appelle `syncSegs(); moveNav();` — **même fonction `end()`**, seul le déclencheur change : la fin de la timeline JS au lieu de `animationend` sur `.pl-l.c1`. Le filet de sécurité passe de 1000 à **1400 ms**.

Trois remplacements à faire (identiques pour A, B, C sauf l'étape 3).

## 1. CSS — remplacer le bloc « Préchargement (≤ 900 ms…) »

```css
/* ───────── Préchargement (1000 ms, une fois par session, passable) ───────── */
#preload { position: fixed; inset: 0; z-index: 200; background: var(--fond); overflow: hidden; cursor: pointer; }
html.no-preload #preload { display: none; }
#preload .r { position: absolute; left: 0; top: 0; width: 100px; height: 100px; transform-origin: 50% 50%; will-change: transform, opacity; }
#preload .o { background: var(--orange); }
#preload .b { background: var(--bleu); }
#preload .v { background: var(--vert); }
#preload .gl { filter: blur(18px); }            /* B uniquement (halo d'impact) */
#preload.skip { opacity: 0; transition: opacity var(--d-1) linear; pointer-events: none; }
```

## 2. Markup — remplacer `<div id="preload">…</div>`

```html
<!-- Préchargement : les 3 barres orange · bleu · vert, sans texte. Purement visuel, n'attend rien. -->
<div id="preload" aria-hidden="true"></div>
```

(Le libellé « Clic pour passer » disparaît : brief « pas de texte ». Le clic et le clavier passent toujours.)

## 3. JS — remplacer `(function preload() { … })();` par **un** des blocs ci-dessous

Chaque bloc est autonome (outils de mouvement + timeline de la proposition + lanceur). Il utilise `$`, `root`, `syncSegs`, `moveNav` déjà définis dans app.html.

### A · Pulse sonore

Un point d'encre → trois carrés → barres qui montent en ressort (dépassement + stabilisation) → deux battements d'égaliseur synchronisés → les barres s'étirent en rideau tricolore plein écran qui remonte en cascade.

```js
  /* ═════════ Préchargement A : purement visuel, ne bloque ni le pont ni le routage ═════════ */
  (function preload() {
    const pl = $('#preload');
    if (!root.classList.contains('preloading')) { if (pl) pl.remove(); return; }
    try { sessionStorage.setItem('cbw.preloaded', '1'); } catch (e) { /* */ }

    /* ── Outils de mouvement ── */
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const lerp = (a, b, k) => a + (b - a) * k;
    const prog = (t, a, b) => clamp((t - a) / (b - a));
    function bezier(x1, y1, x2, y2) {           // cubic-bezier CSS, résolu par Newton + bissection
      const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
      const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
      const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s;
      const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
      return (x) => {
        if (x <= 0) return 0; if (x >= 1) return 1;
        let s = x;
        for (let i = 0; i < 6; i++) { const e = X(s) - x, d = dX(s); if (Math.abs(e) < 1e-5) return Y(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
        let lo = 0, hi = 1; s = x;
        for (let i = 0; i < 24; i++) { const v = X(s); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = s; else hi = s; s = (lo + hi) / 2; }
        return Y(s);
      };
    }
    const E = {
      rideau: bezier(.7, 0, .15, 1), sortie: bezier(.16, 1, .3, 1), ease: bezier(.2, .7, .2, 1),
      inOut: bezier(.65, 0, .35, 1), in: bezier(.55, 0, .9, .3), snap: bezier(.45, 0, .1, 1),
    };
    // Ressort amorti normalisé (u = 0 → 0, u = 1 → ≈ 1). z = amortissement, w = pulsation.
    function spring(u, z = .42, w = 15) {
      if (u <= 0) return 0; if (u >= 1.6) return 1;
      const wd = w * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u));
    }
    // Place un carré de 100 px : centre (x, y), taille (w, h), rotation r (deg)
    function put(el, x, y, w, h, r = 0, o = 1) {
      el.style.transform = `translate(${(x - 50).toFixed(2)}px,${(y - 50).toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${(w / 100).toFixed(4)},${(h / 100).toFixed(4)})`;
      el.style.opacity = o;
    }
    const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();

    const P = (function () {
      /* A · Pulse sonore
         0–140   un point d'encre apparaît (ressort)
         110–300 il se divise en trois carrés orange · bleu · vert
         220–600 les carrés montent en barres (ressort : dépassement + stabilisation)
         540–700 deux battements d'égaliseur synchronisés
         715–875 les barres s'étirent en trois colonnes plein écran (rideau tricolore)
         860–1000 les colonnes remontent en cascade → l'appli apparaît */
      const W = 28, G = 14, H = [84, 140, 106];
      let el = [], dot;
      function setup(c) {
        c.pl.innerHTML = '<i class="r k"></i><i class="r o"></i><i class="r b"></i><i class="r v"></i>';
        dot = c.pl.querySelector('.k'); el = [...c.pl.querySelectorAll('.o,.b,.v')];
        dot.style.background = c.texte;
      }
      const X = (c, i) => c.cx + (i - 1) * (W + G);
      function pulse(t, at, wdt) { const d = (t - at) / wdt; return d < -1.5 || d > 3 ? 0 : (d < 0 ? Math.exp(-d * d * 4) : Math.exp(-d * 1.6) * Math.cos(d * 1.2)); }
      function barRect(c, i, t) {
        // division
        const ks = E.sortie(prog(t, 110 + Math.abs(i - 1) * 10, 330));
        const x = lerp(c.cx, X(c, i), ks);
        // montée
        const st = 220 + [40, 0, 70][i];
        const s = spring(prog(t, st, st + 420), .38, 14);
        let h = lerp(W, H[i], s);
        // battements (synchronisés, légère variation d'amplitude)
        const amp = [.42, .28, .36][i];
        const beat = pulse(t, 565, 42) * amp + pulse(t, 650, 38) * amp * .7;
        h *= 1 + beat;
        const w = W * (1 - .22 * (s - 1)) * (1 - beat * .12);
        return { x, y: c.cy, w, h };
      }
      function render(t, c) {
        // point d'origine
        const kd = spring(prog(t, 0, 260), .5, 16);
        const sz = W * kd;
        put(dot, c.cx, c.cy, sz, sz, 0, t < 150 ? 1 : 0);
        const cols = c.vw / 3;
        el.forEach((e, i) => {
          const r = barRect(c, i, Math.min(t, 715));
          let { x, y, w, h } = r;
          if (t < 120) { w = h = 0; }
          else if (t < 150) { w = h = sz; x = c.cx; }
          // étirement en colonnes
          const k = E.rideau(prog(t, 715, 855));                 // largeur : même tempo → jamais de chevauchement
          const st = 715 + [15, 0, 30][i];
          const kh = E.rideau(prog(t, st, st + 130));            // hauteur : cascade bleu → orange → vert
          if (k > 0) {
            const tx = cols * i + cols / 2, tw = cols + 2;
            x = lerp(x, tx, k); w = lerp(w, tw, k); h = lerp(h, c.vh + 4, kh); y = lerp(y, c.vh / 2, kh);
          }
          // remontée du rideau (le bord bas monte)
          const ws = 860 + [0, 20, 40][i];
          const kw = E.rideau(prog(t, ws, ws + 100));
          if (kw > 0) { const hh = (c.vh + 4) * (1 - kw); y = hh / 2 - 2; h = hh; }
          put(e, x, y, w, h);
        });
        c.pl.style.background = t >= 875 ? 'transparent' : '';
      }
      function reducedLayout(c) {
        dot.style.opacity = 0;
        el.forEach((e, i) => put(e, X(c, i), c.cy, W, H[i]));
      }
      return { DUR: 1000, APP_AT: 860, setup, render, reducedLayout };

    })();

    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const c = { vw: innerWidth, vh: innerHeight, cx: innerWidth / 2, cy: innerHeight / 2, pl, app: document.body,
      O: css('--orange'), B: css('--bleu'), V: css('--vert'), fond: css('--fond'), texte: css('--texte'), dark };
    P.setup(c);

    let done = false, raf = 0;
    const end = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      root.classList.remove('preloading'); root.classList.add('no-preload');
      window.removeEventListener('keydown', onKey, true);
      if (pl) pl.remove();
      syncSegs(); moveNav();
    };
    const skip = () => { if (done) return; pl.classList.add('skip'); setTimeout(end, 130); };
    function onKey() { skip(); }
    pl.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', onKey, true);
    const t0 = performance.now();
    const loop = (now) => {
      const t = now - t0;
      P.render(Math.min(t, P.DUR), c);
      if (t >= P.DUR) end(); else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setTimeout(end, P.DUR + 400); // filet de sécurité : rAF suspendu (fenêtre cachée), erreur, etc.
  })();
```

### B · Assemblage

Les barres arrivent de trois directions en rotation, étirées par la vitesse, s'écrasent sur une ligne de base (micro-rebond + halo bref), le groupe se rétracte puis zoome, la barre bleue devient un masque plein écran et une fenêtre s'y ouvre sur l'appli. La fenêtre est un `clip-path: polygon(evenodd, …)` posé sur `#preload` lui-même : rien n'est modifié côté appli.

> Écart à DESIGN.md (« no glows ») : le halo d'impact est volontaire (demandé dans le brief), bref (≈ 300 ms) et limité à l'atterrissage. Pour s'en passer, supprimer la règle `.gl` et les trois `<i class="r gl …">` dans `setup`.

```js
  /* ═════════ Préchargement B : purement visuel, ne bloque ni le pont ni le routage ═════════ */
  (function preload() {
    const pl = $('#preload');
    if (!root.classList.contains('preloading')) { if (pl) pl.remove(); return; }
    try { sessionStorage.setItem('cbw.preloaded', '1'); } catch (e) { /* */ }

    /* ── Outils de mouvement ── */
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const lerp = (a, b, k) => a + (b - a) * k;
    const prog = (t, a, b) => clamp((t - a) / (b - a));
    function bezier(x1, y1, x2, y2) {           // cubic-bezier CSS, résolu par Newton + bissection
      const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
      const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
      const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s;
      const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
      return (x) => {
        if (x <= 0) return 0; if (x >= 1) return 1;
        let s = x;
        for (let i = 0; i < 6; i++) { const e = X(s) - x, d = dX(s); if (Math.abs(e) < 1e-5) return Y(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
        let lo = 0, hi = 1; s = x;
        for (let i = 0; i < 24; i++) { const v = X(s); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = s; else hi = s; s = (lo + hi) / 2; }
        return Y(s);
      };
    }
    const E = {
      rideau: bezier(.7, 0, .15, 1), sortie: bezier(.16, 1, .3, 1), ease: bezier(.2, .7, .2, 1),
      inOut: bezier(.65, 0, .35, 1), in: bezier(.55, 0, .9, .3), snap: bezier(.45, 0, .1, 1),
    };
    // Ressort amorti normalisé (u = 0 → 0, u = 1 → ≈ 1). z = amortissement, w = pulsation.
    function spring(u, z = .42, w = 15) {
      if (u <= 0) return 0; if (u >= 1.6) return 1;
      const wd = w * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u));
    }
    // Place un carré de 100 px : centre (x, y), taille (w, h), rotation r (deg)
    function put(el, x, y, w, h, r = 0, o = 1) {
      el.style.transform = `translate(${(x - 50).toFixed(2)}px,${(y - 50).toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${(w / 100).toFixed(4)},${(h / 100).toFixed(4)})`;
      el.style.opacity = o;
    }
    const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();

    const P = (function () {
      /* B · Assemblage
         0–380   les barres arrivent de trois directions, en rotation, étirées par la vitesse
         300–600 impact sur la ligne de base : écrasement + micro-rebond + halo bref
         520–720 anticipation (le groupe se rétracte) puis zoom ; orange et vert s'écartent et s'effacent
         660–860 la barre bleue devient un masque plein écran
         740–960 une fenêtre s'ouvre dans le bleu (clip-path evenodd sur le préchargement) → l'appli blanche apparaît, le cadre bleu s'amincit */
      const W = 28, G = 14, H = [84, 140, 106];
      const FROM = [ // décalage de départ (fraction de l'écran) + rotation initiale
        { dx: -.46, dy: -.52, r: -135 },
        { dx: 0, dy: -.78, r: 90 },
        { dx: .5, dy: -.22, r: 160 },
      ];
      const START = [45, 0, 95], FLY = 300;
      const fly = bezier(.5, 0, .55, 1);
      let el = [], gl = [], base;
      function setup(c) {
        c.pl.innerHTML = '<i class="r gl o"></i><i class="r gl b"></i><i class="r gl v"></i><i class="r ln"></i>' +
          '<i class="r o"></i><i class="r b"></i><i class="r v"></i>';
        el = [...c.pl.querySelectorAll('.r:not(.gl):not(.ln)')];
        gl = [...c.pl.querySelectorAll('.gl')];
        base = c.pl.querySelector('.ln'); base.style.background = c.texte;
      }
      const BASE = (c) => c.cy + 70;
      const X = (c, i) => c.cx + (i - 1) * (W + G);
      // rectangle d'une barre au repos (avant zoom), avec vol + impact
      function bar(c, i, t) {
        const st = START[i], land = st + FLY;
        const u = prog(t, st, land);
        const f = fly(u);
        const v = (fly(Math.min(1, u + .02)) - fly(Math.max(0, u - .02))) / .04; // vitesse normalisée
        const fr = FROM[i];
        let x = X(c, i) + fr.dx * c.vw * (1 - f);
        let w = W, h = H[i], r = fr.r * (1 - E.sortie(u)), sx = 1, sy = 1;
        if (u < 1) { sy = 1 + Math.min(.9, v * .32); sx = 1 / Math.sqrt(sy); }
        // impact : écrasement amorti, ancré sur la ligne de base
        const e = (t - land) / 260;
        if (e >= 0 && e < 1.2) { const d = -.3 * Math.exp(-4.2 * e) * Math.cos(10 * e); sy = 1 + d; sx = 1 - d * .85; }
        w *= sx; h *= sy;
        let y = BASE(c) - h / 2 + fr.dy * c.vh * (1 - f);
        return { x, y, w, h, r, land };
      }
      function render(t, c) {
        const b0 = BASE(c);
        // ligne de base
        const gw = 3 * W + 2 * G + 56;
        const kl = E.sortie(prog(t, 60, 340)) * (1 - E.inOut(prog(t, 520, 640)));
        put(base, c.cx, b0 + 4, gw * kl, 2, 0, kl > 0 ? 1 : 0);
        // groupe : anticipation puis zoom
        const ant = E.inOut(prog(t, 520, 600));
        const zoom = E.in(prog(t, 600, 720));
        const gs = (1 - .1 * ant) * (1 + 1.1 * zoom);
        const px = c.cx, py = b0 - 70;
        const out = E.in(prog(t, 610, 720));
        el.forEach((e, i) => {
          let { x, y, w, h, r, land } = bar(c, i, t);
          if (t < START[i]) { put(e, x, y, 0, 0, 0, 0); put(gl[i], x, y, 0, 0, 0, 0); return; }
          // groupe
          x = px + (x - px) * gs; y = py + (y - py) * gs; w *= gs; h *= gs;
          let o = 1;
          if (i !== 1) { x += (i - 1) * 90 * out; o = 1 - out; h *= 1 - .5 * out; }
          else {
            const k = E.rideau(prog(t, 660, 860));
            if (k > 0) { x = lerp(x, c.cx, k); y = lerp(y, c.cy, k); w = lerp(w, c.vw + 6, k); h = lerp(h, c.vh + 6, k); }
          }
          put(e, x, y, w, h, r, o);
          // halo bref à l'impact
          const g = t >= land && t < land + 420 ? Math.exp(-(t - land) / 110) * (1 - prog(t, land + 300, land + 420)) : 0;
          put(gl[i], x, y, w * (1.3 + .5 * (1 - g)), h * (1.1 + .25 * (1 - g)), r, (c.dark ? .7 : .5) * g * o);
        });
        // fenêtre dans le bleu : rectangle bleu en retard de 90 ms, toujours contenu dans le bleu
        const tb = t - 90;
        if (tb > 660) {
          const blue = blueRect(c, t), hole = blueRect(c, tb);
          const L = Math.max(blue.x - blue.w / 2, hole.x - hole.w / 2 + 2), R = Math.min(blue.x + blue.w / 2, hole.x + hole.w / 2 - 2);
          const T = Math.max(blue.y - blue.h / 2, hole.y - hole.h / 2 + 2), B = Math.min(blue.y + blue.h / 2, hole.y + hole.h / 2 - 2);
          const k = prog(t, 900, 960);  // fin : on referme l'écart restant
          const l = lerp(L, 0, k), rr = lerp(R, c.vw, k), tt = lerp(T, 0, k), bb = lerp(B, c.vh, k);
          // le préchargement se troue (evenodd) : l'appli, dessous, apparaît dans la fenêtre
          const f = (n) => n.toFixed(1) + 'px';
          c.pl.style.clipPath = R > L && B > T
            ? `polygon(evenodd, 0 0, ${f(c.vw)} 0, ${f(c.vw)} ${f(c.vh)}, 0 ${f(c.vh)}, 0 0, ${f(l)} ${f(tt)}, ${f(rr)} ${f(tt)}, ${f(rr)} ${f(bb)}, ${f(l)} ${f(bb)}, ${f(l)} ${f(tt)})`
            : '';
        } else c.pl.style.clipPath = '';
      }
      function blueRect(c, t) {
        const b0 = BASE(c);
        let { x, y, w, h } = bar(c, 1, t);
        const ant = E.inOut(prog(t, 520, 600)), zoom = E.in(prog(t, 600, 720));
        const gs = (1 - .1 * ant) * (1 + 1.1 * zoom), px = c.cx, py = b0 - 70;
        x = px + (x - px) * gs; y = py + (y - py) * gs; w *= gs; h *= gs;
        const k = E.rideau(prog(t, 660, 860));
        return { x: lerp(x, c.cx, k), y: lerp(y, c.cy, k), w: lerp(w, c.vw + 6, k), h: lerp(h, c.vh + 6, k) };
      }
      function reducedLayout(c) {
              el.forEach((e, i) => put(e, X(c, i), BASE(c) - H[i] / 2, W, H[i]));
        put(base, c.cx, BASE(c) + 4, 3 * W + 2 * G + 56, 2);
      }
      return { DUR: 1000, APP_AT: 790, setup, render, reducedLayout };

    })();

    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const c = { vw: innerWidth, vh: innerHeight, cx: innerWidth / 2, cy: innerHeight / 2, pl, app: document.body,
      O: css('--orange'), B: css('--bleu'), V: css('--vert'), fond: css('--fond'), texte: css('--texte'), dark };
    P.setup(c);

    let done = false, raf = 0;
    const end = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      root.classList.remove('preloading'); root.classList.add('no-preload');
      window.removeEventListener('keydown', onKey, true);
      if (pl) pl.remove();
      syncSegs(); moveNav();
    };
    const skip = () => { if (done) return; pl.classList.add('skip'); setTimeout(end, 130); };
    function onKey() { skip(); }
    pl.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', onKey, true);
    const t0 = performance.now();
    const loop = (now) => {
      const t = now - t0;
      P.render(Math.min(t, P.DUR), c);
      if (t >= P.DUR) end(); else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setTimeout(end, P.DUR + 400); // filet de sécurité : rAF suspendu (fenêtre cachée), erreur, etc.
  })();
```

### C · Vague liquide (canvas)

Un filet tricolore s'étale sur la ligne de base, remplit trois colonnes de bas en haut (crête sinusoïdale + écume claire, léger rebond du niveau), se calme, fond en une seule ligne tricolore pleine largeur qui ondule, puis se dédouble et balaie vers le haut et le bas comme une ligne de scan. Canvas plafonné à DPR 2.

```js
  /* ═════════ Préchargement C : purement visuel, ne bloque ni le pont ni le routage ═════════ */
  (function preload() {
    const pl = $('#preload');
    if (!root.classList.contains('preloading')) { if (pl) pl.remove(); return; }
    try { sessionStorage.setItem('cbw.preloaded', '1'); } catch (e) { /* */ }

    /* ── Outils de mouvement ── */
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const lerp = (a, b, k) => a + (b - a) * k;
    const prog = (t, a, b) => clamp((t - a) / (b - a));
    function bezier(x1, y1, x2, y2) {           // cubic-bezier CSS, résolu par Newton + bissection
      const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
      const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
      const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s;
      const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
      return (x) => {
        if (x <= 0) return 0; if (x >= 1) return 1;
        let s = x;
        for (let i = 0; i < 6; i++) { const e = X(s) - x, d = dX(s); if (Math.abs(e) < 1e-5) return Y(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
        let lo = 0, hi = 1; s = x;
        for (let i = 0; i < 24; i++) { const v = X(s); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = s; else hi = s; s = (lo + hi) / 2; }
        return Y(s);
      };
    }
    const E = {
      rideau: bezier(.7, 0, .15, 1), sortie: bezier(.16, 1, .3, 1), ease: bezier(.2, .7, .2, 1),
      inOut: bezier(.65, 0, .35, 1), in: bezier(.55, 0, .9, .3), snap: bezier(.45, 0, .1, 1),
    };
    // Ressort amorti normalisé (u = 0 → 0, u = 1 → ≈ 1). z = amortissement, w = pulsation.
    function spring(u, z = .42, w = 15) {
      if (u <= 0) return 0; if (u >= 1.6) return 1;
      const wd = w * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u));
    }
    // Place un carré de 100 px : centre (x, y), taille (w, h), rotation r (deg)
    function put(el, x, y, w, h, r = 0, o = 1) {
      el.style.transform = `translate(${(x - 50).toFixed(2)}px,${(y - 50).toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${(w / 100).toFixed(4)},${(h / 100).toFixed(4)})`;
      el.style.opacity = o;
    }
    const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();

    const P = (function () {
      /* C · Vague liquide (canvas)
         0–240   un filet tricolore s'étale sur la ligne de base depuis le centre
         120–620 il se resserre et remplit trois colonnes de bas en haut : crête sinusoïdale, vague arrière translucide, léger rebond du niveau
         560–680 la surface se calme, les barres sont nettes
         660–810 les barres fondent en une seule ligne horizontale tricolore (pleine largeur), qui ondule
         800–1000 la ligne se dédouble et balaie vers le haut et le bas comme une ligne de scan → l'appli apparaît */
      const W = 30, G = 14, H = [84, 140, 106];
      const ST = [45, 0, 85];
      let cv, g, dpr = 1;
      function setup(c) {
        c.pl.innerHTML = '<canvas></canvas>';
        cv = c.pl.firstChild; g = cv.getContext('2d');
        dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = Math.round(c.vw * dpr); cv.height = Math.round(c.vh * dpr);
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        c.pl.style.background = 'transparent';
      }
      const BASE = (c) => c.cy + 70;
      const X = (c, i) => c.cx + (i - 1) * (W + G);
      const COL = (c, i) => [c.O, c.B, c.V][i];
      const TINT = (c, i) => ['#FFAC8F', '#959DFF', '#8FE9B5'][i];
      // rectangle (gauche, haut, largeur, hauteur) avec bord supérieur ondulé : amplitude a, longueur d'onde lam, phase ph
      function wavyRect(x, y, w, h, a, lam, ph, aBot = 0, phB = 0) {
        const step = Math.max(2, Math.min(10, w / 12));
        g.beginPath();
        g.moveTo(x, y + h + aBot * Math.sin(ph + phB));
        for (let px = 0; px <= w + .01; px += step) g.lineTo(x + px, y + a * Math.sin((px / lam) * 2 * Math.PI + ph));
        g.lineTo(x + w, y + a * Math.sin((w / lam) * 2 * Math.PI + ph));
        for (let px = w; px >= -.01; px -= step) g.lineTo(x + px, y + h + aBot * Math.sin((px / lam) * 2 * Math.PI + ph + phB));
        g.closePath(); g.fill();
      }
      function render(t, c) {
        const { vw, vh } = c, b0 = BASE(c);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, vw, vh);
        const LY = c.cy;
        if (t < 800) {
          g.fillStyle = c.fond; g.fillRect(0, 0, vw, vh);
          const kSpread = E.sortie(prog(t, 0, 240));
          const merge = E.rideau(prog(t, 660, 810));
          for (let i = 0; i < 3; i++) {
            const st = ST[i] + 120;
            // niveau : remplissage avec léger rebond
            const s = spring(prog(t, st, st + 520), .55, 11);
            const lvl = lerp(6, H[i], s);
            // filet initial : segments contigus qui se resserrent vers la colonne
            const tight = E.inOut(prog(t, 120 + ST[i] * .5, 300 + ST[i] * .5));
            const segW = lerp(W + G + .5, W, tight);
            const half = (3 * (W + G)) / 2 * kSpread;            // étalement depuis le centre
            let x = X(c, i) - segW / 2, w = segW;
            const L = Math.max(x, c.cx - half), R = Math.min(x + w, c.cx + half);
            x = L; w = Math.max(0, R - L);
            let y = b0 - lvl, h = lvl;
            // vague : forte pendant le remplissage, calme à l'arrivée
            const u = prog(t, st, st + 460);
            const amp = 9 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** .8 * (1 - prog(t, 520, 640)) + (u > 0 && u < 1 ? .6 : 0);
            const ph = t * .022 + i * 1.9;
            // fusion → segment de ligne pleine largeur
            if (merge > 0) {
              const tw = vw / 3 + 1, tx = (vw / 3) * i;
              x = lerp(x, tx, merge); w = lerp(w, tw, merge); y = lerp(y, LY - 2.5, merge); h = lerp(h, 5, merge);
            }
            const wob = 5 * Math.sin(Math.PI * merge);
            if (w <= 0) continue;
            // vague arrière (translucide, déphasée, un peu plus haute)
            if (amp > .3 && merge === 0) {
              g.fillStyle = TINT(c, i);                          // écume : teinte claire opaque (lisible clair et sombre)
              wavyRect(x, y - 4 * Math.min(1, amp / 3), w, h + 4, amp * .85, W * 1.6, -ph * 1.3 + 2.2);
            }
            g.fillStyle = COL(c, i);
            wavyRect(x, y, w, h, merge > 0 ? wob : amp, merge > 0 ? 260 : W * 1.25, merge > 0 ? t * .03 + i * 2 : ph, merge > 0 ? wob : 0, 0);
          }
        } else {
          // balayage : deux lignes partent du centre vers le haut et le bas
          const k = E.rideau(prog(t, 800, 1000));
          const top = lerp(LY - 2, -10, k), bot = lerp(LY + 2, vh + 10, k);
          const a = 6 * (1 - k) * Math.sin(Math.PI * Math.min(1, k * 3)) + 1.5 * (1 - k);
          const ph = t * .03;
          g.fillStyle = c.fond;
          wavyRect(0, -20, vw, top + 20, 0, 260, 0, a, ph);              // zone haute, bord bas ondulé
          wavyRect(0, bot, vw, vh - bot + 20, a, 260, ph);                // zone basse, bord haut ondulé
          const th = lerp(5, 9, Math.min(1, k * 2.5));
          for (let i = 0; i < 3; i++) {
            g.fillStyle = COL(c, i);
            const x = (vw / 3) * i, w = vw / 3 + 1;
            // ligne haute : suit le bord bas de la zone haute
            wavyRect(x, top - th / 2, w, th, a, 260, ph + (x / 260) * 2 * Math.PI, a, 0);
            wavyRect(x, bot - th / 2, w, th, a, 260, ph + (x / 260) * 2 * Math.PI, a, 0);
          }
        }
      }
      function reducedLayout(c) {
        const b0 = BASE(c);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = c.fond; g.fillRect(0, 0, c.vw, c.vh);
        for (let i = 0; i < 3; i++) { g.fillStyle = COL(c, i); g.fillRect(X(c, i) - W / 2, b0 - H[i], W, H[i]); }
      }
      return { DUR: 1000, APP_AT: 820, setup, render, reducedLayout };

    })();

    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const c = { vw: innerWidth, vh: innerHeight, cx: innerWidth / 2, cy: innerHeight / 2, pl, app: document.body,
      O: css('--orange'), B: css('--bleu'), V: css('--vert'), fond: css('--fond'), texte: css('--texte'), dark };
    P.setup(c);

    let done = false, raf = 0;
    const end = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      root.classList.remove('preloading'); root.classList.add('no-preload');
      window.removeEventListener('keydown', onKey, true);
      if (pl) pl.remove();
      syncSegs(); moveNav();
    };
    const skip = () => { if (done) return; pl.classList.add('skip'); setTimeout(end, 130); };
    function onKey() { skip(); }
    pl.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', onKey, true);
    const t0 = performance.now();
    const loop = (now) => {
      const t = now - t0;
      P.render(Math.min(t, P.DUR), c);
      if (t >= P.DUR) end(); else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setTimeout(end, P.DUR + 400); // filet de sécurité : rAF suspendu (fenêtre cachée), erreur, etc.
  })();
```

## 4. Itération A — trois plans « voix » (A1 · A2 · A3)

Retour : garder A, mais que les barres **parlent vraiment** comme la pastille d'enregistrement. Les trois plans partagent un moteur `VOICE` qui reproduit **le même algorithme** que `design/overlay/overlay.html` (fonction `frame`) :

| Pastille (overlay.html) | Préchargement |
|---|---|
| niveau micro par paliers de 33 ms (`recorder.ts`, RMS → dB → 0…1) | voix synthétique (syllabes : attaque ~30 ms, voyelle tenue, chute exponentielle, grain aléatoire à graine fixe) échantillonnée par paliers de 33 ms |
| lissage par image : attaque k = 0,45, relâchement k = 0,12 | identique, simulé à 60 i/s sur horloge fixe (même rendu à chaque lecture, à 60 ou 120 Hz) |
| `lv = lissé^0,6` | identique |
| gigue `0,62 + 0,38·sin(t·vitesse + phase)`, respiration `0,92 + 0,08·sin(2,4 t)` | identique, vitesses / phases des 3 barres centrales (6,3 / 4,4 / 5,9 · 1,7 / 3,1 / 4,0) |
| repos 240/400/560/400/240 → 10 px, crête 16 px, plancher 3 px | 3 barres centrales (orange · bleu · vert), ×9,33 : repos 66 / 93 / 66 px, plancher = carré de 28 px |

Deux réglages seulement, propres au plein écran : **gain ×1,7** sur l'amplitude (crête − repos), sinon ±20 px se lisent mal en grand ; **horloge de gigue décalée de 4,65 s** (« au milieu d'une phrase ») pour que les trois barres divergent dès la première syllabe. Les deux sont des paramètres de `bake()`.

- **A1 · Il parle** — « C · B · W » : trois syllabes (225 / 395 / 560 ms), la dernière tenue ; dessus, les barres jaillissent pleine hauteur puis deviennent le rideau tricolore de A, qui remonte en cascade (830–990 ms).
- **A2 · Écho** — trois syllabes ; à chaque crête chaque barre laisse un contour de sa hauteur qui s'élargit et s'efface. Temps appuyé à 660 ms : les barres gonflent (ressort) puis se résorbent ; une onde carrée tricolore (bandes orange · bleu · vert contiguës) part du centre en accélérant, l'intérieur du vert s'ouvre sur l'appli (`clip-path: path(evenodd, …)`, Chromium/Electron OK).
- **A3 · Du micro au texte** — les barres parlent et, à chaque palier de 33 ms, le niveau brut s'imprime à gauche en tranche tricolore qui défile : une piste audio. Puis tout s'aplatit en un trait orange · bleu · vert pleine largeur (560–765 ms), qui s'ouvre comme une fente (le haut monte, le bas descend) sur l'appli.

Toutes restent à **3 barres** (pas besoin des 5 barres du logo), 1000 ms, sans texte.

**Comment intégrer** : prendre le bloc JS de **A** (§3) tel quel, et remplacer seulement `const P = (function () { … })();` par le moteur `VOICE` **suivi** du `P` du plan choisi. Ajouter au CSS du §1 les lignes du plan (A1 : rien).

### Moteur commun `VOICE`

```js
    /* ── Voix synthétique → barres : MÊME algorithme que la pastille d'enregistrement (design/overlay/overlay.html) ──
       · le niveau micro arrive par paliers de 33 ms (recorder.ts : RMS → dB, −50 dB → 0, −10 dB → 1) ;
       · lissage par image à 60 i/s : attaque rapide k = 0,45, relâchement lent k = 0,12 ;
       · courbe perceptuelle lv = lissé^0,6 ;
       · chaque barre vit sa vie : gigue 0,62 + 0,38·sin(t·vitesse + phase), respiration 0,92 + 0,08·sin(2,4·t) ;
       · h = repos·respiration + (crête − repos)·min(1, lv·gigue), plancher = un carré.
       Les 3 barres = les 3 barres centrales du logo (orange · bleu · vert) : mêmes ratios, vitesses et phases,
       agrandies de 3 px → 28 px (×9,33). Deux réglages seulement, propres à l'écran plein format :
       · GAIN 1,7 sur l'amplitude (crête − repos) : à 16 px la pastille lit bien ±6 px, en grand il faut plus d'ampleur ;
       · T_OFF : l'horloge de la gigue démarre « au milieu d'une phrase » (4,65 s) pour que les 3 barres divergent.
       Tout est pré-calculé sur une horloge fixe → rendu identique à chaque lecture. */
    const VOICE = (function () {
      const U = 28 / 3;                                          // 1 px de la pastille = 9,33 px ici
      const RATIOS = [400 / 560, 1, 400 / 560];
      const REST_H = 10 * U, PEAK_H = 16 * U, BAR_MIN = 3 * U;
      const REST = RATIOS.map((r) => Math.max(BAR_MIN, r * REST_H));   // 66 / 93 / 66
      const PEAK = RATIOS.map((r) => PEAK_H * (0.6 + 0.4 * r));        // 133 / 149 / 133
      const SPEEDS = [6.3, 4.4, 5.9], PHASES = [1.7, 3.1, 4.0];
      const W = BAR_MIN, GAP = 2 * U;                             // largeur 3, écart 2 (proportions de la pastille)
      const FR = 1000 / 60, TICK = 1000 / 30;
      function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
      // Une syllabe : attaque (consonne) → voyelle tenue qui fléchit → chute exponentielle.
      function syl(t, s) {
        const d = t - s.at;
        if (d < -s.a) return 0;
        if (d < 0) { const u = 1 + d / s.a; return s.p * u * u * (3 - 2 * u); }
        if (d < s.hold) return s.p * (1 - 0.18 * d / s.hold);
        return s.p * 0.82 * Math.exp(-(d - s.hold) / s.tau);
      }
      // Enveloppe → niveaux 33 ms (avec la granularité d'un vrai micro) → simulation image par image.
      function bake(sylls, dur, seed = 7, T_OFF = 4.65, GAIN = 1.7) {
        const r = rng(seed);
        const ticks = [];
        for (let k = 0; k * TICK <= dur + TICK; k++) {
          const t = k * TICK;
          let e = 0.03;                                             // souffle de fond
          for (const s of sylls) e = Math.max(e, syl(t, s));
          e *= 1 + (r() - 0.5) * 0.28;                              // grain de la voix
          e += (r() - 0.5) * 0.03;
          ticks.push(Math.max(0, Math.min(1, e)));
        }
        const frames = [];
        let smooth = 0;
        for (let f = 0; f * FR <= dur + FR; f++) {
          const tm = f * FR, ts = tm / 1000;
          const target = ticks[Math.min(ticks.length - 1, Math.floor(tm / TICK))];
          smooth += (target - smooth) * (target > smooth ? 0.45 : 0.12);
          const lv = Math.pow(smooth, 0.6);
          const breath = 0.92 + 0.08 * Math.sin(ts * 2.4);
          const tj = ts + T_OFF;
          const h = [0, 1, 2].map((i) => {
            const jitter = 0.62 + 0.38 * Math.sin(tj * SPEEDS[i] + PHASES[i]);
            const v = Math.min(1, lv * jitter);
            return Math.max(BAR_MIN, REST[i] * breath + (PEAK[i] - REST[i]) * GAIN * v);
          });
          frames.push({ lv, h, target });
        }
        // échantillonnage interpolé (rendu fluide à n'importe quelle cadence)
        function at(t) {
          const x = Math.max(0, t) / FR, f = Math.min(frames.length - 2, Math.floor(x)), k = Math.min(1, x - f);
          const A = frames[f], B = frames[f + 1];
          return { lv: A.lv + (B.lv - A.lv) * k, h: A.h.map((v, i) => v + (B.h[i] - v) * k), target: A.target };
        }
        return { at, ticks, TICK };
      }
      return { U, REST, PEAK, W, GAP, BAR_MIN, bake, X: (cx, i) => cx + (i - 1) * (W + GAP) };
    })();

```

### A1 · Il parle

```js
    const P = (function () {
      /* A1 · Il parle — « C · B · W »
         0–200   trois carrés apparaissent (ressort) et prennent la silhouette de repos du logo
         200–600 les barres « disent » C · B · W : trois syllabes à ~170 ms, pilotées par l'algorithme de la pastille
         590–820 sur la dernière syllabe elles jaillissent : pleine hauteur puis trois colonnes (rideau tricolore)
         830–990 les colonnes remontent en cascade → l'appli apparaît */
      const V = VOICE;
      const voice = V.bake([
        { at: 225, p: 0.85, a: 30, hold: 25, tau: 30 },   // « sé »
        { at: 395, p: 0.95, a: 30, hold: 25, tau: 30 },   // « bé »
        { at: 560, p: 1.00, a: 30, hold: 90, tau: 80 },   // « vé » — tenu, il porte le jaillissement
      ], 1000, 11);
      let el = [];
      function setup(c) {
        c.pl.innerHTML = '<i class="r o"></i><i class="r b"></i><i class="r v"></i>';
        el = [...c.pl.querySelectorAll('.r')];
      }
      function render(t, c) {
        const m = voice.at(t);
        const cols = c.vw / 3;
        el.forEach((e, i) => {
          // apparition : carré (ressort) → silhouette au repos
          const ap = 20 + [30, 0, 60][i];
          const ks = spring(prog(t, ap, ap + 260), .5, 16);
          const kg = spring(prog(t, ap + 70, ap + 380), .55, 13);
          let x = V.X(c.cx, i), y = c.cy;
          let w = V.W * ks, h = lerp(V.W, m.h[i], kg) * ks;
          // jaillissement : la hauteur part d'abord (bleu en tête), la largeur suit
          const st = 600 + [25, 0, 45][i];
          const kh = E.snap(prog(t, st, st + 170));
          const k = E.rideau(prog(t, 660, 820));
          if (kh > 0) h = lerp(h, c.vh + 4, kh);
          if (k > 0) { x = lerp(x, cols * i + cols / 2, k); w = lerp(w, cols + 2, k); }
          // remontée du rideau (le bord bas monte)
          const ws = 830 + [0, 20, 40][i];
          const kw = E.rideau(prog(t, ws, ws + 120));
          if (kw > 0) { const hh = (c.vh + 4) * (1 - kw); y = hh / 2 - 2; h = hh; }
          put(e, x, y, w, h);
        });
        c.pl.style.background = t >= 840 ? 'transparent' : '';
      }
      function reducedLayout(c) { el.forEach((e, i) => put(e, V.X(c.cx, i), c.cy, V.W, V.REST[i])); }
      return { DUR: 1000, APP_AT: 830, setup, render, reducedLayout };
    })();
```

### A2 · Écho

```css
#preload .g,#preload .ring{position:absolute;left:0;top:0;box-sizing:border-box;border-style:solid;background:transparent;will-change:transform,opacity,width,height}
#preload .g{border-width:3px}
#preload .ko{border-color:var(--orange)} #preload .kb{border-color:var(--bleu)} #preload .kv{border-color:var(--vert)}
```

```js
    const P = (function () {
      /* A2 · Écho — « bon-jour ! »
         0–200   trois carrés apparaissent et prennent la silhouette de repos du logo
         200–560 trois syllabes ; à chaque crête, chaque barre laisse un écho (contour de sa hauteur) qui s'élargit et s'efface
         600–720 dernier temps appuyé : les barres gonflent (ressort), l'énergie se libère
         715–990 une onde carrée tricolore (orange · bleu · vert) part du centre ; l'intérieur du vert s'ouvre sur l'appli */
      const V = VOICE;
      const voice = V.bake([
        { at: 215, p: 0.80, a: 30, hold: 25, tau: 30 },
        { at: 380, p: 0.95, a: 30, hold: 25, tau: 30 },
        { at: 530, p: 0.85, a: 30, hold: 25, tau: 30 },
        { at: 660, p: 1.00, a: 25, hold: 60, tau: 60 },   // temps appuyé
      ], 1000, 5);
      const ECHO = [250, 415, 565], ECHO_D = 360;
      let el = [], gh = [], rings = [], snap = [];
      function setup(c) {
        let h = '';
        for (let s = 0; s < ECHO.length; s++) h += '<i class="g ko"></i><i class="g kb"></i><i class="g kv"></i>';
        h += '<i class="ring ko"></i><i class="ring kb"></i><i class="ring kv"></i>';
        h += '<i class="r o"></i><i class="r b"></i><i class="r v"></i>';
        c.pl.innerHTML = h;
        el = [...c.pl.querySelectorAll('.r')]; gh = [...c.pl.querySelectorAll('.g')]; rings = [...c.pl.querySelectorAll('.ring')];
        snap = ECHO.map((te) => voice.at(te).h);                 // hauteur des barres à chaque crête
      }
      function box(e, x, y, w, h, o, bw) {
        e.style.width = w.toFixed(1) + 'px'; e.style.height = h.toFixed(1) + 'px';
        e.style.transform = `translate(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px)`;
        e.style.opacity = o; if (bw != null) e.style.borderWidth = bw.toFixed(1) + 'px';
      }
      function render(t, c) {
        const m = voice.at(t);
        // échos
        ECHO.forEach((te, s) => {
          const k = prog(t, te, te + ECHO_D), ke = E.sortie(k);
          for (let i = 0; i < 3; i++) {
            const g = gh[s * 3 + i];
            if (k <= 0 || k >= 1) { g.style.opacity = 0; continue; }
            box(g, V.X(c.cx, i), c.cy, V.W * (1 + 0.45 * ke), snap[s][i] * (1 + 0.9 * ke), (0.85 * (1 - k) * (1 - k)).toFixed(3));
          }
        });
        // temps appuyé : gonflement, puis les barres se résorbent dans l'onde
        const beat = spring(prog(t, 625, 905), .32, 15);         // 0 → 1 avec dépassement
        const sc = 1 + 0.32 * beat;
        const out = E.in(prog(t, 690, 770));
        el.forEach((e, i) => {
          const ap = 20 + [30, 0, 60][i];
          const ks = spring(prog(t, ap, ap + 260), .5, 16);
          const kg = spring(prog(t, ap + 70, ap + 380), .55, 13);
          const x = c.cx + (V.X(c.cx, i) - c.cx) * sc * (1 + 0.6 * out);
          const w = V.W * ks * (1 + 0.15 * beat) * (1 - out);
          const h = lerp(V.W, m.h[i], kg) * ks * sc * (1 + 0.8 * out) * (1 - out);
          put(e, x, c.cy, w, h);
        });
        // onde tricolore : trois bandes carrées contiguës (orange dehors, bleu, vert dedans) qui partent du centre
        const M = Math.max(c.vw, c.vh), bOf = (R) => 6 + R * 0.075;
        const RMAX = (M / 2 + 12) / (1 - 3 * 0.075) + 40;
        const kr = Math.pow(prog(t, 715, 990), 2.1);              // l'onde accélère en s'éloignant
        const R = lerp(64, RMAX, kr), b = bOf(R);
        rings.forEach((r, j) => {
          if (t < 715) { r.style.opacity = 0; return; }
          const s = 2 * (R - j * b);
          box(r, c.cx, c.cy, s, s, 1, b);
        });
        // ouverture : l'intérieur de la bande verte devient une fenêtre sur l'appli
        const inner = t < 715 ? 0 : Math.max(0, R - 3 * b);
        const hs = inner * E.sortie(prog(t, 790, 900));
        if (hs > 0.5) {
          const x0 = c.cx - hs, y0 = c.cy - hs, x1 = c.cx + hs, y1 = c.cy + hs;
          c.pl.style.clipPath = `path(evenodd,"M-10 -10H${c.vw + 10}V${c.vh + 10}H-10Z M${x0.toFixed(1)} ${y0.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}H${x0.toFixed(1)}Z")`;
        } else c.pl.style.clipPath = '';
      }
      function reducedLayout(c) {
        gh.concat(rings).forEach((g) => (g.style.opacity = 0));
        el.forEach((e, i) => put(e, V.X(c.cx, i), c.cy, V.W, V.REST[i]));
      }
      return { DUR: 1000, APP_AT: 790, setup, render, reducedLayout };
    })();
```

Note A2 : le lanceur doit aussi remettre `pl.style.clipPath = ''` s'il rejoue (sans objet dans app.html, joué une seule fois).

### A3 · Du micro au texte

```css
#preload .pn{position:absolute;left:0;right:0;background:var(--fond);will-change:transform}
#preload .s{position:absolute;left:0;top:0;width:100px;height:100px;transform-origin:50% 50%;will-change:transform,opacity}
```

```js
    const P = (function () {
      /* A3 · Du micro au texte
         0–200   trois carrés apparaissent et prennent la silhouette de repos du logo
         200–600 les barres parlent ; toutes les 33 ms (cadence du micro) le niveau s'imprime à gauche :
                 une forme d'onde tricolore qui défile vers la gauche, comme une ligne de temps
         560–760 la voix devient ligne : barres et onde s'aplatissent, les barres s'étirent en un trait
                 orange · bleu · vert sur toute la largeur
         770–980 le trait s'ouvre comme une fente : le haut monte, le bas descend → l'appli apparaît */
      const V = VOICE;
      const voice = V.bake([
        { at: 215, p: 0.82, a: 30, hold: 25, tau: 30 },
        { at: 365, p: 0.95, a: 30, hold: 30, tau: 30 },
        { at: 515, p: 0.88, a: 30, hold: 40, tau: 50 },
      ], 1000, 3);
      const L = 6;                                    // demi-épaisseur du trait final
      const T0 = 165, T1 = 560;                       // fenêtre d'impression de l'onde
      const PITCH = 17, SW = 10, SPEED = PITCH / (1000 / 30);   // 1 tranche par palier micro
      const CLS = ['o', 'b', 'v'];
      let el = [], cp = [], st = [], pnT, pnB, stamps = [];
      function setup(c) {
        stamps = [];
        for (let te = T0; te <= T1; te += 1000 / 30) stamps.push({ te, h: 2 * L + 150 * Math.pow(voice.at(te).target, 0.6) });   // niveau brut du palier, comme une piste audio
        let h = '<div class="pn"></div><div class="pn"></div>';
        stamps.forEach((s, k) => (h += `<i class="s ${CLS[(stamps.length - 1 - k) % 3]}"></i>`));
        h += '<i class="r o"></i><i class="r b"></i><i class="r v"></i><i class="r o"></i><i class="r b"></i><i class="r v"></i>';
        c.pl.innerHTML = h;
        [pnT, pnB] = c.pl.querySelectorAll('.pn');
        const r = [...c.pl.querySelectorAll('.r')]; el = r.slice(0, 3); cp = r.slice(3);
        st = [...c.pl.querySelectorAll('.s')];
      }
      function render(t, c) {
        const m = voice.at(t);
        const kf = E.snap(prog(t, 560, 690));                    // aplatissement
        const ksp = E.rideau(prog(t, 600, 765));                 // étirement en trait
        const off = (c.vh / 2 + 2 * L + 4) * E.rideau(prog(t, 775, 975));   // ouverture de la fente
        const cols = c.vw / 3;
        // panneaux (le fond qui se fend)
        c.pl.style.background = 'transparent';
        pnT.style.top = '0'; pnT.style.height = (c.cy + 1) + 'px'; pnT.style.transform = `translateY(${(-off).toFixed(1)}px)`;
        pnB.style.top = (c.cy - 1) + 'px'; pnB.style.height = (c.vh - c.cy + 1) + 'px'; pnB.style.transform = `translateY(${off.toFixed(1)}px)`;
        // onde imprimée qui défile
        const left0 = V.X(c.cx, 0) - V.W / 2 - 18 - SW / 2;
        stamps.forEach((s, k) => {
          const e = st[k];
          if (t < s.te) { e.style.opacity = 0; return; }
          const age = t - s.te;
          const pop = E.sortie(prog(age, 0, 90));
          let x = left0 - age * SPEED - (t > 560 ? (t - 560) * (t - 560) * 0.004 : 0);
          let h = lerp(L * 2, s.h, pop) * (1 - kf) + L * 2 * kf;
          const fade = clamp(1 - (left0 - x) / (c.vw * 0.42)) * (1 - E.ease(prog(t, 680, 780)));
          put(e, x, c.cy, SW * (1 + 0.6 * ksp), h, 0, fade.toFixed(3));
        });
        // barres vivantes → trait
        el.forEach((e, i) => {
          const ap = 20 + [30, 0, 60][i];
          const ks = spring(prog(t, ap, ap + 260), .5, 16);
          const kg = spring(prog(t, ap + 70, ap + 380), .55, 13);
          let x = V.X(c.cx, i), w = V.W * ks;
          let h = lerp(V.W, m.h[i], kg) * ks;
          h = lerp(h, 2 * L, kf);
          x = lerp(x, cols * i + cols / 2, ksp); w = lerp(w, cols + 1, ksp);
          if (t < 775) { put(e, x, c.cy, w, h); cp[i].style.opacity = 0; }
          else {                                                  // le trait se dédouble : une moitié par lèvre
            put(e, x, c.cy - L / 2 - off, w, L);
            put(cp[i], x, c.cy + L / 2 + off, w, L);
          }
        });
      }
      function reducedLayout(c) {
        st.forEach((e) => (e.style.opacity = 0)); cp.forEach((e) => (e.style.opacity = 0));
        c.pl.style.background = '';
        el.forEach((e, i) => put(e, V.X(c.cx, i), c.cy, V.W, V.REST[i]));
      }
      return { DUR: 1000, APP_AT: 790, setup, render, reducedLayout };
    })();
```

Note A3 : `clamp` est déjà fourni par les outils de mouvement du bloc A. Le fond de `#preload` devient transparent dès la 1re image : ce sont les deux panneaux `.pn` qui couvrent l'appli puis se fendent.

Planches (une image toutes les 50 ms) : `frames/filmstrip-a1.png`, `filmstrip-a2.png`, `filmstrip-a3.png` (et `-dark`).

## Notes
- **Réduire les animations** : app.html saute déjà tout le préchargement (`pre = false` dans `<head>`), conforme à DESIGN.md §6. Les pages de démo montrent l'alternative possible (barres statiques 450 ms puis fondu 200 ms, `?reduced=1`), à n'adopter que si l'on veut un écran de marque même en mouvement réduit.
- **Thème** : couleurs lues dans les variables CSS au démarrage (`--fond`, `--texte`, `--orange`, `--bleu`, `--vert`), donc clair et sombre sont gérés sans code supplémentaire.
- **Performance** : A et B n'animent que `transform` / `opacity` (et `clip-path` pour la fin de B) ; C dessine un seul canvas. Pas de mise en page pendant l'animation.
- **DESIGN.md §6** indique « ≤ 900 ms » et « cinq barres → logo → mot-symbole » : à mettre à jour en « 1000 ms, trois barres, sans texte » une fois la proposition choisie.
- **Tester** : `app.html?preload=1` force le préchargement même si la session l'a déjà vu.

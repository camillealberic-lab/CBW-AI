/* CBW AI — pont factice du mode Brainstorm (démo / captures). Simule tout le parcours du contrat
   docs/APP_API.md › Brainstorm v2 : vidage en direct (la grille se remplit, de petites questions arrivent
   et se résolvent « à la voix ») → arrêt → compilation directe. askMore rouvre l'ancien flux de questions.
   Usage : Object.assign(api, window.CBWBrainstormFake.create()) */
(function () {
  'use strict';
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var KEYS = ['contexte', 'role', 'action', 'format', 'cible', 'contraintes', 'criteres', 'exemples'];

  var SLOTS = {
    contexte: { value: 'Studio de yoga à Bordeaux (2 salles, 14 cours/semaine). Réservations aujourd’hui par Instagram et SMS, beaucoup d’oublis.', status: 'ok' },
    role: { value: 'Développeur full-stack senior, à l’aise avec Next.js et Supabase.', status: 'partiel' },
    action: { value: 'Construire une appli web de réservation de cours : planning, inscription, liste d’attente, rappels.', status: 'ok' },
    format: { value: '', status: 'vide' },
    cible: { value: 'Élèves du studio, souvent sur mobile ; la gérante sans compétence technique.', status: 'partiel' },
    contraintes: { value: 'Budget zéro en hébergement, RGPD, pas d’app native.', status: 'partiel' },
    criteres: { value: '', status: 'vide' },
    exemples: { value: '', status: 'vide' }
  };
  var QUESTIONS = [
    { id: 'q1', slot: 'format', question: 'Tu veux que Claude Code livre quoi en premier ?', why: 'Sans livrable précis, il risque de tout coder d’un coup au lieu d’avancer par étapes.', suggestions: ['Un plan + l’arborescence', 'Le MVP complet', 'Seulement le planning'] },
    { id: 'q2', slot: 'criteres', question: 'À quoi verras-tu que c’est réussi ?', why: 'Un critère mesurable devient la checklist de fin de tâche.', suggestions: ['Réserver en moins de 30 s', 'Zéro double réservation', 'La gérante gère seule'] },
    { id: 'q3', slot: 'role', question: 'La stack est-elle imposée ou libre ?', why: 'Tu as cité Supabase une fois, sans dire si c’est un choix ferme.', suggestions: ['Next.js + Supabase', 'Libre, propose', 'Ce qui existe déjà'] },
    { id: 'q4', slot: 'cible', question: 'Quel ton pour les messages aux élèves ?', why: 'Les rappels et e-mails parleront au nom du studio.', suggestions: ['Chaleureux, tutoiement', 'Sobre, vouvoiement'] },
    { id: 'q5', slot: 'exemples', question: 'Une appli dont il faut s’inspirer ?', why: 'Une référence évite dix lignes de description.', suggestions: [] }
  ];
  // Scénario du direct : une étape toutes les ~4,5 s (les premières sont jouées d'un coup si startMs > 0).
  function V(k) { return SLOTS[k].value; }
  var LIVE = [
    { slot: { contexte: ['Studio de yoga à Bordeaux (2 salles, 14 cours/semaine).', 'partiel'] } },
    { ask: ['x1', 'contexte', 'Le studio a déjà un site web ?', ['Oui, une vitrine', 'Non, rien']] },
    { ask: ['a', 'cible', 'Tes élèves réservent surtout depuis leur téléphone ?', ['Oui, mobile d’abord', 'Mobile et ordi']] },
    { slot: { action: [V('action'), 'ok'], role: ['Développeur full-stack.', 'partiel'] }, dismiss: 'x1' },
    { ask: ['b', 'contraintes', 'Un budget d’hébergement à respecter ?', ['Gratuit', 'Moins de 10 €/mois']] },
    { answer: ['a', 'Oui, surtout sur mobile, en sortant du cours.'], slot: { cible: [V('cible'), 'partiel'] } },
    { ask: ['c', 'role', 'La stack est imposée, ou Claude Code peut proposer ?', ['Next.js + Supabase', 'Libre, propose']] },
    { answer: ['b', 'Zéro euro : hébergement gratuit.'], slot: { contraintes: [V('contraintes'), 'partiel'], contexte: [V('contexte'), 'ok'] } },
    { ask: ['d', 'format', 'Tu veux d’abord un plan, ou du code tout de suite ?', ['Un plan d’abord', 'Le MVP direct']] },
    { answer: ['c', 'Next.js + Supabase, c’est décidé.'], slot: { role: [V('role'), 'ok'] } },
    { ask: ['e', 'criteres', 'À quoi verras-tu que c’est réussi ?', ['Réserver en moins de 30 s', 'Zéro double réservation', 'La gérante gère seule']] },
    { ask: ['f', 'exemples', 'Une appli dont il faut s’inspirer pour le planning ?', []] },
    { answer: ['d', 'Un plan et l’arborescence d’abord.'], slot: { format: ['Plan d’abord, puis étapes avec commits.', 'ok'] } },
    { answer: ['e', 'Une élève réserve en moins de 30 secondes.'], slot: { criteres: ['Réservation en moins de 30 s.', 'partiel'] } }
  ];
  function applyLive(b, ev, at) {
    if (ev.slot) Object.keys(ev.slot).forEach(function (k) { b.slots[k] = { value: ev.slot[k][0], status: ev.slot[k][1] }; });
    if (ev.ask) b.live.push({ id: 'q' + ev.ask[0], slot: ev.ask[1], question: ev.ask[2], suggestions: ev.ask[3].slice(), state: 'open', askedAt: at });
    b.live.forEach(function (q) {
      if (q.state !== 'open') return;
      if (ev.answer && q.id === 'q' + ev.answer[0]) { q.state = 'answered'; q.answer = ev.answer[1]; }
      if (ev.dismiss && q.id === 'q' + ev.dismiss) q.state = 'dismissed';
    });
  }

  var MORE = { id: 'q6', slot: 'contraintes', question: 'Paiement en ligne dès la première version ?', why: 'Ça change l’architecture (Stripe, remboursements).', suggestions: ['Non, plus tard', 'Oui, avec Stripe'] };

  function promptFor(b) {
    var cc = b.target !== 'cursor';
    return [
      '# Master prompt — ' + b.title,
      '',
      '<role>',
      'Tu es un développeur full-stack senior (Next.js, Supabase). Tu travailles par petites étapes vérifiables.',
      '</role>',
      '',
      '<context>',
      'Je gère un studio de yoga à Bordeaux : 2 salles, 14 cours par semaine. Les réservations passent aujourd’hui par Instagram et SMS, et on perd des élèves à cause des oublis. Je veux une appli web simple que mes élèves utilisent sur leur téléphone.',
      '</context>',
      '',
      '## Tâche',
      '1. Propose un **plan** et l’arborescence du projet, puis attends ma validation.',
      '2. Construis le planning hebdomadaire des cours.',
      '3. Ajoute l’inscription, la liste d’attente et les rappels (e-mail la veille).',
      '4. Un espace gérante pour créer et annuler des cours, **sans compétence technique**.',
      '',
      '## Cible & ton',
      '- Élèves sur mobile, gérante non technique.',
      '- Messages chaleureux, au tutoiement.',
      '',
      '## Contraintes',
      '- Stack : Next.js + Supabase. Hébergement gratuit (Vercel).',
      '- RGPD : données minimales, suppression du compte possible.',
      '- Pas d’app native.',
      '',
      '## Format de sortie',
      cc ? '- Travaille dans le dépôt : commits petits et nommés, `README.md` à jour.' : '- Modifie les fichiers du projet ouvert dans Cursor ; explique chaque changement en 2 lignes.',
      '- Un résumé de ce qui marche et de ce qui reste à la fin de chaque étape.',
      '',
      '## Critères de réussite',
      '- Une élève réserve un cours en moins de 30 secondes.',
      '- Zéro double réservation, même à deux en même temps.',
      '',
      '## Points ouverts',
      'Avant de commencer, pose-moi tes questions sur : le paiement en ligne, les exemples d’applis à imiter.'
    ].join('\n');
  }

  function create(opts) {
    opts = opts || {};
    var cbs = [], sessions = [], sim = null;
    var now = Date.now();
    function emit(b) { var c = clone(b); cbs.forEach(function (cb) { cb(c); }); }
    function find(id) { return sessions.filter(function (s) { return s.id === id; })[0]; }
    function done(id, title, ago, target) {
      var b = { id: id, title: title, createdAt: new Date(now - ago).toISOString(), target: target, state: 'done', transcript: 'Alors l’idée c’est une appli de réservation pour le studio…',
        slots: clone(SLOTS), questions: clone(QUESTIONS), answers: { q1: 'Un plan + l’arborescence', q2: 'Réserver en moins de 30 s', q3: 'Next.js + Supabase', q4: 'Chaleureux, tutoiement', q5: '' } };
      KEYS.forEach(function (k) { if (k !== 'exemples') b.slots[k].status = 'ok'; });
      b.slots.format.value = 'Plan d’abord, puis étapes avec commits.'; b.slots.criteres.value = 'Réservation < 30 s, zéro doublon.';
      b.live = [];
      LIVE.forEach(function (ev, i) { applyLive({ slots: {}, live: b.live }, ev, now - ago - 300e3 + i * 18e3); });
      b.questions = []; b.answers = {};
      b.prompt = promptFor(b); b.path = '~/Documents/CBW AI/Prompts/2026-10-0' + (8 - Math.round(ago / 864e5)) + ' 10h12 — ' + title + '.md';
      return b;
    }
    if (!opts.empty) {
      sessions.push(done('b3', 'Appli de réservation — studio de yoga', 3 * 36e5, 'claude-code'));
      var q = done('b2', 'Refonte du site portfolio', 26 * 36e5, 'cursor'); q.state = 'questions'; q.questions = clone(QUESTIONS); q.answers = { q1: 'Le MVP complet' }; delete q.prompt; sessions.push(q);
      sessions.push(done('b1', 'Script <img src=x onerror=alert(1)> d’export Notion', 5 * 864e5, 'claude-code'));
    }

    function liveSet(id, qid, patch) {
      var b = find(id); if (!b) return Promise.reject(new Error('Session introuvable'));
      (b.live || []).forEach(function (q) { if (q.id === qid) Object.assign(q, patch); });
      return wait(80).then(function () { if (!sim || sim.b !== b) emit(b); });   // pendant le vidage, le tic suivant pousse l'état
    }
    var api = {
      onBrainstorm: function (cb) { cbs.push(cb); },
      startBrainstorm: function (target) {
        var t0 = Date.now() - (opts.startMs || 0);
        var b = { id: 'b' + Date.now(), title: 'Appli de réservation — studio de yoga', createdAt: new Date(t0).toISOString(), target: target || 'claude-code', state: 'recording', transcript: '', slots: {}, questions: [], answers: {}, live: [] };
        sessions.unshift(b);
        sim = { b: b, t0: t0, words: Math.round((opts.startMs || 0) / 1000 * 2.4), ev: 0, nextAt: Date.now() + 2500 };
        // reprise en cours de session (captures) : les premières étapes sont déjà jouées
        var pre = opts.startMs ? Math.min(LIVE.length, opts.preEvents == null ? 10 : opts.preEvents) : 0;
        for (; sim.ev < pre; sim.ev++) applyLive(b, LIVE[sim.ev], t0 + (sim.ev + 1) * (opts.startMs - 20e3) / (pre + 1));
        sim.timer = setInterval(function () {
          if (sim.ev < LIVE.length && Date.now() >= sim.nextAt) { applyLive(sim.b, LIVE[sim.ev++], Date.now()); sim.nextAt = Date.now() + 4200 + Math.random() * 1600; }
          if (Math.random() < .5) sim.words += Math.round(Math.random() * 3);
          var talk = Math.sin(Date.now() / 700) > -.3;
          var e = clone(sim.b); e.elapsedMs = Date.now() - sim.t0; e.words = sim.words; e.level = talk ? .35 + Math.random() * .6 : Math.random() * .08;
          cbs.forEach(function (cb) { cb(e); });
        }, 120);
        emit(b);
        return Promise.resolve();
      },
      stopBrainstorm: function () {
        if (!sim) return Promise.resolve();
        clearInterval(sim.timer); var b = sim.b; sim = null;
        b.state = 'compiling'; b.transcript = 'Alors l’idée c’est une appli de réservation pour mon studio de yoga à Bordeaux, deux salles, quatorze cours par semaine… aujourd’hui tout passe par Instagram et SMS…';
        KEYS.forEach(function (k) { if (!b.slots[k]) b.slots[k] = clone(SLOTS[k]); });
        emit(b);
        wait(2600).then(function () { b.prompt = promptFor(b); b.path = '~/Documents/CBW AI/Prompts/2026-10-09 14h05 — ' + b.title + '.md'; b.state = 'done'; emit(b); });
        return Promise.resolve();
      },
      cancelBrainstorm: function () { if (sim) { clearInterval(sim.timer); sessions = sessions.filter(function (s) { return s !== sim.b; }); } sim = null; return Promise.resolve(); },
      answerBrainstorm: function (id, qid, ans) {
        var b = find(id); if (!b) return Promise.reject(new Error('Session introuvable'));
        b.answers[qid] = ans;
        var q = b.questions.filter(function (x) { return x.id === qid; })[0];
        return wait(450).then(function () {
          if (q && ans) { var s = b.slots[q.slot] || { value: '', status: 'vide' }; s.value = s.value ? s.value + ' ' + ans : ans; s.status = 'ok'; b.slots[q.slot] = s; }
          emit(b);
        });
      },
      answerLive: function (id, qid, ans) { return liveSet(id, qid, { state: 'answered', answer: ans }); },
      dismissLive: function (id, qid) { return liveSet(id, qid, { state: 'dismissed' }); },
      askMore: function (id) {
        var b = find(id); b.state = 'analyzing'; b.questions = b.questions || []; emit(b);
        return wait(1600).then(function () { if (!b.questions.some(function (q) { return q.id === MORE.id; })) b.questions.push(clone(MORE)); b.state = 'questions'; emit(b); });
      },
      compileBrainstorm: function (id, target) {
        var b = find(id); b.target = target || b.target; b.state = 'compiling'; emit(b);
        return wait(2200).then(function () { b.prompt = promptFor(b); b.path = '~/Documents/CBW AI/Prompts/2026-10-08 14h05 — ' + b.title + '.md'; b.state = 'done'; emit(b); });
      },
      listBrainstorms: function () { return wait(100).then(function () { return sessions.map(function (s) { return { id: s.id, title: s.title, createdAt: s.createdAt, state: s.state, target: s.target }; }); }); },
      getBrainstorm: function (id) { return wait(60).then(function () { var b = find(id); if (!b) throw new Error('Session introuvable'); return clone(b); }); },
      copyBrainstormPrompt: function (id) { var b = find(id); return navigator.clipboard ? navigator.clipboard.writeText(b.prompt || '').catch(function () {}) : Promise.resolve(); },
      revealBrainstorm: function () { return Promise.resolve(); },
      deleteBrainstorm: function (id) { sessions = sessions.filter(function (s) { return s.id !== id; }); return Promise.resolve(); },
      _sessions: function () { return sessions; }
    };
    return api;
  }
  window.CBWBrainstormFake = { create: create };
})();

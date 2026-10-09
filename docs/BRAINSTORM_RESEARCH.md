# Mode « Brainstorm → master prompt » : recherche et concepts (8 octobre 2026)

Objectif : dans CBW AI, je brainstorme **à la voix**, l'app m'aide à clarifier mon idée, puis elle génère un **master prompt** structuré en **CRAFT**, prêt à coller dans ChatGPT, Claude, Cursor, etc.

Ce document est une étude. Aucun code n'a été modifié. Il réutilise le contexte de `docs/SPEC.md`, `docs/APP_API.md`, `docs/FREE_LLMS.md`, `src/llm/notes.ts` et `design/cbw/DESIGN.md`.

> **Tension à trancher dès le départ.** La règle de CBW AI est « correcteur, pas co-auteur, ne rien inventer » (SPEC). Un brainstorm, c'est en partie de la co-création. Ce document reste fidèle à la règle : l'IA **pose des questions** et **reformule**, elle n'invente pas de contenu. Si on veut qu'elle *propose* des idées, il faut une option explicite, avec des propositions marquées et validées une à une. Voir la question Q6 au §6.

---

## 1. Les frameworks de prompt

### 1.1 CRAFT : il n'existe pas UNE version officielle
Le sigle n'est pas standardisé. Aucune source ne donne d'auteur d'origine. Voici les variantes trouvées :

| Variante | C | R | A | F | T | Sources |
|---|---|---|---|---|---|---|
| **Marketing / créa** | Context | Role | Action | Format | **Target audience** | [PromptQuorum – CRAFT](https://www.promptquorum.com/prompt-engineering/craft-framework) (exemple d'un post LinkedIn de lancement) |
| **Business (la plus courante)** | Context | Role | Action | Format | **Tone** | [Ecosire – Prompt engineering business guide](https://ecosire.com/blog/prompt-engineering-business-guide), [Solopreneur Code](https://solopreneurcode.substack.com/p/the-craft-method-a-foolproof-guide-to-writing-prompts), [SCAI Hub – CRAFT model](https://sites.google.com/view/scaihub/ai-prompting/prompting-frameworks/craft-model) |
| **Éducation** | Context | Role | **Audience** | Format | Tone | [Univ. of Kentucky – CRAFT for teachers](https://scholars.uky.edu/en/publications/craft-prompt-generation-framework-for-teachers/) |
| **Académique, à 6 éléments** | Context | Role | Action/Task | Format | Tone/Steps/**Constraints** (+ Creative direction) | [IJIRSS 2025](https://ideas.repec.org/a/aac/ijirss/v8y2025i5p1651-1664id9229.html) (annonce +18 à 47 % de qualité, méthode non vérifiée) |
| **Version « tech »** | Context & Role | Request & Reason | Augment | Format & Fences | Trust boundaries | [CRAFT for tech professionals](https://rss.boorghani.com/?p=413590) |
| Cousin | CRAFTING AI (Register, Task, « ce que l'IA ne doit pas faire ») | | | | | [First Line Software](https://careers.firstlinesoftware.com/spotlights/the-crafting-ai-prompts-framework-for-qas-part-i) |

PromptQuorum présente CRAFT comme bon pour le marketing, la rédaction, la création et les tâches où un persona expert aide. Il le juge moins adapté quand il faut séparer finement le ton et le style (CO-STAR), pour des procédures étape par étape (RISEN) et quand les exemples sont le signal principal.

**Recommandation pour CBW AI : « CRAFT+ ».** Les 5 lettres visibles, avec **T = Cible ET Ton** (les deux variantes principales réunies), plus 4 champs annexes qui viennent des guides officiels (§1.3) :

| Champ | Question à laquelle il répond | Obligatoire ? |
|---|---|---|
| **C · Contexte** | Projet, situation, ce qui existe déjà, pourquoi maintenant | oui |
| **R · Rôle** | Quel expert l'IA doit incarner | oui (peut être déduit de l'action, à confirmer) |
| **A · Action** | La tâche précise, avec un verbe concret et le livrable | oui |
| **F · Format** | Forme, longueur, structure, langue de la réponse | oui |
| **T · Cible & ton** | Pour qui, avec quel niveau et quel registre | oui |
| + Contraintes | À faire, à éviter, budget, délais, outils imposés | conseillé |
| + Critères de réussite | « C'est réussi si… » | conseillé |
| + Exemples et références | Modèles, concurrents, textes à imiter, données | optionnel |
| + Points ouverts | Ce qui n'a pas été tranché | auto (rempli par l'IA) |

### 1.2 Frameworks proches (pour les gabarits et pour un réglage avancé)

| Sigle | Développement | Usage typique | Source |
|---|---|---|---|
| **CO-STAR** | Context, Objective, Style, Tone, Audience, Response | Communication, marketing. Standard interne de GovTech Singapour (concours 2023) | [GovTech – Empower](https://www.tech.gov.sg/media/technews/mastering-the-art-of-prompt-engineering-with-empower), [vier.ai](https://www.vier.ai/en/company/blog/prompting-co-star) |
| **RISEN** | Role, Instructions, Steps, End goal, Narrowing (d'autres versions existent : Input/Expectation, ou Intention/Scenario/Notation) | Procédures, processus | [SurePrompts](https://sureprompts.com/blog/ai-prompt-frameworks), [PromptQuorum](https://www.promptquorum.com/blog/prompt-frameworks) |
| **RTF** | Role, Task, Format | Prompt rapide | [PromptQuorum](https://www.promptquorum.com/blog/prompt-frameworks) |
| **TAG** | Task, Action, Goal | Tâches simples | [ButterCMS](https://buttercms.com/blog/chatgpt-prompt-frameworks/) |
| **RACE** | Role, Action, Context, Expectation (ou Examples) | Généraliste | [ButterCMS](https://buttercms.com/blog/chatgpt-prompt-frameworks/), [WVSOM](https://www.wvsom.edu/node/1344) |
| **APE** | Action, Parameter, Example | Tâche ciblée | [PromptQuorum](https://www.promptquorum.com/blog/prompt-frameworks) |
| **CREATE** | Character, Request, Examples, Adjustments, Type of output, Extras (attribué à Dave Birss, de mémoire et **non confirmé** par la recherche) | Rédaction | — |

Point de vigilance : un banc d'essai de 2025, relayé par les sources ci-dessus, trouve que certains sigles (TAG, STAR) font *moins bien* qu'un prompt simple et clair. Les sigles servent de **check-list de couverture**, pas de formule magique. C'est un argument pour notre approche : CRAFT sert à savoir **quelles questions poser**, et le prompt final suit les bonnes pratiques officielles.

### 1.3 Ce que contient un bon master prompt en 2026 (guides officiels)

**Anthropic** ([Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)) :
- **Clair et direct.** Traiter le modèle comme *« a brilliant but new employee who lacks context »*. La règle d'or : *« Show your prompt to a colleague with minimal context… If they'd be confused, Claude will be too. »*
- **Expliquer le pourquoi** des consignes : le modèle généralise à partir de l'explication.
- **Exemples** : 3 à 5, pertinents, variés, entre balises `<example>`.
- **Balises XML** (`<instructions>`, `<context>`, `<input>`) dès que le prompt mélange consignes, contexte, exemples et données.
- **Rôle** dans le prompt système : une phrase suffit déjà.
- **Long contexte** : les documents en haut, la question en bas (jusqu'à +30 % de qualité selon Anthropic).
- **Format** : dire quoi faire plutôt que quoi ne pas faire.
- Côté outils : le **prompt generator** et le **prompt improver** de la Console produisent des gabarits avec des `{{variables}}` ([prompt generator](https://platform.claude.com/docs/en/prompt-generator), [prompting tools](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools), [templates & variables](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompt-templates-and-variables)).
- Côté Claude Code : le motif « **Let Claude interview you** », où Claude pose ses questions avec `AskUserQuestion` jusqu'à tout couvrir, puis écrit une spec ([Best practices Claude Code](https://code.claude.com/docs/en/best-practices)). C'est exactement le motif de notre fonctionnalité.

**OpenAI** ([Prompt engineering guide](https://developers.openai.com/api/docs/guides/prompt-engineering)) : le message développeur suit l'ordre **Identity → Instructions → Examples → Context** (contexte plutôt en fin). Le Markdown sert à la hiérarchie, le XML à délimiter les contenus, et les attributs XML portent des métadonnées (`id="example-1"`).

**Synthèse : squelette du master prompt CBW AI**
1. Rôle (R)
2. Contexte et objectif (C), en expliquant le pourquoi
3. Tâche (A), en étapes numérotées si l'ordre compte
4. Cible et ton (T)
5. Contraintes
6. Format de sortie (F)
7. Critères de réussite
8. Exemples et références (s'il y en a)
9. **Points ouverts** : ce qui n'a pas été tranché devient une consigne pour l'IA cible, du type « avant de commencer, pose-moi des questions sur… ». Ça reste fidèle : on n'invente pas, on délègue la question.

---

## 2. L'existant : produits et motifs d'interface

### 2.1 Produits
| Produit | Ce qu'il fait | Ce qu'on en retient |
|---|---|---|
| **Console Anthropic** : prompt generator et prompt improver | Une description de tâche donne un prompt structuré, avec variables et chaîne de raisonnement | Le compilateur final. Pas de voix, pas d'entretien |
| **Claude Code** : `AskUserQuestion` / « interview me » | 1 à 4 questions à choix multiple par tour, rendues en boutons, puis une spec écrite dans un fichier ([guide](https://www.atcyrus.com/stories/claude-code-ask-user-question-tool-guide), [VelvetShark](https://velvetshark.com/stop-prompting-claude-code-let-it-interview-you)) | **Questions à choix cliquables** et entretien jusqu'à couverture complète. Les questions doivent creuser les points difficiles, pas l'évident |
| Technique « fais-moi passer un entretien » | « Pose-moi jusqu'à 5 questions, une à la fois, avant de répondre » ([graduateschool.edu](https://www.graduateschool.edu/learn/ai/you-ask-me-technique), [slashai](https://slashai.lovable.app/r/tip-ai-ask-for-questions), [Funmentum](https://funmentum.substack.com/p/interview-me-firstai-as-a-creative)) | Plafonner le nombre de questions. Une question à la fois. Pas de rédaction avant la fin |
| Extensions « prompt enhancer » (Prompt Pro, Prompt Genie, Promptr, AIPRM…) | Réécrivent un prompt tapé en « rôle, contexte, format » directement dans ChatGPT ou Claude ([Chrome Web Store](https://chromewebstore.google.com/detail/fmdkfimgcpkjcibklbachcnknllgoaaj), [Prompt Genie](https://nemovideo.com/alternative/prompt-genie)) | Une réécriture en un coup, sans questions, donc avec des inventions. **Notre différence : entretien vocal et fidélité** |
| **Wispr Flow** | Dictée, *Command Mode* (payant : « rends ça plus amical »), snippets, onglet Notes, et depuis août 2026 un Notetaker de réunions ([docs Wispr](https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android), [tl;dv](https://tldv.io/blog/wisprflow/)) | **Aucun mode « prompt builder » trouvé.** C'est un créneau libre pour CBW AI |
| Apps « vide-tête vocal » (AudioPen, Voicenotes, Idea Clear, Ideashell, VoicePal) | Une parole décousue devient une note structurée. Idea Clear tourne sur l'appareil, avec analyse du problème et score de qualité ([App Store](https://apps.apple.com/ee/app/idea-clear/id6758003581), [comparatif Yaps](https://www.yaps.ai/pt-br/blog/7-melhores-alternativas-de-audiopen-2026-privado-e-offline.md)) | Le vide-tête libre marche bien à l'oral. Aucune ne produit un prompt CRAFT |
| Mind-mapping IA (Mapify, Whimsical, MindMap AI) | Une source (PDF, vidéo, prompt) devient une carte. Mapify existe en app dans ChatGPT ([Mapify](https://mapify.so/blog/mapify-conversation-mind-maps), [MindMap AI](https://mindmapai.app/blog/126/whimsical-alternatives)) | Visualiser l'état. Pas d'entretien vocal |
| Dialogflow (*slot filling*) | Paramètres obligatoires, avec une relance par paramètre manquant, une relance après chaque tour, et un webhook qui voit les champs déjà remplis ([Google Cloud](https://docs.cloud.google.com/dialogflow/docs/intents-actions-parameters), [webhook slot filling](https://docs.cloud.google.com/dialogflow/docs/fulfillment-webhook-slot-filling)) | **Notre boucle, c'est du slot filling piloté par un LLM** : état = cases CRAFT, question suivante = la case manquante la plus utile |

### 2.2 Motifs d'interface qui marchent (et choix pour CBW AI)
- **Questions guidées ou vide-tête libre.** À l'oral, le vide-tête est plus naturel au début, l'utilisateur a « tout dans la tête ». Les questions guidées servent à combler les trous. **Meilleur hybride : vide-tête, puis 2 à 6 questions ciblées.**
- **Une question à la fois**, courte, avec 2 à 4 **propositions cliquables** (« LinkedIn · Newsletter · Site ») et toujours « autre, je le dis ». La réponse se fait à la voix ou au clic.
- **Jauge de couverture par lettre CRAFT** : 5 grandes cases carrées C R A F T, chacune vide, partielle ou OK. On voit pourquoi l'IA pose sa question (« elle vise F »).
- **Aperçu en direct** du prompt en construction. Chaque case est modifiable à la main ou à la voix (« corrige le ton : plus direct »).
- **Contrôle utilisateur** : « passe », « c'est bon, génère », « reviens sur la cible ». La génération reste possible à tout moment ; les cases vides deviennent des points ouverts.
- **Versions** v1, v2… avec différences (on « affine » sans perdre l'original).
- **Export** : copier en Markdown, copier en XML, coller dans l'app active (réutilise `insert.ts`), enregistrer en `.md`. Les liens à pré-remplissage `chatgpt.com/?q=` et `claude.ai/new?q=` existent mais ne sont **pas documentés officiellement**, ils sont instables et limités vers 2 000 caractères ([u2l.ai](https://u2l.ai/tools/chatgpt-prompt-link-generator), [issue claude-code #8827](https://github.com/anthropics/claude-code/issues/8827)). Un master prompt dépasse souvent cette taille, donc : **copier + ouvrir l'app + coller**.
- **Gabarits par cas d'usage**. Chacun pré-active des questions spécifiques, sans pré-remplir de contenu :
  - Site web : pages, objectif de conversion, charte, stack
  - Campagne marketing : objectif SMART, canaux, budget, période, KPI
  - Post LinkedIn : angle, accroche, longueur, appel à l'action, hashtags
  - Code / app : stack, existant, entrées et sorties, tests, contraintes
  - Brief client communication
  - Étude de marché
  - Générique

---

## 3. Trois concepts pour CBW AI

Points communs :
- Une nouvelle entrée de navigation **« Brainstorm »** entre Notes et Dictionnaire.
- Le style CBW : coins carrés, filets de 2 px, Archivo condensé, JetBrains Mono pour les compteurs. Les couleurs gardent leur rôle : **orange = j'enregistre**, **bleu = l'IA réfléchit**, **vert = case validée ou prompt prêt**.
- Les fichiers vont dans `~/Documents/CBW AI/Brainstorms/AAAA-MM-JJ HHhMM — <titre>.md`, l'état et les versions dans `~/.dicta-ai/brainstorms/<id>.json`.

### Concept A : « L'Entretien » (questions guidées, mains libres)
1. Brainstorm › **Nouveau**. Je choisis un gabarit (ou « Générique ») et l'IA cible (ChatGPT, Claude, Cursor…).
2. Écran plein : en haut, la **grille C R A F T** (5 blocs carrés). Au centre, **la question en cours** en H2 (« Pour qui est ce post ? »), sous elle 2 à 4 propositions en boutons carrés. En bas, la transcription live de ma réponse.
3. Je réponds à la voix. Le mode mains libres réutilise le VAD des notes : un silence de 1,5 s, ou un appui sur Control, ferme ma réponse.
4. La pastille passe en bleu (« Brainstorm · réfléchit… »). Le LLM met les cases à jour, la case touchée clignote puis passe en vert ou en partiel, et la question suivante s'affiche. Cible de latence : moins de 2,5 s entre ma fin de phrase et la question suivante.
5. Quand les 5 cases obligatoires sont OK, ou que je dis « c'est bon, génère », la compilation se lance et le master prompt s'affiche (onglets Markdown / XML), avec les boutons Copier, Coller dans l'app active et Affiner.
- **Pastille** : `BRAIN · Q3/6 · F` + le niveau micro. On peut lancer le mode depuis la pastille et répondre sans ouvrir la fenêtre ; la question s'affiche alors dans une bulle au-dessus de la pastille.
- Avantages : très guidé, idéal quand l'idée est floue. Inconvénients : plus d'appels LLM (un par tour), et ça peut sembler scolaire.

### Concept B : « Vide-tête → trous » (recommandé pour le MVP)
1. **Phase 1, vide-tête** (1 à 10 min) : « Raconte-moi ton projet comme il vient. » On réutilise tel quel le pipeline des notes : enregistrement long, segments Whisper aux pauses, minuteur dans la pastille. Pendant ce temps, la grille CRAFT se remplit **en arrière-plan** toutes les 60 à 90 s, avec un appel d'extraction léger sur les nouveaux segments seulement. Je vois les lettres s'allumer pendant que je parle.
2. **Phase 2, trous** : à la fin, un seul appel d'**analyse des manques** produit au plus N questions (3 à 6), triées par impact. Elles s'affichent toutes, sous forme de cartes, avec des choix cliquables. Je réponds à la voix carte par carte, ou je passe.
3. **Phase 3, compilation**, puis le master prompt.
- Avantages : naturel à l'oral et économe en quotas (environ 3 + N appels par session au lieu de 15 à 20). On réutilise au maximum `notes.ts`. Inconvénients : moins conversationnel, et la qualité des questions dépend d'un seul appel d'analyse.

### Concept C : « L'Atelier » (canevas et aperçu live, pour affiner)
- Écran en deux colonnes. À gauche, **5 cartes CRAFT et 4 cartes annexes**, chacune modifiable. Je maintiens le raccourci **sur une carte** pour dicter dedans : la dictée est nettoyée puis reformulée dans cette case seulement. À droite, **l'aperçu live** du master prompt (Markdown ou XML), mis à jour à chaque modification sans LLM, par simple gabarit.
- Un bouton « Questions » ouvre une file de questions pour les cartes faibles (le concept A en mode panneau).
- Une **barre de versions** v1, v2, v3 avec différences, et « Dupliquer en gabarit » pour réutiliser une structure sur un autre projet.
- Avantages : contrôle total, parfait pour retravailler un prompt existant (on peut importer une note ou un prompt collé). Inconvénients : plus lourd à construire, moins « vocal pur ».

**Feuille de route proposée** : B pour le MVP (pipeline des notes plus 2 nouveaux prompts), puis l'aperçu et l'édition de cartes de C en v1.1, puis le mode pastille de A en v1.2.

### 3.1 La boucle LLM (commune aux trois concepts)
L'**état** est un objet JSON, envoyé à chaque tour **à la place de l'historique complet**. Ça garde le prompt court et stable, donc compatible avec le cache et avec le TPM de Groq.
```jsonc
{
  "gabarit": "post-linkedin",
  "cible_llm": "claude",
  "slots": {
    "contexte":   { "valeur": "…", "statut": "ok|partiel|vide", "preuves": ["citation exacte de l'utilisateur"] },
    "role":       { … }, "action": { … }, "format": { … }, "cible_ton": { … },
    "contraintes": { … }, "criteres": { … }, "exemples": { … }
  },
  "hypotheses": [ { "slot": "role", "proposition": "rédacteur B2B", "a_confirmer": true } ],
  "contradictions": [ "durée : « 2 semaines » puis « fin du mois »" ],
  "questions_posees": [ "…" ],
  "tour": 4
}
```
Déroulé d'un tour :
1. Je parle.
2. Whisper (segments) produit la transcription brute, puis `preClean()`. Pas de nettoyage LLM ici : l'interviewer s'en charge.
3. **Interviewer(état, dernière question, réponse)** renvoie un JSON `{ maj_slots, hypotheses, contradictions, prochaine_question{ texte, slot, pourquoi, options[] }, pret_a_compiler }`.
4. L'interface fusionne les mises à jour. Le code refuse toute valeur sans `preuves` : c'est un garde-fou contre l'invention.
5. On boucle jusqu'à `pret_a_compiler`, ou jusqu'à « génère ».
6. **Compilateur(état, transcription complète, cible_llm, langue)** renvoie le Markdown et la variante XML.

À prévoir côté code : un `complete()` dédié, calqué sur celui de `notes.ts`, avec un ordre de fournisseurs propre au brainstorm. Il faut aussi une sortie JSON robuste. Les adaptateurs actuels n'ont **pas de mode JSON** (`src/llm/providers/*`), donc il faut soit ajouter `response_format: {type:"json_object"}` (Groq, Mistral, OpenRouter) et `responseMimeType` (Gemini), soit parser avec tolérance et relancer une fois.

### 3.2 Brouillon du prompt système « Interviewer »
```text
Tu es l'intervieweur du mode « Brainstorm » de CBW AI.
Une personne réfléchit à voix haute pour préparer un prompt destiné à une IA ({{cible_llm}}). Ton seul travail : l'aider à clarifier SA demande en remplissant les cases CRAFT+, puis lui poser la question suivante la plus utile.

Tu reçois :
<etat> l'état JSON actuel des cases </etat>
<derniere_question> la question que tu as posée (vide au premier tour) </derniere_question>
<reponse> la transcription brute (reconnaissance vocale) de ce que la personne vient de dire </reponse>

Cases : contexte, role, action, format, cible_ton (obligatoires) ; contraintes, criteres, exemples (conseillées).

# Règles d'or
1. Tu n'inventes RIEN. Une case ne se remplit qu'avec ce que la personne a dit. Chaque valeur cite au moins une preuve (extrait exact de ses mots) dans "preuves".
2. Si tu déduis quelque chose qu'elle n'a pas dit (ex. un rôle évident), tu le mets dans "hypotheses" avec "a_confirmer": true, jamais directement dans la case.
3. Tu ne réponds pas à la demande, tu ne rédiges pas le contenu final, tu ne donnes pas de conseils.
4. Tu reformules sobrement, dans ses mots, en gardant chiffres, noms, dates, outils. Tu appliques les auto-corrections (« deux semaines, non trois » → trois semaines).
5. Une réponse peut remplir plusieurs cases : range chaque info à sa place, même si elle ne répond pas à la question posée.
6. Si deux informations se contredisent, signale-le dans "contradictions" et fais-en la prochaine question.

# Choix de la prochaine question
- Vise la case obligatoire vide ou partielle qui aura le plus d'impact sur la qualité du prompt (en général : action > cible_ton > contexte > format > role).
- UNE seule question, courte (≤ 20 mots), orale, dans le registre de la personne (tu/vous conservé).
- Propose 2 à 4 options courtes UNIQUEMENT si ce sont des réponses génériques et neutres (ex. « LinkedIn », « newsletter », « site »), jamais des idées de contenu ; la personne peut toujours répondre autre chose.
- Ne repose jamais une question déjà dans "questions_posees" sauf pour lever une contradiction.
- Ne pose pas de question évidente ; creuse ce qui changera vraiment le résultat (public précis, critère de réussite, contrainte bloquante).
- "pret_a_compiler": true quand les 5 cases obligatoires sont "ok", ou si la personne dit qu'elle a fini (« c'est bon », « génère », « on y va »).

# Sortie : JSON uniquement, rien avant ni après
{"maj_slots":{"<case>":{"valeur":"…","statut":"ok|partiel","preuves":["…"]}},
 "hypotheses":[{"slot":"…","proposition":"…","a_confirmer":true}],
 "contradictions":["…"],
 "prochaine_question":{"texte":"…","slot":"…","pourquoi":"…","options":["…"]},
 "pret_a_compiler":false}
```
Pour l'analyse des trous du concept B, le prompt est le même avec une sortie `questions[]` (au plus {{N}}, triées par impact) au lieu d'une seule question.

### 3.3 Brouillon du prompt système « Compilateur de master prompt »
```text
Tu es le compilateur du mode « Brainstorm » de CBW AI.
Tu reçois l'état final des cases CRAFT+ (<etat>) et la transcription complète de la session (<transcription>). Tu écris un master prompt prêt à coller dans {{cible_llm}}, en {{langue}}.

# Règles d'or
1. Fidélité absolue : chaque consigne du prompt vient de l'état ou de la transcription. Tu n'ajoutes aucun fait, chiffre, public, contrainte, exemple ou objectif qui n'a pas été dit.
2. Les hypothèses non confirmées ne deviennent PAS des consignes : elles vont dans « Points ouverts ».
3. Ce qui manque n'est pas comblé : dans « Points ouverts », écris une consigne pour l'IA cible du type « Avant de commencer, demande-moi : … ».
4. Tu écris le prompt à la 2e personne, adressé à l'IA cible (« Tu es… », « Ta tâche… »), clair pour quelqu'un qui n'a aucun contexte. Explique le « pourquoi » quand la personne l'a donné.
5. Pas de remplissage générique (« sois créatif », « de haute qualité ») : seulement des consignes vérifiables.
6. Sections vides : omises (sauf Points ouverts si des cases manquent).

# Sortie
Rends EXACTEMENT deux blocs, dans cet ordre, rien d'autre :

<markdown>
# Rôle
# Contexte et objectif
# Ta tâche            (étapes numérotées si l'ordre compte)
# Public et ton
# Contraintes
# Format de la réponse
# Critères de réussite
# Exemples et références
# Points ouverts
</markdown>

<xml>
<role>…</role>
<context>…</context>
<task>…</task>
<audience_tone>…</audience_tone>
<constraints>…</constraints>
<output_format>…</output_format>
<success_criteria>…</success_criteria>
<examples><example>…</example></examples>
<open_questions>…</open_questions>
</xml>
```
Pour Cursor ou Claude Code, on peut ajouter une variante : la même structure, avec en plus « Fichiers / stack / ce qu'il ne faut pas toucher / comment vérifier ». Ça suit les recommandations de spec de Claude Code.

Post-traitement côté code, comme `postProcessNotes` : retirer les blocs `<think>` et les balises de code, vérifier que les deux blocs sont présents, et vérifier qu'aucun nombre ou nom propre du prompt n'est absent de la transcription. Ce dernier contrôle est une heuristique anti-invention bon marché, qui signale sans bloquer.

### 3.4 Ce qu'on réutilise
| Pièce existante | Rôle dans le Brainstorm |
|---|---|
| `src/main/recorder.ts` + VAD + `whisper.ts` (segments) | Réponses vocales, fin de tour sur silence |
| `src/main/notes.ts` (session longue, minuteur, pastille `mode`) | Phase de vide-tête du concept B, à l'identique |
| `src/llm/notes.ts` (`complete()` multi-fournisseurs, `preClean`, `splitTranscript`, post-traitement) | Modèle pour `src/llm/brainstorm.ts` |
| `src/llm/router.ts`, `quota.ts`, les 7 fournisseurs | Ordre dédié et rotation sur 429 |
| `src/main/insert.ts` | « Coller dans l'app active » (ChatGPT, Claude, Cursor) |
| `overlay.ts` (pastille) | `BRAIN · Q3/6 · F`, bulle de question |
| `design/app/app.html` (nav, cartes, tokens CBW) | Page `brainstorm` |
| `cleaning.vocabulary` (Dictionnaire) | Passé en indice à Whisper et à l'interviewer |

Esquisse d'API pour le pont preload (à valider) : `startBrainstorm({gabarit, cibleLlm, mode:'entretien'|'videtete'})`, `onBrainstormState(cb)`, `answerBrainstorm(text?)` (réponse au clic ou au clavier), `skipQuestion()`, `editSlot(slot, valeur)`, `compileBrainstorm({cibleLlm, langue})`, `listBrainstorms()`, `getBrainstorm(id)`, `copyMasterPrompt(id, 'md'|'xml')`, `pasteMasterPrompt(id)`, `deleteBrainstorm(id)`.

---

## 4. Risques et limites

**Quotas des offres gratuites.** Les chiffres viennent de `docs/FREE_LLMS.md` et de la [page des limites Groq](https://console.groq.com/docs/rate-limits).
- Groq `gpt-oss-120b` / `qwen3.8-27b` : 30 RPM, 1 000 RPD, **8 000 TPM et 200 000 TPD par modèle**.
- Un tour d'entretien coûte environ 1,5 k (système) + 0,8 k (état) + 0,3 k (réponse) + 0,4 k (sortie), soit environ **3 k tokens**. Une session A de 12 tours plus la compilation (environ 8 k) fait environ **45 k tokens**, donc environ 4 sessions par jour et par modèle Groq, **en concurrence avec la dictée**. La dictée seule peut déjà consommer 200 k TPD avec 90 dictées de 2,2 k.
- Parade 1 : **un ordre de fournisseurs séparé**. Interviewer sur un modèle Groq que la dictée n'utilise pas en premier (par exemple `gpt-oss-20b`), puis Mistral, Cloudflare et Gemini. Compilateur sur Gemini ou Mistral : grand contexte, latence acceptable (7 à 12 s) pour un appel unique.
- Parade 2 : un prompt système **identique à l'octet près** (l'état va dans le message utilisateur), car les tokens en cache ne comptent pas dans les limites Groq.
- Parade 3 : le concept B (environ 3 à 8 appels par session).
- OpenRouter gratuit (50 requêtes par jour, 429 fréquents) est inutilisable pour un dialogue.

**Latence.**
- Whisper large-v3-turbo par segment, plus un LLM en 0,6 à 2 s sur Groq : environ 1,5 à 3 s par tour. C'est acceptable si l'interface montre « réfléchit… » en bleu et la transcription immédiatement.
- Gemini Flash-Lite (7 à 12 s mesurés) : **trop lent pour l'interviewer**, il ne sert que pour la compilation.
- Ollama local (gemma4 e4b) : possible hors ligne, mais 5 à 15 s par tour, avec une sortie JSON moins fiable.
- La phrase de fin est mal détectée : un silence de 1,5 s coupe les gens qui réfléchissent. Il faut un seuil réglable et un « je n'ai pas fini » (reprise).

**Qualité et fidélité.**
- Les petits modèles inventent des valeurs plausibles : on impose les preuves et le code les vérifie.
- Le JSON peut être invalide : prévoir une relance unique, puis un repli.
- Questions répétitives ou scolaires : plafond N, liste des questions déjà posées, « passe ».
- La reconnaissance vocale déforme les noms de marques ou d'outils : utiliser le Dictionnaire et laisser éditer les cases.

**Confidentialité.**
- Les brainstorms contiennent des briefs clients et des idées non publiées.
- Mistral gratuit **entraîne ses modèles sur les données** (FREE_LLMS.md). Groq : activer la Zero Data Retention. Gemini gratuit : les données peuvent servir à l'amélioration du service.
- Proposer un interrupteur par session : « confidentiel » (Ollama seul, ou fournisseurs sans entraînement seulement).
- Tout est stocké en local, et chaque brainstorm peut être supprimé.

**Produit.**
- Dérive vers le « chatbot » et l'« assistant » (non-objectifs de la SPEC) : on borne le mode à **produire un prompt**. Il ne répond jamais à la demande.
- Le TTS est un non-objectif : les questions sont **affichées**, pas lues (voir Q5).

---

## 5. Recommandation courte
- MVP = **concept B** : vide-tête, puis 3 à 6 questions ciblées, puis compilation. CRAFT+ avec T = cible et ton, sortie Markdown et XML, coller dans l'app active, fichiers `.md` locaux.
- Ensuite : édition des cartes et aperçu live (C), puis entretien mains libres depuis la pastille (A).
- Deux nouveaux prompts versionnés (`brainstorm-interviewer-v1`, `brainstorm-compiler-v1`) et un `src/llm/brainstorm.ts` calqué sur `notes.ts`, à tester avec un petit banc d'essai (5 transcriptions types, mesure « 0 info inventée »).

---

## 6. Questions à te poser (réponses à choix)
1. **CRAFT, quel T ?** a) Target / Cible b) Ton c) **Cible et ton (reco)** d) Je donne ma propre définition
2. **Flux principal ?** a) Entretien question par question (A) b) **Vide-tête puis questions (B, reco)** c) Canevas à remplir (C) d) Je choisis à chaque fois
3. **Pour quelle IA, en priorité ?** (plusieurs choix) ChatGPT · Claude · Cursor / Claude Code · Gemini · Générateur d'images · Générique
4. **Gabarits à livrer en premier ?** (plusieurs choix) Site web · Campagne marketing · Post LinkedIn · Code / app · Brief client com · Étude de marché · Générique seulement
5. **Les questions de l'IA :** a) Affichées seulement b) Affichées et lues à voix haute (TTS, aujourd'hui hors périmètre) c) Lues seulement
6. **L'IA peut-elle proposer des idées ?** a) Non, elle questionne seulement (strict) b) **Oui, mais propositions marquées « à valider » (reco si tu veux du vrai brainstorm)** c) Oui, librement
7. **Comment je réponds ?** a) Voix seulement b) **Voix et options cliquables** c) Voix, options et clavier
8. **Fin de ma réponse :** a) Automatique au silence (seuil réglable) b) J'appuie sur une touche c) Les deux
9. **Nombre de questions :** a) 3 max b) **5 ou 6 max** c) Jusqu'à ce que tout soit couvert d) Je règle
10. **Format de sortie :** a) Markdown b) XML c) **Les deux en onglets** d) Plus une version courte (moins de 150 mots)
11. **Langue du master prompt :** a) Français b) Anglais (souvent un peu meilleur pour les LLM) c) Celle de ma voix d) Au choix à la compilation
12. **Longueur visée :** a) Court (moins de 200 mots) b) Standard (200 à 500) c) Détaillé (plus de 500, avec exemples)
13. **Où dans l'app ?** a) **Nouvelle section « Brainstorm » (reco)** b) Un type de note dans Notes c) Les deux et un lancement depuis la pastille
14. **Lancement :** a) Bouton seulement b) Raccourci dédié (lequel ?) c) Menu de la barre de menus d) Commande vocale
15. **Après génération :** (plusieurs choix) Copier · Coller dans l'app active · Ouvrir ChatGPT ou Claude puis coller · Enregistrer en .md · Envoyer vers Notion
16. **Versions et affinage :** a) Oui (v1, v2 avec différences) b) Juste « régénérer » c) Non
17. **Partir d'une note existante** (transformer une note en master prompt) : a) Oui b) Plus tard c) Non
18. **Confidentialité :** a) Cloud gratuit OK b) Interrupteur « confidentiel » par session c) Local (Ollama) seulement pour le Brainstorm
19. **Garder mes gabarits perso** (« Dupliquer en gabarit ») : a) Oui b) Non
20. **Priorité si on doit couper :** a) Qualité des questions b) Vitesse c) Zéro quota consommé d) Beauté de l'écran

---

### Sources principales
- Anthropic : [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) · [Prompt generator](https://platform.claude.com/docs/en/prompt-generator) · [Prompting tools](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools) · [Templates & variables](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompt-templates-and-variables) · [Claude Code best practices (interview)](https://code.claude.com/docs/en/best-practices)
- OpenAI : [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- CRAFT : [PromptQuorum](https://www.promptquorum.com/prompt-engineering/craft-framework) · [Ecosire](https://ecosire.com/blog/prompt-engineering-business-guide) · [UKY](https://scholars.uky.edu/en/publications/craft-prompt-generation-framework-for-teachers/) · [IJIRSS](https://ideas.repec.org/a/aac/ijirss/v8y2025i5p1651-1664id9229.html) · [SCAI Hub](https://sites.google.com/view/scaihub/ai-prompting/prompting-frameworks/craft-model)
- Autres frameworks : [GovTech CO-STAR](https://www.tech.gov.sg/media/technews/mastering-the-art-of-prompt-engineering-with-empower) · [PromptQuorum frameworks](https://www.promptquorum.com/blog/prompt-frameworks) · [SurePrompts](https://sureprompts.com/blog/ai-prompt-frameworks) · [ButterCMS](https://buttercms.com/blog/chatgpt-prompt-frameworks/)
- Produits et motifs : [Wispr Flow docs](https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android) · [tl;dv Wispr review](https://tldv.io/blog/wisprflow/) · [AskUserQuestion guide](https://www.atcyrus.com/stories/claude-code-ask-user-question-tool-guide) · [VelvetShark](https://velvetshark.com/stop-prompting-claude-code-let-it-interview-you) · [You-Ask-Me technique](https://www.graduateschool.edu/learn/ai/you-ask-me-technique) · [Dialogflow slot filling](https://docs.cloud.google.com/dialogflow/docs/fulfillment-webhook-slot-filling) · [Mapify](https://mapify.so/blog/mapify-conversation-mind-maps) · [Idea Clear](https://apps.apple.com/ee/app/idea-clear/id6758003581)
- Quotas : [Groq rate limits](https://console.groq.com/docs/rate-limits) · `docs/FREE_LLMS.md`

# Veille Wispr Flow : le « modificateur de texte » (mise en forme)

Date : 2026-10-14. Lecture seule du web. Complète `chantiers/prompt-v16/veille-wispr.md` (prompt, noms propres) sans le répéter.

Légende :
- **PROUVÉ** : doc officielle (docs.wisprflow.ai, wisprflow.ai, changelog), citée avec URL.
- **OBSERVÉ** : avis ou test d'utilisateurs (blogs, App Store, HN, forums).
- **SUPPOSÉ** : ma déduction.

Limites : Reddit est inaccessible à mon outil (bloqué), et YouTube ne fournit pas de transcription exploitable. Les pages du centre d'aide affichent « mis à jour il y a N jours » sans date exacte : elles sont donc toutes récentes (octobre 2026). Mon outil de lecture résume les pages : les citations entre guillemets sont celles qu'il a restituées mot pour mot à ma demande.

---

## 0. En bref

1. Wispr Flow a **deux** moyens de faire des retours à la ligne : des **commandes vocales** (« new line », « new paragraph ») et une **mise en page automatique** (paragraphe à chaque changement de sujet, découpe des passages longs, mise en forme d'e-mail avec salutation, signature et sauts de ligne). Les deux sont PROUVÉS.
2. Les listes viennent du **comptage parlé** (« one… two… », « first… second… »). Flow **retire ces marqueurs**. PROUVÉ.
3. Le nettoyage a **3 niveaux** (None, Light par défaut, Medium). « High » a été **retiré** après des plaintes : il était trop agressif. PROUVÉ.
4. Les **Styles** (Formal, Casual, Very casual, Excited) ne touchent que les **majuscules, la ponctuation et les espaces**, selon la catégorie d'app. Ils existent **en anglais seulement**. PROUVÉ.
5. Pour le **français**, Flow ajoute les **espaces fines insécables** avant `; : ? ! »` et après `«`, sauf dans les apps de code. PROUVÉ.
6. Chez nous, il y a un **vrai bug** : une dictée courte qui contient « à la ligne » sort telle quelle, avec les mots « à la ligne » (voir §8).

---

## 1. Retours à la ligne et paragraphes

### 1.1 Commandes vocales (PROUVÉ)

Source : [Smart Formatting & Backtrack](https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack), tableau des commandes.

| Phrase dite | Résultat |
|---|---|
| « new line », « next line », « line break », « skip a line » | un retour à la ligne |
| « new paragraph », « start a new paragraph » | un nouveau paragraphe |
| « period » / « full stop », « comma », « question mark », « exclamation point », « colon », « semicolon » | le signe correspondant |
| « em-dash », « em dash », « emdash » | un tiret (« some names may not produce a symbol ») |

Ce que dit la doc :
- « Line break and paragraph commands work best at natural pauses or between sentences. »
- Ces commandes fonctionnent **même quand Smart Formatting est désactivé**.
- La page ne liste **aucune commande** pour les guillemets ou les parenthèses.
- Commande « press enter » : dite **à la fin** d'une dictée, elle colle le texte puis appuie sur Entrée. Elle est retirée du texte et s'active dans Réglages > Experimental. OBSERVÉ : réponse du support relayée sur [MacPowerUsers](https://talk.macpowerusers.com/t/wisprflow-tip-press-enter-to-trigger-return/45142).

OBSERVÉ :
- La commande « new line » ne marche que de temps en temps. Le support conseille de **faire une pause assez longue** avant de la dire, sinon elle est prise pour une partie de la phrase. Source : [Podfeet, Scott Willsey, mars 2026](https://www.podfeet.com/blog/2026/03/wispr-flow-scott-willsey/), d'après le résumé de recherche (la page renvoie une erreur 403 à la lecture directe).
- Un ancien article du blog Wispr dit que « new line » crée un paragraphe ([Wispr vs Willow](https://wisprflow.ai/post/wispr-flow-vs-willow-voice)). C'est contredit par la doc actuelle, qui sépare ligne et paragraphe.

### 1.2 Mise en page automatique (PROUVÉ)

- Doc Android [« Why Flow sometimes removes or changes words »](https://docs.wisprflow.ai/articles/6568835559-why-wispr-flow-sometimes-removes-or-changes-words-on-android-smart-formatting) : Flow « creates implied lists », « adds paragraph breaks at topic changes, splits long passages ». C'est **la règle officielle la plus précise** sur les paragraphes : changement de sujet **et** découpe des passages longs. Aucun seuil chiffré n'est publié.
- [Starting your first dictation](https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation) : « Flow formats lists and paragraphs ».
- [Accuracy & known limitations](https://docs.wisprflow.ai/articles/4048537120-what-to-expect-from-flow-accuracy-and-known-limitations) : « Long dictations come back fully formatted, including ones that contain or end in bulleted or numbered lists. »
- Catégorie **E-mail** dans [Styles](https://docs.wisprflow.ai/articles/2368263928-how-to-setup-flow-styles) : elle « adds email formatting such as greetings, sign-offs, and line breaks ». La page [Context Awareness](https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness) le confirme pour Missive : « Email style and email formatting (greetings, sign-offs, line breaks) apply ».
- Salutations : Flow « formats email greetings without a comma before the addressee » (doc Android). On a donc « Hi Alex, » et non « Hi, Alex ».
- Marketing ([guide dissertations](https://wisprflow.ai/post/voice-typing-for-essays)) : « You're producing actual paragraphs. » Et ailleurs : « You don't need to say "period" or "new line." »

### 1.3 Ce qu'en disent les utilisateurs (OBSERVÉ)

- « Plus besoin de préciser "point", "retour à la ligne" ou autres commandes : tout est interprété naturellement. » Avis App Store FR « Excellent outil de dictée vocale ! », 04/12/2025 ([App Store FR](https://apps.apple.com/fr/app/wispr-flow-ai-voice-keyboard/id6497229487?see-all=reviews&platform=iphone)).
- Un avis App Store US dit que l'app ajoute ponctuation et puces et crée des paragraphes sans commande (résumé de recherche, [App Store US](https://apps.apple.com/us/app/wispr-flow-ai-voice-keyboard/id6497229487?see-all=reviews)).
- « infers paragraph breaks from your pacing » : test de 90 jours ([mrktcorrect](https://mrktcorrect.com/blog/wispr-flow-review)). Les pauses comptent donc probablement dans la décision. SUPPOSÉ : le modèle de transcription renvoie la ponctuation et les pauses, et le LLM s'en sert.
- E-mails : « proper greetings, paragraph breaks at natural points ». La même dictée donne « Hello Jordan, » dans Gmail et « hey Jordan » dans Slack ([Booststash, test de 30 jours](https://booststash.com/wispr-flow-review-2025/)). Attention : cet article contient des incohérences (une note de 4,7/10 contre 4,7/5).
- Contre-exemple : en japonais avec le niveau Light, la sortie était « one dense, transcript-like block with little visible paragraph structure » ([IC Eight](https://ic-eight.com/articles/wispr-flow-speech-captured-writing-needed-understanding.html)). Hors anglais, la mise en page automatique est donc moins fiable.

### 1.4 Selon l'app (PROUVÉ, sauf mention)

- Le texte autour du curseur sert de modèle : « Flow matches casing, spacing, and punctuation to surrounding text » ([Context Awareness](https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness)).
  - Exemple Slack, en milieu de message : « sounds good let's sync tomorrow morning » → `sounds good, let's sync tomorrow morning` (pas de majuscule, pas de point).
  - Exemple Gmail : « hey alex thanks for sending over the proposal i'll review it by friday » → `Hey Alex, thanks for sending over the proposal. I'll review it by Friday.`
- Règles de raccord ([Capitalisation en milieu de phrase](https://docs.wisprflow.ai/articles/4518230910-why-flow-capitalizes-words-mid-sentence-and-how-to-control-it)) :
  - si le texte avant le curseur finit par un emoji ou un guillemet fermant, la phrase continue en minuscule ;
  - s'il finit par un point, une nouvelle phrase commence avec une majuscule ;
  - s'il y a du texte après le curseur, la ponctuation finale de la dictée est supprimée ;
  - beaucoup d'apps (Slack, Gmail, Notion, Claude, ChatGPT) ne renvoient pas le texte voisin : la dictée y est alors traitée comme une nouvelle phrase.
- Format par app sur Mac et Windows : automatique, sans mise en forme, majuscules des noms propres seulement, ou tout en minuscules.
- Les apps reconnues comme des **assistants IA** et le **mode commande** sautent la mise en forme ([Auto Cleanup FAQ](https://docs.wisprflow.ai/articles/4283510616-auto-cleanup-control-how-much-flow-edits-your-dictation-beta)).
- Bureau : les assistants IA et les terminaux tombent dans la catégorie « Other ».
- Tiers ([Sid Saladi](https://sidsaladi.substack.com/p/wispr-flow-101-the-complete-guide), OBSERVÉ/marketing) : Docs et Notion → « Structured paragraphs, headings » ; ChatGPT et Claude → « Clean prompt formatting ».

---

## 2. Listes, ponctuation, majuscules, nombres, symboles

| Sujet | Comportement de Flow | Statut et source |
|---|---|---|
| Liste numérotée | « Use numbers or sequence words ("one… two…" or "first… second…") to create a list automatically. » | PROUVÉ, [Smart Formatting](https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack) |
| Exemple de liste | « Going to the store for 1. Apples 2. Bananas 3. Oranges. » → liste formatée | PROUVÉ, [Features](https://wisprflow.ai/features) |
| Marqueurs parlés | Flow « removes spoken markers such as "first" and "finally" » | PROUVÉ, doc Android |
| Listes implicites | « creates implied lists », sans annonce | PROUVÉ, doc Android |
| Liste à puces | Pas de commande dictée documentée. Par le mode commande : « Turn this into bullet points » | PROUVÉ (absence) / tiers |
| Ponctuation auto | Déduite des pauses et du ton ; mots « comma », « period »… → signes, sauf s'ils sont clairement du contenu (en cas de doute, Flow met le signe) | PROUVÉ |
| Mot pris pour de la ponctuation | Un mot au son proche, comme « Kama », peut devenir une virgule | PROUVÉ (défaut reconnu) |
| Tiret cadratin | « Flow avoids inserting em dashes automatically » | PROUVÉ |
| Point final | Formal : jamais retiré. Casual : retiré jusqu'à 10 phrases. Very Casual : toujours retiré. Excited ou sans style : retiré jusqu'à 2 phrases, et seulement dans les messageries. « The rule removes every trailing dot, including an ellipsis, but keeps ! and ? » | PROUVÉ |
| Nombres | Mots → chiffres, avec unités, devises, heures, degrés, pourcentages : « four four five cleaners » → `445 cleaners` ; « 1000 dollars » → `$1,000` ; « one two five degrees » → `125°` | PROUVÉ, doc Android |
| Nombre abîmé | « one point something percent » → `1%` (perte de sens) | PROUVÉ (défaut reconnu) |
| Montants | « We should budget 50K for this, actually, make that 75K. » → `We should budget 75K for this.` | marketing tiers |
| Emojis | « converts dictated emoji descriptions into emoji » | PROUVÉ, doc Android |
| Contractions | « gonna » → « going to » | PROUVÉ |
| Mots composés | Préfère les composés en un mot | PROUVÉ |
| E-mails et URL dictés | Rien de documenté. Dans la barre d'adresse : « Speak a URL or search phrase and Flow types it in ». Le dictionnaire ignore les URL et les chemins de fichiers. Pour son adresse e-mail, Flow conseille un snippet | PROUVÉ (absence) |
| Sigles | « API » transcrit `A.P.I.` | OBSERVÉ, [Booststash](https://booststash.com/wispr-flow-review-2025/) |
| Code dicté | « user underscore ID » → `user ID` (le tiret bas est perdu) ; « you're going to fight Wispr Flow on every bracket, parenthesis » | OBSERVÉ, Booststash, mrktcorrect |
| Virgules | Point faible souvent cité (les points et les « ? » sont bons, les virgules moins) | OBSERVÉ (G2, App Store, résumé de recherche) |

---

## 3. Niveaux de nettoyage et Styles

### 3.1 Auto Cleanup (PROUVÉ)

Sources : [Auto Cleanup](https://docs.wisprflow.ai/articles/4283510616-auto-cleanup-control-how-much-flow-edits-your-dictation-beta) et [What's new](https://wisprflow.ai/whats-new).

- **None** : texte brut, avec les fillers et les faux départs.
- **Light** (par défaut) : « cleans up filler words and grammar ».
- **Medium** : « edits for clarity and conciseness » ; il peut reformuler en gardant le sens.
- **High** : « rewrites for brevity and polish ». Il **n'est plus proposé**, et ceux qui l'avaient choisi passent en Medium.

Historique :
- 24/04/2026 : les quatre niveaux remplacent Smart Formatting.
- 24/06/2026 : tout le monde passe sur un seul modèle, avec « Fewer changes to words you said » et « Punctuation and corrections that do what you tell them to ».
- 09/07/2026 : un réglage Auto Cleanup trop agressif était « the biggest driver of recent accuracy issues ».

Retour en arrière : « Undo AI edit » dans l'historique remet la transcription brute. Si le formatage échoue, Flow colle le texte brut.

OBSERVÉ : en japonais, le niveau Medium a ajouté une phrase jamais dite, « ご視聴ありがとうございました » (« Merci d'avoir regardé »), une hallucination typique de Whisper ([IC Eight](https://ic-eight.com/articles/wispr-flow-speech-captured-writing-needed-understanding.html)). Un testeur a vu deux fois son ton familier devenir plus soutenu, ce qui changeait le sens ([Booststash](https://booststash.com/wispr-flow-review-2025/)). Un autre trouve le nettoyage « more confident than I would like » ([Nick Lafferty](https://nicklafferty.com/reviews/wispr-flow/)).

### 3.2 Styles par catégorie d'app (PROUVÉ)

Sources : [Styles](https://docs.wisprflow.ai/articles/2368263928-how-to-setup-flow-styles) et [Personalized Style, 29/10/2025](https://wisprflow.ai/post/personalized-style).

| Style | Effet | Catégories |
|---|---|---|
| Formal | « Caps + more periods » | toutes |
| Casual | « Caps + less punctuation » | toutes |
| Very casual | « No caps + less punctuation » | Personal seulement |
| Excited! | « Caps + more exclamation points » | Work, Email, Other |

- Catégories : Personal (iMessage, WhatsApp, Telegram, Instagram, Discord, Signal), Work (Slack, Teams, LinkedIn), Email (Gmail, Outlook, Superhuman), Other (Docs, Notes, ChatGPT…).
- Par défaut, tout est en Formal tant que l'utilisateur n'a rien réglé.
- Le style « doesn't change your grammar, word choice, or phrasing » : il ne touche que les majuscules, la ponctuation et les espaces.
- **Anglais seulement** (« Style formatting applies only to English »). Sur iOS v1.46, les styles ne s'adaptent plus automatiquement à l'app.

---

## 4. Backtrack : auto-corrections et fillers (PROUVÉ)

Sources : [Smart Formatting & Backtrack](https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack) et [First dictation](https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation).

- Déclencheurs donnés en exemple : « actually », « scratch that », « never mind » ; on peut aussi simplement **reformuler**. Flow « uses your full dictation as context to decide what to change ».
- Exemple : « Let's do coffee at 2 actually 3. » → `Let's do coffee at 3.` Autre exemple : « let's meet Tuesday, actually no, Wednesday » → seulement Wednesday ([blog](https://wisprflow.ai/post/wispr-flow-vs-willow-voice)).
- Seules les auto-corrections claires disparaissent. « I actually enjoyed the movie » reste intact.
- « A cue such as "actually" alone is not enough » ; « An explicit cancellation such as "scratch that" removes the retracted wording and the cue » ; les corrections ambiguës, les fragments inachevés et un « never mind » qui fait partie du message **restent**.
- Fillers, faux départs et répétitions sont supprimés « unless they add clear meaning ». Défaut reconnu : Flow peut supprimer un « so » en début de phrase ou une répétition voulue.
- Quand on désactive Smart Formatting, le Backtrack est **aussi** désactivé.
- Une correction d'orthographe dite à voix haute ne remplace un mot que s'il « sound[s] similar » ; une correction au son très différent est ignorée.
- OBSERVÉ : « actually, scratch that » demande encore souvent une retouche à la main ([Nick Lafferty](https://nicklafferty.com/reviews/wispr-flow/)). Un commentaire HN : « Wispr flow cuts out ums. I love it ».

---

## 5. Mode commande, Transforms, IDE, snippets, dictionnaire

- **Mode commande** (PROUVÉ, [doc](https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode)) :
  - Fn+Ctrl, à activer dans Experimental. Flow envoie le contenu de la zone de texte et la sélection avec l'instruction, dite librement.
  - Sans texte, rien ne se passe. Hors champ éditable, la réponse s'affiche en notification.
  - Les phrases déclencheuses sont en anglais seulement ; le raccourci clavier marche dans toutes les langues. Une recherche ouvre Perplexity.
  - Exemples tiers : « Make this more concise », « Turn this into bullet points », « Rewrite in a friendlier tone ».
- **Transforms** (bêta, 01/05/2026, [doc](https://docs.wisprflow.ai/articles/8068950331-how-to-use-transforms-beta)) :
  - **Polish** (Opt+1) a cinq règles : plus concis, plus clair, réordonné pour la lecture, structure ajoutée, ton conservé.
  - **Prompt Engineer** (Opt+2) « turns unstructured spoken thoughts into a structured AI prompt ».
  - On peut créer jusqu'à 8 transforms personnalisés, avec 5 échantillons d'écriture chacun. « Auto Apply » lance un transform après chaque dictée. Il y a une vue « diff » et un bouton « annuler ».
- **IDE** (PROUVÉ, [doc](https://docs.wisprflow.ai/articles/6434410694-use-flow-with-cursor-vs-code-and-other-ides)) :
  - Les variables, fonctions et classes visibles sont reconnues, via le mode lecteur d'écran de VS Code, Cursor et Windsurf. Les noms reconnus peuvent sortir en **code inline**.
  - Marquage de fichier dans le chat de Cursor et Windsurf : « Check index dot ts for errors » → tague `index.ts` ; « tag my python script » → `my_python_script.py`.
  - Un snippet ou un mot du dictionnaire désactive le marquage pour toute la dictée. Pas de @mentions de personnes.
- **Snippets** (PROUVÉ, [doc](https://docs.wisprflow.ai/articles/5784437944-create-and-use-snippets)) :
  - Une phrase déclencheuse dite seule ou dans une phrase est remplacée par son texte.
  - Texte statique, sans date dynamique, 4 000 caractères maximum.
  - Texte riche (gras, listes, liens) depuis le 29/07/2026. Le plus long déclencheur gagne.
- **Dictionnaire** (PROUVÉ, [doc](https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary)) :
  - Ajout automatique quand l'utilisateur corrige un mot (sauf URL, chiffres, emojis, prénoms courants, sigles courants).
  - Remplacements littéraux, insensibles à la casse, mot entier, sans tenir compte de la langue.

---

## 6. Multilingue et français

- PROUVÉ ([Multilingue](https://docs.wisprflow.ai/articles/3191899797-use-flow-with-multiple-languages)) :
  - **une langue détectée par dictée**, pas une par mot, donc le mélange de langues est moins fiable ;
  - pour le français : « Adds narrow no-break spaces before ; : ? ! » and after «, except in developer or coding apps » ;
  - le français fait partie des langues les plus précises ([limites](https://docs.wisprflow.ai/articles/4048537120-what-to-expect-from-flow-accuracy-and-known-limitations)) ;
  - le nettoyage ne traduit jamais vers l'anglais.
- PROUVÉ : les Styles sont en anglais seulement, et les phrases déclencheuses du mode commande aussi. Smart Formatting couvre un « expanded language set ». La doc ne dit pas si le Backtrack marche en français.
- OBSERVÉ :
  - français jugé très précis, accents compris, ponctuation automatique ([Shift IA](https://shiftia.fr/tests/wispr-flow-dictee-vocale-ia/)) ;
  - erreurs sur les noms propres rares ; « François Dubois » transcrit `Francois Du Bois` tant que le nom n'est pas dans le dictionnaire ([Booststash](https://booststash.com/wispr-flow-review-2025/)) ;
  - précision qui tombe à 85-88 % quand on mélange les langues ;
  - pas de clavier AZERTY sur iOS (App Store FR) ;
  - aucun test public des styles, des listes ou des paragraphes **en français** n'a été trouvé.

---

## 7. Écarts entre notre prompt v1.7 (`src/llm/prompt.ts`) et Wispr Flow

| # | Sujet | Wispr Flow | Nous (v1.7) | À faire |
|---|---|---|---|---|
| 1 | Paragraphes automatiques | À chaque changement de sujet, et découpe des passages longs | Seulement au-delà de ~80 mots **et** avec un changement net de sujet ; « une dictée courte reste un seul bloc » | **Assouplir** : c'est l'écart que Camille sent le plus |
| 2 | Mise en forme d'e-mail | Salutation, corps, signature sur des lignes séparées (catégorie Email) | Rien, sauf si la personne dicte « à la ligne » (exemple 9) | **Ajouter** une règle salutation et signature, quelle que soit l'app |
| 3 | Commandes de ligne | 4 formules pour la ligne, 2 pour le paragraphe, distinctes | « à la ligne », « point à la ligne », « nouveau paragraphe » ; le prompt ne dit pas ce que donne un paragraphe | Ajouter les variantes françaises et définir paragraphe = ligne vide |
| 4 | Commandes dans une dictée courte | Toujours appliquées, même sans formatage | **BUG** : `shouldSkipLLM` saute le LLM pour 6 mots ou moins, et `fallbackClean` ne connaît pas les commandes. « Salut Karim virgule à la ligne » → `Salut Karim virgule à la ligne.` (vérifié en local) | Corriger dans le code (§8) |
| 5 | Listes | Créées dès qu'on compte (« un… deux… », « premièrement… »), même implicites ; numérotées | Tirets « - » seulement si annoncé **et** au moins 3 éléments | Liste **numérotée** quand on compte ; garder le seuil de 3 pour les puces |
| 6 | Tiret cadratin | Jamais ajouté | Rien n'est dit | Ajouter l'interdiction |
| 7 | Espaces fines | U+202F avant `; : ? !` et `»`, après `«`, sauf dans le code | Rien | À faire dans le **code** (postProcess), pas dans le prompt |
| 8 | Point final en messagerie | Retiré pour 1 ou 2 phrases en messagerie (sauf en Formal) | Toujours un point (y compris dans `fallbackClean`) | Option « style messagerie » ; non prioritaire |
| 9 | Raccord avec le texte autour | Minuscule et pas de point final quand on dicte au milieu d'une phrase | Impossible : `context.ts` envoie l'app et les noms, pas le texte avant/après le curseur | Chantier à part (accessibilité) |
| 10 | Nombres | Chiffres partout (`445`, `$1,000`, `125°`) | Chiffres pour le technique, lettres pour les petits nombres dans une phrase courante | **Garder** notre règle (norme française) ; ajouter °, %, € |
| 11 | Emojis | « emoji cœur » → ❤️ | Rien | Ajouter une règle simple |
| 12 | E-mails et URL dictés | Rien de documenté | Rien | Ajouter « arobase », « point com » (on peut faire mieux que Flow) |
| 13 | Annulation explicite | « scratch that » retire ce qui précède **et** la formule | « laisse tomber », « oublie » (idée abandonnée) | Ajouter « efface ça », « supprime ça », « annule » |
| 14 | « Actually » seul | Ne suffit pas à corriger | Le prompt dit « A, non, en fait B » | Déjà proche ; rappeler qu'« en fait » seul ne corrige rien |
| 15 | Niveaux | None / Light / Medium (High retiré parce que trop agressif) | light / standard (prudents) | **Valide notre choix.** Pas de niveau « réécriture » |
| 16 | Styles | Majuscules et ponctuation par catégorie d'app, en anglais seulement | Le registre de la personne est gardé ; l'app ne règle que la forme | Notre approche couvre déjà l'essentiel |
| 17 | Apps IA et terminaux | Pas de mise en forme (texte brut) dans les apps IA | Nettoyage complet | SUPPOSÉ : garder notre nettoyage (prompts lisibles), mais **pas de paragraphes ajoutés dans un terminal** |
| 18 | Code inline dans un IDE | Noms reconnus en `code` | Termes techniques gardés tels quels | Pas de backticks : risque de casser le collage. Ne rien faire |
| 19 | Mode commande, Transforms, snippets | Oui | Non | Hors prompt ; à ouvrir comme chantiers produit |

---

## 8. Correctifs de code proposés (hors prompt)

1. **`shouldSkipLLM`** : ne jamais sauter le LLM si la dictée contient une commande. Regex proposée :
   ```ts
   const SPOKEN_COMMAND_RE = /\b(?:à la ligne|retour à la ligne|nouvelle ligne|ligne suivante|saute(?:r)? une ligne|nouveau paragraphe|paragraphe suivant|virgule|point(?: d'interrogation| d'exclamation|-virgule| virgule)?|deux[- ]points|tiret|guillemets?|parenthèses?|émoji|emoji|arobase)\b/i;
   ```
   Ajouter `&& !SPOKEN_COMMAND_RE.test(t)` dans la condition de sortie.
2. **`fallbackClean`** (quand aucun LLM ne répond) : appliquer de façon déterministe au moins « nouveau paragraphe » → `\n\n`, « à la ligne » et ses variantes → `\n`, « virgule » → `,`, « point d'interrogation » → `?`. Sans ça, une panne réseau colle les mots des commandes.
3. **Espaces fines** (comme Flow) : dans `postProcess`, quand la langue est `fr` et que l'app n'est ni un terminal ni un éditeur de code, remplacer ` ?`, ` !`, ` ;`, ` :` (ou l'absence d'espace) par U+202F, ainsi que `« ` et ` »`. Le faire **en code** : les LLM gèrent mal U+202F. Exclure les URL, les heures (`14:30`) et les smileys `:)`. À tester dans Slack et Mail.
4. **Tiret cadratin** : dans `postProcess`, si la sortie contient `—` et que la dictée n'a pas dit « tiret », remplacer par une virgule. Filet de sécurité optionnel, en plus de la règle du prompt.

---

## 9. Règles proposées, prêtes à intégrer dans `CORE` (section « # Forme »)

Elles remplacent les puces « Commandes de ponctuation… », « Pas de mise en forme non dictée… » et « Liste à tirets… ».

```text
# Mise en page : retours à la ligne et paragraphes
- Commandes dictées (applique-les toujours, ne les écris jamais) :
  « à la ligne », « retour à la ligne », « nouvelle ligne », « ligne suivante », « va à la ligne » = un retour à la ligne simple.
  « point à la ligne » = un point puis un retour à la ligne.
  « nouveau paragraphe », « paragraphe suivant », « saute une ligne », « sauter une ligne » = une ligne vide (deux retours à la ligne).
  Si la commande est employée comme un vrai contenu (« il est allé à la ligne d'arrivée »), garde les mots.
- Salutation et signature (message, mail, quelle que soit l'app) : si la dictée commence par une salutation adressée à quelqu'un (« Bonjour Paul », « Salut l'équipe », « Hello Karim », « Madame, Monsieur »), écris-la seule sur sa ligne, suivie d'une virgule, puis passe à la ligne. Pas de virgule entre la salutation et le nom (« Bonjour Paul, » et non « Bonjour, Paul »). Si la dictée finit par une formule de fin (« merci », « bonne journée », « à demain », « bien à toi », « cordialement ») suivie ou non d'un prénom, mets-la sur sa propre ligne après une ligne vide ; le prénom qui signe va sur la ligne suivante. N'ajoute jamais de salutation ni de signature qui n'ont pas été dites.
- Paragraphes automatiques : dès que la dictée fait plus de trois phrases, commence un nouveau paragraphe (ligne vide) à chaque changement net de sujet ou d'étape (« autre chose », « sinon », « par ailleurs », « deuxième point », « pour finir », passage d'un constat à une demande). Un paragraphe ne dépasse pas quatre ou cinq phrases : au-delà, coupe à la frontière d'idée la plus naturelle. Ne coupe jamais au milieu d'une phrase, ne déplace jamais une phrase, n'ajoute ni titre ni intertitre.
- Une dictée d'une à trois phrases sur un seul sujet reste un seul bloc. En cas de doute : pas de nouveau paragraphe.
- Terminal ou éditeur de code (<contexte app="Terminal|iTerm|Warp|Code|Cursor|Xcode…">) : aucun retour à la ligne non dicté.

# Listes
- Si la personne compte ses éléments (« un… deux… trois… », « premièrement… deuxièmement… », « d'abord… ensuite… enfin… » avec au moins trois éléments), fais une liste numérotée « 1. », « 2. »… sur des lignes séparées, précédée de la phrase d'annonce terminée par « : ». Retire les marqueurs parlés (« premièrement », « ensuite », « enfin »), qui deviennent les numéros.
- Si elle annonce une énumération sans compter (« trois choses : … », « la liste : … ») ou dit « liste à puces », fais une liste à tirets « - ».
- Une petite série dans une phrase (« du pain, du lait et des œufs ») reste une phrase. Une liste dictée n'est jamais réordonnée ni complétée.

# Ponctuation et signes
- Commandes dictées : « virgule », « point », « point-virgule », « deux-points », « point d'interrogation », « point d'exclamation », « points de suspension », « tiret », « ouvre / ferme les guillemets », « ouvre / ferme la parenthèse » : applique-les, ne les écris pas, sauf si le mot est clairement du contenu.
- N'ajoute jamais de tiret cadratin (—) qui n'a pas été dicté : utilise une virgule, deux-points ou un point.
- « émoji » ou « smiley » suivi d'un nom (« émoji cœur », « émoji pouce », « smiley qui rit ») = l'emoji correspondant (❤️, 👍, 😂), seulement si le nom désigne un emoji sans ambiguïté ; sinon garde les mots.
- Adresses dictées : « arobase » = @, « point com / point fr » = .com / .fr, « tiret » ou « tiret du six » = -, « tiret bas » = _, « slash » = /, tout attaché et en minuscules (« paul point martin arobase gmail point com » → paul.martin@gmail.com). Idem pour un site (« cbw studio point fr » → cbwstudio.fr) seulement si c'est clairement une adresse.
- Nombres : garde la règle actuelle, et écris en chiffres les pourcentages (« 20 % »), les degrés (« 125 °C ») et les montants (« 1 000 € »). Ne transforme jamais une valeur approximative en valeur précise (« un virgule quelque chose pour cent » reste tel quel).

# Auto-corrections (ajout à « À supprimer », point 4)
- « Efface ça », « supprime ça », « annule ça », « oublie ce que je viens de dire » : retire la phrase ou le passage qui précède immédiatement, et la formule elle-même.
- « En fait » ou « non » seul ne corrige rien : il faut une vraie seconde version qui remplace la première (« à 14 h, en fait 15 h » → « à 15 h » ; « en fait, j'ai adoré le film » reste tel quel).
```

### Exemples à ajouter dans `SHOTS`

Ils sont volontairement différents de `bench/cases.jsonl`.

```ts
{
  note: 'mail : salutation et signature sur leurs lignes, paragraphes au changement de sujet',
  context: { app: 'Mail' },
  raw: "bonjour Claire euh je te confirme que la livraison est prévue jeudi matin, le transporteur passera vers 9h. par contre il faudra quelqu'un à l'accueil pour signer. sinon pour la facture je te l'envoie demain avec le bon de commande. merci et bonne journée Thomas",
  light: "Bonjour Claire,\n\nJe te confirme que la livraison est prévue jeudi matin, le transporteur passera vers 9 h. Par contre, il faudra quelqu'un à l'accueil pour signer.\n\nPour la facture, je te l'envoie demain avec le bon de commande.\n\nMerci et bonne journée,\nThomas",
  standard: /* identique */ '',
},
{
  note: 'liste comptée → numérotée, marqueurs retirés',
  raw: "pour la mise en ligne il reste trois étapes premièrement valider les textes deuxièmement compresser les images et troisièmement tester sur mobile",
  light: "Pour la mise en ligne, il reste trois étapes :\n1. Valider les textes.\n2. Compresser les images.\n3. Tester sur mobile.",
  standard: /* identique */ '',
},
{
  note: 'commandes de ligne variées + emoji',
  raw: "coucou retour à la ligne c'est bon pour samedi émoji pouce nouveau paragraphe je ramène le dessert",
  light: "Coucou\nC'est bon pour samedi 👍\n\nJe ramène le dessert.",
  standard: /* identique */ '',
},
```

À vérifier en benchmark avant d'adopter :
- l'exemple 6 actuel (liste à tirets avec « ; ») passe en liste numérotée : il faut choisir une seule convention ;
- le seuil « plus de trois phrases » remplace « ~80 mots » : mesurer le taux de paragraphes ajoutés à tort sur `bench/cases.jsonl` ;
- le garde-fou `novelWordRatio` ne pénalise pas les emojis et les adresses e-mail (à vérifier).

---

## 10. Sources principales

- Doc officielle : [Smart Formatting & Backtrack](https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack) · [Styles](https://docs.wisprflow.ai/articles/2368263928-how-to-setup-flow-styles) · [Auto Cleanup](https://docs.wisprflow.ai/articles/4283510616-auto-cleanup-control-how-much-flow-edits-your-dictation-beta) · [Mots modifiés (Android)](https://docs.wisprflow.ai/articles/6568835559-why-wispr-flow-sometimes-removes-or-changes-words-on-android-smart-formatting) · [Capitalisation](https://docs.wisprflow.ai/articles/4518230910-why-flow-capitalizes-words-mid-sentence-and-how-to-control-it) · [Context Awareness](https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness) · [Multilingue](https://docs.wisprflow.ai/articles/3191899797-use-flow-with-multiple-languages) · [Limites](https://docs.wisprflow.ai/articles/4048537120-what-to-expect-from-flow-accuracy-and-known-limitations) · [Première dictée](https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation) · [Mode commande](https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode) · [Transforms](https://docs.wisprflow.ai/articles/8068950331-how-to-use-transforms-beta) · [IDE](https://docs.wisprflow.ai/articles/6434410694-use-flow-with-cursor-vs-code-and-other-ides) · [Snippets](https://docs.wisprflow.ai/articles/5784437944-create-and-use-snippets) · [Dictionnaire](https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary) · [Outlook](https://docs.wisprflow.ai/articles/9272331366-use-flow-with-microsoft-outlook)
- Site et changelog : [What's new](https://wisprflow.ai/whats-new) · [Features](https://wisprflow.ai/features) · [Personalized Style](https://wisprflow.ai/post/personalized-style) · [Essais](https://wisprflow.ai/post/voice-typing-for-essays) · [vs Willow](https://wisprflow.ai/post/wispr-flow-vs-willow-voice) · [releases.sh](https://releases.sh/wispr-flow/releases)
- Avis et tests : [Booststash](https://booststash.com/wispr-flow-review-2025/) · [mrktcorrect, 90 jours](https://mrktcorrect.com/blog/wispr-flow-review) · [Nick Lafferty](https://nicklafferty.com/reviews/wispr-flow/) · [IC Eight](https://ic-eight.com/articles/wispr-flow-speech-captured-writing-needed-understanding.html) · [Shift IA (FR)](https://shiftia.fr/tests/wispr-flow-dictee-vocale-ia/) · [App Store FR](https://apps.apple.com/fr/app/wispr-flow-ai-voice-keyboard/id6497229487?see-all=reviews&platform=iphone) · [Sid Saladi](https://sidsaladi.substack.com/p/wispr-flow-101-the-complete-guide) · [Podfeet](https://www.podfeet.com/blog/2026/03/wispr-flow-scott-willsey/) · [MacPowerUsers](https://talk.macpowerusers.com/t/wisprflow-tip-press-enter-to-trigger-return/45142) · HN via [Algolia](https://hn.algolia.com/?q=wispr%20flow) (commentaires 49100131, 49072910, 48548002, 49747122)
- Prompts concurrents (règles de paragraphes reprises par des utilisateurs qui ont quitté Wispr) : [Handy discussion #715](https://github.com/cjpais/Handy/discussions/715). On y lit « Insert paragraph breaks at clear topic changes », « Auto bei Grußformeln », « Max 3-4 Sätze/Absatz », « Zweifelsfall: KEIN Absatz ».

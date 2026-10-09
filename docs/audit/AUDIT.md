# Audit UX/UI — CBW AI (fenêtre principale + overlay)

> Version auditée : `docs/audit/app-snapshot.html` et `docs/audit/overlay-snapshot.html`, copiés le 08/10/2026 depuis `design/app/app.html` et `design/overlay/overlay.html`.
> Captures faites en mode démo avec Electron à 960×640 @2x, dans `shots/`. Les noms préfixés `dark-` sont en thème sombre et `ov-*` sont l'overlay sur trois fonds (#FFFFFF, #1E1E1E, #3A6EA5). Les captures annotées sont nommées `shots/annotated-*.png`.
> Référentiels : `docs/SPEC.md`, `docs/APP_API.md`, `design/cbw/DESIGN.md`, `design/cbw/tokens.css`, `design/app/NOTES.md`, `design/overlay/NOTES.md`. Retours utilisateur pris en compte : noir trop dur, clair par défaut, plus d'air, animations, préchargeur, hiérarchie des CTA, inspiration 21st.dev.

---

## 1. Résumé exécutif

1. L'identité CBW Studio est forte et cohérente : grotesque condensée, mono en capitales, filets, trois couleurs d'état. On reconnaît l'app au premier coup d'œil. En revanche, l'**implémentation a dérivé des jetons**. Les boutons font 32 px au lieu de 46, les champs 32 au lieu de 46, les filets sont à 1 px au lieu de 2, et on compte une vingtaine de tailles de texte.
2. Le **parcours est trop long avant la première dictée** : 7 écrans, l'essai n'arrive qu'à l'étape 6, et l'étape 5 (« Moteur IA ») demande un téléchargement de 5 Go ou des clés API. Elle concentre le jargon et la friction.
3. La **hiérarchie des CTA est plate**. Plusieurs boutons noirs pleins par écran, des secondaires en contour aussi lourds que les primaires, et des liens bleus soulignés partout : rien ne guide l'œil vers l'action suivante.
4. Le **noir #111 occupe de grandes surfaces** (CTA de 400 px, nav active, bloc « Principe », pastille) et le mode sombre est quasi pur. Ça explique le ressenti « trop noir ». Le thème suit l'OS au lieu d'être clair par défaut.
5. Le mouvement est soigné par endroits (logo qui « parle », barres, coche dessinée) mais il **manque l'essentiel** : un préchargeur ou un hero, des micro-interactions sur les CTA, un indicateur d'onglet animé, des chiffres qui s'incrémentent, et des toasts ou transitions d'état dans le hub.

### Scores par axe

| Axe | Note /10 | En une phrase |
|---|---|---|
| Contenu | **6,5** | Tutoiement juste et phrases courtes, mais jargon technique (Ollama, Whisper, 401, gemma4:e4b) et trois noms pour la même chose. |
| Ergonomie / parcours | **5** | 7 étapes, l'essai arrive trop tard, l'étape Moteur est surchargée, Réglages forment une seule longue page. |
| Hiérarchie visuelle | **6** | Les titres sont puissants, mais le poids des CTA est mal réparti et les zones vides sont mal équilibrées. |
| Cohérence marque | **7** | L'ADN CBW est bien présent, mais les écarts aux jetons (tailles, filets, focus, ombre) s'accumulent. |
| Accessibilité | **5** | Bords de champs à 1,36:1, focus bleu sur noir à 2,85:1, pastille verte sur blanc à 2,0:1, `confirm()` natif. |
| Feedback / états | **7** | Les états d'autorisation et de test sont clairs. Mais des contradictions apparaissent (« Texte brut » à côté de dictées Gemini) et les erreurs sont peu guidées. |
| Micro-interactions | **4** | Hover = inversion noire brute, rien sur les flèches de CTA, pas de retour de pression, pas d'animation de chiffres. |

---

## 2. Audit de contenu

### 2.1 Problèmes transverses

| # | Constat | Exemple(s) exact(s) | Proposition |
|---|---|---|---|
| C1 | **Le nom de l'app change** selon les écrans : « CBW », « CBW AI », et « Dicta » dans la spec. | « Laisse CBW t'entendre. » / « CBW AI reste dans ta barre de menus. » / « CBW a écrit » | Écrire « CBW AI » dans les titres et la première occurrence, puis « CBW » dans le corps. Faire une seule passe de remplacement. |
| C2 | **Trois noms pour la même fonction** (insérer le texte) : Accessibilité, Collage automatique, Insertion. | Étape 3 « Accessibilité », récap étape 7 « Collage automatique », Réglages « Insertion » | Garder « **Collage automatique** » comme nom fonctionnel et mentionner « (autorisation Accessibilité) » en sous-texte. |
| C3 | **Trois noms pour le nettoyage** : Moteur IA, Nettoyage, Style. | Nav « Style », eyebrow « 03 · Nettoyage », Réglages « Moteur IA · ordre d'essai » | Nav « **Style** » pour le niveau, section Réglages « **Nettoyage IA** » pour les fournisseurs. Supprimer « Moteur ». |
| C4 | **Jargon technique** affiché à un utilisateur non technique. | « Ollama », « gemma4:e4b », « Whisper », « large-v3-turbo », « GLM-4.7-Flash », « Modèles « :free » », « Account ID Cloudflare », « GEMINI · GEMINI-2.5-FLASH-LITE · 1,2 S », « Clé refusée (401) » | Afficher les noms produits seulement là où c'est nécessaire (Réglages avancés). Partout ailleurs : « Modèle local (sur ton Mac) », « Transcription locale », « Nettoyé en 1,2 s ». Cacher le modèle derrière un « Détails ». |
| C5 | **Anglicismes** | « Revoir l'onboarding », « Account ID », « Mode démo » (ce dernier est acceptable) | « Revoir la présentation », « Identifiant de compte Cloudflare ». |
| C6 | **Ponctuation des titres incohérente** | « Laisse CBW t'entendre. » (point) / « Appuie deux fois sur fn » (sans point) / « Qui met ton texte au propre ? » | Tous les H1 d'onboarding se terminent par un point ou un « ? ». Le point orange de l'écran 1 peut devenir la signature de tous les H1. |
| C7 | **Typographie française** : guillemets séparés de leur contenu, espaces insécables manquantes. | Style › Standard : « (« » en fin de ligne, puis « jeudi, non vendredi » → « vendredi ») » (`shots/12-hub-style.png`) | Utiliser `&nbsp;` après « et avant », ainsi qu'avant `: ; ? !`. Le plus simple : une fonction `nbsp()` appliquée aux chaînes. |
| C8 | **Promesse incohérente avec le réglage par défaut** : l'onboarding montre une auto-correction (« trois, enfin non quatre » → « quatre »), alors que le niveau par défaut `light` ne fait *pas* d'auto-correction d'après la page Style. | Étape 6 « Euh je veux trois boutons, enfin non quatre » ; Style › Léger : « …livrer jeudi, non vendredi » conservé | Soit passer le défaut en **Standard** (c'est la promesse de la SPEC), soit changer la phrase d'essai pour un exemple sans auto-correction. Je recommande Standard par défaut. |

### 2.2 Écran par écran

**Étape 1 · Bienvenue** (`shots/01-onb.png`)
- « Parle. CBW écrit. » est excellent, on le garde.
- Les deux libellés du haut, « Dictée vocale · macOS » et « Transcription sur ton Mac », sont redondants avec ce qui suit. → Garder un seul : « Dictée vocale pour Mac · 100 % privée à la source ».
- Lede : « Appuie deux fois sur fn, parle comme tu parles. CBW AI retire les hésitations et colle un texte propre là où tu écris. » Le raccourci arrive avant d'avoir été configuré, et « parle comme tu parles » est une tautologie. → « **Parle naturellement. CBW AI enlève les « euh », corrige tes reprises et colle un texte propre là où tu écris.** »
- Le trio « 01 Tu parles / 02 L'IA met au propre / 03 C'est collé » est clair et bien fait.

**Étape 2 · Micro** (`02-onb.png`)
- « Le son est transcrit sur ton Mac, par Whisper. Rien n'est enregistré ni envoyé tant que tu n'actives pas le raccourci. » C'est inexact si un fournisseur cloud est actif : le *texte* est envoyé, même si l'audio ne l'est pas. → « Ta voix est transcrite **sur ton Mac**. Le micro ne s'ouvre que quand tu utilises le raccourci. »
- Le refus « Accès refusé. Active CBW AI dans Réglages Système › Confidentialité et sécurité › Micro, puis reviens ici. » est clair, mais il manque un bouton « Ouvrir Réglages › Micro ». Ce point est déjà noté hors contrat dans NOTES.

**Étape 3 · Accessibilité** (`03-onb.png`)
- Le H1 « Coche CBW AI dans Accessibilité. » est une injonction sans le bénéfice. → « **Autorise le collage automatique.** » avec en lede : « macOS demande l'autorisation *Accessibilité* pour que CBW détecte fn et colle le texte à ta place. »
- « macOS le demande pour deux choses : » suivi d'une liste numérotée : c'est lourd pour deux items. Une seule phrase suffit.
- « CBW AI est déjà coché mais rien ne change ? Réparer l'autorisation (retire l'ancienne entrée, puis recoche CBW AI). » est utile, mais doit apparaître **après** 10 s d'attente seulement, pas d'emblée.

**Étape 4 · Raccourci** (`04-onb.png`)
- La lede fait 4 phrases avec 3 `kbd`, ce qui est trop dense : « Deux appuis rapides sur fn : CBW écoute, mains libres. Un appui sur fn pour arrêter : le texte propre est collé. Tu peux aussi maintenir fn pendant que tu parles et relâcher. Échap annule. »
  → « **fn fn** pour commencer, **fn** pour coller. Ou garde fn enfoncée pendant que tu parles. » avec « Échap annule » en note.
- « Essaie : appuie sur les touches. » s'affiche en mode fn, alors que la page ne voit pas fn. La consigne est donc invérifiable et frustrante. → « Essaie : appuie deux fois sur fn. La pastille s'allume. »
- Note « « Autre… » : une combinaison avec au moins une touche de modification (⌥ ⌘ ⌃ ⇧), à maintenir. » → l'afficher **uniquement** quand on clique « Autre… ».

**Étape 5 · Moteur IA** (`05-onb.png`, `05c-engine-test-err.png`)
- H1 « Qui met ton texte au propre ? » : bonne question, mais elle oblige à un choix technique. → « **Choisis comment nettoyer ton texte.** »
- Cartes : « 100 % local · Gratuit, privé, fonctionne hors ligne » vs « Cloud gratuit · Plus rapide · une clé gratuite suffit ». Il manque le **coût réel** de chaque option (5 Go et ~2 min contre 1 min de création de compte). → Sous-titres : « Sur ton Mac · téléchargement unique de 5 Go » / « En ligne · 1 minute pour créer une clé gratuite ».
- Les tags « Ollama », « gemma4:e4b » sont à supprimer de l'onboarding.
- Erreur « Clé refusée (401). Vérifie qu'elle est complète. » → « **Cette clé ne marche pas.** Recopie-la en entier depuis Groq (elle commence par `gsk_`). »
- Erreur de téléchargement : « Le téléchargement a échoué : » + `err.message` brut (souvent en anglais). → « Le téléchargement s'est interrompu. Vérifie ta connexion puis **Reprendre**. » avec le détail technique repliable.
- « Ollama est installé mais arrêté. Ouvre-le, puis revérifie. » → « Le moteur local est en pause. Ouvre l'app Ollama, puis **Revérifier**. »

**Étape 6 · Essai** (`06-onb.png`, `06b-practice-done.png`)
- « À toi de parler. » : parfait.
- Après le premier essai, la phrase à dire (« Dis par exemple ») disparaît, remplacée par la comparaison (annotation 1 de `annotated-5-essai-overlay.png`). → Garder la consigne et empiler la comparaison dessous.
- La méta « GEMINI · GEMINI-2.5-FLASH-LITE · 1,2 S » → « Nettoyé en 1,2 s · Gemini ».
- « Bien joué. Réessaie autant que tu veux. » : OK.

**Étape 7 · Prêt** (`07-onb.png`)
- Le récap affiche « ! Micro — À autoriser » et « ! Moteur IA — Texte brut pour l'instant » sans action. → Chaque ligne en alerte doit porter un bouton tertiaire « Régler » qui renvoie à l'étape concernée.
- CTA « Ouvrir CBW AI » : l'utilisateur est *déjà* dans CBW AI. → « **Terminer** » ou « Aller à l'accueil ».

**Hub · Accueil** (`10-hub-home.png`)
- « Bonjour » : on peut ajouter le prénom (si connu) ou un rappel d'usage.
- Le pied de barre latérale « Texte brut · Aucun moteur IA disponible » est trop alarmiste et, en démo, contredit les dictées Gemini (annotation 1 de `annotated-3-accueil.png`). → « Nettoyage IA : à configurer » avec un lien.
- La carte « Moteur » liste 7 fois « Clé manquante ». → N'afficher que le fournisseur actif et ses quotas, plus « 6 autres options » repliées.
- Les libellés « 3,6 H » et « TEMPS GAGNÉ » ne disent pas par rapport à quoi. → Ajouter un tooltip « Comparé à la frappe à 40 mots/min ».

**Hub · Dictionnaire** (`11-hub-dict.png`)
- C'est la meilleure page du hub. Placeholder « Ajoute un mot, par ex. Supabase » → « Ajoute un mot, un prénom, une marque… (Entrée) ».
- L'exemple « Whisper entend » contient du jargon. → « Sans dictionnaire ».

**Hub · Style** (`12-hub-style.png`)
- Voir C7 et C8. « Choisis jusqu'où CBW range ta phrase. » est un bon micro-texte.

**Hub · Réglages** (`13*-hub-settings*.png`)
- « Tout ce qui fait tourner CBW AI, au même endroit. » : la phrase n'apporte rien. → La supprimer et la remplacer par un index de sections (voir §3).
- « Touche 🌐 / fn — Réglages Système › Clavier › « Appuyer sur 🌐 pour » doit être sur « Ne rien faire » ». → « Réserve la touche fn à CBW » avec un bouton « Régler pour moi ».
- « Garder le brut en cas d'échec » : la formulation est floue. → « **Si le nettoyage échoue, colle quand même le texte brut** ».
- « Modèle Whisper — Plus grand = plus précis, plus lent » avec des options « tiny — 75 Mo »… → « Précision de la transcription » avec Rapide / Équilibré / Précis (recommandé), et les noms techniques en sous-texte.
- `confirm()` natif pour fn : la boîte grise système casse la marque. → Utiliser une modale CBW.

**Overlay** (`ov-*.png`)
- Libellés « ÉCOUTE / TRANSCRIPTION / MISE AU PROPRE / COLLAGE / COLLÉ » : courts et justes.
- L'erreur par défaut « ÉCHEC DE LA DICTÉE » ne dit ni pourquoi ni quoi faire. Prévoir des messages types : « MICRO INTROUVABLE · VÉRIFIE L'ENTRÉE AUDIO », « HORS LIGNE · TEXTE BRUT COLLÉ », « RIEN ENTENDU · RÉESSAIE ».

---

## 3. Ergonomie / parcours

### 3.1 Onboarding : 7 → 4 étapes

| Actuel | Proposé | Pourquoi |
|---|---|---|
| 1 Bienvenue | **1 Bienvenue** (hero + préchargeur) | Inchangé, mais plus court. |
| 2 Micro + 3 Accessibilité | **2 Autorisations** : une checklist de 2 lignes (Micro, Collage auto), chacune avec son bouton et son état live | Même nature de tâche (popups système). On économise un écran et on supprime un « Plus tard ». |
| 4 Raccourci + 6 Essai | **3 Essai** : le raccourci s'apprend *en dictant* dans le brouillon. Le choix « fn ×2 / ⌥ Espace / Autre » passe en lien tertiaire. | Le raccourci n'a pas de valeur seul. La **première dictée passe de l'étape 6 à l'étape 3**. |
| 5 Moteur IA | **Sorti du parcours obligatoire.** Après l'essai, montrer le résultat brut puis « Active le nettoyage IA » avec une seule option recommandée (Groq ou Gemini, 1 clé) et « Plus tard ». Le local de 5 Go se propose dans le hub. | Le passthrough (texte brut) marche déjà. Montrer d'abord la valeur (brut contre propre) motive la configuration. |
| 7 Prêt | **4 Prêt** : récap avec actions « Régler » | Inchangé, CTA « Terminer ». |

Estimation du **temps jusqu'à la première dictée** : environ 2 à 4 min aujourd'hui (et jusqu'à plus de 10 min si on lance les 5 Go), contre moins de 60 s avec ce nouveau parcours.

### 3.2 Configuration des fournisseurs (`annotated-1-moteur.png`)
- **Débordement** : la colonne cloud contient 6 fournisseurs, soit environ 900 px de contenu dans 640 px de fenêtre. Elle est coupée net sans ombre ni indice de défilement (annotation 1).
- **Bug de logique** : « Plus tard » disparaît dès qu'un caractère est saisi dans une clé (`engineConfigured()` teste seulement si la chaîne est non vide), même si le test échoue (`05c-engine-test-err.png`). L'utilisateur peut alors « Continuer » avec une clé invalide.
  → `engineConfigured = olState.modelPresent || CLOUD.some(id => testOk[id])`. Tester automatiquement au collage (`paste`) et à la perte de focus.
- **Proposition** : une carte « Recommandé » (Groq, avec le chemin le plus court : « 1. Crée un compte → 2. Copie la clé → 3. Colle ici »), puis un `<details>` « Autres fournisseurs (5) ». Le champ Cloudflare « Account ID » n'apparaît que dans ce repli.
- Dans Réglages : remplacer les flèches ↑/↓ par un **glisser-déposer** avec poignée (⋮⋮), garder les flèches pour le clavier, et replier chaque fournisseur sans clé sur une ligne (`annotated-4-reglages.png`).

### 3.3 Trouver les réglages
- Réglages est **une seule page de 7 sections** (environ 2 400 px). Il n'y a pas d'ancre, pas de recherche, et le titre de section défile sous le dégradé de la `dragstrip` (annotation 1 de `annotated-4-reglages.png`).
  → Ajouter un **index collant** à gauche du contenu ou des onglets en haut : Général · Nettoyage IA · Transcription · Confidentialité · À propos. L'indicateur d'onglet animé est décrit au §6.
- Paramètres attendus qui manquent : **Thème** (Clair / Sombre / Système), **Overlay au repos** (Discret / Masqué, prévu dans `overlay/NOTES.md` mais absent), **Son de début/fin**.
- La carte « Moteur » de l'Accueil a un lien « Gérer » qui fait défiler vers `#settings-engine`, mais le titre arrive caché sous la barre de 40 px. Il faut un `scroll-margin-top: 56px`.

### 3.4 États vides et récupération d'erreur
- **Accueil vide** : « Aucune dictée pour l'instant. Appuie deux fois sur fn et parle. » → ajouter un bouton secondaire « Faire un essai » qui ouvre un brouillon. Les stats à 0 s'affichent en display de 54 px, ce qui démotive. → Les remplacer par une carte « Ta première dictée débloque tes stats ».
- **Erreurs** : aucune erreur n'a de bouton de reprise, sauf le test de clé. Il faut des actions « Réessayer », « Reprendre le téléchargement » et « Ouvrir Réglages › Micro ».
- Le texte brut collé en fallback n'est pas signalé dans le hub. Ajouter un badge « Brut » sur la dictée concernée dans « Dernières dictées ».

### 3.5 Clavier et focus
- Entrée = Suivant marche (hors champs). ← → ne naviguent pas entre étapes, et Échap ne fait rien en onboarding. → Ajouter ⌘← / ⌘→ et afficher « ↩ » discrètement dans le CTA primaire.
- Le **focus** est un contour bleu de 2 px (`:focus-visible`), alors que DESIGN.md demande 3 px avec 2 px de décalage. Sur la nav active noire, `outline-offset:-3px` donne du bleu #2B3BFF sur #111, soit **2,85:1**, ce qui est sous le seuil de 3:1 (WCAG 1.4.11).
- Les **champs** au focus ne prennent pas l'anneau bleu : seule la bordure devient noire. C'est incohérent avec le reste.
- Le bouton copier des dictées est `opacity:0` hors survol. Il est atteignable au clavier, mais invisible à la souris tant qu'on ne survole pas.
- Les `seg` (fn ×2 / ⌥ Espace) sont des radios : les flèches marchent nativement. C'est bien.

---

## 4. UI

### 4.1 Hiérarchie et CTA
Inventaire actuel des niveaux de bouton :

| Classe | Rendu | Problème |
|---|---|---|
| `.btn.primary.lg` | noir plein, 42 px, flèche → | Il occupe 400 px de large dans le pied (`min-width:200px` + padding) : c'est le plus gros bloc noir de l'écran. |
| `.btn.primary` (dans le contenu) | noir plein, 32 px | « Télécharger le modèle (≈ 5 Go) » et « Ajouter » concurrencent le CTA de pied (annotation 2 de `annotated-1-moteur.png`). |
| `.btn` | contour 1 px noir, 32 px, **hover = fond noir plein** | Le secondaire devient primaire au survol : la hiérarchie s'inverse. |
| `.btn.ghost` | texte gris, souligné au survol | Correct comme tertiaire. |
| `.link` | bleu souligné 1 px | Il y a 6 « Obtenir une clé » bleus à l'écran, ce qui fait plus de bleu que d'actions réelles. |

**Système proposé (3 niveaux + lien)**

| Niveau | Usage | Style |
|---|---|---|
| **Primaire** (1 par écran max) | Continuer, Terminer, Ajouter | Fond `--encre` (#1C1C1E), texte blanc, 44 px, padding 0 20 px, `min-width:auto`. La flèche glisse de 4 px au survol. Au clic, `scale(.98)` pendant 120 ms. |
| **Secondaire** | Tester, Autoriser le micro (dans une ligne), Télécharger | Fond `--fond-2`, **sans bordure** (ou 1 px `--fil-fort`), texte `--texte`, 36 px. Au survol, fond `--fond-3` et bordure `--texte` : **jamais d'inversion noire**. |
| **Tertiaire** | Plus tard, Retour, Revérifier, Changer | Texte seul, `--texte-sec`. Au survol, `--texte` avec un soulignement qui se dessine de gauche à droite (scaleX, 200 ms). |
| **Lien externe** | Obtenir une clé | Mono 12 px `--texte-sec` + « ↗ ». Le bleu est réservé à « IA / traitement » (règle de marque). |

### 4.2 Rythme d'espacement (paddings mesurés dans le CSS)

| Élément | Valeur | Remarque |
|---|---|---|
| Barre de titre | 52 px, padding 0 20 / 0 88 | OK (feux macOS). |
| Colonne texte d'onboarding | `padding: 0 40px`, `max-width:480px` | OK. |
| Pied d'onboarding | 72 px, `padding: 0 24px 0 40px` | **Asymétrique (40 contre 24)** : le CTA colle au bord droit. → 0 40 px. |
| En-tête Moteur | `26px 40px 18px` | 26 et 18 sont hors de la grille de 4 px. |
| Cartes Moteur | `18px 24px 16px 40px` / `… 40px` | Quatre valeurs différentes. |
| Page hub | `48px 40px`, `max-width:760px` | Sur 748 px utiles, on obtient 668 px de contenu : c'est bien, mais **la largeur n'est pas centrée** et laisse un vide à droite à 960 px et plus. |
| Ligne de réglage | `padding:10px 0; min-height:52px` | Dense. → 16 px / 64 px pour plus d'air. |
| Stats | `14px 16px` | Dense pour des chiffres de 54 px. → 20/24. |
| Écarts relevés | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 26, 28, 30, 34 px | **20 valeurs** pour une grille qui en prévoit 8 (`--e-1…--e-8`). |

→ Imposer `--e-*` partout et ajouter `--e-9: 80px` pour les respirations de hero. Ça répond directement au retour « plus de blanc » : on passe à 24 au lieu de 10–14 entre les blocs, et à 48 au lieu de 26–34 entre les sections.

### 4.3 Échelle typographique
Il y a **21 tailles** dans le fichier : 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 18, 20, 22, 26, 28, 30, 34, 38, 52, 54, 92.
Échelle proposée (ratio ~1.25, alignée sur les tokens) : **11 (label mono) · 13 (petit) · 15 (corps) · 18 (lead) · 22 (H3) · 32 (H2) · 44 (H1) · 72–96 (display)**. Le corps passe de 14 à 15 px, comme le prévoit DESIGN.md. Les labels mono descendent à 10,5 px et 9,5 px (`.active-tag`), ce qui est trop petit en mono capitales. Il faut un **minimum de 11 px**.

### 4.4 Contrastes WCAG (calculés)

| Paire | Ratio | Verdict |
|---|---|---|
| `--texte` #111 / blanc | 18,9:1 | AAA. Contraste maximal, d'où le ressenti « trop noir ». |
| `--texte-2` #4A4A4A / blanc | 8,9:1 | AAA |
| `--texte-2` #4A4A4A / `--gris` #F4F4F2 | 8,1:1 | AAA |
| `--texte-3` #8A8A86 / blanc (placeholders) | 3,5:1 | **Échec AA texte** (4,5). → #6E6E6A (≈ 5:1). |
| `--texte-3` / `--gris` | 3,2:1 | Échec |
| `--fil` #DDD / blanc (**bord des champs**) | **1,36:1** | **Échec 1.4.11** (3:1 requis). Le champ est invisible. → bord #949490 (3,0:1) ou 2 px `--trait` comme le dit DESIGN.md. |
| orange #FF5A1F / blanc (texte ou icône) | 3,1:1 | Passe pour les éléments graphiques, **échoue pour du texte**. → Version texte #C2410C (5,2:1). |
| noir / orange | 6,1:1 | AA |
| blanc / orange | 3,1:1 | Échec (règle déjà respectée). |
| blanc / bleu #2B3BFF | 6,6:1 | AA |
| bleu #2B3BFF / blanc (liens) | 6,6:1 | AA |
| vert #1FD26A / blanc (pastilles « ok ») | **2,0:1** | **Échec 1.4.11** : la pastille verte seule ne suffit pas. Ajouter une coche ✓ ou un bord noir, ou utiliser #15803D (5,0:1) pour les petites pastilles. |
| noir / vert (badges) | 9,4:1 | AAA |
| erreur #B3261E / blanc | 6,5:1 | AA |
| focus #2B3BFF / #111 (nav active) | **2,85:1** | Échec : utiliser un anneau blanc + bleu (double anneau). |
| sombre : `--texte-sec` #A8A8A4 / #111 | 7,9:1 | AAA |
| sombre : `--texte-3` #6E6E6A / #111 | 3,7:1 | Échec texte |
| sombre : `--fil` #2E2E2E / #111 | 1,39:1 | Échec bords |
| overlay : libellé blanc 62 % / #111 | 7,7:1 | OK |
| overlay : barres #2B3BFF / #111 | 2,85:1 | Faible (déjà corrigé en #5A67FF, 4,3:1) |
| overlay : barres erreur #B3261E / #111 | **2,9:1** | → #FF6B5E (6,8:1) |
| overlay : étiquette #111 sur fond d'app #1E1E1E | **1,13:1** | L'overlay disparaît sur fond sombre (annotation 5). |
| pastille « Prêt » d'onboarding (opacité .8) | 4,3:1 | Limite. Supprimer l'opacité. |

### 4.5 Densité, alignement, iconographie
- **Alignement** : le CTA de Bienvenue est aligné en bas à droite, loin de la lede (annotation 4 de `annotated-2-bienvenue.png`), et le haut droit du hero est vide (annotation 2). → Mettre le CTA sous la lede, dans le flux, et étendre le H1 sur toute la largeur ou placer la démo brut→propre à droite.
- **Compteur d'étape en double** : « ÉTAPE 02 SUR 07 · MICRO » (barre) et « ÉTAPE 2 SUR 7 · MICRO » (eyebrow), avec des formats différents. → Supprimer l'un des deux. Je recommande de garder l'eyebrow et de mettre seulement les segments dans la barre.
- **Interrupteur** : à OFF, le carré noir est à gauche. Visuellement, un carré noir plein se lit comme « coché » (annotation 4 de `annotated-1-moteur.png`). → À OFF, bouton `--texte-3` creux. À ON, piste pleine avec bouton blanc. Ajouter « Oui/Non » en mono 10 px dans la piste.
- **Icônes** : les `<svg>` de la nav et des stats sont vides ou `display:none` (code mort). Les icônes moteur (puce, nuage) sont les seules du système. → Soit un vrai set 16 px trait 1,5 carré (style Lucide, extrémités carrées), soit aucune icône. Ne pas mélanger.
- **Pastilles de couleur décoratives** : les stats sont en noir, vert, orange, bleu (annotation 3 de `annotated-3-accueil.png`). Ça contredit « les accents sont des signaux ». → Tout en neutre, sauf la stat qui progresse aujourd'hui (vert).
- **Badge « Mode démo »** posé dans la zone de glisser du hub. → Le déplacer en bas de la barre latérale.

### 4.6 Parité clair / sombre et « trop noir »
- Le sombre (`dark-*.png`) utilise un fond **#111** quasi pur, des panneaux #161616 et #1A1A1A (écarts de 2 %), et un actif de nav **#F4F4F2 plein**. On obtient un énorme bloc blanc qui éblouit (`dark-10-hub-home.png`).
- Les filets sombres #2E2E2E sur #111 sont à 1,39:1 : la structure disparaît.
- **Propositions** :
  - **Clair par défaut** : `document.documentElement.dataset.theme = cfg['ui.theme'] || 'light'`, avec un choix Clair / Sombre / Système dans Réglages.
  - **Noir adouci** : `--encre: #1C1C1E` pour les grandes surfaces (CTA, bandes, pastille) et `--noir: #111` réservé au texte. Surtout, **réduire la surface noire** : nav active = fond `--fond-3` (#ECECE8) + barre gauche 3 px `--texte`, au lieu d'un bloc noir. Le bloc « Principe » passe en `--fond-2` avec un filet gauche orange.
  - **Sombre « graphite »** : fond #17181A, `--fond-2` #1F2022, surface #232427, texte #ECECEA (15:1), `--texte-sec` #A3A3A0 (6,5:1), `--fil` #3A3B3E. Nav active = #2A2B2E + barre gauche claire.

### 4.7 Lisibilité de l'overlay (`ov-*.png`)
- On le lit bien sur fond clair. Sur fond sombre, l'étiquette #111 et le liseré `#ffffff22` disparaissent (1,13:1).
  → Liseré à `#ffffff40`, ombre `0 0 0 1px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.35)`, fond #1C1C1E.
- L'**idle 26×12 px** est trop petit pour être utile sur un écran Retina de 3 024 px (annotation 7). → 32×14 avec des carrés de 5 px, ou masqué par défaut avec un réglage.
- Le texte partiel est rogné **à gauche** avec un fondu : c'est bien. Le libellé à 11 px mono avec `letter-spacing .08em` reste lisible.

---

## 5. Animations

### 5.1 Ce qui existe
| Où | Animation | Timing |
|---|---|---|
| Changement d'étape | glissement X ±24 px + fondu | 350–500 ms `--ease` |
| Bienvenue | barres du logo `barIn` → `speak` → `breathe` ; trio `scaleX` ; « euh » barrés ; phrase propre `rise` | 700 ms / 2,6 s / 4,5 s ∞ ; 900 ms ; 500 ms à +1,6 s ; 500 ms à +2,4 s |
| Micro | bouton « Autoriser » `ring` orange ∞ ; coche dessinée | 2 s ∞ ; 450 ms |
| Accessibilité | curseur qui clique l'interrupteur ∞ | 3,2 s |
| Raccourci | touches qui s'enfoncent (vraies frappes) | 120 ms |
| Essai | gerbe de barres (confettis) | 1,1 s |
| Hub | `pageIn` translateY 8 px | 350 ms |
| Puces du dictionnaire | `rise` | 250 ms |
| Overlay | largeur, vague, respiration, cascade, secousse | 280 / 960 / 1400 / 340 / 320 ms |
| Mouvement réduit | coupe tout (1 ms), affiche les états finaux | — |

### 5.2 Ce qui manque
1. **Préchargeur / hero de lancement** (demande explicite). Rien ne se passe pendant le chargement des polices, et le texte en repli Helvetica clignote (FOUT).
2. **Micro-interactions des CTA** : le hover se limite à `translateY(-1px)` et à une inversion de couleur brutale en 150 ms. La flèche → ne bouge pas, et il n'y a aucun état « chargement » sur Tester ou Télécharger (seul un message apparaît à côté).
3. **Indicateur actif** de la nav et des segments : il saute au lieu de glisser.
4. **Chiffres des stats** : ils s'affichent d'un bloc, sans ticker.
5. **Toasts** : « Effacé », « Copié » et l'enregistrement d'une clé ne donnent pas de retour global. La clé est enregistrée à la frappe sans aucun signal.
6. **Ouverture des sections Réglages** : pas d'accordéon, pas de surbrillance à l'arrivée d'une ancre.
7. **Hover des cartes** : DESIGN.md prévoit `0 6px 0 var(--trait)` et une barre qui grandit de 44 px à 100 %. Ce n'est implémenté qu'en `.ecard.sel`.

### 5.3 Jetons de mouvement recommandés
```css
:root{
  --d-micro: 120ms;   /* pression, focus */
  --d-court: 200ms;   /* hover, couleur */
  --d-moyen: 320ms;   /* changement d'état, onglet */
  --d-long: 560ms;    /* entrée d'écran */
  --d-hero: 1100ms;   /* préchargeur total */
  --ease-sortie: cubic-bezier(.16,1,.3,1);   /* expo-out : entrées, indicateurs */
  --ease-std:    cubic-bezier(.2,.7,.2,1);   /* existant --ease */
  --ease-rideau: cubic-bezier(.7,0,.15,1);   /* existant : masques, rideaux */
  --ease-press:  cubic-bezier(.3,0,.5,1);    /* appui */
}
```
Règles : hover ≤ 200 ms ; changement d'état 320 ms ; jamais plus de 600 ms pour une interaction ; décalage en cascade 40–60 ms ; pas de ressort, ce qui est cohérent avec la marque.

### 5.4 Mouvement réduit
Le bloc actuel (`* { animation-duration:1ms !important }`) fonctionne mais il est brutal. Il coupe aussi l'indicateur de progression utile, transformé en barre fixe à 50 % d'opacité.
→ Garder les **fondus d'opacité** (≤ 200 ms) et les transitions de couleur. Supprimer les déplacements, échelles, confettis, préchargeur (affichage direct du logo final), shimmer et ticker (valeur finale directe). Pour le préchargeur : `if (reduced()) skip`.

---

## 6. Recommandations priorisées

Effort : S < ½ j · M ≈ 1–2 j · L > 2 j.

| Prio | Effort | Changement exact |
|---|---|---|
| **P0** | S | **Clair par défaut** : `dataset.theme = cfg['ui.theme'] ?? 'light'`, puis ajouter Réglages › Général › Thème (Clair / Sombre / Système). |
| **P0** | S | **Adoucir le noir** : `--encre:#1C1C1E` pour boutons, bandes et pastille. Nav active = `--fond-3` + barre gauche 3 px (fin du bloc noir). Bloc « Principe » sur `--fond-2`. Thème sombre graphite (#17181A / #1F2022 / #232427, texte #ECECEA, filet #3A3B3E). |
| **P0** | M | **Hiérarchie des CTA à 3 niveaux** (§4.1) : un seul primaire par écran, le secondaire en fond `--fond-2` sans inversion noire au survol, le tertiaire en texte. « Télécharger le modèle » et « Ajouter » passent en secondaire. Le CTA de pied passe en `min-width:auto`. |
| **P0** | S | **Bug « Plus tard »** à l'étape Moteur : `engineConfigured()` doit se baser sur `testOk[id]`. Tester automatiquement au collage de la clé. |
| **P0** | S | **Bords de champs** : passer de `1px #DDD` à `1px #949490` (ou 2 px `--trait`, conforme à DESIGN.md). Focus des champs = anneau bleu 3 px + 2 px de décalage. Sur la nav active, double anneau `0 0 0 2px var(--fond), 0 0 0 4px var(--focus)`. |
| **P0** | M | **Onboarding 7 → 4** (§3.1) : fusionner Micro et Accessibilité, fusionner Raccourci et Essai, sortir Moteur IA du chemin obligatoire et le proposer après l'essai avec 1 fournisseur recommandé. |
| **P0** | S | **Cohérence de la promesse** : `cleaning.level` par défaut à `standard` (ou phrase d'essai sans auto-correction). |
| **P1** | M | **Préchargeur / hero de lancement** (« jeu de couleur ») : voir le motif A ci-dessous. Une seule fois par lancement, 1,1 s maximum, sautable au clic ou avec Entrée. |
| **P1** | M | **Fournisseurs** : une carte recommandée + `<details>` « Autres fournisseurs (5) ». Ombre de défilement en haut et en bas de `#obKeys` (`mask-image: linear-gradient(transparent, #000 16px, #000 calc(100% - 24px), transparent)`). |
| **P1** | S | **Micro-interactions des CTA** : flèche qui glisse, appui, état de chargement (motif B). |
| **P1** | M | **Réglages** : index de sections collant ou onglets avec indicateur animé (motif C), `scroll-margin-top:56px` sur `.group-title`, et rangées repliables pour les fournisseurs sans clé. |
| **P1** | S | **Jargon** : réécritures du §2 (401, gemma4:e4b, Whisper, onboarding, Account ID). Les noms techniques passent sous « Détails ». |
| **P1** | S | **Espacements** : uniquement des `--e-*`. Lignes de réglage à 16 px / 64 px, pied d'onboarding à 0 40 px, sections à 48 px, contenu du hub centré (`margin-inline:auto`). |
| **P1** | S | **Échelle typographique** réduite à 8 tailles (§4.3), labels mono à 11 px minimum. |
| **P1** | S | **Ticker pour les stats** à l'ouverture de l'Accueil (motif D). |
| **P1** | S | **Contrastes** : `--texte-3` → #6E6E6A en clair et #8C8C88 en sombre. Pastilles vertes avec une coche ou en #15803D pour les éléments ≤ 10 px. Barres d'erreur de l'overlay en #FF6B5E. Pastille d'essai sans opacité. |
| **P1** | S | **Overlay** : fond #1C1C1E, liseré `#ffffff40` + ombre portée pour les fonds sombres. Idle à 32×14. Messages d'erreur avec cause et action. |
| **P1** | S | **Interrupteur** lisible à OFF (bouton creux gris) et à ON (piste pleine, bouton blanc). |
| **P2** | S | **Toasts** « Copié », « Clé enregistrée », « Historique effacé » : barre mono en bas à droite, entrée en 200 ms `--ease-sortie`, sortie après 1,8 s. |
| **P2** | M | **Fond grille / bruit** discret sur le hero et les panneaux d'illustration (motif E). |
| **P2** | S | **Révélation du texte** des H1 à l'entrée d'étape (motif F). |
| **P2** | S | **Shimmer de libellé** « Mise au propre… » dans la pastille d'essai et l'overlay (motif G, déjà amorcé dans l'overlay). |
| **P2** | M | Remplacer `confirm()` (fn) par une modale CBW. Ajouter « Ouvrir Réglages › Micro » si l'accès est refusé (demande de pont). |
| **P2** | S | Supprimer le compteur d'étape en double et le code mort (`<svg>` vides de la nav et des stats). |
| **P2** | M | Glisser-déposer pour l'ordre des fournisseurs (en gardant ↑/↓ pour le clavier). |

### Motifs inspirés de 21st.dev, adaptés en CSS/JS vanilla et à la marque (coins droits, sans flou)

**A. Préchargeur « jeu de couleur ».** Inspirations : *Blur Reveal* (tom_ui) et *Animated Grid Pattern* (Magic UI / Dillion Verma), sans le flou, qui est interdit par la marque.
Séquence en 1 100 ms au premier affichage :
0–420 ms : les 5 barres du logo montent en `scaleY` avec un décalage de 50 ms (`--ease-rideau`). Pendant la montée, chaque barre **change de couleur** orange → bleu → vert → orange (keyframes `background`, `steps(3)`). C'est le « jeu de couleur ».
420–700 ms : toutes les barres repassent en noir, sauf la centrale qui reste orange (logo final).
700–1 100 ms : un rideau blanc remonte (`clip-path: inset(0 0 100% 0)`, `--ease-rideau`, 400 ms) et révèle l'écran Bienvenue. Les lignes du H1 montent en masque (motif F).
```css
.boot{position:fixed;inset:0;z-index:99;background:var(--fond);display:grid;place-items:center;animation:bootOut .4s var(--ease-rideau) .7s forwards}
.boot i{width:14px;margin:0 5px;transform-origin:bottom;animation:barUp .42s var(--ease-rideau) both, hue .42s steps(3) both}
.boot i:nth-child(2){animation-delay:.05s}.boot i:nth-child(3){animation-delay:.1s} /* … */
@keyframes barUp{from{transform:scaleY(0)}}
@keyframes hue{0%{background:var(--orange)}33%{background:var(--bleu)}66%{background:var(--vert)}100%{background:var(--texte)}}
@keyframes bootOut{to{clip-path:inset(0 0 100% 0);visibility:hidden}}
@media (prefers-reduced-motion:reduce){.boot{display:none}}
```
Attendre aussi `document.fonts.ready` (avec un plafond de 600 ms) avant de lancer `bootOut`, ce qui supprime le FOUT.

**B. CTA « arrow-slide » + appui + chargement.** Inspirations : *Magnetic Button* (pauloriveross) en version légère, et *Shiny CTA Button* (spydiecy) / *Shimmer Button* (Magic UI) pour l'état « en cours ».
- Hover : la flèche `::after` fait `translateX(4px)` en 200 ms `--ease-sortie`. Le fond passe de `--encre` à #2A2A2D. Pas de déplacement vertical.
- Active : `scale(.98)` en 120 ms `--ease-press`.
- Magnétisme discret, uniquement sur le CTA primaire : `pointermove` → `translate(dx*.15, dy*.25)` borné à 3 px, retour en 320 ms. À désactiver en mouvement réduit.
- Chargement (Tester, Télécharger) : un reflet en biais traverse le bouton, `background: linear-gradient(100deg, transparent 40%, rgba(255,255,255,.18) 50%, transparent 60%) -100%/250% 100%` animé sur `background-position` en 1 200 ms linéaire ∞. Le libellé passe à « Test… ». C'est l'équivalent du *shimmer* sans arrondi.
- Variante « border beam » (*Border Beam*, GooseUI / Magic UI) **réservée à un seul moment** : le bouton « Activer le nettoyage IA » après l'essai. Un segment bleu de 24 px fait le tour du cadre carré (4 `linear-gradient` animés sur `background-position`, 2,4 s linéaire ∞). Coins droits, donc pas de `conic-gradient` arrondi.

**C. Indicateur d'onglet animé.** Inspirations : *Animated Tabs* (ibelick / Motion Primitives) et *Magnetic Tabs* (ruixen.ui). S'applique à la nav latérale, aux `.seg` (Propre/Brut, fn ×2/⌥ Espace, Léger/Standard) et aux onglets de Réglages.
Un seul élément `.ind` en position absolue, déplacé par JS selon l'élément actif (`offsetTop`/`offsetLeft`/`offsetWidth`) : `transition: transform 320ms var(--ease-sortie), width 320ms var(--ease-sortie)`. Dans la nav, c'est une barre gauche de 3 px avec un fond `--fond-3`. Au survol d'un autre item, l'indicateur s'en approche de 2 px pendant 200 ms (effet « magnétique »).

**D. Number ticker** (*Number Ticker*, Magic UI / Dillion Verma). À l'entrée de l'Accueil, chaque `.stat .n` compte de 0 jusqu'à la valeur en 900 ms avec `easeOutExpo`, décalé de 80 ms entre tuiles, en `requestAnimationFrame`. Formater avec `toLocaleString('fr-FR')` à chaque frame et garder `tabular-nums` pour éviter les sauts. Quand une dictée arrive (`onDictation`), ne faire défiler que le delta (+37 mots) et faire flasher l'unité en vert pendant 600 ms.

**E. Fond grille / bruit** (*Animated Grid*, Motiq ; *Background Snippets – noise*, larsen66). Sur `.illus` et le hero : grille carrée de 24 px en `--fil` à 40 % (`background-image: linear-gradient(var(--fil) 1px, transparent 1px), linear-gradient(90deg, var(--fil) 1px, transparent 1px)`), masquée en radial (`mask-image: radial-gradient(closest-side, #000, transparent)`). Grain en SVG `feTurbulence` inline en data-URI, opacité .04. Dérive très lente (`background-position` 40 s linéaire ∞), coupée en mouvement réduit. La texture est assez discrète pour ne pas violer la règle « pas de dégradés ».

**F. Révélation du texte du hero / des H1** (*Blur In Text*, Animbits ; *Blur Reveal*, tom_ui, version sans flou). Chaque ligne du H1 est enveloppée dans `<span class="ln"><span>…</span></span>`, avec `overflow:hidden` et le contenu en `translateY(105%) → 0`, 560 ms `--ease-rideau`, décalage de 70 ms. C'est le « mask-up » déjà prescrit par DESIGN.md §6.

**G. Shimmer de texte** (*Shimmer Text*, edwinvakayil / uimix). Sur « Mise au propre… » et « Transcription… » : `background: linear-gradient(90deg, var(--texte-sec) 0 40%, var(--texte) 50%, var(--texte-sec) 60% 100%) 0/300% 100%; -webkit-background-clip:text; color:transparent; animation: sh 1.6s linear infinite`. Déjà présent dans l'overlay, à généraliser à la pastille d'essai et aux tests de clé.

---

### Annexes : captures
- Annotées : `shots/annotated-1-moteur.png`, `shots/annotated-2-bienvenue.png`, `shots/annotated-3-accueil.png`, `shots/annotated-4-reglages.png`, `shots/annotated-5-essai-overlay.png`.
- Onboarding : `shots/01-onb.png` … `shots/07-onb.png`, états `02b-mic-granted`, `03b-access-ok`, `05b-engine-progress`, `05c-engine-test-err`, `06b-practice-done`, `06c-practice-rec` (et `dark-*`).
- Hub : `shots/10-hub-home.png`, `10c-hub-home-empty`, `11-hub-dict`, `12-hub-style`, `13-hub-settings`, `13b…13d` (et `dark-*`).
- Overlay : `shots/ov-{idle,recording,recording-partial,transcribing,cleaning,done,error}-{FFFFFF,1E1E1E,3A6EA5}.png`.

### Sources 21st.dev consultées
- [Shimmer Button — Magic UI / dillionverma](https://21st.dev/@dillionverma/components/shimmer-button.md)
- [Shiny CTA Button — spydiecy](https://21st.dev/@spydiecy/components/shiny-cta-button.md)
- [Border Beam — GooseUI](https://21st.dev/@gooseui/components/border-beam.md)
- [Border Beam Button — Jakubantalik](https://21st.dev/@Jakubantalik/components/border-beam-button.md)
- [Number Ticker — dillionverma](https://21st.dev/@dillionverma/components/number-ticker.md)
- [Animated Tabs — ibelick](https://21st.dev/@ibelick/components/animated-tabs.md)
- [Magnetic Tabs — ruixen.ui](https://21st.dev/@ruixen.ui/components/magnetic-tabs.md)
- [Magnetic Button — pauloriveross](https://21st.dev/@pauloriveross/components/magnetic-button.md)
- [Blur Reveal — tom_ui](https://21st.dev/@tom_ui/components/blur-reveal.md)
- [Blur In Text — animbits](https://21st.dev/@animbits/components/text-blur-in.md)
- [Animated Grid — rmahammad](https://21st.dev/@rmahammad/components/animated-grid.md)
- [Animated Grid Pattern — dillionverma](https://21st.dev/@dillionverma/components/animated-grid-pattern.md)
- [Background grid spotlight noise — larsen66](https://21st.dev/@larsen66/components/background-snippets-noise-effect11/background-grid-spotlight-blue-noise)
- [Shimmer Text — edwinvakayil](https://21st.dev/@edwinvakayil/components/shimmer-text.md)

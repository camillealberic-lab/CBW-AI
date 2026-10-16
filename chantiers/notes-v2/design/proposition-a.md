# Proposition A : « Le carnet d’abord »

Maquette jouable : `maquette-a.html` (étapes 1 à 4 en haut, options : notification « appel détecté », remplir l’exemple, fin d’appel, panne IA, mouvement réduit, thème sombre).

## En bref (10 lignes)
1. **Idée** : une page à toi, une marge pour la machine. La page porte tes mots (noir) et les ajouts de l’IA (gris). La marge porte l’heure, la source (loupe) et l’état.
2. **Signature** : le trait de marge du carnet change de couleur : orange pendant l’enregistrement, pointillé en pause, bleu qui se remplit pendant l’écriture, vert à « Note prête ». Une seule ligne de 2 px donne tout l’état.
3. **Avant** : notification maison 1 min avant (barre pleine) ou « appel détecté » (barre pointillée). Un clic démarre. « Vous êtes 4 ? » s’affiche en bandeau non bloquant, avec la phrase de consentement à copier.
4. **Pendant** : page blanche, Markdown léger (`#`, `-`, `[]`), chaque ligne horodatée en silence. La transcription en direct reste repliée (sans IA). La barre du bas montre ondes orange, chrono, Pause et Terminer.
5. **Arrêt** : la transcription est prête tout de suite. La note s’écrit sous tes lignes, mot à mot, en gris, et le trait bleu sert de barre de progression. « Tout afficher » coupe l’animation.
6. **Loupe** : chaque ajout gris a son heure dans la marge. Un clic surligne le passage dans la transcription et propose de réécouter l’extrait.
7. **En tête** : Décisions, puis Actions en tableau compact (quoi, qui, quand), cochables, avec « Envoyer au Hub » (emprunt B/C).
8. **Panneau transcription** : une mini-frise des prises de parole, une ligne et une teinte par voix. Un clic sur un segment réécoute le passage (emprunt B/C).
9. **Après** : gabarit changeable (Auto, Point d’équipe, 1:1, Client, Recrutement, Atelier, Exhaustif) avec une consigne libre. On renomme « Personne 2 » une fois et le nom change partout. On pose une question avec `/` pour les recettes, réponse avec citations. Liste des réunions avec dossiers et recherche dans les transcriptions.
10. **Pourquoi celle-ci** : c’est le contrat Granola (tu gardes la main, l’IA fait 85 % du chemin), rendu dans l’identité CBW (suisse, carré, Archivo + JetBrains Mono, trois états en couleur) et sans un seul composant décoratif.

---

## 1. Brief
- **Objectif** : remplacer l’écran Réunion actuel (minuteur plein écran + champ « Repère », compte rendu en onglets) par un carnet où l’utilisateur prend 3 notes et où CBW AI écrit le reste, avec la source de chaque ajout.
- **Cible** : utilisateurs francophones de PME/ETI sur Mac, en visio ou en présentiel, qui veulent relire vite et faire confiance.
- **Ton** : calme, précis, discret pendant l’appel, utile après.
- **Contraintes** : fenêtre de 1200×800, français, identité CBW (`design/cbw/DESIGN.md` : coins carrés, traits de 2 px, pas d’ombre floue, orange = enregistrement, bleu = IA, vert = terminé), WCAG AA, clavier.
- **Évident en 5 s** : « ça enregistre » (trait orange), « ce que j’ai écrit » (noir + marque dans la marge), « ce que l’IA a ajouté et d’où ça vient » (gris + heure).
- **Hypothèses** : audio gardé en local en option, ce qui permet la réécoute. CBW Hub expose un point d’entrée pour créer des tâches (projet déduit du dossier ou du titre). Les noms des invités viennent d’EventKit et servent seulement de suggestions pour renommer, pas d’attribution automatique.

## 2. Références (consultées le 15/10/2026)
| # | Référence | Ce que j’en retiens | Ce que je rejette |
|---|---|---|---|
| 1 | [Granola, notes enrichies](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes.md) | Le contrat noir/gris ; tes titres structurent la sortie ; retoucher un passage gris le rend noir (repris). | Rien sur le principe. |
| 2 | [Granola, bien utiliser](https://granola.ai/blog/get-the-best-from-granola) | La loupe vers la source. | Une loupe au survol seulement : ici, l’heure est toujours visible dans la marge. |
| 3 | [Granola, nouvelle identité](https://www.granola.ai/blog/a-new-look-for-granola) | La retenue : peu de boutons, rien ne bouge pendant l’appel. | Neutres « oats » jaunis, serif Quadrant, logo manuscrit : ce n’est pas CBW. |
| 4 | [Notion AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes) | Citations : survol = extrait, clic = saut à la ligne. | L’écran en blocs et les cartes. |
| 5 | [Char (ex-Hyprnote)](https://char.com) | Bloc-notes local d’abord, Markdown ouvert. | Interface générique sans hiérarchie. |
| 6 | [Muesli](https://muesli.works) | Notes manuelles = contexte prioritaire, et filet qui réinjecte les lignes oubliées (ici « Tes autres notes »). | Thème sombre, verre dépoli, rayons de 6 à 20 px. |
| 7 | [iA Writer, mode focus](https://ia.net/writer/how-to/write-with-focus) | Écrire sans chrome ; une mesure courte ; le texte avant tout. | Assombrir le reste du texte : ça casserait le noir/gris. |
| 8 | [Tufte CSS](https://edwardtufte.github.io/tufte-css/) | La **marge** porte la méta (notes, chiffres) à côté du texte. C’est la base du concept. | ET Book et l’esthétique « livre ancien ». |
| 9 | [Gwern, sidenotes](https://gwern.net/sidenote) | Repli de la marge en ligne quand la fenêtre est étroite. | Densité de notes de bas de page. |
| 10 | [Readwise Reader](https://readwise.io/read) | Le panneau latéral rétrécit la colonne de lecture sans la masquer ; un clic sur un surlignage ramène au texte. | Surligneur jaune : on reste en neutre `--fond-3`. |
| 11 | [Things 3](https://culturedcode.com/things/) | Actions sobres : case, texte, date à droite. | Cases rondes, couleurs par liste. |
| 12 | [Linear, changelog](https://linear.app/changelog) | Métadonnées en mono, petites, alignées : l’heure et les dates suivent cette règle. | Dégradés et halos du site marketing. |

Clichés évités : dégradé violet, cartes en verre, hero générique. Côté anti-« AI slop » : pas de libellés en capitales au-dessus de chaque bloc (les titres de bloc sont dans la marge, en casse normale), pas de flèche « → » sur les boutons, pas de cartes arrondies.

## 3. Concept
**« Une page à toi, une marge pour la machine. »**
- **Ton** : un carnet suisse, avec une colonne de texte et une marge réglée, et rien d’autre.
- **Image** : un trait vertical de 2 px entre la marge et la page. Chaque ligne tapée y laisse une marque noire de 4×16 px, ta « main ». Les lignes de l’IA n’en ont pas. C’est un repère de forme, pas seulement de couleur.
- **Mouvement** : un seul moment orchestré, l’écriture de la note à l’arrêt. Tout le reste répond à un geste.

## 4. Système
**Grille** (base 4 px, rythme de texte 28 px)
- Feuille : 24 + **88** (marge) + **24** (gouttière, trait centré) + **640** (texte, ~68 car. à 17 px) + 48.
- Panneau latéral : 360 px. Liste des réunions : 264 px. Rail : 56 px.
- Ouvrir le panneau sous 1290 px replie la liste. Sous 1080 px, la liste passe en surimpression. Sous 900 px, le panneau aussi. Sous 680 px, la marge passe en ligne (container queries sur la fenêtre).

**Typographie** : Archivo + JetBrains Mono, pas de troisième famille.

| Rôle | Valeurs |
|---|---|
| Titre de note | 40/44, 800, stretch 82 %, −0,03em |
| Sujet | 21/28, 700, −0,01em |
| Carnet | 17/28, 400 |
| Interface | 14–15 |
| Notes | 13/20 |
| Marge | mono 12/28, chiffres tabulaires |

Le « pairing » est celui de l’identité. Ici, l’Archivo large et calme pour lire, et la mono réservée à ce que la machine mesure (heures, dates).

**Palette** : rôles et contrastes sur blanc.

| Rôle | Couleur | Contraste |
|---|---|---|
| Tes mots | `#1E1E1C` | 16,7:1 |
| Ajouts IA | `#5F5F5A` | 6,4:1 (5,8:1 sur `#F4F4F2`) |
| Marge | `#6E6E6A` | 5,1:1 (jamais sur `#ECECE8`) |
| Bleu IA, texte | `#2B3BFF` | 6,6:1 |
| Vert, petits éléments | `#15803D` | 5:1 |

- **Orange `#FF5A1F`** : sert uniquement d’élément graphique (trait, ondes, carré), avec un contraste de 3,1:1 (WCAG 1.4.11).
- **Surlignage de la source** : `#ECECE8` avec une barre de 3 px noire.
- **Voix** (frise et carré devant le nom) : Moi = noir, Personne 2 `#0F766E`, Personne 3 `#8A5A00`, Personne 4 `#9D174D`. Toutes sont ≥ 4,5:1 et ne reprennent jamais une couleur d’état. Le nom est toujours écrit à côté, la couleur n’est jamais seule.

**Composants et états**
- **Boutons** : 44 px. Survol 200 ms, appui `scale(.98)` 120 ms. Focus en anneau de 3 px `--focus` avec 2 px de décalage.
- **Vide** : carnet vide avec une consigne en gris. Réunion sans notes : toute la note est en gris, avec la phrase « Tu n’as rien noté ».
- **Chargement** : trois mini-barres bleues et le décompte en secondes.
- **Erreur** : liseré `--erreur`, ce qui s’est passé, rien n’est perdu, bouton « Réessayer ».
- **Recherche sans résultat** : un message qui propose quoi chercher.
- **Popovers** (renommer, gabarit) : 2 px, avec l’unique ombre dure de 4 px. Échap rend le focus.

**Iconographie** : SVG 24, trait de 2 px, bouts carrés, 16 icônes. Pas d’emoji.

**Mouvement**
- 120, 200 et 320 ms, courbes `--ease` / `--ease-sortie`.
- Mots du flux : opacité 160 ms, un mot toutes les 17 ms, 110 ms entre deux lignes, soit environ 6 s pour la note d’exemple.
- Panneau : glisse de 24 px en 320 ms et sort sans animation.
- `prefers-reduced-motion` (ou le bouton de la maquette) : pas d’animation des mots, les lignes apparaissent en bloc, ondes figées.

## 5. Écrans
1. **Avant**
   - Notification en haut à droite (barre orange de 6 px, pleine ou pointillée), « Prendre des notes » / « Pas cette fois ».
   - La fenêtre montre la réunion « À venir ». On peut écrire l’ordre du jour, et ces titres deviennent le plan de la note.
2. **Pendant**
   - La liste se replie et le trait devient orange.
   - Le bandeau « Vous êtes 4 ? » apparaît avec un stepper de 44 px, puis disparaît.
   - En haut, « Tout reste sur ce Mac ».
   - Le panneau Transcription en direct est optionnel, sans onglet Questions.
   - « Simuler la fin de l’appel » lance un compte à rebours de 10 s annulable.
3. **Arrêt**
   - Tes lignes restent à leur place et les ajouts s’écrivent dessous.
   - Le bloc Actions se remplit colonne par colonne (quoi, qui, quand) et le trait bleu se remplit.
   - Vert « Note prête », puis passage en Après.
   - Option « Panne IA » : tes notes seules, avec le message d’erreur.
4. **Après**
   - Ligne « Voix : … » cliquable pour renommer.
   - Décisions, puis Actions avec « Envoyer au Hub » (n’envoie que les actions non cochées, avec annulation).
   - Puis tes sujets, et le bouton « Mes notes » pour revoir la version brute.
   - En bas, le champ « Demander à cette réunion » (⌘J, `/` pour les recettes). Les réponses arrivent dans l’onglet Questions, avec des citations `mm:ss` qui ouvrent la transcription.

## 6. Pourquoi (5 décisions → besoin)
1. **La marge porte la machine** → savoir d’un coup d’œil ce qui vient de moi et ce qui vient de l’IA, sans que les ajouts gris ne se noient (le reproche « gray on gray » fait à Granola).
2. **L’état vit dans un seul trait** → être rassuré que ça enregistre sans indicateur qui distrait pendant l’appel.
3. **Rien d’IA pendant l’appel** → rester présent dans la conversation. C’est la leçon de Granola : « on ne peut pas s’empêcher de lire ce que l’IA écrit ».
4. **Actions en tableau avant tout le reste** → la première chose qu’on fait après une réunion est de répartir le travail. Qui et quand sont lisibles en colonnes, et l’envoi au Hub évite de tout recopier.
5. **Toute affirmation a son heure** → vérifier un chiffre ou un nom en un clic, et le réécouter. C’est l’avantage local de CBW face à Granola, qui ne garde pas l’audio.

**Face aux deux autres pistes** : B et C ajoutaient des surfaces (cartes, frises, tableaux de bord). Le carnet n’ajoute rien d’autre qu’une marge. J’en reprends seulement deux éléments utiles, le tableau d’actions et la mini-frise, et je les range dans des zones qui existaient déjà : la tête de note et le panneau.

## 7. Risques et parades
- **Marge de 88 px coûteuse en fenêtre étroite** : elle passe en ligne sous 680 px (heure à droite de la ligne).
- **Gris lu comme « désactivé »** : la légende reste affichée, la loupe et l’heure sont toujours visibles, et retoucher un passage gris le rend noir.
- **Segments de la frise trop petits pour cliquer** (3 px minimum) : ils sont hors tabulation et `aria-hidden`. La même action existe sur chaque heure de la transcription (cible de 48×24, exception « équivalent » de WCAG 2.5.8). Les citations et les noms en ligne relèvent de l’exception « en ligne ».
- **Envoi au Hub par erreur** : seules les actions non cochées partent, avec Annuler dans le toast. Le projet est affiché avant l’envoi.
- **Changement de mise en page pendant le flux** (les lignes poussent la suite) : le flux suit l’ordre de lecture, de haut en bas. L’arrivée de la note est le moment attendu, et « Tout afficher » coupe court.
- **Noms faux** : rien n’est attribué automatiquement. Les invités sont seulement proposés, on renomme une fois et Annuler reste disponible.

**À faire côté produit** : API Hub (création de tâches), conservation locale de l’audio (option, durée), lecture d’EventKit, marquage noir/gris dans la sortie du LLM (`src/llm/notes.ts`).

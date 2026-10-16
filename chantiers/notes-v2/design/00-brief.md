# Brief design — écran Réunion de CBW AI « à la Granola » (phase 2)

Camille adore Granola pour les réunions. Lis : ~/dicta-ai/chantiers/notes-audit/05-granola.md (§ UI/design, principe noir/gris, loupe), 04-muesli.md (notes utilisateur prioritaires, gabarits), plan-final.md (phase 2), et l'identité ~/dicta-ai/design/cbw/DESIGN.md + tokens.css (suisse/brutaliste, coins carrés, traits 2px, Archivo + JetBrains Mono via ../../../assets/fonts/fonts.css ; orange = enregistrement, bleu = IA/traitement, vert = terminé). Écran actuel : ~/dicta-ai/design/app/notes.js + app.html (page Notes).

## Parcours à maquetter (HTML jouable, données fictives en français)
1. **Avant** : notification « Réunion "Point équipe" dans 1 min — Prendre des notes » (calendrier) ou « Un appel utilise le micro » ; démarrage en un clic ; question légère « Combien êtes-vous ? » (pré-remplie depuis le calendrier).
2. **Pendant** : un **carnet** simple où l'utilisateur tape quelques notes ; indicateur d'enregistrement discret ; transcription en direct repliable (Moi / Personne 2… ou noms), sans IA visible.
3. **Arrêt** : la transcription est là tout de suite ; le compte rendu **s'écrit sous les yeux** (streaming) : texte de l'utilisateur en noir, ajouts IA en gris ; **loupe** sur un ajout → passage de la transcription surligné (+ réécoute de l'extrait).
4. **Après** : choix du gabarit (Auto, Point d'équipe, 1:1, Client, Recrutement…) changeable ; renommer « Personne 2 » une fois → partout ; actions/décisions en tête ; poser une question à la réunion (réponse avec citations) ; liste des réunions (dossiers, recherche).
Contraintes : français, rapide à lire, sobre, aucune AI-slop, accessible (contrastes, clavier), fenêtre Mac ~1200×800.

## Livrable de chaque designer
`maquette-<a|b|c>.html` autonome et jouable (états cliquables : avant → pendant → arrêt/streaming → après) + `proposition-<a|b|c>.md` (10 lignes).

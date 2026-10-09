# Brief — refonte de l'écran « Prise de notes » (CBW AI)

Retour utilisateur (8 oct.) : « L'affichage n'est pas du tout bon. Au moment où je clique Démarrer une note, l'affichage de droite bloque complètement l'espace. Retravaille tout le design pour que ce soit un bon design bien fluide, ergonomique pour cette utilisation. Exemple principal : Wispr Flow (Notetaker), qui gère très très bien. »
Ce qui plaît déjà : animations et style CBW (Archivo + JetBrains Mono, blanc, encre #1C1C1E, orange = enregistrement, bleu = traitement, vert = prêt). Les réglages sont bons.

## Ce que fait bien Wispr Flow Notetaker (référence)
- Colonne centrale calme : titre « Notetaker » + CTA « Start Notetaker » (fond orange pâle, point d'enregistrement) en haut à droite de la colonne.
- Bloc « Today » arrondi, gris très pâle ; liste « Past notes » groupée par jour, lignes aérées (icône doc dans un carré gris, titre, heure).
- Panneau de droite = la note sélectionnée, MAIS il ne doit pas écraser l'espace : il est discret quand rien n'est sélectionné.

## Problème actuel (design/app/notes.js)
- Le panneau de droite (380–420 px) est toujours là, même pendant une session ou sans note ouverte → il bloque l'espace.
- Pendant une session, l'enregistrement est coincé dans le bloc « Aujourd'hui ».

## Exigences
1. **Session en cours = mode focus** : quand on démarre une note, l'écran passe en vue dédiée plein cadre (le panneau de droite se replie / disparaît avec une transition fluide) : grand minuteur, niveau micro, compteur de mots, Pause / Terminer / Annuler, et un champ facultatif « Titre » + « Repères » (taper une ligne pendant qu'on parle = marqueur horodaté, optionnel).
2. **Liste** : pleine largeur utile quand aucune note n'est ouverte ; le panneau de lecture s'ouvre en glissant depuis la droite seulement quand on sélectionne une note, se ferme (Échap / ×), et peut s'agrandir en lecture pleine page.
3. **Traitement** (transcription → organisation) visible sans bloquer : la note en cours apparaît en tête de liste avec un état « Organisation… », puis s'ouvre automatiquement.
4. **Lecture** : typographie de lecture confortable (max ~70ch), actions (Copier, Finder, Réorganiser, Supprimer) groupées et discrètes, transcription brute repliée.
5. Fluide en plein écran desktop (1512–2560 px) et correct à 960×640. Respecte prefers-reduced-motion.
6. Une seule action principale par écran. Pas de rayons arrondis lourds : coins droits CBW ou 2–4 px max.

## Contrat technique
Même API que design/app/notes.js : `window.CBWNotes = { mount(container, { api, navigate, noteId }) }` → retourne `{ open(id), list(), unmount() }`. API window.dictaApp décrite dans docs/APP_API.md (section Prise de notes). Vanilla JS, aucune dépendance, CSP stricte (pas d'eval ni d'onclick inline), tout texte échappé, le petit rendu Markdown existant peut être réutilisé.

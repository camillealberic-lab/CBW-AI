# Plan — notes de réunion (audit 15 oct.)

Sources : 01-audit-code.md (causes dans le code), 02-veille.md (Wispr Notetaker, Granola, Otter, Char/Hyprnote, Meetily, FluidAudio, Parakeet).
Problèmes terrain : 3 personnes → 14 détectées ; ~5 min d'attente ; mots perdus.

## Phase 1 — corrections rapides (1 à 2 jours)
1. « Combien êtes-vous ? » au lancement (défaut : estimé) → nombre de groupes de voix imposé.
2. Deux pistes séparées : micro = toujours « Moi » (jamais analysé) ; seule la piste son du Mac est triée par voix.
3. Fusion des groupes trop proches (même personne coupée en plusieurs).
4. Plus de coupe forcée à 6 s : découpage sur les vrais silences, marge avant/après chaque phrase, seuil de volume abaissé, réduction de bruit coupée en mode réunion, aucun morceau jeté.
5. Réglages whisper adaptés aux longs enregistrements (anti-boucle).
6. Après l'arrêt : transcription affichée tout de suite ; plus de seconde transcription ; compte rendu en un seul appel IA, affiché pendant qu'il s'écrit.
Objectif : note lisible immédiatement, compte rendu en ~30–60 s, 3 personnes détectées pour 3 présentes.

## Phase 2 — reconnaissance des voix de niveau pro (3 à 5 jours)
7. Moteur de voix FluidAudio (Core ML, puce Apple) en helper Swift : ~12–15 s pour 30 min (chiffre éditeur, à mesurer).
8. Renommer une personne une fois → sa voix est reconnue aux réunions suivantes (empreinte locale chiffrée).
9. Noms proposés depuis le Calendrier / la fenêtre Zoom-Meet-Teams (sur autorisation).

## Phase 3 — vitesse et visuel (1 semaine)
10. Test Parakeet v3 vs Whisper en français (qualité + vitesse ×10 annoncée) ; bascule si meilleur.
11. Écran de réunion visuel : texte en direct, pastilles de couleur par personne, frise du temps, extraits audio cliquables, actions/décisions en tête.

## Mesure (avant/après chaque phase)
Rapport du collaborateur (prompt-collaborateur.md) + 5 à 10 vraies réunions en français avec le nombre réel de personnes : personnes détectées, mots manquants (comparaison avec une transcription de référence), temps après l'arrêt.

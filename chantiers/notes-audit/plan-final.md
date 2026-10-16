# Plan final — réunions CBW AI « à la Granola », plus rapide et en français

Sources : 01-audit-code, 03-audit-terrain (réunion réelle : 14 voix pour 3, 4 min 29 s), 02-veille, 04-muesli (code lu), 05-granola (bundle lu).

## Phase 1 — fiabilité et vitesse (1 à 2 jours)
- Deux pistes : micro = « Moi » (jamais trié), seul le son du Mac est trié par voix ; annulation d'écho avant le micro (Muesli, Granola).
- Découpage façon Granola : 256 ms de marge, coupe après 800 ms de silence, 25 s max ; chaque morceau sauvegardé ; passages manqués rattrapés à l'arrêt (Muesli).
- Plus de re-transcription : chaque phrase va à la voix qui la recouvre le plus (−3 min 15 s).
- Serveur de transcription réglé pour les longs morceaux (fin des 587 replis lents, dictée comprise).
- « Combien êtes-vous ? » + fusion des voix proches + modèle de voix WeSpeaker.
- Compte rendu en un seul appel, affiché pendant qu'il s'écrit ; pas de limite 20 min en réunion ; micro fixé pour la session ; réponses vides de Groq corrigées ; source micro / Mac enregistrée.
Objectif : note lisible à l'arrêt, compte rendu en < 30 s, bon nombre de personnes.

## Phase 2 — l'expérience Granola (environ 1 semaine)
- Carnet pendant la réunion : tu tapes quelques notes ; à la fin, l'IA les complète (ton texte en noir, ses ajouts en gris), loupe sur chaque ajout → passage de la transcription ; tes notes ne sont jamais perdues (Muesli).
- Gabarits de compte rendu en français (Auto, point d'équipe, 1:1, client, recrutement…) et recettes « / », changeables après coup.
- Calendrier : notification 1 min avant une réunion ou dès qu'un appel prend le micro, démarrage en un clic, arrêt automatique en fin d'appel ; participants proposés comme noms.
- Questions à tes réunions (une ou toutes), réponses avec citations.

## Phase 3 — moteurs de pointe sur la puce Apple (environ 1 semaine)
- FluidAudio (tri des voix, ~15 s pour 30 min) et Parakeet v3 (transcription, français annoncé à 5,9 % d'erreur) dans un helper Swift ; tri des voix au fil de la réunion.
- Voix mémorisées : une personne renommée une fois est reconnue ensuite ; empreinte de ta voix pour « Moi » en présentiel.
Objectif : note complète avec les bons noms 10 à 20 s après l'arrêt.

## Ce qu'on garde d'avance sur eux
Local (audio jamais envoyé), gratuit, français partout, partage privé par défaut, réécoute possible, historique illimité.

## Mesure
Après chaque phase : 2-3 vraies réunions enregistrées en même temps dans CBW AI, Muesli et Granola (nombre réel de personnes noté) → personnes détectées, mots captés, attente.

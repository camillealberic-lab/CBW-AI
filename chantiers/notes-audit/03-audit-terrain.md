# Audit terrain — rapport du collaborateur (réunion du 15/10, 3 personnes, 22 min 35 s)

| Constat (rapport) | Cause (code) | Correctif |
|---|---|---|
| Attente 4 min 29 s, dont **3 min 15 s de re-transcription** de 74 segments « à cheval » | Re-transcription segment par segment après la diarisation (notes.ts ~469) ; whisper-server lancé avec un contexte audio réduit (AUDIO_CTX 640, réglé pour la dictée) produit des sorties dégénérées → `looksLooping` (> 30 car./s ou répétition) → repli whisper-cli qui recharge le modèle à chaque segment (~2,6 s × 74) | Supprimer la re-transcription (attribuer les mots par horodatage) ; contexte audio complet en mode réunion ; whisper-server sans repli CLI en boucle |
| **14 locuteurs pour 3** (mode « mix ») ; 4 (Moi + 3) en « two-track » la veille | Réunion en présentiel : les 3 voix passent par le micro → mode mix → un seul flux trié par voix sans nombre connu, seuil non calibré, modèle de voix anglais, aucune fusion des groupes proches | « Combien êtes-vous ? » (nombre imposé), fusion des groupes proches, meilleur modèle de voix (FluidAudio / 3D-Speaker FR), calibrage sur réunions FR |
| Diarisation 64 s, 823 Mo | Traitement après l'arrêt seulement | Tri des voix au fil de l'eau pendant la réunion (phase 2) |
| Limite 20 min « atteinte » mais enregistrement continué | Les événements `limit warn/max` du recorder sont émis en mode notes (avertissement inutile) alors que la note ne doit pas avoir de limite | Pas de limite ni d'avertissement en mode notes |
| 8 changements de périphérique avant la réunion | Choix micro / évitement Bluetooth au démarrage | Stabiliser le choix une fois par session, ne pas basculer en cours de réunion |
| 587 replis whisper-server → CLI en 4 jours (dictée et notes) | Même détecteur `looksLooping` trop strict + contexte réduit → aussi des dictées ralenties | Ajuster le détecteur (horodatages, débit réel), réessayer sur le serveur avec contexte complet avant le CLI |
| Organisation impossible le 14/10 | Clés absentes ce jour-là (13/10 07h37 → 14/10 15h02, migration trousseau, corrigé en 1.0.14) | Déjà corrigé ; garder la transcription brute et proposer « Réessayer l'organisation » |
| Groq « sortie vide après post-traitement » | gpt-oss consomme son budget en raisonnement → réponse vide | `reasoning_effort: low` + marge de tokens en production (déjà dans le bench) |
| Pas de source micro / son du Mac par segment | Non enregistrée dans le JSON | Enregistrer la source ; « Moi » = micro quand l'utilisateur est seul au micro |
| Aucun trou > 2 s, aucun segment vide | (bon signe) les mots perdus viennent plutôt des coupes à 6 s et de la re-transcription en boucle que de silences jetés | Découpage sur vrais silences + marges |

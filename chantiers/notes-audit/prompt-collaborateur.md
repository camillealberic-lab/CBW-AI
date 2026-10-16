Tu es sur le Mac d'un utilisateur de l'app CBW AI (dictée + notes de réunion). Rassemble un rapport de diagnostic pour l'équipe, en LECTURE SEULE. Ne modifie, ne supprime et n'envoie rien toi-même.

Règles de confidentialité (strictes) :
- Ne lis JAMAIS et n'affiche jamais : ~/.dicta-ai/secrets.json, ~/.dicta-ai/secret.key, ~/.dicta-ai/config.json en entier, un fichier .env, ni le Trousseau.
- N'affiche aucun texte dicté ni aucun contenu de réunion (transcriptions .txt, comptes rendus .md, contenu des segments). Seulement des compteurs, durées, nombres et métadonnées.
- Si une ligne de journal contient du texte dicté, remplace-le par « [texte masqué] ».

Collecte :
1. Version : `defaults read "/Applications/CBW AI.app/Contents/Info" CFBundleShortVersionString`, modèle de Mac et puce (`sysctl -n machdep.cpu.brand_string`, `sysctl -n hw.memsize`), version de macOS (`sw_vers`).
2. Réglages utiles, sans aucune clé : depuis ~/.dicta-ai/config.json, uniquement les clés qui commencent par `notes.`, `audio.`, `general.language`, `whisper.`, `cleaning.level`, `providers.order` (jamais les clés contenant `apiKey`). Utilise par exemple :
   `python3 -c "import json,os;c=json.load(open(os.path.expanduser('~/.dicta-ai/config.json')));print({k:v for k,v in c.items() if k.startswith(('notes.','audio.','general.language','whisper.','cleaning.level','providers.order')) and 'apiKey' not in k})"`
3. Journal des notes de réunion des 3 derniers jours : `grep -E "note:|notes:|diar|speaker|locuteur|whisper|recorder|system-audio|audio système|organis|router:" ~/.dicta-ai/dicta.log | tail -300`. Masque tout texte dicté. Pour chaque réunion, résume : heure de début, durée enregistrée, nombre de segments, nombre de mots transcrits, nombre de locuteurs détectés, temps entre l'arrêt et la note prête (détaille chaque étape : transcription, diarisation, organisation par l'IA), fournisseur IA utilisé, erreurs et avertissements.
4. Fichiers de la dernière réunion (métadonnées seulement) : `ls -la ~/.dicta-ai/notes | tail -10`. Dans le .json le plus récent, compte les segments, la durée totale, le nombre de locuteurs distincts, les trous de temps entre segments supérieurs à 2 s (combien et leur durée totale), et le nombre de segments par source (micro / son du Mac) si l'information existe. N'affiche aucun texte.
5. Ressources pendant/après : `memory_pressure | head -5` et `ps -axo rss,comm | grep -iE "CBW|whisper|ollama" | head`.
6. Erreurs générales récentes : `grep -iE "error|erreur|échec|exception" ~/.dicta-ai/dicta.log | tail -40` (texte masqué).

Rapport final : un seul bloc Markdown, intitulé « Diagnostic CBW AI — notes de réunion », avec les sections 1 à 6, puis un résumé en 5 lignes : combien de personnes étaient réellement présentes (demande-le à l'utilisateur), combien l'app en a détecté, durée de la réunion, temps d'attente total, et les anomalies que tu as repérées. Termine par : « Copie ce bloc et envoie-le à Camille. »

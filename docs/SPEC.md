# Dicta AI — cahier des charges (résumé)

Remplaçant léger de Wispr Flow. Je parle naturellement → Whisper local transcrit → un LLM nettoie légèrement (fillers, hésitations, répétitions, auto-corrections « trois, enfin non quatre » → « quatre ») → le texte est inséré dans l'app active (n'importe laquelle : navigateur, ChatGPT, Claude, Cursor…).

Principe : correcteur de parole, PAS co-auteur. Ne rien inventer, ne pas répondre à la demande dictée, ne pas sur-professionnaliser.

Interaction MVP : maintenir ⌥+Espace → parler → relâcher → texte propre collé. App en arrière-plan (barre de menus), pas d'UI lourde. Un indicateur d'état visible : « en cours / pas en cours » (enregistrement, transcription, nettoyage, terminé, erreur).

LLM : router avec fallback Gemini Flash-Lite → Groq → OpenRouter → Ollama local (3B–8B : Qwen/Gemma/Llama). Si aucun : passthrough du texte brut. Objectif 0 € récurrent. Pas de multi-comptes pour contourner les quotas. Surveiller les quotas.

Non-objectifs : assistant, chatbot, TTS, historique complexe, mémoire, agent.

Marque : nom « Dicta AI ». Logo : pas un micro littéral, mais des barres verticales (type égaliseur/onde) aux extrémités arrondies en haut et en bas, évoquant la grille/capsule d'un micro.

Machine cible : MacBook Apple M4, 16 Go RAM, macOS 26. Node 24 dispo (~/.local/node/bin). Pas de Homebrew, pas de cmake (pip --user cmake possible), Xcode CLT présent.

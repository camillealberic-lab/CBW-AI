# API NOTES/MCP (audio chiffré, f5, f6, f9, f10)

tsc OK. Tests purs OK : `src/main/notepad.test.ts`, `src/main/contacts.test.ts` ; MCP testé en JSON-RPC (initialize, tools/list, list/get/search, id piégé refusé). Rien lancé en Electron.

## Audio de l'historique chiffré
- `src/main/localcrypto.ts` (nouveau) : AES-256-GCM avec ~/.dicta-ai/secret.key (même clé que secrets.ts, secrets.ts non modifié). En-tête `CBWAUD1`.
- `history.ts` : `saveAudio` chiffre, `readAudio` déchiffre en mémoire (le pipeline n'a rien à changer). Clé indisponible : audio non gardé (jamais en clair). `migrateAudioEncryption()` chiffre les anciens .wav, appelé par `purgeAudio()` (démarrage + 6 h) ; date d'origine conservée, purge inchangée.
- Rien à brancher. Le texte de `history.json` reste en clair (inchangé).

## f6 notes
`notes.ts` : prompt Whisper (segments + re-transcription) = prompt de base + dictionnaire (`vocabularyForNotes()`, via `whisperNamesPrompt`) + contexte. Compte rendu : règles de remplacement appliquées à la transcription et au résultat ; `vocabulary` transmis en option à `organizeNotes` (src/llm/notes.ts ignore l'option tant que l'agent LLM ne la gère pas : à lui d'ajouter un bloc « Vocabulaire » au prompt). Aucun câblage UI.

## f10 bloc-notes (`src/main/notepad.ts`)
- `listNotepad(): NotepadEntry[]` (récent d'abord, `{id,text,at,app?}`), `addToNotepad(text,{app?})`, `removeFromNotepad(id)`, `clearNotepad()`, `notepadAsText()`, `notepadEnabled(get)`, `notepadIntercept(get, text, app?)`.
- Réglage : `notepad.enabled` boolean, défaut false, « Bloc-notes vocal : envoyer mes dictées dans le bloc-notes au lieu de les coller ».
- IPC à brancher (expéditeur vérifié) : `notepad:list` () ; `notepad:remove` (id /^[a-z0-9]{4,32}$/) ; `notepad:clear` () ; `notepad:copy` () -> `clipboard.writeText(notepadAsText())`. Stockage ~/.dicta-ai/notepad.json (0600), max 500 entrées.
- **Accroche pipeline (intégration, vague 3)** : au début de `Pipeline.pasteText` (pipeline.ts ~l.482) : `if (notepadIntercept((k) => settings.get(k as any), text, bundleId)) return 'clipboard';` (le message « Copié dans le presse-papiers » est à adapter en « Ajouté au bloc-notes » côté pastille). Ne pas l'appliquer aux snippets ni au retry/pasteRaw si on veut les coller vraiment.

## f5 contacts (`src/main/contacts.ts`)
- `importContactNames({contacts?: true, calendar?: false}): Promise<{names, fromContacts, fromCalendar, errors:[{source, reason:'denied'|'timeout'|'failed'}]}>` ; `mergeVocabulary(existing, names, max=200) -> {list, added}`.
- IPC : `contacts:import` ({calendar?: boolean}) -> `importContactNames`, puis main fusionne : `const r = mergeVocabulary(settings.get('cleaning.vocabulary'), names)` et `settings.set('cleaning.vocabulary', r.list)` ; afficher « N noms ajoutés » (ou « Autorisation refusée : Réglages Système > Confidentialité > Automatisation »). Bouton explicite uniquement, jamais au démarrage ; libellé « Importer les prénoms de mes contacts » (+ case « et les participants de mon agenda »).
- Via osascript/JXA (pas de binaire Swift, build-fnwatch.sh inchangé). **À ajouter dans package.json (build.mac.extendInfo)** : `NSAppleEventsUsageDescription` (« CBW AI lit vos contacts, à votre demande, pour mieux orthographier les noms. »), et l'entitlement `com.apple.security.automation.apple-events` si le runtime durci est actif (sinon la demande n'apparaît jamais). Aucun nom journalisé.

## f9 MCP (`mcp/`)
- `mcp/notes-server.mjs` (stdio, sans dépendance, lecture seule), `mcp/README.md` (commande `claude mcp add cbw-ai-notes -- node <chemin>/notes-server.mjs`). Outils : `list_notes`, `get_note`, `search_notes`.
- Packaging (package.json build.files / extraResources) : inclure `mcp/**` pour l'installation de l'app (chemin README : `/Applications/CBW AI.app/Contents/Resources/mcp/notes-server.mjs` si extraResources). Option UI : bouton « Copier la commande Claude » dans Réglages.

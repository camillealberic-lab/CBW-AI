# Serveur MCP des notes CBW AI (lecture seule)

Donne à Claude l'accès à vos notes de réunion (compte rendu + qui a dit quoi). Local, stdio, sans dépendance
(Node 18+). Il lit uniquement `~/.dicta-ai/notes` et les comptes rendus `.md` du dossier `~/Documents/CBW AI/Notes` ;
jamais les clés, la configuration ni l'historique des dictées. Il n'écrit rien.

## Ajouter à Claude Code

```
claude mcp add cbw-ai-notes -- node /Applications/CBW\ AI.app/Contents/Resources/mcp/notes-server.mjs
```

(en développement : `claude mcp add cbw-ai-notes -- node ~/dicta-ai/mcp/notes-server.mjs`)

Claude Desktop : dans `claude_desktop_config.json`, `"mcpServers": { "cbw-ai-notes": { "command": "node", "args": ["<chemin>/notes-server.mjs"] } }`.

## Outils
- `list_notes` `{limit?}` : notes récentes (id, titre, date, durée, mots).
- `get_note` `{id}` : compte rendu + transcription horodatée « [mm:ss] Personne 1 : … ».
- `search_notes` `{query, limit?}` : recherche dans titres, comptes rendus et transcriptions, avec extrait.

Variables : `DICTA_AI_HOME` (défaut `~/.dicta-ai`), `DICTA_NOTES_DIR` (dossier des comptes rendus).

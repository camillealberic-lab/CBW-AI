# Notes v2 — tickets (go tout de Camille, 15 oct.)
Plan : chantiers/notes-audit/plan-final.md. Sources : chantiers/notes-audit/01..05 + 03-audit-terrain.md.

## Règles communes
Lis ~/dicta-ai/CLAUDE.md. Un propriétaire par fichier (ci-dessous). Pas d'installation, pas d'Electron lancé, pas de commit/push, pas d'Ollama (OLLAMA_HOST=http://127.0.0.1:9), ne lis jamais config.json/secrets. Aucun texte de réunion dans les journaux (comptes/durées seulement). `export PATH=~/.local/node/bin:$PATH; npx tsc --noEmit -p .` + tests purs. Documente tes API dans chantiers/notes-v2/api-<agent>.md (fonctions, IPC à brancher, réglages clé/défaut/libellé FR).

| Agent | Fichiers | Phase |
|---|---|---|
| CORE (dev-electron) | src/main/notes.ts, diarization.ts, diarize-worker.ts, speakers.ts, recorder.ts, src/renderer/recorder.ts, src/main/preload-recorder.ts, src/shared/vad.ts, src/main/whisper.ts | 1 |
| LLM (dev-llm) | src/llm/notes.ts, src/llm/providers/*, src/llm/router.ts (seulement l'export d'un appel en streaming si nécessaire), nouveau src/llm/templates.ts, src/llm/ask.ts | 1 + 2 (gabarits FR, questions avec citations) |
| DESIGN (3 designers puis auditeur) | chantiers/notes-v2/design/* uniquement (maquettes HTML jouables) | 2 |
| ENGINE (dev-electron) | nouveaux scripts/meeting-engine/** (paquet Swift), vendor/meeting-engine/**, chantiers/notes-v2/engine.md | 3 (prototype FluidAudio + Parakeet, mesures) |
| UI (vague suivante) | design/app/*, src/main/main.ts, appWindow.ts, preload-app.ts, settings.ts, calendar.ts (nouveau) | 1 (affichage) + 2 (carnet, calendrier) |

## Décisions de Camille (15 oct.)
- Moteur réunion : FluidAudio + Parakeet v3 via `dicta-meeting` (validé). Modèles téléchargés depuis HuggingFace au premier lancement d'une réunion (~490 Mo, ~/.dicta-ai/models/fluid), comme les modèles actuels.
- macOS 14 : on garde la chaîne Whisper + sherpa ; Parakeet/FluidAudio à partir de macOS 15 (bug Core ML corrigé en 15).
- Mention des auteurs (CC-BY-4.0 : Parakeet, pyannote, WeSpeaker ; Apache-2.0 : FluidAudio) dans « À propos ».
- Intégration du moteur (phase 3) : après la fin de l'agent CORE (même fichiers notes.ts / diarization.ts).

## Exigence « mises à jour optimales » (Camille, 15 oct.) — obligatoire pour l'intégration
- Mise à jour légère : les modèles (~490 Mo) ne sont JAMAIS dans l'app ni dans le zip de mise à jour ; seul le binaire `dicta-meeting` (~19 Mo) est embarqué.
- Modèles téléchargés **en arrière-plan** (Mac inactif, secteur, Wi-Fi), pas au moment où la réunion commence ; reprise après coupure, empreinte SHA-256 vérifiée, emplacement stable (~/.dicta-ai/models/fluid) → **jamais retéléchargés** à une mise à jour ; progression visible dans Réglages ; pendant le téléchargement, la réunion marche avec l'ancienne chaîne (aucun blocage).
- CI (`.github/workflows/release.yml`) : compile `dicta-meeting` (SwiftPM, cible macOS 14, cache des dépendances), signature ad hoc avec la même exigence désignée, contrôles de `package-release.sh` étendus au nouveau binaire.
- Choix du moteur automatique (macOS ≥ 15 et modèles présents → Parakeet/FluidAudio ; sinon chaîne actuelle), sans réglage à toucher.
- Données conservées entre versions : notes, voix mémorisées, réglages, clés (migrations versionnées, jamais d'effacement), aucune demande trousseau.
- Vérification avant chaque push : mise à jour testée sur une **copie** (CBW_INSTALL_PATH) depuis la version publiée précédente → données intactes, taille du zip mesurée.

## Décisions de Camille — Notetaker (15 oct., après test de l'écran « Réunion »)
- Nom de la fonction : **« Notes »** (plus de « Réunion »).
- Style : identique en structure à **Wispr Flow Notetaker** (veille : wispr-notetaker.md).
- **Nombre de personnes jamais demandé** : détection automatique des interlocuteurs ; correction / renommage après coup.
- **Pas de carnet** pendant l'enregistrement (comme Wispr) : rien à faire, le résumé arrive à la fin.
- Résumé par défaut : **« court complet »** — entre le court Wispr/Granola et le compte rendu détaillé : concis, mais rien d'important ne manque (résumé, points clés, décisions, prochaines étapes qui/quoi, qui a dit quoi en bref).

## Validé par Camille (15 oct.) — à coder
Écran « Notes » façon Wispr Notetaker (wispr-notetaker.md §a), base fixe :
- nom « Notes » partout (plus « Réunion ») ; **2 onglets : Transcription · Résumé** (pas de carnet, pas de « Mes notes », pas de bloc-notes flottant) ; bascule auto sur Résumé à la fin ;
- aucun « Combien êtes-vous ? » (supprimé partout : bandeau, barre, notification ; ne plus passer numSpeakers) ;
- transcription : « Moi / Les autres » pendant, puis noms ou « Personne 1, 2… » ; horodatage + réécoute ;
- renommer : clic sur un nom → 2 extraits audio par voix, noms suggérés (agenda), « Partout / Ce passage » ; bulle « Qui est-ce ? » sur « Personne N » ;
- barre du bas : champ « Demander… » (questions + modifications) ; Arrêter / Reprendre ;
- après l'arrêt : progression « Étape 1/3 sauvegarde · 2/3 transcription · 3/3 résumé » puis notification macOS « Résumé prêt : <titre> » ; < 5 min : « Générer le résumé » ; quasi vide : « Démarré par erreur ? Garder / Jeter » ;
- **Détection + arrêt auto** : carte « Réunion détectée » quand une autre app prend le micro (compte à rebours 10 s : Démarrer maintenant · Plus tard 2 min · Non), arrêt automatique quand l'appel se termine (« Toujours là ? » + Reprendre 4 s) ; option « Démarrer automatiquement » désactivée par défaut ;
- sélecteur de type déplacé dans le menu … de l'onglet Résumé.
Non retenus : liste À venir/Passées, ⌥M, « Qu'ai-je raté ? ».

Résumé par défaut « court complet » (§b validé) **adaptatif** : l'IA reconnaît le genre d'enregistrement et adapte le plan et le rythme :
- réunion : En bref → sujets nommés → Décisions → Dates clés → Prochaines étapes par personne → Questions ouvertes ;
- brainstorm : En bref → idées par thème → points clés → décisions → questions soulevées → pistes à explorer ;
- cours / conférence : En bref → notions clés (définitions) → exemples → à retenir → questions ;
- conversation entre collègues : En bref → sujets → positions de chacun → accords / désaccords → suites ;
- (entretien client / recrutement selon les gabarits existants).
Rythme : alterner paragraphes courts, puces, encadré « À retenir », citation marquante quand elle compte, gras sur les mots clés ; pas de remplissage ; sections vides omises.

### Contrat détection d'appel (helper + module, agent CALL)
`src/main/callDetect.ts` : EventEmitter `callDetector` — `on('call-start', {app?: string, bundleId?: string})`, `on('call-end')` ; `start()/stop()` ; réglages `notes.detectCalls` (défaut true), `notes.autoStart` (défaut false), `notes.autoStop` (défaut true). N'émet rien quand c'est CBW AI qui utilise le micro (dictée/note).

## Organisation façon Wispr Notetaker (Camille, 15 oct.) — source : wispr-structure.md
Appliquer les 15 changements de wispr-structure.md, avec ces réponses :
1. Bloc « À venir » (agenda, bouton Démarrer) en haut de la liste : OUI (seulement si l'agenda est activé).
2. « Demander » : seulement après l'arrêt, pas de « Qu'ai-je raté ? » (comme Wispr).
3. Pendant l'enregistrement, la note s'ouvre sur l'onglet Transcription ; note passée → Résumé.
4. 2 onglets : Transcription · Résumé (pas d'onglet Tâches ; prochaines étapes en tête du résumé).
5. Une seule liste (pas de Partagés / Dossiers).
6. Pas de pause : Démarrer / Arrêter / Reprendre.
7. Ligne de liste : heure seule (notes regroupées par jour).
8. Résumé : on garde le texte IA en gris + l'heure dans la marge (renvoi à la transcription, réécoute).

## Résumé — décision finale de Camille (16 oct.)
- Résumé **rédigé** : texte complet en paragraphes (prose), organisé **par thème**, jamais par ordre chronologique ni par « phases » de la réunion ; **aucune heure / temporalité** exprimée (pas de « au début », « ensuite on a parlé de », pas d'horodatage).
- Commence par le paragraphe général (1–2 paragraphes, toutes les décisions et conclusions), puis les paragraphes thématiques détaillés (le quoi, le comment, chiffres, raisons, nuances).
- Puis **une seule liste à la fin** : « Prochaines étapes » à cocher (`- [ ] **Prénom** : …`), groupées par personne.
- Le genre (réunion, brainstorm, cours…) adapte le contenu et les thèmes, pas la forme.
- **Aucune heure dans la marge du résumé** ; le marquage [[ia mm:ss]] n'est plus affiché dans le résumé (les heures restent seulement dans l'onglet Transcription). Le texte IA en gris reste.

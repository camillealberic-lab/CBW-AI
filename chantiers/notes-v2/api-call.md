# API détection d'appel (callDetect)

Module `src/main/callDetect.ts` : `callDetector` (EventEmitter), `start()`, `stop()`, `inCall` (booléen).
- `call-start` `{app?: string, bundleId?: string}` : micro pris par une autre app depuis 3 s. `app` = nom connu (Zoom, Microsoft Teams, FaceTime, Slack, Discord, Webex, WhatsApp, Skype, navigateurs « Chrome (Meet, Teams web…) »…) sinon nom de l'app.
- `call-end` : micro libre depuis 5 s (ou `stop()` pendant un appel).
- Rien n'est émis quand CBW AI (`com.dicta-ai.app*`) est seul à utiliser le micro : exclusion faite dans le helper.
- Réglage lu : `notes.detectCalls` (défaut true) ; si false, `start()` ne lance rien et les événements sont ignorés. `notes.autoStart` (false) / `notes.autoStop` (true) sont lus par l'appelant (main.ts), pas par le détecteur.
- À brancher dans main.ts : `callDetector.start()` au démarrage, `stop()` à la sortie. Si `notes.detectCalls` change, rappeler `start()`/`stop()`.
- Settings à ajouter par le propriétaire de settings.ts : `'notes.detectCalls': true`, `'notes.autoStart': false`, `'notes.autoStop': true` (booléens, ajouter dans la liste de validation).

Helper `vendor/bin/dicta-callwatch` (scripts/callwatch.swift, embarqué via extraResources) : lignes JSON `{"event":"mic-on","bundleId":…,"app":…}` / `{"event":"mic-off"}` à chaque changement (sonde 1 s), fin quand stdin est fermé. `--devices` liste les entrées et quitte. Aucun audio capturé, aucun droit micro requis. Repli si l'API processus est vide : état du périphérique (sans bundleId). Env : `DICTA_CALLWATCH_BIN`.
Fichiers : `callDetectCore.ts` (logique pure : noms + anti-rebond) et `callDetectCore.test.ts`.

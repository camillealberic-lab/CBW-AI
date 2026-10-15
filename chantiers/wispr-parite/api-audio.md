# API AUDIO (c1, c2, c5, c9, c10, c12)

Fichiers : src/main/recorder.ts, src/renderer/recorder.ts, src/main/preload-recorder.ts, src/main/media.ts (nouveau). tsc OK. Non testé en Electron réel (consigne).

## Réglages (lus par `recorder.ts` avec défaut ; à déclarer dans settings.ts / UI)
| Clé | Défaut | Libellé FR |
|---|---|---|
| `audio.inputDeviceId` | `''` | Micro (vide = « Défaut du système ») |
| `audio.avoidBluetooth` | `true` | Préférer le micro du Mac aux AirPods / écouteurs Bluetooth (évite la perte des premiers mots) |
| `audio.maxDurationMin` | `20` | Durée maximale d'une dictée (minutes, 0 = illimitée, plafond 120) |
| `audio.pauseMedia` | `true` | Mettre la musique en pause pendant la dictée (Musique, Spotify) |
| `audio.lowVoice` | `false` | Voix basse (chuchotement) : micro plus sensible |
Validation côté UI : booléens, `inputDeviceId` string <= 200, `maxDurationMin` entier 0..120. Si `inputDeviceId` n'existe plus, repli automatique sur le défaut (journalisé).

## Fonctions / événements de `Recorder`
- `listInputDevices(): Promise<InputDevice[]>` avec `{ id, label, isDefault, bluetooth, builtIn }` (le renderer caché fait enumerateDevices ; sans accès micro, ouverture brève pour obtenir les noms ; [] après 3 s). **IPC à brancher (UI/main.ts)** : `ipcMain.handle('audio:listInputs', e => isTrustedSender(e, appWin) ? recorder.listInputDevices() : [])`, exposé comme `dictaApp.audio.listInputs()`. Le vumètre c1 réutilise l'événement `level` existant.
- Événements (EventEmitter, comme `level`) :
  - `noInput` : aucun son du micro pendant les 1,5 s du début (pic < -56 dBFS). **KEYS/UI : afficher l'alerte pastille** « Aucun son du micro ». Jamais émis en mode notes.
  - `limit` `{ kind: 'warn', remainingMs }` (1 min avant la fin, seulement si la limite > 2 min) puis `{ kind: 'max' }` : afficher « Il reste 1 min » / son doux.
  - `interrupted` `{ reason: 'device-lost' | 'muted' }` : micro débranché, ou piste muette > 1,5 s (appel entrant, micro pris par une autre app). L'audio déjà capté est conservé, plus rien n'est ajouté.
- `RecordingResult.interrupted?: string` : renseigné si `stop()` suit une interruption.

## Pour l'agent PIPE (pipeline.ts, non modifié par moi)
- **La limite actuelle de 5 min est dans pipeline.ts** : `MAX_DURATION_MS = 5 * 60 * 1000` (l. 33) + `maxTimer` (l. 212), arrêt via log « durée max atteinte ». À faire : supprimer la constante et le timer (ou la remplacer par `audio.maxDurationMin`), et sur `recorder.on('limit', ({kind}) => kind === 'max' && this.stop())` faire l'arrêt normal (texte gardé, collage automatique).
- Sur `recorder.on('interrupted')` : appeler le même `stop()` que pour un relâchement (le résultat contient tout l'audio), puis traiter normalement ; ne pas jeter la dictée. Optionnel : message « Micro déconnecté, texte conservé ».
- `rec.interrupted` permet de le noter dans l'historique.

## Détails
- c1 : auto = si l'entrée « default » est Bluetooth (AirPods, Beats, Bose, Jabra, Sony, Buds…) et qu'un micro intégré (Built-in / MacBook / intégré) existe, on ouvre ce dernier ; réglage explicite prioritaire. Appliqué à chaque `arm()`/`start()` (la config part avec les messages `rec:arm` / `rec:start`).
- c9 (`media.ts`) : `media.pause()` au `start()` (hors notes), `media.resume()` à l'arrêt / annulation / erreur. Musique et Spotify seulement, via osascript, sans jamais lancer une app fermée ; ne relance que ce qu'on a mis en pause et seulement s'il est encore en pause. Navigateurs (YouTube) non pilotés (pas de touche média : risquerait de lancer de la musique). Détection d'appel non implémentée : l'option reste désactivable. La première utilisation peut déclencher la demande macOS « CBW AI veut contrôler Musique/Spotify » (NSAppleEventsUsageDescription à vérifier dans Info.plist / electron-builder par l'intégration).
- c12 : gain x4 (+12 dB) + limiteur doux WebAudio, suppression de bruit Chromium coupée, AGC gardé. Le seuil du VAD (src/shared/vad.ts, non à moi) peut être abaissé si le chuchotement n'est pas détecté ; à tester par Camille.
- c10 : si le micro en pré-écoute (arm) est perdu, il est rouvert au prochain `start()`.

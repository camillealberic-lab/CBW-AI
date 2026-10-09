# Aide CBW AI

CBW AI est une app de dictée vocale gratuite pour Mac, éditée par CBW Studio. Tu parles, CBW AI écrit à ta place dans n'importe quelle app (mail, navigateur, Word, Notion, ChatGPT, Slack…), avec un texte déjà propre : sans les « euh », sans les répétitions, avec la ponctuation.

C'est un correcteur de parole, pas un rédacteur : il n'invente rien, ne reformule pas tes idées et ne répond jamais à ce que tu dictes.

---

## Configuration requise

- Un Mac avec une puce **Apple Silicon** (M1, M2, M3, M4 ou plus récent). Les Mac à processeur Intel ne sont pas pris en charge.
- **macOS 14 (Sonoma)** ou plus récent.
- Environ **1 Go d'espace libre** (l'app + le modèle de transcription d'environ 560 Mo).
- Une connexion internet pour l'installation et pour le nettoyage du texte par un moteur IA en ligne. La transcription de ta voix, elle, se fait sans internet.
- Facultatif : pour un nettoyage 100 % local avec Ollama, il faut environ **10 Go de mémoire vive libre**. C'est déconseillé sur un Mac de 8 ou 16 Go.

Pour vérifier ton Mac : menu  › **À propos de ce Mac**. La ligne « Puce » doit indiquer « Apple M… », et la ligne « macOS » une version 14 ou plus.

---

## Installation pas à pas

1. Télécharge le fichier **CBW-AI-arm64.dmg** depuis le site.
2. Ouvre ce fichier (double-clic dans ton dossier Téléchargements). Une fenêtre s'ouvre avec l'icône CBW AI et un raccourci vers le dossier Applications.
3. **Glisse l'icône CBW AI sur le dossier Applications.**
4. Éjecte le disque « CBW AI » (clic droit sur son icône dans le Finder › Éjecter). Tu peux ensuite supprimer le fichier .dmg.
5. Ouvre ton dossier **Applications** et double-clique sur **CBW AI**.

### Premier lancement : le message « Apple ne peut pas vérifier »

CBW AI n'est pas encore « notarisé » par Apple (une démarche payante que CBW Studio fera plus tard). Au premier lancement, macOS affiche donc un message du type : *« CBW AI » ne peut pas être ouvert, car Apple ne peut pas vérifier qu'il ne contient pas de logiciel malveillant.* C'est normal, et il suffit de le faire une seule fois.

**Méthode qui marche sur toutes les versions de macOS :**

1. Clique sur **OK** (ou **Terminé**) pour fermer le message.
2. Ouvre **Réglages Système** (menu  › Réglages Système).
3. Va dans **Confidentialité et sécurité**.
4. Descends jusqu'à la rubrique **Sécurité**. Tu y vois la ligne *« CBW AI » a été bloqué…*
5. Clique sur **Ouvrir quand même**, puis confirme avec ton mot de passe ou Touch ID.
6. Dans la fenêtre qui suit, clique sur **Ouvrir**.

**Raccourci sur macOS 14 (Sonoma) :** dans le dossier Applications, fais un **clic droit** (ou Contrôle + clic) sur CBW AI › **Ouvrir**, puis **Ouvrir** dans la fenêtre de confirmation.

Ensuite, CBW AI s'ouvre normalement, comme n'importe quelle app.

---

## Premier lancement

Au premier lancement, CBW AI te guide en quelques écrans :

1. **Bienvenue.** Clique sur Commencer.
2. **Micro.** Clique sur « Autoriser le micro », puis **Autoriser** dans la fenêtre de macOS.
3. **Accessibilité.** Clique sur « Ouvrir les Réglages », puis active l'interrupteur à côté de **CBW AI**. L'écran passe au vert tout seul (voir [Autorisations](#autorisations)).
4. **Raccourci.** On te montre le geste : deux appuis sur la touche **Control de gauche** pour dicter (trois appuis pour une note).
5. **Moteur IA.** Colle ta clé gratuite (Groq conseillé, voir [Obtenir une clé gratuite](#obtenir-une-clé-gratuite)), puis clique sur **Tester**. Tu peux passer cette étape et y revenir plus tard.
6. **Essai.** Dicte une phrase pour voir le résultat, avant et après nettoyage.

Pendant ce temps, CBW AI **télécharge le modèle de transcription** (environ 560 Mo). Ce téléchargement n'a lieu qu'une seule fois. Selon ta connexion, il prend de quelques secondes à quelques minutes.

Ensuite, CBW AI reste discrètement dans la **barre de menus** (en haut à droite de l'écran, une petite icône à barres) et dans le Dock. Fermer sa fenêtre ne le quitte pas : la dictée reste disponible partout.

---

## Autorisations

macOS protège ton micro et ton clavier. CBW AI a besoin de deux autorisations, parfois trois.

| Autorisation | Pourquoi CBW AI en a besoin |
|---|---|
| **Micro** | Pour entendre ta voix pendant que tu dictes. Le micro n'est actif que lorsque tu lances une dictée. |
| **Accessibilité** | Pour repérer la touche Control (deux appuis, ou touche maintenue) et pour **coller le texte** à l'endroit où se trouve ton curseur. |
| **Surveillance de l'entrée** (seulement si macOS la demande) | Sur certains Mac, macOS demande cette autorisation en plus pour que CBW AI puisse lire la touche du raccourci. |

**Où les activer :** Réglages Système › **Confidentialité et sécurité** › **Micro** / **Accessibilité** / **Surveillance de l'entrée**, puis active l'interrupteur à côté de **CBW AI**.

**Sans Accessibilité**, CBW AI fonctionne quand même, en mode réduit : le texte est copié dans le presse-papiers et tu le colles toi-même avec **⌘ V**.

CBW AI ne lit pas ce que tu tapes au clavier : il surveille seulement la touche du raccourci et la touche Échap.

---

## Obtenir une clé gratuite

### Pourquoi une clé ?

CBW AI fonctionne en deux temps :

1. **La transcription** : ta voix devient du texte, directement sur ton Mac. Pas besoin de clé.
2. **Le nettoyage** : un moteur IA enlève les « euh », les répétitions et les hésitations, et ajoute la ponctuation. Ce moteur tourne chez un fournisseur en ligne qui offre un accès gratuit.

Chaque personne crée **sa propre clé gratuite** (une sorte de mot de passe qui relie CBW AI à ton compte chez le fournisseur). Ça prend 2 minutes.

**Combien ça coûte ? 0 €.** Tant que tu n'ajoutes **aucun moyen de paiement** (carte bancaire) sur ces comptes, ils ne peuvent rien te facturer. Si un jour tu atteins la limite gratuite, le service refuse simplement les demandes jusqu'au lendemain, et CBW AI passe au moteur suivant.

Sans aucune clé, CBW AI colle quand même ta dictée, mais sans le nettoyage (texte brut).

### Groq (conseillé, à faire en premier)

Groq est le plus rapide (environ une demi-seconde) et son quota gratuit suffit largement pour un usage quotidien.

1. Va sur **[console.groq.com](https://console.groq.com)**.
2. Clique sur **Sign in** (ou **Sign up**), puis choisis **Continue with Google**, ou entre ton adresse e-mail et clique sur le lien de connexion que Groq t'envoie.
3. Si Groq te pose quelques questions (nom, usage), réponds simplement et valide.
4. Ouvre la page des clés : **[console.groq.com/keys](https://console.groq.com/keys)** (ou, dans le menu, **API Keys**).
5. Clique sur **Create API Key**.
6. Dans le champ du nom, écris **CBW AI**, puis clique sur **Submit**.
7. Ta clé s'affiche (elle commence par `gsk_`). Clique sur **Copy**. Attention : elle ne s'affiche **qu'une seule fois**. Si tu la perds, supprime-la et crée-en une nouvelle.
8. Dans CBW AI, ouvre **Réglages** › **Moteur IA** › **Groq**, colle la clé dans le champ, puis clique sur **Tester**. Un badge vert « OK » confirme que tout marche.

N'ajoute pas de carte bancaire dans la rubrique *Billing* : ce n'est pas nécessaire.

Option confidentialité : dans Groq, **Settings › Data Controls**, tu peux activer **Zero Data Retention** pour que Groq ne garde aucune trace de tes textes.

### Les autres moteurs (facultatifs, en secours)

Tu peux ajouter d'autres clés. Si un moteur est indisponible ou a atteint sa limite du jour, CBW AI passe automatiquement au suivant. La méthode est toujours la même : créer un compte, créer une clé, la coller dans **Réglages › Moteur IA**, cliquer sur **Tester**.

| Moteur | Où créer la clé | Bon à savoir |
|---|---|---|
| **Mistral** | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) | Entreprise française, serveurs **en Europe**. Choisis le plan gratuit (« Experiment ») ; ton numéro de téléphone est demandé. Sur ce plan gratuit, Mistral peut utiliser tes textes pour améliorer ses modèles. |
| **Cloudflare** | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) | Clique sur **Create Token** et choisis le modèle **Workers AI**. CBW AI te demande aussi ton **Account ID** (affiché sur l'accueil de ton tableau de bord Cloudflare). Environ 450 dictées par jour. |
| **Gemini** (Google) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Connexion avec ton compte Google, puis **Create API key**. N'active pas la facturation (« Set up billing »). Parfois lent. |
| **Z.ai** | [z.ai/manage-apikey/apikey-list](https://z.ai/manage-apikey/apikey-list) | Modèle gratuit GLM Flash. **Serveurs hors de l'Union européenne.** |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Environ 50 dictées gratuites par jour seulement : à garder en tout dernier secours. |

**Une seule clé par fournisseur.** Créer plusieurs comptes pour avoir plus de quota est interdit par ces services et peut faire bloquer ton compte.

**Ne partage jamais tes clés** (ni en capture d'écran, ni par mail). Si une clé a fuité, supprime-la sur le site du fournisseur et crées-en une nouvelle.

### Option 100 % locale : Ollama

Si tu ne veux **rien** envoyer sur internet, CBW AI peut nettoyer ton texte avec Ollama, un moteur IA qui tourne directement sur ton Mac.

- C'est **facultatif** et un peu plus technique.
- Il faut environ **10 Go de mémoire vive libre**. **Déconseillé sur un Mac de 8 ou 16 Go** : ton Mac risque de ralentir fortement.
- Installation : télécharge Ollama sur [ollama.com/download](https://ollama.com/download), glisse-le dans Applications et lance-le une fois. Ensuite, dans CBW AI, va dans **Réglages › Moteur IA › Ollama** et clique sur **Télécharger le modèle** (plusieurs Go, une seule fois).
- Pour qu'Ollama passe avant les moteurs en ligne, active **Local d'abord** dans Réglages › Moteur IA.

---

## Utilisation au quotidien

### Les gestes

| Tu veux… | Geste |
|---|---|
| **Dicter les mains libres** | Appuie **deux fois** sur la touche **Control de gauche** (⌃), parle, puis appuie **une fois** sur Control pour arrêter. Le texte se colle tout seul. |
| **Dicter une phrase courte** | **Maintiens** la touche Control de gauche pendant que tu parles, puis relâche-la : le texte se colle. |
| **Prendre une note** | Appuie **trois fois** sur la touche **Control de gauche**, parle aussi longtemps que tu veux, puis appuie **une fois** sur Control pour arrêter. La note est enregistrée (voir [Prise de notes](#prise-de-notes)). |
| **Annuler** | Appuie sur **Échap** pendant la dictée : rien n'est collé. |

La touche **fn / 🌐** reste libre : tu peux toujours l'utiliser pour les emoji.

### Pas à pas

1. **Clique** là où le texte doit aller (un mail, un message, un document…).
2. **Appuie deux fois** sur Control (à gauche). Une petite pastille apparaît en bas de l'écran avec des barres **orange** : CBW AI t'écoute.
3. **Parle normalement**, comme si tu parlais à quelqu'un. Pas besoin de dicter la ponctuation.
4. **Appuie une fois** sur Control. Les barres passent au **bleu** (transcription et nettoyage), puis au **vert** : le texte est collé.

Ton presse-papiers d'origine est remis en place juste après le collage : tu ne perds pas ce que tu avais copié.

### Exemples avant / après

| Tu dis | CBW AI écrit |
|---|---|
| « Euh bonjour Claire, alors je voulais savoir si si on peut décaler le rendez-vous à jeudi, enfin non vendredi » | Bonjour Claire, je voulais savoir si on peut décaler le rendez-vous à vendredi. |
| « Alors le devis c'est euh trois cents euros, non pardon, trois cent cinquante euros hors taxes » | Le devis est de trois cent cinquante euros hors taxes. |
| « Est-ce que tu peux m'envoyer le le fichier avant midi s'il te plaît » | Est-ce que tu peux m'envoyer le fichier avant midi, s'il te plaît ? |

Si tu dictes une question (« Est-ce que tu peux m'écrire un mail de relance ? »), CBW AI écrit la question telle quelle : il n'y répond pas.

### Conseils

- Parle à un rythme normal, à 20 à 50 cm du Mac. Le micro intégré suffit.
- Les noms propres mal compris (clients, marques, logiciels) s'ajoutent dans le **Dictionnaire** de CBW AI : il les écrira correctement ensuite.
- Le niveau de nettoyage se choisit dans **Style** : **Léger** (enlève les « euh » et répétitions) ou **Standard** (ajoute aussi la ponctuation et applique tes corrections du type « jeudi, non vendredi »).

---

## Prise de notes

Le mode **Prise de notes** sert à garder une idée, un compte rendu d'appel ou une liste de choses à faire, sans avoir besoin d'ouvrir une app ni de placer ton curseur quelque part. Au lieu d'être collé, le texte est **enregistré dans une note**.

### Démarrer une note

Au choix :

- appuie **trois fois** sur la touche **Control de gauche** ;
- ou ouvre CBW AI et va dans **Notes** (barre latérale), puis lance une nouvelle note ;
- ou clique sur l'icône CBW AI de la **barre de menus** et choisis la prise de notes.

### Arrêter

Appuie **une fois** sur **Control**. La note est enregistrée tout de suite.

### Où sont mes notes ?

Dans le dossier **Documents › CBW AI › Notes** de ton Mac (`~/Documents/CBW AI/Notes`). Chaque note est un fichier texte au format **Markdown** (`.md`) : tu peux l'ouvrir avec TextEdit, Notes, Obsidian, Notion (import) ou n'importe quel éditeur de texte, la copier, la renommer ou la supprimer comme un fichier normal.

Tu retrouves aussi tes notes dans CBW AI, rubrique **Notes**.

---

## Réglages

Ouvre CBW AI (icône du Dock ou de la barre de menus › Ouvrir CBW AI), puis **Réglages** dans la barre latérale.

| Réglage | À quoi il sert |
|---|---|
| **Autorisations** | Voir d'un coup d'œil si Micro et Accessibilité sont bien activés. |
| **Raccourci** | Par défaut : **Control gauche ×2** pour dicter (maintenir pour parler, ×3 pour une note). Autres choix : **Control droite ×2**, **fn ×2**, ou **⌥ Espace** (Option + Espace). Si tu choisis fn, règle « Appuyer sur 🌐 pour » sur « Ne rien faire » (CBW AI propose de le faire pour toi). |
| **Insertion** | « Coller automatiquement » (par défaut) ou « Presse-papiers seulement » (tu colles toi-même avec ⌘ V). |
| **Langue de dictée** | Français, anglais ou détection automatique. |
| **Lancer au démarrage** | CBW AI s'ouvre tout seul quand tu allumes ton Mac. |
| **Moteur IA** | Tes clés gratuites, le bouton **Tester**, l'option **Local d'abord**, et les **quotas du jour**. |
| **Transcription** | Le modèle de transcription. Celui installé par défaut est le bon choix : n'y touche que si ton Mac est lent. |
| **Nettoyage** | Le niveau (Léger / Standard) et l'option « Garder le brut en cas d'échec ». |
| **Thème** | **Clair** par défaut ; un thème sombre est disponible si tu préfères. |
| **Confidentialité** | Effacer l'historique des 20 dernières dictées. |
| **À propos** | Version de l'app et « Revoir l'onboarding ». |

---

## Confidentialité

- **Ta voix ne quitte jamais ton Mac.** La transcription est faite sur ton Mac, par le modèle Whisper. Aucun enregistrement audio n'est envoyé ni conservé.
- **Seul le texte transcrit** est envoyé au moteur IA que tu as choisi, pour être nettoyé. Il revient aussitôt et est collé.
- Avec **Ollama**, même le texte reste sur ton Mac : rien ne sort.
- **Mistral** héberge ses serveurs en **Europe**. **Z.ai** utilise des serveurs **hors de l'Union européenne**. Groq, Cloudflare, Gemini et OpenRouter sont des services américains ou mondiaux.
- Tes clés et tes réglages sont enregistrés uniquement sur ton Mac, dans le dossier caché `~/.dicta-ai`.
- Tes **notes** sont de simples fichiers enregistrés sur ton Mac, dans `~/Documents/CBW AI/Notes`. Ils ne sont envoyés nulle part par CBW AI.
- L'historique (20 dernières dictées) est stocké sur ton Mac seulement, et tu peux l'effacer à tout moment dans Réglages › Confidentialité.
- CBW Studio ne reçoit rien : ni ta voix, ni tes textes, ni tes clés.

Bon réflexe : évite de dicter des informations très sensibles (mots de passe, numéros de carte, données de santé) si tu utilises un moteur en ligne.

---

## Dépannage et FAQ

### Rien ne se colle après la dictée

C'est presque toujours l'autorisation **Accessibilité**.

1. Ouvre Réglages Système › Confidentialité et sécurité › **Accessibilité**.
2. Vérifie que l'interrupteur à côté de **CBW AI** est activé.
3. S'il l'est déjà mais que ça ne marche pas (par exemple après une mise à jour) : sélectionne CBW AI dans la liste, clique sur **−** pour le retirer, puis relance CBW AI et réactive l'autorisation.

En attendant, ton texte est dans le presse-papiers : colle-le avec **⌘ V**.

Vérifie aussi, dans Réglages › Insertion, que « Coller automatiquement » est choisi.

### La touche Control ne déclenche rien

- Vérifie que tu appuies deux fois (ou trois fois pour une note) **rapidement** sur la touche Control **de gauche** (ou celle choisie dans Réglages › Raccourci).
- Vérifie que CBW AI tourne : son icône doit être dans la barre de menus, en haut à droite.
- Vérifie les autorisations **Accessibilité** et, si macOS l'a demandée, **Surveillance de l'entrée** (Réglages Système › Confidentialité et sécurité).
- Après avoir activé une autorisation, quitte CBW AI (icône de la barre de menus › Quitter) et relance-le.
- Si une autre app utilise déjà la touche Control (certains outils de clavier), choisis un autre raccourci dans Réglages, par exemple **⌥ Espace**.

### « Apple ne peut pas vérifier que CBW AI ne contient pas de logiciel malveillant »

C'est normal pour l'instant : l'app n'est pas encore notarisée par Apple. Suis la méthode décrite dans [Installation pas à pas](#installation-pas-à-pas) : Réglages Système › Confidentialité et sécurité › **Ouvrir quand même**.

Si macOS dit que l'app « est endommagée », supprime-la, retélécharge le .dmg et réessaie. Si le message persiste, ouvre l'app **Terminal** et colle cette ligne, puis appuie sur Entrée :

```
xattr -dr com.apple.quarantine "/Applications/CBW AI.app"
```

### La transcription est lente

- **Juste après le démarrage**, la première dictée peut prendre quelques secondes, le temps que le modèle se charge. Les suivantes sont rapides (environ une seconde).
- **Au tout premier lancement**, le modèle (environ 560 Mo) doit d'abord finir de se télécharger.
- Si tu utilises **Ollama**, il occupe beaucoup de mémoire et peut ralentir la transcription : désactive « Local d'abord » ou quitte Ollama.
- Ferme les apps très gourmandes (montage vidéo, nombreux onglets) si ton Mac a 8 Go de mémoire.
- En dernier recours, choisis un modèle plus petit dans Réglages › Transcription (« small » par exemple) : plus rapide, un peu moins précis.

### Le texte est collé mais pas nettoyé (« quota atteint »)

Chaque moteur gratuit a une limite par minute et par jour. Quand elle est atteinte, CBW AI passe au moteur suivant. Si aucun moteur n'est disponible, il colle la **transcription brute** pour que tu ne perdes rien.

- Regarde **Réglages › Moteur IA › Quotas du jour** pour voir où tu en es.
- Ajoute une deuxième clé gratuite (Mistral ou Cloudflare par exemple) en secours.
- Les quotas se remettent à zéro chaque jour. Tu n'as rien à payer et rien à faire.
- Si le badge d'un moteur est rouge, clique sur **Tester** : la clé a peut-être été supprimée ou mal collée.

### Désinstaller proprement

1. Quitte CBW AI : icône de la barre de menus › **Quitter**.
2. Glisse **CBW AI** du dossier Applications vers la **Corbeille**.
3. Supprime ses données (réglages, clés, historique et modèle de transcription d'environ 560 Mo). Dans le Finder, menu **Aller › Aller au dossier…**, tape `~/.dicta-ai` puis Entrée, et mets ce dossier à la Corbeille. Ou, dans le Terminal :

   ```
   rm -rf ~/.dicta-ai
   ```

4. Retire ses autorisations (Micro, Accessibilité, Surveillance de l'entrée). Dans le Terminal :

   ```
   tccutil reset All com.dicta-ai.app
   ```

   Tu peux aussi le faire à la main dans Réglages Système › Confidentialité et sécurité, rubrique par rubrique (bouton **−**).
5. Si tu avais activé « Lancer au démarrage » : Réglages Système › Général › **Ouverture** et retire CBW AI de la liste s'il y figure encore.
6. Tes **notes** ne sont pas supprimées automatiquement : elles t'appartiennent. Si tu n'en veux plus, mets aussi le dossier **Documents › CBW AI** à la Corbeille.
7. Si tu avais installé Ollama et ne t'en sers plus, glisse aussi **Ollama** à la Corbeille.

Pense enfin à supprimer tes clés sur les sites des fournisseurs (Groq, Mistral…) si tu n'en as plus besoin.

### Autres questions

**CBW AI est-il vraiment gratuit ?** Oui. L'app est gratuite, et les moteurs IA utilisés ont des offres gratuites. Sans carte bancaire enregistrée chez eux, tu ne peux rien payer.

**Est-ce que ça marche sans internet ?** La transcription, oui. Le nettoyage, seulement avec Ollama. Sans internet et sans Ollama, CBW AI colle la transcription brute.

**Dans quelles apps puis-je dicter ?** Partout où tu peux taper du texte : Mail, Gmail, Word, Pages, Notion, Slack, WhatsApp, ChatGPT, ton navigateur…

**Je ne retrouve pas ma note.** Elle est dans **Documents › CBW AI › Notes** (fichier `.md`), et dans la rubrique **Notes** de CBW AI. Vérifie que tu as bien arrêté la note avec un appui sur Control.

**Ma Dictée Apple ou les emoji (touche fn) marchent-ils encore ?** Oui : le raccourci par défaut utilise la touche Control, la touche fn reste libre.

**Et sur un Mac Intel, sur Windows ou sur iPhone ?** Pas pour l'instant : CBW AI fonctionne uniquement sur Mac Apple Silicon (M1 ou plus récent).

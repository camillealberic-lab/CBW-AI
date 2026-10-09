# CBW AI — Étude de marché : landing pages comparables (octobre 2026)

> Destinataires : les 3 designers du site. Objectif du site : **une seule action, « Télécharger pour macOS »**.
> Méthode : relevé des pages d'accueil en ligne le 9 octobre 2026 (contenu texte des pages ; les animations sont déduites du balisage et des libellés, pas filmées). Faits produit tirés de `docs/SPEC.md`, `docs/aide/AIDE.md` et `docs/DISTRIBUTION.md`.

## 0. Faits produit à afficher (source de vérité)

| Élément | Valeur | Où l'afficher |
|---|---|---|
| Prix | **Gratuit, 0 €**, sans compte, sans carte bancaire | Sous le CTA principal, dans la tarification, dans la FAQ |
| Plateforme | Mac **Apple Silicon** (M1 et plus récents). Intel non pris en charge | Micro-ligne sous le CTA |
| macOS | **14 Sonoma ou plus récent** | Micro-ligne sous le CTA |
| Fichier | `CBW-AI-arm64.dmg`, **≈ 117 Mo** (≈ 1 Go au total avec le modèle Whisper de ≈ 560 Mo téléchargé au premier lancement) | Micro-ligne + FAQ |
| Raccourci | **Control gauche ×2** pour dicter, **×3** pour une note | Démo du héros, « Comment ça marche » |
| Transcription | Whisper **en local**, la voix ne quitte pas le Mac | Section confidentialité |
| Nettoyage | Moteur IA gratuit (Groq conseillé, Mistral, Cloudflare…), **avec ta propre clé gratuite** (2 min), ou Ollama 100 % local | « Comment ça marche », FAQ |
| Signature | **Pas encore notarisée** par Apple : une étape unique au premier lancement | Bloc d'installation dédié (voir §5) |
| Éditeur | CBW Studio | Pied de page, mentions |

---

## 1. Panorama des concurrents (relevé 2026)

### 1.1 Héros et CTA

| Produit | Titre (H1) | Sous-titre | CTA principal | Micro-ligne sous le CTA | CTA secondaire |
|---|---|---|---|---|---|
| **Wispr Flow** | « Don't type, *just speak.* » | « The voice-to-text AI that turns speech into clear, polished writing in every app. » | **Download for free** | « Available on Mac, Windows, iPhone, and Android » | Bandeau « Try for free » (Notetaker), widget flottant « Get app » |
| **Superwhisper** | « Just speak. Write faster. » | « Turn your voice into polished text. » + « Works in Slack, Gmail and any other site or app. » | **Download** | Plateformes (pas de version macOS) | « Watch my demo » |
| **VoiceInk** | « Write at the speed of thought » | « …local AI models… near-perfect accuracy and complete privacy. » | **Buy Now** (essai gratuit plus bas) | Badges « 100% Private · Open Source · Lightning Fast » | « Now available on iOS » |
| **Aqua Voice** | « We've typed for 150 years. It's time to speak. » | « …clear text in real time, for everything from AI prompts to essays. » | **Get Started on Mac** | — | « Pricing » (nav) |
| **Granola** | « The AI notepad for back-to-back meetings » | « Notes, actions and memory. Without a meeting bot. » | **Download for free** | « Available for macOS, Windows, iOS, Android » | « Talk to sales » (nav) |
| **Otter** | « Your AI notetaker is now also your Conversational Knowledge Engine » | « …searchable knowledge… » | Start for free | — | Schedule demo |
| **Raycast** | « Your shortcut to everything. » | « …Fast, ergonomic and reliable. » | Download (nav) / « Download and use Raycast for free » en clôture | — | Raycast AI, Store |
| **Linear** | « The product development system for teams and agents » | « Purpose-built… Designed for the AI era. » | Get started | — | Contact sales |
| **Dia (ex-Arc)** | « More than a browser. A better workday. » | (aucun) | **Download Dia for free** | « Available for macOS and Windows » | « Watch the trailer video » |
| **CleanShot X** | « There are average capture apps. And there's CleanShot. » | « The Mac-native toolkit for screenshots, recordings and collaboration. » | Get CleanShot for Mac | « Trusted by 250,000+ users » | How it works |
| **Notion AI** | « Meet your 24/7 AI team. » | — | Try for free | — | Request a demo |
| **MacWhisper** (Gumroad) | Fiche produit Gumroad (non lisible au relevé, domaine goodsnooze.com hors ligne) | — | Achat / téléchargement gratuit via Gumroad | — | — |
| **Maccy** (indie, gratuit, open source) | « Maccy » | « Clipboard manager for macOS which does one job… Period. » | Get in App Store + **Download now** | « Requires macOS Sonoma 14 or higher » | GitHub, Documentation |
| **Rectangle** (indie, gratuit, open source) | « Rectangle » | « Move and resize windows in macOS using keyboard shortcuts or snap areas. » | **Download** v2.0.3 (DMG) | « macOS 10.15+ · Intel et Apple Silicon » | Rectangle Pro, GitHub |
| **Ice** (indie, gratuit) | « Ice » | « …a powerful menu bar management tool. » | Download | (rien) | Donate, GitHub |

**Lecture.** Les leaders de la dictée utilisent tous le même schéma : **impératif court + bénéfice « vitesse/propreté » + « dans toutes vos apps »**. Le CTA dominant est **« Download for free »** : le mot « gratuit » est *dans le bouton* ou juste dessous. Presque personne n'affiche la taille du fichier ni la version de macOS dans le héros. Seules les apps indies le font (Maccy, Rectangle), et c'est rassurant. **CBW AI peut faire mieux que les leaders sur ce point.**

### 1.2 Démo, preuve sociale, tarification, confidentialité

| Produit | Format de démo | Preuve sociale | Gratuit / prix | Confidentialité | FAQ |
|---|---|---|---|---|---|
| Wispr Flow | **Avant/après animé** : texte parlé brouillon → texte propre, avec étiquettes « Filler identified », « Correction identified », « Repetition identified ». Compteur **45 vs 220 mots/min** | Logos (Microsoft, Notion, Vercel…), chiffres ROI, témoignages de personnalités | Gratuit plafonné à 2 000 mots/semaine, Pro payant | « Your voice stays yours » + SOC 2, HIPAA, ISO | Oui, accordéon (apps, langues, micros, confidentialité) |
| Superwhisper | **Démo à essayer sur la page** : « press ⌥ + space and start dictating » (+ « Can't talk right now? » pour taper) | Logos, tweets (Karpathy, levelsio…) | Free / Pro / Lifetime, remboursement 30 j | « Works offline » | Oui (Intel, essai, licences) |
| VoiceInk | Cartes texte **« What you say » / « What you get »** (pas de vidéo) | « Loved by 13,469+ », 200k téléchargements, 4,9/5, mur de témoignages | « Buy once. Own forever. » 25 à 49 $ | « Your voice data never leaves your Mac » + open source | Oui (dont **configuration requise : Apple Silicon, macOS 14.4+**) |
| Aqua Voice | Texte rotatif (« speak to draft an email… ») + icônes d'apps, invites « Hold Space and try yourself » | Logos, **230 vs 40 WPM**, grille de posts X | « Get started for free » (1 000 mots), puis payant | « Privacy Mode », ZDR | Non (lien en pied de page) |
| Granola | Maquette UI d'une note avec bascule « My notes / Enhanced » | Logos, témoignages de dirigeants tech | « Unlimited meeting notes for free » | « Humans in the room, not bots », « Private by default » | Non |
| Otter | Vidéo + démo interactive | Logos grands comptes, WSJ, « 4+ hours saved » | « Free forever » + payant | Générique « enterprise » | Non |
| Raycast | Clavier illustré, chat IA animé, onglets d'extensions | Grille d'avatars, chiffres de communauté | « Download and use Raycast for free » | Pied de page seulement | Non |
| Linear | Captures UI statiques légendées « Fig 0.1… » (ton éditorial) | Citations clients, « 40 000 équipes » | Non affiché | Pied de page | Non |
| Dia | Vidéo bande-annonce + captures | **Aucune** | « Download Dia for free » | **Section dédiée avec des interrupteurs de réglages** (Block trackers, Memory…) | Non |
| CleanShot X | Captures statiques par fonction | 4,9/5, « 350+ tweets », logos d'éditeurs Mac | Pas de prix sur l'accueil, remboursement 30 j | — | Non |
| Notion AI | GIF en boucle, captures 16:10, onglets | Logos, 2 témoignages | Free / Business | Section sécurité détaillée | Oui |
| Maccy | Une seule image | 4 témoignages, badge Product Hunt | « is and will always be free » (MIT) | Gestion des mots de passe copiés | Non |
| Rectangle | 2 captures | Liste de sponsors | « Free and Open Source » | Lien | Non |

### 1.3 Structure et longueur de page

| Produit | Longueur approx. | Ordre des sections |
|---|---|---|
| Wispr Flow | Longue (~10 écrans) | Héros → avant/après → logos → « How it works » → 4 blocs fonction → tons → cartes fonctions → confidentialité → témoignages → FAQ → CTA final → footer |
| Superwhisper | Très longue (~15 écrans) | Héros + démo à essayer → logos → témoignages → 10 fonctions → intégrations → code → mobile → tutoriels → prix → FAQ |
| VoiceInk | Moyenne-longue | Héros + badges → cas d'usage avant/après → confidentialité → prix → mur d'avis → FAQ |
| Aqua | Longue | Héros → vitesse → 3 piliers → code → stats → usages → fonctions → témoignages → prix |
| Granola | Moyenne | Héros → logos → 3 piliers → avant/pendant/après → « partout » → prix gratuit → témoignages |
| Dia | **Courte (~5 écrans)** | Héros → 3 fonctions numérotées → 6 fonctions → confidentialité → CTA final → footer |
| Maccy / Rectangle / Ice | **Très courte (2–4 écrans)** | Héros → grille de fonctions → captures → (avis) → footer |

---

## 2. Patterns gagnants (à reprendre)

1. **Le bouton dit l'action et le prix** : « Download for free » (Wispr, Granola, Dia). En français : **« Télécharger gratuitement pour macOS »** ou bouton « Télécharger pour macOS » + « Gratuit » collé dessous.
2. **Une micro-ligne de réassurance sous le CTA**, toujours au même endroit, en petit (JetBrains Mono s'y prête bien) : version, puce, taille. Les leaders ne le font pas, les indies si (Maccy, Rectangle, VoiceInk dans la FAQ).
3. **La démo avant/après est le meilleur argument de la dictée** (Wispr, VoiceInk). Montrer le texte *parlé* (avec « euh », répétitions, « trois, enfin non quatre ») qui devient le texte *propre*. Les étiquettes de Wispr (« hésitation retirée », « correction ») rendent visible ce que l'IA a fait.
4. **Le raccourci clavier dans la démo** (Superwhisper « ⌥ + space », Aqua « Hold Space ») : la personne comprend le geste avant même de télécharger. Chez nous : **⌃ ⌃**.
5. **« Dans toutes tes apps »** avec une rangée d'icônes (Mail, Notes, Slack, ChatGPT, Claude, Cursor…) : Aqua, Wispr, Superwhisper.
6. **Un chiffre de vitesse simple** : 40 mots/min au clavier contre 150 à 220 à la voix (Wispr, Aqua). À reprendre sans exagérer, et en indiquant l'ordre de grandeur général, pas un chiffre mesuré sur CBW AI.
7. **La confidentialité exprimée par le concret** : « Your voice data never leaves your Mac » (VoiceInk), les interrupteurs de réglages de Dia, « Without a bot » (Granola). Une phrase factuelle vaut mieux qu'un logo de certification.
8. **CTA final répété** en bas de page (tous) et **CTA dans la barre de navigation fixe** (Aqua, Raycast, Linear).
9. **Pages courtes pour les apps gratuites** (Dia, Maccy, Rectangle) : pas besoin de convaincre un acheteur, juste de rassurer et de montrer.
10. **« 3 temps » numérotés** (Dia : 3 fonctions numérotées ; Granola : avant/pendant/après ; Wispr : « How it works ») : ancrent la compréhension rapidement.

## 3. Pièges à éviter

| Piège observé | Chez qui | Pourquoi l'éviter pour CBW AI |
|---|---|---|
| CTA principal qui mène ailleurs qu'au téléchargement (« Buy Now », « Get Started » vers un compte) | VoiceInk, Aqua, Linear | Notre seule action est le DMG. Le bouton télécharge le fichier directement (`/download` qui redirige vers la release GitHub) |
| Plusieurs CTA concurrents dans le héros (bandeau, widget flottant, démo, iOS) | Wispr, VoiceInk | Un seul bouton plein. Le secondaire est un lien texte (« Voir comment ça marche ↓ ») |
| Exigences système cachées dans la FAQ | Superwhisper, VoiceInk, CleanShot | Un utilisateur Intel qui télécharge 117 Mo pour rien est un utilisateur perdu. Le dire sous le bouton |
| Logos d'entreprises et témoignages de célébrités | Wispr, Superwhisper, Aqua | Nous n'en avons pas. **Ne rien inventer.** Dia prouve qu'une page sans preuve sociale fonctionne. Remplacer par la preuve *produit* (démo réelle) et la transparence (open source/GitHub si public, gratuité expliquée) |
| Pages très longues (10 à 15 écrans) avec des fonctions avancées | Superwhisper, Aqua | Notre promesse est la simplicité. Viser **6 à 7 écrans** maximum |
| Gratuité ambiguë (« free » mais plafonné) | Wispr (2 000 mots/sem.), Aqua (1 000 mots) | Notre vrai avantage : **gratuit sans plafond chez nous**. Dire honnêtement que les limites éventuelles viennent du fournisseur IA gratuit et que l'app bascule sur le suivant |
| Jargon (« Conversational Knowledge Engine », « LLM », « ZDR ») | Otter, Aqua | Public large et francophone. Dire « moteur IA », « clé gratuite » |
| Vidéo lourde en autoplay dans le héros | Otter, Dia | Pénalise la performance mobile. Préférer une animation HTML/CSS du texte (légère, nette, accessible) |
| Promesse « 100 % local » alors que le nettoyage passe en ligne | — (risque pour nous) | Être exact : **voix transcrite en local**, seul le *texte* part vers le moteur IA choisi, ou rien du tout avec Ollama |
| Cacher l'avertissement Gatekeeper | Ice, la plupart des indies | L'utilisateur croit à un virus et abandonne. L'annoncer **avant** le téléchargement, calmement (§5) |

---

## 4. Structure de page recommandée (section par section)

Principes : **fond blanc**, titres en **Archivo** (graisse forte, interlignage serré), données techniques et raccourcis en **JetBrains Mono**, barres **orange / bleu / vert** comme seul motif graphique (égaliseur aux extrémités arrondies). Tutoiement, comme l'aide. Phrases courtes, pas de jargon. Un seul bouton plein par écran.

### S0. Barre de navigation (fixe, fine)
- Gauche : logo (barres) + « CBW AI ».
- Droite : liens « Comment ça marche », « Confidentialité », « FAQ » + **bouton compact « Télécharger »**. Sur mobile, ne garder que le logo et le bouton.

### S1. Héros (1er écran, au-dessus de la ligne de flottaison)
- **Titre** (6 mots maximum, impératif ou contraste). Pistes :
  - « Parle. CBW AI écrit, proprement. »
  - « Ta voix, ton texte. Sans les « euh ». »
  - « Arrête de taper. Parle. »
- **Sous-titre** (une phrase, bénéfice + universalité + gratuité) : « La dictée vocale gratuite pour Mac qui écrit à ta place dans toutes tes apps, sans les hésitations ni les répétitions. »
- **CTA principal** : bouton plein « **Télécharger pour macOS** » (icône Apple ou flèche de téléchargement), directement sous le sous-titre.
- **Micro-ligne** (JetBrains Mono, gris, une ligne) : `Gratuit · macOS 14+ · Apple Silicon (M1 et +) · 117 Mo`
- **Lien secondaire** (texte, pas bouton) : « Voir comment ça marche ↓ ».
- **Visuel** : démo avant/après animée (voir S2), ou maquette de la barre de menus avec l'indicateur d'état (barres qui s'animent pendant l'écoute).
- Détection : si le visiteur est sur iPhone/Android/Windows, remplacer le bouton par « Disponible sur Mac uniquement » + « M'envoyer le lien » (ou copier le lien). Ne pas proposer un DMG sur mobile.

### S2. La démo avant/après (le cœur de la page)
- Titre : « Tu parles comme tu penses. CBW AI écrit comme tu voudrais. »
- Deux colonnes (ou empilées sur mobile) :
  - **Ce que tu dis** (gris, texte barré par endroits) : « Euh donc on se voit, on se voit jeudi, enfin non vendredi, à trois heures pour, euh, le point budget. »
  - **Ce qui s'écrit** (noir) : « On se voit vendredi à 15 h pour le point budget. »
- Étiquettes animées sur les corrections, aux couleurs de marque : orange « hésitation retirée », bleu « répétition retirée », vert « correction appliquée ».
- Badge clavier en JetBrains Mono : `⌃ ⌃` « deux appuis sur Control, tu parles, c'est écrit ».
- Proposer 3 exemples à faire défiler (onglets) : un mail, un message Slack, un prompt pour ChatGPT/Claude.
- Phrase de principe sous la démo : « CBW AI corrige ta parole, il ne réécrit pas tes idées. Il n'invente rien. »

### S3. Comment ça marche en 3 étapes
Les concurrents numérotent (Dia) ou découpent en temps (Granola). Format recommandé : 3 cartes horizontales, numéros géants en Archivo, une barre de couleur par carte (orange, bleu, vert).
1. **Appuie deux fois sur Control.** « Où que tu sois : mail, navigateur, Notion, ChatGPT… »
2. **Parle naturellement.** « Hésite, reprends-toi, change d'avis : c'est normal. »
3. **Le texte apparaît, propre.** « Ponctué, sans les « euh », là où se trouve ton curseur. »
- Règles : un verbe d'action par titre, 12 mots maximum de texte par étape, pas de capture d'écran par étape (l'icône/le geste suffit).

### S4. Trois usages (fonctions, sans liste interminable)
Une rangée de 3 blocs, chacun avec une petite maquette UI :
- **Dicter partout** : le texte s'écrit dans l'app active. Rangée d'icônes d'apps.
- **Prendre une note** : « Trois appuis sur Control, tu parles aussi longtemps que tu veux. La note est enregistrée sur ton Mac en Markdown. »
- **Du brainstorm au prompt maître** : « Parle en vrac de ton idée, CBW AI en fait un prompt clair et structuré, prêt à coller dans ChatGPT ou Claude. »
- Ne pas dépasser 3 blocs. Les réglages avancés (raccourcis alternatifs, moteurs) vont dans la FAQ ou l'aide.

### S5. Confidentialité (exacte, rassurante)
- Titre : « Ta voix reste sur ton Mac. »
- 3 points, chacun factuel :
  - « La transcription se fait sur ton Mac, avec Whisper. Ta voix n'est envoyée nulle part. »
  - « Seul le texte transcrit est envoyé au moteur IA que tu choisis, pour le nettoyer. Tu peux même tout faire en local avec Ollama. »
  - « Tes notes sont de simples fichiers dans Documents › CBW AI. Pas de compte, pas de cloud CBW. »
- Idée de visuel (inspirée de Dia) : un panneau de réglages avec des interrupteurs (« Transcription locale : activée », « Local d'abord : au choix »).
- **Interdit** : écrire « 100 % hors ligne » ou « rien ne quitte ton Mac » sans nuance.

### S6. Gratuit, vraiment (bloc prix)
- Titre : « 0 €. Pas d'abonnement, pas de compte, pas de carte bancaire. »
- Texte : « CBW AI utilise des moteurs IA qui offrent un accès gratuit. Tu crées ta propre clé gratuite en 2 minutes (on te guide). Si un moteur atteint sa limite du jour, CBW AI passe au suivant. »
- Avantage face à Wispr (2 000 mots/semaine) et Aqua (1 000 mots) : **pas de plafond fixé par CBW AI**. Le dire sans citer les concurrents nommément.
- Répéter le bouton « Télécharger pour macOS ».

### S7. Installation (bloc Gatekeeper, voir §5)
Titre : « Installer en 1 minute ». Placé **juste après le prix**, et rappelé sur la page de remerciement qui suit le téléchargement.

### S8. FAQ (accordéon, 6 à 8 questions maximum)
1. Mon Mac est-il compatible ? (Apple Silicon, macOS 14+, comment vérifier : menu  › À propos de ce Mac)
2. C'est vraiment gratuit ? Où est le piège ?
3. Pourquoi faut-il une clé ? Est-ce compliqué ?
4. Ma voix est-elle envoyée sur internet ?
5. Pourquoi macOS affiche-t-il un avertissement au premier lancement ?
6. Ça marche dans quelles apps ? En quelles langues ?
7. Comment désinstaller ?
8. Comment mettre à jour ? (télécharger le nouveau DMG et remplacer l'app ; réglages et modèle conservés)
- Chaque réponse fait 2 à 3 phrases maximum, avec un lien vers l'aide complète.

### S9. CTA final
- Titre court : « Prêt à arrêter de taper ? »
- Bouton « Télécharger pour macOS » + la même micro-ligne `Gratuit · macOS 14+ · Apple Silicon · 117 Mo`.
- Motif des barres orange/bleu/vert en grand, comme signature visuelle.

### S10. Pied de page (minimal)
- « CBW AI, une app de CBW Studio. » · Aide · Confidentialité · Mentions légales · Contact · (GitHub si le dépôt est public) · Version et date de la dernière release (`v1.0.0 · octobre 2026`), ce qui montre que l'app est maintenue.

**Longueur cible : 6 à 7 écrans sur ordinateur.** Les apps gratuites qui convertissent le mieux sont courtes (Dia, Maccy, Rectangle).

---

## 5. App non notarisée : présenter Gatekeeper sans faire peur

Constats :
- La plupart des indies ne disent rien (Ice). Résultat : l'utilisateur voit « Apple ne peut pas vérifier… » et croit à un logiciel malveillant.
- Depuis **macOS 15 Sequoia**, le clic droit › Ouvrir ne suffit plus : il faut passer par **Réglages Système › Confidentialité et sécurité › Ouvrir quand même**. Sur macOS 14, le clic droit › Ouvrir fonctionne encore. L'aide (`AIDE.md`) suit déjà cette logique, il faut la reprendre telle quelle.
- **Point technique à vérifier côté build** : sur Apple Silicon, une app *totalement* non signée déclenche « est endommagé et ne peut pas être ouvert », un message qui n'offre pas de bouton « Ouvrir quand même ». L'app doit être au moins **signée ad hoc** pour obtenir le message « Apple ne peut pas vérifier ». À tester sur un Mac neuf avant la mise en ligne.

Recommandations de présentation :
1. **Annoncer avant le téléchargement**, dans le bloc S7, en ton calme : « Au premier lancement, macOS te demandera une confirmation. C'est normal : CBW AI n'est pas encore enregistré auprès d'Apple (une démarche payante prévue plus tard). À faire une seule fois. »
2. **Expliquer pourquoi** en une phrase, sans le mot « danger » et sans mettre l'avertissement en rouge. Utiliser un encadré neutre (fond gris très clair, barre bleue à gauche), pas une alerte orange ou rouge.
3. **Montrer les étapes avec des captures recadrées** des vraies fenêtres macOS, numérotées de 1 à 4 :
   1. Ouvre CBW AI. Quand macOS affiche le message, clique sur **Terminé**.
   2. Ouvre **Réglages Système › Confidentialité et sécurité**.
   3. En bas, à côté de « CBW AI a été bloqué », clique sur **Ouvrir quand même**.
   4. Confirme avec ton mot de passe ou Touch ID. C'est fini.
4. Variante repliée « Sur macOS 14 Sonoma : clic droit › Ouvrir ».
5. **Page de remerciement après le clic sur Télécharger** (pattern standard des apps à DMG) : « Ton téléchargement a commencé » + les 3 gestes (ouvrir le DMG, glisser dans Applications, confirmer au premier lancement) + le rappel Gatekeeper. C'est le moment où la personne en a besoin.
6. **Signaux de confiance** pour compenser l'absence de notarisation : lien vers le code source si le dépôt est public, empreinte **SHA-256** du DMG en JetBrains Mono (le script de build l'affiche déjà), éditeur identifié (CBW Studio), lien vers l'aide.
7. **Ne pas mettre** la commande Terminal `xattr` sur la landing page : elle fait peur au grand public. La garder dans l'aide, en dernier recours.

---

## 6. Performance et responsive

- **Héros sans vidéo** : démo avant/après en HTML/CSS/JS léger (texte réel, donc lisible, indexable et accessible). Si une vidéo est nécessaire, la mettre plus bas, en lecture au clic, avec une affiche (poster) et un fichier de moins de 2 Mo.
- **Polices** : 2 familles (Archivo + JetBrains Mono), sous-ensemble latin, `font-display: swap`, 3 graisses maximum.
- Objectif Lighthouse mobile ≥ 90 : LCP < 2 s, pas de saut de mise en page (réserver la hauteur de la démo).
- **Mobile** : la plupart des visiteurs mobiles ne peuvent pas installer. Prévoir le CTA « Disponible sur Mac. M'envoyer le lien ». Cartes empilées, marges latérales de 16 px, boutons de 44 px de haut minimum.
- `prefers-reduced-motion` : figer l'animation sur l'état « après ».

## 7. Micro-interactions recommandées (sobres)

- **Barres orange/bleu/vert qui s'animent** comme un égaliseur quand la démo « écoute », et se figent quand le texte est écrit. C'est la signature de la marque, à réutiliser comme indicateur d'état (le même que dans l'app).
- Effet machine à écrire pour le texte « après », avec les mots retirés qui s'estompent du texte « avant ».
- Touches `⌃` qui s'enfoncent deux fois au survol du badge clavier.
- Survol du bouton Télécharger : légère montée et flèche qui descend. Au clic : l'état devient « Téléchargement lancé ✓ » puis redirection vers la page d'installation.
- Bouton « copier » à côté de l'empreinte SHA-256.
- À éviter : widget flottant (Wispr), bandeaux rotatifs, pop-up newsletter, compteurs inventés.

## 8. Guide de ton (copy en français)

| Faire | Éviter |
|---|---|
| Tutoyer (cohérent avec l'aide et l'app) | Mélanger « tu » et « vous » |
| Verbes d'action : Parle, Télécharge, Dicte | « Révolutionnez votre productivité » |
| Chiffres exacts : 117 Mo, macOS 14, 0 € | « Ultra-léger », « 100 % privé » sans nuance |
| « Moteur IA », « clé gratuite », « sur ton Mac » | LLM, API, ZDR, inférence, onboarding |
| « Il n'invente rien » (notre différence) | Promettre une rédaction ou un assistant |
| Ponctuation française (espace avant « : ? ! », guillemets « ») | Guillemets droits et anglicismes |
| Boutons : « Télécharger pour macOS » (même libellé partout) | Varier les libellés (Get, Essayer, Commencer) |

---

## Sources (relevé du 9 octobre 2026)
- https://wisprflow.ai · https://superwhisper.com · https://tryvoiceink.com · https://aquavoice.com · https://www.granola.ai · https://otter.ai · https://www.raycast.com · https://linear.app · https://www.diabrowser.com · https://cleanshot.com · https://www.notion.com/product/ai · https://maccy.app · https://rectangleapp.com · https://icemenubar.app · https://goodsnooze.gumroad.com/l/macwhisper (contenu non lisible)
- Gatekeeper sous Sequoia : https://www.macworld.com/article/2457844/what-to-do-when-you-cant-open-an-app-you-just-installed-in-macos-sequoia.html · https://troz.net/post/2024/sequoia_app_permissions/

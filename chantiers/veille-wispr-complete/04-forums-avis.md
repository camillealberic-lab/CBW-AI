# Veille 04 : ce qui se dit sur Wispr Flow (forums, réseaux, avis) — oct. 2026

Date de la veille : 14 octobre 2026. Lecture seule, rien publié.

## 0. Méthode et limites (à lire avant)

- **Corpus réellement lu** (≈ 190 prises de parole) :
  - ~118 commentaires Hacker News de janv. à oct. 2026 (API Algolia, 2 pages).
  - ~20 avis App Store (10 FR, 10 US).
  - 13 avis Product Hunt.
  - ~25 articles et tests, dont 8 francophones.
  - Le changelog officiel Wispr, le journal d'incidents (status page via Voibe/StatusGator) et 3 récits de désabonnement.
- **Reddit et X ne sont pas accessibles directement** : Reddit bloque l'agent, et X n'est pas indexé par la recherche. Les fils Reddit (r/WisprFlow, r/ProductivityApps) sont cités **de seconde main**, via TaskDumpr, Voibe et tl;dv. **YouTube** n'est pas sorti dans les résultats, seulement indirectement (tl;dv cite un youtubeur de 18 k abonnés : « by far has the best UI »).
- **G2** (403) et **Trustpilot** sont inaccessibles. Le profil Trustpilot est « removed » aujourd'hui, mais il était noté 2,5 à 2,7/5 sur 39 avis selon les relais.
- **Biais** : beaucoup d'articles viennent de **concurrents** (Voibe, EmberType, Spokenly, Laxis, Willow, Yaps). Ils sont signalés « (concurrent) ». Les blogs FR sont souvent affiliés. HN surreprésente les développeurs et les fans d'open source local.
- **Fréquences** : estimations à la louche sur ce corpus. Elles servent à **classer** les thèmes, pas à mesurer.

## 1. Contexte en 5 lignes

- **Valorisation** : 700 M$ en nov. 2025, puis 2 Md$ (série B de 280 M$, Menlo) en août 2026. Croissance du CA annoncée > 150 % par trimestre.
- **Plateformes** : Mac, Windows, iOS et Android (Android depuis fév. 2026).
- **Prix** : gratuit à 2 000 mots/sem. sur desktop, 1 000 sur iPhone. Pro à 15 $/mois ou 12 $/mois en annuel. Essai de 14 jours sans carte. Pas d'offre à vie.
- **Notetaker** (notes de réunion sans bot, Mac uniquement) lancé le 5 août 2026, avec 21 langues dont le français. **Concurrent direct de la partie « notes » de CBW AI.**
- **Modèle maison « Canto »** annoncé en août et déployé le 17 sept. 2026. Il réagit à une vague de plaintes sur la précision entre juin et août.

## 2. Usages réels

| Usage | Fréquence estimée | Preuves |
|---|---|---|
| **Prompts pour l'IA** (Claude Code, Cursor, ChatGPT, Perplexity) | **Très forte. C'est l'usage n°1 chez les gros utilisateurs.** | Un testeur sur 90 jours : **62 % de ses dictées vont dans des prompts IA**, 21 % dans des messages pro (Slack), 10 % dans des messages perso, seulement 2 % dans des e-mails et 1 % dans des documents ([mrktcorrect, mai–sept. 2026](https://mrktcorrect.com/blog/wispr-flow-review)). HN : « my current workflow is literally just talking to Claude via Wispr Flow » ([svessi, 21/03/2026](https://news.ycombinator.com/item?id=47472445)) ; « very good for doing plans with Claude Code » ([prescriptivist, 27/02/2026](https://news.ycombinator.com/item?id=47181341)) ; « I describe the bug by voice (Wispr Flow), Claude searches memory » ([NotMichaelBay, 14/02/2026](https://news.ycombinator.com/item?id=47015844)). |
| **Messages courts** (Slack, Teams, SMS, WhatsApp) | Forte | « the whole goal is… Slack, email, WhatsApp » (pitch officiel). Mises en forme inégales dans Teams (r/WisprFlow via [TaskDumpr, 10/09/2026](https://taskdumpr.com/blog/wispr-flow-review)). |
| **E-mails** | Moyenne. On en parle beaucoup dans les blogs, mais l'usage mesuré est faible. | [Shiftia, 19/06/2026](https://shiftia.fr/tests/wispr-flow-dictee-vocale-ia/) : « dicter ses emails vaut-il 12 €/mois ? » |
| **Écriture longue / « brain dump »** (articles, scripts, notes) | Moyenne | Zack Proser a dicté sa revue en marchant dans son bureau ([01/08/2026](https://zackproser.com/blog/wisprflow-review)). Pour [Shubham Sharma (FR), 19/03/2026](https://shubham-sharma.fr/outils/wispr-flow/), ce sont les scripts YouTube et les briefs créatifs. |
| **Accessibilité** (RSI, blessure, dyspraxie, bébé dans les bras) | Faible mais récurrente et très chargée émotionnellement | « LLMs may have helped my RSI… Wispr Flow/similar STT ftw » ([fragmede, 07/10/2026](https://news.ycombinator.com/item?id=49989227)) ; « So decided to try Wispr Flow… since I couldn't type » ([noahomrilevin, 09/04/2026](https://news.ycombinator.com/item?id=47709299)) ; App Store US : dicte « hands-free » en s'occupant d'un bébé (AussTX2, 28/09/2026). |
| **Code mobile / pilotage d'agents à distance** | Émergent | « Wispr Flow on mobile fills this gap » (Claude Code Remote) ([elliotbnvl, 25/02/2026](https://news.ycombinator.com/item?id=47152457)). |
| **Notes de réunion** (Notetaker) | Trop récent, peu de retours | Plaintes : « Notetaker reportedly slowed calls on an 8 GB Mac », pas de version mobile ([tl;dv, 11/10/2026](https://tldv.io/blog/wisprflow/)). |

**À retenir** : chez les gros utilisateurs, Wispr est d'abord un **clavier pour parler aux IA**, bien plus qu'un outil d'e-mail.

## 3. Astuces de power users (comment ils dictent)

1. **Parler comme à un collègue, pas comme à une machine.** « talking as if briefing a colleague » (mrktcorrect). Côté FR : « Parler naturellement, comme à un collègue, plutôt que dicter lentement » ([outils-traduction.fr, 2026](https://www.outils-traduction.fr/outils-productivite/wispr-flow/)). Les deux premiers jours, « on sur-articule par réflexe ». Il faut **environ 2 semaines** pour trouver son rythme (Shiftia).
2. **Dire tout le contexte, y compris les échecs et les contraintes.** « what I've already tried… which files Claude Code should leave alone ». Parler fait moins sauter de détails que taper ([XDA, 20/09/2026](https://www.xda-developers.com/paired-claude-code-with-wispr-flow/)).
3. **Découper les longues dictées** en blocs de 30 à 90 s. Au-delà de 3 ou 4 min d'affilée, « les choses commencent à se dérégler » (journaliste relayé par [studeria.fr](https://www.studeria.fr/articles-de-blog/wispr-flow-claude-dicter-au-lieu-de-taper)). En plus, c'est plus facile à relire et à relancer en cas d'échec (Zack Proser).
4. **Dicter la prose, taper le reste** : code, symboles, numéros, dates et petites retouches. « Voice input isn't a typing replacement. It's a typing multiplier. » (mrktcorrect). Vérifier à l'œil les suites de chiffres.
5. **Touches** : maintenir fn (push-to-talk) pour une dictée courte. Pour une dictée longue, **double-tap sur fn** pour démarrer et un appui pour arrêter (Zack Proser).
6. **Micro** : prendre un casque proche de la bouche et éviter les AirPods/Bluetooth, qui coupent le début des phrases ([wisprflowguide](https://wisprflowguide.com/docs/guides/dictation-tips/)). Un utilisateur de Dragon depuis 15 ans recommande un casque pro (r/WisprFlow via TaskDumpr).
7. **Dictionnaire court et ciblé.** Wispr conseille de l'élaguer en cas de substitutions étranges. Certains en font un outil de remplacement : « I actually have a replacement rule "asian" → "agent" in my Wispr flow dict » ([lukasec, 20/04/2026](https://news.ycombinator.com/item?id=47831824)).
8. **Command Mode** (Pro, Fn+Ctrl) : sélectionner du texte puis dire « rends-le plus formel » ou « en liste ».
9. **Ne pas se relire en dictant** : on vide tout, puis on trie (TaskDumpr).
10. **Confidentialité, ce que les power users activent** : désactiver « Improve the model » **et** « Dictation cloud storage » (les deux sont nécessaires pour une conservation zéro), et couper Context Awareness pour les contenus sous NDA (tl;dv).
11. **Baisser Auto Cleanup** pour obtenir du verbatim. Annuler (undo) affiche la transcription brute (TaskDumpr).

## 4. Ce qui est adoré

| Thème | Fréquence estimée | Citations |
|---|---|---|
| **Nettoyage « magique »** : euh, faux départs, auto-corrections | **Très forte**, environ 40 % des avis positifs | « an "umm three, no! four!" just results in "four" » ([fragmede, 29/03/2026](https://news.ycombinator.com/item?id=47559537)) ; « Wispr flow cuts out ums. I love it » ([cm2012, 15/05/2026](https://news.ycombinator.com/item?id=48143529)) ; « enfin corrige intelligemment ce que je dis à l'oral ! » (App Store FR, 08/09) |
| **Qualité perçue bien au-dessus de la dictée Apple/Android** | Forte | « a masterclass in STT. Apple's solution feels like it's from the last century » ([terabytest, 19/05/2026](https://news.ycombinator.com/item?id=48193437)) ; « much more accurate than the built in functionality in iOS » ([deepspace, 18/02/2026](https://news.ycombinator.com/item?id=47066799)) |
| **Listes et mise en forme automatiques** | Moyenne à forte | « it will literally put it in a perfect list for you » (App Store US, 28/09/2026) ; « WisprFlow gets all of the bulleted lists formatted correctly » ([qq66, 10/04/2026](https://news.ycombinator.com/item?id=47721892)) |
| **Chuchoter** (open space, maison) | Moyenne, très citée en FR | « On peut vraiment chuchoter dans le micro et ça ne perd aucune information » (App Store FR, 25/07) |
| **Vitesse de débit** (150 à 184 mots/min contre 45 à 90 en tapant) | Forte | « I speak three and a half times quicker than I can type » (Product Hunt) ; 50 000 mots à 160 mots/min, « largely stopped using his keyboard » (r/WisprFlow via TaskDumpr) |
| **Marche partout + synchro** du dictionnaire et des snippets entre appareils | Moyenne | « Flow just… appears wherever I'm typing » (Product Hunt) |
| **Mélange de langues** (garder les mots anglais dans une phrase non anglaise) | Moyenne chez les non-anglophones | « smart enough to keep those English words in English even when the rest of the sentence is in Czech » (Product Hunt) |
| **Apprend votre vocabulaire et votre style** | Moyenne | « It learns how you talk… and knows your vocabulary » (App Store US, 05/10/2026) ; « reconnaît même les abréviations que l'on souhaite lui apprendre » (App Store FR, 04/12/2025) |
| **Polish, interface** | Moyenne | « Wisprflow is magical ime » ([ramraj07, 11/10/2026](https://news.ycombinator.com/item?id=50044186)) ; « the dx was top notch » ([kartik017, 12/10/2026](https://news.ycombinator.com/item?id=50052237)) |

## 5. Ce qui agace

| Thème | Fréquence estimée (sur les avis négatifs ou mitigés) | Citations |
|---|---|---|
| **Prix / abonnement / « encore un abonnement »** | **Très forte, environ 35 %.** C'est la 1re raison de départ sur HN. | « Wisprflow is not $12/month better than ios » ([prepend, 19/05/2026](https://news.ycombinator.com/item?id=48198223)) ; « tired of paying $15/mo for Wispr Flow » ([xavpoon, 23/02/2026](https://news.ycombinator.com/item?id=47119223)) ; « I really don't get it why anyone would still pay for Wispr Flow » ([bresc, 13/10/2026](https://news.ycombinator.com/item?id=50068571)) ; en FR, « principal frein : le prix » (blogs) |
| **Cloud uniquement / confidentialité** | **Très forte, environ 30 %** | « did not like the non-local aspect, and having yet another subscription » ([d4rkp4ttern, 05/01/2026](https://news.ycombinator.com/item?id=46497820)) ; « didnt want to pay $12/month… or have my audio sent to the cloud » ([jyoutir, 25/03/2026](https://news.ycombinator.com/item?id=47514710)) ; « needs explicit language around what 'improving our models' means » (Product Hunt) |
| **Affaire des captures d'écran (mai 2026)** | Forte dans les articles, citée en boucle | Un utilisateur découvre que Context Awareness envoie des captures de la fenêtre active. Il est **banni**, puis le CTO présente des excuses publiques et la documentation est réécrite ([EmberType (concurrent), 05/05/2026](https://embertype.com/blog/the-day-wispr-flow-banned-a-user/) ; [Laxis (concurrent)](https://www.laxis.com/fr/blog/wispr-flow/)). S'y ajoute l'audit SOC 2 « Delve » contesté : « gives me major pause » ([ibero, 06/04/2026](https://news.ycombinator.com/item?id=47667811)). |
| **Baisse de qualité / fiabilité** (juin à août 2026) | Forte, environ 20 % | Wispr l'admet : « Flow has been less reliable than it should be » (4/06) et « an Auto Cleanup setting that was too aggressive » (9/07) ([changelog](https://wisprflow.ai/whats-new)). « wisprflow has been degraded recently » ([kartik017, 11/10/2026](https://news.ycombinator.com/item?id=50046242)) ; « they are cost cutting on inference » (le même, 12/10) ; WER mesuré passé de 9,0 % à 11,2 % en un mois sur 525 extraits ([telenardo, 15/06/2026](https://news.ycombinator.com/item?id=48548002)). Plus de 75 incidents selon StatusGator ; panne de latence du 27/05 au 08/06 ([Voibe (concurrent)](https://www.getvoibe.com/resources/is-wispr-flow-reliable/)). Trustpilot : « working 60% of the time ». Récurrent : « marche pendant l'essai, lâche après paiement » (post Reddit relayé). |
| **Sur-correction / reformulation / hallucinations** | Moyenne, environ 15 %, mais très grave quand elle survient | « trying to rewrite what I say » (App Store US 1★, 28/05/2026, via Voibe) ; hallucinations « plusieurs fois par jour » et désinstallation après une semaine ([Jimmy Song, 03/08/2025](https://jimmysong.io/zh/blog/uninstalling-wisprflow/)) ; Wispr reconnaît des « words swapped for ones you didn't say » (changelog, 24/06/2026) ; un utilisateur HN le juge « the least accurate of the 4 » face à Superwhisper, Spokenly et Fieldwork ([nr378, 17/09/2026](https://news.ycombinator.com/item?id=49747122)). Commandes vocales déclenchées à tort : dire « réécris ce passage » le réécrit vraiment (Jimmy Song). |
| **Latence / pas d'aperçu en direct** | Moyenne, environ 15 % | « slow and does the entire transcription in one pass after you finish speaking » ([mkw5053, 30/01/2026](https://news.ycombinator.com/item?id=46824506)) ; « Dommage que l'on ne voit pas la transcription avant la fin » (App Store FR, 08/09) ; « dictation takes ages to show » (App Store US 3★, 02/06/2026) |
| **Poids / Windows** (Electron, environ 800 Mo de RAM, 8 % de CPU au repos, gels) | Moyenne, environ 10 % | « it's electron based and uses 800 megabytes of RAM » (Product Hunt) ; démarrage en 8 à 10 s, se rajoute aux éléments de démarrage (TaskDumpr) |
| **Bruit ambiant / micro** | Moyenne | « AWS lambda logs » devient « Alice's lamb belongs », et l'outil paraît « built for a quiet office » (r/ProductivityApps via TaskDumpr) |
| **Limites pratiques** | Faible à moyenne | Gratuit vite épuisé (« regular users will hit it by Tuesday », Laxis) ; **6 min max par session** (Shiftia, Shubham) ; iPhone : il faut changer de clavier à chaque fois et **pas d'AZERTY** (« il n'est pas possible de choisir le clavier azerty », App Store FR, 07/08) ; pas de Linux ; impossible de dicter quand le micro est pris par un appel ; symboles et code faibles. |
| **Prise en main / permissions** | Faible | « le paramétrage initial prend du temps » (App Store FR) ; « Setup and permission steps that feel complicated » (synthèse Product Hunt) |

## 6. Qualité en français : ce qu'en dit la communauté francophone

- **Consensus des blogs FR** : « reconnaissance du français très précise, accents compris ». Les erreurs portent sur « les noms propres peu courants et certains termes très spécifiques ». La ponctuation est automatique et les hésitations disparaissent. Note globale 8,4/10 ([Shiftia, 19/06/2026](https://shiftia.fr/tests/wispr-flow-dictee-vocale-ia/)).
- **App Store FR** : 4,8/5 sur 743 notes. Les compliments portent sur le chuchotement, la ponctuation réglable et les abréviations apprises. Les reproches : **pas d'AZERTY sur le clavier iOS** (2 avis sur 10), pas de transcription en direct, et un réglage initial long.
- **Pas de test français rigoureux** : les « 97,2 % » et « 98 % » qui circulent ne sont pas sourcés ou reposent sur un seul test. **Aucun article FR ne parle d'anglicismes forcés ni de traduction involontaire.**
- **Signaux faibles** :
  - L'**interface n'est pas traduite en français** : la localisation de juin 2026 ajoute DE/ES/IT/PT, pas le FR.
  - Les prix sont affichés en dollars.
  - Les **Styles** (ton par appli) seraient **réservés à l'anglais** (eesel, à vérifier).
  - Les données passent par des serveurs US, avec une « note RGPD 6/10 » (Shiftia).
  - [Digitiz](https://digitiz.fr/wispr-flow/) recommande **Swifly** pour un « français soigné » (gratuit à 20 000 mots/mois).
- **Usages FR cités** : e-mails, Slack, scripts YouTube, briefs, traduction (dicter dans l'outil de TAO), prompts Claude ([studeria.fr](https://www.studeria.fr/articles-de-blog/wispr-flow-claude-dicter-au-lieu-de-taper)).

## 7. Comparaisons et raisons de changer d'outil

- **Vers le local et gratuit (dominant sur HN)** : Handy, OpenWhispr, VoiceInk, Ghost Pepper, Spokenly, FreeFlow, Mellon, Rekody, BetterWispr, Sayso… En 2026, **plus de 20 « Show HN : alternative gratuite à Wispr Flow »**. C'est devenu un genre à part entière : « Your app subscription is now my weekend project » ([jan. 2026](https://news.ycombinator.com/item?id=46730481)).
  - Raisons : le prix, le cloud, l'impression de régression.
  - « Handy is the one that made me stop looking for local open source alternatives » ([cootsnuck, 06/04/2026](https://news.ycombinator.com/item?id=47668925)).
  - « Just canceled my WisprFlow subscription… free, local » ([sparkling, 17/08/2026](https://news.ycombinator.com/item?id=49334327)).
- **Ce qui retient les gens chez Wispr (les freins au départ)** :
  - « Parakeet isn't anywhere near as accurate as Wispr Flow (or as fast), Whisper is way too slow » ([glenngillen, 22/03/2026](https://news.ycombinator.com/item?id=47475882)).
  - « What's missing for me to switch… is the ability to provide a dictionary » ([frankdilo, 15/01/2026](https://news.ycombinator.com/item?id=46629201)).
  - « It's slower than wispr flow » (à propos d'une alternative locale, [02/09/2026](https://news.ycombinator.com/item?id=49534797)).
  - **Le dictionnaire, la vitesse et la qualité du nettoyage sont le fossé à franchir.**
- **Superwhisper** : le choix « hors ligne / vie privée », plus réglable mais plus complexe. Offre à vie à 249,99 $.
- **Willow** : un léger avantage en précision brute et en contexte selon certains, avec zéro conservation par défaut.
- **Aqua Voice** : utilisé en alternance (« depending on which one seems to be returning the best results that day », [CPLX, 06/06/2026](https://news.ycombinator.com/item?id=48427094)).
- **Dictée Apple/Android native** : suffisante pour un usage ponctuel, mais « sans suppression des hésitations ». Certains anticipent un rattrapage par Apple et Google (r/WisprFlow via TaskDumpr ; « RIP Wispr Flow » [08/10/2026](https://news.ycombinator.com/item?id=50011197)).
- **Raisons de départ, par ordre de fréquence** :
  1. l'abonnement ;
  2. le cloud et la vie privée ;
  3. la baisse de qualité ou les pannes ;
  4. le poids et Windows ;
  5. Linux.

## 8. Synthèse des fréquences (corpus d'environ 190 prises de parole)

| Thème | Poids |
|---|---|
| Prompts IA comme usage principal | ●●●●● |
| Nettoyage, ems/euh et auto-corrections adorés | ●●●●● |
| Prix et abonnement | ●●●●○ |
| Cloud et confidentialité (dont l'affaire des captures) | ●●●●○ |
| Mieux que la dictée native | ●●●○○ |
| Régression et pannes 2026 | ●●●○○ |
| Listes et mise en forme | ●●●○○ |
| Latence, pas de streaming | ●●○○○ |
| Sur-correction et hallucinations | ●●○○○ (rare mais tueur de confiance) |
| Poids, Electron, Windows | ●●○○○ |
| Chuchotement | ●●○○○ (surtout FR) |
| Dictionnaire comme frein au départ | ●●○○○ |
| AZERTY, français, localisation | ●○○○○ (FR uniquement) |

## 9. Les 15 enseignements les plus actionnables pour CBW AI (classés par impact)

1. **Viser d'abord « parler à son IA » en français.** C'est l'usage dominant des gros utilisateurs (62 % des dictées chez un testeur). Il faut un mode « prompt » qui garde **tout le contexte et toutes les contraintes** dictés, structure en listes sans résumer, et ne colle jamais une réponse à la place de la consigne. C'est le cœur de la cible et le meilleur argument.
2. **Fidélité avant élégance : ne jamais reformuler par défaut.** Les deux pires griefs sont « trying to rewrite what I say » et les mots inventés, et Wispr a dû faire marche arrière sur un Auto Cleanup trop agressif (juillet 2026). Il faut garder le standard fidèle de CBW AI (prompt v1.6), un garde-fou anti-hallucination sur l'audio vide ou le silence, et **un raccourci « coller le brut »** toujours disponible.
3. **Gratuit sans plafond hebdomadaire bas, et le dire.** Le prix est le grief n°1 (« not $12/month better than iOS »), et le palier gratuit de 2 000 mots est épuisé « by Tuesday ». Un CBW AI gratuit et illimité (ou très large) est le message d'acquisition le plus fort, à opposer explicitement à 144 $/an.
4. **Afficher la confidentialité comme un produit, pas comme une page légale.** L'affaire des captures et du bannissement, le doute sur l'audit SOC 2 et l'entraînement activé par défaut pèsent lourd. Il faut une page « ce qui sort de votre Mac » en clair, aucun entraînement, aucune conservation, et **aucune capture d'écran** (si le contexte est lu, le montrer et le rendre désactivable par appli). Argument RGPD et européen pour la cible FR.
5. **Égaler le fossé « dictionnaire ».** C'est la raison citée pour ne PAS quitter Wispr. Il faut un dictionnaire simple, des règles de remplacement (« asian » → « agent »), un apprentissage automatique à partir des corrections (déjà en chantier avec learn.ts) et un dictionnaire court conseillé pour éviter les substitutions.
6. **Vitesse perçue : afficher un retour pendant que l'on parle.** « Dommage que l'on ne voit pas la transcription avant la fin » et « does the entire transcription in one pass ». Une pastille qui montre un aperçu partiel en direct (ou au minimum un état « j'écoute / je nettoie » très lisible) plus une latence inférieure à 1 s après relâchement font une vraie différence.
7. **Fiabilité visible : ne jamais perdre une dictée.** Les pannes et le « works 60% of the time » détruisent la confiance. Il faut sauvegarder l'audio localement, relancer en un clic, prévoir un repli automatique entre fournisseurs (router hedgé déjà en place) et, en dernier recours, coller le brut plutôt que rien. Le dire dans l'interface (« dictée récupérée »).
8. **Le chuchotement est un atout fort en FR.** C'est l'avis App Store le plus enthousiaste. Il faut tester et optimiser la dictée à voix basse (gain d'entrée, VAD) et l'annoncer pour l'open space.
9. **Dictées longues sans plafond, découpage automatique.** La limite de 6 min est reprochée, et au-delà de 3 à 4 min la qualité se dégrade. Il faut découper en interne par pauses, nettoyer par blocs, ne pas fixer de plafond visible et garder la cohérence (pas de doublons entre blocs).
10. **Mise en forme automatique des listes et des retours à la ligne.** C'est très apprécié (« perfect list for you »). Les énumérations orales doivent donner des listes, et les « nouveau paragraphe » ou longues pauses des sauts de ligne, sans commandes à apprendre (elles « take practice »).
11. **Garder les termes anglais tels quels dans le français.** Le code-switching est loué par les non-anglophones, et les dévs FR disent « commit », « prompt », « deploy ». Ne pas franciser ni traduire, et respecter la casse des noms de produits.
12. **Léger et natif sur Mac.** Les 800 Mo de RAM et le démarrage lent d'Electron sont reprochés à Wispr. CBW AI est aussi en Electron sur un Mac de 16 Go : il faut surveiller la RAM au repos et le démarrage, et publier un chiffre (« X Mo au repos »).
13. **Notes de réunion : attaquer là où Notetaker est faible.** Il est Mac uniquement, ralentit les appels sur un Mac de 8 Go, ses conditions d'usage des données sont floues, et la question de qui a dit quoi reste à prouver. CBW AI a la diarisation locale : il faut vendre « qui a dit quoi, en français, sans bot, et l'audio reste sur votre Mac » et réutiliser le même dictionnaire que la dictée (Wispr le fait déjà).
14. **Interface 100 % française et clavier AZERTY.** Wispr n'a pas d'interface FR, affiche ses prix en dollars, n'a pas d'AZERTY sur iOS et ses Styles seraient réservés à l'anglais. Ce sont des irritants faciles à transformer en avantage pour une app francophone : textes FR natifs, ponctuation française (espaces insécables avant « ; : ! ? », guillemets « »), et tout réglage de style disponible en français.
15. **Embarquer les bonnes pratiques dans l'accueil.** Les power users mettent environ 2 semaines à trouver leur rythme. Il faut un court guide intégré, par exemple :
    - « parlez comme à un collègue » ;
    - « dites ce que vous avez déjà essayé » ;
    - « tapez les chiffres et le code » ;
    - « casque plutôt qu'AirPods » ;
    - un **test micro** qui détecte le mauvais micro (cause n°1 des hallucinations selon Wispr).

## Sources principales

- Hacker News (API Algolia, commentaires « wispr flow », janv. à oct. 2026) : https://hn.algolia.com/api/v1/search?query=wispr%20flow&tags=comment
- App Store FR : https://apps.apple.com/fr/app/wispr-flow-ai-voice-keyboard/id6497229487?see-all=reviews&platform=iphone (4,8/5, 743 notes)
- App Store US : même ID (4,8/5, 17 k notes)
- Product Hunt : https://www.producthunt.com/products/wisprflow/reviews (4,8/5, 81 avis)
- Changelog Wispr : https://wisprflow.ai/whats-new
- TaskDumpr (relais Reddit), 10/09/2026 : https://taskdumpr.com/blog/wispr-flow-review
- tl;dv, 11/10/2026 : https://tldv.io/blog/wisprflow/
- mrktcorrect (usage sur 90 jours) : https://mrktcorrect.com/blog/wispr-flow-review
- XDA, 20/09/2026 : https://www.xda-developers.com/paired-claude-code-with-wispr-flow/
- Zack Proser, 01/08/2026 : https://zackproser.com/blog/wisprflow-review
- Jimmy Song (désinstallation), 08/2025 : https://jimmysong.io/zh/blog/uninstalling-wisprflow/
- Laxis (concurrent), 07–09/2026 : https://www.laxis.com/fr/blog/wispr-flow/
- Voibe (concurrent), journal de fiabilité : https://www.getvoibe.com/resources/is-wispr-flow-reliable/
- EmberType (concurrent), affaire de confidentialité, 05/05/2026 : https://embertype.com/blog/the-day-wispr-flow-banned-a-user/
- Shiftia (FR), 19/06/2026 : https://shiftia.fr/tests/wispr-flow-dictee-vocale-ia/
- Shubham Sharma (FR), 19/03/2026 : https://shubham-sharma.fr/outils/wispr-flow/
- Digitiz (FR), 14/04/2026 : https://digitiz.fr/wispr-flow/
- outils-traduction.fr (FR) : https://www.outils-traduction.fr/outils-productivite/wispr-flow/
- Repha (FR), 14/04/2026 : https://repha.fr/wispr-flow-dictee-ia/
- Notetaker (lancement le 05/08/2026) : https://wisprflow.ai/post/wispr-flow-notetaker
- Série B et baisse de précision : https://www.shashi.co/2026/08/wispr-flow-triples-to-2-billion-as.html

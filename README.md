# Deux Toits — MVP

Quand le planning change, tout le monde est prévenu, et le bon sac est prêt.

Le parent qui organise utilise l'appli. L'autre parent reçoit une **notification** et répond d'un geste, ou ouvre sa page personnelle. Il n'a jamais besoin de compte.

## Vie privée : ce que l'appli ne sait pas

Deux Toits ne connaît **ni nom, ni prénom, ni e-mail, ni numéro de téléphone d'adulte**. Un adulte est un **rôle** (Papa, Maman, Parent, Beau-père, Belle-mère, Papi, Mamie, Nounou, Autre proche) et un appareil.

| Donnée | Ce qui est gardé |
| --- | --- |
| Organisateur | Un rôle, et l'**empreinte** de son code d'accès (le code n'est montré qu'une fois) |
| Autre parent / proche | Un rôle, et l'**empreinte** du lien secret de sa page (jamais le lien lui-même) |
| Appareil notifié | L'adresse anonyme fournie par le navigateur (Web Push) et ses clés de chiffrement. Aucun lien avec une personne |
| Enfants | Un prénom (champ libre, choisi par l'organisateur) et, s'il a rejoint, l'**empreinte** du lien secret de sa page |
| Hors base | Aucune police de caractères ni script externe : l'appli ne contacte aucun tiers, sauf le service de push du navigateur de chaque appareil (Google, Apple ou Mozilla), qui ne voit que des messages chiffrés |

Les rôles forment une liste fermée : impossible d'y mettre un prénom. Les champs libres (prénoms d'enfants, lieu, affaires à prévoir) restent de la responsabilité de l'utilisateur.

## Ce que fait le MVP

| Fonction | Détail |
| --- | --- |
| Espace organisateur | Un rôle, rien d'autre. Un **code d'accès** (`XXXX-XXXX-XXXX`) est remis une seule fois ; session de 60 jours |
| Inviter un proche | Sur la page Famille, chaque proche reçoit un **QR code** et un code d'invitation (`ABCD-EFGH`). En présentiel il scanne ; à distance il tape le code sur `/j`. Le code est à usage unique, valable 14 jours |
| Page de l'enfant | Chaque enfant a aussi son **QR code et son code**. Sur son appareil, il voit son **calendrier sur 14 jours** en lecture seule : chez qui il dort, les jours de changement de maison, ce qu'il doit prendre. Seulement ce qui est confirmé et le concerne ; jamais une demande en attente, une réponse refusée, ni une information de santé |
| Page personnelle | Après avoir rejoint, le proche arrive sur un **lien secret** (à mettre en favori ou sur l'écran d'accueil) : ses demandes, ses réponses, ses notifications. Aucun compte |
| Notifications (Web Push) | Demande de changement avec boutons **Oui / Non** directement dans la notification, réponse de l'autre parent, rappel de la veille, annulation. Activables sur chaque appareil |
| Sans notification | Tout fonctionne aussi sans les activer : le proche voit ses demandes en ouvrant sa page |
| Signaler un changement | Récupération ou jour de garde, enfants, date, heure, lieu, affaires à prévoir, aperçu de la notification avant envoi |
| Réponses | Oui ; « oui, mais à +30 min / +1 h » ; « plutôt le lendemain » ; non |
| Contre-proposition | L'organisateur l'accepte en un clic : l'heure ou la date est mise à jour et l'autre parent reçoit « c'est d'accord » |
| Rappel de la veille | À partir de 19 h (réglable), si le changement est accepté et que des affaires sont à prévoir. Un seul rappel par changement |
| Semaine | Accueil sur 7 jours et feuille à imprimer (couleur ou noir et blanc, une forme par maison) |
| Quitter / changer d'appareil | Le proche peut tout oublier d'un bouton ; l'organisateur peut créer un nouveau code (l'ancienne page et les anciens appareils sont oubliés) |

**Choix volontaires** : pas de messagerie libre, pas d'accusé de lecture, pas de compte enfant, pas de géolocalisation. Les informations de santé (médicament, traitement, Ventoline…) sont détectées et ne partent **jamais** en notification : elles restent une note privée.

**Hors périmètre** : montre de l'enfant, familles recomposées multi-foyers, dépenses, assistant démarches, application mobile native.

## Démarrer en local

Il faut Node.js 22.13 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000, créez votre espace (un rôle) et **notez le code d'accès**. Sur la page Famille : ajoutez un enfant, puis un proche, et activez les notifications sur cet appareil. Ouvrez le lien du QR (ou `/j` avec le code) dans une autre fenêtre pour jouer l'autre parent : vous arrivez sur sa page personnelle, où vous pouvez activer ses notifications. Puis signalez un changement.

> Les notifications fonctionnent sur `http://localhost` (Chrome, Firefox, Edge). Sur iPhone, la page doit d'abord être ajoutée à l'écran d'accueil, et le site servi en https.

> Une base créée avec un ancien format (prénoms, e-mails ou numéros) est refusée au démarrage : supprimez le fichier ou changez `DATABASE_FILE`.

```bash
npm test             # 12 tests : parcours complet, codes et QR, absence de données personnelles, isolation, sécurité
```

Les clés VAPID sont générées au premier démarrage et gardées dans la base. Pour les fixer (recommandé en production), renseignez `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`). Voir `.env.example`.

## Mettre en ligne

L'appli est un seul processus Node avec une base SQLite (un fichier). Il faut un hébergeur avec un **disque persistant** et du **https** (obligatoire pour les notifications) :

- **Render** : Web Service, commande `npm start`, disque persistant monté par exemple sur `/data` et `DATABASE_FILE=/data/deux-toits.sqlite`.
- **Fly.io** ou **Railway** : même principe avec un volume.

Variables : `BASE_URL` (en https), `DATABASE_FILE`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, éventuellement `REMINDER_HOUR` (19:00) et `TZ_FAMILLE` (Europe/Paris).

Les rappels sont vérifiés chaque minute par le processus lui-même : l'hébergement ne doit pas se mettre en veille. Une offre gratuite qui s'endort sans trafic bloquera les rappels.

## Organisation du code

```
src/
  server.js    routes Express, sessions, codes d'accès, invitations (/j) et QR, pages des proches (/m) et des enfants (/e), push
  service.js   logique métier : changements, réponses, notifications, rappels, semaine
  push.js      notifications Web Push (VAPID)
  views.js     pages HTML (sans moteur de template, tout est échappé)
  db.js        schéma SQLite (node:sqlite, sans dépendance native)
  util.js      rôles, codes, dates en français, filtre santé
public/
  style.css, push.js (activation côté navigateur), sw.js (service worker), manifest, icône
test/flow.test.js
```

Trois dépendances : Express, `qrcode` (QR générés sur le serveur, en SVG) et `web-push`.

## Avant un test avec de vraies familles

- **Accord de l'autre parent.** Il rejoint lui-même (QR ou code) et choisit d'activer ou non les notifications. Rien n'est envoyé à quelqu'un qui n'a pas rejoint.
- **Données personnelles.** Aucune donnée d'adulte n'est conservée, mais les prénoms d'enfants, les rendez-vous et les champs libres le sont : hébergez en Europe et faites relire la pré-analyse juridique (questions 1 à 9) par un juriste avant d'ouvrir au-delà d'un cercle de testeurs.
- **Mesure clé du test.** Le parent organisateur envoie-t-il un vrai changement dans la semaine, et l'autre parent répond-il ? La table `notif_log` contient tout ce qu'il faut pour le compter.

## Sécurité

- Pages échappées, requêtes SQL paramétrées, accès vérifié entre organisateurs ; un proche ne peut répondre qu'à ses propres demandes.
- Code d'accès de l'organisateur : 12 caractères tirés au hasard (~59 bits), seule l'empreinte SHA-256 est en base, affiché une fois. Un nouveau code ferme les autres sessions.
- Codes d'invitation : 8 caractères, usage unique, 14 jours, effacés de la base à l'utilisation ; un simple affichage de la page ne le consomme pas. Essais limités à 10 par 15 minutes et par IP (connexion et `/j`).
- Lien secret d'un proche ou d'un enfant : 144 bits aléatoires, seule l'empreinte est en base, page jamais mise en cache ni indexée.
- Cookie de session httpOnly, SameSite=Lax. Notifications chiffrées de bout en bout (Web Push), sans les informations de santé.
- Le service worker d'un proche a pour portée sa seule page : le lien secret ne voyage pas dans les notifications.
- Une seule réponse compte par demande, même si deux appareils répondent en même temps.

## Limites connues

- Un seul rythme d'alternance (semaine sur deux).
- Les contre-propositions sont prédéfinies (+30 min, +1 h, lendemain).
- Code d'accès perdu et plus aucune session ouverte : pas de récupération possible (par choix, ni e-mail ni nom pour prouver qui l'on est). Il faut recréer un espace.
- Pas de notification pour les enfants : leur page se consulte (elle se met à jour toute seule).
- Le lien secret d'un proche ou d'un enfant est son identité : s'il le perd, l'organisateur crée un nouveau code. Qui obtient le lien voit ses demandes.
- Le push n'est pas garanti : un téléphone éteint, un navigateur fermé ou des économies d'énergie peuvent retarder une notification. La page personnelle reste la référence.
- L'icône est un SVG : certains navigateurs préfèrent des PNG pour proposer l'installation.

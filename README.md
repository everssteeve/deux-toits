# Deux Toits — MVP

Quand le planning change, tout le monde est prévenu, et le bon sac est prêt.

Le parent qui organise utilise l'appli. L'autre parent reçoit un SMS et répond **OUI** ou **NON**, ou ouvre un lien pour proposer autre chose. Il n'a jamais besoin de compte.

## Ce que fait le MVP

| Fonction | Détail |
| --- | --- |
| Compte organisateur | Un rôle (Papa, Maman…) et un numéro, **sans nom ni e-mail ni mot de passe**. Un code d'accès est remis une seule fois ; session de 60 jours |
| Famille | Enfants (prénoms), parent(s) et proches à prévenir **par rôle**, rythme semaine sur deux |
| Enregistrer un numéro | Chaque proche reçoit un code d'invitation (`ABCD-EFGH`) et un **QR code**. Il scanne le QR (en présentiel) ou tape le code sur `/j`, ou l'envoie par SMS (Twilio) : son numéro est alors lié à son rôle. Code à usage unique, valable 14 jours |
| Signaler un changement | Récupération ou jour de garde, enfants, date, heure, lieu, affaires à prévoir, aperçu du SMS avant envoi |
| SMS à l'autre parent | Signé du rôle de l'organisateur (« Maman : peux-tu… »), réponse OUI ou NON, lien pour proposer autre chose, mention STOP |
| Page de réponse sans compte | Oui ; « oui, mais à +30 min / +1 h » ; « plutôt le lendemain » ; non |
| SMS entrants | OUI, OK, D'ACCORD… → accepté ; NON → refusé ; STOP → plus aucun SMS, pour aucun organisateur ; START → réactivation. Un OUI ne s'applique que si le dernier SMS reçu était la question elle-même |
| Contre-proposition | L'organisateur l'accepte en un clic : l'heure ou la date est mise à jour et l'autre parent reçoit « c'est d'accord » |
| Retour à l'organisateur | SMS « Papa a répondu OUI », « Papa répond : oui, mais à 17 h », « Papa ne peut pas » |
| Rappel de la veille | À partir de 19 h (réglable), si le changement est accepté et que des affaires sont à prévoir. Un seul rappel par changement |
| Semaine | Accueil sur 7 jours et feuille à imprimer (couleur ou noir et blanc, une forme par maison) |
| Annulation | L'autre parent reçoit « finalement, c'est annulé » |

**Choix volontaires**, issus des entretiens : pas de messagerie libre, pas d'accusé de lecture, pas de compte enfant, pas de géolocalisation. Les informations de santé (médicament, traitement, Ventoline…) sont détectées et ne partent **jamais** par SMS : elles restent une note privée.

**Hors périmètre** : montre de l'enfant, familles recomposées multi-foyers, dépenses, assistant démarches, application mobile native.

## Démarrer en local (sans compte SMS)

Il faut Node.js 22.13 ou plus récent.

```bash
npm install
npm run dev          # mode « console » : les SMS s'affichent dans le terminal
```

Ouvrez http://localhost:3000, créez votre espace (rôle + numéro) et **notez le code d'accès affiché**. Ajoutez un enfant, puis un proche : la page Famille affiche son QR code et son code d'invitation. Ouvrez le lien du QR (ou `/j`) pour enregistrer son numéro, puis signalez un changement.

> Une base créée avant ce changement (prénoms et e-mails) est refusée au démarrage : supprimez `deux-toits.sqlite` ou changez `DATABASE_FILE`.

En mode console, la page **/dev/sms** liste tous les SMS et permet de **simuler la réponse de l'autre parent** (OUI, NON, STOP). C'est le moyen le plus simple de faire tester le parcours à un ami qui joue l'autre parent : il ouvre le lien de la page de réponse, ou vous tapez sa réponse SMS.

```bash
npm test             # 11 tests : parcours complet, codes et QR, absence de données nominatives, isolation, sécurité
```

## Brancher de vrais SMS

Copiez `.env.example` en `.env`, remplissez-le, puis lancez `node --env-file=.env src/server.js`.

### Option A — Twilio (recommandé : l'autre parent peut répondre par SMS)

1. Créez un compte Twilio et achetez un numéro **capable de recevoir des SMS**. Pour un numéro français, Twilio demande un dossier réglementaire (justificatif d'identité et d'adresse) : comptez quelques jours.
2. Renseignez `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (le numéro au format +33…, ou un identifiant de Messaging Service commençant par MG).
3. Dans la console Twilio, sur le numéro, réglez « A message comes in » sur `POST https://VOTRE-DOMAINE/webhooks/sms/twilio`.
4. `BASE_URL` doit être l'adresse publique exacte : la signature Twilio est vérifiée dessus.

### Option B — Brevo (plus simple, mais sans réponse par SMS)

Brevo envoie avec un nom d'expéditeur (« DeuxToits »), qui ne peut pas recevoir de réponse. L'appli s'adapte : le SMS dit « Pour répondre : [lien] » au lieu de « Réponds OUI ou NON », et la désinscription se fait par un bouton sur la page du lien plutôt que par STOP.

Renseignez `SMS_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_SENDER`.

Consultez les tarifs à jour de chaque fournisseur avant de lancer un test avec plusieurs familles.

## Mettre en ligne

L'appli est un seul processus Node avec une base SQLite (un fichier). Il faut donc un hébergeur avec un **disque persistant** :

- **Render** : Web Service, commande `npm start`, avec un disque persistant monté par exemple sur `/data` et `DATABASE_FILE=/data/deux-toits.sqlite`.
- **Fly.io** ou **Railway** : même principe avec un volume.

Variables à définir : `BASE_URL` (en https), `SMS_PROVIDER` et ses clés, `DATABASE_FILE`, éventuellement `REMINDER_HOUR` (par défaut 19:00) et `TZ_FAMILLE` (par défaut Europe/Paris).

Les rappels sont vérifiés chaque minute par le processus lui-même : l'hébergement ne doit pas se mettre en veille. Une offre gratuite qui s'endort sans trafic bloquera les rappels.

## Organisation du code

```
src/
  server.js    routes Express, sessions, codes d'accès, invitations (/j) et QR, webhook Twilio, démarrage
  service.js   logique métier : changements, réponses, SMS entrants, rappels, semaine
  sms.js       fournisseurs SMS : console, Twilio, Brevo
  views.js     pages HTML (sans moteur de template, tout est échappé)
  db.js        schéma SQLite (node:sqlite, sans dépendance native)
  util.js      téléphones, dates en français, filtre santé, rôles et codes
public/style.css
test/flow.test.js
```

Deux dépendances : Express et `qrcode` (QR générés sur le serveur, en SVG).

## Avant un test avec de vraies familles

- **Accord de l'autre parent.** Il choisit lui-même d'enregistrer son numéro (QR ou code), donc plus d'envoi à un numéro saisi par un tiers. La mention STOP reste présente dans chaque message.
- **Données personnelles.** Aucun nom, prénom ni e-mail d'adulte n'est conservé : seulement un rôle et un numéro de téléphone. Restent les prénoms d'enfants, les numéros, les rendez-vous, et les champs libres (lieu, affaires à prévoir) : ne pas y écrire de noms. Le numéro de téléphone reste une donnée personnelle. Hébergez en Europe, ne gardez que le nécessaire, et faites relire la pré-analyse juridique (questions 1 à 9) par un juriste avant d'ouvrir au-delà d'un cercle de testeurs.
- **Mesure clé du test.** Le parent organisateur envoie-t-il un vrai changement dans la semaine, et l'autre parent répond-il ? La table `sms_log` contient tout ce qu'il faut pour le compter.

## Sécurité

- Pages échappées, requêtes SQL paramétrées, accès vérifié entre organisateurs.
- Cookie de session httpOnly, SameSite=Lax ; liens de réponse aléatoires (72 bits), refusés une fois la date passée.
- Webhook SMS déclaré uniquement avec Twilio, signature vérifiée à chaque requête.
- Code d'accès de l'organisateur : 12 caractères tirés au hasard (~59 bits), seule l'empreinte SHA-256 est en base, affiché une fois. Un nouveau code ferme les autres sessions.
- Codes d'invitation : 8 caractères, usage unique, 14 jours, effacés de la base à l'enregistrement. Essais limités à 10 par 15 minutes et par IP (connexion et `/j`).
- Rôles : liste fermée, impossible d'y mettre un prénom.
- Un numéro n'est enregistré que par son propriétaire, avec SMS de confirmation ; par SMS entrant, c'est l'opérateur qui garantit le numéro.
- Une seule réponse compte par demande, même si le lien et le SMS arrivent en même temps.

## Limites connues

- Un seul rythme d'alternance (semaine sur deux).
- Les contre-propositions sont prédéfinies (+30 min, +1 h, lendemain).
- Si l'autre parent a plusieurs demandes en attente, une réponse SMS s'applique à la plus récente ; le lien permet de répondre à chacune.
- Code d'accès perdu et plus aucune session ouverte : pas de récupération possible (par choix, ni e-mail ni nom pour prouver qui l'on est). Il faut recréer un espace.
- Un numéro saisi sur `/j` n'est pas vérifié par un code SMS (seulement par le SMS de confirmation) ; avec Twilio, l'envoi du code par SMS est la voie vérifiée.

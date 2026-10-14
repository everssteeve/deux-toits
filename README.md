# Deux Toits — MVP

Quand le planning change, tout le monde est prévenu, et le bon sac est prêt.

Le parent qui organise utilise l'appli. L'autre parent reçoit un SMS et répond **OUI** ou **NON**, ou ouvre un lien pour proposer autre chose. Il n'a jamais besoin de compte.

## Ce que fait le MVP

| Fonction | Détail |
| --- | --- |
| Compte organisateur | Inscription par e-mail et mot de passe, session de 60 jours |
| Famille | Enfants, parent(s) à prévenir (prénom et téléphone), rythme semaine sur deux |
| Signaler un changement | Récupération ou jour de garde, enfants, date, heure, lieu, affaires à prévoir, aperçu du SMS avant envoi |
| SMS à l'autre parent | Signé du prénom de l'organisateur, réponse OUI ou NON, lien pour proposer autre chose, mention STOP |
| Page de réponse sans compte | Oui ; « oui, mais à +30 min / +1 h » ; « plutôt le lendemain » ; non |
| SMS entrants | OUI, OK, D'ACCORD… → accepté ; NON → refusé ; STOP → plus aucun SMS, pour aucun organisateur ; START → réactivation. Un OUI ne s'applique que si le dernier SMS reçu était la question elle-même |
| Contre-proposition | L'organisateur l'accepte en un clic : l'heure ou la date est mise à jour et l'autre parent reçoit « c'est d'accord » |
| Retour à l'organisateur | SMS « Marc a répondu OUI », « Marc répond : oui, mais à 17 h », « Marc ne peut pas » |
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

Ouvrez http://localhost:3000, créez un compte, ajoutez un enfant et l'autre parent. Puis signalez un changement.

En mode console, la page **/dev/sms** liste tous les SMS et permet de **simuler la réponse de l'autre parent** (OUI, NON, STOP). C'est le moyen le plus simple de faire tester le parcours à un ami qui joue l'autre parent : il ouvre le lien de la page de réponse, ou vous tapez sa réponse SMS.

```bash
npm test             # 6 tests : utilitaires, réponses SMS, parcours complet, isolation des comptes, sécurité
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
  server.js    routes Express, sessions, webhook Twilio, démarrage
  service.js   logique métier : changements, réponses, SMS entrants, rappels, semaine
  sms.js       fournisseurs SMS : console, Twilio, Brevo
  views.js     pages HTML (sans moteur de template, tout est échappé)
  db.js        schéma SQLite (node:sqlite, sans dépendance native)
  util.js      téléphones, dates en français, filtre santé, mots de passe
public/style.css
test/flow.test.js
```

Une seule dépendance : Express.

## Avant un test avec de vraies familles

- **Accord de l'autre parent.** Il reçoit des SMS sans s'être inscrit. Prévenez-le avant le premier envoi ; la mention STOP est présente dans chaque message.
- **Données personnelles.** Prénoms d'enfants, numéros de téléphone, rendez-vous : ce sont des données sensibles. Hébergez en Europe, ne gardez que le nécessaire, et faites relire la pré-analyse juridique (questions 1 à 9) par un juriste avant d'ouvrir au-delà d'un cercle de testeurs.
- **Mesure clé du test.** Le parent organisateur envoie-t-il un vrai changement dans la semaine, et l'autre parent répond-il ? La table `sms_log` contient tout ce qu'il faut pour le compter.

## Sécurité

- Pages échappées, requêtes SQL paramétrées, accès vérifié entre organisateurs.
- Cookie de session httpOnly, SameSite=Lax ; liens de réponse aléatoires (72 bits), refusés une fois la date passée.
- Webhook SMS déclaré uniquement avec Twilio, signature vérifiée à chaque requête.
- Connexion limitée à 10 essais par 15 minutes (par IP et par e-mail), mots de passe hachés avec scrypt.
- Une seule réponse compte par demande, même si le lien et le SMS arrivent en même temps.

## Limites connues

- Un seul rythme d'alternance (semaine sur deux).
- Les contre-propositions sont prédéfinies (+30 min, +1 h, lendemain).
- Si l'autre parent a plusieurs demandes en attente, une réponse SMS s'applique à la plus récente ; le lien permet de répondre à chacune.
- Pas de réinitialisation de mot de passe par e-mail.

# Deux Toits — Cahier des charges

**Version** : 1.0, 14 octobre 2026
**Porteur** : Steeve Evers
**Statut** : MVP développé (dépôt `everssteeve/deux-toits`), en attente de test avec de vraies familles

> Quand le planning change, tout le monde est prévenu, et le bon sac est prêt.

---

## Sommaire

1. Contexte et origine du projet
2. Marché et concurrence
3. Ce que la découverte a appris
4. Positionnement et proposition de valeur
5. Utilisateurs et personas
6. Périmètre
7. Exigences fonctionnelles
8. Parcours utilisateurs
9. Écrans
10. Contenu des SMS
11. Règles de gestion
12. Modèle de données
13. Architecture technique
14. Exigences non fonctionnelles
15. Conformité et données personnelles
16. Modèle économique
17. Indicateurs et critères de réussite
18. Plan de test
19. Feuille de route
20. Risques
21. Questions ouvertes
22. Annexes et sources

---

## 1. Contexte et origine du projet

Deux Toits est une application pour les familles où les enfants vivent entre deux maisons après une séparation.

Le projet est parti d'une idée plus large : une appli de coparentalité centrée sur l'enfant, avec une « vue enfant ». L'analyse de marché, puis 30 entretiens simulés par IA et un test de maquette ont fait évoluer le concept vers un besoin plus étroit et mieux étayé :

- la routine (« qui a les enfants quand ») est déjà résolue par un agenda partagé, la règle du jugement ou du papier ;
- les incidents naissent des **changements de planning** et des **activités** (le kimono, la flûte, l'inhalateur au mauvais endroit) ;
- toutes les applis existantes échouent sur le même point : **l'autre parent ne s'inscrit pas**.

D'où le concept retenu : un outil utile à **un seul parent**, l'organisateur, que l'autre parent reçoit **par SMS, sans compte ni appli**.

> **Avertissement** : les entretiens et le test de maquette qui fondent ces choix ont été **simulés par IA**. Ils ont servi à affûter les hypothèses, pas à les valider. Le test avec de vraies familles (section 18) reste le préalable à tout investissement.

## 2. Marché et concurrence

### 2.1 Taille du marché (France)

| Indicateur | Valeur | Source |
| --- | --- | --- |
| Enfants mineurs de parents séparés | 4 millions (2020) | INSEE Première n° 1841 |
| Enfants en résidence alternée | 480 000 (2020), soit 11,5 % des enfants de parents séparés | INSEE Première n° 1841 |
| Âge moyen d'un enfant en alternance | 11 ans ; pic à 10 ans (15,2 %) ; rare avant 4 ans (4,2 %) | INSEE Première n° 1841 |
| Parents d'enfants alternants cadres ou professions intermédiaires | 58 % des pères, 57 % des mères en emploi | INSEE Première n° 1841 |
| Divorces par an (judiciaires et par notaire) | 100 000 à 120 000 (estimation 2024) | Congrès des notaires 2025 |
| Services de médiation familiale conventionnés CAF | 272 services, près de 500 médiateurs, plus de 107 000 entretiens d'information en 2024 | CNAF, L'essentiel n° 234 |

**Cœur de cible** : environ 300 000 familles en résidence alternée (480 000 enfants, à 1,5 enfant alternant par famille ; estimation).

### 2.2 Concurrence

| Acteur | Origine | Positionnement | Limite exploitable |
| --- | --- | --- | --- |
| 2houses | Belgique, depuis 2011 | Leader francophone : calendrier, dépenses, messagerie, journal | Exige l'inscription des deux parents pour les fonctions clés |
| Duvia | France, bêta 2026 | Suite complète apaisée, IA, accès tiers | Exige un compte pour chaque parent |
| MyGardeo | France, lancement prévu novembre 2026 | Espace neutre et chiffré | Pas encore lancé |
| Copareo Secure Line | France, depuis 2025 | Haut conflit : numéro dédié, preuves pour le juge | Espace personnel, l'autre parent n'y accède pas |
| Shared, FamCal | France / international | Planning ou agenda familial | Périmètre limité |
| OurFamilyWizard, TalkingParents, BestInterest | États-Unis | Référence judiciaire, IA anti-conflit | Anglophones, chers, culture du contentieux |
| Kopare | États-Unis | Gratuit ; vue enfant sur Apple Watch ; suivi des affaires qui voyagent | Anglais seulement, très récent |

**Constat** : aucun acteur présent en France ne propose un parcours où l'autre parent reste sans compte. C'est l'angle de Deux Toits.

## 3. Ce que la découverte a appris

Synthèse des 30 entretiens simulés (15 parents, 10 enfants, 5 professionnels) et du test de maquette (8 personas).

| Hypothèse de départ | Résultat | Décision |
| --- | --- | --- |
| Une vue enfant pour les 8-14 ans | 1 parent sur 13 favorable ; enfants partagés ; 4 professionnels sur 5 réservés ou opposés | Abandonnée comme cœur de produit |
| Les deux parents s'inscrivent | 1 parent sur 15 pense que l'autre utiliserait l'outil ; 4 applis abandonnées pour cette raison | Abandonnée : l'autre parent reste sans compte |
| Un calendrier d'alternance | Déjà résolu partout | Réduit au minimum (rythme semaine sur deux) |
| Un « sac de transition » | Les oublis coûteux touchent les activités et la santé | Transformé en rappel la veille d'une activité |
| Une messagerie entre parents | Les professionnels craignent qu'elle serve de preuve | Remplacée par des réponses structurées |
| Un accusé de lecture | Vécu comme de la surveillance (« c'est ça que j'appelle se fliquer ») | Supprimé |

## 4. Positionnement et proposition de valeur

**Énoncé** : pour les parents séparés en résidence alternée qui portent l'organisation, Deux Toits est l'outil qui prévient l'autre parent d'un changement en un SMS, sans lui demander de s'inscrire. Contrairement à 2houses ou Duvia, il fonctionne même quand l'autre parent ne veut pas d'application.

**Promesse** : « Quand le planning change, tout le monde est prévenu, et le bon sac est prêt. »

| Pour qui | Ce qu'il gagne |
| --- | --- |
| Le parent organisateur | Un changement signalé en une minute, une réponse claire, moins de messages, moins d'oublis |
| L'autre parent | Rien à installer, aucun compte, une réponse OUI ou NON, aucune surveillance, STOP à tout moment |
| L'enfant | Le bon sac au bon endroit, une feuille lisible sur le frigo |
| Le médiateur | Un outil neutre, sans messagerie ni preuve, qu'il peut citer sans perdre sa neutralité |

**Ton de marque** : chaleureux, concret, jamais juridique. On parle de « maisons » et de « changements », pas de « garde » ni de « droit de visite ».

## 5. Utilisateurs et personas

| Rôle | Description | Compte |
| --- | --- | --- |
| Parent organisateur | Celui qui porte la logistique et paie éventuellement | Oui (e-mail et mot de passe) |
| Autre parent (destinataire) | Reçoit les demandes et rappels, répond | **Jamais** |
| Enfant | Bénéficiaire indirect (feuille imprimée) | Non |
| Prescripteur | Médiateur familial, avocat, notaire | Non (hors MVP) |

**Personas principaux** (issus des entretiens simulés) :

- **Claire, 41 ans**, cadre, alternance semaine sur deux, 2 enfants de 9 et 12 ans. Paie 2houses mais le remplit seule. Enverrait un vrai changement avec Deux Toits parce que l'autre parent n'a rien à installer.
- **Julien, 38 ans**, séparé depuis 8 mois, a abandonné 2houses puis Duvia parce que son ex refusait de s'inscrire.
- **Didier, 44 ans**, destinataire type : refuse les applis « de flicage », répond par SMS, se méfie des liens (peur d'arnaque).
- **Laetitia, 34 ans**, budget serré, sans imprimante : refuse de payer.
- **Nadia, 39 ans**, famille recomposée : plusieurs plannings sous un même toit (hors MVP).

**Profils écartés** : familles en haut conflit ou en procédure, familles où tout fonctionne déjà, enfants de moins de 4 ans.

## 6. Périmètre

### 6.1 Dans le MVP

- Compte organisateur, famille (enfants, parents à prévenir, rythme d'alternance)
- Signalement d'un changement avec aperçu du SMS
- SMS à l'autre parent avec réponse OUI ou NON
- Page de réponse sans compte, avec contre-propositions
- Acceptation d'une contre-proposition par l'organisateur
- Annulation d'un changement
- Rappel automatique la veille
- Accueil sur 7 jours et feuille à imprimer
- Désinscription (STOP par SMS ou bouton)
- Mode SMS simulé pour les tests

### 6.2 Hors MVP (volontairement)

| Fonction | Raison |
| --- | --- |
| Compte ou vue enfant, montre connectée | Rejet majoritaire, contraintes juridiques fortes |
| Messagerie libre entre parents | Risque d'escalade et d'usage comme preuve |
| Accusé de lecture | Vécu comme de la surveillance |
| Géolocalisation | Inutile et sensible |
| Familles recomposées multi-foyers | Signal réel mais à traiter en V2 |
| Dépenses partagées | Couvert par les concurrents ; pas le cœur |
| Assistant démarches (CAF, impôts, convention) | V2, cantonné à de l'information générale |
| Application mobile native | Une appli web mobile suffit pour tester |

## 7. Exigences fonctionnelles

Priorité : **M** = indispensable (MVP), **S** = souhaitable, **C** = plus tard. État : ✅ réalisé dans le MVP.

### 7.1 Compte organisateur

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-01 | Créer un compte avec prénom, téléphone, e-mail et mot de passe (8 caractères minimum) | M | ✅ |
| F-02 | Se connecter et se déconnecter ; session de 60 jours | M | ✅ |
| F-03 | Limiter les tentatives de connexion (10 par 15 min, par IP et par e-mail) | M | ✅ |
| F-04 | Réinitialiser son mot de passe par e-mail | S | — |
| F-05 | Supprimer son compte et toutes ses données | S | — |

### 7.2 Famille

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-10 | Ajouter et retirer des enfants (prénom seulement) | M | ✅ |
| F-11 | Ajouter et retirer un ou plusieurs parents à prévenir (prénom, téléphone) ; l'ajout n'envoie aucun SMS | M | ✅ |
| F-12 | Normaliser les numéros français (06…, +33…, 0033…) | M | ✅ |
| F-13 | Définir un rythme semaine sur deux à partir d'une date d'arrivée chez l'organisateur | M | ✅ |
| F-14 | Afficher qu'un parent a demandé STOP | M | ✅ |
| F-15 | Autres rythmes (2-2-3, week-ends, vacances scolaires) | S | — |
| F-16 | Ajouter un tiers qui récupère (grand-parent, car scolaire) | S | — |
| F-17 | Plusieurs foyers (familles recomposées) | C | — |

### 7.3 Signaler un changement

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-20 | Choisir le type : « qui récupère » ou « jour de garde » | M | ✅ |
| F-21 | Choisir un ou plusieurs enfants, la date, l'heure (obligatoire pour une récupération), le lieu, le parent à prévenir | M | ✅ |
| F-22 | Choisir des affaires à prévoir parmi des suggestions ou en saisie libre | M | ✅ |
| F-23 | Refuser une date invalide ou passée | M | ✅ |
| F-24 | Afficher l'aperçu exact du SMS avant envoi, avec possibilité de modifier | M | ✅ |
| F-25 | Détecter les informations de santé (objets et lieux) et ne jamais les envoyer par SMS ; les garder en note privée | M | ✅ |
| F-26 | Si le destinataire a demandé STOP, enregistrer le changement sans envoyer et le signaler | M | ✅ |
| F-27 | Option « copier le texte pour l'envoyer moi-même » | S | — |

### 7.4 Réponse de l'autre parent

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-30 | Répondre par SMS : OUI, OK, D'ACCORD, OUAIS… → accepté ; NON → refusé | M | ✅ |
| F-31 | Un OUI ou NON ne s'applique que si le dernier SMS reçu par ce numéro était la question elle-même ; sinon, renvoyer le lien | M | ✅ |
| F-32 | Page de réponse accessible par lien, sans compte | M | ✅ |
| F-33 | Contre-propositions prédéfinies : +30 min, +1 h, lendemain même heure ; ou non | M | ✅ |
| F-34 | Une seule réponse compte par demande, même si le lien et le SMS arrivent ensemble | M | ✅ |
| F-35 | Le lien est refusé si la demande est annulée ou passée | M | ✅ |
| F-36 | Bouton « Ne plus recevoir de SMS » sur la page de réponse | M | ✅ |
| F-37 | Contre-proposition en saisie libre d'heure ou de date | S | — |
| F-38 | L'autre parent peut lancer lui-même un changement, sans compte | C | — |

### 7.5 Suivi côté organisateur

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-40 | Recevoir un SMS à chaque réponse (OUI, contre-proposition, refus) | M | ✅ |
| F-41 | Voir le statut et l'historique des SMS d'un changement ; aucun accusé de lecture | M | ✅ |
| F-42 | Accepter une contre-proposition en un clic : l'heure ou la date est mise à jour et l'autre parent reçoit « c'est d'accord » | M | ✅ |
| F-43 | Annuler un changement ; l'autre parent est prévenu seulement si la demande le concernait encore et n'est pas passée | M | ✅ |
| F-44 | Relancer une demande restée sans réponse | S | — |

### 7.6 Rappels

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-50 | La veille d'un changement accepté qui comporte des affaires, envoyer un rappel à l'autre parent à partir de 19 h (heure réglable) | M | ✅ |
| F-51 | Un seul rappel par changement ; jusqu'à 3 essais en cas d'échec d'envoi | M | ✅ |
| F-52 | Ne jamais envoyer de rappel à un numéro désinscrit | M | ✅ |
| F-53 | Rappel à l'organisateur lui-même quand c'est lui qui fait le sac | S | — |

### 7.7 Semaine et impression

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-60 | Accueil : prochain passage, 7 prochains jours (maison, changements, affaires), liste des changements | M | ✅ |
| F-61 | Feuille à imprimer de la semaine : une forme par maison (rond, carré), version noir et blanc, journées coupées en deux, affaires à prévoir, date de validité | M | ✅ |
| F-62 | Pictogrammes d'activités et d'objets pour les enfants qui lisent mal | S | — |
| F-63 | Envoyer la feuille en PDF à l'autre parent | C | — |

### 7.8 Désinscription

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-70 | STOP (ou ARRÊT) par SMS : plus aucun message, pour aucun organisateur, même si le parent est supprimé puis ajouté de nouveau | M | ✅ |
| F-71 | START par SMS : réactivation | M | ✅ |
| F-72 | Avec un fournisseur qui ne reçoit pas de SMS, désinscription par bouton sur la page du lien | M | ✅ |

### 7.9 Outils de test

| ID | Exigence | Priorité | État |
| --- | --- | --- | --- |
| F-80 | Mode SMS simulé : aucun envoi réel, SMS affichés dans le terminal | M | ✅ |
| F-81 | Page /dev/sms (mode simulé uniquement) : voir les SMS et simuler la réponse de l'autre parent | M | ✅ |

## 8. Parcours utilisateurs

### 8.1 Premier usage

1. L'organisateur crée son compte.
2. Il ajoute ses enfants, l'autre parent (prénom, téléphone) et la date de début du rythme.
3. L'accueil affiche la semaine.

### 8.2 Signaler un changement (parcours principal)

1. Accueil → « Signaler un changement ».
2. Type, enfants, date, heure, lieu, parent à prévenir, affaires.
3. « Voir le message » : aperçu exact du SMS ; les infos de santé sont signalées comme note privée.
4. « Envoyer » : le SMS part ; le changement est « En attente ».

### 8.3 L'autre parent répond

- **Par SMS** : il répond OUI ou NON. Le statut change, l'organisateur reçoit un SMS, l'autre parent reçoit « Merci, c'est noté. ».
- **Par le lien** : il ouvre la page, répond OUI, choisit une contre-proposition ou NON. Il voit une confirmation.

### 8.4 Contre-proposition

1. L'autre parent choisit par exemple « oui, mais à 17 h ».
2. L'organisateur reçoit un SMS avec le lien du changement.
3. Il clique « Accepter » : l'heure est mise à jour, l'autre parent reçoit « c'est d'accord ».

### 8.5 La veille

À partir de 19 h, l'autre parent reçoit le rappel des affaires à prévoir.

### 8.6 Annulation

L'organisateur annule. Si la demande concernait encore l'autre parent, celui-ci reçoit « finalement, c'est annulé. Rien à faire ».

## 9. Écrans

| Écran | Accès | Contenu |
| --- | --- | --- |
| Inscription / connexion | Public | Formulaire ; rappel « l'autre parent n'a jamais besoin de compte » |
| Accueil « Cette semaine » | Organisateur | Prochain passage, 7 jours, changements et statuts, bouton principal |
| Famille | Organisateur | Enfants, parents à prévenir (avec état STOP), rythme |
| Signaler un changement | Organisateur | Formulaire en puces, affaires suggérées, mention santé |
| Aperçu du message | Organisateur | Bulle SMS, note privée éventuelle, Envoyer / Modifier |
| Détail d'un changement | Organisateur | Statut, détails, historique SMS, Accepter la proposition, Annuler |
| Page de réponse | Public (lien) | Question, heure, lieu, affaires ; Oui / contre-propositions / Non ; désinscription |
| Semaine à imprimer | Organisateur | Feuille A4, couleur ou noir et blanc, bouton Imprimer |
| SMS simulés | Organisateur, mode test | Journal des SMS, simulation de réponse |

**Charte** : polices Bricolage Grotesque (titres) et Figtree (texte) ; fond #F3F5F7, encre #16202B ; maison de l'organisateur en sarcelle #0E6B6B (rond), maison de l'autre parent en ambre #F2B544 (carré). Les deux maisons se distinguent par la forme, pas seulement par la couleur.

**Maquette de référence** : maquette cliquable V2 « Deux Toits » (8 écrans), issue du test sur personas.

## 10. Contenu des SMS

Les SMS de demande sont signés du prénom de l'organisateur et tutoient (c'est sa voix). Les rappels automatiques vouvoient. Aucun SMS ne mentionne d'information de santé.

**Demande, fournisseur capable de recevoir des réponses (Twilio)** :
```
Claire : peux-tu récupérer Léo jeudi 22 oct. à 16 h 30 à l'école ? À prévoir : Kimono.
Réponds OUI ou NON à ce SMS. Pour proposer autre chose : https://…/r/k8Q2…
STOP pour ne plus recevoir ces messages.
```

**Demande, fournisseur sans réception (Brevo)** :
```
Claire : peux-tu récupérer Léo jeudi 22 oct. à 16 h 30 à l'école ? À prévoir : Kimono.
Pour répondre : https://…/r/k8Q2…
Ne plus recevoir ces messages : https://…/r/k8Q2…
```

**Jour de garde** : « Claire : peux-tu garder Léo samedi 24 oct. à partir de 10 h ? »

**Retours à l'organisateur** :
- « Deux Toits : Marc a répondu OUI pour jeudi 22 oct. »
- « Deux Toits : Marc répond « oui, mais à 17 h » pour jeudi 22 oct. Pour accepter : https://…/changes/12 »
- « Deux Toits : Marc ne peut pas pour jeudi 22 oct. https://… »

**Confirmation d'une contre-proposition** : « Claire : c'est d'accord, tu peux récupérer Léo jeudi 22 oct. à 17 h à l'école. Merci ! »

**Rappel de la veille** :
```
Rappel de Claire : demain, jeudi 22 oct.
Vous récupérez Léo à 16 h 30 à l'école. À prévoir : Kimono.
STOP pour ne plus recevoir ces rappels.
```

**Annulation** : « Claire : finalement, le changement prévu jeudi 22 oct. est annulé. Rien à faire. »

**Réponses automatiques** : « Merci, c'est noté. » ; « Merci, la réponse a été transmise. » ; « Vous ne recevrez plus de messages de Deux Toits. Envoyez START pour les réactiver. » ; « Pour répondre à la demande de Claire (jeudi 22 oct.) : [lien] ».

## 11. Règles de gestion

| ID | Règle |
| --- | --- |
| R-01 | Statuts d'un changement : en attente → confirmé, autre proposition, pas possible ; tout statut sauf annulé → annulé. Une autre proposition acceptée devient confirmée. |
| R-02 | Une demande n'accepte qu'une réponse : la mise à jour n'a lieu que si elle est encore en attente. |
| R-03 | Un OUI ou NON par SMS ne vaut que pour la demande posée par le dernier SMS reçu par ce numéro. |
| R-04 | Les mots reconnus : OUI, O, OK, D'ACCORD, YES, OUAIS, ÇA MARCHE, C'EST NOTÉ ; NON, N, NO, PAS POSSIBLE, IMPOSSIBLE ; STOP, ARRÊT ; START. Casse et accents ignorés. |
| R-05 | Les informations de santé (médicament, inhalateur, Ventoline, traitement, ordonnance, fièvre, pédiatre, pharmacie, orthophoniste, médecin, dentiste, hôpital, kiné, psy…) ne partent jamais par SMS : objet mis en note privée, lieu omis. |
| R-06 | Une date doit exister dans le calendrier et ne pas être passée. Une récupération exige une heure. |
| R-07 | Une désinscription vaut pour le numéro, quel que soit l'organisateur, jusqu'à START. |
| R-08 | Le rappel part la veille, à partir de l'heure réglée (19 h par défaut, fuseau Europe/Paris), seulement si le changement est confirmé et comporte des affaires. Un seul rappel ; jusqu'à 3 essais. |
| R-09 | Le rythme semaine sur deux alterne à partir de la date de début : semaines paires chez l'organisateur, impaires chez l'autre parent. Un « jour de garde » confirmé bascule la journée chez l'autre parent ; une récupération confirmée coupe la journée en deux. |
| R-10 | Le lien de réponse est refusé une fois la demande annulée ou passée. |
| R-11 | L'annulation ne prévient l'autre parent que si la demande n'était ni refusée ni passée. |

## 12. Modèle de données

| Table | Contenu principal |
| --- | --- |
| organizers | prénom, e-mail (unique), téléphone, mot de passe haché, date de début du rythme |
| sessions | jeton, organisateur, expiration |
| coparents | organisateur, prénom, téléphone |
| children | organisateur, prénom |
| changes | organisateur, parent prévenu, type (pickup, swap), date, heure, lieu, affaires (JSON), affaires privées (JSON), statut, contre-proposition (libellé, choix), jeton du lien, dates de réponse et de rappel, essais de rappel |
| change_children | lien changement ↔ enfants |
| sms_log | sens (out, in), type (ask, reminder, answer, cancel, confirm, system, reply), téléphone, texte, changement, identifiant fournisseur, erreur |
| opt_outs | numéros désinscrits |

## 13. Architecture technique

| Élément | Choix | Raison |
| --- | --- | --- |
| Serveur | Node.js 22.13+, Express 4 | Simple, une seule dépendance |
| Base | SQLite intégrée à Node (node:sqlite) | Aucun service externe, aucune dépendance native |
| Pages | HTML rendu côté serveur, sans JavaScript côté client (sauf le bouton Imprimer) | Léger, accessible, fonctionne sur tout téléphone |
| SMS | Fournisseurs interchangeables : console (test), Twilio (envoi et réception), Brevo (envoi seul) | Tester sans compte ; choisir selon le besoin de réponse SMS |
| Rappels | Vérification chaque minute dans le processus | Pas de service de tâches planifiées |
| Hébergement | Un processus avec disque persistant (Render, Fly.io, Railway) | SQLite est un fichier |

**Routes principales** : `/signup`, `/login`, `/logout`, `/`, `/famille`, `/changes/new`, `/changes/preview`, `/changes`, `/changes/:id`, `/changes/:id/annuler`, `/changes/:id/accepter-proposition`, `/r/:token`, `/r/:token/stop`, `/semaine/imprimer`, `/webhooks/sms/twilio` (Twilio seulement), `/dev/sms` (mode test seulement), `/sante`.

**Configuration** : `BASE_URL`, `PORT`, `DATABASE_FILE`, `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `BREVO_API_KEY`, `BREVO_SENDER`, `REMINDER_HOUR`, `TZ_FAMILLE`.

## 14. Exigences non fonctionnelles

### 14.1 Sécurité

| ID | Exigence | État |
| --- | --- | --- |
| S-01 | Toute donnée affichée est échappée (pas de XSS) | ✅ |
| S-02 | Requêtes SQL paramétrées | ✅ |
| S-03 | Chaque organisateur n'accède qu'à ses données | ✅ |
| S-04 | Cookie de session httpOnly, SameSite=Lax, Secure en https | ✅ |
| S-05 | Liens de réponse aléatoires (72 bits) | ✅ |
| S-06 | Webhook SMS déclaré uniquement avec Twilio ; signature vérifiée à chaque requête | ✅ |
| S-07 | Mots de passe hachés avec scrypt (asynchrone) | ✅ |
| S-08 | En-têtes de sécurité (nosniff, no-referrer, DENY en iframe) | ✅ |
| S-09 | Limitation des tentatives de connexion | ✅ |
| S-10 | Jeton CSRF explicite sur les formulaires | S |

### 14.2 Accessibilité et ergonomie

- Mobile d'abord ; cibles tactiles d'au moins 44 px.
- Vrais boutons, libellés de champs, focus visible.
- Contrastes suffisants ; les deux maisons se distinguent par la forme.
- Feuille imprimable lisible en noir et blanc.
- Langage simple, sans jargon juridique.

### 14.3 Fiabilité

- Une réponse en double ne crée pas d'état incohérent.
- Un échec d'envoi SMS est journalisé et signalé à l'organisateur.
- Un rappel en échec est retenté (3 essais maximum).
- Les erreurs serveur n'interrompent pas le service.

### 14.4 Sobriété

- Une seule dépendance, aucun traceur, aucun script tiers hormis les polices.
- Pages légères, sans framework côté client.
- Données minimales : prénoms, téléphones, événements.

## 15. Conformité et données personnelles

Pré-analyse documentaire générée par IA, à faire valider par un juriste ou un DPO.

| Sujet | Position retenue |
| --- | --- |
| Base légale | Exécution du service demandé par l'organisateur pour l'essentiel ; le seuil de 15 ans (loi Informatique et Libertés, art. 45) ne vise que les traitements fondés sur le consentement. Sans compte enfant, la question se pose peu. |
| Destinataire non inscrit | Il reçoit des SMS sans s'être inscrit : prévenir avant le premier envoi, STOP dans chaque message, désinscription par lien. |
| Données de santé | Exclues des SMS ; conservées seulement en note privée de l'organisateur. Vérifier si l'hébergement certifié HDS est requis ; à défaut, envisager d'interdire ces notes. |
| Analyse d'impact (AIPD) | Probablement requise (données concernant des enfants, données sensibles possibles) : à réaliser avant l'ouverture au public. |
| Conservation | À définir par type de donnée ; purge des changements passés et des journaux SMS. |
| Demandes en justice | Répondre aux seules réquisitions fondées et tracées ; jamais de remise de données à un parent hors décision de justice. |
| Hébergement | En Europe. |
| Information | Mentions légales et politique de confidentialité en langage clair. |

## 16. Modèle économique

Hypothèse à valider ; le test simulé montre un faible consentement à payer.

| Formule | Prix | Contenu |
| --- | --- | --- |
| Gratuit | 0 € | Changements, réponses, rappels, feuille à imprimer, dans une limite de SMS par mois |
| Famille | 4,90 € par mois ou 49 € par an, un abonnement pour toute la famille | SMS illimités dans un usage normal, plusieurs parents prévenus, rythmes avancés, assistant démarches (V2) |
| Prescripteur | Gratuit | Kit pour médiateurs et avocats |

Le coût variable principal est le SMS : la limite du gratuit doit être calée sur le tarif réel du fournisseur choisi.

## 17. Indicateurs et critères de réussite

**Critère de décision du test réel** : au moins 4 parents organisateurs sur 8 envoient un vrai changement à l'autre parent dans la semaine.

| Indicateur | Cible bêta | Source |
| --- | --- | --- |
| Organisateurs qui envoient au moins un changement dans la semaine | 50 % | changes |
| Changements qui obtiennent une réponse sous 24 h | 70 % | changes.responded_at |
| Part des réponses par SMS (plutôt que par lien) | À mesurer | sms_log |
| Taux de STOP chez les destinataires | Moins de 10 % | opt_outs |
| Rétention des organisateurs à 3 mois | 50 % | changes |
| Conversion vers la formule payante | 5 % | (à instrumenter) |

## 18. Plan de test

### 18.1 Tests automatisés (réalisés)

6 tests, tous verts : utilitaires (téléphones, santé), lecture des réponses SMS, parcours complet (changement, SMS, réponse par lien, contre-proposition, OUI par SMS, rappel, STOP), isolation des comptes, corrections de la revue de sécurité (dates, santé, webhook, STOP durable, réponses ciblées, contre-proposition), validation de l'heure de rappel.

### 18.2 Test avec de vraies familles (à faire)

1. **Recrutement** : 8 parents organisateurs, en priorité ceux qui ont abandonné une appli parce que l'autre parent ne suivait pas ; plus 2 ou 3 médiateurs.
2. **Mise en place** : déploiement avec Twilio ; chaque organisateur prévient l'autre parent avant le premier SMS.
3. **Durée** : 2 semaines.
4. **Mesures** : changements envoyés, réponses, délais, canal de réponse, STOP.
5. **Entretiens de sortie** : 20 minutes avec chaque organisateur et, si possible, avec l'autre parent.
6. **Décision** : critère de la section 17.

## 19. Feuille de route

| Étape | Contenu | Condition |
| --- | --- | --- |
| V0 (fait) | Analyse de marché, entretiens simulés, maquette V1 puis V2, MVP | — |
| V1 test réel | Déploiement Twilio, 8 familles, 2 semaines | Compte Twilio et numéro français |
| V1.1 | Réinitialisation du mot de passe, suppression de compte, relance d'une demande, tiers qui récupère, saisie libre des contre-propositions, AIPD | Résultat positif du test |
| V2 | Autres rythmes, familles recomposées, pictogrammes, assistant démarches France, formule payante | Usage confirmé |
| V3 | Kit prescripteurs, langues, application mobile si nécessaire | Croissance |

## 20. Risques

| Risque | Gravité | Parade |
| --- | --- | --- |
| L'autre parent ne répond pas ou se méfie du lien | Élevée | Réponse OUI/NON par SMS, signature du prénom de l'organisateur, prévenir avant le premier envoi |
| SMS vus comme du démarchage | Moyenne | Messages transactionnels, STOP, aucun contenu promotionnel |
| Coût des SMS | Moyenne | Limite du gratuit, formule Famille |
| Un concurrent copie le parcours sans compte | Moyenne | Vitesse, simplicité, prescription par les médiateurs |
| Données sensibles (enfants, santé) | Élevée | Minimisation, filtre santé, AIPD, hébergement européen |
| Faible consentement à payer | Élevée | Valider dans le test réel ; piste B2B2C via les services de médiation |
| Dépendance à un fournisseur SMS | Faible | Fournisseurs interchangeables |

## 21. Questions ouvertes

- Le test réel confirmera-t-il que l'autre parent répond ?
- Faut-il un numéro Twilio français (dossier réglementaire) ou un numéro mobile partagé suffit-il pour le test ?
- Où placer la limite de SMS gratuits ?
- Faut-il interdire toute note de santé pour éviter la question de l'hébergement certifié ?
- Le nom « Deux Toits » est-il disponible (INPI classes 9 et 42, domaine, stores) ?
- Comment traiter les familles recomposées sans complexifier l'outil ?

## 22. Annexes et sources

**Livrables du projet**
- Analyse marketing et positionnement (document de travail)
- Kit de découverte : guides d'entretien, grille go / no-go, brief juriste
- Résultats des entretiens simulés et du test de maquette
- Transcriptions des 30 entretiens simulés et pré-analyse juridique
- Maquette cliquable V2 (8 écrans)
- Code du MVP : dépôt GitHub `everssteeve/deux-toits`

**Sources**
- [INSEE Première n° 1841 : en 2020, 12 % des enfants de parents séparés vivent en résidence alternée](https://www.insee.fr/fr/statistiques/5227614)
- [CNAF, L'essentiel n° 234 : la médiation familiale en 2024](https://www.caf.fr/sites/default/files/medias/cnaf/Nous_connaitre/Recherche_et_statistiques/Essentiel/2026_essentiel_234.pdf)
- [Congrès des notaires 2025 : le mariage et les divorces](https://www.rapport-congresdesnotaires.fr/2025-rapport-du-121e-congres/le-mariage)
- [Copareo : comparatif des applications de coparentalité 2026](https://copareo.com/blog/meilleures-applications-coparentalite-comparatif-2025)
- [Duvia](https://duvia.fr/) · [MyGardeo](https://my-gardeo.fr/) · [2houses : tarifs](https://2houses.com/pricing) · [Kopare : fiche App Store](https://apps.apple.com/us/app/kopare-co-parenting-calendar/id6749215322)
- [Nori : applis de coparentalité et fin du gratuit en 2026](https://heynori.com/blog/two-career-family-coordination/co-parenting-apps-shared-custody-calendars)
- [CNIL : droits des mineurs dans l'environnement numérique](https://www.cnil.fr/fr/la-cnil-lance-une-consultation-publique-sur-les-droits-des-mineurs-dans-lenvironnement-numerique)
- [CNIL : analyse d'impact relative à la protection des données](https://cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd)

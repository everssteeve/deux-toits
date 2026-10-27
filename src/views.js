// Gabarits HTML (sans moteur de template). Toute donnée affichée passe par esc().
import { ROLES, esc, frDate, frDayName, frTime } from './util.js';

const ICON = {
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  people: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  print: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>',
  houseRound: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="12" cy="14" r="2.5"/></svg>',
  houseSquare: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9.5 12h5v5h-5z"/></svg>',
  bag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  check: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
};

const STATUS = {
  pending: ['En attente', 'badge-wait'],
  accepted: ['Confirmé', 'badge-ok'],
  counter: ['Autre proposition', 'badge-wait'],
  declined: ['Pas possible', 'badge-no'],
  cancelled: ['Annulé', 'badge-muted']
};

export function layout(title, body, { nav = null, wide = false, manifest = null } = {}) {
  const manifestUrl = manifest ?? (nav ? '/manifest.webmanifest' : null);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Deux Toits</title>
<meta name="theme-color" content="#0E6B6B">
<meta name="referrer" content="no-referrer">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
${manifestUrl ? `<link rel="manifest" href="${esc(manifestUrl)}">` : ''}
<link rel="stylesheet" href="/style.css">
<script src="/push.js" defer></script>
</head>
<body>
<div class="app${wide ? ' app-wide' : ''}">
${body}
${nav ? navBar(nav) : ''}
</div>
</body>
</html>`;
}

function navBar(active) {
  const item = (href, key, icon, label) =>
    `<a href="${href}" class="nav-item${active === key ? ' is-active' : ''}"${active === key ? ' aria-current="page"' : ''}>${icon}${label}</a>`;
  return `<nav class="nav" aria-label="Navigation principale">
${item('/', 'home', ICON.home, 'Semaine')}
${item('/famille', 'famille', ICON.people, 'Famille')}
${item('/semaine/imprimer', 'print', ICON.print, 'Frigo')}
</nav>`;
}

function header(title, back) {
  return `<header class="topbar">
${back ? `<a href="${back}" class="icon-btn" aria-label="Retour">${ICON.back}</a>` : ''}
<h1 class="h-page">${esc(title)}</h1>
</header>`;
}

function flashBox(flash) {
  if (!flash) return '';
  return `<p class="flash ${flash.type === 'error' ? 'flash-error' : 'flash-ok'}" role="status">${esc(flash.text)}</p>`;
}

// --- Comptes ----------------------------------------------------------------
export function authPage({ mode, error, values = {} }) {
  const signup = mode === 'signup';
  return layout(signup ? 'Créer un compte' : 'Connexion', `
<main class="main narrow">
  <p class="eyebrow">Deux Toits</p>
  <h1 class="h-hero">${signup ? 'Quand le planning change, tout le monde est prévenu.' : 'Bon retour'}</h1>
  ${error ? `<p class="flash flash-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="${signup ? '/signup' : '/login'}" class="stack">
    ${signup ? `<label class="field">Vous êtes
      <select name="role" required>${ROLES.map((r) => `<option value="${esc(r)}" ${values.role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <span class="hint">Un rôle, pas un nom : Deux Toits ne garde ni nom, ni e-mail, ni numéro de téléphone.</span></label>
    <button class="btn btn-primary">Créer mon espace</button>` : `<label class="field">Votre code d'accès<input name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" class="code-input" placeholder="XXXX-XXXX-XXXX"></label>
    <button class="btn btn-primary">Me connecter</button>`}
  </form>
  <p class="center">${signup ? 'Déjà un espace ? <a href="/login">Entrer avec mon code</a>' : 'Pas encore d\'espace ? <a href="/signup">En créer un</a>'}</p>
  <p class="fine center">${signup ? 'Un code d\'accès vous sera remis : il remplace e-mail et mot de passe. ' : ''}L'autre parent n'a jamais besoin de compte. <a href="/j">J'ai reçu un code d'invitation</a></p>
</main>`);
}

// Le code d'accès n'est montré qu'ici : seule son empreinte est gardée.
export function accessCodePage({ code, first }) {
  return layout('Votre code d\'accès', `
<main class="main narrow">
  <p class="eyebrow">Deux Toits</p>
  <h1 class="h-hero">${first ? 'Votre espace est prêt.' : 'Nouveau code d\'accès'}</h1>
  <section class="card card-accent stack-s" aria-label="Code d'accès">
    <p class="strong">Notez ce code maintenant</p>
    <p class="code-big" translate="no">${esc(code)}</p>
    <p class="fine">C'est votre seule clé pour revenir sur un autre appareil. Nous ne le gardons pas : il ne sera plus jamais affiché${first ? '' : ', et l\'ancien code ne fonctionne plus'}.</p>
  </section>
  <a class="btn btn-primary btn-big" href="/famille">${first ? 'C\'est noté, continuer' : 'C\'est noté'}</a>
</main>`);
}

// --- Invitation d'un proche ------------------------------------------------------
export function joinPage({ code, invitation, error }) {
  return layout('Rejoindre', `
<main class="main narrow">
  <p class="eyebrow">Deux Toits</p>
  <h1 class="h-hero">${invitation ? (invitation.kind === 'child' ? `Le calendrier de ${esc(invitation.label)}` : `Vous êtes « ${esc(invitation.label)} »`) : 'Rejoindre'}</h1>
  <p>${invitation ? (invitation.kind === 'child' ? `${esc(invitation.organizer_role)} vous donne accès à votre calendrier : chez qui vous dormez, et ce qu'il faut prendre.` : `${esc(invitation.organizer_role)} vous invite à être prévenu des changements de planning.`) : 'Entrez le code reçu en main propre ou par message.'} Pas de compte, pas de nom, pas de numéro : cet appareil reçoit une page personnelle et, si vous le voulez, des notifications.</p>
  ${error ? `<p class="flash flash-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/j" class="stack">
    <label class="field">Code d'invitation<input name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" class="code-input" value="${esc(code)}" placeholder="XXXX-XXXX"></label>
    <button class="btn btn-primary btn-big">Rejoindre</button>
  </form>
  <p class="fine">Le code ne sert qu'une fois.</p>
</main>`);
}

// --- Accueil ---------------------------------------------------------------
export function homePage({ org, week, recent, setupNeeded, flash, noDevice }) {
  const next = week.days.find((d) => d.isHandover);
  return layout('Cette semaine', `
<header class="topbar topbar-home">
  <div><p class="muted">Vous êtes ${esc(org.role)}</p><h1 class="h-page h-xl">Cette semaine</h1></div>
</header>
<main class="main">
  ${flashBox(flash)}
  ${setupNeeded ? `<section class="card card-accent"><p class="strong">Pour commencer</p><p>Ajoutez vos enfants et l'autre parent.</p><a class="btn btn-primary" href="/famille">Compléter ma famille</a></section>` : ''}
  ${noDevice && !setupNeeded ? `<section class="card"><p class="strong">Soyez prévenu des réponses</p><p class="fine">Activez les notifications sur cet appareil pour savoir quand l'autre parent répond.</p><a class="btn btn-secondary" href="/famille">Activer</a></section>` : ''}
  ${next ? `<section class="hero-card" aria-label="Prochain passage">
    <p class="hero-eyebrow">Prochain passage</p>
    <p class="hero-title">${esc(frDate(next.date))}</p>
    <p>Les enfants vont ${next.home === 'organizer' ? 'chez vous' : 'chez l\'autre parent'}.</p>
  </section>` : ''}
  <section aria-label="Les 7 prochains jours" class="stack-s">
    <h2 class="h-section">Les 7 prochains jours</h2>
    <ol class="days">
      ${week.days.map((d) => dayRow(d)).join('')}
    </ol>
  </section>
  <section aria-label="Changements" class="stack-s">
    <h2 class="h-section">Changements</h2>
    ${recent.length ? recent.map(changeCard).join('') : '<p class="muted">Aucun changement pour l\'instant.</p>'}
  </section>
  ${setupNeeded ? '' : `<a class="btn btn-primary btn-big" href="/changes/new">${ICON.plus}Signaler un changement</a>`}
</main>`, { nav: 'home' });
}

function swatch(home) {
  if (home === 'organizer') return `<span class="sw sw-a" title="Chez vous">${ICON.houseRound}</span>`;
  if (home === 'coparent') return `<span class="sw sw-b" title="Chez l'autre parent">${ICON.houseSquare}</span>`;
  return '<span class="sw sw-none" aria-hidden="true"></span>';
}

function dayRow(d) {
  return `<li class="day">
  ${swatch(d.home)}
  <div class="day-main"><p class="day-name">${esc(frDayName(d.date))} <span class="muted">${esc(frDate(d.date).split(' ').slice(1).join(' '))}</span></p>
  ${d.notes.length ? `<p class="day-note">${esc(d.notes.join(' · '))}</p>` : ''}
  ${d.changes.filter((c) => c.status === 'pending').length ? '<p class="day-note">Changement en attente de réponse</p>' : ''}</div>
  ${d.items.length ? `<span class="chip-bag">${ICON.bag}${esc(d.items.join(', '))}</span>` : ''}
</li>`;
}

function changeCard(c) {
  const [label, cls] = STATUS[c.status];
  const what = c.kind === 'pickup' ? `récupération de ${c.kidNames}` : `garde de ${c.kidNames}`;
  const detail = c.status === 'counter' ? `${c.coparent.role} répond : ${c.counter_label}`
    : c.status === 'accepted' ? `${c.coparent.role} a confirmé`
      : c.status === 'declined' ? `${c.coparent.role} ne peut pas`
        : `Envoyé à ${c.coparent.role}, pas encore de réponse`;
  return `<a class="card card-link" href="/changes/${c.id}">
  <span class="row-between"><span class="strong">${esc(frDate(c.date))} · ${esc(what)}</span><span class="badge ${cls}">${label}</span></span>
  <span class="muted">${esc(detail)}</span>
</a>`;
}

// --- Famille ----------------------------------------------------------------
function pushBox({ publicKey, base, scope, sw }) {
  return `<div class="pushbox" data-push data-key="${esc(publicKey)}" data-base="${esc(base)}" data-scope="${esc(scope)}" data-sw="${esc(sw)}">
  <p class="fine" data-push-status>Vérification…</p>
  <button type="button" class="btn btn-secondary" data-push-on hidden>Activer les notifications</button>
  <button type="button" class="btn-text" data-push-off hidden>Désactiver sur cet appareil</button>
</div>`;
}

// Carte d'invitation d'un proche (path « parents ») ou d'un enfant (path « enfants ») : QR + code tant qu'il n'a pas rejoint.
function inviteCard(p, { label, path, who, joinedText }) {
  const actions = (renew) => `<div class="row-between"><form method="post" action="/famille/${path}/${p.id}/code"><button class="btn-text">${renew}</button></form>
    <form method="post" action="/famille/${path}/${p.id}/supprimer"><button class="btn-text">Retirer</button></form></div>`;
  if (p.joined) {
    return `<div class="member"><div class="row-between"><span><span class="strong">${esc(label)}</span> <span class="muted">${esc(joinedText)}</span></span></div>${actions('Nouveau code (changement d\'appareil)')}</div>`;
  }
  if (!p.claim_code) {
    return `<div class="member"><div class="row-between"><span><span class="strong">${esc(label)}</span> <span class="muted">a quitté</span></span></div>${actions('Nouveau code')}</div>`;
  }
  return `<div class="member member-pending"><div class="row-between"><span><span class="strong">${esc(label)}</span> <span class="muted">n'a pas encore rejoint</span></span></div>
    <div class="invite">
      <div class="qr" role="img" aria-label="QR code d'invitation pour ${esc(label)}">${p.qr}</div>
      <div class="stack-s"><p class="fine">En présentiel : ${esc(who)} scanne ce QR code. À distance : ${esc(who)} tape ce code.</p>
      <p class="code-big code-sm" translate="no">${esc(p.codeLabel)}</p>
      <p class="fine">Valable 14 jours, une seule fois.</p></div>
    </div>${actions('Nouveau code')}</div>`;
}
const parentCard = (p) => inviteCard(p, {
  label: p.role, path: 'parents', who: 'il',
  joinedText: `a rejoint · ${p.devices ? `${p.devices} appareil${p.devices > 1 ? 's' : ''} notifié${p.devices > 1 ? 's' : ''}` : 'pas de notification (verra sa page)'}`
});
const childCard = (k) => inviteCard(k, { label: k.name, path: 'enfants', who: 'l\'enfant', joinedText: 'a son calendrier sur son appareil' });

export function familyPage({ org, kids, coparents, roles, joinUrl, flash, devices, publicKey }) {
  return layout('Famille', `
${header('Famille')}
<main class="main">
  ${flashBox(flash)}
  <section class="card stack-s" aria-label="Enfants">
    <h2 class="h-section">Enfants</h2>
    <p class="fine">Chaque enfant peut avoir son calendrier sur son propre appareil : il scanne son QR code ou tape son code sur <span translate="no">${esc(joinUrl)}</span>. Il y voit chez qui il dort et ce qu'il doit prendre, rien d'autre.</p>
    ${kids.map(childCard).join('')}
    <form method="post" action="/famille/enfants" class="row-form"><label class="sr-only" for="kid">Prénom de l'enfant</label><input id="kid" name="name" required maxlength="30" placeholder="Prénom"><button class="btn btn-secondary">Ajouter</button></form>
  </section>
  <section class="card stack-s" aria-label="Parents et proches à prévenir">
    <h2 class="h-section">Parent(s) à prévenir</h2>
    <p class="fine">Pas de nom : un rôle et un code. Chacun rejoint depuis son appareil, en scannant son QR code ou en tapant son code sur <span translate="no">${esc(joinUrl)}</span>. Aucun compte à créer.</p>
    ${coparents.map(parentCard).join('')}
    <form method="post" action="/famille/parents" class="row-form">
      <label class="sr-only" for="role">Rôle</label>
      <select id="role" name="role" required>${roles.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
      <button class="btn btn-secondary">Ajouter</button>
    </form>
  </section>
  <section class="card stack-s" aria-label="Mon accès">
    <h2 class="h-section">Mon accès</h2>
    <p class="fine">Vous êtes ${esc(org.role)}. ${devices ? `${devices} appareil${devices > 1 ? 's' : ''} notifié${devices > 1 ? 's' : ''} des réponses.` : 'Aucun appareil notifié des réponses.'}</p>
    ${pushBox({ publicKey, base: '', scope: '/', sw: '/sw.js' })}
    <p class="fine">Votre code d'accès n'est pas conservé : en cas de perte, créez-en un nouveau (l'ancien cessera de fonctionner).</p>
    <form method="post" action="/compte/code"><button class="btn btn-secondary">Créer un nouveau code d'accès</button></form>
  </section>
  <section class="card stack-s" aria-label="Rythme">
    <h2 class="h-section">Rythme d'alternance</h2>
    <p class="fine">Semaine sur deux. Indiquez un jour où les enfants arrivent chez vous.</p>
    <form method="post" action="/famille/rythme" class="row-form">
      <label class="sr-only" for="rs">Jour d'arrivée chez vous</label>
      <input id="rs" type="date" name="rhythm_start" value="${esc(org.rhythm_start || '')}" required>
      <button class="btn btn-secondary">Enregistrer</button>
    </form>
  </section>
  <form method="post" action="/logout"><button class="btn-text">Se déconnecter</button></form>
</main>`, { nav: 'famille' });
}

// --- Signaler un changement ---------------------------------------------------
const SUGGESTED_ITEMS = ['Kimono', 'Maillot de bain', 'Affaires de sport', 'Cahier de devoirs', 'Instrument', 'Doudou', 'Chargeur'];

export function changeForm({ kids, coparents, values = {}, error }) {
  const v = values;
  const selectedKids = [].concat(v.childIds || []).map(String);
  const selectedItems = [].concat(v.items || []);
  const extra = selectedItems.filter((i) => !SUGGESTED_ITEMS.includes(i)).join(', ');
  return layout('Signaler un changement', `
${header('Signaler un changement', '/')}
<main class="main">
  ${error ? `<p class="flash flash-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/changes/preview" class="stack">
    <fieldset class="fs"><legend>Qu'est-ce qui change ?</legend>
      <div class="chips">
        <label class="chip"><input type="radio" name="kind" value="pickup" ${v.kind !== 'swap' ? 'checked' : ''}><span>Qui récupère</span></label>
        <label class="chip"><input type="radio" name="kind" value="swap" ${v.kind === 'swap' ? 'checked' : ''}><span>Jour de garde</span></label>
      </div>
    </fieldset>
    <fieldset class="fs"><legend>Pour qui</legend>
      <div class="chips">${kids.map((k) => `<label class="chip"><input type="checkbox" name="childIds" value="${k.id}" ${selectedKids.includes(String(k.id)) || (!selectedKids.length && kids.length === 1) ? 'checked' : ''}><span>${esc(k.name)}</span></label>`).join('')}</div>
    </fieldset>
    <div class="grid-2">
      <label class="field">Quand<input type="date" name="date" required value="${esc(v.date || '')}"></label>
      <label class="field">À quelle heure<input type="time" name="time" value="${esc(v.time || '')}"></label>
    </div>
    <label class="field">Où<input name="place" maxlength="60" value="${esc(v.place || '')}" placeholder="École, dojo, arrêt du car…"></label>
    <label class="field">Qui prévenir
      <select name="coparentId">${coparents.map((p) => `<option value="${p.id}" ${p.joined ? '' : 'disabled'} ${String(v.coparentId) === String(p.id) ? 'selected' : ''}>${esc(p.role)} · ${p.joined ? 'notifié' : 'n\'a pas rejoint'}</option>`).join('')}</select>
    </label>
    <fieldset class="fs"><legend>À prévoir</legend>
      <div class="chips">${SUGGESTED_ITEMS.map((i) => `<label class="chip"><input type="checkbox" name="items" value="${esc(i)}" ${selectedItems.includes(i) ? 'checked' : ''}><span>${esc(i)}</span></label>`).join('')}</div>
      <label class="field">Autre chose<input name="items" maxlength="80" value="${esc(extra)}" placeholder="Séparez par des virgules"></label>
      <p class="fine">Les informations de santé (médicaments, traitement…) ne sont jamais envoyées.</p>
    </fieldset>
    <button class="btn btn-primary btn-big">Voir le message</button>
  </form>
</main>`);
}

export function previewPage({ text, values, coparentName, privateItems = [] }) {
  const hidden = Object.entries(values).flatMap(([k, val]) => [].concat(val ?? []).map((x) => `<input type="hidden" name="${esc(k)}" value="${esc(x)}">`)).join('');
  return layout('Aperçu', `
${header(`Ce que ${coparentName} va recevoir`, '/')}
<main class="main">
  <p class="muted">Une notification courte, signée de votre rôle. ${esc(coparentName)} répond d'un geste, sans compte.</p>
  <section class="sms-box" aria-label="Aperçu de la notification"><p class="sms-bubble">${esc(text).replace(/\n/g, '<br>')}</p></section>
  ${privateItems.length ? `<p class="fine">Note privée, non envoyée : ${esc(privateItems.join(', '))}. Les informations de santé ne partent jamais.</p>` : ''}
  <p class="fine">Pas d'accusé de lecture : vous saurez seulement si ${esc(coparentName)} a répondu.</p>
  <form method="post" action="/changes" class="stack-s">${hidden}<button class="btn btn-primary btn-big">Envoyer</button></form>
  <form method="post" action="/changes/new" class="stack-s">${hidden}<button class="btn btn-secondary">Modifier</button></form>
</main>`);
}

export function changePage({ change, notifs, flash }) {
  const c = change;
  const [label, cls] = STATUS[c.status];
  return layout(frDate(c.date), `
${header(frDate(c.date), '/')}
<main class="main">
  ${flashBox(flash)}
  <section class="status-card ${c.status === 'accepted' ? 'status-ok' : ''}" aria-label="Statut">
    <span class="badge ${cls}">${label}</span>
    <p class="status-title">${c.status === 'accepted' ? `${esc(c.coparent.role)} a confirmé`
      : c.status === 'counter' ? `${esc(c.coparent.role)} répond : ${esc(c.counter_label)}`
        : c.status === 'declined' ? `${esc(c.coparent.role)} ne peut pas`
          : `En attente de la réponse de ${esc(c.coparent.role)}`}</p>
    <p>${c.kind === 'pickup' ? 'Récupération' : 'Garde'} de ${esc(c.kidNames)}${c.time ? ` · ${esc(frTime(c.time))}` : ''}${c.place ? ` · ${esc(c.place)}` : ''}</p>
    ${c.items.length ? `<p>À prévoir : ${esc(c.items.join(', '))}</p>` : ''}
    ${c.privateItems.length ? `<p class="fine">Note privée (non envoyée) : ${esc(c.privateItems.join(', '))}</p>` : ''}
  </section>
  <section class="card stack-s" aria-label="Messages">
    <h2 class="h-section">Notifications</h2>
    ${notifs.map((m) => `<div class="log"><p class="fine">${m.audience === 'coparent' ? `Envoyé à ${esc(c.coparent.role)}` : 'Reçu par vous'} · ${esc(m.created_at)} UTC${m.delivered ? '' : ` · non distribué (${esc(m.error || 'inconnu')})`}</p><p>${esc(m.title)}${m.body ? `<br>${esc(m.body)}` : ''}</p></div>`).join('')}
  </section>
  ${c.status === 'counter' && !c.isPast ? `<form method="post" action="/changes/${c.id}/accepter-proposition"><button class="btn btn-primary btn-big">Accepter : ${esc(c.counter_label)}</button></form>` : ''}
  ${c.status !== 'cancelled' && !c.isPast ? `<form method="post" action="/changes/${c.id}/annuler"><button class="btn btn-secondary">Annuler ce changement</button></form>` : ''}
</main>`, { nav: 'home' });
}

// --- Page personnelle d'un proche (lien secret, sans compte) --------------------------
function requestCard(c, base, focus) {
  const question = c.kind === 'pickup'
    ? `Peux-tu récupérer ${c.kidNames} ${frDate(c.date)} ?`
    : `Peux-tu garder ${c.kidNames} ${frDate(c.date)} ?`;
  const facts = [c.time ? `Heure : ${frTime(c.time)}` : '', c.place ? `Où : ${c.place}` : '', c.items.length ? `À prévoir : ${c.items.join(', ')}` : '']
    .filter(Boolean).map((f) => `<li>${esc(f)}</li>`).join('');
  const state = c.status === 'accepted' ? '<p class="status-title">Confirmé, merci.</p>'
    : c.status === 'declined' ? '<p class="status-title">Vous avez répondu que ce n\'est pas possible.</p>'
      : c.status === 'counter' ? `<p class="status-title">Votre proposition : ${esc(c.counter_label)}</p><p class="fine">${esc(c.organizer.role)} doit encore l'accepter.</p>`
        : '';
  const buttons = c.status === 'pending'
    ? `<form method="post" action="${esc(base)}/changes/${c.id}/answer" class="stack-s">
        <button name="answer" value="yes" class="btn btn-primary btn-big">Oui, c'est noté</button>
        <fieldset class="fs"><legend>Ou proposer autre chose</legend>
          ${c.options.map((o) => `<button name="answer" value="${o.id}" class="btn btn-option">${esc(o.label.charAt(0).toUpperCase() + o.label.slice(1))}</button>`).join('')}
          <button name="answer" value="no" class="btn btn-option">Non, je ne peux pas</button>
        </fieldset>
      </form>` : '';
  return `<section class="card stack-s${focus === c.id ? ' card-accent' : ''}" id="c${c.id}" aria-label="${esc(question)}">
    <p class="muted">${esc(c.organizer.role)} vous demande</p>
    <h2 class="h-section">${esc(question)}</h2>
    ${facts ? `<ul class="facts-list">${facts}</ul>` : ''}
    ${state}${buttons}
  </section>`;
}

export function memberPage({ member, base, changes, flash, devices, publicKey, focus, welcome }) {
  return layout('Ma page', `
<header class="topbar topbar-home"><div><p class="muted">Vous êtes ${esc(member.role)}</p><h1 class="h-page h-xl">Mes demandes</h1></div></header>
<main class="main">
  ${flashBox(flash)}
  ${welcome ? `<section class="card card-accent stack-s"><p class="strong">Bienvenue. Gardez cette page.</p>
    <p>Cette adresse est votre accès : mettez-la en favori, ou ajoutez-la à l'écran d'accueil. Ne la partagez pas. ${esc(member.organizer_role)} ne connaît ni votre nom ni votre numéro, seulement votre rôle.</p></section>` : ''}
  <section class="card stack-s" aria-label="Notifications">
    <h2 class="h-section">Notifications</h2>
    <p class="fine">${devices ? 'Cet appareil ou un autre est déjà prévenu.' : 'Sans notification, les demandes apparaissent ici quand vous ouvrez la page.'} Sur iPhone, ajoutez d'abord la page à l'écran d'accueil.</p>
    ${pushBox({ publicKey, base, scope: `${base}/`, sw: `${base}/sw.js` })}
  </section>
  ${changes.length ? changes.map((c) => requestCard(c, base, focus)).join('') : '<p class="muted">Aucune demande à venir.</p>'}
  <p class="fine">Deux Toits n'affiche que des informations pratiques. Pas de messagerie, pas de compte, pas de nom, pas de numéro.</p>
  <form method="post" action="${esc(base)}/leave"><button class="btn-text">Quitter Deux Toits (oublier cette page et mes appareils)</button></form>
</main>`, { manifest: `${base}/manifest.webmanifest` });
}

// --- Page d'un enfant : calendrier en lecture seule (lien secret, sans compte) ------------------
export function childPage({ child, week, base, welcome }) {
  const org = week.org.role;
  const day = (d) => `<li class="day">
  ${swatch(d.home)}
  <div class="day-main"><p class="day-name">${esc(frDayName(d.date))} <span class="muted">${esc(frDate(d.date).split(' ').slice(1).join(' '))}</span></p>
  <p class="day-note">${d.home === 'organizer' ? `Chez ${esc(org)}` : d.home === 'coparent' ? 'Chez l\'autre parent' : ''}${d.isHandover ? ' · jour du changement de maison' : ''}</p>
  ${d.notes.length ? `<p class="day-note">${esc(d.notes.join(' · '))}</p>` : ''}</div>
  ${d.items.length ? `<span class="chip-bag">${ICON.bag}${esc(d.items.join(', '))}</span>` : ''}
</li>`;
  return layout('Mon calendrier', `
<header class="topbar topbar-home"><div><p class="muted">Bonjour ${esc(child.name)}</p><h1 class="h-page h-xl">Mon calendrier</h1></div></header>
<main class="main">
  ${welcome ? `<section class="card card-accent stack-s"><p class="strong">C'est ton calendrier.</p>
    <p>Ajoute cette page à l'écran d'accueil pour la retrouver. Elle change toute seule quand les parents modifient le planning. Ne la partage pas.</p></section>` : ''}
  <p class="legend"><span class="sw sw-a">${ICON.houseRound}</span>Chez ${esc(org)} (le rond) <span class="sw sw-b">${ICON.houseSquare}</span>Chez l'autre parent (le carré)</p>
  <ol class="days">${week.days.map(day).join('')}</ol>
  <p class="fine">Les 14 prochains jours. Cette page ne montre que ce qui est confirmé.</p>
  <form method="post" action="${esc(base)}/leave"><button class="btn-text">Supprimer cette page de mon appareil</button></form>
</main>`, { manifest: `${base}/manifest.webmanifest` });
}

export function notFoundPage(text = 'Cette page n\'existe pas ou n\'est plus active.') {
  return layout('Introuvable', `<main class="main narrow"><h1 class="h-page">Introuvable</h1><p>${esc(text)}</p></main>`);
}

// --- Feuille à imprimer -------------------------------------------------------------
export function printPage({ week, kids, start, bw }) {
  const names = kids.map((k) => k.name).join(' et ') || 'vos enfants';
  const days = week.days;
  return layout('Semaine à imprimer', `
<main class="print ${bw ? 'print-bw' : ''}">
  <header class="print-head">
    <div><p class="muted">La semaine de ${esc(names)}</p>
    <h1 class="h-hero">Du ${esc(frDate(days[0].date).split(' ').slice(1).join(' '))} au ${esc(frDate(days[6].date).split(' ').slice(1).join(' '))}</h1></div>
    <div class="no-print print-actions">
      <a class="btn btn-secondary" href="/">Retour</a>
      <a class="btn btn-secondary" href="/semaine/imprimer?start=${esc(start)}${bw ? '' : '&nb=1'}">${bw ? 'Couleur' : 'Noir et blanc'}</a>
      <button class="btn btn-primary" onclick="window.print()">Imprimer</button>
    </div>
  </header>
  <p class="legend"><span class="sw sw-a">${ICON.houseRound}</span>Chez ${esc(week.org.role)} (le rond) <span class="sw sw-b">${ICON.houseSquare}</span>Chez l'autre parent (le carré)</p>
  <ol class="print-days">
    ${days.map((d) => `<li class="print-day">
      <span class="sws">${swatch(d.home)}${d.split ? swatch(d.home === 'organizer' ? 'coparent' : 'organizer') : ''}</span>
      <span class="print-dayname">${esc(frDayName(d.date))}</span>
      <span class="print-note">${esc(d.notes.join(' · ') || (d.isHandover ? 'Jour du changement de maison' : ''))}</span>
      ${d.items.length ? `<span class="chip-bag chip-outline">${ICON.bag}${esc(d.items.join(', '))}</span>` : ''}
    </li>`).join('')}
  </ol>
  <p class="fine">Valable au ${esc(frDate(start))}. Un changement ? Réimprimez la feuille.</p>
</main>`, { wide: true });
}

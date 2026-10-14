// Gabarits HTML (sans moteur de template). Toute donnée affichée passe par esc().
import { esc, frDate, frDayName, frTime } from './util.js';

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

export function layout(title, body, { nav = null, wide = false } = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Deux Toits</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
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
    ${signup ? `<label class="field">Votre prénom<input name="name" required maxlength="40" value="${esc(values.name)}" autocomplete="given-name"></label>
    <label class="field">Votre téléphone<input name="phone" required inputmode="tel" value="${esc(values.phone)}" autocomplete="tel" placeholder="06 12 34 56 78"><span class="hint">Pour recevoir les réponses de l'autre parent.</span></label>` : ''}
    <label class="field">E-mail<input name="email" type="email" required value="${esc(values.email)}" autocomplete="email"></label>
    <label class="field">Mot de passe<input name="password" type="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
    <button class="btn btn-primary">${signup ? 'Créer mon compte' : 'Me connecter'}</button>
  </form>
  <p class="center">${signup ? 'Déjà un compte ? <a href="/login">Se connecter</a>' : 'Pas encore de compte ? <a href="/signup">Créer un compte</a>'}</p>
  <p class="fine center">L'autre parent n'a jamais besoin de compte.</p>
</main>`);
}

// --- Accueil ---------------------------------------------------------------
export function homePage({ org, week, recent, setupNeeded, flash }) {
  const next = week.days.find((d) => d.isHandover);
  return layout('Cette semaine', `
<header class="topbar topbar-home">
  <div><p class="muted">Bonjour ${esc(org.name)}</p><h1 class="h-page h-xl">Cette semaine</h1></div>
</header>
<main class="main">
  ${flashBox(flash)}
  ${setupNeeded ? `<section class="card card-accent"><p class="strong">Pour commencer</p><p>Ajoutez vos enfants et l'autre parent.</p><a class="btn btn-primary" href="/famille">Compléter ma famille</a></section>` : ''}
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
  const detail = c.status === 'counter' ? `${c.coparent.name} répond : ${c.counter_label}`
    : c.status === 'accepted' ? `${c.coparent.name} a confirmé`
      : c.status === 'declined' ? `${c.coparent.name} ne peut pas`
        : `Envoyé à ${c.coparent.name}, pas encore de réponse`;
  return `<a class="card card-link" href="/changes/${c.id}">
  <span class="row-between"><span class="strong">${esc(frDate(c.date))} · ${esc(what)}</span><span class="badge ${cls}">${label}</span></span>
  <span class="muted">${esc(detail)}</span>
</a>`;
}

// --- Famille ----------------------------------------------------------------
export function familyPage({ org, kids, coparents, flash }) {
  return layout('Famille', `
${header('Famille')}
<main class="main">
  ${flashBox(flash)}
  <section class="card stack-s" aria-label="Enfants">
    <h2 class="h-section">Enfants</h2>
    ${kids.map((k) => `<form method="post" action="/famille/enfants/${k.id}/supprimer" class="row-between"><span class="strong">${esc(k.name)}</span><button class="btn-text">Retirer</button></form>`).join('')}
    <form method="post" action="/famille/enfants" class="row-form"><label class="sr-only" for="kid">Prénom de l'enfant</label><input id="kid" name="name" required maxlength="30" placeholder="Prénom"><button class="btn btn-secondary">Ajouter</button></form>
  </section>
  <section class="card stack-s" aria-label="Autre parent">
    <h2 class="h-section">Parent(s) à prévenir</h2>
    <p class="fine">Ils reçoivent des SMS et répondent sans créer de compte.</p>
    ${coparents.map((p) => `<form method="post" action="/famille/parents/${p.id}/supprimer" class="row-between"><span><span class="strong">${esc(p.name)}</span> <span class="muted">${esc(p.phone)}${p.opted_out ? ' · a demandé STOP' : ''}</span></span><button class="btn-text">Retirer</button></form>`).join('')}
    <form method="post" action="/famille/parents" class="stack-s">
      <div class="grid-2"><label class="field">Prénom<input name="name" required maxlength="30"></label>
      <label class="field">Téléphone<input name="phone" required inputmode="tel" placeholder="06…"></label></div>
      <button class="btn btn-secondary">Ajouter</button>
    </form>
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
      <select name="coparentId">${coparents.map((p) => `<option value="${p.id}" ${String(v.coparentId) === String(p.id) ? 'selected' : ''}>${esc(p.name)} · par SMS</option>`).join('')}</select>
    </label>
    <fieldset class="fs"><legend>À prévoir</legend>
      <div class="chips">${SUGGESTED_ITEMS.map((i) => `<label class="chip"><input type="checkbox" name="items" value="${esc(i)}" ${selectedItems.includes(i) ? 'checked' : ''}><span>${esc(i)}</span></label>`).join('')}</div>
      <label class="field">Autre chose<input name="items" maxlength="80" value="${esc(extra)}" placeholder="Séparez par des virgules"></label>
      <p class="fine">Les informations de santé (médicaments, traitement…) ne sont jamais envoyées par SMS.</p>
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
  <p class="muted">Un SMS court, signé de votre prénom. ${esc(coparentName)} répond OUI ou NON, sans compte ni appli.</p>
  <section class="sms-box" aria-label="Aperçu du SMS"><p class="sms-bubble">${esc(text).replace(/\n/g, '<br>')}</p></section>
  ${privateItems.length ? `<p class="fine">Note privée, non envoyée : ${esc(privateItems.join(', '))}. Les informations de santé ne partent jamais par SMS.</p>` : ''}
  <p class="fine">Pas d'accusé de lecture : vous saurez seulement si ${esc(coparentName)} a répondu.</p>
  <form method="post" action="/changes" class="stack-s">${hidden}<button class="btn btn-primary btn-big">Envoyer</button></form>
  <form method="post" action="/changes/new" class="stack-s">${hidden}<button class="btn btn-secondary">Modifier</button></form>
</main>`);
}

export function changePage({ change, smsLog, flash }) {
  const c = change;
  const [label, cls] = STATUS[c.status];
  return layout(frDate(c.date), `
${header(frDate(c.date), '/')}
<main class="main">
  ${flashBox(flash)}
  <section class="status-card ${c.status === 'accepted' ? 'status-ok' : ''}" aria-label="Statut">
    <span class="badge ${cls}">${label}</span>
    <p class="status-title">${c.status === 'accepted' ? `${esc(c.coparent.name)} a confirmé`
      : c.status === 'counter' ? `${esc(c.coparent.name)} répond : ${esc(c.counter_label)}`
        : c.status === 'declined' ? `${esc(c.coparent.name)} ne peut pas`
          : `En attente de la réponse de ${esc(c.coparent.name)}`}</p>
    <p>${c.kind === 'pickup' ? 'Récupération' : 'Garde'} de ${esc(c.kidNames)}${c.time ? ` · ${esc(frTime(c.time))}` : ''}${c.place ? ` · ${esc(c.place)}` : ''}</p>
    ${c.items.length ? `<p>À prévoir : ${esc(c.items.join(', '))}</p>` : ''}
    ${c.privateItems.length ? `<p class="fine">Note privée (non envoyée par SMS) : ${esc(c.privateItems.join(', '))}</p>` : ''}
  </section>
  <section class="card stack-s" aria-label="Messages">
    <h2 class="h-section">Messages</h2>
    ${smsLog.map((m) => `<div class="log"><p class="fine">${m.direction === 'out' ? 'Envoyé' : 'Reçu'} · ${esc(m.created_at)} UTC${m.error ? ` · échec : ${esc(m.error)}` : ''}</p><p>${esc(m.body).replace(/\n/g, '<br>')}</p></div>`).join('')}
  </section>
  ${c.status === 'counter' && !c.isPast ? `<form method="post" action="/changes/${c.id}/accepter-proposition"><button class="btn btn-primary btn-big">Accepter : ${esc(c.counter_label)}</button></form>` : ''}
  ${c.coparent.opted_out ? `<p class="fine">${esc(c.coparent.name)} a demandé à ne plus recevoir de SMS : prévenez-le autrement.</p>` : ''}
  ${c.status !== 'cancelled' && !c.isPast ? `<form method="post" action="/changes/${c.id}/annuler"><button class="btn btn-secondary">Annuler ce changement</button></form>` : ''}
</main>`, { nav: 'home' });
}

// --- Page de réponse sans compte -------------------------------------------------
export function replyPage({ change, options, done, flash, optedOut = false }) {
  const c = change;
  const q = c.kind === 'pickup'
    ? `Pouvez-vous récupérer ${c.kidNames} ${frDate(c.date)} ?`
    : `Pouvez-vous garder ${c.kidNames} ${frDate(c.date)} ?`;
  return layout(q, `
<div class="urlbar">Aucun compte nécessaire</div>
<main class="main">
  <p class="muted">${esc(c.organizer.name)} vous demande</p>
  <h1 class="h-page h-xl">${esc(q)}</h1>
  <dl class="facts">
    ${c.time ? `<div><dt>Heure</dt><dd>${esc(frTime(c.time))}</dd></div>` : ''}
    ${c.place ? `<div><dt>Où</dt><dd>${esc(c.place)}</dd></div>` : ''}
    ${c.items.length ? `<div class="span-2"><dt>À prévoir</dt><dd>${esc(c.items.join(', '))}</dd></div>` : ''}
  </dl>
  ${flashBox(flash)}
  ${done || c.status !== 'pending'
    ? `<section class="status-card status-ok" role="status"><p class="status-title">${c.status === 'accepted' ? `Merci, ${esc(c.organizer.name)} est prévenue.` : 'Réponse envoyée.'}</p>
       <p>${c.status === 'accepted' && c.items.length ? 'Un rappel arrivera la veille au soir. Répondez STOP au SMS pour ne plus en recevoir.' : `${esc(c.organizer.name)} reçoit votre réponse par SMS.`}</p></section>`
    : `<form method="post" action="/r/${esc(c.token)}" class="stack-s">
        <button name="answer" value="yes" class="btn btn-primary btn-big">Oui, c'est noté</button>
        <fieldset class="fs"><legend>Ou proposer autre chose</legend>
          ${options.map((o) => `<button name="answer" value="${o.id}" class="btn btn-option">${esc(o.label.charAt(0).toUpperCase() + o.label.slice(1))}</button>`).join('')}
          <button name="answer" value="no" class="btn btn-option">Non, je ne peux pas</button>
        </fieldset>
      </form>`}
  <p class="fine">Deux Toits n'affiche que des informations pratiques. Pas de messagerie, pas de compte, pas de géolocalisation.</p>
  ${optedOut ? '' : `<form method="post" action="/r/${esc(c.token)}/stop"><button class="btn-text">Ne plus recevoir de SMS de Deux Toits</button></form>`}
</main>`);
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
  <p class="legend"><span class="sw sw-a">${ICON.houseRound}</span>Chez ${esc(week.org.name)} (le rond) <span class="sw sw-b">${ICON.houseSquare}</span>Chez l'autre parent (le carré)</p>
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

// --- Outil de test (mode console uniquement) --------------------------------------------
export function devSmsPage({ log, coparents }) {
  return layout('SMS simulés', `
${header('SMS simulés', '/')}
<main class="main">
  <p class="muted">Mode test : aucun SMS réel n'est envoyé. Simulez ici la réponse de l'autre parent.</p>
  <form method="post" action="/dev/sms" class="card stack-s">
    <label class="field">Depuis le numéro de
      <select name="from">${coparents.map((p) => `<option value="${esc(p.phone)}">${esc(p.name)} (${esc(p.phone)})</option>`).join('')}</select>
    </label>
    <label class="field">Message<input name="body" required placeholder="OUI, NON, STOP…"></label>
    <button class="btn btn-primary">Simuler la réponse SMS</button>
  </form>
  ${log.map((m) => `<div class="card log"><p class="fine">${m.direction === 'out' ? '→' : '←'} ${esc(m.phone)} · ${esc(m.created_at)} UTC</p><p>${esc(m.body).replace(/\n/g, '<br>')}</p></div>`).join('')}
</main>`);
}

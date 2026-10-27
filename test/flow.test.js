import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { addDays, localParts, parseCode, splitItems } from '../src/util.js';

// Fournisseur de push factice : garde les notifications en mémoire. `gone` simule un appareil disparu (410).
const outbox = [];
const gone = new Set();
const fakePush = {
  name: 'fake', publicKey: 'cle-publique-de-test',
  async send(sub, payload) {
    if (gone.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    outbox.push({ endpoint: sub.endpoint, payload });
  }
};

let server, base, svc, db;
before(async () => {
  db = openDb(':memory:');
  ({ app: server, svc } = createApp({ db, push: fakePush, baseUrl: 'http://test.local' }));
  await new Promise((r) => { server = server.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Petit client qui garde le cookie de session.
function client() {
  let cookie = '';
  return async (path, { method = 'GET', form, json } = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(json ? { 'content-type': 'application/json' } : {}) },
      body: form ? new URLSearchParams(form) : json ? JSON.stringify(json) : undefined
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const pair = c.split(';')[0];
      if (pair.startsWith('dt_session=')) cookie = pair;
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
}

let n = 0;
const sub = (name = `d${++n}`) => ({ endpoint: `https://push.example/${name}`, keys: { p256dh: 'p256dh-' + name, auth: 'auth-' + name } });
const accessCodeOf = (html) => html.match(/class="code-big"[^>]*>([A-Z0-9-]+)</)[1];

// Ajoute un proche (rôle + code), puis le fait rejoindre via /j comme en vrai. Renvoie son id et le lien secret.
async function addAndJoin(orgClient, role) {
  await orgClient('/famille/parents', { method: 'POST', form: { role } });
  const row = db.prepare('SELECT id, claim_code FROM coparents WHERE claim_code IS NOT NULL ORDER BY id DESC').get();
  const r = await client()('/j', { method: 'POST', form: { code: row.claim_code } });
  assert.equal(r.status, 302);
  const token = r.location.match(/^\/m\/([\w-]+)\?bienvenue=1$/)[1];
  return { id: row.id, token, url: `/m/${token}` };
}
async function signup(role) {
  const c = client();
  const r = await c('/signup', { method: 'POST', form: { role } });
  assert.equal(r.status, 200);
  return { c, code: accessCodeOf(r.text), id: db.prepare('SELECT MAX(id) AS id FROM organizers').get().id };
}

test('utilitaires : santé, codes', () => {
  const { items, privateItems } = splitItems(['Kimono', 'Ventoline', 'médicament du soir', ' ']);
  assert.deepEqual(items, ['Kimono']);
  assert.deepEqual(privateItems, ['Ventoline', 'médicament du soir']);
  assert.equal(parseCode('abcd-efgh', 8), 'ABCDEFGH');
  assert.equal(parseCode('abcd efgh', 8), 'ABCDEFGH');
  assert.equal(parseCode('OUI', 8), null);
  assert.equal(parseCode('ABCD-EFG0', 8), null); // 0 absent de l'alphabet
});

test('parcours complet : changement, notification, réponse par la page et par le bouton, rappel', async () => {
  const { c: claire, id: claireId } = await signup('Maman');
  await claire('/famille/enfants', { method: 'POST', form: { name: 'Léo' } });
  const papa = await addAndJoin(claire, 'Papa');
  const papaPage = client();
  assert.equal((await papaPage(`${papa.url}/push`, { method: 'POST', json: sub('papa') })).status, 204);
  assert.equal((await claire('/push', { method: 'POST', json: sub('maman') })).status, 204);
  outbox.length = 0;

  const kid = db.prepare('SELECT id FROM children WHERE organizer_id = ?').get(claireId);
  const { date: today } = localParts();
  const form = { kind: 'pickup', childIds: String(kid.id), date: addDays(today, 1), time: '16:30', place: 'école Jules-Verne', coparentId: String(papa.id), items: 'Kimono, Ventoline' };

  // Aperçu : rien n'est envoyé, la santé n'apparaît pas.
  let r = await claire('/changes/preview', { method: 'POST', form });
  assert.equal(r.status, 200);
  const bubble = r.text.match(/<p class="sms-bubble">([\s\S]*?)<\/p>/)[1];
  assert.match(bubble, /peux-tu récupérer Léo/);
  assert.doesNotMatch(bubble, /Ventoline/);
  assert.match(r.text, /Note privée, non envoyée : Ventoline/);
  assert.equal(outbox.length, 0);

  // Envoi : une notification pour l'appareil de Papa, sans la Ventoline, avec les boutons Oui/Non.
  r = await claire('/changes', { method: 'POST', form });
  assert.equal(r.status, 302);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].endpoint, 'https://push.example/papa');
  assert.match(outbox[0].payload.title, /^Maman : peux-tu récupérer Léo/);
  assert.equal(outbox[0].payload.body, 'À prévoir : Kimono.');
  assert.deepEqual(outbox[0].payload.actions.map((a) => a.action), ['yes', 'no']);
  assert.doesNotMatch(JSON.stringify(outbox[0].payload), /Ventoline/);
  const changeId = outbox[0].payload.changeId;

  // La page personnelle montre la demande et propose d'autres options.
  r = await papaPage(papa.url);
  assert.equal(r.status, 200);
  assert.match(r.text, /Peux-tu récupérer Léo/);
  assert.match(r.text, /17 h/);

  // Papa propose 17 h : Maman est notifiée.
  r = await papaPage(`${papa.url}/changes/${changeId}/answer`, { method: 'POST', form: { answer: 't30' } });
  assert.equal(r.status, 302);
  assert.equal(outbox.length, 2);
  assert.equal(outbox[1].endpoint, 'https://push.example/maman');
  assert.match(outbox[1].payload.title, /Papa répond « oui, mais à 17 h »/);
  // Une seconde réponse n'est plus possible.
  await papaPage(`${papa.url}/changes/${changeId}/answer`, { method: 'POST', form: { answer: 'yes' } });
  assert.equal(outbox.length, 2);

  // Nouveau changement, accepté cette fois par le bouton de la notification (réponse JSON).
  await claire('/changes', { method: 'POST', form });
  assert.equal(outbox.length, 3);
  const id2 = outbox[2].payload.changeId;
  r = await papaPage(`${papa.url}/changes/${id2}/answer`, { method: 'POST', json: { answer: 'yes' } });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.text).ok, true);
  assert.equal(outbox.length, 4);
  assert.match(outbox[3].payload.title, /Papa a répondu OUI/);

  // Rappel de la veille : envoyé une fois après 19 h, sans la Ventoline.
  const sent = await svc.runReminders(new Date(Date.parse(today + 'T19:30:00Z')));
  assert.equal(sent, 1);
  assert.match(outbox[4].payload.title, /^Rappel de Maman : demain/);
  assert.match(outbox[4].payload.body, /À prévoir : Kimono\./);
  assert.doesNotMatch(JSON.stringify(outbox[4].payload), /Ventoline/);
  assert.equal(await svc.runReminders(new Date(Date.parse(today + 'T19:40:00Z'))), 0);

  // L'accueil, la page du changement et la feuille à imprimer s'affichent.
  r = await claire('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /Cette semaine/);
  r = await claire(`/changes/${id2}`);
  assert.match(r.text, /Papa a répondu OUI/);
  r = await claire('/semaine/imprimer?nb=1');
  assert.match(r.text, /print-bw/);
});

test('sans appareil abonné : le changement existe et la page du proche le montre', async () => {
  const { c, id } = await signup('Maman');
  await c('/famille/enfants', { method: 'POST', form: { name: 'Ana' } });
  const mamie = await addAndJoin(c, 'Mamie');
  const kid = db.prepare('SELECT id FROM children WHERE organizer_id = ?').get(id);
  const before = outbox.length;
  const r = await c('/changes', { method: 'POST', form: { kind: 'swap', childIds: String(kid.id), date: addDays(localParts().date, 2), coparentId: String(mamie.id), items: '' } });
  assert.equal(r.status, 302);
  assert.equal(outbox.length, before);
  const log = db.prepare('SELECT * FROM notif_log ORDER BY id DESC').get();
  assert.equal(log.delivered, 0);
  assert.match(log.error, /aucun appareil/);
  assert.match((await client()(mamie.url)).text, /Peux-tu garder Ana/);
});

test('isolation : comptes et pages personnelles sont cloisonnés', async () => {
  const other = await signup('Papa');
  assert.equal((await other.c('/changes/1')).status, 404);
  const anon = client();
  assert.equal((await anon('/')).location, '/login');
  assert.equal((await anon('/m/inexistant-inexistant-inexistant')).status, 404);
  assert.equal((await anon('/push', { method: 'POST', json: sub() })).status, 302); // non connecté : renvoyé à la connexion

  // Un proche ne peut pas répondre à la demande d'un autre.
  const mine = await addAndJoin(other.c, 'Maman');
  const first = db.prepare('SELECT id FROM changes ORDER BY id LIMIT 1').get();
  assert.equal((await client()(`${mine.url}/changes/${first.id}/answer`, { method: 'POST', form: { answer: 'yes' } })).status, 404);
});

test('corrections de la revue : dates, santé, contre-proposition, annulation, appareil disparu', async () => {
  const { c: nina, id: orgId } = await signup('Maman');
  await nina('/famille/enfants', { method: 'POST', form: { name: 'Zoé' } });
  const hugo = await addAndJoin(nina, 'Papa');
  const hugoPage = client();
  await hugoPage(`${hugo.url}/push`, { method: 'POST', json: sub('hugo') });
  const kid = db.prepare('SELECT id FROM children WHERE organizer_id = ?').get(orgId);
  const { date: today } = localParts();
  const base = { kind: 'pickup', childIds: String(kid.id), time: '17:00', coparentId: String(hugo.id), items: 'Flûte' };

  // Dates impossibles ou passées refusées, sans rien envoyer.
  const before = outbox.length;
  for (const date of ['2026-02-30', '2026-13-45', addDays(today, -1)]) {
    assert.equal((await nina('/changes', { method: 'POST', form: { ...base, date } })).status, 400, date);
  }
  assert.equal(outbox.length, before);

  // Un lieu de santé n'apparaît pas dans la notification.
  const r = await nina('/changes', { method: 'POST', form: { ...base, date: addDays(today, 3), place: 'chez le pédiatre' } });
  assert.equal(r.status, 302);
  const ask = outbox.at(-1).payload;
  assert.doesNotMatch(JSON.stringify(ask), /pédiatre/);

  // Contre-proposition puis acceptation par l'organisatrice : l'heure change.
  await hugoPage(`${hugo.url}/changes/${ask.changeId}/answer`, { method: 'POST', form: { answer: 't60' } });
  assert.equal(db.prepare('SELECT status FROM changes WHERE id = ?').get(ask.changeId).status, 'counter');
  await nina(`/changes/${ask.changeId}/accepter-proposition`, { method: 'POST' });
  const after = db.prepare('SELECT * FROM changes WHERE id = ?').get(ask.changeId);
  assert.equal(after.status, 'accepted');
  assert.equal(after.time, '18:00');
  assert.match(outbox.at(-1).payload.title, /c'est d'accord/);

  // Annulation : le proche est prévenu.
  await nina(`/changes/${ask.changeId}/annuler`, { method: 'POST' });
  assert.match(outbox.at(-1).payload.title, /annulé/);

  // Appareil disparu (410) : oublié automatiquement.
  gone.add('https://push.example/hugo');
  await nina('/changes', { method: 'POST', form: { ...base, date: addDays(today, 4) } });
  assert.equal(svc.deviceCount('coparent', hugo.id), 0);
});

test('aucune donnée personnelle d\'adulte en base : ni colonne, ni valeur, ni secret en clair', async () => {
  for (const table of ['organizers', 'coparents']) {
    const cols = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((c) => c.name);
    for (const banned of ['name', 'email', 'phone', 'pass_hash', 'token']) assert.ok(!cols.includes(banned), `${table}.${banned}`);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%sms%' OR name LIKE '%optout%' OR name LIKE '%opt_out%'").get().n, 0);

  // Un prénom n'est pas un rôle valable.
  const c = client();
  assert.equal((await c('/signup', { method: 'POST', form: { role: 'Marc' } })).status, 400);
  const s = await signup('Parent');
  await s.c('/famille/parents', { method: 'POST', form: { role: 'Marc' } });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM coparents WHERE role = 'Marc'").get().n, 0);

  // Ni le code d'accès ni le lien secret d'un proche ne sont stockés en clair.
  const papa = await addAndJoin(s.c, 'Papa');
  const dump = JSON.stringify(['organizers', 'coparents', 'sessions', 'notif_log'].map((t) => db.prepare(`SELECT * FROM ${t}`).all()));
  assert.ok(!dump.includes(s.code) && !dump.includes(s.code.replaceAll('-', '')), 'code d\'accès en clair');
  assert.ok(!dump.includes(papa.token), 'lien secret en clair');
  assert.doesNotMatch(dump, /@/);
});

test('connexion par code d\'accès, renouvellement qui invalide l\'ancien', async () => {
  const { c, code: first } = await signup('Papa');
  const login = (code) => client()('/login', { method: 'POST', form: { code } });
  assert.equal((await login(first)).status, 302);
  assert.equal((await login(first.toLowerCase().replaceAll('-', ' '))).status, 302); // saisie tolérante
  assert.equal((await login('AAAA-AAAA-AAAA')).status, 401);

  const second = accessCodeOf((await c('/compte/code', { method: 'POST' })).text);
  assert.notEqual(first, second);
  assert.equal((await login(first)).status, 401);
  assert.equal((await login(second)).status, 302);
});

test('invitation : QR code, usage unique, expiration, nouveau code, départ', async () => {
  const org = (await signup('Maman')).c;
  await org('/famille/enfants', { method: 'POST', form: { name: 'Lou' } });
  await org('/famille/parents', { method: 'POST', form: { role: 'Mamie' } });
  await org('/famille/parents', { method: 'POST', form: { role: 'Mamie' } }); // même rôle : « Mamie 2 »
  const rows = db.prepare('SELECT * FROM coparents WHERE claim_code IS NOT NULL ORDER BY id DESC LIMIT 2').all().reverse();
  assert.deepEqual(rows.map((r) => r.role), ['Mamie', 'Mamie 2']);
  const [mamie, mamie2] = rows;

  // La page Famille montre un vrai QR code (SVG local) et le code, mais pas le lien en clair.
  let r = await org('/famille');
  assert.match(r.text, /<svg[^>]*viewBox/);
  assert.ok(r.text.includes(`${mamie.claim_code.slice(0, 4)}-${mamie.claim_code.slice(4)}`));
  assert.ok(!r.text.includes(`/j/${mamie.claim_code}`));

  // Envoyer à quelqu'un qui n'a pas encore rejoint : refusé, rien ne part.
  const kid = db.prepare('SELECT id FROM children WHERE organizer_id = (SELECT organizer_id FROM coparents WHERE id = ?)').get(mamie.id);
  const form = { kind: 'pickup', childIds: String(kid.id), date: addDays(localParts().date, 2), time: '17:00', coparentId: String(mamie.id), items: '' };
  const before = outbox.length;
  r = await org('/changes', { method: 'POST', form });
  assert.equal(r.status, 400);
  assert.match(r.text, /pas encore rejoint/);
  assert.equal(outbox.length, before);

  // Le lien du QR affiche le rôle ; un mauvais code échoue ; rien n'est consommé par un simple affichage.
  const anon = client();
  r = await anon(`/j/${mamie.claim_code}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Vous êtes « Mamie »/);
  assert.equal((await anon('/j', { method: 'POST', form: { code: 'ZZZZ-ZZZZ' } })).status, 400);
  assert.equal((await anon(`/j/${mamie.claim_code}`)).status, 200);

  // Rejoindre : page personnelle, code effacé, usage unique.
  r = await anon('/j', { method: 'POST', form: { code: mamie.claim_code } });
  assert.equal(r.status, 302);
  const token = r.location.match(/^\/m\/([\w-]+)/)[1];
  assert.equal(db.prepare('SELECT claim_code FROM coparents WHERE id = ?').get(mamie.id).claim_code, null);
  assert.equal((await client()('/j', { method: 'POST', form: { code: mamie.claim_code } })).status, 400);
  r = await anon(`/m/${token}?bienvenue=1`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Vous êtes Mamie/);
  assert.match(r.text, /Gardez cette page/);

  // Le service worker et le manifeste sont servis sous la page, avec la portée du proche seul.
  r = await anon(`/m/${token}/manifest.webmanifest`);
  assert.equal(JSON.parse(r.text).scope, './');
  assert.match((await anon(`/m/${token}/sw.js`)).text, /addEventListener\('push'/);
  assert.equal((await anon('/m/jetonquinexistepasdutout/sw.js')).status, 404);

  // Appareil abonné, puis départ : page et appareils oubliés, lien mort.
  await anon(`/m/${token}/push`, { method: 'POST', json: sub('mamie') });
  assert.equal((await anon(`/m/${token}/push`, { method: 'POST', json: { endpoint: 'http://non-securise/x', keys: { p256dh: 'a', auth: 'b' } } })).status, 400);
  assert.equal(svc.deviceCount('coparent', mamie.id), 1);
  await anon(`/m/${token}/leave`, { method: 'POST' });
  assert.equal(svc.deviceCount('coparent', mamie.id), 0);
  assert.equal((await anon(`/m/${token}`)).status, 404);

  // Code expiré.
  db.prepare("UPDATE coparents SET claim_expires_at = datetime('now', '-1 minute') WHERE id = ?").run(mamie2.id);
  assert.equal((await anon(`/j/${mamie2.claim_code}`)).status, 404);
  assert.equal((await anon('/j', { method: 'POST', form: { code: mamie2.claim_code } })).status, 400);

  // Nouveau code : la nouvelle personne rejoint, l'ancienne page cesse de marcher.
  await org(`/famille/parents/${mamie2.id}/code`, { method: 'POST' });
  const fresh = db.prepare('SELECT claim_code FROM coparents WHERE id = ?').get(mamie2.id).claim_code;
  const joined = await anon('/j', { method: 'POST', form: { code: fresh } });
  const token2 = joined.location.match(/^\/m\/([\w-]+)/)[1];
  await anon(`/m/${token2}/push`, { method: 'POST', json: sub('mamie2') });
  await org(`/famille/parents/${mamie2.id}/code`, { method: 'POST' });
  assert.equal((await anon(`/m/${token2}`)).status, 404);
  assert.equal(svc.deviceCount('coparent', mamie2.id), 0);
});

test('ancienne base (prénoms, e-mails, numéros) : refus explicite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-legacy-'));
  const { DatabaseSync } = await import('node:sqlite');
  for (const [i, cols] of ['name TEXT, email TEXT', 'role TEXT, phone TEXT'].entries()) {
    const file = path.join(dir, `old${i}.sqlite`);
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE organizers (id INTEGER PRIMARY KEY, ${cols})`);
    old.close();
    assert.throws(() => openDb(file), /ancien format/);
  }
  fs.rmSync(dir, { recursive: true });
});

test('heure de rappel invalide refusée au démarrage', async () => {
  const { createService } = await import('../src/service.js');
  assert.throws(() => createService({ db, push: fakePush, reminderHour: '25:00' }));
  assert.doesNotThrow(() => createService({ db, push: fakePush, reminderHour: '9:00' }));
});

test('enfant : QR et code, calendrier en lecture seule limité à ce qui le concerne', async () => {
  const { c: org, id: orgId } = await signup('Maman');
  const { date: today } = localParts();
  await org('/famille/rythme', { method: 'POST', form: { rhythm_start: today } });
  await org('/famille/enfants', { method: 'POST', form: { name: 'Léo' } });
  await org('/famille/enfants', { method: 'POST', form: { name: 'Mia' } });
  const [leo, mia] = db.prepare("SELECT * FROM children WHERE organizer_id = ? ORDER BY name").all(orgId).sort((a) => (a.name === 'Léo' ? -1 : 1));
  assert.ok(leo.claim_code && mia.claim_code);
  const papa = await addAndJoin(org, 'Papa');
  await client()(`${papa.url}/push`, { method: 'POST', json: sub('papa-kids') });

  // Chaque enfant a son QR code sur la page Famille.
  let r = await org('/famille');
  assert.equal((r.text.match(/aria-label="QR code d'invitation pour (Léo|Mia)"/g) || []).length, 2); // Papa a déjà rejoint
  assert.equal((r.text.match(/<svg[^>]*viewBox/g) || []).length >= 2, true);
  assert.ok(r.text.includes(`${leo.claim_code.slice(0, 4)}-${leo.claim_code.slice(4)}`));

  // Léo : changement accepté avec une affaire à prévoir et une note de santé ; Mia : un autre changement.
  const make = async (kid, extra) => {
    await org('/changes', { method: 'POST', form: { kind: 'pickup', childIds: String(kid.id), date: addDays(today, 2), time: '17:00', coparentId: String(papa.id), ...extra } });
    const id = outbox.at(-1).payload.changeId;
    await client()(`${papa.url}/changes/${id}/answer`, { method: 'POST', json: { answer: 'yes' } });
    return id;
  };
  await make(leo, { items: 'Kimono, Ventoline' });
  await make(mia, { items: 'Flûte' });
  // Une demande encore en attente n'apparaît pas chez l'enfant.
  await org('/changes', { method: 'POST', form: { kind: 'pickup', childIds: String(leo.id), date: addDays(today, 3), time: '09:00', coparentId: String(papa.id), items: 'Maillot de bain' } });

  // Léo rejoint avec son code : il arrive sur SA page, pas sur celle d'un proche.
  const kid = client();
  r = await kid('/j', { method: 'POST', form: { code: leo.claim_code } });
  assert.equal(r.status, 302);
  assert.match(r.location, /^\/e\/[\w-]+\?bienvenue=1$/);
  const url = r.location.split('?')[0];
  assert.equal(db.prepare('SELECT claim_code FROM children WHERE id = ?').get(leo.id).claim_code, null);
  assert.equal((await client()('/j', { method: 'POST', form: { code: leo.claim_code } })).status, 400);

  r = await kid(`${url}?bienvenue=1`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Bonjour Léo/);
  assert.match(r.text, /Chez Maman/);
  assert.match(r.text, /Kimono/);
  assert.doesNotMatch(r.text, /Ventoline/);        // santé : jamais
  assert.doesNotMatch(r.text, /Flûte/);            // changement d'une autre enfant
  assert.doesNotMatch(r.text, /Maillot de bain/);  // pas encore confirmé
  assert.doesNotMatch(r.text, /Mia/);
  assert.equal((r.text.match(/class="day"/g) || []).length, 14);
  assert.match((await kid(`${url}/manifest.webmanifest`)).text, /"scope":"\.\/"/);

  // Les liens ne se mélangent pas : page enfant ≠ page proche, et l'enfant ne peut rien modifier.
  const kidToken = url.split('/')[2];
  assert.equal((await client()(`/m/${kidToken}`)).status, 404);
  assert.equal((await client()(`/e/${papa.token}`)).status, 404);
  assert.equal((await kid(`${url}/changes/1/answer`, { method: 'POST', form: { answer: 'no' } })).status, 404);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM children').all()).includes(kidToken), 'lien enfant en clair');

  // Départ puis nouveau code : l'ancien lien meurt.
  await kid(`${url}/leave`, { method: 'POST' });
  assert.equal((await kid(url)).status, 404);
  r = await org('/famille');
  assert.match(r.text, /a quitté/);
  await org(`/famille/enfants/${leo.id}/code`, { method: 'POST' });
  assert.ok(db.prepare('SELECT claim_code FROM children WHERE id = ?').get(leo.id).claim_code);
});

test('base existante sans pages enfants : colonnes ajoutées sans perte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-migr-'));
  const file = path.join(dir, 'prev.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE organizers (id INTEGER PRIMARY KEY, role TEXT NOT NULL, access_hash TEXT NOT NULL UNIQUE);" +
    "CREATE TABLE children (id INTEGER PRIMARY KEY, organizer_id INTEGER NOT NULL, name TEXT NOT NULL);" +
    "INSERT INTO organizers (role, access_hash) VALUES ('Maman', 'h'); INSERT INTO children (organizer_id, name) VALUES (1, 'Léo')");
  old.close();
  const migrated = openDb(file);
  assert.equal(migrated.prepare('SELECT name, claim_code FROM children').get().name, 'Léo');
  assert.doesNotThrow(() => migrated.prepare('UPDATE children SET claim_code = ?').run('ABCDEFGH'));
  migrated.close();
  fs.rmSync(dir, { recursive: true });
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { addDays, localParts, normalizePhone, splitItems } from '../src/util.js';

// Fournisseur SMS factice qui garde les messages en mémoire.
const outbox = [];
const fakeSms = { name: 'fake', canReceive: true, async send(to, body) { outbox.push({ to, body }); return { id: 'x' + outbox.length }; } };

let server, base, svc, db;
before(async () => {
  db = openDb(':memory:');
  ({ app: server, svc } = createApp({ db, sms: fakeSms, baseUrl: 'http://test.local' }));
  await new Promise((r) => { server = server.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const base_url = () => base;

// Petit client qui garde le cookie de session.
function client() {
  let cookie = '';
  return async (path, { method = 'GET', form } = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form) : undefined
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) {
      const pair = c.split(';')[0];
      if (pair.startsWith('dt_session=')) cookie = pair;
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
}

test('utilitaires : téléphone, santé', () => {
  assert.equal(normalizePhone('06 12 34 56 78'), '+33612345678');
  assert.equal(normalizePhone('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(normalizePhone('12'), null);
  const { items, privateItems } = splitItems(['Kimono', 'Ventoline', 'médicament du soir', ' ']);
  assert.deepEqual(items, ['Kimono']);
  assert.deepEqual(privateItems, ['Ventoline', 'médicament du soir']);
});

test('lecture des réponses SMS', () => {
  assert.equal(svc.parseReply('oui'), 'yes');
  assert.equal(svc.parseReply(' Ok. '), 'yes');
  assert.equal(svc.parseReply("d'accord"), 'yes');
  assert.equal(svc.parseReply('Non'), 'no');
  assert.equal(svc.parseReply('stop'), 'stop');
  assert.equal(svc.parseReply('Arrêt'), 'stop');
  assert.equal(svc.parseReply('peut-être mercredi'), null);
});

test('parcours complet : changement, SMS, réponse par lien, réponse SMS, STOP, rappel', async () => {
  const claire = client();
  let r = await claire('/signup', { method: 'POST', form: { name: 'Claire', phone: '06 11 11 11 11', email: 'claire@example.fr', password: 'motdepasse1' } });
  assert.equal(r.status, 302);
  await claire('/famille/enfants', { method: 'POST', form: { name: 'Léo' } });
  await claire('/famille/parents', { method: 'POST', form: { name: 'Marc', phone: '07 22 22 22 22' } });
  const kid = db.prepare('SELECT id FROM children').get();
  const marc = db.prepare('SELECT id FROM coparents').get();

  const { date: today } = localParts();
  const tomorrow = addDays(today, 1);
  const form = { kind: 'pickup', childIds: String(kid.id), date: tomorrow, time: '16:30', place: 'école Jules-Verne', coparentId: String(marc.id), items: 'Kimono, Ventoline' };

  // Aperçu : rien n'est envoyé, la santé n'apparaît pas.
  r = await claire('/changes/preview', { method: 'POST', form });
  assert.equal(r.status, 200);
  const bubble = r.text.match(/<p class="sms-bubble">([\s\S]*?)<\/p>/)[1];
  assert.match(bubble, /peux-tu récupérer Léo/);
  assert.doesNotMatch(bubble, /Ventoline/);
  assert.match(r.text, /Note privée, non envoyée : Ventoline/);
  assert.equal(outbox.length, 0);

  // Envoi.
  r = await claire('/changes', { method: 'POST', form });
  assert.equal(r.status, 302);
  assert.equal(outbox.length, 1);
  const sms1 = outbox[0];
  assert.equal(sms1.to, '+33722222222');
  assert.match(sms1.body, /^Claire : peux-tu récupérer Léo/);
  assert.match(sms1.body, /À prévoir : Kimono\./);
  assert.match(sms1.body, /Réponds OUI ou NON/);
  assert.match(sms1.body, /STOP/);
  assert.doesNotMatch(sms1.body, /Ventoline/);
  const token = sms1.body.match(/\/r\/([\w-]+)/)[1];

  // La page sans compte s'ouvre et propose d'autres options.
  const anon = client();
  r = await anon(`/r/${token}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Pouvez-vous récupérer Léo/);
  assert.match(r.text, /17 h/);

  // Marc propose 17 h : Claire reçoit un SMS.
  r = await anon(`/r/${token}`, { method: 'POST', form: { answer: 't30' } });
  assert.equal(r.status, 200);
  assert.equal(outbox.length, 2);
  assert.equal(outbox[1].to, '+33611111111');
  assert.match(outbox[1].body, /Marc répond « oui, mais à 17 h »/);
  // Une seconde réponse n'est plus possible.
  r = await anon(`/r/${token}`, { method: 'POST', form: { answer: 'yes' } });
  assert.equal(outbox.length, 2);

  // Nouveau changement, cette fois accepté par SMS « oui ».
  r = await claire('/changes', { method: 'POST', form });
  assert.equal(outbox.length, 3);
  const res = await svc.handleInbound('+33722222222', 'Oui');
  assert.equal(res.action, 'yes');
  assert.equal(outbox.length, 4);
  assert.match(outbox[3].body, /Marc a répondu OUI/);

  // Rappel de la veille : envoyé une fois après 19 h, sans la Ventoline.
  const at = (hhmm) => new Date(`${today}T${hhmm}:00+02:00`);
  // On force l'heure locale via le calcul de localParts : 21 h à Paris est toujours après 19 h.
  const sent = await svc.runReminders(new Date(Date.parse(today + 'T19:30:00Z')));
  assert.equal(sent, 1);
  assert.match(outbox[4].body, /^Rappel de Claire : demain/);
  assert.match(outbox[4].body, /À prévoir : Kimono\./);
  assert.doesNotMatch(outbox[4].body, /Ventoline/);
  assert.equal(await svc.runReminders(new Date(Date.parse(today + 'T19:40:00Z'))), 0);
  void at;

  // STOP : plus aucun SMS pour Marc.
  const stop = await svc.handleInbound('07 22 22 22 22', 'STOP');
  assert.equal(stop.action, 'stop');
  r = await claire('/changes', { method: 'POST', form });
  assert.equal(outbox.length, 5);
  const last = db.prepare('SELECT * FROM changes ORDER BY id DESC').get();
  r = await claire(`/changes/${last.id}`);
  assert.match(r.text, /En attente/);

  // L'accueil et la feuille à imprimer s'affichent.
  r = await claire('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /Cette semaine/);
  r = await claire('/semaine/imprimer?nb=1');
  assert.equal(r.status, 200);
  assert.match(r.text, /print-bw/);
});

test('isolation : un autre organisateur ne voit pas les changements de Claire', async () => {
  const other = client();
  await other('/signup', { method: 'POST', form: { name: 'Paul', phone: '06 33 33 33 33', email: 'paul@example.fr', password: 'motdepasse2' } });
  const r = await other('/changes/1');
  assert.equal(r.status, 404);
  const anon = client();
  assert.equal((await anon('/')).location, '/login');
  assert.equal((await anon('/r/inexistant')).status, 404);
});

test('corrections de la revue : dates, santé, webhook, STOP durable, réponses ciblées, contre-proposition', async () => {
  const nina = client();
  await nina('/signup', { method: 'POST', form: { name: 'Nina', phone: '06 44 44 44 44', email: 'nina@example.fr', password: 'motdepasse3' } });
  await nina('/famille/enfants', { method: 'POST', form: { name: 'Zoé' } });
  await nina('/famille/parents', { method: 'POST', form: { name: 'Hugo', phone: '07 55 55 55 55' } });
  const org = db.prepare("SELECT id FROM organizers WHERE email = 'nina@example.fr'").get();
  const kid = db.prepare('SELECT id FROM children WHERE organizer_id = ?').get(org.id);
  const hugo = db.prepare('SELECT id FROM coparents WHERE organizer_id = ?').get(org.id);
  const { date: today } = localParts();
  const base = { kind: 'pickup', childIds: String(kid.id), time: '17:00', coparentId: String(hugo.id), items: 'Flûte' };

  // Dates impossibles ou passées refusées, sans rien envoyer.
  const before = outbox.length;
  for (const date of ['2026-02-30', '2026-13-45', addDays(today, -1)]) {
    const r = await nina('/changes', { method: 'POST', form: { ...base, date } });
    assert.equal(r.status, 400, date);
  }
  assert.equal(outbox.length, before);

  // Un lieu de santé n'apparaît pas dans le SMS.
  let r = await nina('/changes', { method: 'POST', form: { ...base, date: addDays(today, 3), place: 'chez le pédiatre' } });
  assert.equal(r.status, 302);
  const ask = outbox.at(-1);
  assert.doesNotMatch(ask.body, /pédiatre/);

  // Le webhook n'existe pas sans Twilio.
  const res = await fetch(base_url() + '/webhooks/sms/twilio', { method: 'POST', body: new URLSearchParams({ From: '+33755555555', Body: 'OUI' }) });
  assert.equal(res.status, 404);

  // Contre-proposition puis acceptation par l'organisatrice : l'heure change.
  const token = ask.body.match(/\/r\/([\w-]+)/)[1];
  r = await client()(`/r/${token}`, { method: 'POST', form: { answer: 't60' } });
  const change = db.prepare('SELECT * FROM changes WHERE token = ?').get(token);
  assert.equal(change.status, 'counter');
  r = await nina(`/changes/${change.id}/accepter-proposition`, { method: 'POST' });
  const after = db.prepare('SELECT * FROM changes WHERE id = ?').get(change.id);
  assert.equal(after.status, 'accepted');
  assert.equal(after.time, '18:00');
  assert.match(outbox.at(-1).body, /c'est d'accord/);

  // « ok » après un SMS qui n'était pas une question n'accepte rien.
  r = await nina('/changes', { method: 'POST', form: { ...base, date: addDays(today, 4) } });
  const pending = db.prepare("SELECT * FROM changes WHERE organizer_id = ? AND status = 'pending'").get(org.id);
  await nina(`/changes/${change.id}/annuler`, { method: 'POST' }); // dernier SMS reçu par Hugo = annulation
  const reply = await svc.handleInbound('+33755555555', 'ok');
  assert.equal(reply.action, 'unknown');
  assert.match(reply.reply, /\/r\//);
  assert.equal(db.prepare('SELECT status FROM changes WHERE id = ?').get(pending.id).status, 'pending');

  // STOP survit à la suppression puis au rajout du parent.
  await svc.handleInbound('+33755555555', 'STOP');
  await nina(`/famille/parents/${hugo.id}/supprimer`, { method: 'POST' });
  await nina('/famille/parents', { method: 'POST', form: { name: 'Hugo', phone: '07 55 55 55 55' } });
  const hugo2 = db.prepare('SELECT id FROM coparents WHERE organizer_id = ?').get(org.id);
  const n = outbox.length;
  await nina('/changes', { method: 'POST', form: { ...base, coparentId: String(hugo2.id), date: addDays(today, 5) } });
  assert.equal(outbox.length, n);
});

test('heure de rappel invalide refusée au démarrage', async () => {
  const { createService } = await import('../src/service.js');
  assert.throws(() => createService({ db, sms: fakeSms, baseUrl: 'x', reminderHour: '25:00' }));
  assert.doesNotThrow(() => createService({ db, sms: fakeSms, baseUrl: 'x', reminderHour: '9:00' }));
});

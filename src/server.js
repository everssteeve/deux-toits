import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createPushProvider } from './push.js';
import { createService, UserError } from './service.js';
import QRCode from 'qrcode';
import {
  ACCESS_LENGTH, ROLES, groupCode, hashCode, isRole, isValidDate, localParts, newCode, newToken, parseCode, splitItems
} from './util.js';
import * as V from './views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ db, push, baseUrl }) {
  const svc = createService({ db, push });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-Robots-Tag', 'noindex');
    next();
  });

  // --- Sessions (cookie httpOnly, SameSite=Lax) ---------------------------------
  const COOKIE = 'dt_session';
  const secure = baseUrl.startsWith('https://');
  function readCookie(req, name) {
    const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  }
  function startSession(res, organizerId) {
    const token = newToken(24);
    db.prepare(`INSERT INTO sessions (token, organizer_id, expires_at) VALUES (?, ?, datetime('now', '+60 days'))`).run(token, organizerId);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: 60 * 86400 * 1000, path: '/' });
  }
  app.use((req, res, next) => {
    const token = readCookie(req, COOKIE);
    if (token) {
      const row = db.prepare(`SELECT o.* FROM sessions s JOIN organizers o ON o.id = s.organizer_id
                              WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token);
      if (row) req.org = row;
    }
    req.flash = readCookie(req, 'dt_flash');
    if (req.flash) res.clearCookie('dt_flash');
    next();
  });
  const flash = (res, type, text) => res.cookie('dt_flash', JSON.stringify({ type, text }), { httpOnly: true, sameSite: 'lax', maxAge: 30000 });
  const parseFlash = (req) => { try { return req.flash ? JSON.parse(req.flash) : null; } catch { return null; } };
  const auth = (req, res, next) => (req.org ? next() : res.redirect('/login'));
  // Express 4 ne capture pas les promesses rejetées : on les renvoie au gestionnaire d'erreurs.
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // --- Comptes : un rôle, un numéro, un code d'accès. Ni nom, ni e-mail, ni mot de passe. -------------
  // Limite simple de tentatives (mémoire) : 10 essais par 15 min et par IP, pour la connexion et les codes d'invitation.
  const attempts = new Map();
  const tooMany = (key) => {
    const now = Date.now();
    const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60_000);
    attempts.set(key, a);
    return a.length >= 10;
  };
  const record = (key) => attempts.get(key).push(Date.now());
  const noStore = (res) => res.set('Cache-Control', 'no-store');

  // Crée un code d'accès neuf (seule son empreinte est gardée) ; il n'est montré qu'une fois.
  function issueAccessCode(organizerId) {
    for (let i = 0; ; i++) {
      const code = newCode(ACCESS_LENGTH);
      try {
        db.prepare('UPDATE organizers SET access_hash = ? WHERE id = ?').run(hashCode(code), organizerId);
        return groupCode(code);
      } catch (e) { // seule une empreinte déjà prise (improbable) justifie un nouveau tirage
        if (i >= 3 || !/UNIQUE/i.test(e.message)) throw e;
      }
    }
  }

  app.get('/signup', (req, res) => res.send(V.authPage({ mode: 'signup' })));
  app.post('/signup', (req, res) => {
    const role = String(req.body.role || '');
    const values = { role };
    if (!isRole(role)) return res.status(400).send(V.authPage({ mode: 'signup', error: 'Choisissez votre rôle dans la liste.', values }));
    const placeholder = hashCode(newToken(24)); // remplacé aussitôt par l'empreinte du vrai code
    const r = db.prepare('INSERT INTO organizers (role, access_hash) VALUES (?, ?)').run(role, placeholder);
    const id = Number(r.lastInsertRowid);
    const code = issueAccessCode(id);
    startSession(res, id);
    noStore(res).send(V.accessCodePage({ code, first: true }));
  });
  app.get('/login', (req, res) => res.send(V.authPage({ mode: 'login' })));
  app.post('/login', (req, res) => {
    const key = `ip:${req.ip}`;
    if (tooMany(key)) return res.status(429).send(V.authPage({ mode: 'login', error: 'Trop de tentatives. Réessayez dans 15 minutes.' }));
    const code = parseCode(req.body.code, ACCESS_LENGTH);
    const org = code && db.prepare('SELECT id FROM organizers WHERE access_hash = ?').get(hashCode(code));
    if (!org) {
      record(key);
      return res.status(401).send(V.authPage({ mode: 'login', error: 'Code d\'accès incorrect.' }));
    }
    startSession(res, org.id);
    res.redirect('/');
  });
  app.post('/logout', (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE);
    res.redirect('/login');
  });
  // Nouveau code d'accès (appareil perdu, code égaré) : l'ancien cesse de fonctionner, les autres sessions sont fermées.
  app.post('/compte/code', auth, (req, res) => {
    const code = issueAccessCode(req.org.id);
    db.prepare('DELETE FROM sessions WHERE organizer_id = ? AND token != ?').run(req.org.id, readCookie(req, COOKIE));
    noStore(res).send(V.accessCodePage({ code, first: false }));
  });

  // Appareils de l'organisateur abonnés aux notifications (Web Push).
  app.post('/push', auth, (req, res) => (svc.saveSubscription({ organizerId: req.org.id }, req.body) ? res.sendStatus(204) : res.sendStatus(400)));
  app.post('/push/delete', auth, (req, res) => { svc.removeSubscription({ organizerId: req.org.id }, req.body.endpoint); res.sendStatus(204); });

  // --- Invitation d'un proche : « cet appareil est ce rôle » ---------------------------------
  // Le lien (QR code en présentiel) contient le code ; sans lien, on tape le code sur /j. Aucun numéro, aucun nom.
  const joinPage = (res, status, { code = '', invitation = null, error }) =>
    noStore(res).status(status).send(V.joinPage({ code, invitation, error }));
  app.get('/j', (req, res) => joinPage(res, 200, {}));
  app.get('/j/:code', (req, res) => {
    const invitation = svc.findInvitation(req.params.code);
    if (!invitation) return joinPage(res, 404, { error: 'Ce code n\'est pas valable ou a expiré. Demandez-en un nouveau.' });
    joinPage(res, 200, { code: req.params.code, invitation });
  });
  app.post('/j', (req, res) => {
    const key = `ip:${req.ip}`;
    const code = String(req.body.code || '');
    if (tooMany(key)) return joinPage(res, 429, { code, error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    const r = svc.claim(code);
    if (!r.ok) {
      record(key);
      return joinPage(res, 400, { code, invitation: svc.findInvitation(code), error: 'Ce code n\'est pas valable ou a expiré.' });
    }
    // La page personnelle est le lien secret : à mettre en favori ou sur l'écran d'accueil.
    noStore(res).redirect(`/${r.kind === 'child' ? 'e' : 'm'}/${r.token}?bienvenue=1`);
  });

  // --- Page personnelle d'un proche : lien secret, aucun compte ---------------------------------
  const memberOf = (req, res, next) => {
    const member = svc.memberByToken(req.params.token);
    if (!member) return noStore(res).status(404).send(V.notFoundPage('Ce lien n\'est plus valable. Demandez un nouveau code à l\'organisateur.'));
    req.member = member;
    noStore(res);
    next();
  };
  const memberUrl = (req) => `/m/${req.params.token}`;
  app.get('/m/:token', memberOf, (req, res) => {
    const changes = svc.changesForMember(req.member.id).map((c) => ({ ...c, options: c.status === 'pending' ? svc.counterOptions(c) : [] }));
    res.send(V.memberPage({
      member: req.member, base: memberUrl(req), changes, flash: parseFlash(req),
      devices: svc.deviceCount('coparent', req.member.id), publicKey: push.publicKey,
      focus: Number(req.query.c) || null, welcome: req.query.bienvenue === '1'
    }));
  });
  app.post('/m/:token/changes/:id/answer', memberOf, wrap(async (req, res) => {
    const change = svc.getChange(Number(req.params.id));
    if (!change || change.coparent_id !== req.member.id) return res.status(404).send(V.notFoundPage());
    const r = await svc.respond(change, String(req.body.answer || ''));
    // Les boutons de la notification répondent en JSON ; la page, en formulaire.
    if (req.is('json')) return res.status(r.ok ? 200 : 409).json({ ok: r.ok, message: r.message });
    if (!r.ok) flash(res, 'error', r.message);
    else flash(res, 'ok', 'Réponse envoyée.');
    res.redirect(memberUrl(req));
  }));
  app.post('/m/:token/push', memberOf, (req, res) => (svc.saveSubscription({ coparentId: req.member.id }, req.body) ? res.sendStatus(204) : res.sendStatus(400)));
  app.post('/m/:token/push/delete', memberOf, (req, res) => { svc.removeSubscription({ coparentId: req.member.id }, req.body.endpoint); res.sendStatus(204); });
  app.post('/m/:token/leave', memberOf, (req, res) => {
    svc.leave(req.member.id);
    res.send(V.notFoundPage('C\'est fait : cette page et vos appareils sont oubliés. Plus aucune notification ne sera envoyée.').replace('Introuvable', 'Au revoir'));
  });
  // Le service worker et le manifeste sont servis sous la page : leur portée est la page du proche seule.
  app.get('/m/:token/sw.js', memberOf, (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
  });
  app.get('/m/:token/manifest.webmanifest', memberOf, (req, res) => {
    res.type('application/manifest+json').json({
      name: 'Deux Toits', short_name: 'Deux Toits', lang: 'fr', start_url: './', scope: './', display: 'standalone',
      background_color: '#F3F5F7', theme_color: '#0E6B6B', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
    });
  });

  // --- Accueil -------------------------------------------------------------------
  app.get('/', auth, (req, res) => {
    const { date: today } = localParts();
    const kids = db.prepare('SELECT * FROM children WHERE organizer_id = ?').all(req.org.id);
    const coparents = db.prepare('SELECT * FROM coparents WHERE organizer_id = ?').all(req.org.id);
    const recent = db.prepare(`SELECT id FROM changes WHERE organizer_id = ? AND status != 'cancelled' AND date >= ?
                               ORDER BY date LIMIT 10`).all(req.org.id, today).map((r) => svc.getChange(r.id));
    res.send(V.homePage({
      org: req.org, week: svc.week(req.org.id, today), recent,
      setupNeeded: !kids.length || !coparents.length, flash: parseFlash(req),
      noDevice: svc.deviceCount('organizer', req.org.id) === 0
    }));
  });

  // --- Famille -------------------------------------------------------------------
  app.get('/famille', auth, wrap(async (req, res) => {
    // QR codes générés ici, en SVG : le code d'invitation ne quitte jamais le serveur.
    const withInvite = async (row, devices) => {
      const link = row.claim_code ? `${baseUrl}/j/${row.claim_code}` : null;
      return {
        ...row, joined: !!row.page_hash, devices, link,
        codeLabel: row.claim_code ? groupCode(row.claim_code) : null,
        qr: link ? await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null
      };
    };
    const coparents = db.prepare('SELECT * FROM coparents WHERE organizer_id = ? ORDER BY id').all(req.org.id);
    const kids = db.prepare('SELECT * FROM children WHERE organizer_id = ? ORDER BY name').all(req.org.id);
    noStore(res).send(V.familyPage({
      org: req.org,
      kids: await Promise.all(kids.map((k) => withInvite(k, 0))),
      coparents: await Promise.all(coparents.map((p) => withInvite(p, svc.deviceCount('coparent', p.id)))), roles: ROLES, flash: parseFlash(req), joinUrl: `${baseUrl}/j`,
      devices: svc.deviceCount('organizer', req.org.id), publicKey: push.publicKey
    }));
  }));
  app.post('/famille/enfants', auth, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 30);
    if (name) svc.addChild(req.org.id, name);
    res.redirect('/famille');
  });
  app.post('/famille/enfants/:id/code', auth, (req, res) => {
    const ok = svc.renewClaim(req.org.id, Number(req.params.id), 'child');
    flash(res, ok ? 'ok' : 'error', ok ? 'Nouveau code créé. L\'ancienne page de l\'enfant est oubliée.' : 'Introuvable.');
    res.redirect('/famille');
  });
  app.post('/famille/enfants/:id/supprimer', auth, (req, res) => {
    db.prepare('DELETE FROM children WHERE id = ? AND organizer_id = ?').run(Number(req.params.id), req.org.id);
    res.redirect('/famille');
  });
  app.post('/famille/parents', auth, (req, res) => {
    const role = String(req.body.role || '');
    if (!isRole(role)) { flash(res, 'error', 'Choisissez un rôle dans la liste.'); return res.redirect('/famille'); }
    const added = svc.addCoparent(req.org.id, role);
    flash(res, 'ok', `${added.role} est ajouté. Montrez-lui son QR code ou donnez-lui son code : c'est lui qui rejoint, depuis son appareil.`);
    res.redirect('/famille');
  });
  app.post('/famille/parents/:id/code', auth, (req, res) => {
    const ok = svc.renewClaim(req.org.id, Number(req.params.id));
    flash(res, ok ? 'ok' : 'error', ok ? 'Nouveau code créé. L\'ancienne page et les anciens appareils sont oubliés : la personne doit rejoindre à nouveau.' : 'Introuvable.');
    res.redirect('/famille');
  });
  app.post('/famille/parents/:id/supprimer', auth, (req, res) => {
    db.prepare('DELETE FROM coparents WHERE id = ? AND organizer_id = ?').run(Number(req.params.id), req.org.id);
    res.redirect('/famille');
  });
  app.post('/famille/rythme', auth, (req, res) => {
    const d = String(req.body.rhythm_start || '');
    if (!isValidDate(d)) { flash(res, 'error', 'Date invalide.'); return res.redirect('/famille'); }
    db.prepare('UPDATE organizers SET rhythm_start = ? WHERE id = ?').run(d, req.org.id);
    flash(res, 'ok', 'Rythme enregistré.');
    res.redirect('/famille');
  });

  // --- Changements -----------------------------------------------------------------
  const formData = (req) => ({
    kids: db.prepare('SELECT * FROM children WHERE organizer_id = ? ORDER BY name').all(req.org.id),
    coparents: db.prepare('SELECT * FROM coparents WHERE organizer_id = ? ORDER BY id').all(req.org.id)
  });
  const pick = (b) => ({ kind: b.kind, childIds: b.childIds, date: b.date, time: b.time, place: b.place, coparentId: b.coparentId, items: b.items });

  app.get('/changes/new', auth, (req, res) => res.send(V.changeForm(formData(req))));
  app.post('/changes/new', auth, (req, res) => res.send(V.changeForm({ ...formData(req), values: pick(req.body) })));
  app.post('/changes/preview', auth, (req, res) => {
    const values = pick(req.body);
    let text;
    try {
      text = svc.previewText(req.org.id, values);
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      return res.status(400).send(V.changeForm({ ...formData(req), values, error: e.message }));
    }
    const cp = db.prepare('SELECT role FROM coparents WHERE id = ? AND organizer_id = ?').get(Number(values.coparentId), req.org.id);
    const { privateItems } = splitItems([].concat(values.items || []).flatMap((s) => String(s).split(',')));
    res.send(V.previewPage({ text, values, coparentName: cp.role, privateItems }));
  });
  app.post('/changes', auth, wrap(async (req, res) => {
    try {
      const { change, sent, reason } = await svc.createChange(req.org.id, pick(req.body));
      flash(res, sent ? 'ok' : 'error', sent ? `Notification envoyée à ${change.coparent.role}.` : `Changement enregistré, mais aucune notification n'est partie (${reason}). ${change.coparent.role} verra la demande en ouvrant sa page.`);
      res.redirect(`/changes/${change.id}`);
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      res.status(400).send(V.changeForm({ ...formData(req), values: pick(req.body), error: e.message }));
    }
  }));
  app.get('/changes/:id', auth, (req, res) => {
    const change = svc.getChange(Number(req.params.id));
    if (!change || change.organizer_id !== req.org.id) return res.status(404).send(V.notFoundPage());
    const notifs = db.prepare('SELECT * FROM notif_log WHERE change_id = ? ORDER BY id').all(change.id);
    res.send(V.changePage({ change, notifs, flash: parseFlash(req) }));
  });
  app.post('/changes/:id/annuler', auth, wrap(async (req, res) => {
    const r = await svc.cancelChange(req.org.id, Number(req.params.id));
    if (!r.ok) return res.status(404).send(V.notFoundPage());
    flash(res, 'ok', r.notified ? 'Changement annulé. L\'autre parent est prévenu.' : 'Changement annulé.');
    res.redirect('/');
  }));
  app.post('/changes/:id/accepter-proposition', auth, wrap(async (req, res) => {
    const r = await svc.acceptCounter(req.org.id, Number(req.params.id));
    flash(res, r.ok ? 'ok' : 'error', r.ok ? 'Proposition acceptée. L\'autre parent est prévenu.' : 'Cette proposition n\'est plus valable.');
    res.redirect(`/changes/${Number(req.params.id)}`);
  }));

  // --- Page d'un enfant : calendrier en lecture seule, lien secret, aucun compte ---------------------
  const childOf = (req, res, next) => {
    const child = svc.childByToken(req.params.token);
    if (!child) return noStore(res).status(404).send(V.notFoundPage('Ce lien n\'est plus valable. Demandez un nouveau code à l\'un des parents.'));
    req.child = child;
    noStore(res);
    next();
  };
  app.get('/e/:token', childOf, (req, res) => {
    const { date: today } = localParts();
    const week = svc.week(req.child.organizer_id, today, { childId: req.child.id, count: 14 });
    res.send(V.childPage({ child: req.child, week, base: `/e/${req.params.token}`, welcome: req.query.bienvenue === '1' }));
  });
  app.post('/e/:token/leave', childOf, (req, res) => {
    svc.leaveChild(req.child.id);
    res.send(V.notFoundPage('C\'est fait : cette page est oubliée.').replace('Introuvable', 'Au revoir'));
  });
  app.get('/e/:token/manifest.webmanifest', childOf, (req, res) => {
    res.type('application/manifest+json').json({
      name: 'Deux Toits', short_name: 'Deux Toits', lang: 'fr', start_url: './', scope: './', display: 'standalone',
      background_color: '#F3F5F7', theme_color: '#0E6B6B', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
    });
  });

  // --- Feuille à imprimer ---------------------------------------------------------------
  app.get('/semaine/imprimer', auth, (req, res) => {
    const start = isValidDate(req.query.start) ? req.query.start : localParts().date;
    res.send(V.printPage({
      week: svc.week(req.org.id, start), start, bw: req.query.nb === '1',
      kids: db.prepare('SELECT * FROM children WHERE organizer_id = ? ORDER BY name').all(req.org.id)
    }));
  });

  app.get('/sante', (req, res) => res.json({ ok: true, push: push.name }));
  app.use((req, res) => res.status(404).send(V.notFoundPage()));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(500).send(V.notFoundPage('Une erreur est survenue. Réessayez dans un instant.'));
  });

  return { app, svc };
}

// --- Démarrage --------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const db = openDb();
  const push = createPushProvider({ db, baseUrl });
  const { app, svc } = createApp({ db, push, baseUrl });
  app.listen(port, () => console.log(`Deux Toits sur ${baseUrl} (notifications : ${push.name})`));
  // Rappels de la veille : vérification chaque minute.
  setInterval(() => svc.runReminders().catch((e) => console.error('Rappels :', e)), 60_000);
}

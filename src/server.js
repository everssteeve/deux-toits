import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createSmsProvider } from './sms.js';
import { createService, UserError } from './service.js';
import QRCode from 'qrcode';
import {
  ACCESS_LENGTH, ROLES, groupCode, hashCode, isRole, isValidDate, localParts, newCode, newToken, normalizePhone, parseCode, splitItems
} from './util.js';
import * as V from './views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ db, sms, baseUrl }) {
  const svc = createService({ db, sms, baseUrl });
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
    const phone = normalizePhone(req.body.phone);
    const values = { role, phone: req.body.phone };
    if (!isRole(role)) return res.status(400).send(V.authPage({ mode: 'signup', error: 'Choisissez votre rôle dans la liste.', values }));
    if (!phone) return res.status(400).send(V.authPage({ mode: 'signup', error: 'Ce numéro de téléphone n\'est pas reconnu.', values }));
    const placeholder = hashCode(newToken(24)); // remplacé aussitôt par l'empreinte du vrai code
    const r = db.prepare('INSERT INTO organizers (role, phone, access_hash) VALUES (?, ?, ?)').run(role, phone, placeholder);
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

  // --- Invitation d'un proche : « ce numéro est ce rôle » ------------------------------------
  // Le lien (QR code en présentiel) contient le code ; sans lien, on tape le code sur /j.
  const joinPage = (res, status, { code = '', invitation = null, error, phone = '' }) =>
    noStore(res).status(status).send(V.joinPage({ code, invitation, error, phone }));
  app.get('/j', (req, res) => joinPage(res, 200, {}));
  app.get('/j/:code', (req, res) => {
    const invitation = svc.findInvitation(req.params.code);
    if (!invitation) return joinPage(res, 404, { error: 'Ce code n\'est pas valable ou a expiré. Demandez-en un nouveau.' });
    joinPage(res, 200, { code: req.params.code, invitation });
  });
  app.post('/j', wrap(async (req, res) => {
    const key = `ip:${req.ip}`;
    const code = String(req.body.code || '');
    const phone = String(req.body.phone || '');
    if (tooMany(key)) return joinPage(res, 429, { code, phone, error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    const r = await svc.claimAndConfirm(code, phone);
    if (!r.ok) {
      if (r.error === 'code') record(key);
      return joinPage(res, 400, {
        code, phone, invitation: svc.findInvitation(code),
        error: r.error === 'phone' ? 'Ce numéro de téléphone n\'est pas reconnu.' : 'Ce code n\'est pas valable ou a expiré.'
      });
    }
    noStore(res).send(V.joinedPage({ role: r.role, organizerRole: r.organizerRole, canReceive: sms.canReceive }));
  }));

  // --- Accueil -------------------------------------------------------------------
  app.get('/', auth, (req, res) => {
    const { date: today } = localParts();
    const kids = db.prepare('SELECT * FROM children WHERE organizer_id = ?').all(req.org.id);
    const coparents = db.prepare('SELECT * FROM coparents WHERE organizer_id = ?').all(req.org.id);
    const recent = db.prepare(`SELECT id FROM changes WHERE organizer_id = ? AND status != 'cancelled' AND date >= ?
                               ORDER BY date LIMIT 10`).all(req.org.id, today).map((r) => svc.getChange(r.id));
    res.send(V.homePage({
      org: req.org, week: svc.week(req.org.id, today), recent,
      setupNeeded: !kids.length || !coparents.length, flash: parseFlash(req)
    }));
  });

  // --- Famille -------------------------------------------------------------------
  app.get('/famille', auth, wrap(async (req, res) => {
    const coparents = db.prepare('SELECT * FROM coparents WHERE organizer_id = ? ORDER BY id').all(req.org.id);
    // QR codes générés ici, en SVG : le code d'invitation ne quitte jamais le serveur.
    const members = await Promise.all(coparents.map(async (p) => {
      const link = p.claim_code ? `${baseUrl}/j/${p.claim_code}` : null;
      return {
        ...p, opted_out: svc.isOptedOut(p.phone), link,
        codeLabel: p.claim_code ? groupCode(p.claim_code) : null,
        qr: link ? await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null
      };
    }));
    noStore(res).send(V.familyPage({
      org: req.org,
      kids: db.prepare('SELECT * FROM children WHERE organizer_id = ? ORDER BY name').all(req.org.id),
      coparents: members, roles: ROLES, flash: parseFlash(req), joinUrl: `${baseUrl}/j`
    }));
  }));
  app.post('/famille/enfants', auth, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 30);
    if (name) db.prepare('INSERT INTO children (organizer_id, name) VALUES (?, ?)').run(req.org.id, name);
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
    flash(res, 'ok', `${added.role} est ajouté. Montrez-lui son QR code ou donnez-lui son code : c'est lui qui enregistrera son numéro.`);
    res.redirect('/famille');
  });
  app.post('/famille/parents/:id/code', auth, (req, res) => {
    const ok = svc.renewClaim(req.org.id, Number(req.params.id));
    flash(res, ok ? 'ok' : 'error', ok ? 'Nouveau code créé. L\'ancien numéro est oublié : la personne doit se ré-enregistrer.' : 'Introuvable.');
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
      flash(res, sent ? 'ok' : 'error', sent ? `SMS envoyé à ${change.coparent.role}.` : `Changement enregistré, mais le SMS n'est pas parti : ${reason}`);
      res.redirect(`/changes/${change.id}`);
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      res.status(400).send(V.changeForm({ ...formData(req), values: pick(req.body), error: e.message }));
    }
  }));
  app.get('/changes/:id', auth, (req, res) => {
    const change = svc.getChange(Number(req.params.id));
    if (!change || change.organizer_id !== req.org.id) return res.status(404).send(V.notFoundPage());
    const smsLog = db.prepare('SELECT * FROM sms_log WHERE change_id = ? ORDER BY id').all(change.id);
    res.send(V.changePage({ change, smsLog, flash: parseFlash(req) }));
  });
  app.post('/changes/:id/annuler', auth, wrap(async (req, res) => {
    const r = await svc.cancelChange(req.org.id, Number(req.params.id));
    if (!r.ok) return res.status(404).send(V.notFoundPage());
    flash(res, 'ok', r.notified ? 'Changement annulé. L\'autre parent est prévenu par SMS.' : 'Changement annulé.');
    res.redirect('/');
  }));
  app.post('/changes/:id/accepter-proposition', auth, wrap(async (req, res) => {
    const r = await svc.acceptCounter(req.org.id, Number(req.params.id));
    flash(res, r.ok ? 'ok' : 'error', r.ok ? 'Proposition acceptée. L\'autre parent est prévenu par SMS.' : 'Cette proposition n\'est plus valable.');
    res.redirect(`/changes/${Number(req.params.id)}`);
  }));

  // --- Réponse de l'autre parent, sans compte -------------------------------------------
  const gone = (change) => !change || change.status === 'cancelled' || change.isPast;
  const goneText = 'Cette demande a été annulée, est passée, ou n\'existe pas.';
  app.get('/r/:token', (req, res) => {
    const change = svc.getChangeByToken(req.params.token);
    if (gone(change)) return res.status(404).send(V.notFoundPage(goneText));
    res.send(V.replyPage({ change, options: svc.counterOptions(change), optedOut: svc.isOptedOut(change.coparent.phone) }));
  });
  app.post('/r/:token', wrap(async (req, res) => {
    const change = svc.getChangeByToken(req.params.token);
    if (gone(change)) return res.status(404).send(V.notFoundPage(goneText));
    if (change.status !== 'pending') return res.send(V.replyPage({ change, options: [], done: true }));
    const r = await svc.respond(change, String(req.body.answer || ''));
    if (!r.ok) {
      const current = r.change || change;
      if (current.status !== 'pending') return res.send(V.replyPage({ change: current, options: [], done: true }));
      return res.status(400).send(V.replyPage({ change, options: svc.counterOptions(change), flash: { type: 'error', text: r.message } }));
    }
    res.send(V.replyPage({ change: r.change, options: [], done: true }));
  }));
  // Désinscription sans SMS entrant (indispensable avec un expéditeur qui ne reçoit pas de réponse).
  app.post('/r/:token/stop', (req, res) => {
    const change = svc.getChangeByToken(req.params.token);
    if (!change) return res.status(404).send(V.notFoundPage(goneText));
    svc.optOut(change.coparent.phone);
    res.send(V.notFoundPage('C\'est noté : vous ne recevrez plus de messages de Deux Toits.').replace('Introuvable', 'Désinscription'));
  });

  // --- SMS entrants ------------------------------------------------------------------
  // Twilio : configurer l'URL « A message comes in » sur /webhooks/sms/twilio (POST).
  // La route n'existe qu'avec Twilio, et chaque requête doit porter une signature valide.
  if (sms.name === 'twilio') {
    app.post('/webhooks/sms/twilio', wrap(async (req, res) => {
      if (!checkTwilioSignature(req, baseUrl)) return res.status(403).send('Signature invalide');
      const r = await svc.handleInbound(req.body.From, req.body.Body);
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response>${r.reply ? `<Message>${xmlEsc(r.reply)}</Message>` : ''}</Response>`);
    }));
  }

  // --- Feuille à imprimer ---------------------------------------------------------------
  app.get('/semaine/imprimer', auth, (req, res) => {
    const start = isValidDate(req.query.start) ? req.query.start : localParts().date;
    res.send(V.printPage({
      week: svc.week(req.org.id, start), start, bw: req.query.nb === '1',
      kids: db.prepare('SELECT * FROM children WHERE organizer_id = ? ORDER BY name').all(req.org.id)
    }));
  });

  // --- Outil de test, actif seulement en mode console -------------------------------------------
  if (sms.name === 'console') {
    app.get('/dev/sms', auth, (req, res) => {
      const coparents = db.prepare('SELECT * FROM coparents WHERE organizer_id = ?').all(req.org.id);
      const phones = [req.org.phone, ...coparents.map((p) => p.phone)].filter(Boolean);
      const log = db.prepare(`SELECT * FROM sms_log WHERE phone IN (${phones.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 50`).all(...phones);
      res.send(V.devSmsPage({ log, coparents }));
    });
    app.post('/dev/sms', auth, wrap(async (req, res) => {
      const owned = db.prepare('SELECT 1 FROM coparents WHERE organizer_id = ? AND phone = ?').get(req.org.id, req.body.from);
      if (owned) {
        const r = await svc.handleInbound(req.body.from, req.body.body);
        if (r.reply) db.prepare('INSERT INTO sms_log (direction, kind, phone, body) VALUES (?, ?, ?, ?)').run('out', 'system', req.body.from, r.reply);
      }
      res.redirect('/dev/sms');
    }));
  }

  app.get('/sante', (req, res) => res.json({ ok: true, sms: sms.name }));
  app.use((req, res) => res.status(404).send(V.notFoundPage()));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(500).send(V.notFoundPage('Une erreur est survenue. Réessayez dans un instant.'));
  });

  return { app, svc };
}

function xmlEsc(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// Vérifie la signature X-Twilio-Signature (HMAC-SHA1 de l'URL + paramètres triés).
function checkTwilioSignature(req, baseUrl) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const url = baseUrl + req.originalUrl;
  const data = Object.keys(req.body).sort().reduce((acc, k) => acc + k + req.body[k], url);
  const expected = crypto.createHmac('sha1', token).update(data).digest('base64');
  const got = req.get('X-Twilio-Signature') || '';
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// --- Démarrage --------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const db = openDb();
  const sms = createSmsProvider();
  const { app, svc } = createApp({ db, sms, baseUrl });
  app.listen(port, () => console.log(`Deux Toits sur ${baseUrl} (SMS : ${sms.name})`));
  // Rappels de la veille : vérification chaque minute.
  setInterval(() => svc.runReminders().catch((e) => console.error('Rappels :', e)), 60_000);
}

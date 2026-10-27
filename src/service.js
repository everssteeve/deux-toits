// Logique métier : changements, réponses, notifications, rappels, semaine.
import {
  CLAIM_LENGTH, addDays, frDate, frTime, hashCode, isHealthItem, isValidDate, joinFr, localParts, newCode, newToken,
  parseCode, shiftTime, splitItems, toMinutes, uniqueRole
} from './util.js';

export function createService({ db, push, reminderHour = process.env.REMINDER_HOUR || '19:00' }) {
  const q = (sql) => db.prepare(sql);
  const reminderMinutes = toMinutes(reminderHour);
  if (reminderMinutes === null) throw new Error(`REMINDER_HOUR invalide : « ${reminderHour} » (format attendu HH:MM).`);
  const today = () => localParts().date;

  // --- Notifications (Web Push) ------------------------------------------------------
  // Toute notification passe par ici. Un appareil disparu (404/410) est oublié automatiquement.
  async function notify(audience, ownerId, payload, { changeId = null, kind = 'system' } = {}) {
    const col = audience === 'organizer' ? 'organizer_id' : 'coparent_id';
    const subs = q(`SELECT * FROM push_subscriptions WHERE ${col} = ?`).all(ownerId);
    let delivered = 0;
    let error = subs.length ? null : 'aucun appareil abonné aux notifications';
    for (const s of subs) {
      try {
        await push.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { ...payload, changeId });
        delivered++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) q('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        else { error = e.message; console.error('Échec d\'envoi de notification :', e.message); }
      }
    }
    q('INSERT INTO notif_log (kind, audience, title, body, change_id, delivered, error) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(kind, audience, payload.title, payload.body || '', changeId, delivered, error);
    return { ok: delivered > 0, delivered, error };
  }
  function saveSubscription({ organizerId = null, coparentId = null }, sub) {
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    let endpoint;
    try { endpoint = new URL(sub?.endpoint).href; } catch { return false; }
    if (!endpoint.startsWith('https://') || !p256dh || !auth) return false;
    q(`INSERT INTO push_subscriptions (organizer_id, coparent_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET organizer_id = excluded.organizer_id, coparent_id = excluded.coparent_id,
         p256dh = excluded.p256dh, auth = excluded.auth`).run(organizerId, coparentId, endpoint, p256dh, auth);
    return true;
  }
  const removeSubscription = ({ organizerId = null, coparentId = null }, endpoint) => {
    const col = organizerId ? 'organizer_id' : 'coparent_id';
    q(`DELETE FROM push_subscriptions WHERE endpoint = ? AND ${col} = ?`).run(String(endpoint), organizerId || coparentId);
  };
  const deviceCount = (audience, id) =>
    q(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE ${audience === 'organizer' ? 'organizer_id' : 'coparent_id'} = ?`).get(id).n;

  // --- Proches : rôle + code d'invitation, puis page personnelle ---------------------------
  const CLAIM_DAYS = 14;
  // Proches et enfants partagent le même espace de codes : /j n'a pas à deviner de qui il s'agit.
  function freshClaimCode() {
    for (;;) {
      const code = newCode(CLAIM_LENGTH);
      if (!q('SELECT 1 FROM coparents WHERE claim_code = ?').get(code) && !q('SELECT 1 FROM children WHERE claim_code = ?').get(code)) return code;
    }
  }
  const TABLES = { coparent: 'coparents', child: 'children' };
  function addCoparent(organizerId, role) {
    const taken = q('SELECT role FROM coparents WHERE organizer_id = ?').all(organizerId).map((r) => r.role);
    const finalRole = uniqueRole(role, taken);
    const r = q(`INSERT INTO coparents (organizer_id, role, claim_code, claim_expires_at)
                 VALUES (?, ?, ?, datetime('now', '+${CLAIM_DAYS} days'))`).run(organizerId, finalRole, freshClaimCode());
    return { id: Number(r.lastInsertRowid), role: finalRole };
  }
  function addChild(organizerId, name) {
    const r = q(`INSERT INTO children (organizer_id, name, claim_code, claim_expires_at)
                 VALUES (?, ?, ?, datetime('now', '+${CLAIM_DAYS} days'))`).run(organizerId, name, freshClaimCode());
    return Number(r.lastInsertRowid);
  }
  // Nouveau code : l'ancienne page et les appareils abonnés sont oubliés, la personne se ré-enregistre.
  function renewClaim(organizerId, id, kind = 'coparent') {
    const r = q(`UPDATE ${TABLES[kind]} SET page_hash = NULL, claim_code = ?, claim_expires_at = datetime('now', '+${CLAIM_DAYS} days')
                 WHERE id = ? AND organizer_id = ?`).run(freshClaimCode(), id, organizerId);
    if (r.changes === 1 && kind === 'coparent') q('DELETE FROM push_subscriptions WHERE coparent_id = ?').run(id);
    return r.changes === 1;
  }
  // Renvoie { kind, id, label, organizer_role } : label = rôle du proche, ou prénom de l'enfant.
  function findInvitation(code) {
    const c = parseCode(code, CLAIM_LENGTH);
    if (!c) return null;
    const parent = q(`SELECT p.id, p.role AS label, o.role AS organizer_role FROM coparents p JOIN organizers o ON o.id = p.organizer_id
                      WHERE p.claim_code = ? AND p.claim_expires_at > datetime('now')`).get(c);
    if (parent) return { kind: 'coparent', ...parent };
    const kid = q(`SELECT k.id, k.name AS label, o.role AS organizer_role FROM children k JOIN organizers o ON o.id = k.organizer_id
                   WHERE k.claim_code = ? AND k.claim_expires_at > datetime('now')`).get(c);
    return kid ? { kind: 'child', ...kid } : null;
  }
  // Déclare « ce lien (cet appareil) est ce rôle ». Le code ne sert qu'une fois (mise à jour atomique).
  // Le lien secret n'est renvoyé qu'ici : seule son empreinte est gardée.
  function claim(code) {
    const c = parseCode(code, CLAIM_LENGTH);
    const row = c && findInvitation(c);
    if (!row) return { ok: false };
    const token = newToken(18);
    const r = q(`UPDATE ${TABLES[row.kind]} SET page_hash = ?, claim_code = NULL, claim_expires_at = NULL
                 WHERE id = ? AND claim_code = ?`).run(hashCode(token), row.id, c);
    if (r.changes !== 1) return { ok: false };
    return { ok: true, token, kind: row.kind, label: row.label, organizerRole: row.organizer_role };
  }
  function childByToken(token) {
    const t = String(token || '');
    if (t.length < 16 || t.length > 64) return null;
    return q(`SELECT k.id, k.name, k.organizer_id, o.role AS organizer_role FROM children k
              JOIN organizers o ON o.id = k.organizer_id WHERE k.page_hash = ?`).get(hashCode(t)) || null;
  }
  function leaveChild(childId) {
    q('UPDATE children SET page_hash = NULL, claim_code = NULL, claim_expires_at = NULL WHERE id = ?').run(childId);
  }
  function memberByToken(token) {
    const t = String(token || '');
    if (t.length < 16 || t.length > 64) return null;
    return q(`SELECT p.id, p.role, p.organizer_id, o.role AS organizer_role FROM coparents p
              JOIN organizers o ON o.id = p.organizer_id WHERE p.page_hash = ?`).get(hashCode(t)) || null;
  }
  // Le proche quitte : sa page et ses appareils sont oubliés ; l'organisateur peut lui créer un nouveau code.
  function leave(coparentId) {
    q('UPDATE coparents SET page_hash = NULL, claim_code = NULL, claim_expires_at = NULL WHERE id = ?').run(coparentId);
    q('DELETE FROM push_subscriptions WHERE coparent_id = ?').run(coparentId);
  }

  function getChange(id) {
    const c = q('SELECT * FROM changes WHERE id = ?').get(id);
    return c ? hydrate(c) : null;
  }
  function hydrate(c) {
    const kids = q(`SELECT ch.* FROM children ch JOIN change_children cc ON cc.child_id = ch.id
                    WHERE cc.change_id = ? ORDER BY ch.name`).all(c.id);
    return {
      ...c,
      items: JSON.parse(c.items),
      privateItems: JSON.parse(c.private_items),
      kids,
      kidNames: joinFr(kids.map((k) => k.name)),
      isPast: c.date < today(),
      organizer: q('SELECT id, role FROM organizers WHERE id = ?').get(c.organizer_id),
      coparent: q('SELECT id, role FROM coparents WHERE id = ?').get(c.coparent_id)
    };
  }
  // Demandes à venir d'un proche, pour sa page personnelle.
  function changesForMember(coparentId) {
    return q(`SELECT id FROM changes WHERE coparent_id = ? AND status != 'cancelled' AND date >= ?
              ORDER BY date, time`).all(coparentId, today()).map((r) => getChange(r.id));
  }

  // --- Textes des notifications ------------------------------------------------------
  // Un lieu lié à la santé (pédiatre, pharmacie…) n'apparaît jamais dans une notification.
  const safePlace = (place) => (place && !isHealthItem(place) ? place : null);
  function describe(c) {
    const place = safePlace(c.place);
    if (c.kind === 'pickup') {
      return `récupérer ${c.kidNames} ${frDate(c.date)}${c.time ? ` à ${frTime(c.time)}` : ''}${place ? ` à ${place}` : ''}`;
    }
    return `garder ${c.kidNames} ${frDate(c.date)}${c.time ? ` à partir de ${frTime(c.time)}` : ''}${place ? ` (${place})` : ''}`;
  }
  function askPayload(c) {
    return {
      title: `${c.organizer.role} : peux-tu ${describe(c)} ?`,
      body: c.items.length ? `À prévoir : ${joinFr(c.items)}.` : 'Ouvre ta page pour répondre.',
      actions: [{ action: 'yes', title: 'Oui' }, { action: 'no', title: 'Non' }]
    };
  }
  function reminderPayload(c) {
    const place = safePlace(c.place);
    const what = c.kind === 'pickup'
      ? `Vous récupérez ${c.kidNames}${c.time ? ` à ${frTime(c.time)}` : ''}${place ? ` à ${place}` : ''}.`
      : `Vous gardez ${c.kidNames}${c.time ? ` à partir de ${frTime(c.time)}` : ''}.`;
    return { title: `Rappel de ${c.organizer.role} : demain, ${frDate(c.date)}.`, body: `${what} À prévoir : ${joinFr(c.items)}.` };
  }
  function answerPayload(c) {
    const who = c.coparent.role;
    const when = frDate(c.date);
    if (c.status === 'accepted') return { title: `Deux Toits : ${who} a répondu OUI pour ${when}.` };
    if (c.status === 'declined') return { title: `Deux Toits : ${who} ne peut pas pour ${when}.`, body: 'Ouvrez Deux Toits pour voir la suite.' };
    if (c.status === 'counter') return { title: `Deux Toits : ${who} répond « ${c.counter_label} » pour ${when}.`, body: 'Ouvrez le changement pour accepter.' };
    return { title: '' };
  }

  // --- Création et envoi ---------------------------------------------------------
  function parseInput(organizerId, input) {
    const coparent = q('SELECT id, role, page_hash FROM coparents WHERE id = ? AND organizer_id = ?').get(Number(input.coparentId), organizerId);
    if (!coparent) throw new UserError('Choisissez le parent à prévenir.');
    if (!coparent.page_hash) throw new UserError(`${coparent.role} n'a pas encore rejoint. Montrez-lui son QR code ou donnez-lui son code (page Famille).`);
    const childIds = [].concat(input.childIds || []).map(Number).filter(Boolean);
    const kids = childIds.length
      ? q(`SELECT * FROM children WHERE organizer_id = ? AND id IN (${childIds.map(() => '?').join(',')})`).all(organizerId, ...childIds)
      : [];
    if (!kids.length) throw new UserError('Choisissez au moins un enfant.');
    if (!isValidDate(input.date)) throw new UserError('Indiquez une date valide.');
    if (input.date < today()) throw new UserError('Cette date est déjà passée.');
    const kind = input.kind === 'swap' ? 'swap' : 'pickup';
    const time = toMinutes(input.time) !== null ? String(input.time).padStart(5, '0') : null;
    if (kind === 'pickup' && !time) throw new UserError('Indiquez l\'heure de récupération.');
    const { items, privateItems } = splitItems([].concat(input.items || []).flatMap((s) => String(s).split(',')));
    const place = String(input.place || '').trim().slice(0, 60) || null;
    return { coparent, kids, kind, date: input.date, time, place, items, privateItems };
  }

  async function createChange(organizerId, input) {
    const p = parseInput(organizerId, input);
    const r = q(`INSERT INTO changes (organizer_id, coparent_id, kind, date, time, place, items, private_items)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(organizerId, p.coparent.id, p.kind, p.date, p.time, p.place, JSON.stringify(p.items), JSON.stringify(p.privateItems));
    const id = Number(r.lastInsertRowid);
    for (const k of p.kids) q('INSERT INTO change_children (change_id, child_id) VALUES (?, ?)').run(id, k.id);

    const change = getChange(id);
    const res = await notify('coparent', p.coparent.id, askPayload(change), { changeId: id, kind: 'ask' });
    return { change, sent: res.ok, reason: res.error };
  }

  // Aperçu sans rien enregistrer. Lève UserError si la saisie est incomplète.
  function previewText(organizerId, input) {
    const p = parseInput(organizerId, input);
    const payload = askPayload({
      ...p, kidNames: joinFr(p.kids.map((k) => k.name)),
      organizer: q('SELECT id, role FROM organizers WHERE id = ?').get(organizerId)
    });
    return `${payload.title}\n${payload.body}`;
  }

  // --- Réponses de l'autre parent ------------------------------------------------------
  function counterOptions(c) {
    const opts = [];
    if (c.kind === 'pickup' && c.time) {
      opts.push({ id: 't30', label: `oui, mais à ${frTime(shiftTime(c.time, 30))}` });
      opts.push({ id: 't60', label: `oui, mais à ${frTime(shiftTime(c.time, 60))}` });
    }
    opts.push({ id: 'd1', label: `plutôt ${frDate(addDays(c.date, 1))}${c.time ? `, à ${frTime(c.time)}` : ''}` });
    return opts;
  }

  async function respond(change, answer) {
    if (!change || change.status === 'cancelled' || change.isPast) return { ok: false, message: 'Cette demande n\'est plus active.' };
    let status;
    let counter = null;
    if (answer === 'yes') status = 'accepted';
    else if (answer === 'no') status = 'declined';
    else {
      counter = counterOptions(change).find((o) => o.id === answer);
      if (!counter) return { ok: false, message: 'Réponse non reconnue.' };
      status = 'counter';
    }
    // Mise à jour conditionnelle : une seule réponse compte, même si deux appareils répondent ensemble.
    const r = q(`UPDATE changes SET status = ?, counter_label = ?, counter_choice = ?, responded_at = datetime('now')
                 WHERE id = ? AND status = 'pending'`).run(status, counter?.label ?? null, counter?.id ?? null, change.id);
    if (r.changes !== 1) return { ok: false, message: 'Une réponse a déjà été donnée.', change: getChange(change.id) };
    const updated = getChange(change.id);
    await notify('organizer', updated.organizer_id, answerPayload(updated), { changeId: updated.id, kind: 'answer' });
    return { ok: true, change: updated };
  }

  // L'organisateur accepte la contre-proposition : l'heure ou la date est mise à jour.
  async function acceptCounter(organizerId, changeId) {
    const c = getChange(changeId);
    if (!c || c.organizer_id !== organizerId || c.status !== 'counter') return { ok: false };
    let { date, time } = c;
    if (c.counter_choice === 't30') time = shiftTime(time, 30);
    else if (c.counter_choice === 't60') time = shiftTime(time, 60);
    else if (c.counter_choice === 'd1') date = addDays(date, 1);
    const r = q(`UPDATE changes SET status = 'accepted', date = ?, time = ?, reminder_sent_at = NULL
                 WHERE id = ? AND status = 'counter'`).run(date, time, c.id);
    if (r.changes !== 1) return { ok: false };
    const updated = getChange(c.id);
    await notify('coparent', updated.coparent_id, { title: `${updated.organizer.role} : c'est d'accord, tu peux ${describe(updated)}. Merci !` },
      { changeId: c.id, kind: 'confirm' });
    return { ok: true, change: updated };
  }

  async function cancelChange(organizerId, changeId) {
    const c = getChange(changeId);
    if (!c || c.organizer_id !== organizerId) return { ok: false };
    const r = q(`UPDATE changes SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'`).run(c.id);
    if (r.changes !== 1) return { ok: true, notified: false };
    // On ne dérange l'autre parent que si la demande le concernait encore.
    if (!c.isPast && c.status !== 'declined') {
      const res = await notify('coparent', c.coparent_id,
        { title: `${c.organizer.role} : finalement, le changement prévu ${frDate(c.date)} est annulé.`, body: 'Rien à faire.' },
        { changeId: c.id, kind: 'cancel' });
      return { ok: true, notified: res.ok };
    }
    return { ok: true, notified: false };
  }

  // --- Rappels de la veille ----------------------------------------------------------------
  let running = false;
  async function runReminders(now = new Date()) {
    if (running) return 0; // une seule passe à la fois
    running = true;
    try {
      const { date: localDate, time } = localParts(now);
      if (toMinutes(time) < reminderMinutes) return 0;
      const tomorrow = addDays(localDate, 1);
      // Réservation atomique : chaque rappel n'est pris qu'une fois.
      const due = q(`UPDATE changes SET reminder_sent_at = datetime('now'), reminder_attempts = reminder_attempts + 1
                     WHERE status = 'accepted' AND date = ? AND reminder_sent_at IS NULL AND items != '[]'
                     AND reminder_attempts < 3 RETURNING id`).all(tomorrow);
      let sent = 0;
      for (const { id } of due) {
        const c = getChange(id);
        const res = await notify('coparent', c.coparent_id, reminderPayload(c), { changeId: id, kind: 'reminder' });
        if (res.ok) sent++;
        else q('UPDATE changes SET reminder_sent_at = NULL WHERE id = ?').run(id); // nouvel essai à la passe suivante
      }
      return sent;
    } finally {
      running = false;
    }
  }

  // --- Semaine (accueil et feuille à imprimer) -------------------------------------------------
  function homeOn(org, isoDate) {
    if (!org.rhythm_start) return null;
    const diff = Math.round((Date.parse(isoDate + 'T12:00:00Z') - Date.parse(org.rhythm_start + 'T12:00:00Z')) / 86400000);
    const week = Math.floor(diff / 7);
    return ((week % 2) + 2) % 2 === 0 ? 'organizer' : 'coparent';
  }
  // Pour la page d'un enfant : seulement les changements qui le concernent (childId), sur `count` jours.
  function week(organizerId, startIso, { childId = null, count = 7 } = {}) {
    const org = q('SELECT * FROM organizers WHERE id = ?').get(organizerId);
    const days = [];
    for (let i = 0; i < count; i++) {
      const date = addDays(startIso, i);
      const changes = q(`SELECT id FROM changes WHERE organizer_id = ? AND date = ? AND status != 'cancelled'
                         ${childId ? 'AND id IN (SELECT change_id FROM change_children WHERE child_id = ?)' : ''}
                         ORDER BY time`).all(...[organizerId, date, ...(childId ? [childId] : [])]).map((r) => getChange(r.id));
      const accepted = changes.filter((c) => c.status === 'accepted');
      let home = homeOn(org, date);
      const notes = [];
      let split = false;
      for (const c of accepted) {
        if (c.kind === 'swap') home = 'coparent';
        else { split = true; notes.push(`${c.coparent.role} vient à ${frTime(c.time)}${c.place ? ` (${c.place})` : ''}`); }
      }
      const isHandover = !!org.rhythm_start && homeOn(org, addDays(date, -1)) !== homeOn(org, date);
      days.push({ date, home, split, isHandover, changes, notes, items: [...new Set(accepted.flatMap((c) => c.items))] });
    }
    return { org, days };
  }

  return {
    createChange, previewText, getChange, changesForMember, respond, acceptCounter, cancelChange, counterOptions,
    runReminders, week, notify, saveSubscription, removeSubscription, deviceCount,
    addCoparent, addChild, renewClaim, findInvitation, claim, memberByToken, childByToken, leave, leaveChild
  };
}

export class UserError extends Error {}

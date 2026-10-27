// Logique métier : changements, réponses, SMS entrants, rappels, semaine.
import {
  CLAIM_LENGTH, addDays, frDate, frTime, isHealthItem, isValidDate, joinFr, localParts, newCode, newToken,
  normalizePhone, parseCode, shiftTime, splitItems, toMinutes, uniqueRole
} from './util.js';

export function createService({ db, sms, baseUrl, reminderHour = process.env.REMINDER_HOUR || '19:00' }) {
  const q = (sql) => db.prepare(sql);
  const reminderMinutes = toMinutes(reminderHour);
  if (reminderMinutes === null) throw new Error(`REMINDER_HOUR invalide : « ${reminderHour} » (format attendu HH:MM).`);
  const today = () => localParts().date;

  // --- Désinscriptions (STOP) ------------------------------------------------------
  const isOptedOut = (phone) => !!phone && !!q('SELECT 1 FROM opt_outs WHERE phone = ?').get(phone);
  const optOut = (phone) => q('INSERT OR IGNORE INTO opt_outs (phone) VALUES (?)').run(phone);
  const optIn = (phone) => q('DELETE FROM opt_outs WHERE phone = ?').run(phone);

  // Tout SMS sortant passe par ici ; un numéro désinscrit ne reçoit plus rien.
  async function sendSms(phone, body, { changeId = null, kind = 'system' } = {}) {
    if (!phone) return { ok: false, error: 'numéro non enregistré' };
    if (isOptedOut(phone)) return { ok: false, error: 'numéro désinscrit (STOP)' };
    let providerId = null;
    let error = null;
    try {
      ({ id: providerId } = await sms.send(phone, body));
    } catch (e) {
      error = e.message;
      console.error('Échec d\'envoi SMS :', e.message);
    }
    q('INSERT INTO sms_log (direction, kind, phone, body, change_id, provider_id, error) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('out', kind, phone, body, changeId, providerId, error);
    return { ok: !error, error };
  }

  // --- Proches : rôle + code d'invitation, jamais de nom ----------------------------------
  const CLAIM_DAYS = 14;
  function freshClaimCode() {
    for (;;) {
      const code = newCode(CLAIM_LENGTH);
      if (!q('SELECT 1 FROM coparents WHERE claim_code = ?').get(code)) return code;
    }
  }
  function addCoparent(organizerId, role) {
    const taken = q('SELECT role FROM coparents WHERE organizer_id = ?').all(organizerId).map((r) => r.role);
    const finalRole = uniqueRole(role, taken);
    const r = q(`INSERT INTO coparents (organizer_id, role, claim_code, claim_expires_at)
                 VALUES (?, ?, ?, datetime('now', '+${CLAIM_DAYS} days'))`).run(organizerId, finalRole, freshClaimCode());
    return { id: Number(r.lastInsertRowid), role: finalRole };
  }
  // Nouveau code : l'ancien numéro est oublié, le proche se ré-enregistre (changement de numéro).
  function renewClaim(organizerId, id) {
    const r = q(`UPDATE coparents SET phone = NULL, claim_code = ?, claim_expires_at = datetime('now', '+${CLAIM_DAYS} days')
                 WHERE id = ? AND organizer_id = ?`).run(freshClaimCode(), id, organizerId);
    return r.changes === 1;
  }
  function findInvitation(code) {
    const c = parseCode(code, CLAIM_LENGTH);
    if (!c) return null;
    return q(`SELECT p.id, p.role, o.role AS organizer_role FROM coparents p JOIN organizers o ON o.id = p.organizer_id
              WHERE p.claim_code = ? AND p.claim_expires_at > datetime('now')`).get(c) || null;
  }
  // Déclare « ce numéro est ce rôle ». Le code ne sert qu'une fois (mise à jour atomique).
  function claim(code, rawPhone) {
    const phone = normalizePhone(rawPhone);
    const c = parseCode(code, CLAIM_LENGTH);
    if (!phone) return { ok: false, error: 'phone' };
    if (!c) return { ok: false, error: 'code' };
    const row = findInvitation(c);
    if (!row) return { ok: false, error: 'code' };
    const r = q(`UPDATE coparents SET phone = ?, claim_code = NULL, claim_expires_at = NULL
                 WHERE id = ? AND claim_code = ?`).run(phone, row.id, c);
    if (r.changes !== 1) return { ok: false, error: 'code' };
    return { ok: true, phone, role: row.role, organizerRole: row.organizer_role };
  }
  async function claimAndConfirm(code, rawPhone) {
    const res = claim(code, rawPhone);
    if (res.ok) {
      await sendSms(res.phone, `Deux Toits : ce numéro est enregistré comme « ${res.role} ». ${sms.canReceive ? 'STOP pour ne plus recevoir ces messages.' : `Ne plus recevoir ces messages : ${baseUrl}/j`}`,
        { kind: 'system' });
    }
    return res;
  }

  function getChange(id) {
    const c = q('SELECT * FROM changes WHERE id = ?').get(id);
    return c ? hydrate(c) : null;
  }
  function getChangeByToken(token) {
    const c = q('SELECT * FROM changes WHERE token = ?').get(String(token));
    return c ? hydrate(c) : null;
  }
  function hydrate(c) {
    const kids = q(`SELECT ch.* FROM children ch JOIN change_children cc ON cc.child_id = ch.id
                    WHERE cc.change_id = ? ORDER BY ch.name`).all(c.id);
    const coparent = q('SELECT * FROM coparents WHERE id = ?').get(c.coparent_id);
    return {
      ...c,
      items: JSON.parse(c.items),
      privateItems: JSON.parse(c.private_items),
      kids,
      kidNames: joinFr(kids.map((k) => k.name)),
      isPast: c.date < today(),
      organizer: q('SELECT id, role, phone FROM organizers WHERE id = ?').get(c.organizer_id),
      coparent: { ...coparent, opted_out: isOptedOut(coparent.phone) }
    };
  }

  // --- Textes des SMS ------------------------------------------------------------
  // Un lieu lié à la santé (pédiatre, pharmacie…) n'apparaît jamais dans un SMS.
  const smsPlace = (place) => (place && !isHealthItem(place) ? place : null);
  function describe(c) {
    const place = smsPlace(c.place);
    if (c.kind === 'pickup') {
      return `récupérer ${c.kidNames} ${frDate(c.date)}${c.time ? ` à ${frTime(c.time)}` : ''}${place ? ` à ${place}` : ''}`;
    }
    return `garder ${c.kidNames} ${frDate(c.date)}${c.time ? ` à partir de ${frTime(c.time)}` : ''}${place ? ` (${place})` : ''}`;
  }
  function stopLine(c) {
    return sms.canReceive ? 'STOP pour ne plus recevoir ces messages.' : `Ne plus recevoir ces messages : ${baseUrl}/r/${c.token}`;
  }
  function askText(c) {
    const link = `${baseUrl}/r/${c.token}`;
    const lines = [`${c.organizer.role} : peux-tu ${describe(c)} ?${c.items.length ? ` À prévoir : ${joinFr(c.items)}.` : ''}`];
    if (sms.canReceive) lines.push(`Réponds OUI ou NON à ce SMS. Pour proposer autre chose : ${link}`);
    else lines.push(`Pour répondre : ${link}`);
    lines.push(stopLine(c));
    return lines.join('\n');
  }
  function reminderText(c) {
    const place = smsPlace(c.place);
    const what = c.kind === 'pickup'
      ? `Vous récupérez ${c.kidNames}${c.time ? ` à ${frTime(c.time)}` : ''}${place ? ` à ${place}` : ''}.`
      : `Vous gardez ${c.kidNames}${c.time ? ` à partir de ${frTime(c.time)}` : ''}.`;
    return [`Rappel de ${c.organizer.role} : demain, ${frDate(c.date)}.`, `${what} À prévoir : ${joinFr(c.items)}.`, stopLine(c)].join('\n');
  }
  function answerText(c) {
    const who = c.coparent.role;
    const when = frDate(c.date);
    if (c.status === 'accepted') return `Deux Toits : ${who} a répondu OUI pour ${when}.`;
    if (c.status === 'declined') return `Deux Toits : ${who} ne peut pas pour ${when}. ${baseUrl}/`;
    if (c.status === 'counter') return `Deux Toits : ${who} répond « ${c.counter_label} » pour ${when}. Pour accepter : ${baseUrl}/changes/${c.id}`;
    return '';
  }

  // --- Création et envoi ---------------------------------------------------------
  function parseInput(organizerId, input) {
    const coparent = q('SELECT * FROM coparents WHERE id = ? AND organizer_id = ?').get(Number(input.coparentId), organizerId);
    if (!coparent) throw new UserError('Choisissez le parent à prévenir.');
    if (!coparent.phone) throw new UserError(`${coparent.role} n'a pas encore enregistré son numéro. Montrez-lui son QR code ou donnez-lui son code (page Famille).`);
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
    const token = newToken();
    const r = q(`INSERT INTO changes (organizer_id, coparent_id, kind, date, time, place, items, private_items, token)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(organizerId, p.coparent.id, p.kind, p.date, p.time, p.place, JSON.stringify(p.items), JSON.stringify(p.privateItems), token);
    const id = Number(r.lastInsertRowid);
    for (const k of p.kids) q('INSERT INTO change_children (change_id, child_id) VALUES (?, ?)').run(id, k.id);

    const change = getChange(id);
    if (change.coparent.opted_out) {
      return { change, sent: false, reason: `${p.coparent.role} a demandé à ne plus recevoir de SMS. Prévenez-le autrement.` };
    }
    const res = await sendSms(p.coparent.phone, askText(change), { changeId: id, kind: 'ask' });
    return { change, sent: res.ok, reason: res.error };
  }

  // Aperçu sans rien enregistrer. Lève UserError si la saisie est incomplète.
  function previewText(organizerId, input) {
    const p = parseInput(organizerId, input);
    return askText({
      ...p, kidNames: joinFr(p.kids.map((k) => k.name)), token: 'xxxxxx',
      organizer: q('SELECT id, role, phone FROM organizers WHERE id = ?').get(organizerId)
    });
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
    // Mise à jour conditionnelle : une seule réponse compte, même si le lien et le SMS arrivent ensemble.
    const r = q(`UPDATE changes SET status = ?, counter_label = ?, counter_choice = ?, responded_at = datetime('now')
                 WHERE id = ? AND status = 'pending'`).run(status, counter?.label ?? null, counter?.id ?? null, change.id);
    if (r.changes !== 1) return { ok: false, message: 'Une réponse a déjà été donnée.', change: getChange(change.id) };
    const updated = getChange(change.id);
    await sendSms(updated.organizer.phone, answerText(updated), { changeId: updated.id, kind: 'answer' });
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
    await sendSms(updated.coparent.phone, `${updated.organizer.role} : c'est d'accord, tu peux ${describe(updated)}. Merci !`,
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
      await sendSms(c.coparent.phone, `${c.organizer.role} : finalement, le changement prévu ${frDate(c.date)} est annulé. Rien à faire.`,
        { changeId: c.id, kind: 'cancel' });
      return { ok: true, notified: true };
    }
    return { ok: true, notified: false };
  }

  // --- SMS entrants (OUI / NON / STOP) ---------------------------------------------------
  function parseReply(body) {
    const t = String(body || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!\s]+$/g, '');
    if (/^(STOP|ARRET|STOPALL|UNSUBSCRIBE)$/.test(t)) return 'stop';
    if (/^START$/.test(t)) return 'start';
    if (/^(OUI|O|OK|D'?ACCORD|YES|Y|OUAIS|CA MARCHE|C'?EST NOTE|NOTE)$/.test(t)) return 'yes';
    if (/^(NON|N|NO|PAS POSSIBLE|IMPOSSIBLE)$/.test(t)) return 'no';
    return null;
  }

  async function handleInbound(rawPhone, body) {
    const phone = normalizePhone(rawPhone) || String(rawPhone);
    q('INSERT INTO sms_log (direction, kind, phone, body) VALUES (?, ?, ?, ?)').run('in', 'reply', phone, String(body).slice(0, 500));
    // Un SMS qui contient un code d'invitation enregistre l'expéditeur : l'opérateur garantit le numéro.
    const codeFromSms = parseCode(body, CLAIM_LENGTH);
    if (codeFromSms) {
      const res = claim(codeFromSms, phone);
      if (res.ok) {
        optIn(phone); // le proche vient d'écrire lui-même : il veut recevoir les messages
        return { action: 'claim', reply: `C'est enregistré : ce numéro est « ${res.role} ». Vous recevrez les changements de planning de ${res.organizerRole}. STOP pour arrêter.` };
      }
    }
    const intent = parseReply(body);

    if (intent === 'stop') {
      optOut(phone);
      return { action: 'stop', reply: 'Vous ne recevrez plus de messages de Deux Toits. Envoyez START pour les réactiver.' };
    }
    if (intent === 'start') {
      optIn(phone);
      return { action: 'start', reply: 'Les messages de Deux Toits sont réactivés.' };
    }

    // OUI/NON ne s'applique qu'à la demande à laquelle le dernier SMS reçu par ce numéro posait la question.
    // Un « ok » envoyé après un rappel ou une annulation n'accepte donc rien par erreur.
    const last = q(`SELECT kind, change_id FROM sms_log WHERE direction = 'out' AND phone = ? ORDER BY id DESC LIMIT 1`).get(phone);
    const target = last?.kind === 'ask' && last.change_id ? getChange(last.change_id) : null;
    if (target && target.status === 'pending' && !target.isPast && intent) {
      const r = await respond(target, intent);
      if (r.ok) return { action: intent, reply: intent === 'yes' ? 'Merci, c\'est noté.' : 'Merci, la réponse a été transmise.' };
    }

    const pending = q(`SELECT c.id FROM changes c JOIN coparents p ON p.id = c.coparent_id
                       WHERE p.phone = ? AND c.status = 'pending' AND c.date >= ? ORDER BY c.id DESC LIMIT 1`).get(phone, today());
    if (!pending) return { action: 'none', reply: null };
    const c = getChange(pending.id);
    return { action: 'unknown', reply: `Pour répondre à la demande de ${c.organizer.role} (${frDate(c.date)}) : ${baseUrl}/r/${c.token}` };
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
        if (c.coparent.opted_out) continue;
        const res = await sendSms(c.coparent.phone, reminderText(c), { changeId: id, kind: 'reminder' });
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
  function week(organizerId, startIso) {
    const org = q('SELECT * FROM organizers WHERE id = ?').get(organizerId);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(startIso, i);
      const changes = q(`SELECT id FROM changes WHERE organizer_id = ? AND date = ? AND status != 'cancelled'
                         ORDER BY time`).all(organizerId, date).map((r) => getChange(r.id));
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
    createChange, previewText, getChange, getChangeByToken, respond, acceptCounter, cancelChange, counterOptions,
    handleInbound, parseReply, runReminders, week, sendSms, isOptedOut, optOut,
    addCoparent, renewClaim, findInvitation, claim, claimAndConfirm
  };
}

export class UserError extends Error {}

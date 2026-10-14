import crypto from 'node:crypto';
import { promisify } from 'node:util';

export const TZ = process.env.TZ_FAMILLE || 'Europe/Paris';

// --- Téléphones ---------------------------------------------------------
// Accepte « 06 12 34 56 78 », « 0612345678 », « +33 6 12 34 56 78 », « 0033… ».
export function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s.\-()]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (/^0[1-9]\d{8}$/.test(p)) p = '+33' + p.slice(1);
  if (!/^\+\d{8,15}$/.test(p)) return null;
  return p;
}

// --- Santé : jamais dans un SMS ---------------------------------------
// Comparaison sans accents (les claviers iOS envoient parfois des accents décomposés).
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const HEALTH_WORDS = [
  'medicament', 'inhalateur', 'ventoline', 'traitement', 'ordonnance', 'fievre', 'doliprane',
  'sirop', 'antibiotique', 'insuline', 'allergi', 'epipen', 'gouttes', 'pommade', 'vaccin',
  'sante', 'pediatre', 'pharmacie', 'orthophon', 'medecin', 'docteur', 'dentiste', 'orthodont',
  'hopital', 'urgences', 'kine', 'psy', 'infirmi', 'clinique', 'cmp', 'cmpp', 'aerosol', 'nebuliseur'
];
export function isHealthItem(label) {
  const l = fold(label);
  return HEALTH_WORDS.some((w) => new RegExp(`(^|[^a-z])${w}`).test(l));
}
export function splitItems(rawList) {
  const items = [];
  const privateItems = [];
  for (const raw of rawList) {
    const label = String(raw || '').trim().slice(0, 40);
    if (!label) continue;
    (isHealthItem(label) ? privateItems : items).push(label);
  }
  return { items, privateItems };
}

// --- Dates --------------------------------------------------------------
// Date du jour (AAAA-MM-JJ) et heure (HH:MM) dans le fuseau de la famille.
export function localParts(now = new Date()) {
  const f = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function isValidDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || '')) return false;
  const d = new Date(isoDate + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === isoDate;
}
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayOfWeek(isoDate) {
  return new Date(isoDate + 'T12:00:00Z').getUTCDay();
}
// « mercredi 22 oct. »
export function frDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}
export function frDayName(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// « 16 h 30 »
export function frTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}
export function shiftTime(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// --- Divers ---------------------------------------------------------------
export function newToken(bytes = 9) {
  return crypto.randomBytes(bytes).toString('base64url');
}
export function joinFr(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Mots de passe (scrypt asynchrone : ne bloque pas le serveur) ----------------
const scrypt = promisify(crypto.scrypt);
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export async function checkPassword(pw, stored) {
  const [, s, h] = String(stored).split('$');
  if (!s || !h) return false;
  const hash = await scrypt(pw, Buffer.from(s, 'base64'), 32);
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'base64'));
}

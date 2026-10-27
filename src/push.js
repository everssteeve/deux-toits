// Notifications Web Push (VAPID). Aucun numéro de téléphone, aucun e-mail : l'appareil est un identifiant anonyme.
// Le message est chiffré de bout en bout entre le serveur et l'appareil ; le service de push du navigateur ne voit que du chiffré.
//   PUSH_PROVIDER=webpush (défaut)
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY : facultatives, sinon générées une fois et gardées dans la base.
import webpush from 'web-push';

function vapidKeys(db, env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const pub = get.get('vapid_public')?.value;
  const priv = get.get('vapid_private')?.value;
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const keys = webpush.generateVAPIDKeys();
  const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  set.run('vapid_public', keys.publicKey);
  set.run('vapid_private', keys.privateKey);
  return keys;
}

export function createPushProvider({ db, baseUrl, env = process.env }) {
  const keys = vapidKeys(db, env);
  // Le « sujet » VAPID est l'adresse du site (une URL est acceptée à la place d'un e-mail).
  const options = { vapidDetails: { subject: baseUrl, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24 };
  return {
    name: 'webpush',
    publicKey: keys.publicKey,
    async send(subscription, payload) {
      await webpush.sendNotification(subscription, JSON.stringify(payload), options);
    }
  };
}

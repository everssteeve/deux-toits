// Fournisseurs SMS interchangeables. Choix par la variable SMS_PROVIDER :
//   console (par défaut) : rien n'est envoyé, les SMS s'affichent sur /dev/sms
//   twilio               : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (numéro bidirectionnel)
//   brevo                : BREVO_API_KEY, BREVO_SENDER
// Pour que l'autre parent puisse répondre OUI/NON par SMS, il faut un numéro
// capable de RECEVOIR des SMS (Twilio). Un expéditeur alphanumérique (Brevo) ne
// peut pas recevoir de réponse : la page de réponse par lien reste alors le seul canal.

export function createSmsProvider(env = process.env) {
  const name = (env.SMS_PROVIDER || 'console').toLowerCase();

  if (name === 'twilio') {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_FROM;
    if (!sid || !token || !from) throw new Error('Twilio : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM sont requis.');
    return {
      name, canReceive: true,
      async send(to, body) {
        const params = new URLSearchParams({ To: to, Body: body });
        if (from.startsWith('MG')) params.set('MessagingServiceSid', from); else params.set('From', from);
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Twilio ${res.status} : ${data.message || 'erreur inconnue'}`);
        return { id: data.sid };
      }
    };
  }

  if (name === 'brevo') {
    const key = env.BREVO_API_KEY;
    const sender = env.BREVO_SENDER || 'DeuxToits';
    if (!key) throw new Error('Brevo : BREVO_API_KEY est requis.');
    return {
      name, canReceive: false,
      async send(to, body) {
        const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
          method: 'POST',
          headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender, recipient: to.replace(/^\+/, ''), content: body, type: 'transactional' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Brevo ${res.status} : ${data.message || 'erreur inconnue'}`);
        return { id: String(data.messageId ?? '') };
      }
    };
  }

  // Mode console : idéal pour tester le parcours sans compte SMS.
  return {
    name: 'console', canReceive: true,
    async send(to, body) {
      console.log(`\n📱 SMS simulé → ${to}\n${body}\n`);
      return { id: 'console-' + Date.now() };
    }
  };
}

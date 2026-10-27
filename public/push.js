// Active ou désactive les notifications sur cet appareil. Ne fait rien sur les pages sans [data-push].
(function () {
  const root = document.querySelector('[data-push]');
  if (!root) return;
  const status = root.querySelector('[data-push-status]');
  const on = root.querySelector('[data-push-on]');
  const off = root.querySelector('[data-push-off]');
  const { key, base, scope, sw } = root.dataset;

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    status.textContent = 'Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d\'abord cette page à l\'écran d\'accueil, puis rouvrez-la de là.';
    return;
  }

  const post = (path, body) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin'
  });
  const toBytes = (b64) => {
    const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  let registration;
  async function refresh() {
    const sub = await registration.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      await post('/push', sub.toJSON()); // resynchronise le serveur (idempotent)
      status.textContent = 'Les notifications sont activées sur cet appareil.';
      on.hidden = true; off.hidden = false;
    } else if (Notification.permission === 'denied') {
      status.textContent = 'Les notifications sont bloquées dans les réglages du navigateur pour ce site.';
      on.hidden = true; off.hidden = true;
    } else {
      status.textContent = 'Les notifications ne sont pas activées sur cet appareil.';
      on.hidden = false; off.hidden = true;
    }
  }

  on.addEventListener('click', async () => {
    on.disabled = true;
    try {
      if ((await Notification.requestPermission()) === 'granted') {
        const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
        const r = await post('/push', sub.toJSON());
        if (!r.ok) throw new Error('refus du serveur');
      }
    } catch (e) {
      status.textContent = 'Activation impossible : ' + e.message;
      on.disabled = false;
      return;
    }
    on.disabled = false;
    refresh();
  });
  off.addEventListener('click', async () => {
    const sub = await registration.pushManager.getSubscription();
    if (sub) { await post('/push/delete', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    refresh();
  });

  navigator.serviceWorker.register(sw, { scope }).then((r) => { registration = r; return navigator.serviceWorker.ready; })
    .then((r) => { registration = r; return refresh(); })
    .catch((e) => { status.textContent = 'Notifications indisponibles : ' + e.message; });
})();

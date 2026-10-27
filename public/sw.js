// Service worker de Deux Toits : reçoit les notifications Web Push et gère leurs boutons.
// Il est enregistré avec la portée de la page (l'organisateur : « / », un proche : « /m/<lien secret>/ »),
// donc le lien secret n'a jamais besoin de voyager dans la notification : on le lit dans self.registration.scope.
const scope = self.registration.scope;
const isMember = new URL(scope).pathname.startsWith('/m/');

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data.json(); } catch { /* message vide ou illisible */ }
  event.waitUntil(self.registration.showNotification(d.title || 'Deux Toits', {
    body: d.body || '',
    tag: d.changeId ? `change-${d.changeId}` : undefined,
    renotify: !!d.changeId,
    icon: '/icon.svg',
    // Les boutons Oui/Non n'ont de sens que pour un proche et une demande en attente.
    actions: isMember && d.changeId && Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    data: { changeId: d.changeId || null }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.changeId;
  if (isMember && id && (event.action === 'yes' || event.action === 'no')) {
    event.waitUntil(
      fetch(`${scope}changes/${id}/answer`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: event.action })
      }).then((r) => r.json())
        .then((r) => self.registration.showNotification('Deux Toits', { body: r.ok ? 'Réponse envoyée.' : (r.message || 'Réponse impossible.'), icon: '/icon.svg' }))
        .catch(() => self.registration.showNotification('Deux Toits', { body: 'Réponse non envoyée : ouvrez la page pour répondre.', icon: '/icon.svg' }))
    );
    return;
  }
  const target = isMember ? `${scope}${id ? `?c=${id}` : ''}` : (id ? `${scope}changes/${id}` : scope);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
    const open = all.find((c) => c.url.startsWith(scope));
    if (open && 'navigate' in open) return open.navigate(target).then((c) => c && c.focus());
    return self.clients.openWindow(target);
  }));
});

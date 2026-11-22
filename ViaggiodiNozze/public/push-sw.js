function appUrl(value) {
  const scopeUrl = new URL(self.registration.scope);
  try {
    const target = new URL(typeof value === 'string' ? value : './', scopeUrl);
    if (target.origin !== scopeUrl.origin || !target.pathname.startsWith(scopeUrl.pathname)) return scopeUrl.href;
    return target.href;
  } catch {
    return scopeUrl.href;
  }
}

self.addEventListener('push', event => {
  let data = { title: 'Aggiornamento HOUNIGO', body: 'Apri l’app per vedere i dettagli.', url: './?pushView=oggi' };
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = {
        title: typeof parsed.title === 'string' ? parsed.title : data.title,
        body: typeof parsed.body === 'string' ? parsed.body : data.body,
        url: typeof parsed.url === 'string' ? parsed.url : data.url,
        tag: typeof parsed.tag === 'string' ? parsed.tag : undefined,
        type: typeof parsed.type === 'string' ? parsed.type : undefined,
      };
    } catch {
      data.body = event.data.text().slice(0, 180);
    }
  }

  const scopeUrl = new URL(self.registration.scope);
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: new URL('pwa-192x192.png', scopeUrl).href,
    badge: new URL('pwa-192x192.png', scopeUrl).href,
    tag: data.tag || 'hounigo-update',
    renotify: false,
    data: { url: appUrl(data.url), type: data.type || 'generic' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = appUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (new URL(client.url).origin === new URL(targetUrl).origin && 'focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
  })());
});

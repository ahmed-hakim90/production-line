/* global importScripts, firebase */
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

async function initMessaging() {
  try {
    const res = await fetch('/__/firebase/init.json');
    if (!res.ok) return null;
    const config = await res.json();
    if (!config?.apiKey) return null;
    firebase.initializeApp(config);
    return firebase.messaging();
  } catch {
    return null;
  }
}

initMessaging().then((messaging) => {
  if (!messaging) return;
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'إشعار جديد';
    const body = payload.notification?.body || '';
    const link = payload.data?.url || payload.data?.link || '/';
    self.registration.showNotification(title, {
      body,
      icon: '/icons/pwa-icon-192.png',
      badge: '/icons/pwa-icon-192.png',
      data: { link },
      actions: [
        { action: 'open', title: 'فتح' },
        { action: 'dismiss', title: 'تجاهل' },
      ],
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [150, 50, 150],
      tag: payload.data?.notificationId || payload.data?.reportId || 'erp-notification',
    });
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const raw = String(event.notification?.data?.link || '/').trim() || '/';
  let path = '/';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      path = u.origin === self.location.origin ? `${u.pathname}${u.search}` || '/' : '/';
    } else if (raw.startsWith('#/')) {
      path = raw.slice(1);
    } else if (raw.startsWith('#')) {
      path = raw.slice(1) || '/';
    } else {
      path = raw.startsWith('/') ? raw : `/${raw}`;
    }
  } catch {
    path = '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const fullUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', targetUrl: path });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(fullUrl);
      return undefined;
    }),
  );
});

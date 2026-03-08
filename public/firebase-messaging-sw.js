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
    const link = payload.data?.link || '/';
    self.registration.showNotification(title, {
      body,
      icon: '/icons/pwa-icon-192.png',
      badge: '/icons/pwa-icon-192.png',
      data: { link },
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [150, 50, 150],
      tag: payload.data?.notificationId || 'erp-notification',
    });
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', targetUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});

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

// Resolve notification type → hash-based route used inside the PWA.
function resolveLink(data) {
  if (!data) return '/#/';
  if (data.url) {
    const u = String(data.url);
    // Already a full URL or hash URL → use as-is
    if (u.startsWith('http') || u.startsWith('/#')) return u;
    // Bare path like "/work-orders" → prepend hash
    return '/#' + (u.startsWith('/') ? u : '/' + u);
  }
  if (data.link) return String(data.link);
  // Type-based fallback
  switch (String(data.type || '')) {
    case 'work_order_completed': return '/#/work-orders';
    case 'plan_completed':       return '/#/production-plans';
    case 'production_report':    return '/#/reports';
    default:                     return '/#/';
  }
}

initMessaging().then((messaging) => {
  if (!messaging) return;
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'إشعار جديد';
    const body  = payload.notification?.body  || '';
    const link  = resolveLink(payload.data);
    const tag   = payload.data?.notificationId
               || payload.data?.reportId
               || payload.data?.workOrderId
               || payload.data?.planId
               || 'erp-notification';

    self.registration.showNotification(title, {
      body,
      icon: '/icons/pwa-icon-192.png',
      badge: '/icons/pwa-icon-192.png',
      data: { link, notificationType: payload.data?.type || '' },
      actions: [
        { action: 'open',    title: 'فتح' },
        { action: 'dismiss', title: 'تجاهل' },
      ],
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [150, 50, 150],
      tag,
    });
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data       = event.notification.data || {};
  const targetUrl  = String(data.link || '/#/');
  const notifType  = String(data.notificationType || '');

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
      // Focus an existing window if possible and send a message so the app
      // can navigate to the right route without a full reload.
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'notification-click', targetUrl, notificationType: notifType });
          return client.focus();
        }
      }
      // No existing window — open the app at the target route.
      if (clients.openWindow) return clients.openWindow(targetUrl);
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

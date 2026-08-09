/** Bumped when client cache policy changes — triggers purge for all users on next visit. */
export const CLIENT_CACHE_POLICY = 'no-pwa-precache-v1';

export const CLIENT_CACHE_STAMP_KEY = 'erp_client_cache_stamp';

/** FCM push SW must not control `/` or it can interfere with module loads. */
export const FIREBASE_MESSAGING_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export function buildClientCacheStamp(appVersion: string): string {
  return `${CLIENT_CACHE_POLICY}:${appVersion}`;
}

/** This app intentionally does not use Cache Storage — any key is leftover (often from another local project). */
export async function purgeAllCacheStorage(): Promise<string[]> {
  if (!('caches' in window)) return [];
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    return keys;
  } catch {
    return [];
  }
}

export async function purgeServiceWorkersAndCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    await purgeAllCacheStorage();
  } catch {
    /* storage / SW APIs may be unavailable */
  }
}

/**
 * Soft hygiene on every boot: drop orphan Cache Storage and any SW that claimed the whole origin.
 * Keeps a correctly-scoped Firebase messaging registration when present.
 */
export async function purgeOrphanClientRuntimeCaches(): Promise<void> {
  try {
    await purgeAllCacheStorage();
    if (!('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        const scriptURL = registration.active?.scriptURL
          || registration.waiting?.scriptURL
          || registration.installing?.scriptURL
          || '';
        const isFirebaseMessaging = /\/firebase-messaging-sw\.js(?:\?|$)/.test(scriptURL);
        const scopePath = (() => {
          try {
            return new URL(registration.scope).pathname;
          } catch {
            return registration.scope;
          }
        })();
        const scopeOk =
          scopePath === FIREBASE_MESSAGING_SW_SCOPE
          || scopePath === `${FIREBASE_MESSAGING_SW_SCOPE}/`;
        // Unregister origin-wide controllers and non-FCM leftovers from other apps on :3000.
        if (!isFirebaseMessaging || !scopeOk) {
          await registration.unregister();
        }
      }),
    );
  } catch {
    /* ignore */
  }
}

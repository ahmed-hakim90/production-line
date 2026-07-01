/** Bumped when client cache policy changes — triggers purge for all users on next visit. */
export const CLIENT_CACHE_POLICY = 'no-pwa-precache-v1';

export const CLIENT_CACHE_STAMP_KEY = 'erp_client_cache_stamp';

export function buildClientCacheStamp(appVersion: string): string {
  return `${CLIENT_CACHE_POLICY}:${appVersion}`;
}

export async function purgeServiceWorkersAndCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* storage / SW APIs may be unavailable */
  }
}

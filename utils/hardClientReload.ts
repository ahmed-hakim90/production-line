/**
 * Unregisters service workers, clears Cache Storage, then navigates to the app root.
 * Uses `location.replace` (not `reload`) so a full document request hits `/index.html`:
 * after SW removal, `reload()` on a client-only path (e.g. /production/...) makes the
 * server resolve that path as a file — Vercel returns 404 without SPA rewrites; PWA
 * standalone was often relying on the SW navigateFallback instead.
 */
export async function hardClientReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* still navigate */
  }

  const url = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
  url.searchParams.set('_sw_reload', String(Date.now()));
  window.location.replace(url.href);
}

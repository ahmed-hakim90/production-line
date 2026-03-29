/**
 * Unregisters service workers, clears Cache Storage, then reloads.
 * Used after a new deployment so PWA / SW caches do not keep an old bundle.
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
    /* still reload */
  }
  window.location.reload();
}

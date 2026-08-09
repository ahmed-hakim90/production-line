import {
  buildClientCacheStamp,
  CLIENT_CACHE_STAMP_KEY,
  purgeOrphanClientRuntimeCaches,
  purgeServiceWorkersAndCaches,
} from '../utils/clientCachePurge';
import { hardClientReload } from '../utils/hardClientReload';

const RELOAD_GUARD_PREFIX = 'erp_cache_fresh_reload:';

/**
 * Disables legacy Workbox precache for all users:
 * - Always strips orphan Cache Storage / origin-wide SW leftovers (other apps on same origin).
 * - On first visit or when __APP_VERSION__ changes, unregisters SWs and clears Cache Storage.
 * - Reloads once so the browser fetches fresh assets from the network (keeps current path).
 */
export async function ensureFreshClientWithoutPwaCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  await purgeOrphanClientRuntimeCaches();

  const stamp = buildClientCacheStamp(__APP_VERSION__);
  const previous = localStorage.getItem(CLIENT_CACHE_STAMP_KEY);
  if (previous === stamp) return;

  await purgeServiceWorkersAndCaches();
  localStorage.setItem(CLIENT_CACHE_STAMP_KEY, stamp);

  if (!previous) return;

  const reloadGuard = `${RELOAD_GUARD_PREFIX}${stamp}`;
  if (sessionStorage.getItem(reloadGuard)) return;

  sessionStorage.setItem(reloadGuard, '1');
  await hardClientReload();
  await new Promise<void>(() => {
    /* navigation in progress */
  });
}

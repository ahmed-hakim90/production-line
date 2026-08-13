import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { auth, db, isConfigured } from '../modules/auth/services/firebase';
import { invalidatePageDataCache } from '../modules/shared/lib/pageDataCache';
import { queryClient } from './queryClient';
import { shouldCoalesceNetworkRecovery } from './firestoreErrorUtils';

/** Fired after auth token + Firestore Listen channels have been reset. */
export const NETWORK_RECOVERED_EVENT = 'forgeops:network-recovered';

const SETTLE_MS = 400;
const MIN_INTERVAL_MS = 4000;

let inFlight: Promise<boolean> | null = null;
let lastRecoveredAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function refreshAuthToken(): Promise<void> {
  if (!isConfigured || !auth?.currentUser) return;
  await auth.currentUser.getIdToken(true);
}

async function resetFirestoreListenChannels(): Promise<void> {
  if (!isConfigured || !db) return;
  try {
    await disableNetwork(db);
    await enableNetwork(db);
  } catch {
    await enableNetwork(db);
  }
}

/**
 * After the browser comes back online, Firestore Listen channels often resume
 * without a fresh Auth token and surface `permission-denied` until a full reload.
 * Reset the token + network, then notify the UI to retry.
 */
export async function recoverFirestoreAfterReconnect(): Promise<boolean> {
  if (inFlight) return inFlight;
  if (shouldCoalesceNetworkRecovery(lastRecoveredAt, Date.now(), MIN_INTERVAL_MS)) {
    return false;
  }

  inFlight = (async () => {
    await sleep(SETTLE_MS);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

    try {
      await refreshAuthToken();
    } catch {
      /* still flaky; continue so enableNetwork can retry Listen */
    }

    try {
      await resetFirestoreListenChannels();
    } catch {
      /* ignore — UI retry still helps once the socket is back */
    }

    invalidatePageDataCache();
    await queryClient.invalidateQueries();
    lastRecoveredAt = Date.now();
    window.dispatchEvent(new Event(NETWORK_RECOVERED_EVENT));
    return true;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function startFirestoreNetworkRecoveryListener(): () => void {
  const onOnline = () => {
    void recoverFirestoreAfterReconnect();
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

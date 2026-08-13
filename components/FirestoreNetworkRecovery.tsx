import { useEffect } from 'react';
import { startFirestoreNetworkRecoveryListener } from '@/lib/firestoreNetworkRecovery';

/** Always-mounted: recovers Firestore/Auth when the browser comes back online. */
export function FirestoreNetworkRecovery() {
  useEffect(() => startFirestoreNetworkRecoveryListener(), []);
  return null;
}

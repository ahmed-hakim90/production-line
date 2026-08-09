import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isConfigured } from '../../auth/services/firebase';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair } from '../types';

/**
 * Branch scope for sidebar badge queries (no React / permission helpers).
 * Empty array → caller should attempt tenant-wide list (admins / approvers).
 */
export async function resolveCurrentUserRepairBranchIdsForBadge(): Promise<string[]> {
  const uid = auth?.currentUser?.uid;
  if (!isConfigured || !uid) return [];
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return [];
    return resolveUserRepairBranchIds({
      id: snap.id,
      ...(snap.data() as Omit<FirestoreUserWithRepair, 'id'>),
    });
  } catch {
    return [];
  }
}

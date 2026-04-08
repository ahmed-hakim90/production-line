import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { FirestoreUser } from '../../../types';

const UID_KEY_SEP = '\u001e';

export function resolveUserLabelFromDoc(data: Partial<FirestoreUser> | undefined, uid: string): string {
  const name = String(data?.displayName || '').trim();
  const email = String(data?.email || '').trim();
  if (name) return name;
  if (email) return email;
  return uid.length > 12 ? `${uid.slice(0, 8)}…` : uid;
}

/** Loads `users/{uid}` displayName/email for a set of UIDs (e.g. online dispatch actors). */
export function useFirestoreUserLabels(uids: (string | undefined | null)[]): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  /** Stable primitive so effects do not re-run on every parent array reference. */
  const uidSetKey = [...new Set(uids.filter((u): u is string => Boolean(u)))]
    .sort()
    .join(UID_KEY_SEP);

  useEffect(() => {
    if (!isConfigured || !uidSetKey) {
      setLabels({});
      return;
    }
    const list = uidSetKey.split(UID_KEY_SEP);
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        list.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (!snap.exists()) {
              next[uid] = 'غير معروف';
              return;
            }
            next[uid] = resolveUserLabelFromDoc(snap.data() as Partial<FirestoreUser>, uid);
          } catch {
            next[uid] = 'غير معروف';
          }
        }),
      );
      if (!cancelled) setLabels(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [uidSetKey]);

  return labels;
}

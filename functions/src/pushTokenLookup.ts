import type { DocumentReference, Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';

export const PUSH_USER_DEVICES_COLLECTION = 'user_devices';
export const PUSH_EMPLOYEES_COLLECTION = 'employees';
export const PUSH_USERS_COLLECTION = 'users';
export const PUSH_FCM_TOKEN_SUBCOLLECTION = 'fcmTokens';

export type PushTokenRow = {
  token?: string;
  enabled?: boolean;
};

export type PushTokenTarget = {
  token: string;
  refs: DocumentReference[];
};

export function isPushTokenEnabled(row: PushTokenRow): boolean {
  return row.enabled !== false;
}

export function enabledUniqueTokens(rows: PushTokenRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const token = String(row.token || '').trim();
    if (!token || !isPushTokenEnabled(row) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Work-order notifications key off employeeId. Also keep user-scoped
 * user_devices + fcmTokens so a token registered before the employee link still sends.
 */
export function mergeRecipientPushTokens(input: {
  employeeDevices: PushTokenRow[];
  userDevices: PushTokenRow[];
  userFcmTokens: PushTokenRow[];
}): string[] {
  return enabledUniqueTokens([
    ...input.employeeDevices,
    ...input.userDevices,
    ...input.userFcmTokens,
  ]);
}

function addTarget(
  map: Map<string, PushTokenTarget>,
  token: string,
  ref: DocumentReference,
  enabled: boolean | undefined,
): void {
  if (enabled === false) return;
  const trimmed = String(token || '').trim();
  if (!trimmed) return;
  const existing = map.get(trimmed);
  if (existing) {
    if (!existing.refs.some((item) => item.path === ref.path)) existing.refs.push(ref);
    return;
  }
  map.set(trimmed, { token: trimmed, refs: [ref] });
}

async function queryDevicesByField(
  db: Firestore,
  field: 'employeeId' | 'userId',
  value: string,
): Promise<QueryDocumentSnapshot[]> {
  const col = db.collection(PUSH_USER_DEVICES_COLLECTION);
  const loadUnfiltered = async () => {
    const snap = await col.where(field, '==', value).get();
    return snap.docs.filter((doc) => isPushTokenEnabled(doc.data() as PushTokenRow));
  };
  try {
    const snap = await col.where(field, '==', value).where('enabled', '==', true).get();
    if (!snap.empty) return snap.docs;
    return loadUnfiltered();
  } catch {
    return loadUnfiltered();
  }
}

export async function resolveRecipientUserIds(db: Firestore, recipientId: string): Promise<string[]> {
  const id = String(recipientId || '').trim();
  if (!id) return [];
  const ids = new Set<string>();

  const employeeSnap = await db.collection(PUSH_EMPLOYEES_COLLECTION).doc(id).get();
  if (employeeSnap.exists) {
    const data = employeeSnap.data() as { userId?: string; email?: string } | undefined;
    const uid = String(data?.userId || '').trim();
    if (uid) ids.add(uid);
    const email = String(data?.email || '').trim();
    if (!uid && email) {
      try {
        const byEmail = await db.collection(PUSH_USERS_COLLECTION).where('email', '==', email).limit(5).get();
        byEmail.docs.forEach((doc) => ids.add(doc.id));
      } catch {
        // email lookup is best-effort; missing index must not block employee-scoped devices
      }
    }
  }

  const userSnap = await db.collection(PUSH_USERS_COLLECTION).doc(id).get();
  if (userSnap.exists) ids.add(id);

  try {
    const linkedEmployees = await db.collection(PUSH_EMPLOYEES_COLLECTION).where('userId', '==', id).limit(5).get();
    if (!linkedEmployees.empty) ids.add(id);
  } catch {
    // ignore missing index; employee doc / user doc paths above still apply
  }

  return [...ids];
}

export async function collectPushTokenTargets(
  db: Firestore,
  recipientId: string,
): Promise<PushTokenTarget[]> {
  const id = String(recipientId || '').trim();
  if (!id) return [];

  const employeeDocs = await queryDevicesByField(db, 'employeeId', id);
  const userIds = await resolveRecipientUserIds(db, id);

  const userDeviceDocs: QueryDocumentSnapshot[] = [];
  const fcmDocs: QueryDocumentSnapshot[] = [];
  for (const userId of userIds) {
    const devices = await queryDevicesByField(db, 'userId', userId);
    userDeviceDocs.push(...devices);
    const tokensSnap = await db
      .collection(PUSH_USERS_COLLECTION)
      .doc(userId)
      .collection(PUSH_FCM_TOKEN_SUBCOLLECTION)
      .get();
    fcmDocs.push(...tokensSnap.docs);
  }

  const employeeRows = employeeDocs.map((doc) => {
    const data = doc.data() as PushTokenRow;
    return { token: String(data.token || doc.id), enabled: data.enabled };
  });
  const userDeviceRows = userDeviceDocs.map((doc) => {
    const data = doc.data() as PushTokenRow;
    return { token: String(data.token || doc.id), enabled: data.enabled };
  });
  const fcmRows = fcmDocs.map((doc) => doc.data() as PushTokenRow);
  const allowed = new Set(mergeRecipientPushTokens({
    employeeDevices: employeeRows,
    userDevices: userDeviceRows,
    userFcmTokens: fcmRows,
  }));

  const map = new Map<string, PushTokenTarget>();
  for (const doc of employeeDocs) {
    const data = doc.data() as PushTokenRow;
    const token = String(data.token || doc.id);
    if (!allowed.has(token)) continue;
    addTarget(map, token, doc.ref, data.enabled);
  }
  for (const doc of userDeviceDocs) {
    const data = doc.data() as PushTokenRow;
    const token = String(data.token || doc.id);
    if (!allowed.has(token)) continue;
    addTarget(map, token, doc.ref, data.enabled);
  }
  for (const doc of fcmDocs) {
    const data = doc.data() as PushTokenRow;
    const token = String(data.token || '').trim();
    if (!token || !allowed.has(token)) continue;
    addTarget(map, token, doc.ref, data.enabled);
  }
  return [...map.values()];
}

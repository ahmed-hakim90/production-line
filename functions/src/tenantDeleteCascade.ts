/**
 * Super-admin: delete all Firestore data + Auth users for one tenant.
 */
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { TENANT_DELETE_QUERY_COLLECTIONS } from './tenantBackupExport.js';

const USERS_COLLECTION = 'users';
const USER_DEVICES_COLLECTION = 'user_devices';
const USER_PRESENCE_COLLECTION = 'user_presence';
const BACKUPS_COLLECTION = 'backups';
const TENANTS_COLLECTION = 'tenants';
const TENANT_SLUGS_COLLECTION = 'tenant_slugs';

async function deleteQueryInBatches(
  db: Firestore,
  collName: string,
  tenantId: string,
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db
      .collection(collName)
      .where('tenantId', '==', tenantId)
      .limit(500)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function deleteCollectionPages(db: Firestore, colRef: CollectionReference): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await colRef.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

export async function deleteTenantCascade(
  db: Firestore,
  tenantId: string,
  slug: string,
): Promise<{ deletedFirestoreDocs: number; deletedAuthUsers: number }> {
  let deletedFirestoreDocs = 0;

  const usersSnap = await db.collection(USERS_COLLECTION).where('tenantId', '==', tenantId).get();
  const uids = usersSnap.docs.map((d) => d.id);

  for (const uid of uids) {
    deletedFirestoreDocs += await deleteCollectionPages(
      db,
      db.collection(USERS_COLLECTION).doc(uid).collection('preferences'),
    );
    deletedFirestoreDocs += await deleteCollectionPages(
      db,
      db.collection(USERS_COLLECTION).doc(uid).collection('fcmTokens'),
    );
    const pres = await db.collection(USER_PRESENCE_COLLECTION).doc(uid).get();
    if (pres.exists) {
      await pres.ref.delete();
      deletedFirestoreDocs += 1;
    }
    const devices = await db.collection(USER_DEVICES_COLLECTION).where('userId', '==', uid).get();
    if (!devices.empty) {
      const batch = db.batch();
      devices.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletedFirestoreDocs += devices.size;
    }
  }

  const dashRef = db.collection('dashboardStats').doc(tenantId);
  deletedFirestoreDocs += await deleteCollectionPages(db, dashRef.collection('daily'));
  deletedFirestoreDocs += await deleteCollectionPages(db, dashRef.collection('monthly'));
  const dashDoc = dashRef;
  const dashExists = await dashDoc.get();
  if (dashExists.exists) {
    await dashDoc.delete();
    deletedFirestoreDocs += 1;
  }

  const ssRef = db.collection('system_settings').doc(tenantId);
  const ssSnap = await ssRef.get();
  if (ssSnap.exists) {
    await ssRef.delete();
    deletedFirestoreDocs += 1;
  }

  for (const collName of TENANT_DELETE_QUERY_COLLECTIONS) {
    deletedFirestoreDocs += await deleteQueryInBatches(db, collName, tenantId);
  }

  deletedFirestoreDocs += await deleteQueryInBatches(db, BACKUPS_COLLECTION, tenantId);

  const tenantRef = db.collection(TENANTS_COLLECTION).doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (tenantSnap.exists) {
    await tenantRef.delete();
    deletedFirestoreDocs += 1;
  }

  const s = String(slug || '').trim().toLowerCase();
  if (s) {
    const slugRef = db.collection(TENANT_SLUGS_COLLECTION).doc(s);
    const slugSnap = await slugRef.get();
    if (slugSnap.exists) {
      await slugRef.delete();
      deletedFirestoreDocs += 1;
    }
  }

  let deletedAuthUsers = 0;
  for (const uid of uids) {
    try {
      await getAuth().deleteUser(uid);
      deletedAuthUsers += 1;
    } catch (e: unknown) {
      const code = String((e as { code?: string })?.code || '');
      if (!code.includes('user-not-found')) {
        throw e;
      }
    }
  }

  return { deletedFirestoreDocs, deletedAuthUsers };
}

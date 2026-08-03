/**
 * Super-admin tenant backup export (Admin SDK).
 * Mirrors client `services/backupService.ts` ALL_COLLECTIONS / COLLECTION_GROUPS layout.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { TENANT_SCOPED_COLLECTIONS } from './tenantFootprintCollections.js';

export const BACKUP_VERSION = '2.1.0';

/** Subcollection group names used in backup `collectionGroups` (aligned with client `backupService`). */
export const BACKUP_COLLECTION_GROUPS = ['preferences', 'fcmTokens', 'daily'] as const;

/**
 * Root collections in a full backup. Tenant-field collections come from the
 * footprint/delete registry; the remaining names use tenant-owned document paths.
 * Keep the client `services/backupService.ts` registry in this exact order.
 */
export const ALL_BACKUP_COLLECTIONS: readonly string[] = [
  ...TENANT_SCOPED_COLLECTIONS,
  'system_settings',
  'user_devices',
  'user_presence',
  'dashboardStats',
  'tenants',
];

const MAX_JSON_CHARS = 28 * 1024 * 1024;

async function readCollectionTenantScoped(
  db: Firestore,
  name: string,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  if (name === 'dashboardStats') {
    const [dailySnap, monthlySnap] = await Promise.all([
      db.collection('dashboardStats').doc(tenantId).collection('daily').get(),
      db.collection('dashboardStats').doc(tenantId).collection('monthly').get(),
    ]);
    return [
      ...dailySnap.docs.map((d) => ({ _docId: d.id, ...d.data() })),
      ...monthlySnap.docs.map((d) => ({ _docId: d.id, ...d.data() })),
    ];
  }
  if (name === 'tenants') {
    const d = await db.collection('tenants').doc(tenantId).get();
    return d.exists ? [{ _docId: d.id, ...d.data() }] : [];
  }
  if (name === 'system_settings') {
    const d = await db.collection('system_settings').doc(tenantId).get();
    return d.exists ? [{ _docId: d.id, ...d.data() }] : [];
  }
  if (name === 'user_devices') {
    const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).get();
    const out: Record<string, unknown>[] = [];
    for (const u of usersSnap.docs) {
      const devSnap = await db.collection('user_devices').where('userId', '==', u.id).get();
      devSnap.docs.forEach((d) => {
        out.push({ _docId: d.id, ...d.data() });
      });
    }
    return out;
  }
  if (name === 'user_presence') {
    const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).get();
    const out: Record<string, unknown>[] = [];
    for (const u of usersSnap.docs) {
      const d = await db.collection('user_presence').doc(u.id).get();
      if (d.exists) {
        out.push({ _docId: d.id, ...d.data() });
      }
    }
    return out;
  }
  const snap = await db.collection(name).where('tenantId', '==', tenantId).get();
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

async function readCollectionGroupTenantScoped(
  db: Firestore,
  groupName: string,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  if (groupName === 'daily') {
    const snap = await db.collection('dashboardStats').doc(tenantId).collection('daily').get();
    return snap.docs.map((d) => ({
      _path: d.ref.path,
      ...d.data(),
    }));
  }
  if (groupName === 'preferences' || groupName === 'fcmTokens') {
    const usersSnap = await db.collection('users').where('tenantId', '==', tenantId).get();
    const out: Record<string, unknown>[] = [];
    for (const u of usersSnap.docs) {
      const sub = await db.collection('users').doc(u.id).collection(groupName).get();
      sub.docs.forEach((d) => {
        out.push({ _path: d.ref.path, ...d.data() });
      });
    }
    return out;
  }
  return [];
}

export interface TenantBackupFile {
  metadata: {
    version: string;
    createdAt: string;
    type: 'full';
    collectionsIncluded: string[];
    documentCounts: Record<string, number>;
    totalDocuments: number;
    createdBy: string;
    tenantId: string;
  };
  collections: Record<string, Record<string, unknown>[]>;
  collectionGroups?: Record<string, Record<string, unknown>[]>;
}

export async function buildTenantBackup(
  db: Firestore,
  tenantId: string,
  createdBy: string,
): Promise<TenantBackupFile> {
  const collections: Record<string, Record<string, unknown>[]> = {};
  const collectionGroups: Record<string, Record<string, unknown>[]> = {};
  const documentCounts: Record<string, number> = {};
  let totalDocuments = 0;

  for (const name of ALL_BACKUP_COLLECTIONS) {
    const docs = await readCollectionTenantScoped(db, name, tenantId);
    collections[name] = docs;
    documentCounts[name] = docs.length;
    totalDocuments += docs.length;
  }

  for (const groupName of BACKUP_COLLECTION_GROUPS) {
    const docs = await readCollectionGroupTenantScoped(db, groupName, tenantId);
    collectionGroups[groupName] = docs;
    documentCounts[`group:${groupName}`] = docs.length;
    totalDocuments += docs.length;
  }

  return {
    metadata: {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      type: 'full',
      collectionsIncluded: [...ALL_BACKUP_COLLECTIONS],
      documentCounts,
      totalDocuments,
      createdBy,
      tenantId,
    },
    collections,
    collectionGroups,
  };
}

export function assertBackupJsonSize(backup: TenantBackupFile): void {
  const jsonStr = JSON.stringify(backup);
  if (jsonStr.length > MAX_JSON_CHARS) {
    throw new Error(
      'النسخة الاحتياطية كبيرة جداً لتُحمَّل عبر المتصفح. استخدم تصدير Google Cloud من صفحة «نسخة المشروع الكامل».',
    );
  }
}

export const TENANT_DELETE_QUERY_COLLECTIONS: readonly string[] = TENANT_SCOPED_COLLECTIONS;

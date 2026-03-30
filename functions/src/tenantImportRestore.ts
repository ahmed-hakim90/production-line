/**
 * Admin SDK import — bypasses client Firestore rules (super-admin only via Callable).
 * Mirrors client `backupService.importBackup` write/clear logic.
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ALL_BACKUP_COLLECTIONS,
  BACKUP_COLLECTION_GROUPS,
  BACKUP_VERSION,
} from './tenantBackupExport.js';

export type AdminRestoreMode = 'merge' | 'replace' | 'full_reset';

export interface AdminBackupFileInput {
  metadata: {
    version: string;
    type?: string;
    [key: string]: unknown;
  };
  collections: Record<string, Record<string, unknown>[]>;
  collectionGroups?: Record<string, Record<string, unknown>[]>;
}

function validateBackupShape(data: unknown): { valid: true } | { valid: false; error: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'ملف غير صالح' };
  }
  const d = data as AdminBackupFileInput;
  if (!d.metadata?.version) {
    return { valid: false, error: 'الملف لا يحتوي على رقم الإصدار' };
  }
  const [major] = String(d.metadata.version).split('.');
  const [currentMajor] = BACKUP_VERSION.split('.');
  if (major !== currentMajor) {
    return {
      valid: false,
      error: `إصدار الملف (${d.metadata.version}) غير متوافق مع الإصدار الحالي (${BACKUP_VERSION})`,
    };
  }
  if (!d.collections || typeof d.collections !== 'object') {
    return { valid: false, error: 'الملف لا يحتوي على collections' };
  }
  return { valid: true };
}

async function adminClearCollection(db: Firestore, name: string): Promise<void> {
  const col = db.collection(name);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await col.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function adminClearCollectionGroup(db: Firestore, groupName: string): Promise<void> {
  const q = db.collectionGroup(groupName);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await q.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function adminWriteDocuments(
  db: Firestore,
  collectionName: string,
  documents: Record<string, unknown>[],
  mode: AdminRestoreMode,
): Promise<void> {
  if (mode === 'replace' || mode === 'full_reset') {
    await adminClearCollection(db, collectionName);
  }
  const batchSize = 500;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = db.batch();
    const chunk = documents.slice(i, i + batchSize);
    chunk.forEach((docData) => {
      const { _docId, ...fields } = docData;
      const ref = _docId
        ? db.collection(collectionName).doc(String(_docId))
        : db.collection(collectionName).doc();
      batch.set(ref, fields as DocumentData, { merge: mode === 'merge' });
    });
    await batch.commit();
  }
}

async function adminWriteCollectionGroupDocuments(
  db: Firestore,
  collectionGroupName: string,
  documents: Record<string, unknown>[],
  mode: AdminRestoreMode,
): Promise<void> {
  if (mode === 'replace' || mode === 'full_reset') {
    await adminClearCollectionGroup(db, collectionGroupName);
  }
  const batchSize = 500;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = db.batch();
    const chunk = documents.slice(i, i + batchSize);
    chunk.forEach((docData) => {
      const { _path, ...fields } = docData;
      if (typeof _path !== 'string' || !_path.trim()) {
        return;
      }
      batch.set(db.doc(_path), fields as DocumentData, { merge: mode === 'merge' });
    });
    await batch.commit();
  }
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function runAdminImportBackup(
  db: Firestore,
  file: AdminBackupFileInput,
  mode: AdminRestoreMode,
): Promise<number> {
  const v = validateBackupShape(file);
  if (!v.valid) {
    throw new Error(v.error);
  }

  const collectionNames = Object.keys(file.collections);
  const collectionGroupNames = Object.keys(file.collectionGroups || {});
  let restored = 0;

  for (const name of collectionNames) {
    const docs = file.collections[name];
    if (docs && docs.length > 0) {
      await adminWriteDocuments(db, name, docs, mode);
      restored += docs.length;
    } else if (mode === 'full_reset' || mode === 'replace') {
      await adminClearCollection(db, name);
    }
  }

  for (const groupName of collectionGroupNames) {
    const docs = file.collectionGroups?.[groupName];
    if (docs && docs.length > 0) {
      await adminWriteCollectionGroupDocuments(db, groupName, docs, mode);
      restored += docs.length;
    } else if (mode === 'full_reset' || mode === 'replace') {
      await adminClearCollectionGroup(db, groupName);
    }
  }

  if (mode === 'full_reset') {
    for (const name of ALL_BACKUP_COLLECTIONS) {
      if (!collectionNames.includes(name)) {
        await adminClearCollection(db, name);
      }
    }
    for (const groupName of BACKUP_COLLECTION_GROUPS) {
      if (!collectionGroupNames.includes(groupName)) {
        await adminClearCollectionGroup(db, groupName);
      }
    }
  }

  return restored;
}

export async function saveAdminImportHistory(
  db: Firestore,
  params: {
    tenantId: string | undefined;
    mode: AdminRestoreMode;
    restored: number;
    collectionNames: string[];
    createdBy: string;
    fileMetadataType: string | undefined;
  },
): Promise<void> {
  const tid = String(params.tenantId || '').trim();
  if (!tid) return;
  await db.collection('backups').add({
    tenantId: tid,
    type: params.fileMetadataType || 'full',
    mode: params.mode,
    action: 'import',
    fileName: `restore_server_${params.mode}_${getTimestamp()}`,
    totalDocuments: params.restored,
    collectionsIncluded: params.collectionNames,
    createdBy: params.createdBy,
    createdAt: FieldValue.serverTimestamp(),
    source: 'admin_callable',
  });
}

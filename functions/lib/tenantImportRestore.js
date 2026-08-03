import { FieldValue } from 'firebase-admin/firestore';
import { ALL_BACKUP_COLLECTIONS, BACKUP_COLLECTION_GROUPS, BACKUP_VERSION, } from './tenantBackupExport.js';
const BACKUP_COLLECTION_ALLOWLIST = new Set(ALL_BACKUP_COLLECTIONS);
const BACKUP_GROUP_ALLOWLIST = new Set(BACKUP_COLLECTION_GROUPS);
function validateBackupShape(data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'ملف غير صالح' };
    }
    const d = data;
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
function resolveTargetTenantId(file, explicitTenantId) {
    const fromArg = String(explicitTenantId || '').trim();
    const fromMeta = String(file.metadata?.tenantId || '').trim();
    const tenantId = fromArg || fromMeta;
    if (!tenantId) {
        throw new Error('معرّف المستأجر مطلوب للاستعادة. مرّر tenantId أو ضعه في metadata.tenantId.');
    }
    if (fromArg && fromMeta && fromArg !== fromMeta) {
        throw new Error('معرّف المستأجر في الطلب لا يطابق metadata.tenantId في ملف النسخة.');
    }
    return tenantId;
}
function stampTenantId(fields, tenantId) {
    return { ...fields, tenantId };
}
async function adminClearTenantCollection(db, name, tenantId) {
    const col = db.collection(name);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const snap = await col.where('tenantId', '==', tenantId).limit(500).get();
        if (snap.empty)
            break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
}
async function adminClearTenantCollectionGroup(db, groupName, tenantId) {
    const q = db.collectionGroup(groupName).where('tenantId', '==', tenantId);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const snap = await q.limit(500).get();
        if (snap.empty)
            break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
}
function assertDocTenantAllowed(fields, tenantId, context) {
    const docTenant = String(fields.tenantId || '').trim();
    if (docTenant && docTenant !== tenantId) {
        throw new Error(`مستند في ${context} يتبع مستأجراً آخر ولا يمكن استعادته.`);
    }
}
async function adminWriteDocuments(db, collectionName, documents, mode, tenantId) {
    if (mode === 'replace' || mode === 'full_reset') {
        await adminClearTenantCollection(db, collectionName, tenantId);
    }
    const batchSize = 500;
    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = db.batch();
        const chunk = documents.slice(i, i + batchSize);
        chunk.forEach((docData) => {
            const { _docId, ...rawFields } = docData;
            assertDocTenantAllowed(rawFields, tenantId, collectionName);
            const fields = stampTenantId(rawFields, tenantId);
            const ref = _docId
                ? db.collection(collectionName).doc(String(_docId))
                : db.collection(collectionName).doc();
            batch.set(ref, fields, { merge: mode === 'merge' });
        });
        await batch.commit();
    }
}
async function adminWriteCollectionGroupDocuments(db, collectionGroupName, documents, mode, tenantId) {
    if (mode === 'replace' || mode === 'full_reset') {
        await adminClearTenantCollectionGroup(db, collectionGroupName, tenantId);
    }
    const batchSize = 500;
    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = db.batch();
        const chunk = documents.slice(i, i + batchSize);
        chunk.forEach((docData) => {
            const { _path, ...rawFields } = docData;
            if (typeof _path !== 'string' || !_path.trim()) {
                return;
            }
            assertDocTenantAllowed(rawFields, tenantId, collectionGroupName);
            const fields = stampTenantId(rawFields, tenantId);
            batch.set(db.doc(_path), fields, { merge: mode === 'merge' });
        });
        await batch.commit();
    }
}
function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
export async function runAdminImportBackup(db, file, mode, explicitTenantId) {
    const v = validateBackupShape(file);
    if (!v.valid) {
        throw new Error(v.error);
    }
    const tenantId = resolveTargetTenantId(file, explicitTenantId);
    const collectionNames = Object.keys(file.collections);
    const collectionGroupNames = Object.keys(file.collectionGroups || {});
    const unknownCollection = collectionNames.find((name) => !BACKUP_COLLECTION_ALLOWLIST.has(name));
    if (unknownCollection) {
        throw new Error(`المجموعة ${unknownCollection} غير مسجلة ضمن نطاق النسخ الاحتياطي.`);
    }
    const unknownGroup = collectionGroupNames.find((name) => !BACKUP_GROUP_ALLOWLIST.has(name));
    if (unknownGroup) {
        throw new Error(`المجموعة الفرعية ${unknownGroup} غير مسجلة ضمن نطاق النسخ الاحتياطي.`);
    }
    let restored = 0;
    for (const name of collectionNames) {
        const docs = file.collections[name];
        if (docs && docs.length > 0) {
            await adminWriteDocuments(db, name, docs, mode, tenantId);
            restored += docs.length;
        }
        else if (mode === 'full_reset' || mode === 'replace') {
            await adminClearTenantCollection(db, name, tenantId);
        }
    }
    for (const groupName of collectionGroupNames) {
        const docs = file.collectionGroups?.[groupName];
        if (docs && docs.length > 0) {
            await adminWriteCollectionGroupDocuments(db, groupName, docs, mode, tenantId);
            restored += docs.length;
        }
        else if (mode === 'full_reset' || mode === 'replace') {
            await adminClearTenantCollectionGroup(db, groupName, tenantId);
        }
    }
    if (mode === 'full_reset') {
        for (const name of ALL_BACKUP_COLLECTIONS) {
            if (!collectionNames.includes(name)) {
                await adminClearTenantCollection(db, name, tenantId);
            }
        }
        for (const groupName of BACKUP_COLLECTION_GROUPS) {
            if (!collectionGroupNames.includes(groupName)) {
                await adminClearTenantCollectionGroup(db, groupName, tenantId);
            }
        }
    }
    return { restored, tenantId };
}
export async function saveAdminImportHistory(db, params) {
    const tid = String(params.tenantId || '').trim();
    if (!tid)
        return;
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

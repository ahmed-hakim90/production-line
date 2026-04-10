/**
 * استيراد حزمة إيداعات العملاء عبر Admin SDK (إيداعات موكّدة وغيرها).
 */
import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
export const CUSTOMER_DEPOSITS_PACK_VERSION = 1;
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const COL_CUSTOMERS = 'customer_deposit_customers';
const COL_BANKS = 'customer_deposit_company_bank_accounts';
const COL_ENTRIES = 'customer_deposit_entries';
const COL_ADJUSTMENTS = 'customer_deposit_adjustments';
const COL_ENTRY_SEQUENCES = 'customer_deposit_entry_sequences';
const TS_FIELDS = new Set(['createdAt', 'updatedAt', 'confirmedAt']);
function parseIsoToTimestamp(value) {
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return undefined;
    return Timestamp.fromDate(d);
}
function deserializeDocumentFields(raw, importerUid) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (k === '_docId')
            continue;
        if (TS_FIELDS.has(k) && typeof v === 'string') {
            const ts = parseIsoToTimestamp(v);
            out[k] = ts ?? v;
            continue;
        }
        if (v === null || v === undefined) {
            out[k] = v;
            continue;
        }
        if (typeof v === 'object' && v !== null && '_seconds' in v) {
            const sec = v._seconds;
            const nano = v._nanoseconds ?? 0;
            if (typeof sec === 'number') {
                out[k] = new Timestamp(sec, nano);
                continue;
            }
        }
        out[k] = v;
    }
    if (out.createdByUid === undefined || out.createdByUid === '') {
        out.createdByUid = importerUid;
    }
    return out;
}
async function hasCustomerDepositsManage(db, uid) {
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists)
        return false;
    const user = userSnap.data();
    if (user.isSuperAdmin === true)
        return true;
    const roleId = String(user.roleId || '').trim();
    if (!roleId)
        return false;
    const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
    if (!roleSnap.exists)
        return false;
    const role = roleSnap.data();
    return role.permissions?.['customerDeposits.manage'] === true;
}
async function deleteTenantDocs(db, collectionName, tenantId) {
    let deleted = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const snap = await db.collection(collectionName).where('tenantId', '==', tenantId).limit(500).get();
        if (snap.empty)
            break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.size;
    }
    return deleted;
}
/** معرّف مستند صريح في الصف فقط — بدون توليد عشوائي (للعملاء/البنوك). */
function peekValidDocIdFromRow(row) {
    const s = String(row._docId ?? row.id ?? '').trim();
    if (!s || s.includes('/') || s === '.' || s === '..')
        return undefined;
    if (s.includes('(') || s.includes('مطلوب'))
        return undefined;
    return s;
}
/** إيداعات/تسويات: توليد UUID عند غياب معرّف صالح. */
function extractDocIdOptional(row) {
    return peekValidDocIdFromRow(row) ?? randomUUID();
}
async function loadCustomerMapsForTenant(db, tenantId) {
    const snap = await db.collection(COL_CUSTOMERS).where('tenantId', '==', tenantId).select('codeNormalized').get();
    const byCode = new Map();
    const byIdCode = new Map();
    const allIds = new Set();
    for (const d of snap.docs) {
        allIds.add(d.id);
        const cn = String(d.data()?.codeNormalized ?? '').trim();
        if (cn) {
            byCode.set(cn, d.id);
            byIdCode.set(d.id, cn);
        }
    }
    return { byCode, byIdCode, allIds };
}
async function loadBankMapsForTenant(db, tenantId) {
    const snap = await db
        .collection(COL_BANKS)
        .where('tenantId', '==', tenantId)
        .select('accountNumberNormalized')
        .get();
    const byAccount = new Map();
    const byIdAccount = new Map();
    const allIds = new Set();
    for (const d of snap.docs) {
        allIds.add(d.id);
        const an = String(d.data()?.accountNumberNormalized ?? '').trim();
        if (an) {
            byAccount.set(an, d.id);
            byIdAccount.set(d.id, an);
        }
    }
    return { byAccount, byIdAccount, allIds };
}
/**
 * تحديد مستند العميل للاستيراد: الكود المعتمد في الشركة هو المصدر الأساسي للدمج.
 * عمود _docId في الشيت قد يكون قديماً أو من نسخة أخرى — لا يُعطى أولوية على مطابقة الكود في القاعدة.
 */
function resolveCustomerImportDocId(row, maps, fileCodeToId, fileCodeToName, rowIndexOneBased) {
    const peek = peekValidDocIdFromRow(row);
    const codeNorm = normalizeCustomerCode(row.code ?? '');
    const nameTrim = String(row.name ?? '').trim();
    if (!codeNorm) {
        throw new HttpsError('invalid-argument', `عميل (${rowIndexOneBased}): كود غير صالح`);
    }
    const prevName = fileCodeToName.get(codeNorm);
    if (prevName !== undefined && prevName !== nameTrim) {
        throw new HttpsError('invalid-argument', `عميل (${rowIndexOneBased}): الكود «${codeNorm}» مكرر في الملف بأسماء مختلفة.`);
    }
    fileCodeToName.set(codeNorm, nameTrim);
    const fromFile = fileCodeToId.get(codeNorm);
    if (fromFile) {
        return { id: fromFile, skipDefaultCreatedAt: maps.allIds.has(fromFile) };
    }
    const ownerByCode = maps.byCode.get(codeNorm);
    if (ownerByCode) {
        fileCodeToId.set(codeNorm, ownerByCode);
        return { id: ownerByCode, skipDefaultCreatedAt: true };
    }
    if (peek && maps.allIds.has(peek)) {
        const peekCode = maps.byIdCode.get(peek);
        if (!peekCode || peekCode === codeNorm) {
            fileCodeToId.set(codeNorm, peek);
            return { id: peek, skipDefaultCreatedAt: true };
        }
    }
    const id = randomUUID();
    fileCodeToId.set(codeNorm, id);
    maps.allIds.add(id);
    return { id, skipDefaultCreatedAt: false };
}
/** رقم الحساب المطبّع هو المصدر الأساسي للدمج؛ _docId ثانوي إن كان متسقًا. */
function resolveBankImportDocId(row, maps, fileAccToId, fileAccToLabel, rowIndexOneBased) {
    const peek = peekValidDocIdFromRow(row);
    const accNorm = normalizeBankAccountNumber(row.accountNumber ?? '');
    const labelTrim = String(row.bankLabel ?? '').trim();
    if (!accNorm) {
        throw new HttpsError('invalid-argument', `حساب بنك (${rowIndexOneBased}): رقم حساب غير صالح`);
    }
    const prevLbl = fileAccToLabel.get(accNorm);
    if (prevLbl !== undefined && prevLbl !== labelTrim) {
        throw new HttpsError('invalid-argument', `حساب بنك (${rowIndexOneBased}): رقم الحساب مكرر في الملف بأسماء بنك مختلفة.`);
    }
    fileAccToLabel.set(accNorm, labelTrim);
    const fromFile = fileAccToId.get(accNorm);
    if (fromFile) {
        return { id: fromFile, skipDefaultCreatedAt: maps.allIds.has(fromFile) };
    }
    const ownerByAccount = maps.byAccount.get(accNorm);
    if (ownerByAccount) {
        fileAccToId.set(accNorm, ownerByAccount);
        return { id: ownerByAccount, skipDefaultCreatedAt: true };
    }
    if (peek && maps.allIds.has(peek)) {
        const peekAcc = maps.byIdAccount.get(peek);
        if (!peekAcc || peekAcc === accNorm) {
            fileAccToId.set(accNorm, peek);
            return { id: peek, skipDefaultCreatedAt: true };
        }
    }
    const id = randomUUID();
    fileAccToId.set(accNorm, id);
    maps.allIds.add(id);
    return { id, skipDefaultCreatedAt: false };
}
/** كود عميل للعرض بعد الاستيراد: إزالة فواصل آلاف Excel فقط (1,925 → 1925)، مع الحفاظ على مسافة واحدة داخل الكود إن وُجدت. */
function cleanCustomerCodeFromImport(raw) {
    if (raw === null || raw === undefined)
        return '';
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return String(Math.trunc(raw));
    }
    const s = String(raw)
        .trim()
        .replace(/[,،٬']/g, '')
        .replace(/[\u00A0\u202F\u2009]/g, '');
    return s.replace(/\s+/g, ' ').trim();
}
function normalizeCustomerCode(raw) {
    return cleanCustomerCodeFromImport(raw).replace(/\s+/g, '');
}
function normalizeBankAccountNumber(raw) {
    return String(raw ?? '').replace(/\D/g, '');
}
function parseOpeningBalanceForImport(raw, errPrefix) {
    if (raw === undefined || raw === null || raw === '')
        return 0;
    const n = Number(raw);
    if (Number.isNaN(n))
        throw new HttpsError('invalid-argument', `${errPrefix}رصيد افتتاحي غير رقمي`);
    return n;
}
/** إن وُجد عمود «نشط» فارغ أو غير مذكور يُفترض true. */
function parseIsActiveForImport(raw) {
    if (raw === undefined || raw === null || raw === '')
        return true;
    if (typeof raw === 'boolean')
        return raw;
    if (typeof raw === 'number')
        return raw !== 0;
    const s = String(raw).trim().toLowerCase();
    if (!s)
        return true;
    if (['false', 'no', '0', 'n', 'لا'].includes(s))
        return false;
    if (['true', 'yes', '1', 'y', 'نعم', 'ن'].includes(s))
        return true;
    return true;
}
function validateCustomerRow(row, index) {
    const p = `عميل (${index + 1}): `;
    for (const key of ['code', 'name']) {
        if (!(key in row)) {
            throw new HttpsError('invalid-argument', `${p}الحقل «${key}» مطلوب`);
        }
    }
    const code = String(row.code ?? '').trim();
    if (!code)
        throw new HttpsError('invalid-argument', `${p}الكود فارغ`);
    if (!String(row.name ?? '').trim())
        throw new HttpsError('invalid-argument', `${p}الاسم فارغ`);
    parseOpeningBalanceForImport(row.openingBalance, p);
}
/** يتخطى صفوف القالب/الفارغة في إيداعات/تسويات دون معرّف مستند. */
function isBlankEntryOrAdjustmentRow(row) {
    const keys = Object.keys(row).filter((k) => k !== '_docId' && k !== 'id');
    if (keys.length === 0)
        return true;
    return keys.every((k) => {
        const v = row[k];
        return v === null || v === undefined || v === '';
    });
}
function validateBankRow(row, index) {
    const p = `حساب بنك (${index + 1}): `;
    for (const key of ['accountNumber', 'bankLabel']) {
        if (!(key in row)) {
            throw new HttpsError('invalid-argument', `${p}الحقل «${key}» مطلوب`);
        }
    }
    if (!String(row.accountNumber ?? '').trim())
        throw new HttpsError('invalid-argument', `${p}رقم الحساب فارغ`);
    if (!String(row.bankLabel ?? '').trim())
        throw new HttpsError('invalid-argument', `${p}اسم البنك فارغ`);
    parseOpeningBalanceForImport(row.openingBalance, p);
}
function buildCustomerFirestorePayload(row, tenantId, docId, options) {
    const code = cleanCustomerCodeFromImport(row.code ?? '');
    const codeNormalized = normalizeCustomerCode(row.code ?? '');
    if (!codeNormalized)
        throw new HttpsError('invalid-argument', 'كود عميل غير صالح');
    const createdTs = typeof row.createdAt === 'string' && row.createdAt.trim()
        ? parseIsoToTimestamp(row.createdAt)
        : undefined;
    const p = 'عميل: ';
    const data = {
        tenantId,
        code,
        codeNormalized,
        name: String(row.name ?? '').trim(),
        openingBalance: parseOpeningBalanceForImport(row.openingBalance, p),
        isActive: parseIsActiveForImport(row.isActive),
        updatedAt: FieldValue.serverTimestamp(),
    };
    if (!options.useMerge) {
        data.createdAt = createdTs ?? FieldValue.serverTimestamp();
    }
    else if (createdTs !== undefined) {
        data.createdAt = createdTs;
    }
    else if (!options.skipDefaultCreatedAt) {
        data.createdAt = FieldValue.serverTimestamp();
    }
    return { id: docId, data };
}
function buildBankFirestorePayload(row, tenantId, docId, options) {
    const accountNumber = String(row.accountNumber ?? '').trim();
    const accountNumberNormalized = normalizeBankAccountNumber(accountNumber);
    if (!accountNumberNormalized)
        throw new HttpsError('invalid-argument', 'رقم حساب بنك غير صالح');
    const createdTs = typeof row.createdAt === 'string' && row.createdAt.trim()
        ? parseIsoToTimestamp(row.createdAt)
        : undefined;
    const p = 'حساب بنك: ';
    const data = {
        tenantId,
        accountNumber,
        accountNumberNormalized,
        bankLabel: String(row.bankLabel ?? '').trim(),
        openingBalance: parseOpeningBalanceForImport(row.openingBalance, p),
        isActive: parseIsActiveForImport(row.isActive),
        updatedAt: FieldValue.serverTimestamp(),
    };
    if (!options.useMerge) {
        data.createdAt = createdTs ?? FieldValue.serverTimestamp();
    }
    else if (createdTs !== undefined) {
        data.createdAt = createdTs;
    }
    else if (!options.skipDefaultCreatedAt) {
        data.createdAt = FieldValue.serverTimestamp();
    }
    return { id: docId, data };
}
function validatePackShape(data) {
    if (!data || typeof data !== 'object')
        return { valid: false, error: 'بيانات غير صالحة' };
    const p = data;
    if (p.metadata?.customerDepositsPackVersion !== CUSTOMER_DEPOSITS_PACK_VERSION) {
        return { valid: false, error: `إصدار الحزمة غير مدعوم (متوقع ${CUSTOMER_DEPOSITS_PACK_VERSION})` };
    }
    return {
        valid: true,
        pack: {
            metadata: {
                customerDepositsPackVersion: CUSTOMER_DEPOSITS_PACK_VERSION,
                tenantId: String(p.metadata?.tenantId || '').trim() || undefined,
                exportedAt: typeof p.metadata?.exportedAt === 'string' ? p.metadata.exportedAt : undefined,
            },
            customers: Array.isArray(p.customers) ? p.customers : [],
            companyBankAccounts: Array.isArray(p.companyBankAccounts) ? p.companyBankAccounts : [],
            entries: Array.isArray(p.entries) ? p.entries : [],
            adjustments: Array.isArray(p.adjustments) ? p.adjustments : [],
        },
    };
}
/** يعيد بناء مستند العدّاد من كل الإيداعات بعد الاستيراد (مسلسل + أرقام محررة للاستخدام بعد الحذف). */
async function syncCustomerDepositEntrySequence(db, tenantId) {
    const snap = await db.collection(COL_ENTRIES).where('tenantId', '==', tenantId).get();
    const used = new Set();
    let maxS = 0;
    for (const d of snap.docs) {
        const s = d.data().depositSerial;
        if (typeof s === 'number' && s >= 1) {
            const k = Math.floor(s);
            used.add(k);
            if (k > maxS)
                maxS = k;
        }
    }
    const free = [];
    for (let i = 1; i < maxS; i++) {
        if (!used.has(i))
            free.push(i);
    }
    await db
        .collection(COL_ENTRY_SEQUENCES)
        .doc(tenantId)
        .set({
        tenantId,
        nextSeq: maxS + 1,
        freeSerials: free,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}
async function commitBatches(db, collectionName, ops) {
    const chunk = 500;
    for (let i = 0; i < ops.length; i += chunk) {
        const batch = db.batch();
        const slice = ops.slice(i, i + chunk);
        for (const { id, data, merge } of slice) {
            const ref = db.collection(collectionName).doc(id);
            batch.set(ref, data, { merge });
        }
        await batch.commit();
    }
}
export async function runImportCustomerDepositsPack(params) {
    const { db, requesterUid, rawPack, mode } = params;
    if (!requesterUid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const permitted = await hasCustomerDepositsManage(db, requesterUid);
    if (!permitted) {
        throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة إيداعات العملاء.');
    }
    const validated = validatePackShape(rawPack);
    if (!validated.valid) {
        throw new HttpsError('invalid-argument', validated.error);
    }
    const pack = validated.pack;
    const packFileTenantId = String(pack.metadata.tenantId || '').trim();
    const userSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const userData = userSnap.data();
    const requesterTenantId = String(userData?.tenantId || '').trim();
    if (!requesterTenantId) {
        throw new HttpsError('failed-precondition', 'يجب أن يكون حسابك مرتبطًا بشركة لاستيراد الحزمة.');
    }
    /** الملف يمكن أن يكون بلا tenantId؛ نُكمل metadata للتوافق مع عملاء/طبقات قديمة تتوقع الحقل. */
    if (!packFileTenantId) {
        pack.metadata.tenantId = requesterTenantId;
    }
    if (packFileTenantId && !userData?.isSuperAdmin && packFileTenantId !== requesterTenantId) {
        throw new HttpsError('permission-denied', 'إن وُجد حقل tenantId في الملف فيجب أن يطابق شركتك، أو احذفه ليُستخدم حسابك تلقائيًا.');
    }
    const effectiveTenantId = requesterTenantId;
    let deletedBefore = 0;
    if (mode === 'replace_module') {
        deletedBefore +=
            (await deleteTenantDocs(db, COL_ADJUSTMENTS, effectiveTenantId)) +
                (await deleteTenantDocs(db, COL_ENTRIES, effectiveTenantId)) +
                (await deleteTenantDocs(db, COL_BANKS, effectiveTenantId)) +
                (await deleteTenantDocs(db, COL_CUSTOMERS, effectiveTenantId));
    }
    const useMerge = mode === 'merge';
    const customerMaps = await loadCustomerMapsForTenant(db, effectiveTenantId);
    const bankMaps = await loadBankMapsForTenant(db, effectiveTenantId);
    const fileCodeToId = new Map();
    const fileCodeToName = new Map();
    const fileAccToId = new Map();
    const fileAccToLabel = new Map();
    const customerRows = pack.customers;
    const customerOps = [];
    for (let i = 0; i < customerRows.length; i++) {
        const row = customerRows[i];
        if (!row || typeof row !== 'object')
            continue;
        if (Object.keys(row).length === 0)
            continue;
        validateCustomerRow(row, i);
        const resolved = resolveCustomerImportDocId(row, customerMaps, fileCodeToId, fileCodeToName, i + 1);
        const { id, data } = buildCustomerFirestorePayload(row, effectiveTenantId, resolved.id, {
            useMerge,
            skipDefaultCreatedAt: resolved.skipDefaultCreatedAt,
        });
        customerOps.push({ id, data, merge: useMerge });
    }
    const bankRows = pack.companyBankAccounts;
    const bankOps = [];
    for (let i = 0; i < bankRows.length; i++) {
        const row = bankRows[i];
        if (!row || typeof row !== 'object')
            continue;
        if (Object.keys(row).length === 0)
            continue;
        validateBankRow(row, i);
        const resolved = resolveBankImportDocId(row, bankMaps, fileAccToId, fileAccToLabel, i + 1);
        const { id, data } = buildBankFirestorePayload(row, effectiveTenantId, resolved.id, {
            useMerge,
            skipDefaultCreatedAt: resolved.skipDefaultCreatedAt,
        });
        bankOps.push({ id, data, merge: useMerge });
    }
    const prepEntryAdj = (rows) => {
        return rows
            .filter((row) => row != null && typeof row === 'object' && !Array.isArray(row))
            .filter((row) => !isBlankEntryOrAdjustmentRow(row))
            .map((row) => {
            const id = extractDocIdOptional(row);
            const fields = deserializeDocumentFields(row, requesterUid);
            if (fields.customerCodeSnapshot != null && fields.customerCodeSnapshot !== '') {
                fields.customerCodeSnapshot = cleanCustomerCodeFromImport(fields.customerCodeSnapshot);
            }
            fields.tenantId = effectiveTenantId;
            fields.updatedAt = FieldValue.serverTimestamp();
            return { id, data: fields, merge: useMerge };
        });
    };
    const entryOps = prepEntryAdj(pack.entries).map((op) => {
        const status = op.data.status === 'confirmed' || op.data.status === 'pending' ? op.data.status : 'pending';
        op.data.status = status;
        if (status === 'pending') {
            op.data.confirmedAt = FieldValue.delete();
            op.data.confirmedByUid = FieldValue.delete();
        }
        else {
            if (!op.data.confirmedByUid) {
                op.data.confirmedByUid = requesterUid;
            }
            if (op.data.confirmedAt === undefined) {
                op.data.confirmedAt = FieldValue.serverTimestamp();
            }
        }
        return op;
    });
    const adjOps = prepEntryAdj(pack.adjustments);
    await commitBatches(db, COL_CUSTOMERS, customerOps);
    await commitBatches(db, COL_BANKS, bankOps);
    await commitBatches(db, COL_ENTRIES, entryOps);
    await commitBatches(db, COL_ADJUSTMENTS, adjOps);
    await syncCustomerDepositEntrySequence(db, effectiveTenantId);
    return {
        ok: true,
        mode,
        written: {
            customers: customerOps.length,
            companyBankAccounts: bankOps.length,
            entries: entryOps.length,
            adjustments: adjOps.length,
        },
        deletedBefore: mode === 'replace_module' ? deletedBefore : undefined,
    };
}

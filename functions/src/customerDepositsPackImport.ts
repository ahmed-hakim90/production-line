/**
 * استيراد حزمة إيداعات العملاء عبر Admin SDK (إيداعات موكّدة وغيرها).
 */
import { randomUUID } from 'node:crypto';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
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

export type CustomerDepositsPackInput = {
  metadata: {
    customerDepositsPackVersion: number;
    /** اختياري في الملف — يُستبدل بشركة المستخدم عند الكتابة */
    tenantId?: string;
    exportedAt?: string;
  };
  customers: Record<string, unknown>[];
  companyBankAccounts: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  adjustments: Record<string, unknown>[];
};

export type ImportCustomerDepositsPackMode = 'merge' | 'replace_module';

function parseIsoToTimestamp(value: unknown): Timestamp | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return Timestamp.fromDate(d);
}

function deserializeDocumentFields(
  raw: Record<string, unknown>,
  importerUid: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === '_docId') continue;
    if (TS_FIELDS.has(k) && typeof v === 'string') {
      const ts = parseIsoToTimestamp(v);
      out[k] = ts ?? v;
      continue;
    }
    if (v === null || v === undefined) {
      out[k] = v;
      continue;
    }
    if (typeof v === 'object' && v !== null && '_seconds' in (v as object)) {
      const sec = (v as { _seconds?: number; _nanoseconds?: number })._seconds;
      const nano = (v as { _nanoseconds?: number })._nanoseconds ?? 0;
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

async function hasCustomerDepositsManage(db: Firestore, uid: string): Promise<boolean> {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return false;
  const user = userSnap.data() as { roleId?: string; isSuperAdmin?: boolean };
  if (user.isSuperAdmin === true) return true;
  const roleId = String(user.roleId || '').trim();
  if (!roleId) return false;
  const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
  if (!roleSnap.exists) return false;
  const role = roleSnap.data() as { permissions?: Record<string, boolean> };
  return role.permissions?.['customerDeposits.manage'] === true;
}

async function deleteTenantDocs(db: Firestore, collectionName: string, tenantId: string): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection(collectionName).where('tenantId', '==', tenantId).limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

/** معرّف مستند صريح في الصف فقط — بدون توليد عشوائي (للعملاء/البنوك). */
function peekValidDocIdFromRow(row: Record<string, unknown>): string | undefined {
  const s = String(row._docId ?? row.id ?? '').trim();
  if (!s || s.includes('/') || s === '.' || s === '..') return undefined;
  if (s.includes('(') || s.includes('مطلوب')) return undefined;
  return s;
}

/** إيداعات/تسويات: توليد UUID عند غياب معرّف صالح. */
function extractDocIdOptional(row: Record<string, unknown>): string {
  return peekValidDocIdFromRow(row) ?? randomUUID();
}

async function loadCustomerMapsForTenant(
  db: Firestore,
  tenantId: string,
): Promise<{ byCode: Map<string, string>; byIdCode: Map<string, string>; allIds: Set<string> }> {
  const snap = await db.collection(COL_CUSTOMERS).where('tenantId', '==', tenantId).select('codeNormalized').get();
  const byCode = new Map<string, string>();
  const byIdCode = new Map<string, string>();
  const allIds = new Set<string>();
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

async function loadBankMapsForTenant(
  db: Firestore,
  tenantId: string,
): Promise<{ byAccount: Map<string, string>; byIdAccount: Map<string, string>; allIds: Set<string> }> {
  const snap = await db
    .collection(COL_BANKS)
    .where('tenantId', '==', tenantId)
    .select('accountNumberNormalized')
    .get();
  const byAccount = new Map<string, string>();
  const byIdAccount = new Map<string, string>();
  const allIds = new Set<string>();
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
function resolveCustomerImportDocId(
  row: Record<string, unknown>,
  maps: { byCode: Map<string, string>; byIdCode: Map<string, string>; allIds: Set<string> },
  fileCodeToId: Map<string, string>,
  fileCodeToName: Map<string, string>,
  rowIndexOneBased: number,
): { id: string; skipDefaultCreatedAt: boolean } {
  const peek = peekValidDocIdFromRow(row);
  const codeNorm = normalizeCustomerCode(row.code ?? '');
  const nameTrim = String(row.name ?? '').trim();

  if (!codeNorm) {
    throw new HttpsError('invalid-argument', `عميل (${rowIndexOneBased}): كود غير صالح`);
  }

  const prevName = fileCodeToName.get(codeNorm);
  if (prevName !== undefined && prevName !== nameTrim) {
    throw new HttpsError(
      'invalid-argument',
      `عميل (${rowIndexOneBased}): الكود «${codeNorm}» مكرر في الملف بأسماء مختلفة.`,
    );
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
function resolveBankImportDocId(
  row: Record<string, unknown>,
  maps: { byAccount: Map<string, string>; byIdAccount: Map<string, string>; allIds: Set<string> },
  fileAccToId: Map<string, string>,
  fileAccToLabel: Map<string, string>,
  rowIndexOneBased: number,
): { id: string; skipDefaultCreatedAt: boolean } {
  const peek = peekValidDocIdFromRow(row);
  const accNorm = normalizeBankAccountNumber(row.accountNumber ?? '');
  const labelTrim = String(row.bankLabel ?? '').trim();

  if (!accNorm) {
    throw new HttpsError('invalid-argument', `حساب بنك (${rowIndexOneBased}): رقم حساب غير صالح`);
  }

  const prevLbl = fileAccToLabel.get(accNorm);
  if (prevLbl !== undefined && prevLbl !== labelTrim) {
    throw new HttpsError(
      'invalid-argument',
      `حساب بنك (${rowIndexOneBased}): رقم الحساب مكرر في الملف بأسماء بنك مختلفة.`,
    );
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
function cleanCustomerCodeFromImport(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.trunc(raw));
  }
  const s = String(raw)
    .trim()
    .replace(/[,،٬']/g, '')
    .replace(/[\u00A0\u202F\u2009]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeCustomerCode(raw: unknown): string {
  return cleanCustomerCodeFromImport(raw).replace(/\s+/g, '');
}

function normalizeBankAccountNumber(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

function parseOpeningBalanceForImport(raw: unknown, errPrefix: string): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new HttpsError('invalid-argument', `${errPrefix}رصيد افتتاحي غير رقمي`);
  return n;
}

/** إن وُجد عمود «نشط» فارغ أو غير مذكور يُفترض true. */
function parseIsActiveForImport(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === '') return true;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (!s) return true;
  if (['false', 'no', '0', 'n', 'لا'].includes(s)) return false;
  if (['true', 'yes', '1', 'y', 'نعم', 'ن'].includes(s)) return true;
  return true;
}

function validateCustomerRow(row: Record<string, unknown>, index: number): void {
  const p = `عميل (${index + 1}): `;
  for (const key of ['code', 'name'] as const) {
    if (!(key in row)) {
      throw new HttpsError('invalid-argument', `${p}الحقل «${key}» مطلوب`);
    }
  }
  const code = String(row.code ?? '').trim();
  if (!code) throw new HttpsError('invalid-argument', `${p}الكود فارغ`);
  if (!String(row.name ?? '').trim()) throw new HttpsError('invalid-argument', `${p}الاسم فارغ`);
  parseOpeningBalanceForImport(row.openingBalance, p);
}

/** يتخطى صفوف القالب/الفارغة في إيداعات/تسويات دون معرّف مستند. */
function isBlankEntryOrAdjustmentRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).filter((k) => k !== '_docId' && k !== 'id');
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = row[k];
    return v === null || v === undefined || v === '';
  });
}

function validateBankRow(row: Record<string, unknown>, index: number): void {
  const p = `حساب بنك (${index + 1}): `;
  for (const key of ['accountNumber', 'bankLabel'] as const) {
    if (!(key in row)) {
      throw new HttpsError('invalid-argument', `${p}الحقل «${key}» مطلوب`);
    }
  }
  if (!String(row.accountNumber ?? '').trim()) throw new HttpsError('invalid-argument', `${p}رقم الحساب فارغ`);
  if (!String(row.bankLabel ?? '').trim()) throw new HttpsError('invalid-argument', `${p}اسم البنك فارغ`);
  parseOpeningBalanceForImport(row.openingBalance, p);
}

function buildCustomerFirestorePayload(
  row: Record<string, unknown>,
  tenantId: string,
  docId: string,
  options: { useMerge: boolean; skipDefaultCreatedAt: boolean },
): { id: string; data: Record<string, unknown> } {
  const code = cleanCustomerCodeFromImport(row.code ?? '');
  const codeNormalized = normalizeCustomerCode(row.code ?? '');
  if (!codeNormalized) throw new HttpsError('invalid-argument', 'كود عميل غير صالح');
  const createdTs =
    typeof row.createdAt === 'string' && row.createdAt.trim()
      ? parseIsoToTimestamp(row.createdAt)
      : undefined;
  const p = 'عميل: ';
  const data: Record<string, unknown> = {
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
  } else if (createdTs !== undefined) {
    data.createdAt = createdTs;
  } else if (!options.skipDefaultCreatedAt) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  return { id: docId, data };
}

function buildBankFirestorePayload(
  row: Record<string, unknown>,
  tenantId: string,
  docId: string,
  options: { useMerge: boolean; skipDefaultCreatedAt: boolean },
): { id: string; data: Record<string, unknown> } {
  const accountNumber = String(row.accountNumber ?? '').trim();
  const accountNumberNormalized = normalizeBankAccountNumber(accountNumber);
  if (!accountNumberNormalized) throw new HttpsError('invalid-argument', 'رقم حساب بنك غير صالح');
  const createdTs =
    typeof row.createdAt === 'string' && row.createdAt.trim()
      ? parseIsoToTimestamp(row.createdAt)
      : undefined;
  const p = 'حساب بنك: ';
  const data: Record<string, unknown> = {
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
  } else if (createdTs !== undefined) {
    data.createdAt = createdTs;
  } else if (!options.skipDefaultCreatedAt) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  return { id: docId, data };
}

function validatePackShape(data: unknown): { valid: true; pack: CustomerDepositsPackInput } | { valid: false; error: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'بيانات غير صالحة' };
  const p = data as Partial<CustomerDepositsPackInput>;
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
async function syncCustomerDepositEntrySequence(db: Firestore, tenantId: string): Promise<void> {
  const snap = await db.collection(COL_ENTRIES).where('tenantId', '==', tenantId).get();
  const used = new Set<number>();
  let maxS = 0;
  for (const d of snap.docs) {
    const s = d.data().depositSerial;
    if (typeof s === 'number' && s >= 1) {
      const k = Math.floor(s);
      used.add(k);
      if (k > maxS) maxS = k;
    }
  }
  const free: number[] = [];
  for (let i = 1; i < maxS; i++) {
    if (!used.has(i)) free.push(i);
  }
  await db
    .collection(COL_ENTRY_SEQUENCES)
    .doc(tenantId)
    .set(
      {
        tenantId,
        nextSeq: maxS + 1,
        freeSerials: free,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function commitBatches(
  db: Firestore,
  collectionName: string,
  ops: { id: string; data: Record<string, unknown>; merge: boolean }[],
): Promise<void> {
  const chunk = 500;
  for (let i = 0; i < ops.length; i += chunk) {
    const batch = db.batch();
    const slice = ops.slice(i, i + chunk);
    for (const { id, data, merge } of slice) {
      const ref = db.collection(collectionName).doc(id);
      batch.set(ref, data as DocumentData, { merge });
    }
    await batch.commit();
  }
}

export async function runImportCustomerDepositsPack(params: {
  db: Firestore;
  requesterUid: string;
  rawPack: unknown;
  mode: ImportCustomerDepositsPackMode;
}): Promise<{
  ok: true;
  mode: ImportCustomerDepositsPackMode;
  written: {
    customers: number;
    companyBankAccounts: number;
    entries: number;
    adjustments: number;
  };
  deletedBefore?: number;
}> {
  const { db, requesterUid, rawPack, mode } = params;
  if (!requesterUid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

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
  const userData = userSnap.data() as { tenantId?: string; isSuperAdmin?: boolean } | undefined;
  const requesterTenantId = String(userData?.tenantId || '').trim();
  if (!requesterTenantId) {
    throw new HttpsError('failed-precondition', 'يجب أن يكون حسابك مرتبطًا بشركة لاستيراد الحزمة.');
  }
  /** الملف يمكن أن يكون بلا tenantId؛ نُكمل metadata للتوافق مع عملاء/طبقات قديمة تتوقع الحقل. */
  if (!packFileTenantId) {
    pack.metadata.tenantId = requesterTenantId;
  }
  if (packFileTenantId && !userData?.isSuperAdmin && packFileTenantId !== requesterTenantId) {
    throw new HttpsError(
      'permission-denied',
      'إن وُجد حقل tenantId في الملف فيجب أن يطابق شركتك، أو احذفه ليُستخدم حسابك تلقائيًا.',
    );
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
  const fileCodeToId = new Map<string, string>();
  const fileCodeToName = new Map<string, string>();
  const fileAccToId = new Map<string, string>();
  const fileAccToLabel = new Map<string, string>();

  const customerRows = pack.customers as Record<string, unknown>[];
  const customerOps: { id: string; data: Record<string, unknown>; merge: boolean }[] = [];
  for (let i = 0; i < customerRows.length; i++) {
    const row = customerRows[i];
    if (!row || typeof row !== 'object') continue;
    if (Object.keys(row).length === 0) continue;
    validateCustomerRow(row, i);
    const resolved = resolveCustomerImportDocId(row, customerMaps, fileCodeToId, fileCodeToName, i + 1);
    const { id, data } = buildCustomerFirestorePayload(row, effectiveTenantId, resolved.id, {
      useMerge,
      skipDefaultCreatedAt: resolved.skipDefaultCreatedAt,
    });
    customerOps.push({ id, data, merge: useMerge });
  }

  const bankRows = pack.companyBankAccounts as Record<string, unknown>[];
  const bankOps: { id: string; data: Record<string, unknown>; merge: boolean }[] = [];
  for (let i = 0; i < bankRows.length; i++) {
    const row = bankRows[i];
    if (!row || typeof row !== 'object') continue;
    if (Object.keys(row).length === 0) continue;
    validateBankRow(row, i);
    const resolved = resolveBankImportDocId(row, bankMaps, fileAccToId, fileAccToLabel, i + 1);
    const { id, data } = buildBankFirestorePayload(row, effectiveTenantId, resolved.id, {
      useMerge,
      skipDefaultCreatedAt: resolved.skipDefaultCreatedAt,
    });
    bankOps.push({ id, data, merge: useMerge });
  }

  const prepEntryAdj = (rows: unknown[]): { id: string; data: Record<string, unknown>; merge: boolean }[] => {
    return rows
      .filter((row): row is Record<string, unknown> => row != null && typeof row === 'object' && !Array.isArray(row))
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

  const entryOps = prepEntryAdj(pack.entries as Record<string, unknown>[]).map((op) => {
    const status = op.data.status === 'confirmed' || op.data.status === 'pending' ? op.data.status : 'pending';
    op.data.status = status;
    if (status === 'pending') {
      op.data.confirmedAt = FieldValue.delete();
      op.data.confirmedByUid = FieldValue.delete();
    } else {
      if (!op.data.confirmedByUid) {
        op.data.confirmedByUid = requesterUid;
      }
      if (op.data.confirmedAt === undefined) {
        op.data.confirmedAt = FieldValue.serverTimestamp();
      }
    }
    return op;
  });
  const adjOps = prepEntryAdj(pack.adjustments as Record<string, unknown>[]);

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

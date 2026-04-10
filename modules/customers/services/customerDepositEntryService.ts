import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Transaction,
} from 'firebase/firestore';
import type { FirebaseError } from 'firebase/app';
import { auth, db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import {
  CUSTOMER_DEPOSIT_ENTRIES_COLLECTION,
  CUSTOMER_DEPOSIT_ENTRY_SEQUENCES_COLLECTION,
} from '../collections';
import type { CustomerDepositEntry, CustomerDepositEntryStatus } from '../types';

const col = () => collection(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION);

const sequenceDocRef = (tenantId: string) => doc(db, CUSTOMER_DEPOSIT_ENTRY_SEQUENCES_COLLECTION, tenantId);

function parseFreeSerials(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const nums = raw.filter((n): n is number => typeof n === 'number' && n >= 1).map((n) => Math.floor(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** يخصّص رقم مسلسل داخل معاملة؛ يعيد استخدام الأرقام المحذوفة (الأصغر أولاً). */
async function allocateDepositSerialInTransaction(
  transaction: Transaction,
  tenantId: string,
): Promise<number> {
  const seqRef = sequenceDocRef(tenantId);
  const seqSnap = await transaction.get(seqRef);
  const data = seqSnap.data();
  let nextSeq =
    typeof data?.nextSeq === 'number' && data.nextSeq >= 1 ? Math.floor(data.nextSeq as number) : 1;
  let freeSerials = parseFreeSerials(data?.freeSerials);

  let assigned: number;
  if (freeSerials.length > 0) {
    assigned = freeSerials[0];
    freeSerials = freeSerials.slice(1);
  } else {
    assigned = nextSeq;
    nextSeq += 1;
  }

  transaction.set(
    seqRef,
    {
      tenantId,
      nextSeq,
      freeSerials,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return assigned;
}

const currentUid = () => auth?.currentUser?.uid ?? '';

const PAGE = 500;

/** جمع كل الإيداعات للمستأجر الحالي (للتصدير الكامل). */
async function listAllForTenantPaginated(): Promise<CustomerDepositEntry[]> {
  if (!isConfigured) return [];
  const out: CustomerDepositEntry[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  const base = tenantQuery(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION);
  for (;;) {
    const q = last
      ? query(base, orderBy('__name__'), startAfter(last), limit(PAGE))
      : query(base, orderBy('__name__'), limit(PAGE));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      out.push({ id: d.id, ...d.data() } as CustomerDepositEntry);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return out;
}

function entryUpdatedMillis(row: CustomerDepositEntry): number {
  const u = row.updatedAt;
  if (!u || typeof u !== 'object') return 0;
  const t = u as { toMillis?: () => number };
  if (typeof t.toMillis === 'function') {
    const m = t.toMillis();
    return typeof m === 'number' && !Number.isNaN(m) ? m : 0;
  }
  return 0;
}

export type CustomerDepositEntryListOrderField = 'depositDate' | 'updatedAt';

export const customerDepositEntryService = {
  async listAllForExport(): Promise<CustomerDepositEntry[]> {
    return listAllForTenantPaginated();
  },

  async listRecent(
    max = 800,
    options?: { orderByField?: CustomerDepositEntryListOrderField },
  ): Promise<CustomerDepositEntry[]> {
    if (!isConfigured) return [];
    const orderField = options?.orderByField === 'updatedAt' ? 'updatedAt' : 'depositDate';
    const base = tenantQuery(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION);
    try {
      const snap = await getDocs(query(base, orderBy(orderField, 'desc'), limit(max)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositEntry));
    } catch (e: unknown) {
      const code = (e as FirebaseError | undefined)?.code;
      const needsFallback =
        orderField === 'updatedAt' && (code === 'failed-precondition' || code === 'unimplemented');
      if (!needsFallback) throw e;
      /**
       * بعض مشاريع Firestore ترفض نشر فهرس tenantId + updatedAt عبر CLI (رسالة «not necessary»).
       * نحمّل دفعة أكبر مرتبة بتاريخ الإيداع ثم نفرز محليًا بـ updatedAt — تقريب معقول لقائمة الإيداعات.
       */
      const pool = Math.min(Math.max(max * 4, max), 2000);
      const snap = await getDocs(query(base, orderBy('depositDate', 'desc'), limit(pool)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositEntry));
      rows.sort((a, b) => entryUpdatedMillis(b) - entryUpdatedMillis(a));
      return rows.slice(0, max);
    }
  },

  async listByCustomerId(customerId: string, max = 500): Promise<CustomerDepositEntry[]> {
    if (!isConfigured || !customerId) return [];
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION),
        where('customerId', '==', customerId),
        orderBy('depositDate', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositEntry));
  },

  async listByCompanyBankAccountId(accountId: string, max = 500): Promise<CustomerDepositEntry[]> {
    if (!isConfigured || !accountId) return [];
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION),
        where('companyBankAccountId', '==', accountId),
        orderBy('depositDate', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositEntry));
  },

  async getById(id: string): Promise<CustomerDepositEntry | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as CustomerDepositEntry;
  },

  async create(input: {
    amount: number;
    depositorName: string;
    depositorAccountNumber?: string;
    customerId: string;
    customerCodeSnapshot: string;
    customerNameSnapshot: string;
    companyBankAccountId: string;
    bankLabelSnapshot: string;
    depositDate: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const uid = currentUid();
    if (!uid) throw new Error('يجب تسجيل الدخول.');
    const tenantId = getCurrentTenantId();
    const newRef = doc(col());
    await runTransaction(db, async (transaction) => {
      const depositSerial = await allocateDepositSerialInTransaction(transaction, tenantId);
      transaction.set(newRef, {
        tenantId,
        depositSerial,
        amount: Number(input.amount) || 0,
        depositorName: String(input.depositorName || '').trim(),
        depositorAccountNumber: String(input.depositorAccountNumber || '').trim(),
        customerId: input.customerId,
        customerCodeSnapshot: String(input.customerCodeSnapshot || '').trim(),
        customerNameSnapshot: String(input.customerNameSnapshot || '').trim(),
        companyBankAccountId: input.companyBankAccountId,
        bankLabelSnapshot: String(input.bankLabelSnapshot || '').trim(),
        depositDate: String(input.depositDate || '').trim(),
        status: 'pending' as CustomerDepositEntryStatus,
        createdByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return newRef.id;
  },

  async updatePending(
    id: string,
    patch: Partial<
      Pick<
        CustomerDepositEntry,
        | 'amount'
        | 'depositorName'
        | 'depositorAccountNumber'
        | 'customerId'
        | 'customerCodeSnapshot'
        | 'customerNameSnapshot'
        | 'companyBankAccountId'
        | 'bankLabelSnapshot'
        | 'depositDate'
      >
    >,
  ): Promise<void> {
    if (!isConfigured) return;
    const existing = await this.getById(id);
    if (!existing || existing.status !== 'pending') {
      throw new Error('لا يمكن تعديل إلا الإيداعات المعلقة.');
    }
    const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.amount !== undefined) fields.amount = Number(patch.amount) || 0;
    if (patch.depositorName !== undefined) fields.depositorName = String(patch.depositorName || '').trim();
    if (patch.depositorAccountNumber !== undefined) {
      fields.depositorAccountNumber = String(patch.depositorAccountNumber || '').trim();
    }
    if (patch.customerId !== undefined) fields.customerId = patch.customerId;
    if (patch.customerCodeSnapshot !== undefined) {
      fields.customerCodeSnapshot = String(patch.customerCodeSnapshot || '').trim();
    }
    if (patch.customerNameSnapshot !== undefined) {
      fields.customerNameSnapshot = String(patch.customerNameSnapshot || '').trim();
    }
    if (patch.companyBankAccountId !== undefined) {
      fields.companyBankAccountId = patch.companyBankAccountId;
    }
    if (patch.bankLabelSnapshot !== undefined) {
      fields.bankLabelSnapshot = String(patch.bankLabelSnapshot || '').trim();
    }
    if (patch.depositDate !== undefined) fields.depositDate = String(patch.depositDate || '').trim();
    await updateDoc(doc(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION, id), fields);
  },

  async confirm(id: string): Promise<void> {
    if (!isConfigured) return;
    const uid = currentUid();
    if (!uid) throw new Error('يجب تسجيل الدخول.');
    const existing = await this.getById(id);
    if (!existing || existing.status !== 'pending') {
      throw new Error('لا يمكن تأكيد إلا إيداع معلق.');
    }
    await updateDoc(doc(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION, id), {
      status: 'confirmed' as CustomerDepositEntryStatus,
      confirmedByUid: uid,
      confirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  /** يتطلب صلاحية `customerDeposits.manage` (قواعد Firestore). يعيد رقم المسلسل إلى قائمة إعادة الاستخدام. */
  async deleteEntry(id: string): Promise<void> {
    if (!isConfigured) return;
    const entryRef = doc(db, CUSTOMER_DEPOSIT_ENTRIES_COLLECTION, id);
    await runTransaction(db, async (transaction) => {
      const entrySnap = await transaction.get(entryRef);
      if (!entrySnap.exists()) return;
      const d = entrySnap.data();
      const tenantId = String(d.tenantId || '');
      const serial = d.depositSerial;
      if (tenantId) {
        const seqRef = sequenceDocRef(tenantId);
        const seqSnap = await transaction.get(seqRef);
        const sd = seqSnap.data();
        let nextSeq =
          typeof sd?.nextSeq === 'number' && sd.nextSeq >= 1 ? Math.floor(sd.nextSeq as number) : 1;
        let freeSerials = parseFreeSerials(sd?.freeSerials);
        if (typeof serial === 'number' && serial >= 1) {
          const s = Math.floor(serial);
          freeSerials.push(s);
          freeSerials = [...new Set(freeSerials)].sort((a, b) => a - b);
        }
        transaction.set(
          seqRef,
          { tenantId, nextSeq, freeSerials, updatedAt: serverTimestamp() },
          { merge: true },
        );
      }
      transaction.delete(entryRef);
    });
  },
};

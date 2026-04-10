import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION } from '../collections';
import type { CustomerDepositAdjustment } from '../types';

const col = () => collection(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION);

const currentUid = () => auth?.currentUser?.uid ?? '';

const PAGE = 500;

async function listAllAdjustmentsPaginated(): Promise<CustomerDepositAdjustment[]> {
  if (!isConfigured) return [];
  const out: CustomerDepositAdjustment[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  const base = tenantQuery(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION);
  for (;;) {
    const q = last
      ? query(base, orderBy('__name__'), startAfter(last), limit(PAGE))
      : query(base, orderBy('__name__'), limit(PAGE));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      out.push({ id: d.id, ...d.data() } as CustomerDepositAdjustment);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return out;
}

export const customerDepositAdjustmentService = {
  async listAllForExport(): Promise<CustomerDepositAdjustment[]> {
    return listAllAdjustmentsPaginated();
  },

  async listRecent(max = 200): Promise<CustomerDepositAdjustment[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION),
        orderBy('effectiveDate', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositAdjustment));
  },

  async listByCustomerId(customerId: string, max = 200): Promise<CustomerDepositAdjustment[]> {
    if (!isConfigured || !customerId) return [];
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION),
        where('customerId', '==', customerId),
        orderBy('effectiveDate', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositAdjustment));
  },

  async listByCompanyBankAccountId(
    companyBankAccountId: string,
    max = 200,
  ): Promise<CustomerDepositAdjustment[]> {
    if (!isConfigured || !companyBankAccountId) return [];
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION),
        where('companyBankAccountId', '==', companyBankAccountId),
        orderBy('effectiveDate', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositAdjustment));
  },

  async getById(id: string): Promise<CustomerDepositAdjustment | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as CustomerDepositAdjustment;
  },

  async create(input: {
    effectiveDate: string;
    signedAmount: number;
    note: string;
    customerId?: string;
    companyBankAccountId?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const uid = currentUid();
    if (!uid) throw new Error('يجب تسجيل الدخول.');
    if (!input.customerId && !input.companyBankAccountId) {
      throw new Error('حدد عميلًا أو حساب بنك شركة للتسوية.');
    }
    const ref = await addDoc(col(), {
      tenantId: getCurrentTenantId(),
      effectiveDate: String(input.effectiveDate || '').trim(),
      signedAmount: Number(input.signedAmount) || 0,
      note: String(input.note || '').trim(),
      customerId: input.customerId || '',
      companyBankAccountId: input.companyBankAccountId || '',
      createdByUid: uid,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        CustomerDepositAdjustment,
        'effectiveDate' | 'signedAmount' | 'note' | 'customerId' | 'companyBankAccountId'
      >
    >,
  ): Promise<void> {
    if (!isConfigured) return;
    const fields: Record<string, unknown> = {};
    if (patch.effectiveDate !== undefined) fields.effectiveDate = String(patch.effectiveDate || '').trim();
    if (patch.signedAmount !== undefined) fields.signedAmount = Number(patch.signedAmount) || 0;
    if (patch.note !== undefined) fields.note = String(patch.note || '').trim();
    if (patch.customerId !== undefined) fields.customerId = patch.customerId || '';
    if (patch.companyBankAccountId !== undefined) {
      fields.companyBankAccountId = patch.companyBankAccountId || '';
    }
    await updateDoc(doc(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION, id), fields);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, CUSTOMER_DEPOSIT_ADJUSTMENTS_COLLECTION, id));
  },
};

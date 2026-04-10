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
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION } from '../collections';
import type { CustomerDepositCustomer } from '../types';
import { coerceNumericField } from '../utils/numericField';
import { displayCustomerCode, normalizeCustomerCode } from '../utils/normalize';

const col = () => collection(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION);

export const customerDepositCustomerService = {
  async getAll(): Promise<CustomerDepositCustomer[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(tenantQuery(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION), orderBy('codeNormalized')),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        code: displayCustomerCode(data.code),
        openingBalance: coerceNumericField(data.openingBalance),
      } as CustomerDepositCustomer;
    });
  },

  /**
   * عملاء نشطون فقط — استعلام على Firestore (لا يحمّل غير النشطين).
   * `limit`: للقوائم المنسدلة؛ أما البحث بالكود فيستخدم `findByCode` ولا يمر هنا.
   * المستندات بلا حقل `isActive` لن تُرجع (يُفضّل أن تكون `isActive: true` في البيانات).
   */
  async getActive(options?: { limit?: number }): Promise<CustomerDepositCustomer[]> {
    if (!isConfigured) return [];
    const lim = options?.limit;
    try {
      const constraints = [where('isActive', '==', true), orderBy('codeNormalized')];
      if (typeof lim === 'number' && lim > 0) {
        constraints.push(limit(lim));
      }
      const snap = await getDocs(query(tenantQuery(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION), ...constraints));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          code: displayCustomerCode(data.code),
          openingBalance: coerceNumericField(data.openingBalance),
        } as CustomerDepositCustomer;
      });
    } catch (err) {
      console.warn('customerDepositCustomerService.getActive: indexed query failed, using getAll fallback', err);
      const all = await this.getAll();
      const active = all.filter((c) => c.isActive !== false);
      return typeof lim === 'number' && lim > 0 ? active.slice(0, lim) : active;
    }
  },

  async getById(id: string): Promise<CustomerDepositCustomer | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION, id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      code: displayCustomerCode(data.code),
      openingBalance: coerceNumericField(data.openingBalance),
    } as CustomerDepositCustomer;
  },

  async findByCode(code: string): Promise<CustomerDepositCustomer | null> {
    if (!isConfigured) return null;
    const codeNormalized = normalizeCustomerCode(code);
    if (!codeNormalized) return null;
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION),
        where('codeNormalized', '==', codeNormalized),
        limit(1),
      ),
    );
    const d = snap.docs[0];
    if (!d) return null;
    const data = d.data();
    return {
      id: d.id,
      ...data,
      code: displayCustomerCode(data.code),
      openingBalance: coerceNumericField(data.openingBalance),
    } as CustomerDepositCustomer;
  },

  async create(input: {
    code: string;
    name: string;
    openingBalance?: number;
    isActive?: boolean;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const codeDisplay = displayCustomerCode(input.code);
    const codeNormalized = normalizeCustomerCode(codeDisplay);
    if (!codeNormalized) throw new Error('كود العميل مطلوب.');
    const dup = await this.findByCode(codeDisplay);
    if (dup) throw new Error('يوجد عميل بنفس الكود.');
    const ref = await addDoc(col(), {
      tenantId: getCurrentTenantId(),
      code: codeDisplay,
      codeNormalized,
      name: String(input.name || '').trim(),
      openingBalance: Number(input.openingBalance ?? 0) || 0,
      isActive: input.isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(
    id: string,
    patch: Partial<
      Pick<CustomerDepositCustomer, 'code' | 'name' | 'openingBalance' | 'isActive'>
    >,
  ): Promise<void> {
    if (!isConfigured) return;
    const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.name !== undefined) fields.name = String(patch.name || '').trim();
    if (patch.openingBalance !== undefined) fields.openingBalance = Number(patch.openingBalance) || 0;
    if (patch.isActive !== undefined) fields.isActive = patch.isActive;
    if (patch.code !== undefined) {
      const codeDisplay = displayCustomerCode(patch.code);
      const codeNormalized = normalizeCustomerCode(codeDisplay);
      if (!codeNormalized) throw new Error('كود العميل غير صالح.');
      const other = await this.findByCode(codeDisplay);
      if (other && other.id !== id) throw new Error('يوجد عميل آخر بنفس الكود.');
      fields.code = codeDisplay;
      fields.codeNormalized = codeNormalized;
    }
    await updateDoc(doc(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION, id), fields);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION, id));
  },

  /** يضبط `openingBalance` إلى 0 لكل عملاء المستأجر الحالي (دفعات). */
  async resetAllOpeningBalances(): Promise<{ updated: number }> {
    if (!isConfigured) return { updated: 0 };
    const list = await this.getAll();
    const CHUNK = 400;
    let updated = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      const slice = list.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const c of slice) {
        batch.update(doc(db, CUSTOMER_DEPOSIT_CUSTOMERS_COLLECTION, c.id), {
          openingBalance: 0,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      updated += slice.length;
    }
    return { updated };
  },
};

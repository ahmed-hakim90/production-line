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
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION } from '../collections';
import type { CustomerDepositCompanyBankAccount } from '../types';
import { coerceNumericField } from '../utils/numericField';
import { displayBankAccountNumber, normalizeBankAccountNumber } from '../utils/normalize';

const col = () => collection(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION);

export const customerDepositBankAccountService = {
  async getAll(): Promise<CustomerDepositCompanyBankAccount[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION),
        orderBy('accountNumberNormalized'),
      ),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        accountNumber: displayBankAccountNumber(data.accountNumber),
        openingBalance: coerceNumericField(data.openingBalance),
      } as CustomerDepositCompanyBankAccount;
    });
  },

  /**
   * حسابات نشطة فقط — استعلام مفهرس. `limit` للقوائم في النماذج.
   * المستندات بلا `isActive` لن تُرجع.
   */
  async getActive(options?: { limit?: number }): Promise<CustomerDepositCompanyBankAccount[]> {
    if (!isConfigured) return [];
    const lim = options?.limit;
    try {
      const constraints = [where('isActive', '==', true), orderBy('accountNumberNormalized')];
      if (typeof lim === 'number' && lim > 0) {
        constraints.push(limit(lim));
      }
      const snap = await getDocs(
        query(tenantQuery(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION), ...constraints),
      );
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          accountNumber: displayBankAccountNumber(data.accountNumber),
          openingBalance: coerceNumericField(data.openingBalance),
        } as CustomerDepositCompanyBankAccount;
      });
    } catch (err) {
      console.warn('customerDepositBankAccountService.getActive: indexed query failed, using getAll fallback', err);
      const all = await this.getAll();
      const active = all.filter((a) => a.isActive !== false);
      return typeof lim === 'number' && lim > 0 ? active.slice(0, lim) : active;
    }
  },

  async getById(id: string): Promise<CustomerDepositCompanyBankAccount | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION, id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      accountNumber: displayBankAccountNumber(data.accountNumber),
      openingBalance: coerceNumericField(data.openingBalance),
    } as CustomerDepositCompanyBankAccount;
  },

  async findByAccountNumber(accountNumber: string): Promise<CustomerDepositCompanyBankAccount | null> {
    if (!isConfigured) return null;
    const accountNumberNormalized = normalizeBankAccountNumber(accountNumber);
    if (!accountNumberNormalized) return null;
    const snap = await getDocs(
      query(
        tenantQuery(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION),
        where('accountNumberNormalized', '==', accountNumberNormalized),
        limit(1),
      ),
    );
    const d = snap.docs[0];
    if (!d) return null;
    const data = d.data();
    return {
      id: d.id,
      ...data,
      accountNumber: displayBankAccountNumber(data.accountNumber),
      openingBalance: coerceNumericField(data.openingBalance),
    } as CustomerDepositCompanyBankAccount;
  },

  async create(input: {
    accountNumber: string;
    bankLabel: string;
    openingBalance?: number;
    isActive?: boolean;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const accountNumberNormalized = normalizeBankAccountNumber(input.accountNumber);
    if (!accountNumberNormalized) throw new Error('رقم الحساب مطلوب.');
    const dup = await this.findByAccountNumber(input.accountNumber);
    if (dup) throw new Error('يوجد حساب بنك بنفس الرقم.');
    const ref = await addDoc(col(), {
      tenantId: getCurrentTenantId(),
      accountNumber: String(input.accountNumber).trim(),
      accountNumberNormalized,
      bankLabel: String(input.bankLabel || '').trim(),
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
      Pick<
        CustomerDepositCompanyBankAccount,
        'accountNumber' | 'bankLabel' | 'openingBalance' | 'isActive'
      >
    >,
  ): Promise<void> {
    if (!isConfigured) return;
    const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.bankLabel !== undefined) fields.bankLabel = String(patch.bankLabel || '').trim();
    if (patch.openingBalance !== undefined) fields.openingBalance = Number(patch.openingBalance) || 0;
    if (patch.isActive !== undefined) fields.isActive = patch.isActive;
    if (patch.accountNumber !== undefined) {
      const accountNumberNormalized = normalizeBankAccountNumber(patch.accountNumber);
      if (!accountNumberNormalized) throw new Error('رقم الحساب غير صالح.');
      const other = await this.findByAccountNumber(patch.accountNumber);
      if (other && other.id !== id) throw new Error('يوجد حساب بنك آخر بنفس الرقم.');
      fields.accountNumber = String(patch.accountNumber).trim();
      fields.accountNumberNormalized = accountNumberNormalized;
    }
    await updateDoc(doc(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION, id), fields);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, CUSTOMER_DEPOSIT_COMPANY_BANK_ACCOUNTS_COLLECTION, id));
  },
};

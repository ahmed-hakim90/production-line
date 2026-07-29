import {
  addDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { payrollDistributionsRef } from '../collections';
import { PAYROLL_COLLECTIONS } from '../payroll/collections';
import { db } from '@/services/firebase';

export const payrollAccountsService = {
  async confirmDisbursement(input: {
    recordId: string;
    disbursedBy: string;
    disbursedByName: string;
  }): Promise<void> {
    if (!isConfigured || !input.recordId) return;
    await updateDoc(doc(db, PAYROLL_COLLECTIONS.PAYROLL_RECORDS, input.recordId), {
      disbursed: true,
      disbursedAt: serverTimestamp(),
      disbursedBy: input.disbursedBy || '',
      disbursedByName: input.disbursedByName || '',
      tenantId: getCurrentTenantId(),
    });
  },

  async recordDistribution(input: {
    month: string;
    distributedBy: string;
    distributedByName: string;
    employeeCount: number;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(payrollDistributionsRef(), {
      tenantId: getCurrentTenantId(),
      month: input.month,
      distributedAt: new Date(),
      distributedBy: input.distributedBy || '',
      distributedByName: input.distributedByName || '',
      employeeCount: Number(input.employeeCount || 0),
      status: 'distributed',
    });
    return ref.id;
  },
};

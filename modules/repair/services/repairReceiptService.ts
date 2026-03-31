import { collection, doc, runTransaction } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';

const COUNTER_COLLECTION = '_counters';
const COUNTER_DOC_ID = 'repair_jobs';

const formatReceipt = (seq: number) => `REP-${String(seq).padStart(4, '0')}`;
const fallbackReceipt = () => formatReceipt(new Date().getTime() % 10000);

const isPermissionOrAuthError = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code.includes('permission-denied')
    || code.includes('unauthenticated')
    || message.includes('permission-denied')
    || message.includes('unauthenticated')
    || message.includes('403')
    || message.includes('forbidden')
  );
};

export type RepairReceiptResult = {
  receiptNo: string;
  usedFallback: boolean;
};

export const repairReceiptService = {
  async getNextReceipt(): Promise<RepairReceiptResult> {
    if (!isConfigured) return { receiptNo: formatReceipt(1), usedFallback: true };
    const tenantId = getCurrentTenantId();
    if (!tenantId) return { receiptNo: formatReceipt(1), usedFallback: true };

    const tenantCounterRef = doc(collection(db, COUNTER_COLLECTION), `${COUNTER_DOC_ID}_${tenantId}`);
    try {
      const receiptNo = await runTransaction(db, async (tx) => {
        const tenantSnap = await tx.get(tenantCounterRef);
        const current = tenantSnap.exists() ? Number(tenantSnap.data().value || 0) : 0;
        const next = current + 1;
        tx.set(
          tenantCounterRef,
          {
            value: next,
            tenantId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        return formatReceipt(next);
      });
      return { receiptNo, usedFallback: false };
    } catch (error) {
      if (isPermissionOrAuthError(error)) {
        console.warn('repairReceiptService: using fallback receipt number due to counter permission/auth failure.', error);
        return { receiptNo: fallbackReceipt(), usedFallback: true };
      }
      throw error;
    }
  },

  async getNextReceiptNo(): Promise<string> {
    const result = await this.getNextReceipt();
    return result.receiptNo;
  },
};

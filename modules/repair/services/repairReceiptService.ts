import { collection, doc, getDocs, limit, orderBy, runTransaction } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_JOBS_COLLECTION } from '../collections';

const COUNTER_COLLECTION = '_counters';
const COUNTER_DOC_ID = 'repair_jobs';

const formatReceipt = (seq: number) => `REP-${String(seq).padStart(4, '0')}`;
const emergencyFallbackReceipt = () => `REP-TMP-${Date.now()}`;
const parseReceiptSequence = (receiptNo: string | undefined | null): number | null => {
  const text = String(receiptNo || '').trim();
  const match = /^REP-(\d+)$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

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
  async getLastKnownSequence(): Promise<number> {
    if (!isConfigured) return 0;
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    const latest = snap.docs[0]?.data() as { receiptNo?: string } | undefined;
    return parseReceiptSequence(latest?.receiptNo) ?? 0;
  },

  async getNextReceipt(): Promise<RepairReceiptResult> {
    if (!isConfigured) {
      return { receiptNo: emergencyFallbackReceipt(), usedFallback: true };
    }
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      console.warn('repairReceiptService: missing tenantId, using emergency fallback receipt.');
      return { receiptNo: emergencyFallbackReceipt(), usedFallback: true };
    }

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
        console.warn(
          `repairReceiptService: counter permission/auth failure for tenant "${tenantId}". Trying sequential fallback from latest repair job.`,
          error,
        );
        try {
          const lastKnownSequence = await this.getLastKnownSequence();
          const next = Math.max(1, lastKnownSequence + 1);
          return { receiptNo: formatReceipt(next), usedFallback: true };
        } catch (fallbackError) {
          console.error(
            `repairReceiptService: sequential fallback lookup failed for tenant "${tenantId}". Using emergency fallback receipt.`,
            fallbackError,
          );
          return { receiptNo: emergencyFallbackReceipt(), usedFallback: true };
        }
      }
      throw error;
    }
  },

  async getNextReceiptNo(): Promise<string> {
    const result = await this.getNextReceipt();
    return result.receiptNo;
  },
};

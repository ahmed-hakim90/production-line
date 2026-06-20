import { setDoc, serverTimestamp } from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type { WorkerPerformanceSummary } from '@/types';
import { workerPerformanceSummaryDocRef } from '../collections';

export const workerPerformanceSummaryService = {
  async upsert(summary: WorkerPerformanceSummary): Promise<void> {
    if (!isConfigured || !summary.workerId || !summary.month) return;
    const id = `${summary.workerId}_${summary.month}`;
    await setDoc(
      workerPerformanceSummaryDocRef(summary.workerId, summary.month),
      {
        ...summary,
        id,
        tenantId: getCurrentTenantId(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  },
};

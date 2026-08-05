import { httpsCallable } from 'firebase/functions';
import { functionsClient, isConfigured } from '../../auth/services/firebase';

const requireFunctions = () => {
  if (!isConfigured || !functionsClient) {
    throw new Error('Firebase غير مهيأ.');
  }
  return functionsClient;
};

const toUserSafeError = (error: unknown, fallback: string): Error => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').trim();
  if (code.includes('unauthenticated') || message.toLowerCase().includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  if (code.includes('permission-denied')) {
    return new Error('ليس لديك صلاحية تنفيذ هذا الإجراء.');
  }
  if (code.includes('failed-precondition') || code.includes('invalid-argument') || code.includes('not-found')) {
    return new Error(message || fallback);
  }
  if (message && !message.toLowerCase().includes('internal')) {
    return new Error(message);
  }
  return new Error(fallback);
};

export type RequestRepairJobSparePartResult =
  | {
      path: 'center';
      availability: 'center';
      issueId: string;
      referenceNo: string;
      status: string;
      approvalMode: string;
    }
  | {
      path: 'pending_supply';
      availability: 'central' | 'none';
      usageId: string;
      replenishmentRequestId: string;
      replenishmentReferenceNo: string;
    };

export const repairJobSparePartRequestService = {
  async request(input: {
    jobId: string;
    materialId: string;
    quantity: number;
  }): Promise<RequestRepairJobSparePartResult> {
    try {
      const callable = httpsCallable<
        { jobId: string; materialId: string; quantity: number },
        RequestRepairJobSparePartResult
      >(requireFunctions(), 'requestRepairJobSparePart');
      const result = await callable({
        jobId: input.jobId,
        materialId: input.materialId,
        quantity: input.quantity,
      });
      return result.data;
    } catch (error: unknown) {
      throw toUserSafeError(error, 'تعذر طلب قطعة الغيار.');
    }
  },

  async issuePending(input: { jobId: string; usageId: string }): Promise<{
    issueId: string;
    referenceNo: string;
    status: string;
  }> {
    try {
      const callable = httpsCallable<
        { jobId: string; usageId: string },
        { issueId: string; referenceNo: string; status: string }
      >(requireFunctions(), 'issuePendingRepairPartUsage');
      const result = await callable(input);
      return result.data;
    } catch (error: unknown) {
      throw toUserSafeError(error, 'تعذر صرف القطعة على الطلب.');
    }
  },
};

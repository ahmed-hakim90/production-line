import { httpsCallable } from 'firebase/functions';
import { auth, functionsClient, isFirebaseEmulatorMode } from '../../auth/services/firebase';

export type CycleAction = 'prepare' | 'approve' | 'assignInspectors' | 'assignWorkers' | 'start' | 'submit' | 'pause' | 'resume';
export type CycleOption = { id: string; name: string };
export type CycleSlot = {
  id: string; date: string; startTime: string; endTime: string; targetQuantity: number;
  status: 'planned' | 'open' | 'paused' | 'quality_pending'; containerId: string;
  actualQuantity?: number; rejectedQuantity?: number; productionNotes?: string;
  submittedAt?: string; openedAt?: string; pausedAt?: string; pauseReason?: string;
  workersSnapshotCount?: number; workersSnapshot?: CycleOption[]; productionDocumentId?: string;
};
export type CycleOrder = {
  id: string; cycleVersion: 2; cycleRevision: number; workOrderNumber: string;
  productName: string; lineName: string; supervisorName: string; supervisorUid: string;
  quantity: number; producedQuantity: number; approvedAcceptedQuantity: number;
  productionStatus: 'draft' | 'approved' | 'in_progress'; qualityHold?: boolean;
  activeSlotId?: string; workerIds: string[]; inspectorUids: string[]; preparedAt: string;
  slots: CycleSlot[];
};
export type CycleWorkspace = {
  uid: string; permissions: Record<string, boolean>; orders: CycleOrder[];
  directory: Record<'products' | 'lines' | 'supervisors' | 'inspectors' | 'workers', CycleOption[]>;
  truncated: boolean; fetchedAt: string;
};
function localOnly() {
  if (!isFirebaseEmulatorMode) throw new Error('الدورة الجديدة متاحة في المختبر المحلي فقط.');
  if (!auth.currentUser) throw new Error('يجب تسجيل الدخول.');
}
export const workOrderCycleService = {
  async read(input: { orderId?: string; directory?: boolean } = {}) {
    localOnly();
    return (await httpsCallable<typeof input, CycleWorkspace>(functionsClient, 'getWorkOrderCycleWorkspace', { timeout: 10000 })(input)).data;
  },
  async mutate(orderId: string, action: CycleAction, payload: Record<string, unknown> = {}) {
    localOnly();
    // Preserve the request ID after uncertain network outcomes, including a page reload.
    const encoded = new TextEncoder().encode(JSON.stringify({ orderId, action, payload }));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))).map(n => n.toString(16).padStart(2, '0')).join('');
    const key = `work-order-cycle:${auth.currentUser!.uid}:${digest}`;
    const requestId = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, requestId);
    try {
      const result = await httpsCallable(functionsClient, 'mutateWorkOrderCycle', { timeout: 15000 })({ orderId, action, payload, requestId });
      sessionStorage.removeItem(key);
      return result.data;
    } catch (error) {
      const code = String((error as { code?: string }).code || '');
      if (['functions/invalid-argument', 'functions/failed-precondition', 'functions/permission-denied', 'functions/unauthenticated'].includes(code)) sessionStorage.removeItem(key);
      throw error;
    }
  },
};

import { httpsCallable } from 'firebase/functions';
import { auth, functionsClient } from '../../auth/services/firebase';

export type CycleAction = 'prepare' | 'editDraft' | 'reassignSupervisor' | 'approve' | 'assignInspectors' | 'assignWorkers' | 'start' | 'submit' | 'pause' | 'resume' | 'defineQualityReport' | 'submitQualityReport' | 'claimQualityInspection' | 'releaseQualityInspection' | 'approveQualityReport' | 'returnQualityReport' | 'correctQualityReport' | 'lockQuality' | 'unlockQuality' | 'decideRejectedDisposition' | 'submitRework' | 'claimReworkInspection' | 'submitReworkQualityReport' | 'approveReworkQualityReport' | 'receivePackaging' | 'packageContainer' | 'deliverToWarehouse' | 'proposePlanRevision' | 'applyPlanRevision' | 'closeProduction';
export type CycleOption = { id: string; name: string };
export type QualityCheckTemplate = { id: string; label: string; inputType: 'number' | 'text'; minValue?: number; maxValue?: number; required: boolean };
export type QualityCheckResult = { checkId: string; label: string; value: string | number; notes?: string };
export type RejectedDisposition = { reworkQuantity: number; scrapQuantity: number; reason: string; actorName: string; decidedAt: string };
export type PackagingEvent = { id: string; action: 'receive' | 'package' | 'deliver'; quantity: number; note?: string; actorName: string; createdAt: string; warehouseId?: string };
type PackagingFields = {
  packagingReceivedQuantity?: number; packagingPackagedQuantity?: number; packagingDeliveredQuantity?: number;
  packagingEventsTruncated?: boolean; packagingEvents?: PackagingEvent[];
};
export type ReworkAttempt = {
  id: string; attemptNumber: number; requestedQuantity: number;
  status: 'planned' | 'quality_pending' | 'quality_accepted';
  actualQuantity?: number; notes?: string; submittedAt?: string;
  qualityClaim?: { id: string; uid: string; name: string; startedAt: string } | null;
  inspectedQuantity?: number; inspectedAcceptedQuantity?: number; inspectedRejectedQuantity?: number;
  contributionsTruncated?: boolean;
  qualityContributions?: { id: string; inspectorName: string; submittedAt: string; inspectedQuantity: number; acceptedQuantity: number; rejectedQuantity: number; results: QualityCheckResult[] }[];
  qualityApprovedAcceptedQuantity?: number; qualityApprovedRejectedQuantity?: number;
  qualityApprovedByName?: string; qualityApprovedAt?: string;
  rejectedDisposition?: RejectedDisposition;
  reason: string; createdByName: string; createdAt: string;
} & PackagingFields;
export type PlanRevisionSlot = { slotId: string; previousTargetQuantity: number; proposedTargetQuantity: number };
export type PlanRevision = {
  id: string; status: 'proposed' | 'approved' | 'superseded';
  proposedAt: string; proposedByName: string;
  basis: { rateSource: 'this_order' | 'product_line_history' | 'original_plan_fallback'; ratePerHour: number | null; sampleHours: number; lowConfidence: boolean };
  remainingToTarget: number; pendingQualityQuantity: number; pendingReworkQuantity: number; achievedQuantity: number; targetQuantity: number;
  slots: PlanRevisionSlot[];
  approvedAt?: string; approvedByName?: string; supersededAt?: string;
};
export type CycleSlot = {
  id: string; date: string; startTime: string; endTime: string; targetQuantity: number;
  status: 'planned' | 'open' | 'paused' | 'quality_pending' | 'quality_accepted' | 'cancelled'; containerId: string;
  cancelledAt?: string; cancelledReason?: string; cancelledByName?: string;
  actualQuantity?: number; rejectedQuantity?: number; productionNotes?: string;
  submittedAt?: string; openedAt?: string; pausedAt?: string; pauseReason?: string;
  workersSnapshotCount?: number; workersSnapshot?: CycleOption[]; productionDocumentId?: string;
  qualityResults?: QualityCheckResult[];
  qualityClaim?: { id: string; uid: string; name: string; startedAt: string } | null;
  inspectedQuantity?: number; inspectedAcceptedQuantity?: number; inspectedRejectedQuantity?: number;
  contributionsTruncated?: boolean;
  qualityContributions?: { id: string; inspectorName: string; submittedAt: string; inspectedQuantity: number; acceptedQuantity: number; rejectedQuantity: number; results: QualityCheckResult[] }[];
  qualityApprovedAcceptedQuantity?: number; qualityApprovedRejectedQuantity?: number;
  qualityApprovedBy?: string; qualityApprovedByName?: string; qualityApprovedAt?: string;
  qualityCorrectionCount?: number;
  qualityCorrections?: { id: string; previousAcceptedQuantity: number; previousRejectedQuantity: number; newAcceptedQuantity: number; newRejectedQuantity: number; reason: string; actorName: string; createdAt: string }[];
  rejectedDisposition?: RejectedDisposition;
  reworkAttempts?: ReworkAttempt[];
} & PackagingFields;
export type CycleOrder = {
  id: string; cycleVersion: 2; cycleRevision: number; workOrderNumber: string;
  productId: string; lineId: string;
  auditTruncated?: boolean;
  audit?: { id: string; action: string; actorUid: string; actorName: string; createdAt: string; revision: number; reason: string; previousSupervisorUid: string; supervisorUid: string }[];
  productName: string; lineName: string; supervisorName: string; supervisorUid: string;
  quantity: number; producedQuantity: number; approvedAcceptedQuantity: number;
  productionStatus: 'draft' | 'approved' | 'in_progress' | 'closed'; qualityHold?: boolean;
  qualityHoldReason?: string; qualityHoldByName?: string; qualityHoldAt?: string;
  productionClosedAt?: string; productionClosedByName?: string; productionCloseReason?: string;
  productionClosedWithDeficit?: boolean; productionClosedCancelledSlotCount?: number;
  activeSlotId?: string; workerIds: string[]; inspectorUids: string[]; preparedAt: string;
  qualityReportTemplate?: QualityCheckTemplate[];
  planRevisionsTruncated?: boolean; planRevisions?: PlanRevision[];
  slots: CycleSlot[];
};
export type CycleWorkspace = {
  uid: string; permissions: Record<string, boolean>; orders: CycleOrder[];
  directory: Record<'products' | 'lines' | 'supervisors' | 'inspectors' | 'workers', CycleOption[]>;
  truncated: boolean; fetchedAt: string;
};
function localOnly() {
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

import {
  addDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { employeeService } from '@/modules/hr/employeeService';
import { systemSettingsService } from '@/modules/system/services/systemSettingsService';
import {
  productionApprovalRequestDocRef,
  productionApprovalRequestsRef,
} from '../collections';
import type {
  ApprovalChainSnapshot,
  ApprovalEmployeeInfo,
  ApprovalHistoryEntry,
  ApprovalRequestStatus,
  ApprovalRequestType,
  FirestoreApprovalRequest,
} from '@/modules/hr/approval';

const ACTIONABLE_STATUSES: ApprovalRequestStatus[] = ['pending', 'in_progress', 'escalated'];

type CreateProductionApprovalRequestInput = {
  requestType: ApprovalRequestType;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  requestData: Record<string, any>;
  sourceRequestId?: string | null;
  createdBy: string;
  createdByEmployeeId: string;
  createdByName: string;
  approvalEmployees: ApprovalEmployeeInfo[];
};

type ProductionApprovalActionInput = {
  requestId: string;
  actorEmployeeId: string;
  actorName: string;
  notes?: string;
};

type VisibleProductionApprovalQuery = {
  employeeId: string;
  userId?: string;
  viewAll?: boolean;
};

function getCreatedTime(request: FirestoreApprovalRequest): number {
  return request.createdAt?.toMillis?.() ?? request.createdAt?.seconds * 1000 ?? 0;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
}

function getApprovalChain(request: FirestoreApprovalRequest): ApprovalChainSnapshot[] {
  return Array.isArray(request.approvalChain) ? request.approvalChain : [];
}

function toChainSnapshot(employee: ApprovalEmployeeInfo): ApprovalChainSnapshot {
  return {
    approverEmployeeId: employee.employeeId,
    approverName: employee.employeeName,
    approverJobTitle: employee.jobTitle,
    level: employee.jobLevel,
    departmentId: employee.departmentId,
    departmentName: employee.departmentName,
    status: 'pending',
    actionDate: null,
    notes: '',
    delegatedTo: null,
    delegatedToName: null,
  };
}

function deriveStatus(approvalChain: ApprovalChainSnapshot[]): ApprovalRequestStatus {
  if (approvalChain.length === 0) return 'approved';
  if (approvalChain.some((step) => step.status === 'rejected')) return 'rejected';
  if (approvalChain.every((step) => step.status === 'approved' || step.status === 'skipped')) return 'approved';
  if (approvalChain.some((step) => step.status === 'approved')) return 'in_progress';
  return 'pending';
}

function buildHistoryEntry(
  step: number,
  action: ApprovalHistoryEntry['action'],
  performedBy: string,
  performedByName: string,
  notes: string,
  previousStatus: ApprovalRequestStatus,
  newStatus: ApprovalRequestStatus,
): ApprovalHistoryEntry {
  return {
    step,
    action,
    performedBy,
    performedByName,
    timestamp: Timestamp.now(),
    notes,
    previousStatus,
    newStatus,
  };
}

function getParticipantEmployeeIds(request: FirestoreApprovalRequest): string[] {
  return uniqueNonEmpty([
    request.employeeId,
    request.requestData?.requestedByEmployeeId,
    ...(request.requestData?.productionRequestObserverEmployeeIds || []),
    ...getApprovalChain(request).flatMap((step) => [step.approverEmployeeId, step.delegatedTo]),
    ...(request.history || []).map((entry) => entry.performedBy === 'system' ? '' : entry.performedBy),
  ]);
}

async function resolveUserIdsForEmployeeIds(employeeIds: string[]): Promise<string[]> {
  const userIds = await Promise.all(
    uniqueNonEmpty(employeeIds).map((employeeId) =>
      employeeService.getUserIdByEmployeeId(employeeId).catch(() => null),
    ),
  );
  return uniqueNonEmpty(userIds);
}

async function buildProductionApprovalAccessFields(
  request: FirestoreApprovalRequest,
): Promise<Pick<FirestoreApprovalRequest, 'currentApproverEmployeeIds' | 'currentApproverUserIds' | 'participantEmployeeIds' | 'participantUserIds'>> {
  const currentApproverEmployeeIds = getCurrentApproverEmployeeIds(request);
  const participantEmployeeIds = getParticipantEmployeeIds(request);
  const [currentApproverUserIds, participantUserIds] = await Promise.all([
    resolveUserIdsForEmployeeIds(currentApproverEmployeeIds),
    resolveUserIdsForEmployeeIds(participantEmployeeIds),
  ]);

  return {
    currentApproverEmployeeIds,
    currentApproverUserIds,
    participantEmployeeIds,
    participantUserIds,
  };
}

function getCurrentApproverEmployeeIds(request: FirestoreApprovalRequest): string[] {
  if (!ACTIONABLE_STATUSES.includes(request.status)) return [];
  const approvalChain = getApprovalChain(request);
  const currentStep = Math.max(0, Number(request.currentStep || 0));
  if (currentStep >= approvalChain.length) return [];
  const step = approvalChain[currentStep];
  return uniqueNonEmpty([step.approverEmployeeId, step.delegatedTo]);
}

function isCurrentActor(request: FirestoreApprovalRequest, employeeId: string): boolean {
  if (!ACTIONABLE_STATUSES.includes(request.status)) return false;
  const approvalChain = getApprovalChain(request);
  const currentStep = Math.max(0, Number(request.currentStep || 0));
  if (!employeeId || currentStep >= approvalChain.length) return false;
  const step = approvalChain[currentStep];
  return step.approverEmployeeId === employeeId || step.delegatedTo === employeeId;
}

function isVisibleTo(request: FirestoreApprovalRequest, params: VisibleProductionApprovalQuery): boolean {
  if (params.viewAll) return true;
  const createdBy = String(request.createdBy || '').trim();
  const requestedByEmployeeId = String(request.requestData?.requestedByEmployeeId || '').trim();
  const participants = getParticipantEmployeeIds(request);
  return (
    Boolean(params.userId && createdBy === params.userId) ||
    Boolean(params.employeeId && requestedByEmployeeId === params.employeeId) ||
    Boolean(params.employeeId && participants.includes(params.employeeId)) ||
    isCurrentActor(request, params.employeeId)
  );
}

async function buildProductionApprovalChain(
  approvalEmployees: ApprovalEmployeeInfo[],
): Promise<{ chain: ApprovalChainSnapshot[]; observerEmployeeIds: string[]; observerUserIds: string[]; error?: string }> {
  const settings = await systemSettingsService.get().catch(() => null);
  const approverIds = uniqueNonEmpty([
    settings?.planSettings?.productionRequestFirstApproverEmployeeId,
    settings?.planSettings?.productionRequestFinalApproverEmployeeId,
  ]);
  const observerEmployeeIds = uniqueNonEmpty(settings?.planSettings?.productionRequestObserverEmployeeIds || []);
  const observerUserIds = uniqueNonEmpty(settings?.planSettings?.productionRequestObserverUserIds || []);

  if (approverIds.length === 0) {
    return { chain: [], observerEmployeeIds, observerUserIds, error: 'لم يتم تحديد الموافق الأول أو النهائي لطلبات الإنتاج من الإعدادات' };
  }

  const chain = approverIds.flatMap((employeeId) => {
    const approver = approvalEmployees.find((employee) => employee.employeeId === employeeId);
    return approver ? [toChainSnapshot(approver)] : [];
  });

  if (chain.length !== approverIds.length) {
    return { chain: [], observerEmployeeIds, observerUserIds, error: 'أحد الموافقين المحددين لطلبات الإنتاج غير موجود كسجل موظف' };
  }

  return { chain, observerEmployeeIds, observerUserIds };
}

export const productionApprovalRequestService = {
  async create(input: CreateProductionApprovalRequestInput): Promise<{ success: boolean; requestId?: string; error?: string }> {
    if (!isConfigured) return { success: false, error: 'Firebase not configured' };

    const chainResult = await buildProductionApprovalChain(input.approvalEmployees);
    if (chainResult.error) return { success: false, error: chainResult.error };

    const requestDoc: Omit<FirestoreApprovalRequest, 'id'> = {
      tenantId: getCurrentTenantId(),
      requestType: input.requestType,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      departmentId: input.departmentId,
      requestData: {
        ...input.requestData,
        requestedByEmployeeId: input.createdByEmployeeId,
        requestedByName: input.createdByName,
        requestedOnBehalf: true,
        productionRequestObserverEmployeeIds: chainResult.observerEmployeeIds,
        productionRequestObserverUserIds: chainResult.observerUserIds,
      },
      approvalChain: chainResult.chain,
      currentStep: 0,
      status: 'pending',
      history: [
        buildHistoryEntry(
          0,
          'created',
          input.createdByEmployeeId,
          input.createdByName,
          '',
          'pending',
          'pending',
        ),
      ],
      sourceRequestId: input.sourceRequestId || null,
      createdAt: serverTimestamp(),
      createdBy: input.createdBy,
      updatedAt: serverTimestamp(),
    };
    Object.assign(requestDoc, await buildProductionApprovalAccessFields(requestDoc));

    const ref = await addDoc(productionApprovalRequestsRef(), requestDoc);
    return { success: true, requestId: ref.id };
  },

  async getById(id: string): Promise<FirestoreApprovalRequest | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(productionApprovalRequestDocRef(id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreApprovalRequest;
  },

  async getVisible(params: VisibleProductionApprovalQuery): Promise<FirestoreApprovalRequest[]> {
    if (!isConfigured || !params.employeeId) return [];
    const tenantId = getCurrentTenantId();
    const queries = params.viewAll
      ? [
          query(productionApprovalRequestsRef(), where('tenantId', '==', tenantId)),
        ]
      : [
          query(productionApprovalRequestsRef(), where('tenantId', '==', tenantId), where('currentApproverEmployeeIds', 'array-contains', params.employeeId)),
          query(productionApprovalRequestsRef(), where('tenantId', '==', tenantId), where('participantEmployeeIds', 'array-contains', params.employeeId)),
          query(productionApprovalRequestsRef(), where('tenantId', '==', tenantId), where('createdBy', '==', params.userId || '__no_user__')),
        ];

    const results = await Promise.allSettled(queries.map((q) => getDocs(q)));
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (rejected.length === results.length) {
      throw rejected[0].reason;
    }

    const byId = new Map<string, FirestoreApprovalRequest>();
    rejected.forEach((result) => {
      console.warn('Production approval request query failed:', result.reason);
    });
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const snap = result.value;
      snap.docs.forEach((docSnap) => {
        byId.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as FirestoreApprovalRequest);
      });
    });

    return Array.from(byId.values())
      .filter((request) => isVisibleTo(request, params))
      .sort((a, b) => getCreatedTime(b) - getCreatedTime(a));
  },

  async approve(input: ProductionApprovalActionInput): Promise<{ success: boolean; error?: string }> {
    const request = await this.getById(input.requestId);
    if (!request) return { success: false, error: 'الطلب غير موجود' };
    if (!isCurrentActor(request, input.actorEmployeeId)) {
      return { success: false, error: 'ليس لديك صلاحية الموافقة على هذا الطلب' };
    }

    const approvalChain = getApprovalChain(request);
    const currentStep = Math.max(0, Number(request.currentStep || 0));
    if (currentStep >= approvalChain.length) {
      return { success: false, error: 'لا توجد مرحلة اعتماد حالية لهذا الطلب' };
    }
    const updatedChain = [...approvalChain];
    updatedChain[currentStep] = {
      ...updatedChain[currentStep],
      status: 'approved',
      actionDate: Timestamp.now(),
      notes: input.notes || '',
    };
    const nextStep = currentStep + 1;
    const newStatus = deriveStatus(updatedChain);
    const history = [
      ...(Array.isArray(request.history) ? request.history : []),
      buildHistoryEntry(currentStep, 'approved', input.actorEmployeeId, input.actorName, input.notes || '', request.status, newStatus),
    ];

    await updateDoc(productionApprovalRequestDocRef(input.requestId), {
      approvalChain: updatedChain,
      currentStep: nextStep,
      status: newStatus,
      history,
      ...(await buildProductionApprovalAccessFields({ ...request, approvalChain: updatedChain, currentStep: nextStep, status: newStatus, history })),
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  },

  async reject(input: ProductionApprovalActionInput): Promise<{ success: boolean; error?: string }> {
    const request = await this.getById(input.requestId);
    if (!request) return { success: false, error: 'الطلب غير موجود' };
    if (!isCurrentActor(request, input.actorEmployeeId)) {
      return { success: false, error: 'ليس لديك صلاحية رفض هذا الطلب' };
    }

    const approvalChain = getApprovalChain(request);
    const currentStep = Math.max(0, Number(request.currentStep || 0));
    if (currentStep >= approvalChain.length) {
      return { success: false, error: 'لا توجد مرحلة اعتماد حالية لهذا الطلب' };
    }
    const updatedChain = [...approvalChain];
    updatedChain[currentStep] = {
      ...updatedChain[currentStep],
      status: 'rejected',
      actionDate: Timestamp.now(),
      notes: input.notes || '',
    };
    const history = [
      ...(Array.isArray(request.history) ? request.history : []),
      buildHistoryEntry(currentStep, 'rejected', input.actorEmployeeId, input.actorName, input.notes || '', request.status, 'rejected'),
    ];

    await updateDoc(productionApprovalRequestDocRef(input.requestId), {
      approvalChain: updatedChain,
      status: 'rejected',
      history,
      ...(await buildProductionApprovalAccessFields({ ...request, approvalChain: updatedChain, status: 'rejected', history })),
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  },

  async cancel(input: ProductionApprovalActionInput): Promise<{ success: boolean; error?: string }> {
    const request = await this.getById(input.requestId);
    if (!request) return { success: false, error: 'الطلب غير موجود' };
    if (request.status !== 'pending' || request.currentStep !== 0) {
      return { success: false, error: 'لا يمكن إلغاء الطلب بعد بدء الاعتماد' };
    }
    const requestedByEmployeeId = String(request.requestData?.requestedByEmployeeId || '').trim();
    if (requestedByEmployeeId !== input.actorEmployeeId) {
      return { success: false, error: 'يمكن فقط لمنشئ الطلب إلغاءه' };
    }

    const history = [
      ...(Array.isArray(request.history) ? request.history : []),
      buildHistoryEntry(request.currentStep, 'cancelled', input.actorEmployeeId, input.actorName, input.notes || '', request.status, 'cancelled'),
    ];

    await updateDoc(productionApprovalRequestDocRef(input.requestId), {
      status: 'cancelled',
      history,
      ...(await buildProductionApprovalAccessFields({ ...request, status: 'cancelled', history })),
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  },
};

/**
 * Enterprise Approval Engine
 *
 * Core CRUD and workflow operations for the unified approval system.
 * Every mutation is audit-logged, RBAC-validated, and delegation-aware.
 *
 * Public API:
 *   createRequest()       — submit a new approval request
 *   approveRequest()      — approve the current step
 *   rejectRequest()       — reject the request at any step
 *   cancelRequest()       — cancel a pending request
 *   adminOverride()       — admin force-approve or force-reject
 *   getPendingApprovals() — inbox query for an approver
 *   getRequestById()      — fetch single request
 *   getRequestsByEmployee — all requests for an employee
 */
import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import {
  approvalRequestsRef,
  approvalRequestDocRef,
  approvalSettingsDocRef,
} from './collections';
import { departmentsRef, jobPositionsRef } from '../collections';
import { buildApprovalChain, buildConfiguredApprovalChain, tryAutoApprove } from './approvalBuilder';
import { resolveHrApproverFromOrg, type HrApproverResolutionResult } from './hrApproverResolution';
import {
  validateCreate,
  validateAction,
  validateCancel,
  type CallerContext,
} from './approvalValidation';
import { approvalDelegationService } from './approvalDelegation';
import { approvalAuditService } from './approvalAudit';
import { buildPenaltyDeductionInput, formatPenaltyRequestSummary } from './penaltyApproval';
import { hrNotificationService } from './notifications';
import { employeeService } from '../employeeService';
import { syncLeaveApprovalDecision } from '../leaveService';
import { employeeDeductionService } from '../employeeFinancialsService';
import { userService } from '@/services/userService';
import { roleService } from '@/modules/system/services/roleService';
import { systemSettingsService } from '@/modules/system/services/systemSettingsService';
import type {
  FirestoreApprovalRequest,
  FirestoreApprovalSettings,
  ApprovalHistoryEntry,
  ApprovalRequestStatus,
  CreateRequestOptions,
  ApprovalActionOptions,
  CancelRequestOptions,
  AdminOverrideOptions,
  OperationResult,
  PendingApprovalsQuery,
  ApprovalEmployeeInfo,
  ApprovalRequestType,
  FirestoreApprovalDelegation,
} from './types';
import type { FirestoreDepartment, FirestoreJobPosition } from '../types';
import { normalizeApprovalSettings } from './types';

const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  leave: 'إجازة',
  loan: 'سلفة',
  penalty: 'جزاء',
  overtime: 'عمل إضافي',
};

function getRequestSummary(request: FirestoreApprovalRequest): string {
  const data = request.requestData || {};
  if (request.requestType === 'leave') {
    return `${data.startDate || '—'} → ${data.endDate || '—'}`;
  }
  if (request.requestType === 'loan') {
    return `${Number(data.loanAmount || 0).toLocaleString('en-US')} ج.م`;
  }
  if (request.requestType === 'penalty') {
    return formatPenaltyRequestSummary(data);
  }
  return data.description || 'طلب عمل إضافي';
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getApprovalSettings(): Promise<FirestoreApprovalSettings> {
  if (!isConfigured) return normalizeApprovalSettings();

  const snap = await getDoc(approvalSettingsDocRef());
  if (!snap.exists()) return normalizeApprovalSettings();
  return normalizeApprovalSettings(snap.data() as Partial<FirestoreApprovalSettings>);
}

export async function updateApprovalSettings(
  settings: Partial<FirestoreApprovalSettings>,
): Promise<void> {
  if (!isConfigured) return;
  const { setDoc } = await import('firebase/firestore');
  await setDoc(approvalSettingsDocRef(), settings, { merge: true });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function deriveStatusFromChain(request: FirestoreApprovalRequest): ApprovalRequestStatus {
  const chain = request.approvalChain;
  if (chain.length === 0) return 'approved';
  if (chain.some((s) => s.status === 'rejected')) return 'rejected';
  if (chain.every((s) => s.status === 'approved' || s.status === 'skipped')) return 'approved';
  if (chain.some((s) => s.status === 'approved')) return 'in_progress';
  return 'pending';
}

function isDelegationActiveForRequest(
  delegation: FirestoreApprovalDelegation,
  requestType: ApprovalRequestType,
  date: string,
): boolean {
  if (!delegation.isActive) return false;
  if (delegation.startDate > date || delegation.endDate < date) return false;
  return delegation.requestTypes === 'all' || delegation.requestTypes.includes(requestType);
}

function getActiveDelegationForCurrentStep(
  request: FirestoreApprovalRequest,
  delegations: FirestoreApprovalDelegation[],
  date: string,
): FirestoreApprovalDelegation | undefined {
  const currentStep = request.approvalChain[request.currentStep];
  if (!currentStep) return undefined;

  return delegations.find((delegation) =>
    delegation.fromEmployeeId === currentStep.approverEmployeeId &&
    isDelegationActiveForRequest(delegation, request.requestType, date),
  );
}

async function resolveDelegateOfCurrentStep(
  request: FirestoreApprovalRequest,
  callerEmployeeId: string,
  allowDelegation: boolean,
): Promise<string | undefined> {
  if (!allowDelegation || !callerEmployeeId) return undefined;

  const currentStep = request.approvalChain[request.currentStep];
  if (!currentStep) return undefined;

  if (currentStep.delegatedTo === callerEmployeeId) {
    return currentStep.approverEmployeeId;
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeDelegations = await approvalDelegationService.getByToEmployee(callerEmployeeId);
  const matchingDelegation = getActiveDelegationForCurrentStep(request, activeDelegations, today);

  return matchingDelegation?.fromEmployeeId;
}

async function resolveHrApproverEmployeeId(
  allEmployees: ApprovalEmployeeInfo[],
  explicitHrEmployeeId?: string,
): Promise<HrApproverResolutionResult> {
  if (explicitHrEmployeeId) return { employeeId: explicitHrEmployeeId, source: 'explicit' };

  try {
    const [rawEmployees, departmentsSnap, jobPositionsSnap] = await Promise.all([
      employeeService.getAll(),
      getDocs(departmentsRef()),
      getDocs(jobPositionsRef()),
    ]);

    const [usersResult, rolesResult, systemSettingsResult] = await Promise.allSettled([
      userService.getAll(),
      roleService.getAll(),
      systemSettingsService.get(),
    ]);

    const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const roles = rolesResult.status === 'fulfilled' ? rolesResult.value : [];
    const systemSettings = systemSettingsResult.status === 'fulfilled' ? systemSettingsResult.value : null;

    const rolePermissions = new Map<string, Record<string, boolean>>();
    roles.forEach((role) => {
      if (role.id) rolePermissions.set(role.id, role.permissions || {});
    });

    const configuredHrUserIds = new Set(
      (systemSettings?.planSettings?.hrApproverUserIds ?? [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );

    const hrUserIdsByPermission = new Set(
      users
        .filter((user) => user.isActive !== false)
        .filter((user) => {
          const perms = rolePermissions.get(String(user.roleId || '').trim());
          if (!perms) return false;
          return perms['approval.manage'] === true || perms['approval.override'] === true;
        })
        .map((user) => String(user.id || '').trim())
        .filter(Boolean),
    );

    const activeUserIds = usersResult.status === 'fulfilled'
      ? new Set(
          users
            .filter((user) => user.isActive !== false)
            .map((user) => String(user.id || '').trim())
            .filter(Boolean),
        )
      : undefined;

    return resolveHrApproverFromOrg({
      allEmployees,
      rawEmployees,
      departments: departmentsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as FirestoreDepartment)),
      jobPositions: jobPositionsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as FirestoreJobPosition)),
      activeUserIds,
      configuredHrUserIds,
      hrUserIdsByPermission,
      explicitHrEmployeeId,
    });
  } catch {
    return { error: 'تعذر التحقق من إعداد مسؤول الموارد البشرية من الهيكل التنظيمي' };
  }
}

function isProductionRequest(options: CreateRequestOptions): boolean {
  const data = options.requestData || {};
  return Boolean(data.productionLineId || data.productionLineName);
}

async function getConfiguredProductionApproverIds(options: CreateRequestOptions): Promise<string[]> {
  if (!isProductionRequest(options)) return [];
  const systemSettings = await systemSettingsService.get().catch(() => null);
  const planSettings = systemSettings?.planSettings;
  return Array.from(new Set([
    planSettings?.productionRequestFirstApproverEmployeeId,
    planSettings?.productionRequestFinalApproverEmployeeId,
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean)));
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
}

function getCurrentApproverEmployeeIds(request: Pick<FirestoreApprovalRequest, 'approvalChain' | 'currentStep' | 'status'>): string[] {
  if (request.status !== 'pending' && request.status !== 'in_progress' && request.status !== 'escalated') return [];
  if (request.currentStep < 0 || request.currentStep >= request.approvalChain.length) return [];

  const step = request.approvalChain[request.currentStep];
  return uniqueNonEmpty([step?.approverEmployeeId, step?.delegatedTo]);
}

function getParticipantEmployeeIds(request: Pick<FirestoreApprovalRequest, 'employeeId' | 'requestData' | 'approvalChain' | 'history'>): string[] {
  return uniqueNonEmpty([
    request.employeeId,
    request.requestData?.requestedByEmployeeId,
    ...request.approvalChain.flatMap((step) => [step.approverEmployeeId, step.delegatedTo]),
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

async function buildApprovalAccessFields(
  request: Pick<FirestoreApprovalRequest, 'employeeId' | 'requestData' | 'approvalChain' | 'currentStep' | 'status' | 'history'>,
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

async function syncApprovedPenaltyDeduction(request: FirestoreApprovalRequest): Promise<void> {
  if (request.requestType !== 'penalty' || request.status !== 'approved' || !request.id) return;
  const data = request.requestData || {};
  const employee = await employeeService.getById(request.employeeId).catch(() => null);
  const deductionInput = buildPenaltyDeductionInput(request, employee);
  if (!deductionInput) return;

  const deductionId = await employeeDeductionService.create(deductionInput);
  const deductionMetadata = {
    ...(deductionInput.amount > 0 ? { penaltyCalculatedAmount: deductionInput.amount } : {}),
    ...(deductionInput.penaltyDailyRate ? { penaltyDailyRate: deductionInput.penaltyDailyRate } : {}),
    ...(deductionInput.penaltyAmountSource ? { penaltyAmountSource: deductionInput.penaltyAmountSource } : {}),
  };

  await updateDoc(approvalRequestDocRef(request.id), {
    requestData: {
      ...data,
      ...deductionMetadata,
      deductionId,
      deductionAppliedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

// ─── Create Request ─────────────────────────────────────────────────────────

export async function createRequest(
  options: CreateRequestOptions,
  caller: CallerContext,
  allEmployees: ApprovalEmployeeInfo[],
  hrEmployeeId?: string,
): Promise<OperationResult> {
  if (!isConfigured) return { success: false, error: 'Firebase not configured' };

  // Idempotency guard: if a source request is already linked, reuse it.
  if (options.sourceRequestId) {
    const existingSnap = await getDocs(
      query(
        approvalRequestsRef(),
        where('tenantId', '==', getCurrentTenantId()),
        where('requestType', '==', options.requestType),
        where('sourceRequestId', '==', options.sourceRequestId),
      ),
    );
    if (!existingSnap.empty) {
      return { success: true, requestId: existingSnap.docs[0].id };
    }
  }

  const createValidation = validateCreate(caller, options.employeeId, allEmployees);
  if (!createValidation.allowed) {
    return { success: false, error: createValidation.error };
  }

  const employee = allEmployees.find((e) => e.employeeId === options.employeeId);
  if (!employee) {
    return { success: false, error: 'الموظف غير موجود' };
  }

  const settings = await getApprovalSettings();

  const autoResult = tryAutoApprove(options.requestData, {
    employee,
    allEmployees,
    requestType: options.requestType,
    settings,
    hrEmployeeId,
    requestCreatorEmployeeId: caller.employeeId,
  });

  if (autoResult) {
    const requestDoc: Omit<FirestoreApprovalRequest, 'id'> = {
      requestType: options.requestType,
      employeeId: options.employeeId,
      employeeName: employee.employeeName,
      departmentId: employee.departmentId,
      requestData: options.requestData,
      approvalChain: [],
      currentStep: 0,
      status: 'approved',
      history: [
        buildHistoryEntry(
          0, 'auto_approved', 'system', 'النظام', 'تمت الموافقة التلقائية',
          'pending', 'approved',
        ),
      ],
      sourceRequestId: options.sourceRequestId ?? null,
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
      createdBy: options.createdBy,
      updatedAt: serverTimestamp(),
    };
    Object.assign(requestDoc, await buildApprovalAccessFields(requestDoc));

    const ref = await addDoc(approvalRequestsRef(), requestDoc);

    await approvalAuditService.log(
      ref.id, options.requestType, options.employeeId,
      'auto_approved', 'system', 'النظام', null,
      { reason: 'ضمن حد الموافقة التلقائية', requestData: options.requestData },
    );

    if (options.requestType === 'leave' && options.sourceRequestId) {
      const syncResult = await syncLeaveApprovalDecision({
        leaveRequestId: options.sourceRequestId,
        approvalChain: [],
        decisionStatus: 'approved',
      });
      if (!syncResult.success) {
        await approvalAuditService.log(
          ref.id,
          options.requestType,
          options.employeeId,
          'auto_approved',
          'system',
          'النظام',
          null,
          { warning: `leave-sync-failed:${syncResult.error || 'unknown'}` },
        );
      }
    }

    if (options.requestType === 'penalty') {
      await syncApprovedPenaltyDeduction({ id: ref.id, ...requestDoc });
    }

    return { success: true, requestId: ref.id };
  }

  const configuredProductionApproverIds = await getConfiguredProductionApproverIds(options);
  let chainResult = configuredProductionApproverIds.length > 0
    ? buildConfiguredApprovalChain(
        {
          employee,
          allEmployees,
          requestType: options.requestType,
          settings,
          requestCreatorEmployeeId: caller.employeeId,
        },
        configuredProductionApproverIds,
      )
    : null;

  if (!chainResult) {
    const hrApproverResolution = await resolveHrApproverEmployeeId(allEmployees, hrEmployeeId);
    const resolvedHrEmployeeId = hrApproverResolution.employeeId;

    if (settings.hrAlwaysFinalLevel && !resolvedHrEmployeeId) {
      return {
        success: false,
        error: hrApproverResolution.error || 'لم يتم تحديد مسؤول الموارد البشرية النهائي في سلسلة الموافقات',
      };
    }

    chainResult = buildApprovalChain({
      employee,
      allEmployees,
      requestType: options.requestType,
      settings,
      hrEmployeeId: resolvedHrEmployeeId,
      requestCreatorEmployeeId: caller.employeeId,
    });
  }

  if (chainResult.chain.length === 0) {
    return {
      success: false,
      error: chainResult.errors.join(' | ') || 'فشل في بناء سلسلة الموافقات',
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < chainResult.chain.length; i++) {
    const step = chainResult.chain[i];
    if (settings.allowDelegation) {
      const delegation = await approvalDelegationService.resolveDelegate(
        step.approverEmployeeId,
        options.requestType,
        today,
      );
      if (delegation) {
        chainResult.chain[i] = {
          ...step,
          delegatedTo: delegation.toEmployeeId,
          delegatedToName: delegation.toEmployeeName,
        };
      }
    }
  }

  const requestDoc: Omit<FirestoreApprovalRequest, 'id'> = {
    requestType: options.requestType,
    employeeId: options.employeeId,
    employeeName: employee.employeeName,
    departmentId: employee.departmentId,
    requestData: options.requestData,
    approvalChain: chainResult.chain,
    currentStep: 0,
    status: 'pending',
    history: [
      buildHistoryEntry(
        0, 'created', caller.employeeId, caller.employeeName,
        '', 'pending', 'pending',
      ),
    ],
    sourceRequestId: options.sourceRequestId ?? null,
    tenantId: getCurrentTenantId(),
    createdAt: serverTimestamp(),
    createdBy: options.createdBy,
    updatedAt: serverTimestamp(),
  };
  Object.assign(requestDoc, await buildApprovalAccessFields(requestDoc));

  const ref = await addDoc(approvalRequestsRef(), requestDoc);

  await approvalAuditService.log(
    ref.id, options.requestType, options.employeeId,
    'created', caller.employeeId, caller.employeeName, null,
    { chainLength: chainResult.chain.length, sourceRequestId: options.sourceRequestId },
  );

  return { success: true, requestId: ref.id };
}

// ─── Approve Request ────────────────────────────────────────────────────────

export async function approveRequest(
  options: ApprovalActionOptions,
  caller: CallerContext,
): Promise<OperationResult> {
  if (!isConfigured) return { success: false, error: 'Firebase not configured' };

  const request = await getRequestById(options.requestId);
  if (!request) return { success: false, error: 'الطلب غير موجود' };

  const settings = await getApprovalSettings();
  const delegateOf = await resolveDelegateOfCurrentStep(request, caller.employeeId, settings.allowDelegation);

  const validation = validateAction(caller, request, delegateOf);
  if (!validation.allowed) {
    return { success: false, error: validation.error };
  }

  const previousStatus = request.status;
  const updatedChain = [...request.approvalChain];

  if (validation.isAdminOverride) {
    for (let i = request.currentStep; i < updatedChain.length; i++) {
      if (updatedChain[i].status === 'pending') {
        updatedChain[i] = {
          ...updatedChain[i],
          status: 'approved',
          actionDate: Timestamp.now(),
          notes: options.notes || 'موافقة إدارية',
        };
      }
    }
  } else {
    updatedChain[request.currentStep] = {
      ...updatedChain[request.currentStep],
      status: 'approved',
      actionDate: Timestamp.now(),
      notes: options.notes || '',
    };
  }

  const nextStep = validation.isAdminOverride
    ? updatedChain.length
    : request.currentStep + 1;

  const updatedRequest: Partial<FirestoreApprovalRequest> = {
    approvalChain: updatedChain,
    currentStep: nextStep,
    updatedAt: serverTimestamp(),
  };

  const tempRequest = { ...request, approvalChain: updatedChain, currentStep: nextStep };
  updatedRequest.status = deriveStatusFromChain(tempRequest);

  const historyEntry = buildHistoryEntry(
    request.currentStep,
    validation.isAdminOverride ? 'admin_override' : 'approved',
    caller.employeeId,
    options.approverName,
    options.notes || '',
    previousStatus,
    updatedRequest.status!,
  );
  updatedRequest.history = [...request.history, historyEntry];
  Object.assign(updatedRequest, await buildApprovalAccessFields({
    ...request,
    approvalChain: updatedChain,
    currentStep: nextStep,
    status: updatedRequest.status!,
    history: updatedRequest.history,
  }));

  await updateDoc(approvalRequestDocRef(options.requestId), updatedRequest);

  await approvalAuditService.log(
    options.requestId, request.requestType, request.employeeId,
    validation.isAdminOverride ? 'admin_override' : 'approved',
    caller.employeeId, options.approverName, request.currentStep,
    { notes: options.notes, delegateOf, isAdminOverride: validation.isAdminOverride },
  );

  const resultStatus = updatedRequest.status;
  if (resultStatus === 'in_progress') {
    const nextApprover = updatedChain[nextStep];
    if (nextApprover?.approverEmployeeId) {
      const nextApproverUserId = await employeeService.getUserIdByEmployeeId(nextApprover.approverEmployeeId);
      if (nextApproverUserId) {
        await hrNotificationService.create({
          recipientEmployeeId: nextApprover.approverEmployeeId,
          recipientUserId: nextApproverUserId,
          type: 'new_approval_request',
          title: `طلب ${REQUEST_TYPE_LABELS[request.requestType]} يحتاج موافقتك`,
          body: `${request.employeeName} — ${getRequestSummary(request)}`,
          requestId: request.id,
          actionUrl: '/hr/approval-center',
        });
      }
    }
  } else if (resultStatus === 'approved') {
    await syncApprovedPenaltyDeduction({
      ...request,
      id: options.requestId,
      approvalChain: updatedChain,
      currentStep: nextStep,
      status: 'approved',
      history: updatedRequest.history || request.history,
    });

    const employeeUserId = await employeeService.getUserIdByEmployeeId(request.employeeId);
    if (employeeUserId) {
      await hrNotificationService.create({
        recipientEmployeeId: request.employeeId,
        recipientUserId: employeeUserId,
        type: 'request_approved',
        title: '✓ تمت الموافقة على طلبك',
        body: `طلب ${REQUEST_TYPE_LABELS[request.requestType]} — تمت الموافقة`,
        requestId: request.id,
        actionUrl: '/hr/self-service',
      });
    }
  }

  return { success: true, requestId: options.requestId };
}

// ─── Reject Request ─────────────────────────────────────────────────────────

export async function rejectRequest(
  options: ApprovalActionOptions,
  caller: CallerContext,
): Promise<OperationResult> {
  if (!isConfigured) return { success: false, error: 'Firebase not configured' };

  const request = await getRequestById(options.requestId);
  if (!request) return { success: false, error: 'الطلب غير موجود' };

  const settings = await getApprovalSettings();
  const delegateOf = await resolveDelegateOfCurrentStep(request, caller.employeeId, settings.allowDelegation);

  const validation = validateAction(caller, request, delegateOf);
  if (!validation.allowed) {
    return { success: false, error: validation.error };
  }

  const previousStatus = request.status;
  const updatedChain = [...request.approvalChain];

  updatedChain[request.currentStep] = {
    ...updatedChain[request.currentStep],
    status: 'rejected',
    actionDate: Timestamp.now(),
    notes: options.notes || '',
  };

  const historyEntry = buildHistoryEntry(
    request.currentStep,
    validation.isAdminOverride ? 'admin_override' : 'rejected',
    caller.employeeId,
    options.approverName,
    options.notes || '',
    previousStatus,
    'rejected',
  );

  const updatedRequest: Partial<FirestoreApprovalRequest> = {
    approvalChain: updatedChain,
    status: 'rejected',
    updatedAt: serverTimestamp(),
    history: [...request.history, historyEntry],
  };
  Object.assign(updatedRequest, await buildApprovalAccessFields({
    ...request,
    approvalChain: updatedChain,
    status: 'rejected',
    history: updatedRequest.history!,
  }));

  await updateDoc(approvalRequestDocRef(options.requestId), updatedRequest);

  await approvalAuditService.log(
    options.requestId, request.requestType, request.employeeId,
    validation.isAdminOverride ? 'admin_override' : 'rejected',
    caller.employeeId, options.approverName, request.currentStep,
    { notes: options.notes, delegateOf },
  );

  const employeeUserId = await employeeService.getUserIdByEmployeeId(request.employeeId);
  if (employeeUserId) {
    await hrNotificationService.create({
      recipientEmployeeId: request.employeeId,
      recipientUserId: employeeUserId,
      type: 'request_rejected',
      title: '✗ تم رفض طلبك',
      body: `طلب ${REQUEST_TYPE_LABELS[request.requestType]} — تم الرفض`,
      requestId: request.id,
      actionUrl: '/hr/self-service',
    });
  }

  return { success: true, requestId: options.requestId };
}

// ─── Cancel Request ─────────────────────────────────────────────────────────

export async function cancelRequest(
  options: CancelRequestOptions,
  caller: CallerContext,
): Promise<OperationResult> {
  if (!isConfigured) return { success: false, error: 'Firebase not configured' };

  const request = await getRequestById(options.requestId);
  if (!request) return { success: false, error: 'الطلب غير موجود' };

  const validation = validateCancel(caller, request);
  if (!validation.allowed) {
    return { success: false, error: validation.error };
  }

  const previousStatus = request.status;
  const historyEntry = buildHistoryEntry(
    request.currentStep,
    'cancelled',
    options.cancelledBy,
    options.cancelledByName,
    options.reason || '',
    previousStatus,
    'cancelled',
  );

  const updatedRequest: Partial<FirestoreApprovalRequest> = {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
    history: [...request.history, historyEntry],
  };
  Object.assign(updatedRequest, await buildApprovalAccessFields({
    ...request,
    status: 'cancelled',
    history: updatedRequest.history!,
  }));

  await updateDoc(approvalRequestDocRef(options.requestId), updatedRequest);

  await approvalAuditService.log(
    options.requestId, request.requestType, request.employeeId,
    'cancelled', options.cancelledBy, options.cancelledByName,
    request.currentStep, { reason: options.reason },
  );

  return { success: true, requestId: options.requestId };
}

// ─── Admin Override ─────────────────────────────────────────────────────────

export async function adminOverride(
  options: AdminOverrideOptions,
  caller: CallerContext,
): Promise<OperationResult> {
  if (options.action === 'approved') {
    return approveRequest(
      {
        requestId: options.requestId,
        approverEmployeeId: options.adminEmployeeId,
        approverName: options.adminName,
        action: 'approved',
        notes: options.notes,
      },
      caller,
    );
  }

  return rejectRequest(
    {
      requestId: options.requestId,
      approverEmployeeId: options.adminEmployeeId,
      approverName: options.adminName,
      action: 'rejected',
      notes: options.notes,
    },
    caller,
  );
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getRequestById(
  id: string,
): Promise<FirestoreApprovalRequest | null> {
  if (!isConfigured) return null;
  const snap = await getDoc(approvalRequestDocRef(id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as FirestoreApprovalRequest;
}

export async function getRequestsByEmployee(
  employeeId: string,
): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];
  const q = query(
    approvalRequestsRef(),
    where('tenantId', '==', getCurrentTenantId()),
    where('employeeId', '==', employeeId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

export async function getRequestsByType(
  requestType: ApprovalRequestType,
): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];
  const q = query(
    approvalRequestsRef(),
    where('tenantId', '==', getCurrentTenantId()),
    where('requestType', '==', requestType),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

export async function getAllRequests(): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];
  const q = query(
    approvalRequestsRef(),
    where('tenantId', '==', getCurrentTenantId()),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

export async function getRequestsCreatedBy(
  userId: string,
): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured || !userId) return [];
  const q = query(
    approvalRequestsRef(),
    where('tenantId', '==', getCurrentTenantId()),
    where('createdBy', '==', userId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest))
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return tb - ta;
    });
}

/**
 * Get all requests that the given approver needs to act on.
 * Checks both direct assignment and delegation.
 */
export async function getPendingApprovals(
  params: PendingApprovalsQuery,
): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];

  const statusFilter = ['pending', 'in_progress', 'escalated'];
  const allPending: FirestoreApprovalRequest[] = [];

  if (params.approverUserId) {
    const q = params.requestType
      ? query(
          approvalRequestsRef(),
          where('tenantId', '==', getCurrentTenantId()),
          where('currentApproverUserIds', 'array-contains', params.approverUserId),
          where('requestType', '==', params.requestType),
        )
      : query(
          approvalRequestsRef(),
          where('tenantId', '==', getCurrentTenantId()),
          where('currentApproverUserIds', 'array-contains', params.approverUserId),
        );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest))
      .filter((req) => statusFilter.includes(req.status))
      .filter((req) => {
        if (req.currentStep < 0 || req.currentStep >= req.approvalChain.length) return false;
        const step = req.approvalChain[req.currentStep];
        return step.approverEmployeeId === params.approverEmployeeId || step.delegatedTo === params.approverEmployeeId;
      })
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
        return tb - ta;
      });
  }

  const settings = await getApprovalSettings();
  const today = new Date().toISOString().slice(0, 10);
  const delegationsToCaller = settings.allowDelegation
    ? await approvalDelegationService.getByToEmployee(params.approverEmployeeId)
    : [];

  for (const status of statusFilter) {
    const q = params.requestType
      ? query(
          approvalRequestsRef(),
          where('tenantId', '==', getCurrentTenantId()),
          where('status', '==', status),
          where('requestType', '==', params.requestType),
        )
      : query(
          approvalRequestsRef(),
          where('tenantId', '==', getCurrentTenantId()),
          where('status', '==', status),
        );

    const snap = await getDocs(q);
    allPending.push(
      ...snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest)),
    );
  }

  return allPending
    .flatMap((req) => {
      if (req.currentStep < 0 || req.currentStep >= req.approvalChain.length) return [];
      const step = req.approvalChain[req.currentStep];
      const activeDelegation = getActiveDelegationForCurrentStep(req, delegationsToCaller, today);

      const canAct = (
        step.approverEmployeeId === params.approverEmployeeId ||
        step.delegatedTo === params.approverEmployeeId ||
        Boolean(activeDelegation)
      );

      if (!canAct) return [];

      if (!activeDelegation || step.delegatedTo === params.approverEmployeeId) {
        return [req];
      }

      const approvalChain = [...req.approvalChain];
      approvalChain[req.currentStep] = {
        ...step,
        delegatedTo: activeDelegation.toEmployeeId,
        delegatedToName: activeDelegation.toEmployeeName,
      };
      return [{ ...req, approvalChain }];
    })
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return tb - ta;
    });
}

/**
 * Get requests with a specific status.
 */
export async function getRequestsByStatus(
  status: ApprovalRequestStatus,
): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];
  const q = query(
    approvalRequestsRef(),
    where('tenantId', '==', getCurrentTenantId()),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

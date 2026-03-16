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
import {
  approvalRequestsRef,
  approvalRequestDocRef,
  approvalSettingsDocRef,
} from './collections';
import { buildApprovalChain, tryAutoApprove } from './approvalBuilder';
import {
  validateCreate,
  validateAction,
  validateCancel,
  type CallerContext,
} from './approvalValidation';
import { approvalDelegationService } from './approvalDelegation';
import { approvalAuditService } from './approvalAudit';
import { hrNotificationService } from './notifications';
import { employeeService } from '../employeeService';
import { syncLeaveApprovalDecision } from '../leaveService';
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
} from './types';
import { DEFAULT_APPROVAL_SETTINGS } from './types';

const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  leave: 'إجازة',
  loan: 'سلفة',
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
  return data.description || 'طلب عمل إضافي';
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getApprovalSettings(): Promise<FirestoreApprovalSettings> {
  if (!isConfigured) return { ...DEFAULT_APPROVAL_SETTINGS };

  const snap = await getDoc(approvalSettingsDocRef());
  if (!snap.exists()) return { ...DEFAULT_APPROVAL_SETTINGS };
  return snap.data() as FirestoreApprovalSettings;
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

async function resolveHrApproverEmployeeId(
  allEmployees: ApprovalEmployeeInfo[],
  explicitHrEmployeeId?: string,
): Promise<string | undefined> {
  if (explicitHrEmployeeId) return explicitHrEmployeeId;

  try {
    const [users, roles, rawEmployees, systemSettings] = await Promise.all([
      userService.getAll(),
      roleService.getAll(),
      employeeService.getAll(),
      systemSettingsService.get(),
    ]);

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

    const infoIds = new Set(allEmployees.map((e) => e.employeeId));
    const configuredCandidates = rawEmployees.filter(
      (employee) =>
        employee.isActive !== false &&
        Boolean(employee.id) &&
        Boolean(employee.userId) &&
        configuredHrUserIds.has(String(employee.userId || '').trim()),
    );
    if (configuredCandidates.length > 0) {
      const inCurrentGraph = configuredCandidates.find((employee) => infoIds.has(String(employee.id)));
      return String((inCurrentGraph || configuredCandidates[0])?.id || '') || undefined;
    }

    if (hrUserIdsByPermission.size === 0) return undefined;

    const permissionCandidates = rawEmployees.filter(
      (employee) =>
        employee.isActive !== false &&
        Boolean(employee.id) &&
        Boolean(employee.userId) &&
        hrUserIdsByPermission.has(String(employee.userId || '').trim()),
    );

    const inCurrentGraph = permissionCandidates.find((employee) => infoIds.has(String(employee.id)));
    return String((inCurrentGraph || permissionCandidates[0])?.id || '') || undefined;
  } catch {
    return undefined;
  }
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
        where('requestType', '==', options.requestType),
        where('sourceRequestId', '==', options.sourceRequestId),
      ),
    );
    if (!existingSnap.empty) {
      return { success: true, requestId: existingSnap.docs[0].id };
    }
  }

  const createValidation = validateCreate(caller, options.employeeId);
  if (!createValidation.allowed) {
    return { success: false, error: createValidation.error };
  }

  const employee = allEmployees.find((e) => e.employeeId === options.employeeId);
  if (!employee) {
    return { success: false, error: 'الموظف غير موجود' };
  }

  const settings = await getApprovalSettings();
  const resolvedHrEmployeeId = await resolveHrApproverEmployeeId(allEmployees, hrEmployeeId);

  const autoResult = tryAutoApprove(options.requestData, {
    employee,
    allEmployees,
    requestType: options.requestType,
    settings,
    hrEmployeeId: resolvedHrEmployeeId,
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
      createdAt: serverTimestamp(),
      createdBy: options.createdBy,
      updatedAt: serverTimestamp(),
    };

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

    return { success: true, requestId: ref.id };
  }

  const chainResult = buildApprovalChain({
    employee,
    allEmployees,
    requestType: options.requestType,
    settings,
    hrEmployeeId: resolvedHrEmployeeId,
  });

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
    createdAt: serverTimestamp(),
    createdBy: options.createdBy,
    updatedAt: serverTimestamp(),
  };

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
  let delegateOf: string | undefined;

  if (settings.allowDelegation) {
    const today = new Date().toISOString().slice(0, 10);
    const delegation = await approvalDelegationService.resolveDelegate(
      caller.employeeId,
      request.requestType,
      today,
    );
    if (delegation) {
      delegateOf = delegation.fromEmployeeId;
    }

    const currentStep = request.approvalChain[request.currentStep];
    if (currentStep?.delegatedTo === caller.employeeId) {
      delegateOf = currentStep.approverEmployeeId;
    }
  }

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
          actionUrl: '/approval-center',
        });
      }
    }
  } else if (resultStatus === 'approved') {
    const employeeUserId = await employeeService.getUserIdByEmployeeId(request.employeeId);
    if (employeeUserId) {
      await hrNotificationService.create({
        recipientEmployeeId: request.employeeId,
        recipientUserId: employeeUserId,
        type: 'request_approved',
        title: '✓ تمت الموافقة على طلبك',
        body: `طلب ${REQUEST_TYPE_LABELS[request.requestType]} — تمت الموافقة`,
        requestId: request.id,
        actionUrl: '/self-service',
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
  let delegateOf: string | undefined;

  if (settings.allowDelegation) {
    const currentStep = request.approvalChain[request.currentStep];
    if (currentStep?.delegatedTo === caller.employeeId) {
      delegateOf = currentStep.approverEmployeeId;
    }
  }

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
      actionUrl: '/self-service',
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

  await updateDoc(approvalRequestDocRef(options.requestId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
    history: [...request.history, historyEntry],
  });

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
    where('requestType', '==', requestType),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

export async function getAllRequests(): Promise<FirestoreApprovalRequest[]> {
  if (!isConfigured) return [];
  const q = query(approvalRequestsRef(), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
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

  for (const status of statusFilter) {
    const q = params.requestType
      ? query(
          approvalRequestsRef(),
          where('status', '==', status),
          where('requestType', '==', params.requestType),
        )
      : query(
          approvalRequestsRef(),
          where('status', '==', status),
        );

    const snap = await getDocs(q);
    allPending.push(
      ...snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest)),
    );
  }

  return allPending
    .filter((req) => {
      if (req.currentStep >= req.approvalChain.length) return false;
      const step = req.approvalChain[req.currentStep];
      return (
        step.approverEmployeeId === params.approverEmployeeId ||
        step.delegatedTo === params.approverEmployeeId
      );
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
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreApprovalRequest));
}

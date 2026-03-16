/**
 * Approval Validation — RBAC Enforcement
 *
 * Enforces role-based access control for all approval operations:
 *   • Employee: create own requests only
 *   • Manager: approve subordinates only (must be in chain)
 *   • HR: final approval on all requests
 *   • Admin: override any request
 *
 * Pure functions — no Firestore calls. All data is passed in.
 */
import type {
  FirestoreApprovalRequest,
  ApprovalChainSnapshot,
  ApprovalRequestStatus,
  FirestoreApprovalSettings,
  ApprovalRequestType,
  AutoApproveThreshold,
} from './types';

// ─── RBAC Role Resolution ───────────────────────────────────────────────────

export type ApprovalRole = 'employee' | 'manager' | 'hr' | 'admin';

export interface CallerContext {
  employeeId: string;
  employeeName: string;
  permissions: Record<string, boolean>;
}

/**
 * Derive the caller's highest approval role from their permissions map.
 * Admin > HR > Manager > Employee.
 */
export function resolveApprovalRole(permissions: Record<string, boolean>): ApprovalRole {
  if (permissions['approval.override'] === true) return 'admin';
  if (permissions['approval.manage'] === true) return 'hr';
  if (permissions['approval.view'] === true) return 'manager';
  return 'employee';
}

// ─── Create Validation ──────────────────────────────────────────────────────

export interface CreateValidationResult {
  allowed: boolean;
  error?: string;
}

/**
 * Validate that a caller can create a request for a given employee.
 * - Employees can only create requests for themselves
 * - HR and Admin can create on behalf of any employee
 */
export function validateCreate(
  caller: CallerContext,
  targetEmployeeId: string,
): CreateValidationResult {
  const role = resolveApprovalRole(caller.permissions);

  if (role === 'admin' || role === 'hr') {
    return { allowed: true };
  }

  if (caller.employeeId !== targetEmployeeId) {
    return {
      allowed: false,
      error: 'لا يمكنك إنشاء طلب نيابة عن موظف آخر',
    };
  }

  return { allowed: true };
}

// ─── Approve / Reject Validation ────────────────────────────────────────────

export interface ActionValidationResult {
  allowed: boolean;
  isAdminOverride: boolean;
  error?: string;
}

/**
 * Validate that a caller can approve/reject a request.
 * Checks:
 *   1. Request is actionable (pending or in_progress)
 *   2. Caller is the current step's approver (or their delegate)
 *   3. Previous steps are all approved (sequential enforcement)
 *   4. Admin can override at any point
 */
export function validateAction(
  caller: CallerContext,
  request: FirestoreApprovalRequest,
  delegateOfEmployeeId?: string,
): ActionValidationResult {
  const role = resolveApprovalRole(caller.permissions);
  const chain = request.approvalChain;
  const currentStep = request.currentStep;
  const hasOpenCurrentStep =
    currentStep >= 0 &&
    currentStep < chain.length &&
    chain[currentStep]?.status === 'pending';

  if (
    (request.status === 'approved' || request.status === 'rejected' || request.status === 'cancelled') &&
    !hasOpenCurrentStep
  ) {
    return {
      allowed: false,
      isAdminOverride: false,
      error: 'الطلب مغلق ولا يمكن اتخاذ إجراء عليه',
    };
  }

  if (role === 'admin') {
    return { allowed: true, isAdminOverride: true };
  }

  if (currentStep >= chain.length) {
    return {
      allowed: false,
      isAdminOverride: false,
      error: 'تم استكمال جميع مستويات الموافقة',
    };
  }

  const stepItem = chain[currentStep];
  const isDirectApprover = stepItem.approverEmployeeId === caller.employeeId;
  const isDelegateApprover = delegateOfEmployeeId === stepItem.approverEmployeeId;
  const isHrOnFinalStep = role === 'hr' && currentStep === chain.length - 1;

  if (!isDirectApprover && !isDelegateApprover && !isHrOnFinalStep) {
    return {
      allowed: false,
      isAdminOverride: false,
      error: 'ليس لديك صلاحية الموافقة على هذا المستوى',
    };
  }

  const previousIncomplete = chain
    .slice(0, currentStep)
    .some((s) => s.status !== 'approved' && s.status !== 'skipped');
  if (previousIncomplete) {
    return {
      allowed: false,
      isAdminOverride: false,
      error: 'لا يمكن تخطي مستويات الموافقة — يجب الموافقة من المستوى الأدنى أولاً',
    };
  }

  return { allowed: true, isAdminOverride: false };
}

// ─── Cancel Validation ──────────────────────────────────────────────────────

export function validateCancel(
  caller: CallerContext,
  request: FirestoreApprovalRequest,
): CreateValidationResult {
  const role = resolveApprovalRole(caller.permissions);

  if (request.status === 'approved' || request.status === 'rejected' || request.status === 'cancelled') {
    return {
      allowed: false,
      error: 'لا يمكن إلغاء طلب مغلق',
    };
  }

  if (role === 'admin' || role === 'hr') {
    return { allowed: true };
  }

  if (caller.employeeId !== request.employeeId) {
    return {
      allowed: false,
      error: 'يمكن فقط لصاحب الطلب إلغاءه',
    };
  }

  if (request.currentStep > 0) {
    return {
      allowed: false,
      error: 'لا يمكن إلغاء الطلب بعد بدء عملية الموافقة',
    };
  }

  return { allowed: true };
}

// ─── Auto-Approve Check ─────────────────────────────────────────────────────

/**
 * Check if a request qualifies for auto-approval based on settings thresholds.
 * For example, leave requests <= 1 day might auto-approve.
 */
export function checkAutoApprove(
  requestType: ApprovalRequestType,
  requestData: Record<string, any>,
  settings: FirestoreApprovalSettings,
): boolean {
  const thresholds = settings.autoApproveThresholds.filter(
    (t) => t.requestType === requestType,
  );

  if (thresholds.length === 0) return false;

  return thresholds.every((threshold: AutoApproveThreshold) => {
    const value = requestData[threshold.field];
    if (typeof value !== 'number') return false;
    return value <= threshold.maxValue;
  });
}

// ─── Query Permission Check ─────────────────────────────────────────────────

/**
 * Determine which requests a caller can see.
 * - Employee: own requests only
 * - Manager: own + subordinates (those where they're in the chain)
 * - HR / Admin: all requests
 */
export function canViewAllRequests(permissions: Record<string, boolean>): boolean {
  const role = resolveApprovalRole(permissions);
  return role === 'admin' || role === 'hr';
}

/**
 * Check if a caller can act on a specific request's current step,
 * considering delegation.
 */
export function canActOnRequest(
  callerEmployeeId: string,
  request: FirestoreApprovalRequest,
  delegateOfEmployeeId?: string,
): boolean {
  if (request.status !== 'pending' && request.status !== 'in_progress') return false;
  if (request.currentStep >= request.approvalChain.length) return false;

  const step = request.approvalChain[request.currentStep];
  return (
    step.approverEmployeeId === callerEmployeeId ||
    delegateOfEmployeeId === step.approverEmployeeId
  );
}

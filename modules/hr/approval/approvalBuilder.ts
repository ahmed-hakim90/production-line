/**
 * Approval Chain Builder
 *
 * Constructs a snapshot-based approval chain from the employee hierarchy.
 * The chain is frozen at creation time — future hierarchy changes do NOT
 * affect existing requests.
 *
 * Chain construction rules:
 *   1. Walk up the managerId chain from the requesting employee
 *   2. Each manager above the requester's level gets an approver slot
 *   3. Levels are capped at settings.maxApprovalLevels
 *   4. If hrAlwaysFinalLevel is true, the HR representative is appended
 *   5. Auto-approve thresholds can skip chain entirely
 */
import type {
  ApprovalChainSnapshot,
  ApprovalEmployeeInfo,
  BuildChainOptions,
  BuildChainResult,
  FirestoreApprovalSettings,
} from './types';
import { checkAutoApprove } from './approvalValidation';

interface ManagerCandidate {
  employee: ApprovalEmployeeInfo;
  distanceFromRequester: number;
}

/**
 * Walk the managerId chain upward, collecting manager candidates.
 * Guards against cycles via a visited set.
 */
function collectManagerChain(
  employee: ApprovalEmployeeInfo,
  allEmployees: ApprovalEmployeeInfo[],
  maxLevels: number,
): ManagerCandidate[] {
  const candidates: ManagerCandidate[] = [];
  const visited = new Set<string>();
  let current = employee;
  let distance = 0;

  while (current.managerId && !visited.has(current.managerId) && candidates.length < maxLevels) {
    visited.add(current.managerId);
    const manager = allEmployees.find((e) => e.employeeId === current.managerId);
    if (!manager) break;

    if (manager.jobLevel > employee.jobLevel) {
      distance++;
      candidates.push({ employee: manager, distanceFromRequester: distance });
    }

    current = manager;
  }

  candidates.sort((a, b) => a.employee.jobLevel - b.employee.jobLevel);
  return candidates;
}

/**
 * Convert a manager candidate into an immutable chain snapshot item.
 */
function toChainSnapshot(emp: ApprovalEmployeeInfo): ApprovalChainSnapshot {
  return {
    approverEmployeeId: emp.employeeId,
    approverName: emp.employeeName,
    approverJobTitle: emp.jobTitle,
    level: emp.jobLevel,
    departmentId: emp.departmentId,
    departmentName: emp.departmentName,
    status: 'pending',
    actionDate: null,
    notes: '',
    delegatedTo: null,
    delegatedToName: null,
  };
}

/**
 * Build the full approval chain for a request.
 *
 * This is the primary entry point for chain construction. The resulting
 * chain is a snapshot that should be stored on the approval request and
 * never modified based on org changes.
 */
export function buildApprovalChain(options: BuildChainOptions): BuildChainResult {
  const { employee, allEmployees, settings, hrEmployeeId } = options;
  const errors: string[] = [];

  if (!employee.managerId) {
    return {
      chain: [],
      errors: ['الموظف ليس لديه مدير مباشر — لا يمكن إنشاء سلسلة موافقات'],
    };
  }

  const managers = collectManagerChain(
    employee,
    allEmployees,
    settings.maxApprovalLevels,
  );

  if (managers.length === 0) {
    errors.push('لم يتم العثور على مديرين في التسلسل الوظيفي');
    return { chain: [], errors };
  }

  const chain: ApprovalChainSnapshot[] = managers.map((m) =>
    toChainSnapshot(m.employee),
  );

  if (settings.hrAlwaysFinalLevel && !hrEmployeeId) {
    return {
      chain: [],
      errors: ['لم يتم تعيين موظف HR بصلاحية الموافقات (approval.manage) ومربوط بحساب مستخدم'],
    };
  }

  if (settings.hrAlwaysFinalLevel && hrEmployeeId) {
    const hrAlreadyInChain = chain.some(
      (item) => item.approverEmployeeId === hrEmployeeId,
    );

    if (!hrAlreadyInChain) {
      const hrEmployee = allEmployees.find((e) => e.employeeId === hrEmployeeId);
      if (hrEmployee) {
        chain.push(toChainSnapshot(hrEmployee));
      } else {
        errors.push('لم يتم العثور على مسؤول الموارد البشرية المحدد');
      }
    }
  }

  if (chain.length > settings.maxApprovalLevels) {
    chain.length = settings.maxApprovalLevels;
  }

  return { chain, errors };
}

/**
 * Check if a request should be auto-approved based on settings thresholds.
 * Returns a pre-approved chain if applicable.
 */
export function tryAutoApprove(
  requestData: Record<string, any>,
  options: BuildChainOptions,
): BuildChainResult | null {
  const shouldAutoApprove = checkAutoApprove(
    options.requestType,
    requestData,
    options.settings,
  );

  if (!shouldAutoApprove) return null;

  return {
    chain: [],
    errors: [],
  };
}

/**
 * Rebuild chain for preview purposes (does not persist).
 * Useful for showing "what the chain would look like" in a form UI.
 */
export function previewApprovalChain(
  options: BuildChainOptions,
): BuildChainResult {
  return buildApprovalChain(options);
}

/**
 * Validate that a built chain meets minimum requirements.
 */
export function validateChain(
  chain: ApprovalChainSnapshot[],
  settings: FirestoreApprovalSettings,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (chain.length === 0) {
    errors.push('سلسلة الموافقات فارغة');
  }

  if (chain.length > settings.maxApprovalLevels) {
    errors.push(
      `سلسلة الموافقات تتجاوز الحد الأقصى (${settings.maxApprovalLevels} مستويات)`,
    );
  }

  const uniqueApprovers = new Set(chain.map((c) => c.approverEmployeeId));
  if (uniqueApprovers.size !== chain.length) {
    errors.push('يوجد مُعتمد مكرر في السلسلة');
  }

  return { valid: errors.length === 0, errors };
}

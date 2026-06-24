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

function getNextManagerId(employee: ApprovalEmployeeInfo): string {
  const directManagerId = String(employee.managerId || '').trim();
  if (directManagerId) return directManagerId;

  const departmentManagerId = String(employee.departmentManagerId || '').trim();
  if (departmentManagerId && departmentManagerId !== employee.employeeId) {
    return departmentManagerId;
  }

  return '';
}

/**
 * Walk the managerId chain upward, collecting manager candidates.
 * Guards against cycles via a visited set.
 */
function collectManagerChain(
  employee: ApprovalEmployeeInfo,
  allEmployees: ApprovalEmployeeInfo[],
  maxLevels: number,
  requestCreatorEmployeeId?: string,
): ManagerCandidate[] {
  const candidates: ManagerCandidate[] = [];
  const visited = new Set<string>();
  let current = employee;
  let distance = 0;
  let nextManagerId = getNextManagerId(current);

  while (nextManagerId && !visited.has(nextManagerId) && candidates.length < maxLevels) {
    visited.add(nextManagerId);
    const manager = allEmployees.find((e) => e.employeeId === nextManagerId);
    if (!manager) break;

    if (
      manager.jobLevel > employee.jobLevel &&
      manager.employeeId !== requestCreatorEmployeeId
    ) {
      distance++;
      candidates.push({ employee: manager, distanceFromRequester: distance });
    }

    current = manager;
    nextManagerId = getNextManagerId(current);
  }

  return candidates;
}

function getMissingManagerChainError(
  employee: ApprovalEmployeeInfo,
  allEmployees: ApprovalEmployeeInfo[],
  requestCreatorEmployeeId?: string,
): string {
  const firstManagerId = getNextManagerId(employee);
  const firstManager = allEmployees.find((e) => e.employeeId === firstManagerId);

  if (!firstManager) {
    return `لم يتم العثور على مديرين في التسلسل الوظيفي — المدير المشار إليه (${firstManagerId}) غير موجود كسجل موظف`;
  }

  if (firstManager.employeeId === requestCreatorEmployeeId) {
    const higherManagerId = getNextManagerId(firstManager);
    if (!higherManagerId) {
      return 'لم يتم العثور على مديرين في التسلسل الوظيفي — المشرف منشئ الطلب ولا يوجد مدير أعلى مضبوط له';
    }
    if (!allEmployees.some((e) => e.employeeId === higherManagerId)) {
      return `لم يتم العثور على مديرين في التسلسل الوظيفي — مدير المشرف (${higherManagerId}) غير موجود كسجل موظف`;
    }
  }

  return 'لم يتم العثور على مديرين في التسلسل الوظيفي — تأكد من حقل المدير ومستوى المدير في الهيكل التنظيمي';
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
 * Build an approval chain from explicitly configured approver employee IDs.
 * Used for production request routing when admins choose the target approvers in settings.
 */
export function buildConfiguredApprovalChain(
  options: BuildChainOptions,
  approverEmployeeIds: string[],
): BuildChainResult {
  const { allEmployees, settings } = options;
  const errors: string[] = [];
  const uniqueApproverIds = Array.from(new Set(
    approverEmployeeIds
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ));

  if (uniqueApproverIds.length === 0) return { chain: [], errors: [] };

  if (uniqueApproverIds.length > settings.maxApprovalLevels) {
    return {
      chain: [],
      errors: [`سلسلة الموافقات تتجاوز الحد الأقصى (${settings.maxApprovalLevels} مستويات)`],
    };
  }

  const chain = uniqueApproverIds.flatMap((employeeId) => {
    const approver = allEmployees.find((employee) => employee.employeeId === employeeId);
    if (!approver) {
      errors.push(`لم يتم العثور على الموافق المحدد (${employeeId}) كسجل موظف`);
      return [];
    }
    return [toChainSnapshot(approver)];
  });

  if (errors.length > 0) return { chain: [], errors };

  return { chain, errors };
}

/**
 * Build the full approval chain for a request.
 *
 * This is the primary entry point for chain construction. The resulting
 * chain is a snapshot that should be stored on the approval request and
 * never modified based on org changes.
 */
export function buildApprovalChain(options: BuildChainOptions): BuildChainResult {
  const { employee, allEmployees, settings, hrEmployeeId, requestCreatorEmployeeId } = options;
  const errors: string[] = [];

  if (!getNextManagerId(employee)) {
    return {
      chain: [],
      errors: ['الموظف ليس لديه مدير مباشر — حدّد المدير في الهيكل التنظيمي أولاً'],
    };
  }

  const managerLevelLimit = settings.hrAlwaysFinalLevel && hrEmployeeId
    ? Math.max(1, settings.maxApprovalLevels - 1)
    : settings.maxApprovalLevels;
  const managers = collectManagerChain(
    employee,
    allEmployees,
    managerLevelLimit,
    requestCreatorEmployeeId,
  );

  if (managers.length === 0) {
    errors.push(getMissingManagerChainError(employee, allEmployees, requestCreatorEmployeeId));
    return { chain: [], errors };
  }

  const chain: ApprovalChainSnapshot[] = managers.map((m) =>
    toChainSnapshot(m.employee),
  );

  if (settings.hrAlwaysFinalLevel && !hrEmployeeId) {
    return {
      chain: [],
      errors: ['لم يتم تحديد مسؤول الموارد البشرية النهائي في سلسلة الموافقات'],
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
    if (settings.hrAlwaysFinalLevel && hrEmployeeId) {
      const hrStep = chain.find((item) => item.approverEmployeeId === hrEmployeeId);
      const nonHrSteps = chain.filter((item) => item.approverEmployeeId !== hrEmployeeId);
      chain.length = 0;
      chain.push(...nonHrSteps.slice(0, Math.max(0, settings.maxApprovalLevels - 1)));
      if (hrStep) chain.push(hrStep);
    } else {
      chain.length = settings.maxApprovalLevels;
    }
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

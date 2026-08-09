/**
 * Action-driven repair status advance using semantic roles.
 * Roles are configured per status in repair settings; defaults map canonical IDs.
 */

import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

export const REPAIR_STATUS_ROLES = [
  'intake',
  'diagnosis',
  'estimate_review',
  'awaiting_customer',
  'awaiting_parts',
  'in_repair',
  'ready_delivery',
  'delivered',
  'cancelled',
  'unrepairable',
  'none',
] as const;

export type RepairStatusRole = (typeof REPAIR_STATUS_ROLES)[number];

export const REPAIR_STATUS_ROLE_LABELS: Record<RepairStatusRole, string> = {
  intake: 'وارد / استلام',
  diagnosis: 'فحص بعد التشخيص',
  estimate_review: 'تقدير لمراجعة الاستقبال',
  awaiting_customer: 'بانتظار موافقة العميل',
  awaiting_parts: 'بانتظار قطع الغيار',
  in_repair: 'تحت الإصلاح',
  ready_delivery: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  unrepairable: 'غير قابل للإصلاح',
  none: 'بدون دور (اختياري)',
};

/** Roles that must exist on an enabled status for a valid workflow. */
export const MANDATORY_REPAIR_STATUS_ROLES: RepairStatusRole[] = [
  'intake',
  'diagnosis',
  'estimate_review',
  'awaiting_customer',
  'in_repair',
  'ready_delivery',
  'unrepairable',
];

export type RepairWorkflowAction =
  | 'diagnosis_saved'
  | 'part_or_service_linked'
  | 'estimate_sent'
  | 'customer_approved'
  | 'parts_ready'
  | 'repair_done';

export type RepairStatusRoleRow = {
  id: string;
  order: number;
  isTerminal?: boolean;
  isEnabled?: boolean;
  role?: RepairStatusRole | string | null;
};

const DEFAULT_ROLE_BY_STATUS_ID: Record<string, RepairStatusRole> = {
  received: 'intake',
  diagnosing: 'diagnosis',
  inspection: 'diagnosis',
  estimate_ready: 'estimate_review',
  waiting_approval: 'awaiting_customer',
  waiting_parts: 'awaiting_parts',
  repairing: 'in_repair',
  repair: 'in_repair',
  testing: 'none',
  ready: 'ready_delivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
  unrepairable: 'unrepairable',
};

const ROLE_FLOW_ORDER: RepairStatusRole[] = [
  'intake',
  'diagnosis',
  'estimate_review',
  'awaiting_customer',
  'awaiting_parts',
  'in_repair',
  'ready_delivery',
  'delivered',
];

export function isRepairStatusRole(value: unknown): value is RepairStatusRole {
  return typeof value === 'string' && (REPAIR_STATUS_ROLES as readonly string[]).includes(value);
}

export function defaultRoleForStatusId(statusId: string | undefined | null): RepairStatusRole {
  const canonical = mapLegacyRepairStatus(statusId);
  return DEFAULT_ROLE_BY_STATUS_ID[canonical] || 'none';
}

export function resolveStatusRole(
  statusId: string | undefined | null,
  rows: RepairStatusRoleRow[] | undefined | null,
): RepairStatusRole {
  const canonical = mapLegacyRepairStatus(statusId);
  const row = (rows || []).find((s) => mapLegacyRepairStatus(s.id) === canonical);
  if (row && isRepairStatusRole(row.role) && row.role !== 'none') return row.role;
  if (row && row.role === 'none') return 'none';
  return defaultRoleForStatusId(canonical);
}

export function statusIdForRole(
  role: RepairStatusRole,
  rows: RepairStatusRoleRow[] | undefined | null,
): string | null {
  if (role === 'none') return null;
  const enabled = (rows || [])
    .filter((s) => s.isEnabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order);
  const byRole = enabled.find((s) => {
    const r = isRepairStatusRole(s.role) ? s.role : defaultRoleForStatusId(s.id);
    return r === role;
  });
  if (byRole) return mapLegacyRepairStatus(byRole.id);
  const fallback = Object.entries(DEFAULT_ROLE_BY_STATUS_ID).find(([, r]) => r === role)?.[0];
  return fallback || null;
}

export function roleFlowIndex(role: RepairStatusRole): number {
  const idx = ROLE_FLOW_ORDER.indexOf(role);
  return idx >= 0 ? idx : -1;
}

export function assignDefaultRolesToStatuses<T extends RepairStatusRoleRow>(statuses: T[]): T[] {
  const used = new Set<RepairStatusRole>();
  return statuses.map((status) => {
    const explicit = isRepairStatusRole(status.role) ? status.role : null;
    let role: RepairStatusRole = explicit || defaultRoleForStatusId(status.id);
    if (role !== 'none' && used.has(role) && !explicit) {
      role = 'none';
    }
    if (role !== 'none') used.add(role);
    return { ...status, role };
  });
}

export function validateMandatoryStatusRoles(rows: RepairStatusRoleRow[]): string[] {
  const enabled = (rows || []).filter((s) => s.isEnabled !== false);
  const present = new Set<RepairStatusRole>();
  const duplicates: RepairStatusRole[] = [];
  for (const row of enabled) {
    // Match assignDefaultRolesToStatuses: explicit `none` falls back to id defaults.
    const role =
      isRepairStatusRole(row.role) && row.role !== 'none'
        ? row.role
        : defaultRoleForStatusId(row.id);
    if (role === 'none') continue;
    if (present.has(role) && MANDATORY_REPAIR_STATUS_ROLES.includes(role)) {
      duplicates.push(role);
    }
    present.add(role);
  }
  const missing = MANDATORY_REPAIR_STATUS_ROLES.filter((role) => !present.has(role));
  const errors: string[] = [];
  if (missing.length) {
    errors.push(
      `لا يمكن الحفظ — أدوار إلزامية ناقصة في الحالات المفعّلة: ${missing
        .map((r) => REPAIR_STATUS_ROLE_LABELS[r])
        .join('، ')}. عيّن الدور من عمود «الدور في المسار» أو فعّل الحالة المرتبطة.`,
    );
  }
  if (duplicates.length) {
    errors.push(
      `لا يمكن الحفظ — أدوار مكررة على أكثر من حالة: ${duplicates
        .map((r) => REPAIR_STATUS_ROLE_LABELS[r])
        .join('، ')}. اجعل كل دور إلزامي على حالة واحدة فقط.`,
    );
  }
  return errors;
}

export function partsAwaitingFulfillment(partsUsed: Array<Record<string, unknown>> | undefined | null): boolean {
  return (partsUsed || []).some((row) =>
    ['pending_supply', 'ready_to_issue'].includes(String(row.fulfillmentStatus || '')),
  );
}

/**
 * Returns next status id when the action should advance the job, or null to keep current.
 * Never moves backward along the happy path; never leaves terminal statuses.
 */
export function resolveNextStatusForAction(input: {
  action: RepairWorkflowAction;
  currentStatus: string;
  statuses: RepairStatusRoleRow[];
  hasDiagnosis?: boolean;
  hasServiceOrPartSignal?: boolean;
  waitsForParts?: boolean;
}): string | null {
  const current = mapLegacyRepairStatus(input.currentStatus);
  const currentRole = resolveStatusRole(current, input.statuses);
  if (
    currentRole === 'delivered'
    || currentRole === 'cancelled'
    || currentRole === 'unrepairable'
  ) {
    return null;
  }

  const currentIdx = roleFlowIndex(currentRole);
  const pick = (role: RepairStatusRole): string | null => {
    const targetId = statusIdForRole(role, input.statuses);
    if (!targetId) return null;
    const targetRole = resolveStatusRole(targetId, input.statuses);
    const targetIdx = roleFlowIndex(targetRole);
    if (targetIdx < 0) return mapLegacyRepairStatus(targetId) === current ? null : targetId;
    if (currentIdx >= 0 && targetIdx < currentIdx) return null;
    if (mapLegacyRepairStatus(targetId) === current) return null;
    return targetId;
  };

  switch (input.action) {
    case 'diagnosis_saved': {
      if (!input.hasDiagnosis) return null;
      if (input.hasServiceOrPartSignal) {
        return pick('estimate_review') || pick('diagnosis');
      }
      return pick('diagnosis');
    }
    case 'part_or_service_linked': {
      if (
        currentRole === 'in_repair'
        || currentRole === 'awaiting_parts'
        || currentRole === 'awaiting_customer'
        || currentRole === 'ready_delivery'
      ) {
        // Shortage during/after approval may move back to awaiting_parts.
        if (input.waitsForParts) {
          const targetId = statusIdForRole('awaiting_parts', input.statuses);
          if (!targetId || mapLegacyRepairStatus(targetId) === current) return null;
          return targetId;
        }
        return null;
      }
      return pick('estimate_review');
    }
    case 'estimate_sent':
      return pick('awaiting_customer');
    case 'customer_approved':
      return input.waitsForParts ? pick('awaiting_parts') : pick('in_repair');
    case 'parts_ready':
      if (currentRole === 'awaiting_parts') return pick('in_repair');
      return null;
    case 'repair_done': {
      // Only from repair phase (or optional testing step after it).
      if (
        currentRole !== 'in_repair'
        && currentRole !== 'awaiting_parts'
        && currentRole !== 'none'
      ) {
        return null;
      }
      if (currentRole === 'awaiting_parts' && input.waitsForParts) return null;
      return pick('ready_delivery');
    }
    default:
      return null;
  }
}

export function isStatusRole(
  statusId: string | undefined | null,
  role: RepairStatusRole,
  rows: RepairStatusRoleRow[] | undefined | null,
): boolean {
  return resolveStatusRole(statusId, rows) === role;
}

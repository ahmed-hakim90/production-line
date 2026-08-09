import type { Permission } from '../../../utils/permissions';

/**
 * Built-in repair front-desk role — branch-scoped via users.repairBranchIds.
 * Intentionally has create+edit without technician/admin flags so workshop UI stays locked.
 * Reception also operates the center spare-parts stock (طلب تموين / استلام / تأكيد سحب / صرف)
 * because centers do not have a separate warehouse operator.
 */
export const REPAIR_RECEPTION_PERMISSIONS: readonly Permission[] = [
  'dashboard.view',
  'repair.view',
  'repair.dashboard.view',
  'repair.jobs.create',
  'repair.jobs.edit',
  'repair.jobs.reception',
  'repair.finance.view',
  'repair.payments.view',
  'repair.payments.collect',
  'repair.discounts.request',
  'repair.credit.request',
  'repair.parts.view',
  'repairSpareIssues.view',
  'repairSpareIssues.create',
  'repairSpareIssues.approve',
  'repairSpareIssues.issue',
  'repairSpareIssues.print',
  'repairSpareIssues.cancel',
  'repairSpareIssues.reject',
  'repair.customerRequests.view',
  'repair.customerRequests.receive',
  'repair.custody.view',
  'repair.custody.record',
  'repair.custody.handover',
  'repair.replacements.view',
  'repair.replacements.create',
  'repair.replacements.deliver',
  'repair.complaints.view',
  'sparePartsReplenishment.view',
  'sparePartsReplenishment.create',
  'sparePartsReplenishment.receive',
  'sparePartsReplenishment.cancel',
  'sparePartsRecall.view',
  'sparePartsRecall.confirm',
  'inventory.view',
  'customers.view',
  'customers.create',
  'print',
] as const;

/**
 * Built-in repair technician role — assigned jobs + workshop, still branch-scoped.
 * Technical-only permissions. Financial/reception/custody-warehouse access is intentionally absent.
 * Marking a job unrepairable uses `repair.jobs.technician` (not custody warehouse menus).
 */
export const REPAIR_TECHNICIAN_PERMISSIONS: readonly Permission[] = [
  'dashboard.view',
  'repair.jobs.technician',
  'repair.parts.request',
] as const;

/**
 * Cross-center / admin capabilities — never on reception or technician.
 * Do not include front-desk finance keys (payments/collect) that reception legitimately has.
 */
export const REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS: readonly Permission[] = [
  'repair.branches.manage',
  'repair.callCenter.viewAll',
  'repair.adminDashboard.view',
  'repair.settings.manage',
  'repair.treasury.manage',
  'repair.payments.reverse',
  'repair.discounts.approve',
  'repair.credit.approve',
  'repair.accounting.manage',
  'repair.pricing.manage',
  'roles.manage',
  'users.manage',
] as const;

/** Manufacturing master catalog — not part of repair front-desk / workshop roles. */
export const REPAIR_FRONTLINE_FORBIDDEN_PERMISSIONS: readonly Permission[] = [
  'materials.view',
  'materials.manage',
] as const;

/** Custody warehouse screens belong to reception/store — not the technician workshop role. */
export const REPAIR_TECHNICIAN_FORBIDDEN_PERMISSIONS: readonly Permission[] = [
  'repair.custody.view',
  'repair.custody.record',
  'repair.custody.handover',
  'repair.custody.correct',
  ...REPAIR_FRONTLINE_FORBIDDEN_PERMISSIONS,
] as const;

export type RepairBuiltinRoleKey = 'repair_reception' | 'repair_technician';

export const REPAIR_BUILTIN_ROLE_DEFS: Record<
  RepairBuiltinRoleKey,
  {
    name: string;
    color: string;
    permissions: readonly Permission[];
  }
> = {
  repair_reception: {
    name: 'استقبال صيانة',
    color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    permissions: REPAIR_RECEPTION_PERMISSIONS,
  },
  repair_technician: {
    name: 'فني صيانة',
    color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
    permissions: REPAIR_TECHNICIAN_PERMISSIONS,
  },
};

export function assertRepairBuiltinRoleIsIsolated(
  permissions: Record<string, boolean>,
): string[] {
  return REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS.filter((key) => permissions[key] === true);
}

/**
 * Existing built-in repair roles keep admin edits.
 * Login migration must not re-open permissions an admin turned off.
 * Strip cross-center / admin isolation forbids for all repair builtins,
 * strip manufacturing-materials master from frontline roles,
 * and strip custody-warehouse keys from the technician role.
 */
export function reconcileExistingRepairBuiltinPermissions(
  current: Record<string, boolean> | null | undefined,
  roleKey?: RepairBuiltinRoleKey,
): { permissions: Record<string, boolean>; changed: boolean } {
  const permissions = { ...(current || {}) };
  let changed = false;
  for (const key of REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS) {
    if (permissions[key] === true) {
      permissions[key] = false;
      changed = true;
    }
  }
  for (const key of REPAIR_FRONTLINE_FORBIDDEN_PERMISSIONS) {
    if (permissions[key] === true) {
      permissions[key] = false;
      changed = true;
    }
  }
  if (roleKey === 'repair_technician') {
    for (const key of REPAIR_TECHNICIAN_FORBIDDEN_PERMISSIONS) {
      if (permissions[key] === true) {
        permissions[key] = false;
        changed = true;
      }
    }
  }
  return { permissions, changed };
}

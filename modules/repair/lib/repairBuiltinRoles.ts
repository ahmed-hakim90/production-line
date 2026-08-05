import type { Permission } from '../../../utils/permissions';

/**
 * Built-in repair front-desk role — branch-scoped via users.repairBranchIds.
 * Intentionally has create+edit without technician/admin flags so workshop UI stays locked.
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
  'customers.view',
  'customers.create',
  'print',
] as const;

/**
 * Built-in repair technician role — assigned jobs + workshop, still branch-scoped.
 * Technical-only permissions. Financial/reception access is intentionally absent.
 */
export const REPAIR_TECHNICIAN_PERMISSIONS: readonly Permission[] = [
  'dashboard.view',
  'repair.jobs.technician',
  'repair.parts.request',
] as const;

/** Permissions that must never appear on reception/technician presets (cross-center / admin). */
export const REPAIR_CENTER_ISOLATION_FORBIDDEN_PERMISSIONS: readonly Permission[] = [
  'repair.branches.manage',
  'repair.callCenter.viewAll',
  'repair.adminDashboard.view',
  'repair.settings.manage',
  'repair.treasury.manage',
  'repair.finance.view',
  'repair.payments.view',
  'repair.payments.collect',
  'repair.payments.reverse',
  'repair.discounts.request',
  'repair.discounts.approve',
  'repair.credit.request',
  'repair.credit.approve',
  'repair.accounting.manage',
  'repair.pricing.manage',
  'roles.manage',
  'users.manage',
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

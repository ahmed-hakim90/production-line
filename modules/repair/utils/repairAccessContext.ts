import type { SystemSettings } from '../../../types';
import type { Permission } from '../../../utils/permissions';
import { checkPermission } from '../../../utils/permissions';
import type { FirestoreUserWithRepair } from '../types';
import { resolveUserRepairBranchIds } from '../types';
import { resolveRepairSettings } from '../config/repairSettings';

export type RepairManagerScope = 'branch' | 'centers';

export interface RepairAccessContext {
  /** فروع المستخدم من الملف الشخصي */
  userBranchIds: string[];
  canViewAllBranches: boolean;
  /** صلاحية فني الصيانة (طلبات مسندة فقط) */
  isRepairTechnician: boolean;
  /** مدير فرع واحد vs مدير مراكز — من الإعدادات أو اسم الدور */
  managerScope: RepairManagerScope;
  /** لوحة أدمن الصيانة: عرض كل الفروع */
  adminSeesAllBranches: boolean;
  /** قائمة الطلبات: فلترة technicianId فقط */
  jobsTechnicianOnly: boolean;
}

/** معرفات المستخدم وموظفه الحالي لتوافق technicianId المخزّن كـ user id أو employee id */
export function resolveRepairTechnicianIds(
  user: FirestoreUserWithRepair | null | undefined,
  currentEmployeeId?: string | null,
): string[] {
  const u = String(user?.id || '').trim();
  const e = String(currentEmployeeId || '').trim();
  return Array.from(new Set([u, e].filter((x) => x.length > 0)));
}

function inferManagerScopeFromRole(roleName: string): RepairManagerScope {
  const ar = (roleName || '').trim();
  const n = ar.toLowerCase();
  if (ar.includes('مراكز') || n.includes('centers') || n.includes('multi-branch')) return 'centers';
  return 'branch';
}

export function resolveRepairAccessContext(input: {
  userProfile: FirestoreUserWithRepair | null | undefined;
  userRoleName: string;
  systemSettings: SystemSettings | null | undefined;
  permissions: Record<string, boolean>;
}): RepairAccessContext {
  const permissions = input.permissions;
  const canViewAllBranches = checkPermission(permissions, 'repair.branches.manage' as Permission);
  const isRepairTechnician = checkPermission(permissions, 'repair.jobs.technician' as Permission);
  const userBranchIds = resolveUserRepairBranchIds(input.userProfile);

  const fromSettings = resolveRepairSettings(input.systemSettings).access.managerScope;
  const managerScope: RepairManagerScope =
    fromSettings === 'centers' || fromSettings === 'branch'
      ? fromSettings
      : inferManagerScopeFromRole(input.userRoleName);

  const canAdminDashboard = checkPermission(permissions, 'repair.adminDashboard.view' as Permission);

  const adminSeesAllBranches =
    canViewAllBranches || (canAdminDashboard && managerScope === 'centers');

  const jobsTechnicianOnly = isRepairTechnician && !canViewAllBranches;

  return {
    userBranchIds,
    canViewAllBranches,
    isRepairTechnician,
    managerScope,
    adminSeesAllBranches,
    jobsTechnicianOnly,
  };
}

/** فروع مسموح عرضها في شاشات الصيانة (غير مدير الفروع الشامل) */
export function resolveVisibleRepairBranchIdsForUser(
  ctx: RepairAccessContext,
  allBranchIds: string[],
): string[] {
  if (ctx.canViewAllBranches) return allBranchIds;
  const set = new Set(ctx.userBranchIds.filter(Boolean));
  return allBranchIds.filter((id) => set.has(String(id)));
}

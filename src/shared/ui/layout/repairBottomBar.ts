import type { MenuItem } from '@/config/menu.config';
import { canAccessMenuItem } from '@/config/menu.config';
import {
  isRepairOpsPortal,
  isRepairTechnicianPortal,
  type PortalPermissionChecker,
} from '@/modules/dashboards/lib/portalHome';
import {
  isSystemOrFactoryChromeRole,
  resolveNamedRepairOpsPersona,
} from '@/modules/repair/lib/repairRoleChrome';
import type { Permission } from '@/utils/permissions';

export type RepairBottomPersona = 'technician' | 'admin' | 'reception' | 'ops';

export type RepairBottomBarCandidate = {
  key: string;
  label: string;
  menuItemKey: string;
  /** Elevated center action (مثل إدخال سريع). */
  primary?: boolean;
  /**
   * Use home `/` so the portal shell highlights correctly
   * (repair dashboards also render on `/`).
   */
  pathOverride?: string;
};

/** فني: لوحتي + طلباتي — بدون زر عائم (عمودين فقط يبانوا مكسورين بالارتفاع). */
const TECHNICIAN_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'tech-home', label: 'لوحتي', menuItemKey: 'repair-technician-home', pathOverride: '/' },
  { key: 'my-jobs', label: 'طلباتي', menuItemKey: 'repair-my-jobs', primary: true },
];

/** مدير الصيانة: رقابة الطلبات + التحصيل + أداء الفريق. التموين في «المزيد». */
const ADMIN_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'admin-home', label: 'لوحتي', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs', primary: true },
  { key: 'payments', label: 'التحصيل', menuItemKey: 'repair-payments' },
  { key: 'kpis', label: 'الأداء', menuItemKey: 'repair-kpis' },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
];

/** مسؤول الصيانة / استقبال: تسجيل طلب في الوسط. */
const RECEPTION_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'dash', label: 'لوحتي', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'new-job', label: 'طلب جديد', menuItemKey: 'repair-new-job', primary: true },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs' },
  { key: 'payments', label: 'التحصيل', menuItemKey: 'repair-payments' },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
];

/** مدير مركز بدون استقبال / مخزن المركز: تشغيل الطلبات + مخزون المركز. */
const OPS_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'dash', label: 'لوحتي', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs', primary: true },
  { key: 'parts', label: 'قطع الغيار', menuItemKey: 'repair-parts' },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
];

/**
 * Repair-focused users get the repair bottom bar instead of the factory one.
 * Named «مدير الصيانة / مسؤول الصيانة» keep repair chrome even when the role
 * also copied adminDashboard.view / factoryDashboard.view.
 */
export function shouldShowRepairBottomBar(checker: PortalPermissionChecker): boolean {
  if (
    isSystemOrFactoryChromeRole(checker)
    && (checker.can('adminDashboard.view') || checker.can('factoryDashboard.view'))
  ) {
    return false;
  }
  return isRepairOpsPortal(checker) || isRepairTechnicianPortal(checker);
}

/** Hide chrome bottom nav while technician focuses on a single job workspace. */
export function isRepairWorkshopFocusPath(logicalPath: string): boolean {
  return /^\/repair\/jobs\/[^/]+\/workspace\/?$/.test(String(logicalPath || ''));
}

export function resolveRepairBottomPersona(checker: PortalPermissionChecker): RepairBottomPersona {
  if (isRepairTechnicianPortal(checker) || checker.roleKey === 'repair_technician') {
    return 'technician';
  }
  const named = resolveNamedRepairOpsPersona({
    roleKey: checker.roleKey,
    roleName: checker.roleName,
  });
  if (named) return named;
  // مدير مراكز (لوحة الإدارة عبر كل الفروع)
  if (checker.can('repair.adminDashboard.view')) return 'admin';
  // استقبال / مدير مركز يسجّل طلبات
  if (checker.can('repair.jobs.create') || checker.roleKey === 'repair_reception') return 'reception';
  // مدير مركز تشغيل بدون استقبال
  return 'ops';
}

export function repairBottomCandidatesForPersona(persona: RepairBottomPersona): RepairBottomBarCandidate[] {
  switch (persona) {
    case 'technician':
      return TECHNICIAN_ITEMS;
    case 'admin':
      return ADMIN_ITEMS;
    case 'reception':
      return RECEPTION_ITEMS;
    default:
      return OPS_ITEMS;
  }
}

export type ResolvedRepairBottomBarItem = RepairBottomBarCandidate & {
  menuItem: MenuItem;
  path: string;
};

export function resolveVisibleRepairBottomBarItems(input: {
  can: (permission: Permission) => boolean;
  roleKey?: string | null;
  roleName?: string | null;
  menuItemsByKey: Record<string, MenuItem>;
  isOperationPathEnabled: (menuItemKey: string) => boolean;
  maxItems?: number;
}): ResolvedRepairBottomBarItem[] {
  const persona = resolveRepairBottomPersona({
    can: input.can,
    roleKey: input.roleKey,
    roleName: input.roleName,
  });
  const maxItems = input.maxItems ?? 4;

  const resolved: ResolvedRepairBottomBarItem[] = [];
  for (const candidate of repairBottomCandidatesForPersona(persona)) {
    if (resolved.length >= maxItems) break;
    const menuItem = input.menuItemsByKey[candidate.menuItemKey];
    if (!menuItem) continue;
    if (!canAccessMenuItem(input.can, menuItem, input.roleKey)) continue;
    if (!input.isOperationPathEnabled(menuItem.key)) continue;
    resolved.push({
      ...candidate,
      menuItem,
      path: candidate.pathOverride || menuItem.path,
    });
  }
  return resolved;
}

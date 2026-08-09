import type { MenuItem } from '@/config/menu.config';
import { canAccessMenuItem } from '@/config/menu.config';
import {
  isRepairOpsPortal,
  isRepairTechnicianPortal,
  type PortalPermissionChecker,
} from '@/modules/dashboards/lib/portalHome';
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

/** مدير مراكز: نظرة شاملة عبر كل المراكز. */
const ADMIN_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'admin-home', label: 'الرئيسية', menuItemKey: 'repair-admin-dashboard', pathOverride: '/' },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs', primary: true },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
  { key: 'kpis', label: 'الأداء', menuItemKey: 'repair-kpis' },
];

/** استقبال / مدير مركز مع تسجيل طلبات: إدخال سريع في الوسط. */
const RECEPTION_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'dash', label: 'الرئيسية', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'new-job', label: 'طلب جديد', menuItemKey: 'repair-new-job', primary: true },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs' },
  { key: 'payments', label: 'التحصيل', menuItemKey: 'repair-payments' },
];

/** مدير مركز بدون استقبال: تشغيل الطلبات + مخزون المركز. */
const OPS_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'dash', label: 'الرئيسية', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs', primary: true },
  { key: 'parts', label: 'قطع الغيار', menuItemKey: 'repair-parts' },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
];

/**
 * Repair-focused users get the repair bottom bar instead of the factory one.
 * Do not rely only on portal kind — warehouse binding used to steal the portal
 * from custom «مدير مركز / مدير مراكز» roles.
 */
export function shouldShowRepairBottomBar(checker: PortalPermissionChecker): boolean {
  // System / factory dashboards keep the factory chrome even if repair perms exist.
  if (checker.can('adminDashboard.view') || checker.can('factoryDashboard.view')) {
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
  menuItemsByKey: Record<string, MenuItem>;
  isOperationPathEnabled: (menuItemKey: string) => boolean;
  maxItems?: number;
}): ResolvedRepairBottomBarItem[] {
  const persona = resolveRepairBottomPersona({
    can: input.can,
    roleKey: input.roleKey,
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

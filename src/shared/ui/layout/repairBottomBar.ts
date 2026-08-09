import type { MenuItem } from '@/config/menu.config';
import { canAccessMenuItem } from '@/config/menu.config';
import type { PortalPermissionChecker } from '@/modules/dashboards/lib/portalHome';
import { resolvePortalKind } from '@/modules/dashboards/lib/portalHome';
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

const TECHNICIAN_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'tech-home', label: 'لوحتي', menuItemKey: 'repair-technician-home', pathOverride: '/', primary: true },
  { key: 'my-jobs', label: 'طلباتي', menuItemKey: 'repair-my-jobs' },
];

const ADMIN_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'admin-home', label: 'الرئيسية', menuItemKey: 'repair-admin-dashboard', pathOverride: '/' },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs' },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
  { key: 'kpis', label: 'الأداء', menuItemKey: 'repair-kpis' },
];

const RECEPTION_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'dash', label: 'الرئيسية', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'new-job', label: 'طلب جديد', menuItemKey: 'repair-new-job', primary: true },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs' },
  { key: 'payments', label: 'التحصيل', menuItemKey: 'repair-payments' },
];

const OPS_ITEMS: RepairBottomBarCandidate[] = [
  { key: 'dash', label: 'الرئيسية', menuItemKey: 'repair-dashboard', pathOverride: '/' },
  { key: 'jobs', label: 'الطلبات', menuItemKey: 'repair-jobs' },
  { key: 'parts', label: 'قطع الغيار', menuItemKey: 'repair-parts' },
  { key: 'replenish', label: 'التموين', menuItemKey: 'repair-parts-replenishment' },
];

/** Repair-focused users get the repair bottom bar instead of the factory one. */
export function shouldShowRepairBottomBar(checker: PortalPermissionChecker): boolean {
  const portal = resolvePortalKind(checker);
  return portal === 'repair' || portal === 'repair_technician';
}

export function resolveRepairBottomPersona(checker: PortalPermissionChecker): RepairBottomPersona {
  if (resolvePortalKind(checker) === 'repair_technician' || checker.roleKey === 'repair_technician') {
    return 'technician';
  }
  if (checker.can('repair.adminDashboard.view')) return 'admin';
  if (checker.can('repair.jobs.create') || checker.roleKey === 'repair_reception') return 'reception';
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

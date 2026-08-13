import type { MenuItem } from '@/config/menu.config';
import { canAccessMenuItem } from '@/config/menu.config';
import {
  isRepairOpsPortal,
  isRepairTechnicianPortal,
  isWarehouseOperatorPortal,
  type PortalPermissionChecker,
} from '@/modules/dashboards/lib/portalHome';
import type { WarehouseRole } from '@/modules/inventory/types';
import type { Permission } from '@/utils/permissions';

export type WarehouseBottomPersona = 'spare_parts_central';

export type WarehouseBottomBarCandidate = {
  key: string;
  label: string;
  menuItemKey: string;
  /** Elevated center action (مثل إدخال سريع / تموين). */
  primary?: boolean;
  pathOverride?: string;
  /** Extra logical paths that count as active (home redirect). */
  extraActivePaths?: string[];
};

/**
 * مسؤول مخزن قطع الغيار المركزي: مساحة المخزن + طابور التموين + الأرصدة.
 * سحب / إذن إضافة / فاتورة شراء تبقى في «المزيد».
 */
function sparePartsCentralItems(boundWarehouseId?: string | null): WarehouseBottomBarCandidate[] {
  const boundId = String(boundWarehouseId || '').trim();
  const homePath = boundId ? `/inventory/warehouses/${boundId}` : '/';
  return [
    {
      key: 'home',
      label: 'لوحتي',
      menuItemKey: 'inv-dashboard',
      pathOverride: homePath,
      extraActivePaths: ['/', '/inventory'],
    },
    {
      key: 'replenish',
      label: 'التموين',
      menuItemKey: 'inv-spare-parts-replenishment',
      primary: true,
    },
    { key: 'balances', label: 'الأرصدة', menuItemKey: 'inv-balances' },
    { key: 'centers', label: 'المراكز', menuItemKey: 'inv-spare-parts-center-stock' },
  ];
}

function isFactoryChromePortal(checker: PortalPermissionChecker): boolean {
  return checker.can('adminDashboard.view') || checker.can('factoryDashboard.view');
}

/**
 * Warehouse-focused operators get inventory items instead of production
 * (إدخال سريع / ربط العمالة / التقارير).
 */
export function shouldShowWarehouseBottomBar(checker: PortalPermissionChecker & {
  boundWarehouseRole?: WarehouseRole | null;
}): boolean {
  return resolveWarehouseBottomPersona(checker) !== null;
}

export function resolveWarehouseBottomPersona(checker: PortalPermissionChecker & {
  boundWarehouseRole?: WarehouseRole | null;
}): WarehouseBottomPersona | null {
  if (isFactoryChromePortal(checker)) return null;
  if (isRepairOpsPortal(checker) || isRepairTechnicianPortal(checker)) return null;

  if (checker.roleKey === 'spare_parts_central_warehouse') return 'spare_parts_central';
  if (checker.boundWarehouseRole === 'spare_parts_central') return 'spare_parts_central';

  // Custom roles bound to central spare-parts work: prepare/approve, not center create/receive.
  if (
    isWarehouseOperatorPortal(checker)
    && checker.can('sparePartsReplenishment.prepare')
    && checker.can('sparePartsReplenishment.approve')
  ) {
    return 'spare_parts_central';
  }

  return null;
}

export function warehouseBottomCandidatesForPersona(
  persona: WarehouseBottomPersona,
  boundWarehouseId?: string | null,
): WarehouseBottomBarCandidate[] {
  switch (persona) {
    case 'spare_parts_central':
      return sparePartsCentralItems(boundWarehouseId);
    default:
      return [];
  }
}

export type ResolvedWarehouseBottomBarItem = WarehouseBottomBarCandidate & {
  menuItem: MenuItem;
  path: string;
};

export function resolveVisibleWarehouseBottomBarItems(input: {
  can: (permission: Permission) => boolean;
  roleKey?: string | null;
  roleName?: string | null;
  boundWarehouseId?: string | null;
  boundWarehouseRole?: WarehouseRole | null;
  menuItemsByKey: Record<string, MenuItem>;
  isOperationPathEnabled: (menuItemKey: string) => boolean;
  maxItems?: number;
}): ResolvedWarehouseBottomBarItem[] {
  const checker = {
    can: input.can,
    roleKey: input.roleKey,
    roleName: input.roleName,
    inventoryWarehouseId: input.boundWarehouseId,
    boundWarehouseRole: input.boundWarehouseRole,
  };
  const persona = resolveWarehouseBottomPersona(checker);
  if (!persona) return [];

  const maxItems = input.maxItems ?? 4;
  const resolved: ResolvedWarehouseBottomBarItem[] = [];
  for (const candidate of warehouseBottomCandidatesForPersona(persona, input.boundWarehouseId)) {
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

export function isWarehouseBottomBarItemActive(
  item: ResolvedWarehouseBottomBarItem,
  logicalPath: string,
  isMenuItemActive: (item: MenuItem) => boolean,
): boolean {
  const path = String(item.path || '').trim();
  const current = String(logicalPath || '').trim() || '/';
  if (current === path) return true;
  if (item.extraActivePaths?.includes(current)) return true;
  if (item.key === 'home') {
    return Boolean(path && path !== '/' && current.startsWith(`${path}/`));
  }
  return isMenuItemActive(item.menuItem);
}

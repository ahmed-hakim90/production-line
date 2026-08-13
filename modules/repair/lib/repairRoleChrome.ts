/**
 * Role-label helpers for repair vs factory chrome (portal home + mobile bars).
 * Custom tenant roles rarely have built-in roleKeys — Arabic names are the signal.
 */

export type NamedRepairOpsPersona = 'admin' | 'reception' | 'ops';

export function normalizeRoleLabel(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/** مدير النظام / مدير المصنع keep factory/admin chrome even if they also hold repair perms. */
export function isSystemOrFactoryChromeRole(input: {
  roleKey?: string | null;
  roleName?: string | null;
}): boolean {
  if (input.roleKey === 'admin' || input.roleKey === 'factory_manager') return true;
  const name = normalizeRoleLabel(input.roleName);
  return name === 'مدير النظام' || name === 'مدير المصنع';
}

function hasRepairCenterWord(name: string): boolean {
  if (name.includes('مراكز')) return true;
  // «مركز» as a branch — not the warehouse adjective «المركزي».
  return name.includes('مركز') && !name.includes('مركزي');
}

/**
 * مدير الصيانة / مدير مراكز → admin bar
 * مسؤول الصيانة / مدير مركز / استقبال → reception bar
 * مسؤول مخزن مركز صيانة → ops bar
 */
export function resolveNamedRepairOpsPersona(input: {
  roleKey?: string | null;
  roleName?: string | null;
}): NamedRepairOpsPersona | null {
  if (input.roleKey === 'repair_reception') return 'reception';
  if (input.roleKey === 'maintenance_center_warehouse') return 'ops';
  if (input.roleKey === 'repair_technician') return null;

  const name = normalizeRoleLabel(input.roleName);
  if (!name) return null;
  if (name.includes('فني')) return null;
  if (name.includes('مراكز')) return 'admin';
  if (/مدير\s*الصيانة/.test(name) || name === 'مدير صيانة') return 'admin';
  if (name.includes('استقبال')) return 'reception';
  const isRepairDeskName = name.includes('صيانة') || hasRepairCenterWord(name);
  if ((name.includes('مسؤول') || name.includes('مسئول')) && isRepairDeskName) {
    if (name.includes('مخزن')) return 'ops';
    return 'reception';
  }
  if (/مدير\s*مركز/.test(name) && !name.includes('مركزي')) return 'reception';
  return null;
}

export function isNamedRepairOpsRole(input: {
  roleKey?: string | null;
  roleName?: string | null;
}): boolean {
  return resolveNamedRepairOpsPersona(input) !== null;
}

import type { FirestoreRole, FirestoreRoleKey } from '../../../types';

export type VisibleRoleGroup = {
  key: string;
  role: FirestoreRole;
  ids: string[];
};

function normalizeRoleName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Built-in Arabic name → roleKey (same map as RolesManagement). */
export const DEFAULT_ROLE_KEY_BY_NAME: Record<string, FirestoreRoleKey> = {
  [normalizeRoleName('مدير النظام')]: 'admin',
  [normalizeRoleName('مدير المصنع')]: 'factory_manager',
  [normalizeRoleName('مشرف الصالة')]: 'hall_supervisor',
  [normalizeRoleName('مشرف')]: 'supervisor',
  [normalizeRoleName('مدير الموارد البشرية')]: 'hr_manager',
  [normalizeRoleName('محاسب')]: 'accountant',
  [normalizeRoleName('مسؤول مخزن المستلزمات')]: 'materials_warehouse',
  [normalizeRoleName('مسؤول مخزن قطع الغيار المركزي')]: 'spare_parts_central_warehouse',
  [normalizeRoleName('مسؤول مخزن مركز صيانة')]: 'maintenance_center_warehouse',
  [normalizeRoleName('عرض مخزون فقط')]: 'inventory_viewer',
  [normalizeRoleName('استقبال صيانة')]: 'repair_reception',
  [normalizeRoleName('فني صيانة')]: 'repair_technician',
};

export function getBuiltInRoleKey(role: FirestoreRole): FirestoreRoleKey | undefined {
  if (role.roleKey) return role.roleKey;
  return DEFAULT_ROLE_KEY_BY_NAME[normalizeRoleName(role.name)];
}

export function getRoleGroupKey(role: FirestoreRole): string {
  const builtInRoleKey = getBuiltInRoleKey(role);
  if (builtInRoleKey) return `default:${builtInRoleKey}`;

  const normalizedName = normalizeRoleName(role.name);
  return normalizedName ? `custom:${normalizedName}` : `role:${role.id ?? ''}`;
}

export function canonicalRoleScore(role: FirestoreRole): number {
  const builtInRoleKey = getBuiltInRoleKey(role);
  if (!builtInRoleKey) return role.id ? 1 : 0;

  const stableDefaultId = role.id?.endsWith(`__${builtInRoleKey}`) ? 4 : 0;
  const explicitRoleKey = role.roleKey === builtInRoleKey ? 2 : 0;
  const enabledPerms = Object.values(role.permissions || {}).filter(Boolean).length;
  // Prefer richer permission maps when ids/keys tie (legacy default_* vs partial copies).
  return stableDefaultId + explicitRoleKey + (role.id ? 1 : 0) + enabledPerms / 1000;
}

export function shouldPreferCanonicalRole(
  candidate: FirestoreRole,
  current: FirestoreRole,
): boolean {
  return canonicalRoleScore(candidate) > canonicalRoleScore(current);
}

/** Group duplicate role docs (same built-in key or same Arabic name) → one visible card/option. */
export function getVisibleRoleGroups(roles: FirestoreRole[]): VisibleRoleGroup[] {
  const groups = new Map<string, VisibleRoleGroup>();

  roles.forEach((role) => {
    const key = getRoleGroupKey(role);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, role, ids: role.id ? [role.id] : [] });
      return;
    }

    if (role.id && !existing.ids.includes(role.id)) existing.ids.push(role.id);
    if (shouldPreferCanonicalRole(role, existing.role)) existing.role = role;
  });

  return Array.from(groups.values());
}

/** Canonical role rows for dropdowns (Users create/edit, filters). */
export function getVisibleRoles(roles: FirestoreRole[]): FirestoreRole[] {
  return getVisibleRoleGroups(roles)
    .map((group) => group.role)
    .filter((role): role is FirestoreRole & { id: string } => Boolean(role.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
}

/**
 * Same as getVisibleRoles, but when editing a user keep their existing duplicate
 * doc as the option value so "Save role" does not silently remap them.
 */
export function getVisibleRolesForAssignment(
  roles: FirestoreRole[],
  currentRoleId?: string | null,
): FirestoreRole[] {
  const preferred = String(currentRoleId || '').trim();
  const byId = new Map(roles.filter((r) => r.id).map((r) => [String(r.id), r]));
  return getVisibleRoleGroups(roles)
    .map((group) => {
      if (preferred && group.ids.includes(preferred)) {
        return byId.get(preferred) || group.role;
      }
      return group.role;
    })
    .filter((role): role is FirestoreRole & { id: string } => Boolean(role.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
}

/** Map any duplicate roleId to the group's canonical id (identity if already canonical / unknown). */
export function resolveCanonicalRoleId(
  roleId: string | null | undefined,
  roles: FirestoreRole[],
): string {
  const trimmed = String(roleId || '').trim();
  if (!trimmed) return '';
  const groups = getVisibleRoleGroups(roles);
  for (const group of groups) {
    if (!group.ids.includes(trimmed)) continue;
    return String(group.role.id || trimmed);
  }
  return trimmed;
}

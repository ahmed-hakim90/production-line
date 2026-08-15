const MATERIALS_WAREHOUSE_ROLE_KEY = 'materials_warehouse';
const MATERIALS_WAREHOUSE_ROLE_NAME = 'مسؤول مخزن المستلزمات';

const DEPARTMENT_CONSUMABLE_KEYS = new Set([
  'departmentConsumables.view',
  'departmentConsumables.create',
  'departmentConsumables.approve',
  'departmentConsumables.issue',
  'departmentConsumables.export',
]);

const DEPARTMENT_CONSUMABLE_ALIASES: Record<string, readonly string[]> = {
  'departmentConsumables.view': ['inventory.view'],
  'departmentConsumables.create': ['inventory.transactions.create'],
  'departmentConsumables.approve': ['inventory.transfers.approve'],
  'departmentConsumables.issue': ['inventory.transactions.create'],
  'departmentConsumables.export': ['inventory.transactions.export', 'export'],
};

export function resolveConsumableActorRoleKey(role: {
  roleKey?: string;
  name?: string;
}): string | null {
  const key = String(role.roleKey || '').trim();
  if (key) return key;
  const name = String(role.name || '').trim().replace(/\s+/g, ' ');
  if (name === MATERIALS_WAREHOUSE_ROLE_NAME) return MATERIALS_WAREHOUSE_ROLE_KEY;
  return null;
}

export function actorHasDepartmentConsumableAccess(
  actor: {
    isSuperAdmin?: boolean;
    roleKey?: string | null;
    permissions: Record<string, boolean>;
  },
  keys: string[],
): boolean {
  if (actor.isSuperAdmin) return true;
  if (keys.some((key) => actor.permissions[key] === true)) return true;
  for (const key of keys) {
    const aliases = DEPARTMENT_CONSUMABLE_ALIASES[key] || [];
    if (aliases.some((alias) => actor.permissions[alias] === true)) return true;
  }
  return actor.roleKey === MATERIALS_WAREHOUSE_ROLE_KEY
    && keys.some((key) => DEPARTMENT_CONSUMABLE_KEYS.has(key));
}

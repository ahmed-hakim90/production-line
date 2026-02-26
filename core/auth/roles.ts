export const APP_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'operator',
  'viewer',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
export type PermissionValue = `${string}.${PermissionAction}`;

type ModuleAccess = Partial<Record<PermissionAction, boolean>>;

type RoleMatrix = Record<AppRole, Record<string, ModuleAccess>>;

const MATRIX: RoleMatrix = {
  super_admin: {
    '*': { view: true, create: true, edit: true, delete: true },
  },
  admin: {
    dashboard: { view: true },
    employee: { view: true, create: true, edit: true, delete: true },
    production: { view: true, create: true, edit: true, delete: true },
    quality: { view: true, create: true, edit: true, delete: true },
    settings: { view: true, edit: true },
    roles: { view: true, create: true, edit: true, delete: true },
  },
  manager: {
    dashboard: { view: true },
    employee: { view: true, create: true, edit: true },
    production: { view: true, create: true, edit: true },
    quality: { view: true, create: true, edit: true },
    reports: { view: true, create: true, edit: true },
  },
  operator: {
    dashboard: { view: true },
    employee: { view: true },
    production: { view: true, create: true },
    quality: { view: true, create: true },
    reports: { view: true, create: true },
  },
  viewer: {
    dashboard: { view: true },
    employee: { view: true },
    production: { view: true },
    quality: { view: true },
    reports: { view: true },
  },
};

export function isAppRole(value: string | null | undefined): value is AppRole {
  return !!value && (APP_ROLES as readonly string[]).includes(value);
}

export function permissionFromParts(moduleKey: string, action: PermissionAction): PermissionValue {
  return `${moduleKey}.${action}`;
}

export function checkRoleMatrix(role: AppRole, permission: string): boolean {
  const [moduleKey, action] = permission.split('.') as [string, PermissionAction | undefined];
  if (!moduleKey || !action) {
    return false;
  }

  const matrix = MATRIX[role];
  const wildcard = matrix['*'];
  if (wildcard?.[action]) {
    return true;
  }

  return matrix[moduleKey]?.[action] === true;
}

export function buildRolePermissionMap(role: AppRole): Record<string, boolean> {
  const moduleMap = MATRIX[role];
  const permissions: Record<string, boolean> = {};

  Object.entries(moduleMap).forEach(([moduleKey, actions]) => {
    if (moduleKey === '*') {
      return;
    }
    (Object.keys(actions) as PermissionAction[]).forEach((action) => {
      if (actions[action]) {
        permissions[permissionFromParts(moduleKey, action)] = true;
      }
    });
  });

  return permissions;
}

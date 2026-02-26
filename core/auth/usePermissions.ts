import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { checkPermission as checkStorePermission } from '@/utils/permissions';
import { checkRoleMatrix, isAppRole, type AppRole } from './roles';

export interface UsePermissionsResult {
  role: AppRole | null;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAll: (permissions: string[]) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const roleName = useAppStore((state) => state.userRoleName);
  const permissionMap = useAppStore((state) => state.userPermissions);

  return useMemo(() => {
    const normalizedRole = roleName?.trim().toLowerCase() ?? null;
    const role = isAppRole(normalizedRole) ? normalizedRole : null;

    const can = (permission: string): boolean => {
      if (permissionMap[permission] !== undefined) {
        return checkStorePermission(permissionMap, permission as never);
      }
      if (role) {
        return checkRoleMatrix(role, permission);
      }
      return false;
    };

    return {
      role,
      can,
      canAny: (permissions: string[]) => permissions.some((permission) => can(permission)),
      canAll: (permissions: string[]) => permissions.every((permission) => can(permission)),
    };
  }, [permissionMap, roleName]);
}

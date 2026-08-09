import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { checkPermission, type Permission } from '@/utils/permissions';
import {
  getPermissionResource,
  type ResourcePermissionGuards,
} from '@/utils/permissionCatalog';

/**
 * Page-level guards: يشوف الصفحة / يضيف / يعدّل / يحذف / أكشن.
 * Uses live `checkPermission` (including legacy aliases).
 */
export function useResourcePermission(resourceId: string): ResourcePermissionGuards {
  const permissions = useAppStore((s) => s.userPermissions);
  return useMemo(() => {
    const resource = getPermissionResource(resourceId);
    const can = (key?: string) =>
      (key ? checkPermission(permissions, key as Permission) : false);

    if (!resource) {
      return {
        resourceId,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canManage: false,
        canAction: () => false,
        canAccessPage: false,
      };
    }

    const manageKey = resource.actions.find((a) => a.verb === 'manage')?.key;
    const canManage = manageKey ? can(manageKey) : false;
    const canView = can(resource.crud.view?.key) || canManage;
    const canCreate = can(resource.crud.create?.key) || canManage;
    const canEdit = can(resource.crud.edit?.key) || canManage;
    const canDelete = can(resource.crud.delete?.key) || canManage;

    const canAction = (verb: string) => {
      if (verb === 'view') return canView;
      if (verb === 'create') return canCreate;
      if (verb === 'edit') return canEdit;
      if (verb === 'delete') return canDelete;
      const action = resource.actions.find((a) => a.verb === verb);
      return action ? can(action.key) : false;
    };

    const canAccessPage =
      canView
      || canCreate
      || canEdit
      || canDelete
      || canManage
      || resource.actions.some((a) => can(a.key));

    return {
      resourceId,
      canView,
      canCreate,
      canEdit,
      canDelete,
      canManage,
      canAction,
      canAccessPage,
    };
  }, [permissions, resourceId]);
}

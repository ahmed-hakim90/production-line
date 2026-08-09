/**
 * Permission engine catalog — pages/resources as CRUD + named actions.
 *
 * Storage stays flat `Record<string, boolean>` for Firestore / rules compatibility.
 * This module derives a matrix UI and helpers: view | create | edit | delete | actions.
 *
 * Avoids importing the Zustand store / Firebase at module load (safe for unit tests).
 */
import {
  isPermissionGroupEnabledForPacks,
  type ActivityPackId,
} from '@/lib/activityPacks';

export type PermissionCrudVerb = 'view' | 'create' | 'edit' | 'delete';

export const PERMISSION_CRUD_VERBS: readonly PermissionCrudVerb[] = [
  'view',
  'create',
  'edit',
  'delete',
] as const;

export const PERMISSION_CRUD_LABELS: Record<PermissionCrudVerb, string> = {
  view: 'عرض',
  create: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
};

export type PermissionCatalogItem = {
  key: string;
  label: string;
};

export type PermissionCatalogGroup = {
  key: string;
  label: string;
  permissions: PermissionCatalogItem[];
};

export type PermissionResourceAction = {
  verb: string;
  key: string;
  label: string;
};

export type PermissionResource = {
  /** e.g. products, repair.jobs, inventory.transactions */
  id: string;
  groupKey: string;
  groupLabel: string;
  /** Arabic label for the page/resource row */
  label: string;
  crud: Partial<Record<PermissionCrudVerb, PermissionCatalogItem>>;
  /** Non-CRUD verbs: approve, manage, print, collect, … */
  actions: PermissionResourceAction[];
  /** All keys belonging to this resource (for group toggle). */
  allKeys: string[];
};

const CRUD_SET = new Set<string>(PERMISSION_CRUD_VERBS);

function splitPermissionKey(key: string): { resourceId: string; verb: string } {
  const parts = key.split('.');
  if (parts.length < 2) {
    return { resourceId: key, verb: 'view' };
  }
  const verb = parts[parts.length - 1] || 'view';
  const resourceId = parts.slice(0, -1).join('.');
  return { resourceId, verb };
}

function humanizeResourceId(resourceId: string): string {
  const last = resourceId.split('.').pop() || resourceId;
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
}

function buildResourcesFromGroup(group: PermissionCatalogGroup): PermissionResource[] {
  const map = new Map<string, PermissionResource>();

  for (const item of group.permissions) {
    const { resourceId, verb } = splitPermissionKey(item.key);
    let row = map.get(resourceId);
    if (!row) {
      row = {
        id: resourceId,
        groupKey: group.key,
        groupLabel: group.label,
        label: humanizeResourceId(resourceId),
        crud: {},
        actions: [],
        allKeys: [],
      };
      map.set(resourceId, row);
    }
    row.allKeys.push(item.key);

    if (CRUD_SET.has(verb)) {
      row.crud[verb as PermissionCrudVerb] = item;
      if (verb === 'view' || (!row.label.includes(' ') && verb === 'create')) {
        const stripped = item.label
          .replace(/^(عرض|إنشاء|إضافة|تعديل|حذف)\s+/u, '')
          .trim();
        if (stripped) row.label = stripped;
      }
    } else {
      row.actions.push({ verb, key: item.key, label: item.label });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

/** Pure builder — used by tests and by the live catalog. */
export function buildPermissionCatalogFromGroups(
  groups: readonly PermissionCatalogGroup[],
): PermissionResource[] {
  return groups.flatMap(buildResourcesFromGroup);
}

let cachedCatalog: PermissionResource[] | null = null;
let cachedGroups: PermissionCatalogGroup[] | null = null;

function loadLiveGroups(): PermissionCatalogGroup[] {
  if (!cachedGroups) {
    // Lazy require keeps Firebase/store out of unit-test import graphs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./permissions') as { PERMISSION_GROUPS: PermissionCatalogGroup[] };
    cachedGroups = mod.PERMISSION_GROUPS;
  }
  return cachedGroups;
}

export function getPermissionCatalog(): PermissionResource[] {
  if (!cachedCatalog) {
    cachedCatalog = buildPermissionCatalogFromGroups(loadLiveGroups());
  }
  return cachedCatalog;
}

export function getPermissionCatalogByGroup(
  enabledPacks?: readonly ActivityPackId[] | null,
): Array<{ group: PermissionCatalogGroup; resources: PermissionResource[] }> {
  const groups = loadLiveGroups();
  const catalog = getPermissionCatalog();
  return groups
    .filter((group) =>
      !enabledPacks || isPermissionGroupEnabledForPacks(group.key, enabledPacks),
    )
    .map((group) => ({
      group,
      resources: catalog.filter((r) => r.groupKey === group.key),
    }))
    .filter((entry) => entry.resources.length > 0);
}

export function getPermissionResource(resourceId: string): PermissionResource | undefined {
  return getPermissionCatalog().find((r) => r.id === resourceId);
}

/** Exact-key check for matrix helpers (aliases live in `checkPermission`). */
function hasExactPermission(
  permissions: Record<string, boolean> | null | undefined,
  key?: string,
): boolean {
  if (!key || !permissions) return false;
  return permissions[key] === true;
}

export type ResourcePermissionGuards = {
  resourceId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** True if user has materials.manage / *.manage style key when no discrete edit/delete. */
  canManage: boolean;
  canAction: (verb: string) => boolean;
  /** Page gate: view OR any CRUD OR any action (can open the screen). */
  canAccessPage: boolean;
};

export function resolveResourcePermissionGuards(
  permissions: Record<string, boolean> | null | undefined,
  resourceId: string,
  catalog: readonly PermissionResource[] = getPermissionCatalog(),
): ResourcePermissionGuards {
  const resource = catalog.find((r) => r.id === resourceId);
  const can = (key?: string) => hasExactPermission(permissions, key);

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
    if (CRUD_SET.has(verb)) {
      if (verb === 'view') return canView;
      if (verb === 'create') return canCreate;
      if (verb === 'edit') return canEdit;
      if (verb === 'delete') return canDelete;
    }
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
}

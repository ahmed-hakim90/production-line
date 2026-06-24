/**
 * Role Service — CRUD for "roles" collection + default seeding
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { FirestoreRole } from '../../../types';
import { ALL_PERMISSIONS, type Permission } from '../../../utils/permissions';
import { getCurrentTenantId } from '../../../lib/currentTenant';

const COLLECTION = 'roles';

function allPerms(value: boolean): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  ALL_PERMISSIONS.forEach((p) => {
    obj[p] = value;
  });
  return obj;
}

function permsFrom(enabled: Permission[]): Record<string, boolean> {
  const obj = allPerms(false);
  enabled.forEach((p) => {
    obj[p] = true;
  });
  return obj;
}

let _defaultRoles: Omit<FirestoreRole, 'id' | 'tenantId'>[] | null = null;
function getDefaultRoles(): Omit<FirestoreRole, 'id' | 'tenantId'>[] {
  if (!_defaultRoles) {
    _defaultRoles = [
      {
        name: 'مدير النظام',
        color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
        permissions: allPerms(true),
        roleKey: 'admin',
      },
      {
        name: 'مدير المصنع',
        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        permissions: permsFrom([
          'dashboard.view',
          'employeeDashboard.view',
          'products.view',
          'lines.view',
          'employees.view',
          'employees.viewDetails',
          'reports.view',
          'reports.componentWaste.create',
          'lineStatus.view',
          'lineProductConfig.view',
          'settings.view',
          'plans.view',
          'routing.view',
          'routing.manage',
          'routing.analytics',
          'routing.execute',
          'factoryDashboard.view',
          'supplyCycles.view',
          'supplyCycles.manage',
          'supplyCycles.close',
          'supplyCycles.delete',
          'materials.view',
          'materials.manage',
          'bom.view',
          'bom.manage',
          'planning.materialRequirements.view',
          'planning.materialRequirements.generate',
          'products.rawMaterials.view',
          'inventory.items.manage',
          'inventory.view',
          'inventory.analytics.view',
          'inventory.exceptions.view',
          'system.readiness.view',
          'manufacturing.purchaseGap.view',
          'productionWorkers.view',
          'production.workers.view',
          'production.workers.manage',
          'production.workerTargets.manage',
          'production.workerReports.view',
          'production.workerRatings.view',
          'production.workerRatings.manage',
          'production.workerBonus.view',
          'production.workerBonus.manage',
          'lineWorkers.view',
          'approval.view',
          'print',
          'export',
        ]),
        roleKey: 'factory_manager',
      },
      {
        name: 'مشرف الصالة',
        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        permissions: permsFrom([
          'dashboard.view',
          'employeeDashboard.view',
          'products.view',
          'lines.view',
          'employees.view',
          'employees.viewDetails',
          'reports.view',
          'reports.create',
          'reports.edit',
          'reports.componentWaste.create',
          'lineStatus.view',
          'lineStatus.edit',
          'lineProductConfig.view',
          'settings.view',
          'plans.view',
          'plans.create',
          'plans.edit',
          'routing.view',
          'routing.manage',
          'routing.execute',
          'routing.analytics',
          'quickAction.view',
          'supplyCycles.view',
          'supplyCycles.manage',
          'supplyCycles.close',
          'supplyCycles.delete',
          'materials.view',
          'bom.view',
          'planning.materialRequirements.view',
          'planning.materialRequirements.generate',
          'products.rawMaterials.view',
          'productionWorkers.view',
          'production.workers.view',
          'production.workerReports.view',
          'production.workerRatings.view',
          'leave.view',
          'leave.create',
          'print',
          'export',
        ]),
        roleKey: 'hall_supervisor',
      },
      {
        name: 'مشرف',
        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        permissions: permsFrom([
          'dashboard.view',
          'employeeDashboard.view',
          'reports.view',
          'reports.create',
          'reports.componentWaste.create',
          'routing.view',
          'routing.execute',
          'quickAction.view',
          'supplyCycles.view',
          'leave.view',
          'leave.create',
          'print',
          'export',
        ]),
        roleKey: 'supervisor',
      },
      {
        name: 'مدير الموارد البشرية',
        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        permissions: permsFrom([
          'dashboard.view',
          'hrDashboard.view',
          'employeeDashboard.view',
          'employees.view',
          'employees.viewDetails',
          'employees.create',
          'employees.edit',
          'attendance.view',
          'attendance.import',
          'attendance.edit',
          'leave.view',
          'leave.create',
          'leave.manage',
          'loan.view',
          'loan.create',
          'loan.manage',
          'approval.view',
          'approval.manage',
          'approval.delegate',
          'approval.escalate',
          'approval.override',
          'payroll.view',
          'payroll.generate',
          'payroll.finalize',
          'payroll.lock',
          'hrSettings.view',
          'hrSettings.edit',
          'vehicles.view',
          'vehicles.manage',
          'selfService.view',
          'hr.evaluation.view',
          'hr.evaluation.create',
          'hr.evaluation.approve',
          'print',
          'export',
          'import',
        ]),
        roleKey: 'hr_manager',
      },
      {
        name: 'محاسب',
        color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
        permissions: permsFrom([
          'dashboard.view',
          'hrDashboard.view',
          'payroll.view',
          'payroll.accounts.view',
          'payroll.accounts.disburse',
          'loan.view',
          'loan.disburse',
          'employees.view',
          'employees.viewDetails',
          'selfService.view',
          'print',
          'export',
        ]),
        roleKey: 'accountant',
      },
    ];
  }
  return _defaultRoles;
}

function normalizeRoleName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function defaultRoleDocId(tenantId: string, roleKey: string): string {
  return `${tenantId.replace(/\//g, '_')}__${roleKey}`;
}

function existingDefaultRoleKeys(roles: FirestoreRole[]): Set<string> {
  const defaultsByName = new Map(
    getDefaultRoles().map((role) => [normalizeRoleName(role.name), role.roleKey]),
  );
  const keys = new Set<string>();

  roles.forEach((role) => {
    if (role.roleKey) {
      keys.add(role.roleKey);
      return;
    }

    const roleKey = defaultsByName.get(normalizeRoleName(role.name));
    if (roleKey) keys.add(roleKey);
  });

  return keys;
}

let seedIfEmptyInFlight: Promise<FirestoreRole[]> | null = null;
let productionWorkerPermsMigrationInFlight: Promise<number> | null = null;
/** Session guard — migration is idempotent; skip re-runs after first successful pass. */
let productionWorkerPermsMigrationDone = false;

/** Production worker permissions to merge onto built-in roles (does not revoke custom perms). */
const FACTORY_MANAGER_PRODUCTION_WORKER_PERMS: Permission[] = [
  'productionWorkers.view',
  'production.workers.view',
  'production.workers.manage',
  'production.workerTargets.manage',
  'production.workerReports.view',
  'production.workerRatings.view',
  'production.workerRatings.manage',
  'production.workerBonus.view',
  'production.workerBonus.manage',
  'lineWorkers.view',
  'approval.view',
];

const HALL_SUPERVISOR_PRODUCTION_WORKER_PERMS: Permission[] = [
  'productionWorkers.view',
  'production.workers.view',
  'production.workerReports.view',
  'production.workerRatings.view',
];

const PRODUCTION_WORKER_PERMS_BY_ROLE_KEY: Record<string, readonly Permission[]> = {
  factory_manager: FACTORY_MANAGER_PRODUCTION_WORKER_PERMS,
  hall_supervisor: HALL_SUPERVISOR_PRODUCTION_WORKER_PERMS,
};

function rolesCollectionQuery() {
  return query(collection(db, COLLECTION), where('tenantId', '==', getCurrentTenantId()));
}

export const roleService = {
  async getAll(): Promise<FirestoreRole[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(rolesCollectionQuery());
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreRole));
    } catch (error) {
      console.error('roleService.getAll error:', error);
      throw error;
    }
  },

  /** Super-admin: roles for an arbitrary tenant (ignores currentTenantId). */
  async listRolesByTenantId(tenantId: string): Promise<FirestoreRole[]> {
    if (!isConfigured || !tenantId.trim()) return [];
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTION), where('tenantId', '==', tenantId)),
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreRole));
    } catch (error) {
      console.error('roleService.listRolesByTenantId error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<FirestoreRole | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      const row = { id: snap.id, ...snap.data() } as FirestoreRole;
      if (row.tenantId && row.tenantId !== getCurrentTenantId()) return null;
      return row;
    } catch (error) {
      console.error('roleService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<FirestoreRole, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        tenantId: getCurrentTenantId(),
      });
      return ref.id;
    } catch (error) {
      console.error('roleService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<Omit<FirestoreRole, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, id), data as Record<string, any>);
    } catch (error) {
      console.error('roleService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('roleService.delete error:', error);
      throw error;
    }
  },

  subscribeAll(callback: (roles: FirestoreRole[]) => void): () => void {
    if (!isConfigured) return () => {};
    return onSnapshot(rolesCollectionQuery(), (snap) => {
      const roles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreRole));
      callback(roles);
    });
  },

  async seedIfEmpty(): Promise<FirestoreRole[]> {
    if (!isConfigured) return [];
    if (seedIfEmptyInFlight) return seedIfEmptyInFlight;

    seedIfEmptyInFlight = (async () => {
      const tid = getCurrentTenantId();
      const existing = await this.getAll();
      const defaults = getDefaultRoles();
      const existingKeys = existingDefaultRoleKeys(existing);
      const missingDefaults = defaults.filter((role) => role.roleKey && !existingKeys.has(role.roleKey));

      if (missingDefaults.length === 0) return existing;

      await Promise.all(
        missingDefaults.map((role) =>
          setDoc(doc(db, COLLECTION, defaultRoleDocId(tid, role.roleKey!)), {
            ...role,
            tenantId: tid,
          }),
        ),
      );

      return this.getAll();
    })();

    try {
      return await seedIfEmptyInFlight;
    } finally {
      seedIfEmptyInFlight = null;
    }
  },

  /**
   * One-time idempotent merge: grant production worker permissions on built-in roles.
   * Existing custom permissions are preserved; only missing keys are set to true.
   */
  async ensureProductionWorkerPermissionsOnRoles(): Promise<number> {
    if (!isConfigured) return 0;
    if (productionWorkerPermsMigrationDone) return 0;
    if (productionWorkerPermsMigrationInFlight) return productionWorkerPermsMigrationInFlight;

    productionWorkerPermsMigrationInFlight = (async () => {
      const roles = await this.getAll();
      let patched = 0;
      for (const role of roles) {
        if (!role.id || !role.roleKey) continue;
        const toGrant = PRODUCTION_WORKER_PERMS_BY_ROLE_KEY[role.roleKey];
        if (!toGrant?.length) continue;

        const current = role.permissions ?? {};
        const next = { ...current };
        let changed = false;
        for (const perm of toGrant) {
          if (!next[perm]) {
            next[perm] = true;
            changed = true;
          }
        }
        if (changed) {
          await this.update(role.id, { permissions: next });
          patched += 1;
        }
      }
      return patched;
    })();

    try {
      const patched = await productionWorkerPermsMigrationInFlight;
      productionWorkerPermsMigrationDone = true;
      return patched;
    } finally {
      productionWorkerPermsMigrationInFlight = null;
    }
  },
};

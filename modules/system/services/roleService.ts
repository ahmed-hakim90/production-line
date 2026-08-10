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
import { BUILTIN_ROLE_PERMISSION_LOCKS } from '@/utils/builtinRolePermissionLocks';
import { ALL_PERMISSIONS, type Permission } from '../../../utils/permissions';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import {
  REPAIR_BUILTIN_ROLE_DEFS,
  reconcileExistingRepairBuiltinPermissions,
  type RepairBuiltinRoleKey,
} from '../../repair/lib/repairBuiltinRoles';

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
        color: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] dark:bg-[rgb(var(--color-danger)/0.2)] dark:text-[rgb(var(--color-danger))]',
        permissions: allPerms(true),
        roleKey: 'admin',
      },
      {
        name: 'مدير المصنع',
        color: 'bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))] dark:bg-[rgb(var(--color-primary)/0.2)] dark:text-[rgb(var(--color-primary))]',
        permissions: permsFrom([
          'dashboard.view',
          'employeeDashboard.view',
          'products.view',
          'products.create',
          'products.edit',
          'products.sellingPrice.view',
          'lines.view',
          'employees.view',
          'employees.viewDetails',
          'reports.view',
          'reports.create',
          'reports.edit',
          'reports.componentInjection.manage',
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
          'productionDashboard.view',
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
          'productionIssue.request',
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
          'sparePartsReplenishment.view',
          'sparePartsReplenishment.approve',
          'sparePartsReplenishment.responsibleApprove',
          'print',
          'export',
        ]),
        roleKey: 'factory_manager',
      },
      {
        name: 'مشرف الصالة',
        color: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] dark:bg-[rgb(var(--color-warning)/0.2)] dark:text-[rgb(var(--color-warning))]',
        permissions: permsFrom([
          'dashboard.view',
          'employeeDashboard.view',
          'productionDashboard.view',
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
          'inventory.view',
          'productionIssue.request',
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
        color: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success)/0.2)] dark:text-[rgb(var(--color-success))]',
        permissions: permsFrom([
          'dashboard.view',
          'employeeDashboard.view',
          // No productionDashboard.view — line supervisors use /supervisor, not factory KPIs.
          'reports.view',
          'reports.create',
          'reports.componentWaste.create',
          'routing.view',
          'routing.execute',
          'quickAction.view',
          'supplyCycles.view',
          // No inventory.view — supervisors request issues via production portal only.
          'productionIssue.request',
          // No plans.view — factory/hall planning board, not line supervisor.
          'leave.view',
          'leave.create',
          'print',
          'export',
        ]),
        roleKey: 'supervisor',
      },
      {
        name: 'مدير الموارد البشرية',
        color: 'bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary)/0.2)] dark:text-[rgb(var(--color-secondary))]',
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
        color: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success)/0.2)] dark:text-[rgb(var(--color-success))]',
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
          'accounting.view',
          'accounting.accounts.manage',
          'accounting.journals.post',
          'accounting.journals.reverse',
          'accounting.periods.manage',
          'accounting.settings.manage',
          'accounting.inventory.view',
          'print',
          'export',
        ]),
        roleKey: 'accountant',
      },
      {
        name: 'مسؤول مخزن المستلزمات',
        color: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] dark:bg-[rgb(var(--color-warning)/0.2)] dark:text-[rgb(var(--color-warning))]',
        permissions: permsFrom([
          'dashboard.view',
          'inventory.view',
          'inventory.analytics.view',
          'inventory.exceptions.view',
          'inventory.transactions.create',
          'inventory.transactions.edit',
          'inventory.transactions.print',
          'inventory.transactions.export',
          'inventory.transactions.delete',
          'inventory.counts.manage',
          'inventory.locations.manage',
          'inventory.items.manage',
          'inventory.transfers.approve',
          'inventory.disassembly.manage',
          'productionIssue.create',
          'productionIssue.approve',
          'productionIssue.print',
          'productionIssue.return',
          'productionIssue.compensate',
          'departmentConsumables.view',
          'departmentConsumables.create',
          'departmentConsumables.approve',
          'departmentConsumables.issue',
          'departmentConsumables.export',
          'sparePartsReplenishment.view',
          'sparePartsReplenishment.create',
          'sparePartsReplenishment.approve',
          'sparePartsReplenishment.prepare',
          'sparePartsReplenishment.responsibleApprove',
          'sparePartsReplenishment.receive',
          'materials.view',
          'materials.manage',
          'bom.view',
          'planning.materialRequirements.view',
          'planning.materialRequirements.generate',
          'manufacturing.purchaseGap.view',
          'products.rawMaterials.view',
          'catalog.categories.view',
          'supplyCycles.view',
          'supplyCycles.manage',
          'settings.view',
          'system.readiness.view',
          'print',
          'export',
          'import',
        ]),
        roleKey: 'materials_warehouse',
      },
      {
        name: 'مسؤول مخزن قطع الغيار المركزي',
        color: 'bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary)/0.2)] dark:text-[rgb(var(--color-secondary))]',
        permissions: permsFrom([
          'dashboard.view',
          'inventory.view',
          'inventory.transactions.create',
          'inventory.transactions.edit',
          'inventory.transactions.print',
          'inventory.transactions.export',
          'inventory.counts.manage',
          'inventory.items.manage',
          'inventory.locations.manage',
          'inventory.transfers.approve',
          'sparePartsReplenishment.view',
          'sparePartsReplenishment.approve',
          'sparePartsReplenishment.prepare',
          'sparePartsReplenishment.responsibleApprove',
          'sparePartsRecall.view',
          'sparePartsRecall.create',
          'sparePartsRecall.confirm',
          'sparePartsRecall.cancel',
          'materials.view',
          'print',
          'export',
          'import',
        ]),
        roleKey: 'spare_parts_central_warehouse',
      },
      {
        name: 'مسؤول مخزن مركز صيانة',
        color: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success)/0.2)] dark:text-[rgb(var(--color-success))]',
        permissions: permsFrom([
          'dashboard.view',
          'inventory.view',
          'inventory.transactions.create',
          'inventory.transactions.print',
          'inventory.counts.manage',
          'inventory.locations.manage',
          'sparePartsReplenishment.view',
          'sparePartsReplenishment.create',
          'sparePartsReplenishment.receive',
          'sparePartsRecall.view',
          'sparePartsRecall.confirm',
          'repair.view',
          'repair.parts.view',
          'repairSpareIssues.view',
          'repairSpareIssues.create',
          'repairSpareIssues.approve',
          'repairSpareIssues.issue',
          'materials.view',
          'print',
          'export',
        ]),
        roleKey: 'maintenance_center_warehouse',
      },
      {
        name: 'عرض مخزون فقط',
        color: 'bg-[var(--color-surface-hover)] text-[var(--color-text)] dark:bg-[var(--color-card)] dark:text-[var(--color-text-muted)]',
        permissions: permsFrom([
          'dashboard.view',
          'inventory.view',
          'inventory.analytics.view',
          'inventory.exceptions.view',
          'inventory.transactions.print',
          'inventory.transactions.export',
          'departmentConsumables.view',
          'sparePartsReplenishment.view',
          'print',
          'export',
        ]),
        roleKey: 'inventory_viewer',
      },
      {
        name: REPAIR_BUILTIN_ROLE_DEFS.repair_reception.name,
        color: REPAIR_BUILTIN_ROLE_DEFS.repair_reception.color,
        permissions: permsFrom([...REPAIR_BUILTIN_ROLE_DEFS.repair_reception.permissions]),
        roleKey: 'repair_reception',
      },
      {
        name: REPAIR_BUILTIN_ROLE_DEFS.repair_technician.name,
        color: REPAIR_BUILTIN_ROLE_DEFS.repair_technician.color,
        permissions: permsFrom([...REPAIR_BUILTIN_ROLE_DEFS.repair_technician.permissions]),
        roleKey: 'repair_technician',
      },
    ];
  }
  return _defaultRoles;
}

function normalizeRoleName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveDefaultRoleKey(role: FirestoreRole): string | undefined {
  if (role.roleKey) return role.roleKey;
  return getDefaultRoles().find(
    (defaultRole) => normalizeRoleName(defaultRole.name) === normalizeRoleName(role.name),
  )?.roleKey;
}

function defaultRoleDocId(tenantId: string, roleKey: string): string {
  return `${tenantId.replace(/\//g, '_')}__${roleKey}`;
}

function existingDefaultRoleKeys(roles: FirestoreRole[]): Set<string> {
  const keys = new Set<string>();

  roles.forEach((role) => {
    const roleKey = resolveDefaultRoleKey(role);
    if (roleKey) keys.add(roleKey);
  });

  return keys;
}

const roleMigrationInFlight = new Map<string, Promise<FirestoreRole[]>>();

/** Additive grants for built-in roles (does not revoke custom perms). */
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
  // Keep factory ops unblocked after DB-only grants (no client admin bypass).
  'reports.create',
  'reports.edit',
  'reports.componentInjection.manage',
  'products.create',
  'products.edit',
  'products.sellingPrice.view',
  'bom.view',
  'bom.manage',
  'costs.view',
];

const HALL_SUPERVISOR_PRODUCTION_WORKER_PERMS: Permission[] = [
  'productionWorkers.view',
  'production.workers.view',
  'production.workerReports.view',
  'production.workerRatings.view',
  'bom.view',
];

const REQUIRED_PERMISSION_MIGRATIONS_BY_ROLE_KEY: Record<string, readonly Permission[]> = {
  factory_manager: [
    ...FACTORY_MANAGER_PRODUCTION_WORKER_PERMS,
    'productionDashboard.view',
    'sparePartsReplenishment.view',
    'sparePartsReplenishment.approve',
    'sparePartsReplenishment.responsibleApprove',
  ],
  hall_supervisor: [...HALL_SUPERVISOR_PRODUCTION_WORKER_PERMS, 'productionDashboard.view'],
  materials_warehouse: [
    'bom.view',
    'departmentConsumables.view',
    'departmentConsumables.create',
    'departmentConsumables.approve',
    'departmentConsumables.issue',
    'departmentConsumables.export',
    'sparePartsReplenishment.view',
    'sparePartsReplenishment.create',
    'sparePartsReplenishment.approve',
    'sparePartsReplenishment.prepare',
    'sparePartsReplenishment.responsibleApprove',
    'sparePartsReplenishment.receive',
  ],
  spare_parts_central_warehouse: [
    'sparePartsRecall.view',
    'sparePartsRecall.create',
    'sparePartsRecall.confirm',
    'sparePartsRecall.cancel',
    'sparePartsReplenishment.view',
    'sparePartsReplenishment.approve',
    'sparePartsReplenishment.prepare',
    'sparePartsReplenishment.responsibleApprove',
  ],
  maintenance_center_warehouse: [
    'sparePartsReplenishment.view',
    'sparePartsReplenishment.create',
    'sparePartsReplenishment.receive',
    'sparePartsRecall.view',
    'sparePartsRecall.confirm',
    'repair.view',
    'repair.parts.view',
    'repairSpareIssues.view',
    'repairSpareIssues.create',
    'repairSpareIssues.approve',
    'repairSpareIssues.issue',
  ],
  repair_reception: [
    'repair.parts.view',
    'repairSpareIssues.view',
    'repairSpareIssues.create',
    'repairSpareIssues.approve',
    'repairSpareIssues.issue',
    'sparePartsReplenishment.view',
    'sparePartsReplenishment.create',
    'sparePartsReplenishment.receive',
    'sparePartsRecall.view',
    'sparePartsRecall.confirm',
    'inventory.view',
    'repair.complaints.view',
  ],
  inventory_viewer: [
    'sparePartsReplenishment.view',
  ],
};

function rolesCollectionQuery() {
  return query(collection(db, COLLECTION), where('tenantId', '==', getCurrentTenantId()));
}

export const roleService = {
  defaultRoleId(roleKey: string): string {
    return defaultRoleDocId(getCurrentTenantId(), roleKey);
  },

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

  /**
   * Explicit default-role migration. Firestore rules require super-admin or
   * roles.manage, so normal sign-in/bootstrap code must only call getAll().
   */
  /**
   * Create missing default role docs + additive permission grants.
   * Call only from an explicit admin action (Roles Management button) or company Setup.
   * Must not run automatically on every login.
   */
  async migrateDefaultRoles(): Promise<FirestoreRole[]> {
    if (!isConfigured) return [];
    const tid = getCurrentTenantId();
    const existingMigration = roleMigrationInFlight.get(tid);
    if (existingMigration) return existingMigration;

    const migration = (async () => {
      const existing = await this.getAll();
      const defaults = getDefaultRoles();
      const existingKeys = existingDefaultRoleKeys(existing);
      const missingDefaults = defaults.filter((role) => role.roleKey && !existingKeys.has(role.roleKey));

      if (missingDefaults.length > 0) {
        await Promise.all(
          missingDefaults.map((role) =>
            setDoc(doc(db, COLLECTION, defaultRoleDocId(tid, role.roleKey!)), {
              ...role,
              tenantId: tid,
            }),
          ),
        );
      }

      await this.ensureProductionWorkerPermissionsOnRoles();
      await this.ensureBuiltinRolePermissionLocks();
      await this.ensureRepairBuiltinRoleCatalogPermissions();
      await this.ensureAdminRoleCatalogPermissions();
      return this.getAll();
    })();
    roleMigrationInFlight.set(tid, migration);

    try {
      return await migration;
    } finally {
      roleMigrationInFlight.delete(tid);
    }
  },

  /** @deprecated Use migrateDefaultRoles only from an authorized admin workflow. */
  async seedIfEmpty(): Promise<FirestoreRole[]> {
    return this.migrateDefaultRoles();
  },

  /**
   * Idempotent, explicitly authorized permission migration for built-in roles.
   * Existing custom permissions are preserved; only named grants are set to true.
   */
  async ensureProductionWorkerPermissionsOnRoles(): Promise<number> {
    if (!isConfigured) return 0;
    const roles = await this.getAll();
    let patched = 0;
    for (const role of roles) {
      const roleKey = resolveDefaultRoleKey(role);
      if (!role.id || !roleKey) continue;
      const toGrant = REQUIRED_PERMISSION_MIGRATIONS_BY_ROLE_KEY[roleKey];
      if (!toGrant?.length) continue;

      const current = role.permissions ?? {};
      const next = { ...current };
      let changed = false;
      for (const perm of toGrant) {
        // Do not re-open keys an admin explicitly set to false.
        if (next[perm] === true || next[perm] === false) continue;
        next[perm] = true;
        changed = true;
      }
      if (changed) {
        await this.update(role.id, {
          permissions: next,
          ...(role.roleKey ? {} : { roleKey }),
        });
        patched += 1;
      }
    }
    return patched;
  },

  /**
   * Force-off locked permissions on built-in roles (e.g. line supervisor ≠ factory plans board).
   */
  async ensureBuiltinRolePermissionLocks(): Promise<number> {
    if (!isConfigured) return 0;
    const roles = await this.getAll();
    let patched = 0;
    for (const role of roles) {
      const roleKey = resolveDefaultRoleKey(role);
      if (!role.id || !roleKey) continue;
      const toLock = BUILTIN_ROLE_PERMISSION_LOCKS[roleKey];
      if (!toLock?.length) continue;

      const current = role.permissions ?? {};
      const next = { ...current };
      let changed = false;
      for (const perm of toLock) {
        if (next[perm] === true) {
          next[perm] = false;
          changed = true;
        }
      }
      if (changed) {
        await this.update(role.id, {
          permissions: next,
          ...(role.roleKey ? {} : { roleKey }),
        });
        patched += 1;
      }
    }
    return patched;
  },

  /**
   * Ensure built-in repair reception/technician role docs exist.
   * Existing roles: preserve admin permission edits; only strip isolation forbids.
   * Never re-open permissions an admin turned off on login migrate.
   */
  async ensureRepairBuiltinRoleCatalogPermissions(): Promise<number> {
    if (!isConfigured) return 0;
    const tid = getCurrentTenantId();
    const roles = await this.getAll();
    const byKey = new Map<string, FirestoreRole>();
    for (const role of roles) {
      const key = resolveDefaultRoleKey(role);
      if (key) byKey.set(key, role);
    }

    let patched = 0;
    const keys = Object.keys(REPAIR_BUILTIN_ROLE_DEFS) as RepairBuiltinRoleKey[];
    for (const roleKey of keys) {
      const def = REPAIR_BUILTIN_ROLE_DEFS[roleKey];
      const nextPermissions = permsFrom([...def.permissions]);
      const existing = byKey.get(roleKey);
      if (!existing?.id) {
        await setDoc(doc(db, COLLECTION, defaultRoleDocId(tid, roleKey)), {
          name: def.name,
          color: def.color,
          permissions: nextPermissions,
          roleKey,
          tenantId: tid,
        });
        patched += 1;
        continue;
      }

      const reconciled = reconcileExistingRepairBuiltinPermissions(existing.permissions, roleKey);
      const needsRoleKey = existing.roleKey !== roleKey;
      if (!reconciled.changed && !needsRoleKey) continue;

      await this.update(existing.id, {
        ...(reconciled.changed ? { permissions: reconciled.permissions } : {}),
        ...(needsRoleKey ? { roleKey } : {}),
      });
      patched += 1;
    }
    return patched;
  },

  /**
   * Keep built-in admin role docs aligned with the permission catalog in DB
   * (replaces client-side adminPermissions() override).
   */
  async ensureAdminRoleCatalogPermissions(): Promise<number> {
    if (!isConfigured) return 0;
    const roles = await this.getAll();
    let patched = 0;
    for (const role of roles) {
      const roleKey = resolveDefaultRoleKey(role);
      if (!role.id || roleKey !== 'admin') continue;
      const current = role.permissions ?? {};
      const next = { ...current };
      let changed = false;
      for (const perm of ALL_PERMISSIONS) {
        if (next[perm] !== true) {
          next[perm] = true;
          changed = true;
        }
      }
      if (changed) {
        await this.update(role.id, {
          permissions: next,
          ...(role.roleKey ? {} : { roleKey: 'admin' }),
        });
        patched += 1;
      }
    }
    return patched;
  },
};

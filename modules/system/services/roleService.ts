/**
 * Role Service — CRUD for "roles" collection + default seeding
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
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
          'lineStatus.view',
          'lineProductConfig.view',
          'settings.view',
          'plans.view',
          'factoryDashboard.view',
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
          'lineStatus.view',
          'lineStatus.edit',
          'lineProductConfig.view',
          'settings.view',
          'plans.view',
          'plans.create',
          'plans.edit',
          'quickAction.view',
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
          'quickAction.view',
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

let seedIfEmptyInFlight: Promise<FirestoreRole[]> | null = null;

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
      if (existing.length > 0) return existing;

      const defaults = getDefaultRoles();
      await Promise.all(
        defaults.map((role) =>
          addDoc(collection(db, COLLECTION), {
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
};

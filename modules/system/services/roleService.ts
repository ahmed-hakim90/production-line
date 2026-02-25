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
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { FirestoreRole } from '../../../types';
import { ALL_PERMISSIONS, type Permission } from '../../../utils/permissions';

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

let _defaultRoles: Omit<FirestoreRole, 'id'>[] | null = null;
function getDefaultRoles(): Omit<FirestoreRole, 'id'>[] {
  if (!_defaultRoles) {
    _defaultRoles = [
      {
        name: 'مدير النظام',
        color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
        permissions: allPerms(true),
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
      },
    ];
  }
  return _defaultRoles;
}

const DEFAULT_ROLE_DOC_IDS = [
  'default_admin',
  'default_factory_manager',
  'default_floor_supervisor',
  'default_supervisor',
] as const;

let seedIfEmptyInFlight: Promise<FirestoreRole[]> | null = null;

export const roleService = {
  async getAll(): Promise<FirestoreRole[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
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
      return { id: snap.id, ...snap.data() } as FirestoreRole;
    } catch (error) {
      console.error('roleService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<FirestoreRole, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), data);
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
    return onSnapshot(collection(db, COLLECTION), (snap) => {
      const roles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreRole));
      callback(roles);
    });
  },

  async seedIfEmpty(): Promise<FirestoreRole[]> {
    if (!isConfigured) return [];
    if (seedIfEmptyInFlight) return seedIfEmptyInFlight;

    seedIfEmptyInFlight = (async () => {
      const existing = await this.getAll();
      if (existing.length > 0) return existing;

      const defaults = getDefaultRoles();
      await Promise.all(
        defaults.map(async (role, idx) => {
          const roleDocId = DEFAULT_ROLE_DOC_IDS[idx] ?? `default_role_${idx}`;
          const roleRef = doc(db, COLLECTION, roleDocId);
          const roleSnap = await getDoc(roleRef);
          if (!roleSnap.exists()) {
            await setDoc(roleRef, role);
          }
        }),
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

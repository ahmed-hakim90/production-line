/**
 * Employee Service — Firestore CRUD for the "employees" collection.
 * Includes hierarchy helpers for the approval engine.
 */
import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { employeesRef, HR_COLLECTIONS } from './collections';
import type { FirestoreEmployee } from '@/types';

const eqTenant = () => where('tenantId', '==', getCurrentTenantId());

/** Strip undefined values — Firestore rejects them */
function clean<T extends Record<string, any>>(obj: T): T {
  const result = {} as any;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

export const employeeService = {
  async getAll(): Promise<FirestoreEmployee[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(query(employeesRef(), eqTenant()));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployee));
  },

  async getById(id: string): Promise<FirestoreEmployee | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, HR_COLLECTIONS.EMPLOYEES, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreEmployee;
  },

  async create(data: Omit<FirestoreEmployee, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(employeesRef(), {
      ...clean(data),
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(id: string, data: Partial<FirestoreEmployee>): Promise<void> {
    if (!isConfigured) return;
    const { id: _id, ...fields } = data as any;
    await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEES, id), clean(fields));
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, HR_COLLECTIONS.EMPLOYEES, id));
  },

  async getByDepartment(departmentId: string): Promise<FirestoreEmployee[]> {
    if (!isConfigured) return [];
    const q = query(employeesRef(), eqTenant(), where('departmentId', '==', departmentId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployee));
  },

  async getByManager(managerId: string): Promise<FirestoreEmployee[]> {
    if (!isConfigured) return [];
    const q = query(employeesRef(), eqTenant(), where('managerId', '==', managerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployee));
  },

  /**
   * Walk up the managerId chain to build the full hierarchy above an employee.
   * Returns an ordered array from immediate manager to the top.
   */
  async getHierarchy(employeeId: string): Promise<FirestoreEmployee[]> {
    if (!isConfigured) return [];
    const chain: FirestoreEmployee[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = employeeId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const emp = await this.getById(currentId);
      if (!emp) break;
      if (currentId !== employeeId) chain.push(emp);
      currentId = emp.managerId;
    }
    return chain;
  },

  async getByUserId(userId: string): Promise<FirestoreEmployee | null> {
    if (!isConfigured) return null;
    const q = query(employeesRef(), eqTenant(), where('userId', '==', userId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as FirestoreEmployee;
  },

  /**
   * Get linked userId for an employee.
   * Returns null if no user account is linked.
   */
  async getUserIdByEmployeeId(employeeId: string): Promise<string | null> {
    if (!isConfigured) return null;
    const employee = await this.getById(employeeId);
    return employee?.userId ?? null;
  },
};

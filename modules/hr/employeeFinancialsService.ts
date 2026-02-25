/**
 * Employee Financials Service — CRUD for per-employee allowances & deductions.
 *
 * Supports recurring and one-time entries with duplicate prevention.
 * Provides monthly aggregation helpers consumed by the Payroll Engine.
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
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import {
  employeeAllowancesRef,
  employeeDeductionsRef,
  HR_COLLECTIONS,
} from './collections';
import type {
  FirestoreEmployeeAllowance,
  FirestoreEmployeeDeduction,
  EmployeeAllowanceSummary,
  EmployeeDeductionSummary,
} from './types';

// ─── Allowances ──────────────────────────────────────────────────────────────

export const employeeAllowanceService = {
  async getAll(): Promise<FirestoreEmployeeAllowance[]> {
    if (!isConfigured) return [];
    try {
      const q = query(employeeAllowancesRef(), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeAllowance));
    } catch {
      const snap = await getDocs(employeeAllowancesRef());
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeAllowance));
      items.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const db2 = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return db2 - da;
      });
      return items;
    }
  },

  async create(data: Omit<FirestoreEmployeeAllowance, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    if (!isConfigured) return '';

    if (!data.isRecurring) {
      const existing = await this.getByEmployeeAndMonth(data.employeeId, data.startMonth);
      const duplicate = existing.find(
        (a) => a.allowanceTypeId === data.allowanceTypeId && !a.isRecurring,
      );
      if (duplicate) {
        throw new Error('يوجد بالفعل بدل من نفس النوع لهذا الشهر');
      }
    }

    const ref = await addDoc(employeeAllowancesRef(), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async getByEmployee(employeeId: string): Promise<FirestoreEmployeeAllowance[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        employeeAllowancesRef(),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeAllowance));
    } catch {
      const q = query(employeeAllowancesRef(), where('employeeId', '==', employeeId));
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeAllowance));
      results.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      return results;
    }
  },

  async getByEmployeeAndMonth(employeeId: string, month: string): Promise<FirestoreEmployeeAllowance[]> {
    if (!isConfigured) return [];
    const all = await this.getByEmployee(employeeId);
    return all.filter((a) => {
      if (a.status !== 'active') return false;
      if (a.isRecurring) {
        if (a.startMonth > month) return false;
        if (a.endMonth && a.endMonth < month) return false;
        return true;
      }
      return a.startMonth === month;
    });
  },

  async getActiveForMonth(month: string): Promise<FirestoreEmployeeAllowance[]> {
    if (!isConfigured) return [];
    const q = query(employeeAllowancesRef(), where('status', '==', 'active'));
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeAllowance));
    return all.filter((a) => {
      if (a.isRecurring) {
        if (a.startMonth > month) return false;
        if (a.endMonth && a.endMonth < month) return false;
        return true;
      }
      return a.startMonth === month;
    });
  },

  async update(id: string, data: Partial<FirestoreEmployeeAllowance>): Promise<void> {
    if (!isConfigured) return;
    const ref = doc(db, HR_COLLECTIONS.EMPLOYEE_ALLOWANCES, id);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() } as any);
  },

  async stop(id: string): Promise<void> {
    if (!isConfigured) return;
    const ref = doc(db, HR_COLLECTIONS.EMPLOYEE_ALLOWANCES, id);
    await updateDoc(ref, {
      status: 'stopped',
      endMonth: new Date().toISOString().slice(0, 7),
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_ALLOWANCES, id));
  },

  async getById(id: string): Promise<FirestoreEmployeeAllowance | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_ALLOWANCES, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreEmployeeAllowance;
  },

};

// ─── Deductions ──────────────────────────────────────────────────────────────

export const employeeDeductionService = {
  async getAll(): Promise<FirestoreEmployeeDeduction[]> {
    if (!isConfigured) return [];
    try {
      const q = query(employeeDeductionsRef(), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeDeduction));
    } catch {
      const snap = await getDocs(employeeDeductionsRef());
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeDeduction));
      items.sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const db2 = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return db2 - da;
      });
      return items;
    }
  },

  async create(data: Omit<FirestoreEmployeeDeduction, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    if (!isConfigured) return '';

    if (!data.isRecurring) {
      const existing = await this.getByEmployeeAndMonth(data.employeeId, data.startMonth);
      const duplicate = existing.find(
        (d) => d.deductionTypeId === data.deductionTypeId && !d.isRecurring && d.category === data.category,
      );
      if (duplicate) {
        throw new Error('يوجد بالفعل خصم من نفس النوع لهذا الشهر');
      }
    }

    const ref = await addDoc(employeeDeductionsRef(), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async getByEmployee(employeeId: string): Promise<FirestoreEmployeeDeduction[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        employeeDeductionsRef(),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeDeduction));
    } catch {
      const q = query(employeeDeductionsRef(), where('employeeId', '==', employeeId));
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeDeduction));
      results.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      return results;
    }
  },

  async getByEmployeeAndMonth(employeeId: string, month: string): Promise<FirestoreEmployeeDeduction[]> {
    if (!isConfigured) return [];
    const all = await this.getByEmployee(employeeId);
    return all.filter((d) => {
      if (d.status !== 'active') return false;
      if (d.isRecurring) {
        if (d.startMonth > month) return false;
        if (d.endMonth && d.endMonth < month) return false;
        return true;
      }
      return d.startMonth === month;
    });
  },

  async getActiveForMonth(month: string): Promise<FirestoreEmployeeDeduction[]> {
    if (!isConfigured) return [];
    const q = query(employeeDeductionsRef(), where('status', '==', 'active'));
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeeDeduction));
    return all.filter((d) => {
      if (d.isRecurring) {
        if (d.startMonth > month) return false;
        if (d.endMonth && d.endMonth < month) return false;
        return true;
      }
      return d.startMonth === month;
    });
  },

  async getTransportDeductions(employeeId: string): Promise<FirestoreEmployeeDeduction[]> {
    if (!isConfigured) return [];
    const all = await this.getByEmployee(employeeId);
    return all.filter((d) => d.category === 'transport' && d.status === 'active');
  },

  async update(id: string, data: Partial<FirestoreEmployeeDeduction>): Promise<void> {
    if (!isConfigured) return;
    const ref = doc(db, HR_COLLECTIONS.EMPLOYEE_DEDUCTIONS, id);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() } as any);
  },

  async stop(id: string): Promise<void> {
    if (!isConfigured) return;
    const ref = doc(db, HR_COLLECTIONS.EMPLOYEE_DEDUCTIONS, id);
    await updateDoc(ref, {
      status: 'stopped',
      endMonth: new Date().toISOString().slice(0, 7),
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_DEDUCTIONS, id));
  },

  async getById(id: string): Promise<FirestoreEmployeeDeduction | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, HR_COLLECTIONS.EMPLOYEE_DEDUCTIONS, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreEmployeeDeduction;
  },

};

// ─── Aggregation Helpers (consumed by Payroll Engine & Live Preview) ────────

export function summarizeAllowances(
  allowances: FirestoreEmployeeAllowance[],
): EmployeeAllowanceSummary {
  const items = allowances.map((a) => ({
    name: a.allowanceTypeName,
    amount: a.amount,
    isRecurring: a.isRecurring,
  }));
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  return { items, total: Math.round(total * 100) / 100 };
}

export function summarizeDeductions(
  deductions: FirestoreEmployeeDeduction[],
): EmployeeDeductionSummary {
  const items = deductions.map((d) => ({
    name: d.deductionTypeName,
    amount: d.amount,
    isRecurring: d.isRecurring,
    reason: d.reason,
  }));
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  return { items, total: Math.round(total * 100) / 100 };
}

// ─── Vehicle Auto-Link ──────────────────────────────────────────────────────

export async function syncVehicleDeduction(
  employeeId: string,
  vehicleId: string | null,
  monthlyCostPerEmployee: number,
  createdBy: string,
): Promise<void> {
  if (!isConfigured) return;

  const existingTransport = await employeeDeductionService.getTransportDeductions(employeeId);

  if (!vehicleId || monthlyCostPerEmployee <= 0) {
    for (const d of existingTransport) {
      if (d.id) await employeeDeductionService.stop(d.id);
    }
    return;
  }

  const autoEntry = existingTransport.find(
    (d) => d.deductionTypeId === `vehicle_${vehicleId}`,
  );

  if (autoEntry) {
    if (autoEntry.amount !== monthlyCostPerEmployee && autoEntry.id) {
      await employeeDeductionService.update(autoEntry.id, {
        amount: monthlyCostPerEmployee,
      });
    }
  } else {
    for (const d of existingTransport) {
      if (d.id) await employeeDeductionService.stop(d.id);
    }
    await employeeDeductionService.create({
      employeeId,
      deductionTypeId: `vehicle_${vehicleId}`,
      deductionTypeName: 'خصم نقل — مركبة',
      amount: monthlyCostPerEmployee,
      isRecurring: true,
      startMonth: new Date().toISOString().slice(0, 7),
      endMonth: null,
      reason: 'خصم تلقائي — تعيين مركبة نقل',
      category: 'transport',
      status: 'active',
      createdBy,
    });
  }
}

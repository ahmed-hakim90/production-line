/**
 * Organization master-data IO (departments, positions, shifts, rules).
 * UI layers must not call Firestore write APIs directly.
 */
import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { tenantQuery } from '@/lib/tenantFirestore';
import {
  departmentsRef,
  jobPositionsRef,
  shiftsRef,
  penaltyRulesRef,
  lateRulesRef,
  allowanceTypesRef,
  HR_COLLECTIONS,
} from '../collections';
import type {
  FirestoreDepartment,
  FirestoreJobPosition,
  FirestoreShift,
  FirestorePenaltyRule,
  FirestoreLateRule,
  FirestoreAllowanceType,
  JobLevel,
} from '../types';

const DELETABLE_COLLECTIONS = new Set<string>([
  HR_COLLECTIONS.DEPARTMENTS,
  HR_COLLECTIONS.JOB_POSITIONS,
  HR_COLLECTIONS.SHIFTS,
  HR_COLLECTIONS.PENALTY_RULES,
  HR_COLLECTIONS.LATE_RULES,
  HR_COLLECTIONS.ALLOWANCE_TYPES,
]);

const UPDATABLE_COLLECTIONS = DELETABLE_COLLECTIONS;

function withTenant<T extends Record<string, unknown>>(payload: T): T & { tenantId: string } {
  return { ...payload, tenantId: getCurrentTenantId() };
}

export const organizationService = {
  /** Tenant-scoped active departments. Unfiltered collection lists are denied by rules. */
  async listActiveDepartments(): Promise<FirestoreDepartment[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, HR_COLLECTIONS.DEPARTMENTS));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment))
      .filter((d) => d.isActive !== false);
  },

  async createDepartment(input: {
    name: string;
    code?: string;
    managerId?: string;
    isActive?: boolean;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const name = input.name.trim();
    if (!name) throw new Error('اسم القسم مطلوب');
    const code = (input.code || name.substring(0, 3)).trim().toUpperCase();
    const ref = await addDoc(departmentsRef(), withTenant({
      name,
      code,
      managerId: input.managerId || '',
      isActive: input.isActive !== false,
      createdAt: serverTimestamp(),
    }));
    return ref.id;
  },

  async updateDepartment(id: string, input: Partial<Omit<FirestoreDepartment, 'id'>>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...fields } = input as FirestoreDepartment & { id?: string };
    await updateDoc(doc(db, HR_COLLECTIONS.DEPARTMENTS, id), withTenant({ ...fields }));
  },

  async createJobPosition(input: {
    title: string;
    departmentId?: string;
    level?: JobLevel;
    hasSystemAccessDefault?: boolean;
    isActive?: boolean;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const title = input.title.trim();
    if (!title) throw new Error('عنوان المنصب مطلوب');
    const ref = await addDoc(jobPositionsRef(), withTenant({
      title,
      departmentId: input.departmentId || '',
      level: (input.level || 1) as JobLevel,
      hasSystemAccessDefault: input.hasSystemAccessDefault === true,
      isActive: input.isActive !== false,
      createdAt: serverTimestamp(),
    }));
    return ref.id;
  },

  async updateJobPosition(id: string, input: Partial<Omit<FirestoreJobPosition, 'id'>>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...fields } = input as FirestoreJobPosition & { id?: string };
    await updateDoc(doc(db, HR_COLLECTIONS.JOB_POSITIONS, id), withTenant({ ...fields }));
  },

  async createShift(input: {
    name: string;
    startTime?: string;
    endTime?: string;
    latestCheckInTime?: string;
    firstCheckOutTime?: string;
    breakMinutes?: number;
    lateGraceMinutes?: number;
    crossesMidnight?: boolean;
    isActive?: boolean;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const name = input.name.trim();
    if (!name) throw new Error('اسم الوردية مطلوب');
    const ref = await addDoc(shiftsRef(), withTenant({
      name,
      startTime: input.startTime || '08:00',
      endTime: input.endTime || '16:00',
      latestCheckInTime: input.latestCheckInTime || '11:59',
      firstCheckOutTime: input.firstCheckOutTime || '12:00',
      breakMinutes: Number(input.breakMinutes ?? 60),
      lateGraceMinutes: Number(input.lateGraceMinutes ?? 15),
      crossesMidnight: input.crossesMidnight === true,
      isActive: input.isActive !== false,
      createdAt: serverTimestamp(),
    }));
    return ref.id;
  },

  async updateShift(id: string, input: Partial<Omit<FirestoreShift, 'id'>>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...fields } = input as FirestoreShift & { id?: string };
    await updateDoc(doc(db, HR_COLLECTIONS.SHIFTS, id), withTenant({ ...fields }));
  },

  async createPenaltyRule(input: Omit<FirestorePenaltyRule, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(penaltyRulesRef(), withTenant({ ...input }));
    return ref.id;
  },

  async updatePenaltyRule(id: string, input: Partial<Omit<FirestorePenaltyRule, 'id'>>): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, HR_COLLECTIONS.PENALTY_RULES, id), withTenant({ ...input }));
  },

  async createLateRule(input: Omit<FirestoreLateRule, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(lateRulesRef(), withTenant({ ...input }));
    return ref.id;
  },

  async updateLateRule(id: string, input: Partial<Omit<FirestoreLateRule, 'id'>>): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, HR_COLLECTIONS.LATE_RULES, id), withTenant({ ...input }));
  },

  async createAllowanceType(input: Omit<FirestoreAllowanceType, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(allowanceTypesRef(), withTenant({ ...input }));
    return ref.id;
  },

  async updateAllowanceType(id: string, input: Partial<Omit<FirestoreAllowanceType, 'id'>>): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, HR_COLLECTIONS.ALLOWANCE_TYPES, id), withTenant({ ...input }));
  },

  async updateEntity(
    collectionName: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!isConfigured || !id) return;
    if (!UPDATABLE_COLLECTIONS.has(collectionName)) {
      throw new Error('تحديث غير مسموح لهذه المجموعة');
    }
    await updateDoc(doc(db, collectionName, id), withTenant(data));
  },

  /** Deletes org master-data docs from an allowlisted collection only. */
  async deleteEntity(collectionName: string, id: string): Promise<void> {
    if (!isConfigured || !id) return;
    if (!DELETABLE_COLLECTIONS.has(collectionName)) {
      throw new Error('حذف غير مسموح لهذه المجموعة');
    }
    await deleteDoc(doc(db, collectionName, id));
  },
};

export type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift };

/**
 * Organization master-data IO (departments, positions, shifts, rules).
 * Pages must not call Firestore write APIs directly.
 */
import {
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import {
  departmentsRef,
  jobPositionsRef,
  shiftsRef,
  HR_COLLECTIONS,
} from '../collections';
import type {
  FirestoreDepartment,
  FirestoreJobPosition,
  FirestoreShift,
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

export const organizationService = {
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
    const ref = await addDoc(departmentsRef(), {
      name,
      code,
      managerId: input.managerId || '',
      isActive: input.isActive !== false,
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
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
    const ref = await addDoc(jobPositionsRef(), {
      title,
      departmentId: input.departmentId || '',
      level: (input.level || 1) as JobLevel,
      hasSystemAccessDefault: input.hasSystemAccessDefault === true,
      isActive: input.isActive !== false,
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
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
    const ref = await addDoc(shiftsRef(), {
      name,
      startTime: input.startTime || '08:00',
      endTime: input.endTime || '16:00',
      latestCheckInTime: input.latestCheckInTime || '11:59',
      firstCheckOutTime: input.firstCheckOutTime || '12:00',
      breakMinutes: Number(input.breakMinutes ?? 60),
      lateGraceMinutes: Number(input.lateGraceMinutes ?? 15),
      crossesMidnight: input.crossesMidnight === true,
      isActive: input.isActive !== false,
      tenantId: getCurrentTenantId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
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

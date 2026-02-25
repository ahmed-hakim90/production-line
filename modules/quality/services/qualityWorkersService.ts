import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { activityLogService } from '@/services/activityLogService';
import type { QualityWorkerAssignment } from '@/types';
import { qualityWorkerAssignmentsRef } from '../collections';

export const qualityWorkersService = {
  async getAll(): Promise<QualityWorkerAssignment[]> {
    if (!isConfigured) return [];
    const q = query(qualityWorkerAssignmentsRef(), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityWorkerAssignment));
  },

  async getByEmployee(employeeId: string): Promise<QualityWorkerAssignment | null> {
    if (!isConfigured) return null;
    const q = query(qualityWorkerAssignmentsRef(), where('employeeId', '==', employeeId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const first = snap.docs[0];
    return { id: first.id, ...first.data() } as QualityWorkerAssignment;
  },

  async create(payload: Omit<QualityWorkerAssignment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(qualityWorkerAssignmentsRef(), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_CREATE_WORKER',
      'إضافة عامل جودة',
      { assignmentId: ref.id, employeeId: payload.employeeId, qualityRole: payload.qualityRole },
    );
    return ref.id;
  },

  async update(id: string, payload: Partial<Omit<QualityWorkerAssignment, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(qualityWorkerAssignmentsRef(), id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_UPDATE_WORKER',
      'تحديث عامل جودة',
      { assignmentId: id, changes: payload },
    );
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(qualityWorkerAssignmentsRef(), id));
    await activityLogService.logCurrentUser(
      'QUALITY_DELETE_WORKER',
      'حذف عامل جودة',
      { assignmentId: id },
    );
  },

  subscribeAll(cb: (rows: QualityWorkerAssignment[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(qualityWorkerAssignmentsRef(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityWorkerAssignment)));
    });
  },
};

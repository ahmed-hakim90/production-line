import {
  addDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { employeePerformanceRef } from '../collections';
import type { FirestoreEmployeePerformance } from '../types';

export const performanceService = {
  async getByMonth(month: string): Promise<FirestoreEmployeePerformance[]> {
    if (!isConfigured) return [];
    const q = query(employeePerformanceRef(), where('month', '==', month));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployeePerformance))
      .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
  },

  async getByEmployeeAndMonth(employeeId: string, month: string): Promise<FirestoreEmployeePerformance | null> {
    if (!isConfigured) return null;
    const q = query(
      employeePerformanceRef(),
      where('employeeId', '==', employeeId),
      where('month', '==', month),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as FirestoreEmployeePerformance;
  },

  async upsert(data: Omit<FirestoreEmployeePerformance, 'id' | 'createdAt'>): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const existing = await this.getByEmployeeAndMonth(data.employeeId, data.month);
    if (existing?.id) {
      await updateDoc(doc(employeePerformanceRef(), existing.id), {
        ...data,
        evaluatedAt: serverTimestamp(),
      });
      return existing.id;
    }

    const ref = await addDoc(employeePerformanceRef(), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async approveBonus(id: string, approvedBy: string, bonusAmount: number): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(employeePerformanceRef(), id), {
      bonusApproved: true,
      bonusAmount,
      bonusApprovedBy: approvedBy,
      bonusApprovedAt: serverTimestamp(),
    });
  },
};

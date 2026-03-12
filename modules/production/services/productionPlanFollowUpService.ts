import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { ProductionPlanFollowUp } from '../../../types';

const COLLECTION = 'production_plan_followups';

export const productionPlanFollowUpService = {
  async getAll(): Promise<ProductionPlanFollowUp[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map((row) => ({ id: row.id, ...row.data() } as ProductionPlanFollowUp));
  },

  async getByPlan(planId: string): Promise<ProductionPlanFollowUp[]> {
    if (!isConfigured || !planId) return [];
    const q = query(collection(db, COLLECTION), where('planId', '==', planId));
    const snap = await getDocs(q);
    return snap.docs.map((row) => ({ id: row.id, ...row.data() } as ProductionPlanFollowUp));
  },

  async create(
    data: Omit<ProductionPlanFollowUp, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(collection(db, COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(id: string, data: Partial<ProductionPlanFollowUp>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, createdAt: _createdAt, ...fields } = data as any;
    await updateDoc(doc(db, COLLECTION, id), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  },
};


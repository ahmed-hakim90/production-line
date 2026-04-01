import {
  doc,
  getDocs,
  orderBy,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';

export type CostVarianceStatus = 'open' | 'investigating' | 'resolved';
export type CostVarianceRow = {
  id: string;
  month: string;
  productId: string;
  variance: number;
  status: CostVarianceStatus;
  ownerId?: string;
  notes?: string;
};

const COLLECTION = 'cost_variances';

export const costVarianceWorkflowService = {
  async listByMonth(month: string): Promise<CostVarianceRow[]> {
    if (!isConfigured || !month) return [];
    const q = tenantQuery(db, COLLECTION, orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CostVarianceRow))
      .filter((row) => row.month === month);
  },

  async updateStatus(id: string, input: {
    status: CostVarianceStatus;
    ownerId?: string;
    notes?: string;
  }): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, COLLECTION, id), {
      status: input.status,
      ownerId: input.ownerId || '',
      notes: input.notes || '',
      updatedAt: new Date().toISOString(),
    });
  },
};

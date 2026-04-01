import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { PreventiveMaintenancePlan } from '../types';

const COLLECTION = 'repair_pm_plans';
const nowIso = () => new Date().toISOString();

export const preventiveMaintenanceService = {
  async listByBranch(branchId: string): Promise<PreventiveMaintenancePlan[]> {
    if (!isConfigured || !branchId) return [];
    const q = tenantQuery(db, COLLECTION, orderBy('nextDueAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as PreventiveMaintenancePlan))
      .filter((row) => row.branchId === branchId);
  },

  async create(input: Omit<PreventiveMaintenancePlan, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const at = nowIso();
    const ref = await addDoc(collection(db, COLLECTION), {
      ...input,
      tenantId: getCurrentTenantId(),
      createdAt: at,
      updatedAt: at,
    });
    return ref.id;
  },

  async update(id: string, patch: Partial<PreventiveMaintenancePlan>): Promise<void> {
    if (!isConfigured || !id) return;
    await updateDoc(doc(db, COLLECTION, id), { ...patch, updatedAt: nowIso() });
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },
};

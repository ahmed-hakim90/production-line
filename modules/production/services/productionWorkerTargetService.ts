import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type { ProductionWorkerTarget } from '@/types';
import { productionWorkerTargetsRef } from '../collections';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const eqTenant = () => where('tenantId', '==', getCurrentTenantId());

export const productionWorkerTargetService = {
  async getAll(): Promise<ProductionWorkerTarget[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(query(productionWorkerTargetsRef(), eqTenant()));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionWorkerTarget));
  },

  async getByWorker(workerId: string): Promise<ProductionWorkerTarget[]> {
    if (!isConfigured || !workerId) return [];
    const snap = await getDocs(
      query(productionWorkerTargetsRef(), eqTenant(), where('workerId', '==', workerId)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionWorkerTarget));
  },

  async create(
    data: Omit<ProductionWorkerTarget, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>,
  ): Promise<string> {
    if (!isConfigured) return '';
    const ref = await addDoc(productionWorkerTargetsRef(), {
      ...stripUndefined(data as Record<string, unknown>),
      tenantId: getCurrentTenantId(),
      unit: 'piece' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(id: string, data: Partial<ProductionWorkerTarget>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, createdAt: _c, tenantId: _t, ...rest } = data;
    await updateDoc(doc(productionWorkerTargetsRef(), id), {
      ...stripUndefined(rest as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    });
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(productionWorkerTargetsRef(), id));
  },
};

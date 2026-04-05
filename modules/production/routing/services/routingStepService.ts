import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../../auth/services/firebase';
import { getCurrentTenantId } from '../../../../lib/currentTenant';
import { tenantQuery } from '../../../../lib/tenantFirestore';
import type { ProductionRoutingStep } from '../types';

const COLLECTION = 'production_routing_steps';

export const routingStepService = {
  async getByPlanId(planId: string): Promise<ProductionRoutingStep[]> {
    if (!isConfigured) return [];
    const q = query(tenantQuery(db, COLLECTION), where('planId', '==', planId), orderBy('orderIndex', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionRoutingStep));
  },
};
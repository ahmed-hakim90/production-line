import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured } from '../../../auth/services/firebase';
import { getCurrentTenantId } from '../../../../lib/currentTenant';
import { tenantQuery } from '../../../../lib/tenantFirestore';
import type { ProductionRoutingPlan } from '../types';
import {
  ROUTING_CALCULATION_VERSION,
  computeRoutingCalculation,
  routingWarningLabel,
} from '../domain/calculations';

const COLLECTION = 'production_routing_plans';

export const routingPlanService = {
  async getActivePlans(): Promise<ProductionRoutingPlan[]> {
    if (!isConfigured) return [];
    const q = query(
      tenantQuery(db, COLLECTION),
      where('isActive', '==', true),
      where('isDeleted', '==', false),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionRoutingPlan));
  },

  async getById(id: string): Promise<ProductionRoutingPlan | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ProductionRoutingPlan;
  },

  async getActivePlanForProduct(productId: string): Promise<ProductionRoutingPlan | null> {
    if (!isConfigured) return null;
    const q = query(
      tenantQuery(db, COLLECTION),
      where('productId', '==', productId),
      where('isActive', '==', true),
      where('isDeleted', '==', false),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as ProductionRoutingPlan;
  },

  async getMaxVersionForProduct(productId: string): Promise<number> {
    if (!isConfigured) return 0;
    const q = query(
      tenantQuery(db, COLLECTION),
      where('productId', '==', productId),
      orderBy('version', 'desc'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    const v = (snap.docs[0].data() as ProductionRoutingPlan).version;
    return typeof v === 'number' ? v : 0;
  },

  async publishNewVersion(params: {
    productId: string;
    createdBy: string;
    deactivatePlanId?: string;
    stepRows: { name: string; durationSeconds: number; workersCount: number }[];
    /** Optional; seconds per unit for report expected-qty variance. Omitted when unset or invalid. */
    routingTargetUnitSeconds?: number;
  }): Promise<{ planId: string }> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const tenantId = getCurrentTenantId();
    const maxV = await routingPlanService.getMaxVersionForProduct(params.productId);
    const version = maxV + 1;
    const productId = String(params.productId || '').trim();
    const validRows = params.stepRows
      .map((row) => ({
        name: String(row.name || '').trim(),
        durationSeconds: Math.max(0, Number(row.durationSeconds) || 0),
        workersCount: Math.max(0, Number(row.workersCount) || 0),
      }))
      .filter((row) => row.name || row.durationSeconds > 0 || row.workersCount > 0);

    const calculation = computeRoutingCalculation({
      productId,
      quantity: 1,
      workerHourRate: 0,
      routingTargetUnitSeconds: params.routingTargetUnitSeconds,
      validateActualSteps: false,
      steps: validRows,
    });
    const blockingWarnings = calculation.warnings.filter((w) =>
      w === 'missing_product' ||
      w === 'missing_steps' ||
      w === 'step_missing_name' ||
      w === 'step_zero_duration' ||
      w === 'step_zero_workers' ||
      w === 'invalid_target_seconds'
    );
    if (blockingWarnings.length > 0) {
      throw new Error(blockingWarnings.map(routingWarningLabel).join(' '));
    }

    const planRef = doc(collection(db, COLLECTION));
    const STEP_COL = 'production_routing_steps';
    const batch = writeBatch(db);
    if (params.deactivatePlanId) {
      batch.update(doc(db, COLLECTION, params.deactivatePlanId), {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(planRef, {
      tenantId,
      productId,
      version,
      isActive: true,
      isDeleted: false,
      totalTimeSeconds: calculation.standardTotalTimeSeconds,
      totalManTimeSeconds: calculation.standardManTimeSeconds,
      ...(calculation.routingTargetUnitSeconds != null ? { routingTargetUnitSeconds: calculation.routingTargetUnitSeconds } : {}),
      calculationVersion: ROUTING_CALCULATION_VERSION,
      validationWarnings: calculation.warnings,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    validRows.forEach((row, orderIndex) => {
      const stepRef = doc(collection(db, STEP_COL));
      batch.set(stepRef, {
        tenantId,
        planId: planRef.id,
        name: row.name,
        durationSeconds: row.durationSeconds,
        workersCount: row.workersCount,
        orderIndex,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return { planId: planRef.id };
  },

  async softDeletePlan(planId: string): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, COLLECTION, planId), {
      isDeleted: true,
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  },
};

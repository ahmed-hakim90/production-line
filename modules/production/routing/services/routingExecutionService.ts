import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  limit,
} from 'firebase/firestore';
import { db, isConfigured } from '../../../auth/services/firebase';
import { getCurrentTenantId } from '../../../../lib/currentTenant';
import { tenantQuery } from '../../../../lib/tenantFirestore';
import type {
  ProductionRoutingExecution,
  ProductionRoutingExecutionStep,
  ProductionRoutingStep,
} from '../types';
import { computeExecutionKpis } from '../domain/calculations';

const EXEC_COL = 'production_routing_executions';
const EXEC_STEP_COL = 'production_routing_execution_steps';

export const routingExecutionService = {
  async getById(id: string): Promise<ProductionRoutingExecution | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, EXEC_COL, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ProductionRoutingExecution;
  },

  async listCompleted(limitN = 50): Promise<ProductionRoutingExecution[]> {
    if (!isConfigured) return [];
    const q = query(
      tenantQuery(db, EXEC_COL),
      where('status', '==', 'completed'),
      orderBy('finishedAt', 'desc'),
      limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionRoutingExecution));
  },

  async getExecutionSteps(executionId: string): Promise<ProductionRoutingExecutionStep[]> {
    if (!isConfigured) return [];
    const q = query(
      tenantQuery(db, EXEC_STEP_COL),
      where('executionId', '==', executionId),
      orderBy('orderIndex', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionRoutingExecutionStep));
  },

  async createDraft(params: {
    productId: string;
    planId: string;
    planVersion: number;
    quantity: number;
    supervisorId: string;
    standardSteps: ProductionRoutingStep[];
  }): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const tenantId = getCurrentTenantId();
    // Execution doc must be committed before steps: rules use get(execution) on step creates,
    // and same-batch writes are not visible to security rule evaluation.
    const execRef = await addDoc(collection(db, EXEC_COL), {
      tenantId,
      productId: params.productId,
      planId: params.planId,
      planVersion: params.planVersion,
      quantity: Math.max(1, params.quantity),
      supervisorId: params.supervisorId,
      status: 'draft',
      createdAt: serverTimestamp(),
    });
    const batch = writeBatch(db);
    params.standardSteps.forEach((st) => {
      const rowRef = doc(collection(db, EXEC_STEP_COL));
      batch.set(rowRef, {
        tenantId,
        executionId: execRef.id,
        stepId: st.id,
        orderIndex: st.orderIndex,
        name: st.name,
        standardDurationSeconds: st.durationSeconds,
        standardWorkersCount: st.workersCount,
      });
    });
    await batch.commit();
    return execRef.id;
  },

  async startExecution(executionId: string): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, EXEC_COL, executionId), {
      status: 'running',
      startedAt: serverTimestamp(),
    });
  },

  async patchExecutionStep(
    executionStepId: string,
    patch: { actualDurationSeconds: number; actualWorkersCount: number; notes?: string },
  ): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, EXEC_STEP_COL, executionStepId), {
      actualDurationSeconds: Math.max(0, patch.actualDurationSeconds),
      actualWorkersCount: Math.max(0, patch.actualWorkersCount),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
  },

  async completeExecution(executionId: string, workerHourRate: number): Promise<void> {
    if (!isConfigured) return;
    const execSnap = await getDoc(doc(db, EXEC_COL, executionId));
    if (!execSnap.exists()) throw new Error('Execution not found');
    const exec = { id: execSnap.id, ...execSnap.data() } as ProductionRoutingExecution;
    if (exec.status === 'completed') return;
    const steps = await routingExecutionService.getExecutionSteps(executionId);
    const standardSteps = steps.map((s) => ({
      durationSeconds: s.standardDurationSeconds,
      workersCount: s.standardWorkersCount,
    }));
    const actualSteps = steps.map((s) => ({
      actualDurationSeconds: s.actualDurationSeconds ?? 0,
      actualWorkersCount: s.actualWorkersCount ?? 0,
    }));
    const kpis = computeExecutionKpis({
      quantity: exec.quantity,
      workerHourRate,
      standardSteps,
      actualSteps,
    });
    const batch = writeBatch(db);
    batch.update(doc(db, EXEC_COL, executionId), {
      status: 'completed',
      finishedAt: serverTimestamp(),
      standardTotalTimeSeconds: kpis.standardTotalTimeSeconds,
      actualTotalTimeSeconds: kpis.actualTotalTimeSeconds,
      standardManTimeSeconds: kpis.standardManTimeSeconds,
      actualManTimeSeconds: kpis.actualManTimeSeconds,
      timeEfficiency: kpis.timeEfficiency,
      laborEfficiency: kpis.laborEfficiency,
      totalCost: kpis.totalCost,
      costPerUnit: kpis.costPerUnit,
      workerHourRateUsed: kpis.workerHourRateUsed,
    });
    await batch.commit();
  },

  /** Removes a completed execution and its step rows (requires routing.manage in rules). */
  async deleteCompletedExecution(executionId: string): Promise<void> {
    if (!isConfigured) return;
    const execSnap = await getDoc(doc(db, EXEC_COL, executionId));
    if (!execSnap.exists()) throw new Error('Execution not found');
    const exec = { id: execSnap.id, ...execSnap.data() } as ProductionRoutingExecution;
    if (exec.status !== 'completed') throw new Error('Only completed executions can be deleted here');
    const steps = await routingExecutionService.getExecutionSteps(executionId);
    const chunkSize = 400;
    for (let i = 0; i < steps.length; i += chunkSize) {
      const batch = writeBatch(db);
      steps.slice(i, i + chunkSize).forEach((s) => {
        if (s.id) batch.delete(doc(db, EXEC_STEP_COL, s.id));
      });
      await batch.commit();
    }
    await deleteDoc(doc(db, EXEC_COL, executionId));
  },
};
/** Production Routing & Execution — Firestore document shapes (tenant-scoped). */

export type RoutingExecutionStatus = 'draft' | 'running' | 'completed';

export interface ProductionRoutingPlan {
  id: string;
  tenantId: string;
  productId: string;
  version: number;
  isActive: boolean;
  isDeleted: boolean;
  /** Sum of step wall-clock durations (sequential stages). */
  totalTimeSeconds: number;
  /** Same aggregation as totalTimeSeconds (parallel workers per step do not multiply time). Kept for backward compatibility with older plans. */
  totalManTimeSeconds: number;
  /**
   * Optional seconds per finished unit for production variance (expected qty in reports).
   * When set, overrides totalTimeSeconds for that calculation; display standard still uses step sum.
   */
  routingTargetUnitSeconds?: number;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductionRoutingStep {
  id: string;
  tenantId: string;
  planId: string;
  name: string;
  durationSeconds: number;
  workersCount: number;
  orderIndex: number;
  createdAt?: unknown;
}

export interface ProductionRoutingExecution {
  id: string;
  tenantId: string;
  productId: string;
  planId: string;
  planVersion: number;
  quantity: number;
  supervisorId: string;
  status: RoutingExecutionStatus;
  startedAt?: unknown;
  finishedAt?: unknown;
  standardTotalTimeSeconds?: number;
  actualTotalTimeSeconds?: number;
  standardManTimeSeconds?: number;
  actualManTimeSeconds?: number;
  timeEfficiency?: number;
  laborEfficiency?: number;
  totalCost?: number;
  costPerUnit?: number;
  workerHourRateUsed?: number;
  createdAt?: unknown;
}

export interface ProductionRoutingExecutionStep {
  id: string;
  tenantId: string;
  executionId: string;
  stepId: string;
  orderIndex: number;
  name: string;
  standardDurationSeconds: number;
  standardWorkersCount: number;
  actualDurationSeconds?: number;
  actualWorkersCount?: number;
  notes?: string;
}

export interface RoutingStepDraft {
  clientKey: string;
  name: string;
  durationSeconds: number;
  workersCount: number;
}
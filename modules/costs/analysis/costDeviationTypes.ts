import type { MonthlyProductionCost } from '../../../types';

export type ImpactLevel = 'high' | 'medium' | 'low';
export type DeviationDirection = 'increase' | 'decrease';

export type DeviationReason = {
  id: string;
  title: string;
  impact: ImpactLevel;
  direction: DeviationDirection;
  score: number;
  evidence: string[];
  supportedByNotes: boolean;
};

export type DeviationAnalysis = {
  valid: boolean;
  message?: string;
  deviation?: number;
  deviationPercent?: number;
  reasons: DeviationReason[];
  topReason?: DeviationReason;
  confidence: number;
  summary: string;
};

export type CostSlice = {
  avg: number;
  qty: number;
  directPU: number;
  indirectPU: number;
};

export type PreviousCostSlice = CostSlice & { closed: boolean };

export type AnalyzeDeviationInput = {
  current: CostSlice;
  previous: PreviousCostSlice;
  notes: string[];
  isStale: boolean;
};

export type CostDeviationSnapshotDoc = {
  tenantId?: string;
  productId: string;
  month: string;
  deviation: number;
  deviationPercent: number;
  topReasonId?: string | null;
  reasons: DeviationReason[];
  confidence: number;
  hasQualitySignal: boolean;
  hasMaintenanceSignal: boolean;
  hasReworkSignal: boolean;
  summary?: string;
  createdAt?: unknown;
};

export function monthlyRowToCostSlice(row: MonthlyProductionCost): CostSlice {
  const qty = Math.max(0, Number(row.totalProducedQty || 0));
  const d = Number(row.directCost ?? 0);
  const ind = Number(row.indirectCost ?? 0);
  const avg = Number(row.averageUnitCost || 0);
  return {
    avg,
    qty,
    directPU: qty > 0 ? d / qty : 0,
    indirectPU: qty > 0 ? ind / qty : 0,
  };
}

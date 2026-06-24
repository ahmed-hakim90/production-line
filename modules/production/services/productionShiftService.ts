import type { ProductionReport, ProductionShiftWorkerSnapshot } from '@/types';
import { reportService } from './reportService';
import {
  buildShiftClosePayload,
  countPresentShiftWorkers,
  type ShiftStartContext,
} from '../utils/productionShiftLifecycle';

export type StartProductionShiftInput = {
  employeeId: string;
  productId: string;
  lineId: string;
  date: string;
  context: ShiftStartContext;
  planId?: string;
  userId?: string | null;
  workers: ProductionShiftWorkerSnapshot[];
};

export type CloseProductionShiftInput = {
  quantityProduced: number;
  notes?: string;
  closedByUid?: string | null;
  closedAtIso?: string;
  workHours?: number;
};

export const productionShiftService = {
  async startShift(input: StartProductionShiftInput): Promise<string | null> {
    const startedAt = new Date().toISOString();
    const workerCounts = countPresentShiftWorkers(input.workers);

    return reportService.createOpenShift({
      employeeId: input.employeeId,
      productId: input.productId,
      lineId: input.lineId,
      date: input.date,
      reportType: 'finished_product',
      lifecycleStatus: 'open',
      shiftStartedAt: startedAt,
      shiftStartedByUid: input.userId || undefined,
      shiftStartContext: input.context,
      productionPlanId: input.planId || undefined,
      productionPlanLinkMode: input.planId ? 'manual' : undefined,
      quantityProduced: 0,
      workHours: 0,
      notes: '',
      laborAssignmentSource: 'line_worker_assignments',
      shiftWorkers: input.workers,
      ...workerCounts,
    });
  },

  buildClosePayload: buildShiftClosePayload,
};

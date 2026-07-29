import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { ProductionReport } from '@/types';
import { reportService } from '../services/reportService';

export type CreateProductionReportInput = Omit<ProductionReport, 'id' | 'createdAt'>;

export type CreateProductionReportOutput = {
  reportId: string;
  tenantId: string;
};

/**
 * Persist a production report and emit REPORT_CREATED.
 * Callers (store/UI) remain responsible for inventory side-effects and cache refresh.
 */
export async function createProductionReport(
  data: CreateProductionReportInput,
  actor?: { userId?: string; userName?: string },
): Promise<UseCaseResult<CreateProductionReportOutput>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const reportId = await reportService.create(data);
    if (!reportId) {
      throw new Error('تعذر حفظ التقرير');
    }

    eventBus.emit(SystemEvents.REPORT_CREATED, {
      module: 'production',
      entityType: 'production_report',
      entityId: reportId,
      batchId: reportId,
      action: 'create',
      reportType: String(data.reportType || ''),
      reportCode: data.reportCode,
      tenantId,
      actor,
      description: 'Production report created',
      metadata: {
        lineId: data.lineId,
        productId: data.productId,
        employeeId: data.employeeId,
        date: data.date,
        quantityProduced: data.quantityProduced,
      },
    });

    return { reportId, tenantId };
  });
}

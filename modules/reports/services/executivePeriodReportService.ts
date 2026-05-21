import { getOperationalDateString } from '../../../utils/calculations';
import { reportComplianceService } from '../../dashboards/services/reportComplianceService';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import { stockService } from '../../inventory/services/stockService';
import { productionPlanService } from '../../production/services/productionPlanService';
import { reportService } from '../../production/services/reportService';
import { monthlyProductionCostService } from '../../costs/services/monthlyProductionCostService';
import { costHealthSnapshotService } from '../../costs/services/costHealthSnapshotService';
import type { FirestoreEmployee, ProductionLine, SystemSettings } from '../../../types';

export type ExecutivePeriodSection = {
  key: string;
  title: string;
  lines: string[];
};

export type ExecutivePeriodReport = {
  periodLabel: string;
  month: string;
  generatedAt: string;
  sections: ExecutivePeriodSection[];
};

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export const executivePeriodReportService = {
  async build(month: string, input: {
    employees: FirestoreEmployee[];
    lines: ProductionLine[];
    settings: SystemSettings;
  }): Promise<ExecutivePeriodReport> {
    const { startDate, endDate } = monthRange(month);
    const operationalDate = getOperationalDateString();

    const [plans, reports, pendingTransfers, monthlyCosts, compliance, kpi] = await Promise.all([
      productionPlanService.getAll(),
      reportService.getByDateRange(startDate, endDate),
      transferApprovalService.getByStatus('pending'),
      monthlyProductionCostService.getByMonth(month),
      reportComplianceService.getSnapshotForDate(operationalDate, input.employees, input.lines, {
        scope: 'all_active',
      }),
      stockService.getInventoryKpiSummary(),
    ]);

    const costHealth = costHealthSnapshotService.getQuickSnapshot(input.settings);
    const activePlans = plans.filter((p) => p.status === 'planned' || p.status === 'in_progress').length;
    const completedPlans = plans.filter((p) => p.status === 'completed').length;

    const sections: ExecutivePeriodSection[] = [
      {
        key: 'production',
        title: 'الإنتاج',
        lines: [
          `تقارير الفترة: ${reports.length}`,
          `خطط نشطة: ${activePlans} | مكتملة: ${completedPlans}`,
          `تقارير ناقصة اليوم: ${compliance.missingCount}`,
          `تقارير مُسلّمة اليوم: ${compliance.submittedCount}`,
        ],
      },
      {
        key: 'inventory',
        title: 'المخزون',
        lines: [
          `إجمالي أصناف الرصيد: ${kpi.totalLines}`,
          `كمية إجمالية: ${kpi.totalQty}`,
          `أصناف منخفضة: ${kpi.lowStockCount}`,
          `تحويلات معلقة: ${pendingTransfers.length}`,
        ],
      },
      {
        key: 'costs',
        title: 'التكاليف',
        lines: [
          `سجلات تكلفة شهرية: ${monthlyCosts.length}`,
          `تحذيرات صحة البيانات: ${costHealth.issueCount}`,
          ...costHealth.topIssues.map((i) => `• ${i.title}`),
        ],
      },
    ];

    return {
      periodLabel: month,
      month,
      generatedAt: new Date().toISOString(),
      sections,
    };
  },
};

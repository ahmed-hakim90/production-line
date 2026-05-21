import { getOperationalDateString } from '../../../utils/calculations';
import { reportComplianceService } from '../../dashboards/services/reportComplianceService';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import { productionPlanService } from '../../production/services/productionPlanService';
import { materialRequirementService } from '../../manufacturing/services/materialRequirementService';
import { costHealthSnapshotService } from '../../costs/services/costHealthSnapshotService';
import type { FirestoreEmployee, ProductionLine, SystemSettings } from '../../../types';

export type OpsInboxSeverity = 'critical' | 'high' | 'medium' | 'low';

export type OpsInboxItem = {
  id: string;
  category: 'transfer' | 'report' | 'cost' | 'plan' | 'inventory';
  severity: OpsInboxSeverity;
  title: string;
  detail: string;
  actionPath: string;
  referenceId?: string;
  createdAt?: string;
};

export type OpsInboxSnapshot = {
  operationalDate: string;
  items: OpsInboxItem[];
  counts: {
    transfers: number;
    missingReports: number;
    costIssues: number;
    stalePlans: number;
    slaBreaches: number;
  };
};

const STALE_PLAN_DAYS = 7;

function daysBetween(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

export const opsInboxService = {
  async loadSnapshot(input: {
    employees: FirestoreEmployee[];
    lines: ProductionLine[];
    settings: SystemSettings;
  }): Promise<OpsInboxSnapshot> {
    const operationalDate = getOperationalDateString();
    const slaDays = Math.max(1, Number(input.settings.planSettings?.transferSlaWarningDays || 2));
    const items: OpsInboxItem[] = [];

    const [pendingTransfers, compliance, costSnap, plans] = await Promise.all([
      transferApprovalService.getByStatus('pending'),
      reportComplianceService.getSnapshotForDate(operationalDate, input.employees, input.lines, {
        scope: 'all_active',
      }),
      costHealthSnapshotService.getQuickSnapshot(input.settings),
      productionPlanService.getAll(),
    ]);

    for (const tr of pendingTransfers) {
      const ageDays = daysBetween(tr.submittedAt || tr.createdAt);
      const slaBreach = ageDays >= slaDays;
      items.push({
        id: `transfer-${tr.id}`,
        category: 'transfer',
        severity: slaBreach ? 'high' : 'medium',
        title: `تحويل معلق ${tr.referenceNo}`,
        detail: `${tr.lines.length} صنف — عمر ${ageDays} يوم`,
        actionPath: '/inventory/transfer-approvals',
        referenceId: tr.id,
        createdAt: tr.createdAt,
      });
    }

    for (const person of compliance.missing) {
      items.push({
        id: `report-missing-${person.employeeId}`,
        category: 'report',
        severity: 'high',
        title: `تقرير ناقص: ${person.name}`,
        detail: person.missingLineNames.join('، ') || 'خطوط بدون تقرير',
        actionPath: '/reports',
        referenceId: person.employeeId,
      });
    }

    for (const issue of costSnap.topIssues) {
      items.push({
        id: `cost-${issue.id}`,
        category: 'cost',
        severity: issue.severity,
        title: issue.title,
        detail: issue.description,
        actionPath: '/costs/health',
        referenceId: issue.id,
      });
    }

    const activePlans = plans.filter((p) => p.status === 'planned' || p.status === 'in_progress');
    const stalePlanChecks = await Promise.all(
      activePlans.map(async (plan) => {
        const req = plan.id ? await materialRequirementService.getByPlanId(plan.id) : null;
        const generatedAt = req?.generatedAt || '';
        const stale = !generatedAt || daysBetween(generatedAt) >= STALE_PLAN_DAYS;
        return { plan, stale };
      }),
    );
    for (const { plan, stale } of stalePlanChecks) {
      if (!stale) continue;
      items.push({
        id: `plan-mr-${plan.id}`,
        category: 'plan',
        severity: 'medium',
        title: `خطة بلا احتياجات محدثة`,
        detail: plan.id || '—',
        actionPath: '/production-plans',
        referenceId: plan.id,
      });
    }

    const severityOrder: Record<OpsInboxSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      operationalDate,
      items,
      counts: {
        transfers: pendingTransfers.length,
        missingReports: compliance.missingCount,
        costIssues: costSnap.issueCount,
        stalePlans: items.filter((i) => i.category === 'plan').length,
        slaBreaches: items.filter((i) => i.category === 'transfer' && i.severity === 'high').length,
      },
    };
  },
};

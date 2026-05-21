import type { SystemSettings } from '../../../types';
import type { OpsInboxSeverity } from '../../operations/services/opsInboxService';

export type CostHealthQuickIssue = {
  id: string;
  severity: OpsInboxSeverity;
  title: string;
  description: string;
};

export type CostHealthQuickSnapshot = {
  issueCount: number;
  topIssues: CostHealthQuickIssue[];
};

export const costHealthSnapshotService = {
  getQuickSnapshot(settings: SystemSettings): CostHealthQuickSnapshot {
    const issues: CostHealthQuickIssue[] = [];
    const hourlyRate = Number(settings.laborSettings?.hourlyRate || 0);
    if (hourlyRate <= 0) {
      issues.push({
        id: 'labor-rate',
        severity: 'critical',
        title: 'سعر ساعة العمالة غير مضبوط',
        description: 'أضف سعر الساعة في إعدادات التكلفة',
      });
    }
    const routing = settings.planSettings?.inventoryRouting;
    if (!routing?.productionWipWarehouseId?.trim()) {
      issues.push({
        id: 'routing-wip',
        severity: 'high',
        title: 'مخزن WIP غير معرّف',
        description: 'أكمل توجيه المخزون في الإعدادات',
      });
    }
    return {
      issueCount: issues.length,
      topIssues: issues.slice(0, 5),
    };
  },
};

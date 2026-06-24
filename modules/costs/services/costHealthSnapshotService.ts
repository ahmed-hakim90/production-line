import type { SystemSettings } from '../../../types';

export type CostHealthIssueSeverity = 'critical' | 'high' | 'medium' | 'low';

type CostHealthSettings = SystemSettings & {
  laborSettings?: {
    hourlyRate?: number;
  };
};

export type CostHealthQuickIssue = {
  id: string;
  severity: CostHealthIssueSeverity;
  title: string;
  description: string;
};

export type CostHealthQuickSnapshot = {
  issueCount: number;
  topIssues: CostHealthQuickIssue[];
};

export const costHealthSnapshotService = {
  getQuickSnapshot(settings: SystemSettings): CostHealthQuickSnapshot {
    const costSettings = settings as CostHealthSettings;
    const issues: CostHealthQuickIssue[] = [];
    const hourlyRate = Number(costSettings.laborSettings?.hourlyRate || 0);
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

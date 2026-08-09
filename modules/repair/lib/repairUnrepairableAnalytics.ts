import type { RepairJob } from '../types';

export type RepairUnrepairableReasonMetric = {
  code: string;
  label: string;
  jobs: number;
  decisionQuantity: number;
  currentStockQuantity: number;
  reopenedQuantity: number;
};

export type RepairUnrepairableAnalytics = {
  reasons: RepairUnrepairableReasonMetric[];
  affectedJobs: number;
  decisionQuantity: number;
  currentStockQuantity: number;
  reopenedQuantity: number;
};

export function summarizeRepairUnrepairableReasons(jobs: RepairJob[]): RepairUnrepairableAnalytics {
  const metrics = new Map<string, RepairUnrepairableReasonMetric & { jobIds: Set<string> }>();
  const affectedJobIds = new Set<string>();

  jobs.forEach((job) => {
    (job.jobProducts || []).forEach((line, index) => {
      const decisionQuantity = Math.max(
        0,
        Number(line.unrepairableDecisionQuantity ?? line.unrepairableQuantity ?? 0),
      );
      const currentStockQuantity = Math.max(0, Number(line.unrepairableQuantity || 0));
      const reopenedQuantity = Math.max(0, Number(line.reopenedFromUnrepairableQuantity || 0));
      if (decisionQuantity <= 0 && currentStockQuantity <= 0 && reopenedQuantity <= 0) return;

      const code = String(line.unrepairableReasonCode || 'legacy_unclassified').trim() || 'legacy_unclassified';
      const label = String(
        line.unrepairableReasonLabel
          || line.unrepairableReason
          || (code === 'legacy_unclassified' ? 'بيانات تاريخية غير مصنفة' : code),
      ).trim();
      const jobKey = String(job.id || `${job.receiptNo || 'job'}-${index}`);
      affectedJobIds.add(jobKey);
      const current = metrics.get(code) || {
        code,
        label,
        jobs: 0,
        decisionQuantity: 0,
        currentStockQuantity: 0,
        reopenedQuantity: 0,
        jobIds: new Set<string>(),
      };
      current.jobIds.add(jobKey);
      current.jobs = current.jobIds.size;
      current.decisionQuantity += decisionQuantity;
      current.currentStockQuantity += currentStockQuantity;
      current.reopenedQuantity += reopenedQuantity;
      metrics.set(code, current);
    });
  });

  const reasons = Array.from(metrics.values())
    .map(({ jobIds: _jobIds, ...metric }) => metric)
    .sort((a, b) => b.decisionQuantity - a.decisionQuantity || a.label.localeCompare(b.label, 'ar'));

  return {
    reasons,
    affectedJobs: affectedJobIds.size,
    decisionQuantity: reasons.reduce((sum, row) => sum + row.decisionQuantity, 0),
    currentStockQuantity: reasons.reduce((sum, row) => sum + row.currentStockQuantity, 0),
    reopenedQuantity: reasons.reduce((sum, row) => sum + row.reopenedQuantity, 0),
  };
}

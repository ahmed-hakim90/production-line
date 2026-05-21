import type { ProductionReport } from '../../../types';

export type LineEfficiencyRow = {
  lineId: string;
  reportCount: number;
  totalProduced: number;
  totalWaste: number;
  totalWorkHours: number;
  wastePct: number;
  outputPerHour: number;
};

export function computeLineEfficiencyFromReports(
  reports: ProductionReport[],
  wasteByReportId: Map<string, number>,
): LineEfficiencyRow[] {
  const byLine = new Map<string, LineEfficiencyRow>();

  for (const report of reports) {
    const lineId = String(report.lineId || '').trim();
    if (!lineId) continue;
    const produced = Number(report.quantityProduced || 0);
    const waste = wasteByReportId.get(report.id || '') ?? 0;
    const hours = Math.max(0, Number(report.workHours || 0));
    const prev = byLine.get(lineId) || {
      lineId,
      reportCount: 0,
      totalProduced: 0,
      totalWaste: 0,
      totalWorkHours: 0,
      wastePct: 0,
      outputPerHour: 0,
    };
    prev.reportCount += 1;
    prev.totalProduced += produced;
    prev.totalWaste += waste;
    prev.totalWorkHours += hours;
    byLine.set(lineId, prev);
  }

  return [...byLine.values()]
    .map((row) => {
      const denom = row.totalProduced + row.totalWaste;
      const wastePct = denom > 0 ? Math.round((row.totalWaste / denom) * 1000) / 10 : 0;
      const outputPerHour = row.totalWorkHours > 0
        ? Math.round((row.totalProduced / row.totalWorkHours) * 100) / 100
        : 0;
      return { ...row, wastePct, outputPerHour };
    })
    .sort((a, b) => b.outputPerHour - a.outputPerHour);
}

export interface FlowPalletInput {
  lineId: string;
  lineName: string;
  productName: string;
  shiftId?: string;
  shiftName?: string;
  quantityOnPallet: number;
  inspectedQuantity: number;
  rejectedQuantity: number;
  palletDecision: string;
  defects?: Array<{ reasonLabel: string; count: number }>;
}

export interface FlowHourlyInput {
  lineId: string;
  lineName: string;
  productName: string;
  shiftId?: string;
  shiftName?: string;
  sampleCount: number;
  defectCount: number;
}

export interface FlowLineRank {
  lineId: string;
  lineName: string;
  productName: string;
  inspected: number;
  defects: number;
  defectRate: number;
  acceptRate: number;
  lotUnits: number;
  hasActivity: boolean;
  topDefect: string;
}

const rate = (defects: number, inspected: number): number =>
  inspected > 0 ? Number(((defects / inspected) * 100).toFixed(2)) : 0;

/**
 * The source flowchart ranks lines by defect rate from pallet inspections and hourly samples.
 * Pallet quantity is the inspection lot, so it is not added to reported production.
 */
export function buildFlowchartMetrics(input: {
  pallets: FlowPalletInput[];
  hourly: FlowHourlyInput[];
  reportedProductionUnits: number;
  lines: Array<{ id: string; name: string }>;
}) {
  const inspected = input.pallets.reduce((sum, row) => sum + Number(row.inspectedQuantity || 0), 0)
    + input.hourly.reduce((sum, row) => sum + Number(row.sampleCount || 0), 0);
  const defects = input.pallets.reduce((sum, row) => sum + Number(row.rejectedQuantity || 0), 0)
    + input.hourly.reduce((sum, row) => sum + Number(row.defectCount || 0), 0);
  const defectRate = rate(defects, inspected);
  const lineIds = new Map<string, string>();
  input.lines.forEach((line) => lineIds.set(line.id, line.name));
  input.pallets.forEach((row) => lineIds.set(row.lineId, row.lineName));
  input.hourly.forEach((row) => lineIds.set(row.lineId, row.lineName));

  const rankings: FlowLineRank[] = [...lineIds.entries()].map(([lineId, lineName]) => {
    const pallets = input.pallets.filter((row) => row.lineId === lineId);
    const hourly = input.hourly.filter((row) => row.lineId === lineId);
    const lineInspected = pallets.reduce((sum, row) => sum + Number(row.inspectedQuantity || 0), 0)
      + hourly.reduce((sum, row) => sum + Number(row.sampleCount || 0), 0);
    const lineDefects = pallets.reduce((sum, row) => sum + Number(row.rejectedQuantity || 0), 0)
      + hourly.reduce((sum, row) => sum + Number(row.defectCount || 0), 0);
    const reasons = new Map<string, number>();
    pallets.forEach((pallet) => {
      (pallet.defects || []).forEach((defect) => {
        const label = defect.reasonLabel.trim();
        if (!label) return;
        reasons.set(label, (reasons.get(label) || 0) + Number(defect.count || 0));
      });
    });
    const top = [...reasons.entries()].sort((left, right) => right[1] - left[1])[0];
    const products = [...new Set([
      ...pallets.map((row) => row.productName),
      ...hourly.map((row) => row.productName),
    ].filter(Boolean))];
    const lotUnits = pallets.reduce((sum, row) => sum + Number(row.quantityOnPallet || 0), 0);
    return {
      lineId,
      lineName,
      productName: products.join('، ') || 'غير محدد',
      inspected: lineInspected,
      defects: lineDefects,
      defectRate: rate(lineDefects, lineInspected),
      acceptRate: Number((100 - rate(lineDefects, lineInspected)).toFixed(2)),
      lotUnits,
      hasActivity: lineInspected > 0 || lotUnits > 0,
      topDefect: top ? `${top[0]} (${top[1]})` : 'لا توجد عيوب',
    };
  }).sort((left, right) => left.defectRate - right.defectRate || right.inspected - left.inspected);

  const active = rankings.filter((line) => line.hasActivity);
  const best = active.length
    ? [...active].sort((left, right) => left.defectRate - right.defectRate || right.inspected - left.inspected)[0]
    : rankings[0] || null;
  const worst = active.length
    ? [...active].sort((left, right) => right.defectRate - left.defectRate || right.defects - left.defects)[0]
    : rankings[rankings.length - 1] || null;

  const pareto = new Map<string, number>();
  input.pallets.forEach((pallet) => {
    (pallet.defects || []).forEach((defect) => {
      const label = defect.reasonLabel.trim();
      if (!label) return;
      pareto.set(label, (pareto.get(label) || 0) + Number(defect.count || 0));
    });
  });

  return {
    reportedProductionUnits: input.reportedProductionUnits,
    lotUnits: input.pallets.reduce((sum, row) => sum + Number(row.quantityOnPallet || 0), 0),
    palletCount: input.pallets.length,
    inspected,
    aqlSamples: input.pallets.reduce((sum, row) => sum + Number(row.inspectedQuantity || 0), 0),
    hourlySamples: input.hourly.reduce((sum, row) => sum + Number(row.sampleCount || 0), 0),
    defects,
    conforming: Math.max(0, inspected - defects),
    defectRate,
    acceptRate: Number((100 - defectRate).toFixed(2)),
    acceptedPallets: input.pallets.filter((row) => row.palletDecision === 'مقبول').length,
    rejectedPallets: input.pallets.filter((row) => row.palletDecision === 'مرفوض').length,
    best,
    worst,
    rankings,
    pareto: [...pareto.entries()]
      .map(([reasonLabel, count]) => ({ reasonLabel, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
  };
}

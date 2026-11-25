import type { QualityScrapPeriod } from '../model';

export interface ScrapAnalysisRow {
  lineName: string;
  productName: string;
  reasonLabel: string;
  quantity: number;
  periods?: QualityScrapPeriod[];
}

export interface HandoverAnalysisRow {
  productName: string;
  quantity: number;
  discountPercent: number;
  reasonName?: string;
  problem: string;
}

export interface ReturnAnalysisRow {
  productName: string;
  notes: string;
  quantity: number;
}

export interface QuantityShare {
  label: string;
  quantity: number;
  count: number;
  averageDiscount?: number | null;
}

function addShare(map: Map<string, { quantity: number; count: number; discount: number; discountCount: number }>, label: string, quantity: number, discount?: number) {
  const key = label.trim() || 'بدون سبب';
  const current = map.get(key) || { quantity: 0, count: 0, discount: 0, discountCount: 0 };
  current.quantity += quantity;
  current.count += 1;
  if (discount != null && Number.isFinite(discount)) {
    current.discount += discount;
    current.discountCount += 1;
  }
  map.set(key, current);
}

function shares(map: Map<string, { quantity: number; count: number; discount: number; discountCount: number }>): QuantityShare[] {
  return [...map.entries()]
    .map(([label, value]) => ({
      label,
      quantity: value.quantity,
      count: value.count,
      averageDiscount: value.discountCount > 0 ? Number((value.discount / value.discountCount).toFixed(2)) : null,
    }))
    .sort((left, right) => right.quantity - left.quantity || left.label.localeCompare(right.label, 'ar'));
}

function scrapQuantities(row: ScrapAnalysisRow): Array<{ reasonLabel: string; quantity: number }> {
  if (row.periods && row.periods.length > 0) {
    return row.periods
      .filter((period) => Number(period.quantity) > 0)
      .map((period) => ({ reasonLabel: period.reasonLabel, quantity: Number(period.quantity) }));
  }
  return [{ reasonLabel: row.reasonLabel, quantity: Number(row.quantity || 0) }];
}

export function buildScrapBoard(input: {
  scrap: ScrapAnalysisRow[];
  handovers: HandoverAnalysisRow[];
  returns: ReturnAnalysisRow[];
}) {
  const byReason = new Map<string, { quantity: number; count: number; discount: number; discountCount: number }>();
  const byProduct = new Map<string, { quantity: number; count: number; discount: number; discountCount: number }>();
  const byLine = new Map<string, { quantity: number; count: number; discount: number; discountCount: number }>();
  input.scrap.forEach((row) => {
    scrapQuantities(row).forEach((item) => {
      if (item.quantity <= 0) return;
      addShare(byReason, item.reasonLabel, item.quantity);
      addShare(byProduct, row.productName, item.quantity);
      addShare(byLine, row.lineName, item.quantity);
    });
  });

  const sortReasons = new Map<string, { quantity: number; count: number; discount: number; discountCount: number }>();
  const sortProducts = new Map<string, { quantity: number; count: number; discount: number; discountCount: number }>();
  input.handovers.forEach((row) => {
    const label = row.reasonName?.trim() || row.problem.trim() || 'بدون سبب';
    addShare(sortReasons, label, Number(row.quantity || 0), Number(row.discountPercent || 0));
    addShare(sortProducts, row.productName, Number(row.quantity || 0), Number(row.discountPercent || 0));
  });

  const returnGroups = new Map<string, { productName: string; notes: string; quantity: number; count: number }>();
  input.returns.forEach((row) => {
    const key = `${row.productName}|${row.notes.trim()}`;
    const current = returnGroups.get(key) || { productName: row.productName, notes: row.notes.trim(), quantity: 0, count: 0 };
    current.quantity += Number(row.quantity || 0);
    current.count += 1;
    returnGroups.set(key, current);
  });

  const handoverQuantity = input.handovers.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const discounts = input.handovers.map((row) => Number(row.discountPercent || 0)).filter((value) => Number.isFinite(value));

  return {
    scrapQuantity: [...byReason.values()].reduce((sum, row) => sum + row.quantity, 0),
    byReason: shares(byReason),
    byProduct: shares(byProduct),
    byLine: shares(byLine),
    handoverQuantity,
    handoverReports: input.handovers.length,
    averageDiscount: discounts.length ? Number((discounts.reduce((sum, value) => sum + value, 0) / discounts.length).toFixed(2)) : null,
    sortByReason: shares(sortReasons),
    sortByProduct: shares(sortProducts),
    returnQuantity: input.returns.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    returnReports: input.returns.length,
    returnsByNote: [...returnGroups.values()].sort((left, right) => right.quantity - left.quantity),
  };
}

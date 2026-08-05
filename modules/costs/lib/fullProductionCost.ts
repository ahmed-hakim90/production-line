export type ProductionCostSourceStatus = 'actual' | 'estimated' | 'scheduled';

export type ProductionCostCategory =
  | 'material'
  | 'packaging'
  | 'direct_labor'
  | 'factory_overhead'
  | 'depreciation';

export type ProductionCostSourceLine = {
  /** Stable business identity used to prevent loading the same source twice. */
  sourceKey: string;
  sourceType: string;
  sourceId?: string;
  category: ProductionCostCategory;
  label: string;
  amount: number;
  status: ProductionCostSourceStatus;
  quantity?: number;
  unitCost?: number;
  costCenterId?: string;
};

export type FullProductionCostInput = {
  reportId: string;
  quantityProduced: number;
  /** Good quantity is the costing denominator. Defaults to quantityProduced. */
  goodQuantity?: number;
  normalScrapQuantity?: number;
  abnormalScrapQuantity?: number;
  lines: ProductionCostSourceLine[];
  version?: string;
  revision?: number;
};

export type ProductionCostSourceQuality = {
  actualLines: number;
  estimatedLines: number;
  scheduledLines: number;
  missingAmountLines: number;
};

export type FullProductionCostResult = {
  reportId: string;
  version: string;
  revision: number;
  status: 'provisional' | 'actual';
  quantityProduced: number;
  goodQuantity: number;
  normalScrapQuantity: number;
  abnormalScrapQuantity: number;
  materialCost: number;
  packagingCost: number;
  directLaborCost: number;
  factoryOverheadCost: number;
  depreciationCost: number;
  conversionCost: number;
  fullManufacturingCost: number;
  unitManufacturingCost: number;
  sourceQuality: ProductionCostSourceQuality;
  sourceLines: ProductionCostSourceLine[];
};

export type ProductionCostSettlement = {
  provisionalCost: number;
  actualCost: number;
  variance: number;
  varianceDirection: 'under_absorbed' | 'over_absorbed' | 'balanced';
  unitVariance: number;
};

const finite = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const roundProductionMoney = (value: unknown): number =>
  Math.round((finite(value) + Number.EPSILON) * 100) / 100;

function normalizeLine(line: ProductionCostSourceLine): ProductionCostSourceLine {
  const sourceKey = String(line.sourceKey || '').trim();
  if (!sourceKey) throw new Error('كل مصدر تكلفة يجب أن يحتوي على sourceKey ثابت.');
  const amount = roundProductionMoney(line.amount);
  if (amount < 0) throw new Error(`قيمة مصدر التكلفة ${sourceKey} لا يمكن أن تكون سالبة.`);
  return {
    ...line,
    sourceKey,
    sourceType: String(line.sourceType || '').trim() || 'unknown',
    sourceId: String(line.sourceId || '').trim() || undefined,
    label: String(line.label || '').trim() || sourceKey,
    amount,
    quantity: line.quantity == null ? undefined : Math.max(0, finite(line.quantity)),
    unitCost: line.unitCost == null ? undefined : roundProductionMoney(line.unitCost),
    costCenterId: String(line.costCenterId || '').trim() || undefined,
  };
}

function dedupeSourceLines(lines: ProductionCostSourceLine[]): ProductionCostSourceLine[] {
  const byKey = new Map<string, ProductionCostSourceLine>();
  for (const raw of lines) {
    const line = normalizeLine(raw);
    const existing = byKey.get(line.sourceKey);
    if (!existing) {
      byKey.set(line.sourceKey, line);
      continue;
    }
    if (JSON.stringify(existing) !== JSON.stringify(line)) {
      throw new Error(`مصدر التكلفة ${line.sourceKey} مكرر بقيم مختلفة.`);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}

const sumCategory = (lines: ProductionCostSourceLine[], category: ProductionCostCategory) =>
  roundProductionMoney(
    lines
      .filter((line) => line.category === category)
      .reduce((sum, line) => sum + line.amount, 0),
  );

/**
 * Calculates the full manufacturing cost without mutating accounting or inventory.
 * BOM estimates and actual stock issues can both be supplied, but callers must use
 * distinct source keys and choose one source of truth for every material line.
 */
export function calculateFullProductionCost(input: FullProductionCostInput): FullProductionCostResult {
  const quantityProduced = Math.max(0, finite(input.quantityProduced));
  const goodQuantity = Math.max(0, finite(input.goodQuantity ?? quantityProduced));
  if (quantityProduced <= 0) throw new Error('كمية تقرير الإنتاج يجب أن تكون أكبر من صفر.');
  if (goodQuantity <= 0) throw new Error('الكمية الجيدة يجب أن تكون أكبر من صفر لحساب تكلفة الوحدة.');

  const sourceLines = dedupeSourceLines(input.lines || []);
  const materialCost = sumCategory(sourceLines, 'material');
  const packagingCost = sumCategory(sourceLines, 'packaging');
  const directLaborCost = sumCategory(sourceLines, 'direct_labor');
  const factoryOverheadCost = sumCategory(sourceLines, 'factory_overhead');
  const depreciationCost = sumCategory(sourceLines, 'depreciation');
  const conversionCost = roundProductionMoney(
    directLaborCost + factoryOverheadCost + depreciationCost,
  );
  const fullManufacturingCost = roundProductionMoney(
    materialCost + packagingCost + conversionCost,
  );
  const sourceQuality: ProductionCostSourceQuality = {
    actualLines: sourceLines.filter((line) => line.status === 'actual').length,
    estimatedLines: sourceLines.filter((line) => line.status === 'estimated').length,
    scheduledLines: sourceLines.filter((line) => line.status === 'scheduled').length,
    missingAmountLines: sourceLines.filter((line) => line.amount <= 0).length,
  };
  const status = sourceQuality.estimatedLines > 0 || sourceQuality.scheduledLines > 0
    ? 'provisional'
    : 'actual';

  return {
    reportId: String(input.reportId || '').trim(),
    version: String(input.version || 'full-manufacturing-v1'),
    revision: Math.max(1, Math.round(finite(input.revision || 1))),
    status,
    quantityProduced,
    goodQuantity,
    normalScrapQuantity: Math.max(0, finite(input.normalScrapQuantity)),
    abnormalScrapQuantity: Math.max(0, finite(input.abnormalScrapQuantity)),
    materialCost,
    packagingCost,
    directLaborCost,
    factoryOverheadCost,
    depreciationCost,
    conversionCost,
    fullManufacturingCost,
    unitManufacturingCost: roundProductionMoney(fullManufacturingCost / goodQuantity),
    sourceQuality,
    sourceLines,
  };
}

export function settleProductionCost(
  provisionalCost: number,
  actualCost: number,
  goodQuantity: number,
): ProductionCostSettlement {
  const provisional = roundProductionMoney(provisionalCost);
  const actual = roundProductionMoney(actualCost);
  const variance = roundProductionMoney(actual - provisional);
  return {
    provisionalCost: provisional,
    actualCost: actual,
    variance,
    varianceDirection: variance > 0
      ? 'under_absorbed'
      : variance < 0
        ? 'over_absorbed'
        : 'balanced',
    unitVariance: goodQuantity > 0 ? roundProductionMoney(variance / goodQuantity) : 0,
  };
}

export type CostPoolDriver =
  | 'machine_hours'
  | 'labor_hours'
  | 'good_units'
  | 'floor_area'
  | 'fixed_percentage'
  | 'kwh';

export type ProductionCostPool = {
  id: string;
  period: string;
  costCenterId: string;
  label: string;
  category: 'electricity' | 'rent' | 'depreciation' | 'indirect_labor' | 'other';
  driver: CostPoolDriver;
  provisionalAmount: number;
  actualAmount?: number;
  expectedDriverQuantity: number;
};

export function calculatePoolRate(pool: ProductionCostPool, useActual = false): number {
  const driverQuantity = Math.max(0, finite(pool.expectedDriverQuantity));
  if (driverQuantity <= 0) return 0;
  const amount = useActual && pool.actualAmount != null
    ? pool.actualAmount
    : pool.provisionalAmount;
  return roundProductionMoney(finite(amount) / driverQuantity);
}

export function absorbPoolCost(
  pool: ProductionCostPool,
  consumedDriverQuantity: number,
  useActual = false,
): number {
  return roundProductionMoney(
    calculatePoolRate(pool, useActual) * Math.max(0, finite(consumedDriverQuantity)),
  );
}

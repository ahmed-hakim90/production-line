export type AssemblableBomLineInput = {
  materialId: string;
  materialName: string;
  materialCode?: string;
  qtyPerUnit: number;
  wastePercent?: number;
  /** Alternate stock keys (e.g. legacy raw_material id) that map to the same component. */
  stockKeys?: string[];
};

export type AssemblableProductInput = {
  productId: string;
  productName: string;
  productCode: string;
  lines: AssemblableBomLineInput[];
};

export type AssemblableComponentDetail = {
  materialId: string;
  materialName: string;
  materialCode: string;
  qtyPerUnit: number;
  wastePercent: number;
  requiredPerUnit: number;
  availableQty: number;
  maxAssemblable: number;
};

export type AssemblableCapacityRow = {
  productId: string;
  productName: string;
  productCode: string;
  maxAssemblable: number;
  componentCount: number;
  bottleneck?: AssemblableComponentDetail;
  components: AssemblableComponentDetail[];
};

export type AssemblableStockRow = {
  itemId: string;
  itemCode?: string;
  availableQty?: number;
  quantity?: number;
};

/**
 * Effective qty needed per finished unit including planned waste.
 * Matches production issue: base * (1 + waste%/100).
 */
export function requiredQtyPerUnit(qtyPerUnit: number, wastePercent = 0): number {
  const base = Number(qtyPerUnit || 0);
  if (!(base > 0)) return 0;
  const waste = Number(wastePercent || 0);
  if (!(waste > 0)) return base;
  return base * (1 + waste / 100);
}

/**
 * Build a lookup of available stock keyed by itemId.
 * Values are summed when the same key appears more than once.
 */
export function buildAvailableByItemId(rows: AssemblableStockRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.itemId || '').trim();
    if (!id) continue;
    const qty = Number(row.availableQty ?? row.quantity ?? 0);
    map.set(id, (map.get(id) || 0) + (Number.isFinite(qty) ? qty : 0));
  }
  return map;
}

/** Lookup by normalized item code (uppercase trimmed). */
export function buildAvailableByItemCode(rows: AssemblableStockRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const code = String(row.itemCode || '').trim().toUpperCase();
    if (!code) continue;
    const qty = Number(row.availableQty ?? row.quantity ?? 0);
    map.set(code, (map.get(code) || 0) + (Number.isFinite(qty) ? qty : 0));
  }
  return map;
}

function availableForLine(
  line: AssemblableBomLineInput,
  availableByItemId: Map<string, number>,
  availableByItemCode?: Map<string, number>,
): number {
  const keys = [line.materialId, ...(line.stockKeys || [])]
    .map((k) => String(k || '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  let best = 0;
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    // Aliases (material id vs legacy raw id) must not be summed — take the highest stock identity.
    best = Math.max(best, Number(availableByItemId.get(key) || 0));
  }
  const code = String(line.materialCode || '').trim().toUpperCase();
  if (code && availableByItemCode) {
    best = Math.max(best, Number(availableByItemCode.get(code) || 0));
  }
  return best;
}

export function lineTouchesStock(
  line: AssemblableBomLineInput,
  stockedIds: Set<string>,
  stockedCodes?: Set<string>,
): boolean {
  const keys = [line.materialId, ...(line.stockKeys || [])];
  if (keys.some((key) => stockedIds.has(String(key || '').trim()))) return true;
  const code = String(line.materialCode || '').trim().toUpperCase();
  return Boolean(code && stockedCodes?.has(code));
}

/**
 * Max complete finished units assemblable from warehouse stock for each product BOM.
 * Bottleneck = component with the lowest floor(available / requiredPerUnit).
 */
export function computeAssemblableCapacity(
  products: AssemblableProductInput[],
  availableByItemId: Map<string, number>,
  availableByItemCode?: Map<string, number>,
): AssemblableCapacityRow[] {
  const rows: AssemblableCapacityRow[] = [];

  for (const product of products) {
    if (!product.lines.length) continue;

    const components: AssemblableComponentDetail[] = [];
    for (const line of product.lines) {
      const qtyPerUnit = Number(line.qtyPerUnit || 0);
      const wastePercent = Number(line.wastePercent || 0);
      const requiredPerUnit = requiredQtyPerUnit(qtyPerUnit, wastePercent);
      if (!(requiredPerUnit > 0)) continue;

      const availableQty = availableForLine(line, availableByItemId, availableByItemCode);
      const maxAssemblable = Math.floor(availableQty / requiredPerUnit);
      components.push({
        materialId: line.materialId,
        materialName: line.materialName,
        materialCode: String(line.materialCode || '').trim(),
        qtyPerUnit,
        wastePercent,
        requiredPerUnit,
        availableQty,
        maxAssemblable: Number.isFinite(maxAssemblable) ? Math.max(0, maxAssemblable) : 0,
      });
    }

    if (!components.length) continue;

    const bottleneck = components.reduce((worst, row) =>
      row.maxAssemblable < worst.maxAssemblable ? row : worst,
    );
    rows.push({
      productId: product.productId,
      productName: product.productName,
      productCode: product.productCode,
      maxAssemblable: bottleneck.maxAssemblable,
      componentCount: components.length,
      bottleneck,
      components: [...components].sort((a, b) => a.maxAssemblable - b.maxAssemblable),
    });
  }

  return rows.sort((a, b) => {
    if (b.maxAssemblable !== a.maxAssemblable) return b.maxAssemblable - a.maxAssemblable;
    return a.productCode.localeCompare(b.productCode, 'ar');
  });
}

/**
 * How much extra stock is needed for a component to cover `targetUnits` finished goods.
 */
export function componentShortageQtyForTarget(
  component: Pick<AssemblableComponentDetail, 'requiredPerUnit' | 'availableQty'>,
  targetUnits: number,
): number {
  const target = Math.max(0, Number(targetUnits || 0));
  const requiredPerUnit = Number(component.requiredPerUnit || 0);
  if (!(target > 0) || !(requiredPerUnit > 0)) return 0;
  const need = requiredPerUnit * target;
  const available = Math.max(0, Number(component.availableQty || 0));
  return Math.max(0, need - available);
}

/** Components that cannot cover `targetUnits` (shortage > 0), worst first. */
export function missingComponentsForTarget(
  row: Pick<AssemblableCapacityRow, 'components'> | null | undefined,
  targetUnits: number,
): Array<AssemblableComponentDetail & { shortageQty: number; requiredForTarget: number }> {
  const target = Math.max(0, Number(targetUnits || 0));
  if (!row?.components?.length || !(target > 0)) return [];
  return row.components
    .map((component) => {
      const requiredForTarget = Number(component.requiredPerUnit || 0) * target;
      const shortageQty = componentShortageQtyForTarget(component, target);
      return { ...component, requiredForTarget, shortageQty };
    })
    .filter((row) => row.shortageQty > 0.000001)
    .sort((a, b) => b.shortageQty - a.shortageQty);
}


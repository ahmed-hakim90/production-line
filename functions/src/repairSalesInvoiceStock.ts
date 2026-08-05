/**
 * Pure helpers for repair sales-invoice stock path (inventory SoT vs legacy ledger).
 * Used by Cloud Functions and unit tests — no Firebase imports.
 */

export type InvoiceStockPath = 'inventory' | 'legacy';

export function resolveInvoiceStockPath(part: {
  materialId?: string | null;
  rawMaterialId?: string | null;
}): InvoiceStockPath {
  const materialId = String(part.materialId || part.rawMaterialId || '').trim();
  return materialId ? 'inventory' : 'legacy';
}

export function stockItemsBalanceDocId(warehouseId: string, materialId: string): string {
  return `${warehouseId}__material__${materialId}`;
}

export type PartQtyDelta = {
  partId: string;
  partName: string;
  /** oldQty - newQty: negative = OUT (sale), positive = IN (cancel/reduce). */
  delta: number;
};

export function buildPartQuantityDeltas(
  oldMap: Map<string, { quantity: number; partName: string }>,
  newMap: Map<string, { quantity: number; partName: string }>,
): PartQtyDelta[] {
  const partIds = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]));
  const rows: PartQtyDelta[] = [];
  for (const partId of partIds) {
    const oldQty = Number(oldMap.get(partId)?.quantity || 0);
    const newQty = Number(newMap.get(partId)?.quantity || 0);
    const delta = oldQty - newQty;
    if (Math.abs(delta) <= 0.00001) continue;
    rows.push({
      partId,
      partName: newMap.get(partId)?.partName || oldMap.get(partId)?.partName || partId,
      delta,
    });
  }
  return rows;
}

export type InventoryMaterialMovement = {
  materialId: string;
  partName: string;
  /** Absolute quantity to move. */
  quantity: number;
  direction: 'OUT' | 'IN';
  partIds: string[];
};

/**
 * Group inventory-path part deltas by materialId.
 * Legacy-path parts are omitted (caller keeps repair_spare_parts_stock-only handling).
 */
export function buildInventoryMaterialMovements(
  deltas: PartQtyDelta[],
  partMetaByPartId: Map<string, { materialId?: string; partName?: string }>,
): InventoryMaterialMovement[] {
  const byMaterial = new Map<string, InventoryMaterialMovement>();
  for (const row of deltas) {
    const meta = partMetaByPartId.get(row.partId);
    const materialId = String(meta?.materialId || '').trim();
    if (!materialId) continue;
    const direction: 'OUT' | 'IN' = row.delta < 0 ? 'OUT' : 'IN';
    const quantity = Math.abs(row.delta);
    const prev = byMaterial.get(materialId);
    if (!prev) {
      byMaterial.set(materialId, {
        materialId,
        partName: row.partName || meta?.partName || materialId,
        quantity,
        direction,
        partIds: [row.partId],
      });
      continue;
    }
    if (prev.direction !== direction) {
      // Net opposing directions on same material — apply signed net.
      const signedPrev = prev.direction === 'OUT' ? -prev.quantity : prev.quantity;
      const signedNext = row.delta;
      const net = signedPrev + signedNext;
      if (Math.abs(net) <= 0.00001) {
        byMaterial.delete(materialId);
      } else {
        prev.direction = net < 0 ? 'OUT' : 'IN';
        prev.quantity = Math.abs(net);
        prev.partIds.push(row.partId);
        prev.partName = row.partName || prev.partName;
      }
      continue;
    }
    prev.quantity += quantity;
    prev.partIds.push(row.partId);
  }
  return Array.from(byMaterial.values());
}

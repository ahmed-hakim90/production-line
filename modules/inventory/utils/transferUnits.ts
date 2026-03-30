import type { InventoryItemType } from '../types';

export type TransferDisplayUnitMode = 'piece' | 'carton';

type TransferLikeLine = {
  itemType: InventoryItemType;
  quantity: number;
  requestQuantity?: number;
  requestUnit?: 'piece' | 'carton' | 'unit';
  unitsPerCarton?: number;
};

export function getTransferDisplay(
  line: TransferLikeLine,
  mode: TransferDisplayUnitMode,
): { quantity: number; unitLabel: string } {
  const qtyPieces = Number(line.quantity || 0);
  const requestQty = Number(line.requestQuantity ?? qtyPieces);
  const unitsPerCarton = Number(line.unitsPerCarton || 0);

  // Raw materials always stay in their basic unit.
  if (line.itemType === 'raw_material') {
    return { quantity: requestQty, unitLabel: 'وحدة' };
  }

  if (mode === 'carton') {
    if (line.requestUnit === 'carton' && requestQty > 0) {
      return { quantity: requestQty, unitLabel: 'كرتونة' };
    }
    if (unitsPerCarton > 0) {
      return { quantity: qtyPieces / unitsPerCarton, unitLabel: 'كرتونة' };
    }
    return { quantity: qtyPieces, unitLabel: 'قطعة' };
  }

  if (line.requestUnit === 'piece' && requestQty > 0) {
    return { quantity: requestQty, unitLabel: 'قطعة' };
  }
  return { quantity: qtyPieces, unitLabel: 'قطعة' };
}


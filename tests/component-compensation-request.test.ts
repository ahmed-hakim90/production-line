import { describe, expect, it } from './assertHarness.ts';
import {
  assertCanRequestCompensation,
  resolveCompensationLocationFromIssuedLine,
} from '../modules/inventory/lib/componentCompensationRequest';
import type { ProductionIssueOrder, ProductionIssueOrderLine } from '../modules/inventory/types';

function line(partial: Partial<ProductionIssueOrderLine> & Pick<ProductionIssueOrderLine, 'itemId'>): ProductionIssueOrderLine {
  return {
    materialId: partial.materialId || partial.itemId,
    itemType: partial.itemType || 'material',
    itemId: partial.itemId,
    itemName: partial.itemName || 'Item',
    itemCode: partial.itemCode || 'IT-1',
    unit: partial.unit || 'pcs',
    qtyPerUnit: partial.qtyPerUnit ?? 1,
    baseRequiredQty: partial.baseRequiredQty ?? 1,
    wastePercent: partial.wastePercent ?? 0,
    plannedWasteQty: partial.plannedWasteQty ?? 0,
    requiredQty: partial.requiredQty ?? 1,
    issuedQty: partial.issuedQty ?? 1,
    availableQty: partial.availableQty ?? 1,
    shortageQty: partial.shortageQty ?? 0,
    allocations: partial.allocations || [],
  };
}

describe('componentCompensationRequest', () => {
  it('resolves location from original allocations', () => {
    const pick = resolveCompensationLocationFromIssuedLine(line({
      itemId: 'm1',
      allocations: [
        { locationId: 'loc-a', locationCode: 'A-1', quantity: 2 },
      ],
    }));
    expect(pick).toEqual({ locationId: 'loc-a', locationCode: 'A-1' });
  });

  it('rejects non-issued orders', () => {
    const order: Pick<ProductionIssueOrder, 'id' | 'status' | 'lines' | 'sourceWarehouseId'> = {
      id: 'o1',
      status: 'requested',
      sourceWarehouseId: 'wh1',
      lines: [line({
        itemId: 'm1',
        allocations: [{ locationId: 'loc-a', locationCode: 'A-1', quantity: 1 }],
      })],
    };
    expect(() => assertCanRequestCompensation({
      order,
      itemType: 'material',
      itemId: 'm1',
      quantity: 1,
    })).toThrow(/تم ترحيله/);
  });

  it('allows compensation on issued order with original location', () => {
    const order: Pick<ProductionIssueOrder, 'id' | 'status' | 'lines' | 'sourceWarehouseId'> = {
      id: 'o1',
      status: 'issued',
      sourceWarehouseId: 'wh1',
      lines: [line({
        itemId: 'm1',
        allocations: [{ locationId: 'loc-a', locationCode: 'A-1', quantity: 1 }],
      })],
    };
    const result = assertCanRequestCompensation({
      order,
      itemType: 'material',
      itemId: 'm1',
      quantity: 0.5,
    });
    expect(result.location.locationId).toBe('loc-a');
    expect(result.line.itemId).toBe('m1');
  });
});

import { describe, expect, it } from './assertHarness.ts';
import type { FirestoreProduct } from '../types.ts';
import {
  toProductData,
  toProductDataWithExisting,
  type ParsedProductRow,
} from '../utils/importProducts.ts';

function baseRow(partial: Partial<ParsedProductRow>): ParsedProductRow {
  return {
    rowIndex: 2,
    action: 'create',
    providedFields: {
      name: true,
      code: true,
      barcode: true,
      model: true,
      isManufactured: true,
      chineseUnitCost: false,
      innerBoxCost: false,
      outerCartonCost: false,
      unitsPerCarton: false,
      sellingPrice: false,
      routingTargetUnitSeconds: false,
    },
    name: 'مكنسة',
    code: 'PRD-SP-01',
    barcode: '622000000099',
    model: 'منزلي',
    isManufactured: true,
    chineseUnitCost: 0,
    innerBoxCost: 0,
    outerCartonCost: 0,
    unitsPerCarton: 0,
    sellingPrice: 0,
    routingTargetUnitSeconds: 0,
    materials: [],
    errors: [],
    ...partial,
  };
}

describe('product import isManufactured payloads', () => {
  it('writes isManufactured=false on create when provided', () => {
    const payload = toProductData(baseRow({ isManufactured: false }));
    expect(payload.isManufactured).toBe(false);
  });

  it('updates isManufactured when column provided', () => {
    const existing: FirestoreProduct = {
      id: 'p1',
      name: 'خلاط',
      model: 'منزلي',
      code: 'SK-999N',
      barcode: '622000000001',
      openingBalance: 0,
      isManufactured: true,
    };
    const payload = toProductDataWithExisting(
      baseRow({
        action: 'update',
        code: 'SK-999N',
        isManufactured: false,
        providedFields: {
          ...baseRow({}).providedFields,
          name: false,
          barcode: false,
          model: false,
          isManufactured: true,
        },
      }),
      existing,
    );
    expect(payload.isManufactured).toBe(false);
    expect(payload.name).toBe('خلاط');
  });

  it('keeps existing flag when column omitted', () => {
    const existing: FirestoreProduct = {
      id: 'p1',
      name: 'خلاط',
      model: 'منزلي',
      code: 'SK-999N',
      barcode: '622000000001',
      openingBalance: 0,
      isManufactured: false,
    };
    const payload = toProductDataWithExisting(
      baseRow({
        action: 'update',
        code: 'SK-999N',
        isManufactured: true,
        providedFields: {
          ...baseRow({}).providedFields,
          name: false,
          barcode: false,
          model: false,
          isManufactured: false,
          sellingPrice: true,
        },
        sellingPrice: 120,
      }),
      existing,
    );
    expect(payload.isManufactured).toBe(false);
    expect(payload.sellingPrice).toBe(120);
  });
});

console.log('products-import-manufactured.test.ts: ok');

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  applySkipExistingProductComponents,
  bomExistKey,
  parseProductComponentsFromBuffer,
  stockExistKeyForLocation,
} from '../utils/importProductComponents';

function makeBuffer(rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'مكونات المنتجات');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

describe('parseProductComponentsFromBuffer', () => {
  const products = [{ id: 'p1', code: 'SK-999N', name: 'خلاط' }];
  const materials = [
    { id: 'm1', code: 'MAT-001', name: 'موتور نحاس', baseUnit: 'piece', isActive: true },
    { id: 'm2', code: 'MAT-002', name: 'هيكل', baseUnit: 'piece', isActive: true },
  ];
  const locations = [
    { id: 'loc1', code: '20-01-0', warehouseId: 'wh1', warehouseName: 'خام', isActive: true },
  ];

  it('parses BOM rows and optional location/balance', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'اسم المادة', 'الكمية المستخدمة', 'تكلفة الوحدة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 'موتور نحاس', 1, 18, '20-01-0', 100],
      ['SK-999N', 'MAT-002', 'هيكل', 2, 7.5, '', ''],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.validCount).toBe(2);
    expect(result.bomGroupCount).toBe(1);
    expect(result.bomGroups[0].items).toHaveLength(2);
    expect(result.stockMovementCount).toBe(1);
    expect(result.stockMovements[0].quantity).toBe(100);
    expect(result.stockMovements[0].locationId).toBe('loc1');
    expect(result.needsFallbackWarehouse).toBe(false);
  });

  it('flags unknown location and requires fallback warehouse when balance has no location', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 1, '99-99-9', 10],
      ['SK-999N', 'MAT-002', 1, '', 5],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.rows[0].errors.some((e) => e.includes('كود اللوكيشن غير موجود'))).toBe(true);
    expect(result.rows[1].errors).toHaveLength(0);
    expect(result.needsFallbackWarehouse).toBe(true);
    expect(result.stockMovementCount).toBe(1);
  });

  it('errors on conflicting balances for same material/location', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 1, '20-01-0', 100],
      ['SK-999N', 'MAT-001', 1, '20-01-0', 50],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.errorCount).toBe(2);
    expect(result.stockMovementCount).toBe(0);
  });

  it('marks new material code+name for auto-create', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'اسم المادة', 'الكمية المستخدمة', 'تكلفة الوحدة'],
      ['SK-999N', 'MAT-NEW', 'خامة جديدة', 1, 12],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.validCount).toBe(1);
    expect(result.newMaterialCount).toBe(1);
    expect(result.rows[0].willCreateMaterial).toBe(true);
    expect(result.materialsToCreate[0]).toMatchObject({
      code: 'MAT-NEW',
      name: 'خامة جديدة',
      purchaseCost: 12,
    });
    expect(result.bomGroups[0].items[0].willCreateMaterial).toBe(true);
  });

  it('rejects unknown material code without name', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة'],
      ['SK-999N', 'MAT-NEW', 1],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('أضف اسم المادة'))).toBe(true);
    expect(result.newMaterialCount).toBe(0);
  });

  it('accepts balance under alternate header رصيد المخزن', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المخزن'],
      ['SK-999N', 'MAT-001', 1, '20-01-0', 75],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.validCount).toBe(1);
    expect(result.rows[0].balanceQty).toBe(75);
    expect(result.stockMovementCount).toBe(1);
    expect(result.stockMovements[0].quantity).toBe(75);
  });

  it('matches product codes even when Excel strips leading zeros', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'اسم المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['50530', 'MAT-001', 'موتور', 1, '20-01-0', 100],
    ]);

    const result = parseProductComponentsFromBuffer(
      data,
      [{ id: 'p2', code: '050530', name: 'منتج' }],
      { manufacturingMaterials: materials, locations },
    );

    expect(result.validCount).toBe(1);
    expect(result.rows[0].productId).toBe('p2');
    expect(result.stockMovementCount).toBe(1);
  });

  it('skips existing BOM and stock when applySkipExisting is used', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'اسم المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 'موتور نحاس', 1, '20-01-0', 100],
      ['SK-999N', 'MAT-002', 'هيكل', 2, '20-01-0', 50],
    ]);

    const parsed = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    const filtered = applySkipExistingProductComponents(parsed, {
      bomKeys: new Set([bomExistKey('p1', 'm1')]),
      stockKeys: new Set([stockExistKeyForLocation('m1', 'loc1')]),
    });

    expect(filtered.rows[0].skipBom).toBe(true);
    expect(filtered.rows[0].skipStock).toBe(true);
    expect(filtered.rows[1].skipBom).toBeFalsy();
    expect(filtered.rows[1].skipStock).toBeFalsy();
    expect(filtered.skippedBomCount).toBe(1);
    expect(filtered.skippedStockCount).toBe(1);
    expect(filtered.bomGroupCount).toBe(1);
    expect(filtered.bomGroups[0].items).toHaveLength(1);
    expect(filtered.bomGroups[0].items[0].materialId).toBe('m2');
    expect(filtered.stockMovementCount).toBe(1);
    expect(filtered.stockMovements[0].materialId).toBe('m2');
  });
});

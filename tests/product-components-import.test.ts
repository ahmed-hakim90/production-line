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
    expect(result.rows[0].balanceProvided).toBe(true);
    expect(result.rows[1].balanceProvided).toBe(false);
    expect(result.needsFallbackWarehouse).toBe(false);
  });

  it('allows balance of zero as absolute target', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 1, '20-01-0', 0],
    ]);

    const result = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    expect(result.validCount).toBe(1);
    expect(result.rows[0].balanceProvided).toBe(true);
    expect(result.rows[0].balanceQty).toBe(0);
    expect(result.stockMovementCount).toBe(1);
    expect(result.stockMovements[0].quantity).toBe(0);
    expect(result.stockMovements[0].deltaQuantity).toBe(0);
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

  it('upserts existing BOM and plans absolute stock adjustment', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'اسم المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 'موتور نحاس', 3, '20-01-0', 80],
      ['SK-999N', 'MAT-002', 'هيكل', 2, '20-01-0', 50],
    ]);

    const parsed = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    const filtered = applySkipExistingProductComponents(parsed, {
      bomKeys: new Set([bomExistKey('p1', 'm1')]),
      stockQtyByKey: new Map([[stockExistKeyForLocation('m1', 'loc1'), 100]]),
    });

    // Existing BOM is updated, not skipped
    expect(filtered.rows[0].skipBom).toBeFalsy();
    expect(filtered.rows[0].skipNotes?.some((n) => n.includes('تحديث'))).toBe(true);
    expect(filtered.bomGroupCount).toBe(1);
    expect(filtered.bomGroups[0].items).toHaveLength(2);
    expect(filtered.bomGroups[0].items.find((i) => i.materialId === 'm1')?.quantityUsed).toBe(3);

    // Absolute target 80 from current 100 → delta -20
    expect(filtered.rows[0].skipStock).toBeFalsy();
    const adj = filtered.stockMovements.find((m) => m.materialId === 'm1');
    expect(adj).toBeTruthy();
    expect(adj!.quantity).toBe(80);
    expect(adj!.currentQuantity).toBe(100);
    expect(adj!.deltaQuantity).toBe(-20);

    // New stock for m2 (current 0 → 50)
    const m2 = filtered.stockMovements.find((m) => m.materialId === 'm2');
    expect(m2?.deltaQuantity).toBe(50);
    expect(filtered.stockMovementCount).toBe(2);
  });

  it('skips stock adjustment when target equals current', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 1, '20-01-0', 100],
    ]);

    const parsed = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    const filtered = applySkipExistingProductComponents(parsed, {
      bomKeys: new Set(),
      stockQtyByKey: new Map([[stockExistKeyForLocation('m1', 'loc1'), 100]]),
    });

    expect(filtered.rows[0].skipStock).toBe(true);
    expect(filtered.stockMovementCount).toBe(0);
    expect(filtered.skippedStockCount).toBe(1);
    expect(filtered.bomGroupCount).toBe(1);
  });

  it('plans negative adjustment when target is zero', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة', 'كود اللوكيشن', 'رصيد المكون'],
      ['SK-999N', 'MAT-001', 1, '20-01-0', 0],
    ]);

    const parsed = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    const filtered = applySkipExistingProductComponents(parsed, {
      bomKeys: new Set(),
      stockQtyByKey: new Map([[stockExistKeyForLocation('m1', 'loc1'), 40]]),
    });

    expect(filtered.stockMovementCount).toBe(1);
    expect(filtered.stockMovements[0].quantity).toBe(0);
    expect(filtered.stockMovements[0].deltaQuantity).toBe(-40);
  });

  it('ignores stock when balance column is empty', () => {
    const data = makeBuffer([
      ['كود المنتج', 'كود المادة', 'الكمية المستخدمة'],
      ['SK-999N', 'MAT-001', 2],
    ]);

    const parsed = parseProductComponentsFromBuffer(data, products, {
      manufacturingMaterials: materials,
      locations,
    });

    const filtered = applySkipExistingProductComponents(parsed, {
      bomKeys: new Set([bomExistKey('p1', 'm1')]),
      stockQtyByKey: new Map([[stockExistKeyForLocation('m1', 'loc1'), 100]]),
    });

    expect(filtered.rows[0].balanceProvided).toBe(false);
    expect(filtered.stockMovementCount).toBe(0);
    expect(filtered.bomGroups[0].items[0].quantityUsed).toBe(2);
  });
});

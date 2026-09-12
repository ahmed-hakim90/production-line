import { describe, expect, it } from './assertHarness.ts';
import { buildMaterialCatalogRows, materialDataHealth } from '../modules/manufacturing/lib/materialCatalog.ts';
import type { Material } from '../modules/manufacturing/types.ts';

const material = (overrides: Partial<Material> = {}): Material => ({
  code: 'MAT-001',
  name: 'مادة اختبار',
  type: 'raw_material',
  categoryId: 'category-1',
  baseUnit: 'piece',
  purchaseCost: 12,
  barcode: '123456',
  minStock: 5,
  isActive: true,
  createdAt: '2026-01-01',
  ...overrides,
});

describe('materialDataHealth', () => {
  it('marks a complete purchased material', () => {
    expect(materialDataHealth(material())).toEqual(['complete']);
  });

  it('reports every actionable master-data gap', () => {
    expect(materialDataHealth(material({ categoryId: null, purchaseCost: 0, barcode: '', minStock: 0 })))
      .toEqual(['missing_category', 'missing_cost', 'missing_barcode', 'missing_min_stock']);
  });

  it('requires BOM only for internally manufactured materials when BOM state is known', () => {
    expect(materialDataHealth(material({ isManufacturedInternally: true }), { bomItemCount: 0 }).includes('missing_bom'))
      .toBe(true);
    expect(materialDataHealth(material({ isManufacturedInternally: false }), { bomItemCount: 0 }).includes('missing_bom'))
      .toBe(false);
  });
});

describe('buildMaterialCatalogRows', () => {
  it('aggregates balances without copying them into material data', () => {
    const [row] = buildMaterialCatalogRows(
      [material({ id: 'm1' })],
      [
        { warehouseId: 'w1', itemType: 'material', itemId: 'm1', itemName: 'مادة اختبار', itemCode: 'MAT-001', quantity: 7, availableQty: 5, minStock: 0, updatedAt: '2026-01-01' },
        { warehouseId: 'w2', itemType: 'material', itemId: 'm1', itemName: 'مادة اختبار', itemCode: 'MAT-001', quantity: 3, minStock: 0, updatedAt: '2026-01-01' },
      ],
    );
    expect(row.totalOnHand).toBe(10);
    expect(row.totalAvailable).toBe(8);
    expect(row.warehouseCount).toBe(2);
  });
});

console.log('material-catalog-health.test.ts: ok');

import { describe, expect, it } from 'vitest';
import {
  materialsToCatalogComponents,
  resolveCatalogComponents,
} from '../modules/catalog/lib/productComponents';
import {
  collectJobProductIds,
  sparePartMatchesCatalogComponents,
} from '../modules/repair/utils/sparePartCatalogMatch';
import type { Material } from '../modules/manufacturing/types';
import type { RawMaterial } from '../modules/inventory/types';

describe('catalog productComponents', () => {
  const materials: Material[] = [
    {
      id: 'mat-1',
      code: 'M-1',
      name: 'محرك',
      type: 'raw_material',
      baseUnit: 'piece',
      purchaseCost: 120,
      categoryName: 'كهرباء',
      isActive: true,
      createdAt: '2026-01-01',
      legacyRawMaterialId: 'raw-legacy-1',
    },
  ];

  const rawMaterials: RawMaterial[] = [
    {
      id: 'raw-2',
      name: 'سلك',
      code: 'R-2',
      unit: 'meter',
      minStock: 0,
      isActive: true,
      createdAt: '2026-01-01',
      categoryName: 'كهرباء',
    },
  ];

  it('resolves manufacturing materials from BOM by id and legacy raw link', () => {
    const rows = resolveCatalogComponents({
      bomItems: [
        { itemId: 'mat-1', itemType: 'material', itemName: 'محرك', qtyPerUnit: 2, unit: 'piece' },
        { itemId: 'raw-legacy-1', itemType: 'material', itemName: 'محرك قديم', qtyPerUnit: 1, unit: 'piece' },
      ],
      materials,
      rawMaterials,
      sourceProductId: 'prod-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].materialId).toBe('mat-1');
    expect(rows[0].materialName).toBe('محرك');
    expect(rows[0].unitLabel).toBe('قطعة');
    expect(rows[0].qtyPerUnit).toBe(2);
    expect(rows[0].sourceProductId).toBe('prod-1');
  });

  it('falls back to legacy raw materials when not migrated', () => {
    const rows = resolveCatalogComponents({
      bomItems: [
        { itemId: 'raw-2', itemType: 'material', itemName: 'سلك نحاسي', qtyPerUnit: 2, unit: 'meter' },
      ],
      materials: [],
      rawMaterials,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].materialId).toBe('raw-2');
    expect(rows[0].itemType).toBe('legacy_raw');
    expect(rows[0].unitLabel).toBe('متر');
  });

  it('maps all active materials as catalog components', () => {
    const rows = materialsToCatalogComponents([
      ...materials,
      {
        id: 'mat-inactive',
        code: 'X',
        name: 'معطل',
        type: 'consumable',
        baseUnit: 'piece',
        isActive: false,
        createdAt: '2026-01-01',
      },
    ]);
    expect(rows.map((r) => r.materialId)).toEqual(['mat-1']);
  });
  it('maps catalog components to ProductMaterial cost shape', async () => {
    const { catalogComponentsToProductMaterials } = await import(
      '../modules/catalog/lib/productComponents'
    );
    const rows = catalogComponentsToProductMaterials('prod-1', [
      {
        materialId: 'mat-1',
        materialName: 'محرك',
        unitLabel: 'قطعة',
        baseUnit: 'piece',
        purchaseCost: 50,
        qtyPerUnit: 2,
        itemType: 'material',
      },
    ]);
    expect(rows).toEqual([
      {
        id: 'catalog-prod-1-mat-1',
        productId: 'prod-1',
        materialId: 'mat-1',
        materialName: 'محرك',
        quantityUsed: 2,
        unitCost: 50,
      },
    ]);
  });
});

describe('sparePartCatalogMatch', () => {
  const components = [
    {
      materialId: 'mat-1',
      materialName: 'محرك',
      unitLabel: 'قطعة',
      baseUnit: 'piece' as const,
      itemType: 'material' as const,
    },
  ];

  it('matches by materialId first', () => {
    expect(
      sparePartMatchesCatalogComponents(
        { id: 'sp-1', name: 'شيء آخر', materialId: 'mat-1' },
        components,
      ),
    ).toBe(true);
  });

  it('matches legacy name when materialId missing', () => {
    expect(
      sparePartMatchesCatalogComponents({ id: 'sp-2', name: 'محرك' }, components),
    ).toBe(true);
  });

  it('does not match spare part id to material id (old bug)', () => {
    expect(
      sparePartMatchesCatalogComponents({ id: 'mat-1', name: 'غير مطابق' }, components),
    ).toBe(false);
  });

  it('collects unique product ids from job + line items', () => {
    expect(
      collectJobProductIds({
        productId: 'p1',
        jobProducts: [{ productId: 'p1' }, { productId: 'p2' }, { productId: '' }],
      }),
    ).toEqual(['p1', 'p2']);
  });
});

describe('sparePartCatalogBackfill', () => {
  it('plans unique name matches and skips already linked / ambiguous', async () => {
    const { planSparePartCatalogLinks } = await import(
      '../modules/repair/utils/sparePartCatalogBackfill'
    );
    const plans = planSparePartCatalogLinks(
      [
        { id: 'sp-1', name: 'محرك' },
        { id: 'sp-2', name: 'محرك', materialId: 'already' },
        { id: 'sp-3', name: 'سلك' },
        { id: 'sp-4', name: 'غير موجود' },
      ],
      [
        {
          materialId: 'mat-1',
          materialName: 'محرك',
          unitLabel: 'قطعة',
          baseUnit: 'piece',
          itemType: 'material',
        },
        {
          materialId: 'mat-2a',
          materialName: 'سلك',
          unitLabel: 'متر',
          baseUnit: 'meter',
          itemType: 'material',
        },
        {
          materialId: 'mat-2b',
          materialName: 'سلك',
          unitLabel: 'متر',
          baseUnit: 'meter',
          itemType: 'material',
        },
      ],
    );
    expect(plans).toEqual([
      {
        partId: 'sp-1',
        partName: 'محرك',
        materialId: 'mat-1',
        materialName: 'محرك',
        materialCode: undefined,
        itemType: 'material',
      },
    ]);
  });
});

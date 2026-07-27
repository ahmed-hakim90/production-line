import assert from 'node:assert/strict';
import {
  buildComponentCatalogOptions,
  getComponentAvailableQty,
  resolveComponentStockIdentity,
} from '../modules/inventory/lib/componentCatalogOptions.ts';
import type { Material } from '../modules/manufacturing/types.ts';
import type { RawMaterial, StockItemBalance } from '../modules/inventory/types.ts';

const materials: Material[] = [
  {
    id: 'mat-1',
    tenantId: 't',
    name: 'قاعدة جريل',
    code: 'GR-BASE',
    type: 'raw_material',
    baseUnit: 'piece',
    minStock: 0,
    isActive: true,
    createdAt: '',
    legacyRawMaterialId: 'raw-1',
  },
  {
    id: 'mat-2',
    tenantId: 't',
    name: 'كيس بابلز',
    code: 'BAG-1',
    type: 'packaging',
    baseUnit: 'piece',
    minStock: 0,
    isActive: true,
    createdAt: '',
  },
];

const rawMaterials: RawMaterial[] = [
  {
    id: 'raw-1',
    name: 'قاعدة جريل قديم',
    code: 'GR-BASE',
    unit: 'piece',
    minStock: 0,
    isActive: true,
    createdAt: '',
  },
  {
    id: 'raw-only',
    name: 'مكون قديم فقط',
    code: 'LEGACY-ONLY',
    unit: 'piece',
    minStock: 0,
    isActive: true,
    createdAt: '',
  },
];

{
  const opts = buildComponentCatalogOptions(materials, rawMaterials);
  assert.equal(opts.length, 3);
  assert.ok(opts.some((o) => o.id === 'mat-1' && o.stockItemType === 'material'));
  assert.ok(opts.some((o) => o.id === 'mat-2' && o.stockItemType === 'material'));
  assert.ok(opts.some((o) => o.id === 'raw-only' && o.stockItemType === 'raw_material'));
  assert.ok(!opts.some((o) => o.id === 'raw-1'));
}

{
  const opts = buildComponentCatalogOptions(materials, rawMaterials);
  const grill = opts.find((o) => o.id === 'mat-1')!;
  const balances: StockItemBalance[] = [
    {
      warehouseId: 'wh',
      itemType: 'raw_material',
      itemId: 'raw-1',
      itemName: 'x',
      itemCode: 'GR-BASE',
      quantity: 12,
      minStock: 0,
      updatedAt: '',
    },
    {
      warehouseId: 'wh',
      itemType: 'material',
      itemId: 'mat-1',
      itemName: 'x',
      itemCode: 'GR-BASE',
      quantity: 3,
      minStock: 0,
      updatedAt: '',
    },
  ];
  assert.equal(getComponentAvailableQty(balances, 'wh', grill), 15);

  const outIdentity = resolveComponentStockIdentity(grill, balances.slice(0, 1), 'wh', 'OUT');
  assert.equal(outIdentity.itemType, 'raw_material');
  assert.equal(outIdentity.itemId, 'raw-1');
  assert.equal(outIdentity.available, 12);

  const inIdentity = resolveComponentStockIdentity(grill, [], 'wh', 'IN');
  assert.equal(inIdentity.itemType, 'material');
  assert.equal(inIdentity.itemId, 'mat-1');
}

console.log('component-catalog-options: all assertions passed');

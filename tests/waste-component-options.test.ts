import assert from 'node:assert/strict';
import { resolveWasteComponentOptions } from '../modules/production/utils/wasteComponentOptions.ts';
import type { RawMaterial } from '../modules/inventory/types.ts';
import type { BomItem, Material } from '../modules/manufacturing/types.ts';

const materials: Material[] = [
  {
    id: 'mat-1',
    code: 'M-1',
    name: 'موتور',
    type: 'raw_material',
    baseUnit: 'piece',
    legacyRawMaterialId: 'raw-1',
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'mat-2',
    code: 'M-2',
    name: 'سلك',
    type: 'raw_material',
    baseUnit: 'piece',
    legacyRawMaterialId: 'raw-2',
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'mat-inactive',
    code: 'M-3',
    name: 'مكون معطل',
    type: 'raw_material',
    baseUnit: 'piece',
    legacyRawMaterialId: 'raw-3',
    isActive: false,
    createdAt: '2026-01-01',
  },
  {
    id: 'mat-unlinked',
    code: 'M-4',
    name: 'بدون ربط',
    type: 'raw_material',
    baseUnit: 'piece',
    isActive: true,
    createdAt: '2026-01-01',
  },
];

const rawMaterials: RawMaterial[] = [
  { id: 'raw-1', name: 'موتور خام', code: 'R-1', unit: 'piece', minStock: 0, isActive: true, createdAt: '2026-01-01' },
  { id: 'raw-2', name: 'سلك خام', code: 'R-2', unit: 'piece', minStock: 0, isActive: true, createdAt: '2026-01-01' },
  { id: 'raw-3', name: 'راو معطل', code: 'R-3', unit: 'piece', minStock: 0, isActive: true, createdAt: '2026-01-01' },
  { id: 'raw-direct', name: 'ستيكر', code: 'R-D', unit: 'piece', minStock: 0, isActive: true, createdAt: '2026-01-01' },
];

const bomItems: BomItem[] = [
  { id: 'b1', tenantId: 't', bomId: 'bom-1', itemId: 'mat-1', itemType: 'material', itemName: 'موتور', qtyPerUnit: 1, unit: 'piece', sortOrder: 0 },
  { id: 'b2', tenantId: 't', bomId: 'bom-1', itemId: 'mat-2', itemType: 'material', itemName: 'سلك', qtyPerUnit: 2, unit: 'piece', sortOrder: 1 },
  // Legacy-style item that already references a raw material id directly.
  { id: 'b3', tenantId: 't', bomId: 'bom-1', itemId: 'raw-direct', itemType: 'material', itemName: 'ستيكر', qtyPerUnit: 4, unit: 'piece', sortOrder: 2 },
  // Inactive material — must be dropped.
  { id: 'b4', tenantId: 't', bomId: 'bom-1', itemId: 'mat-inactive', itemType: 'material', itemName: 'مكون معطل', qtyPerUnit: 1, unit: 'piece', sortOrder: 3 },
  // Material with no raw link — still shown (stock resolves item type at save time).
  { id: 'b5', tenantId: 't', bomId: 'bom-1', itemId: 'mat-unlinked', itemType: 'material', itemName: 'بدون ربط', qtyPerUnit: 1, unit: 'piece', sortOrder: 4 },
  // Duplicate manufacturing material — deduped.
  { id: 'b6', tenantId: 't', bomId: 'bom-1', itemId: 'mat-1', itemType: 'material', itemName: 'موتور مكرر', qtyPerUnit: 9, unit: 'piece', sortOrder: 5 },
];

const options = resolveWasteComponentOptions({ bomItems, materials, rawMaterials });

assert.deepEqual(
  options.map((o) => o.materialId),
  ['mat-1', 'mat-2', 'raw-direct', 'mat-unlinked'],
  'keeps manufacturing material ids (even unlinked), legacy raw ids, drops inactive, dedupes',
);

assert.equal(options[0].materialName, 'موتور');
assert.equal(options[0].quantityUsed, 1);
assert.equal(options[2].materialName, 'ستيكر');
assert.equal(options[2].quantityUsed, 4);
assert.equal(options[3].materialName, 'بدون ربط');

assert.deepEqual(resolveWasteComponentOptions({ bomItems: [], materials, rawMaterials }), []);

console.log('waste-component-options.test.ts: ok');

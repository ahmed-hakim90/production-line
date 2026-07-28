import assert from 'node:assert/strict';
import { resolveSuppliesWarehouseId } from '../modules/inventory/lib/resolveSuppliesWarehouse.ts';
import type { Warehouse } from '../modules/inventory/types.ts';

function testPrefersDecomposedThenRaw() {
  const warehouses: Warehouse[] = [
    { id: 'by-name', name: 'مخزن مستلزمات', code: 'S1', isActive: true, createdAt: '2026-01-01' },
  ];
  assert.equal(
    resolveSuppliesWarehouseId({ rawMaterialWarehouseId: 'raw-1', decomposedWarehouseId: 'dec-1' }, warehouses),
    'dec-1',
  );
  assert.equal(
    resolveSuppliesWarehouseId({ rawMaterialWarehouseId: 'raw-1', decomposedWarehouseId: '' }, warehouses),
    'raw-1',
  );
}

function testFallsBackToRoleThenName() {
  const withRole: Warehouse[] = [
    { id: 'general', name: 'عام', code: 'G', isActive: true, warehouseRole: 'general', createdAt: '2026-01-01' },
    { id: 'raw-role', name: 'خامات', code: 'R', isActive: true, warehouseRole: 'raw_material', createdAt: '2026-01-01' },
    { id: 'dec-role', name: 'مكونات', code: 'D', isActive: true, warehouseRole: 'decomposed', createdAt: '2026-01-01' },
  ];
  assert.equal(
    resolveSuppliesWarehouseId({ rawMaterialWarehouseId: '', decomposedWarehouseId: '' }, withRole),
    'dec-role',
  );

  const byName: Warehouse[] = [
    { id: 'other', name: 'مخزن تام', code: 'F', isActive: true, createdAt: '2026-01-01' },
    { id: 'supplies', name: 'مخزن المستلزمات', code: 'S', isActive: true, createdAt: '2026-01-01' },
  ];
  assert.equal(
    resolveSuppliesWarehouseId({ rawMaterialWarehouseId: '', decomposedWarehouseId: '' }, byName),
    'supplies',
  );
}

testPrefersDecomposedThenRaw();
testFallsBackToRoleThenName();
console.log('resolve-supplies-warehouse tests passed');

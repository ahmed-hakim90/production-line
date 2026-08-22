import assert from 'node:assert/strict';
import { resolveProductionFloorWarehouseForIssue } from '../modules/inventory/lib/resolveProductionFloorWarehouse.ts';
import type { Warehouse } from '../modules/inventory/types.ts';

const floor: Warehouse = {
  id: 'floor-1',
  name: 'صالة 1',
  code: 'F1',
  isActive: true,
  warehouseRole: 'production_floor',
  createdAt: '2026-01-01',
};

function testUsesLoadedWarehouseWhenReadable() {
  const result = resolveProductionFloorWarehouseForIssue({
    routingFloorWarehouseId: 'floor-1',
    decomposedWarehouseId: 'dec-1',
    loadedWarehouse: floor,
  });
  assert.equal(result.id, 'floor-1');
  assert.equal(result.name, 'صالة 1');
}

function testBoundOperatorWithoutCatalogRowStillUsesRoutingId() {
  const result = resolveProductionFloorWarehouseForIssue({
    routingFloorWarehouseId: 'floor-1',
    decomposedWarehouseId: 'dec-1',
    loadedWarehouse: null,
  });
  assert.equal(result.id, 'floor-1');
  assert.equal(result.name, 'صالة الإنتاج');
}

function testRejectsInactiveWhenReadable() {
  assert.throws(
    () => resolveProductionFloorWarehouseForIssue({
      routingFloorWarehouseId: 'floor-1',
      decomposedWarehouseId: 'dec-1',
      loadedWarehouse: { ...floor, isActive: false },
    }),
    /غير نشط/,
  );
}

function testRejectsMissingRoutingAndSameAsDecomposed() {
  assert.throws(
    () => resolveProductionFloorWarehouseForIssue({
      routingFloorWarehouseId: '',
      decomposedWarehouseId: 'dec-1',
      loadedWarehouse: null,
    }),
    /توجيه المخازن/,
  );
  assert.throws(
    () => resolveProductionFloorWarehouseForIssue({
      routingFloorWarehouseId: 'same',
      decomposedWarehouseId: 'same',
      loadedWarehouse: null,
    }),
    /يختلف عن مخزن المفكك/,
  );
}

testUsesLoadedWarehouseWhenReadable();
testBoundOperatorWithoutCatalogRowStillUsesRoutingId();
testRejectsInactiveWhenReadable();
testRejectsMissingRoutingAndSameAsDecomposed();
console.log('resolve-production-floor-warehouse.test.ts: OK');

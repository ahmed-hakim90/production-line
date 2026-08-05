import assert from 'node:assert/strict';
import {
  buildRepairCenterWarehouseNavSources,
  isMaintenanceCenterWarehouseRole,
  repairCenterWarehouseMenuPath,
  resolveRepairCenterWarehouseIds,
} from '../modules/repair/lib/repairCenterWarehouseMenu.ts';

assert.equal(isMaintenanceCenterWarehouseRole('maintenance_center'), true);
assert.equal(isMaintenanceCenterWarehouseRole('spare_parts_central'), false);

const branches = [
  { id: 'b-alex', name: 'اسكندرية', warehouseId: 'w-alex' },
  { id: 'b-ism', name: 'اسماعيليه', warehouseId: 'w-ism' },
  { id: 'b-tanta', name: 'طنطا', warehouseId: 'w-tanta' },
];

assert.deepEqual(
  resolveRepairCenterWarehouseIds({
    branches,
    canViewAllBranches: false,
    userBranchIds: ['b-ism'],
  }),
  ['w-ism'],
);

assert.deepEqual(
  new Set(
    resolveRepairCenterWarehouseIds({
      branches,
      canViewAllBranches: true,
      userBranchIds: [],
    }),
  ),
  new Set(['w-alex', 'w-ism', 'w-tanta']),
);

assert.deepEqual(
  resolveRepairCenterWarehouseIds({
    branches,
    canViewAllBranches: false,
    userBranchIds: [],
    inventoryWarehouseId: 'w-ism',
  }),
  ['w-ism'],
);

const warehouses = [
  { id: 'w-alex', name: 'مخزن فرع اسكندريه', warehouseRole: 'maintenance_center' as const },
  { id: 'w-ism', name: 'مخزن فرع اسماعيليه', warehouseRole: 'maintenance_center' as const },
  { id: 'w-central', name: 'قطع غيار مركزي', warehouseRole: 'spare_parts_central' as const },
  { id: 'w-tanta', name: 'مخزن فرع طنطا', warehouseRole: 'general' as const },
] as Array<{ id: string; name: string; warehouseRole: 'maintenance_center' | 'spare_parts_central' | 'general' }>;

const scoped = buildRepairCenterWarehouseNavSources({
  warehouses,
  branches,
  allowedWarehouseIds: ['w-ism', 'w-tanta', 'w-central'],
});

assert.equal(scoped.length, 1);
assert.equal(scoped[0]?.warehouseId, 'w-ism');
assert.equal(scoped[0]?.branchName, 'اسماعيليه');
assert.equal(repairCenterWarehouseMenuPath('w-ism'), '/repair/warehouses/w-ism');

console.log('repair-center-warehouse-menu tests passed');

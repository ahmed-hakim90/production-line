import { describe, expect, it } from './assertHarness.ts';
import {
  replenishmentScopeFieldForBoundRole,
  warehousesForBoundInventoryOperator,
} from '../modules/inventory/lib/boundWarehouseCatalog.ts';

describe('warehousesForBoundInventoryOperator', () => {
  it('returns only the bound warehouse when not central', () => {
    const bound = { id: 'c1', warehouseRole: 'maintenance_center', name: 'مركز أ' };
    expect(warehousesForBoundInventoryOperator(bound, [])).toEqual([bound]);
  });

  it('includes maintenance centers for spare_parts_central bind', () => {
    const bound = { id: 'central', warehouseRole: 'spare_parts_central', name: 'مركزي' };
    const centers = [
      { id: 'a', warehouseRole: 'maintenance_center', name: 'مركز ب' },
      { id: 'b', warehouseRole: 'maintenance_center', name: 'مركز أ' },
      { id: 'g', warehouseRole: 'general', name: 'عام' },
    ];
    const result = warehousesForBoundInventoryOperator(bound, centers);
    expect(result.map((w) => w.id)).toEqual(['central', 'b', 'a']);
  });
});

describe('replenishmentScopeFieldForBoundRole', () => {
  it('uses fromWarehouseId for central and toWarehouseId for centers', () => {
    expect(replenishmentScopeFieldForBoundRole('spare_parts_central')).toBe('fromWarehouseId');
    expect(replenishmentScopeFieldForBoundRole('maintenance_center')).toBe('toWarehouseId');
  });
});

console.log('bound-warehouse-catalog.test.ts: ok');

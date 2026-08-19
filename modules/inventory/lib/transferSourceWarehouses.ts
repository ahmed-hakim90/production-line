import type { Warehouse } from '../types';
import { filterManualTransferWarehouses } from './manualTransferWarehouses';

/**
 * Source warehouse picker for stock movements.
 * Finished-good transfers must list factory warehouses even when the user is
 * bound to a spare-parts warehouse (otherwise the select shows «لا نتائج»).
 */
export function resolveTransferSourceWarehouses<T extends Pick<Warehouse, 'warehouseRole'>>(input: {
  warehouses: T[];
  filterWarehouses: (rows: T[]) => T[];
  scoped: boolean;
  isMaterialsWarehouseRole: boolean;
  itemType: 'finished_good' | 'raw_material';
  sparePartsContext: boolean;
}): T[] {
  const sparePartsOnly = input.sparePartsContext && input.itemType === 'raw_material';
  const allEligible = filterManualTransferWarehouses(input.warehouses, { sparePartsOnly });
  if (input.itemType === 'finished_good') return allEligible;
  if (!input.scoped) return allEligible;
  const scoped = filterManualTransferWarehouses(input.filterWarehouses(input.warehouses), {
    sparePartsOnly,
  });
  if (input.isMaterialsWarehouseRole) return scoped;
  return scoped.length > 0 ? scoped : allEligible;
}

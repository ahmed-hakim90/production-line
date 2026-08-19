import assert from 'node:assert/strict';
import { resolveTransferSourceWarehouses } from '../modules/inventory/lib/transferSourceWarehouses.ts';

const warehouses = [
  { id: 'sp', name: 'قطع', warehouseRole: 'spare_parts_central' },
  { id: 'stg', name: 'بانتظار', warehouseRole: 'finished_staging' },
  { id: 'fin', name: 'تام', warehouseRole: 'final_product' },
] as const;

const scopedToSpare = (rows: typeof warehouses) => rows.filter((w) => w.id === 'sp');

const fgSources = resolveTransferSourceWarehouses({
  warehouses,
  filterWarehouses: scopedToSpare,
  scoped: true,
  isMaterialsWarehouseRole: false,
  itemType: 'finished_good',
  sparePartsContext: true,
});
assert.deepEqual(fgSources.map((w) => w.id).sort(), ['fin', 'sp', 'stg']);

const rawSources = resolveTransferSourceWarehouses({
  warehouses,
  filterWarehouses: scopedToSpare,
  scoped: true,
  isMaterialsWarehouseRole: false,
  itemType: 'raw_material',
  sparePartsContext: true,
});
assert.deepEqual(rawSources.map((w) => w.id), ['sp']);

console.log('transfer-source-warehouses.test.ts: ok');

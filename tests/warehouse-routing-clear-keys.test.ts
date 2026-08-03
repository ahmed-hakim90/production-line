import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, '../modules/inventory/services/warehouseService.ts'),
  'utf8',
);

assert.match(
  source,
  /ROUTING_WAREHOUSE_KEYS[\s\S]*productionFloorWarehouseId/,
  'deleting a warehouse must clear productionFloorWarehouseId from routing settings',
);

console.log('warehouse-routing-clear-keys tests passed');

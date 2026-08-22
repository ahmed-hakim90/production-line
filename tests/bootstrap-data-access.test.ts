import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBootstrapDataAccess } from '../lib/bootstrapDataAccess.ts';

const from = (permissions: string[]) =>
  resolveBootstrapDataAccess((permission) => permissions.includes(permission));

assert.deepEqual(
  from(['reports.createForAnySupervisor', 'reports.view', 'workOrders.view']),
  { costCenters: false, costDetails: false },
  'hall supervisors must not request forbidden financial bootstrap collections',
);

assert.deepEqual(
  from(['costs.view']),
  { costCenters: true, costDetails: true },
  'cost viewers load all production cost bootstrap data',
);

assert.deepEqual(
  from(['accounting.view']),
  { costCenters: true, costDetails: false },
  'accounting viewers can load cost centers without production cost detail datasets',
);

const store = readFileSync('store/useAppStore.ts', 'utf8');
assert.match(store, /resolveBootstrapDataAccess/);
assert.match(store, /bootstrapAccess\.costCenters \? costCenterService\.getAll\(\) : Promise\.resolve\(\[\]\)/);
assert.match(store, /bootstrapAccess\.costDetails \? costCenterValueService\.getAll\(\) : Promise\.resolve\(\[\]\)/);
assert.match(store, /bootstrapAccess\.costDetails \? costAllocationService\.getAll\(\) : Promise\.resolve\(\[\]\)/);

console.log('bootstrap-data-access.test.ts passed');

import assert from 'node:assert/strict';
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

console.log('bootstrap-data-access.test.ts passed');

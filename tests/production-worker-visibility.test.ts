import assert from 'node:assert/strict';
import { shouldShowProductionWorkerForSupervisor } from '../modules/production/utils/productionWorkerVisibility.ts';

const supervisorLines = new Set(['line-1', 'line-2']);

assert.equal(
  shouldShowProductionWorkerForSupervisor(['line-1'], true, supervisorLines),
  true,
);
assert.equal(
  shouldShowProductionWorkerForSupervisor(['line-3'], true, supervisorLines),
  false,
);
assert.equal(
  shouldShowProductionWorkerForSupervisor([], true, supervisorLines),
  false,
);
assert.equal(
  shouldShowProductionWorkerForSupervisor(['line-3'], false, supervisorLines),
  true,
);

console.log('production-worker-visibility.test.ts: ok');

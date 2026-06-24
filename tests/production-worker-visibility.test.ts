import assert from 'node:assert/strict';
import {
  matchesProductionWorkerLineFilter,
  shouldShowProductionWorkerForSupervisor,
  UNASSIGNED_LINE_FILTER_VALUE,
} from '../modules/production/utils/productionWorkerVisibility.ts';

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
  shouldShowProductionWorkerForSupervisor([], true, supervisorLines, { includeUnassigned: true }),
  true,
);
assert.equal(
  shouldShowProductionWorkerForSupervisor(['line-3'], false, supervisorLines),
  true,
);
assert.equal(
  matchesProductionWorkerLineFilter([], UNASSIGNED_LINE_FILTER_VALUE),
  true,
);
assert.equal(
  matchesProductionWorkerLineFilter(['', '  '], UNASSIGNED_LINE_FILTER_VALUE),
  true,
);
assert.equal(
  matchesProductionWorkerLineFilter(['line-1'], UNASSIGNED_LINE_FILTER_VALUE),
  false,
);
assert.equal(
  matchesProductionWorkerLineFilter(['line-1'], 'line-1'),
  true,
);

console.log('production-worker-visibility.test.ts: ok');

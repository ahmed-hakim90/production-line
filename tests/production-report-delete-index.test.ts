import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inventoryFn = readFileSync(
  new URL('../functions/src/productionReportInventory.ts', import.meta.url),
  'utf8',
);
const transfers = readFileSync(
  new URL('../modules/inventory/services/transferApprovalService.ts', import.meta.url),
  'utf8',
);
const attendance = readFileSync(
  new URL('../modules/production/services/productionAttendanceService.ts', import.meta.url),
  'utf8',
);

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing section ${start}`);
  return source.slice(from, to);
};

const movements = between(inventoryFn, 'async function loadSourceMovements', 'async function loadTransferRequestsForReport');
assert.equal(movements.includes(".where('sourceId', '==', sourceId)"), true);
assert.equal(movements.includes(".where('tenantId'"), false);

const requests = between(inventoryFn, 'async function loadTransferRequestsForReport', 'async function claimApplyOperation');
assert.equal(requests.includes(".where('sourceReportId', '==', reportId)"), true);
assert.equal(requests.includes(".where('tenantId'"), false);

const lookup = between(transfers, 'async getBySourceReportId', 'async createRequest');
assert.equal(
  lookup.includes("where('sourceReportId', '==', sourceId),\n          where(field, '==', boundWarehouseId)"),
  false,
);
assert.equal(lookup.includes("where(field, '==', boundWarehouseId)"), true);
assert.equal(lookup.includes("orderBy('createdAt', 'desc')"), true);

const deleteAttendance = between(attendance, 'async deleteForReport', 'async deleteByIds');
assert.equal(deleteAttendance.includes("where('date', '==', date)"), true);
assert.equal(deleteAttendance.includes('isMissingIndexError(error)'), true);

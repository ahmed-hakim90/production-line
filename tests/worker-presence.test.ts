import assert from 'node:assert/strict';
import {
  buildWorkerPresenceRowsFromReports,
  summarizeWorkerPresenceDays,
  summarizeWorkerPresenceDaysByWorker,
} from '../modules/production/utils/workerPresence.ts';
import type { ProductionReport } from '../types.ts';

const duplicateDay = summarizeWorkerPresenceDays([
  { workerId: 'worker-1', date: '2026-06-22', isPresent: false },
  { workerId: 'worker-1', date: '2026-06-22', isPresent: true },
  { workerId: 'worker-1', date: '2026-06-22' },
]);

assert.equal(duplicateDay.presentDays, 1);
assert.equal(duplicateDay.absentDays, 0);
assert.equal(duplicateDay.totalDays, 1);

const mixedDays = summarizeWorkerPresenceDaysByWorker([
  { workerId: 'worker-1', date: '2026-06-22', isPresent: false },
  { workerId: 'worker-1', date: '2026-06-23', isPresent: false },
  { workerId: 'worker-1', date: '2026-06-23', isPresent: true },
  { workerId: 'worker-2', date: '2026-06-22', isPresent: false },
]);

assert.equal(mixedDays.get('worker-1')?.presentDays, 1);
assert.equal(mixedDays.get('worker-1')?.absentDays, 1);
assert.equal(mixedDays.get('worker-2')?.presentDays, 0);
assert.equal(mixedDays.get('worker-2')?.absentDays, 1);

const reportPresenceRows = buildWorkerPresenceRowsFromReports([
  {
    id: 'report-1',
    date: '2026-06-24',
    employeeId: 'sup-1',
    lineId: 'line-1',
    productId: 'prod-1',
    quantityProduced: 10,
    workersCount: 1,
    workHours: 8,
    shiftWorkers: [
      { employeeId: 'emp-1', employeeName: 'Worker One', laborRole: 'production', isPresent: true },
    ],
    workerOutputs: [
      {
        workerId: 'worker-1',
        workerName: 'Worker One',
        lineId: 'line-1',
        lineName: 'Line 1',
        productId: 'prod-1',
        productName: 'Product 1',
        dailyTargetQty: 10,
        outputQty: 10,
        achievementPercent: 100,
        isPresent: true,
      },
    ],
  },
  {
    id: 'report-2',
    date: '2026-06-24',
    employeeId: 'sup-1',
    lineId: 'line-2',
    productId: 'prod-2',
    quantityProduced: 20,
    workersCount: 1,
    workHours: 8,
    shiftWorkers: [
      { employeeId: 'emp-1', employeeName: 'Worker One', laborRole: 'production', isPresent: true },
    ],
  },
] satisfies ProductionReport[], 'worker-1', 'emp-1');

const reportPresence = summarizeWorkerPresenceDays(reportPresenceRows);
assert.equal(reportPresence.presentDays, 1);
assert.equal(reportPresence.absentDays, 0);
assert.equal(reportPresence.totalDays, 1);

console.log('worker-presence.test.ts: ok');

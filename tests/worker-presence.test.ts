import assert from 'node:assert/strict';
import {
  summarizeWorkerPresenceDays,
  summarizeWorkerPresenceDaysByWorker,
} from '../modules/production/utils/workerPresence.ts';

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

console.log('worker-presence.test.ts: ok');

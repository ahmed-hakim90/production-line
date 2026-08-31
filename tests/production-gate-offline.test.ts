import assert from 'node:assert/strict';
const values = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  },
});

const { productionGateOfflineStore } = await import('../modules/production/services/productionGateOfflineStore');
const scope = 'gate-user-test';
const employee = {
  employeeId: 'employee-1', employeeName: 'عامل اختبار', employeeCode: '1001',
  currentStatus: 'inside' as const, nextAction: 'exit' as const, exitAt: null,
  currentDurationMinutes: 0, todayExitCount: 0, registrationAllowed: true,
};

productionGateOfflineStore.replaceEmployees(scope, [employee]);
assert.equal(productionGateOfflineStore.preview(scope, '1001')?.nextAction, 'exit');

const exit = productionGateOfflineStore.enqueue(scope, { ...employee, cachedAt: new Date().toISOString() }, '2026-08-31T08:00:00.000Z');
assert.equal(productionGateOfflineStore.preview(scope, '1001')?.nextAction, 'entry', 'pending exit must make next local action entry');

const afterExit = productionGateOfflineStore.preview(scope, '1001')!;
const entry = productionGateOfflineStore.enqueue(scope, afterExit, '2026-08-31T08:10:00.000Z');
assert.equal(productionGateOfflineStore.preview(scope, '1001')?.nextAction, 'exit', 'queued events must alternate locally');
assert.notEqual(exit.eventId, entry.eventId, 'each scan needs an idempotency key');

productionGateOfflineStore.update(scope, exit.eventId, { status: 'failed', error: 'conflict' });
assert.equal(productionGateOfflineStore.snapshot(scope).queue.find((event) => event.eventId === exit.eventId)?.status, 'failed');
productionGateOfflineStore.retry(scope, exit.eventId);
assert.equal(productionGateOfflineStore.snapshot(scope).queue.find((event) => event.eventId === exit.eventId)?.status, 'pending');
productionGateOfflineStore.remove(scope, exit.eventId);
assert.equal(productionGateOfflineStore.snapshot(scope).queue.length, 1);

console.log('production gate offline queue tests passed');

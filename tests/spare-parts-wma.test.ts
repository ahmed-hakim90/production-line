import assert from 'node:assert/strict';

/** Mirror of functions weightedAverage — keep in sync with sparePartsPurchaseInvoiceOps. */
const weightedAverage = (oldQty: number, oldAvg: number, recvQty: number, unitPrice: number): number => {
  const q0 = Math.max(0, oldQty);
  const q1 = Math.max(0, recvQty);
  const roundMoney = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  if (q1 <= 0) return roundMoney(oldAvg);
  if (q0 <= 0) return roundMoney(unitPrice);
  return roundMoney(((q0 * oldAvg) + (q1 * unitPrice)) / (q0 + q1));
};

assert.equal(weightedAverage(0, 0, 10, 20), 20);
assert.equal(weightedAverage(10, 10, 10, 30), 20);
assert.equal(weightedAverage(5, 100, 5, 0), 50);
assert.equal(weightedAverage(3, 10, 0, 99), 10);

console.log('spare-parts-wma.test.ts: ok');

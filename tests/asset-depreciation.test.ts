import assert from 'node:assert/strict';
import { calculateMonthlyDepreciation } from '../modules/costs/lib/depreciationCalc.ts';

function testStraightLine() {
  const monthly = calculateMonthlyDepreciation(12000, 0, 12, 'straight_line', 0);
  assert.equal(monthly, 1000);
}

function testDeclining() {
  const first = calculateMonthlyDepreciation(12000, 0, 12, 'declining_balance', 0);
  const later = calculateMonthlyDepreciation(12000, 0, 12, 'declining_balance', 6000);
  assert.ok(first > later);
  assert.ok(first > 1000);
}

testStraightLine();
testDeclining();
console.log('asset-depreciation.test.ts: ok');

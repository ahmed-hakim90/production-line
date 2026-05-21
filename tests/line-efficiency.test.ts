import assert from 'node:assert/strict';
import { computeLineEfficiencyFromReports } from '../modules/production/engines/lineEfficiencyEngine.ts';
import type { ProductionReport } from '../types.ts';

function testLineEfficiency() {
  const reports: ProductionReport[] = [
    {
      id: 'r1',
      lineId: 'l1',
      quantityProduced: 100,
      workHours: 10,
      date: '2026-05-01',
      employeeId: 'e1',
      productId: 'p1',
    } as ProductionReport,
  ];
  const wasteMap = new Map([['r1', 5]]);
  const rows = computeLineEfficiencyFromReports(reports, wasteMap);
  assert.equal(rows[0]?.lineId, 'l1');
  assert.equal(rows[0]?.outputPerHour, 10);
  assert.ok(rows[0]!.wastePct > 0);
}

testLineEfficiency();
console.log('line-efficiency.test.ts: ok');

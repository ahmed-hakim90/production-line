import assert from 'node:assert/strict';
import { buildDailyInspectionSummary } from '../modules/quality/domain/dailyInspectionSummary.ts';
import type { QualityLinePull } from '../modules/quality/model.ts';

const makePull = (overrides: Partial<QualityLinePull> = {}): QualityLinePull => ({
  id: 'pull-1',
  tenantId: 'tenant-1',
  moduleSource: 'qms',
  date: '2026-11-23',
  slotKey: '08:00-09:00',
  startTime: '08:00',
  endTime: '09:00',
  lineId: 'line-1',
  lineName: 'خط 1',
  productId: 'product-1',
  productName: 'منتج 1',
  stationId: 'station-1',
  stationName: 'محطة 1',
  inspectorEmployeeId: 'inspector-1',
  inspectorName: 'مراقب 1',
  additionalInspectors: [],
  sampleCount: 10,
  additionalSampleCount: 0,
  status: 'completed',
  defectCount: 2,
  palletRejected: true,
  sector: 'home',
  createdByUid: 'user-1',
  createdByName: 'مستخدم',
  defects: [
    { tenantId: 'tenant-1', reasonId: 'scratch', reasonCode: 'D1', reasonLabel: 'خدش', count: 1, inspectorEmployeeId: 'inspector-1', inspectorName: 'مراقب 1' },
    { tenantId: 'tenant-1', reasonId: 'crack', reasonCode: 'D2', reasonLabel: 'شرخ', count: 1, inspectorEmployeeId: 'inspector-2', inspectorName: 'مراقب 2' },
  ],
  ...overrides,
});

const summary = buildDailyInspectionSummary([
  makePull({
    additionalInspectors: [{ employeeId: 'inspector-2', employeeName: 'مراقب 2', sampleCount: 3 }],
  }),
  makePull({
    id: 'pull-2',
    stationId: 'station-2',
    stationName: 'محطة 2',
    status: 'pending',
    defectCount: 0,
    palletRejected: undefined,
    defects: [],
    sampleCount: 4,
  }),
]);

assert.deepEqual(summary.totals, {
  pulls: 2,
  samples: 14,
  accepted: 0,
  rejected: 1,
  pending: 1,
  defects: 2,
});
assert.equal(summary.byLine[0].pulls, 2);
assert.equal(summary.byLine[0].samples, 14);
assert.equal(summary.byLine[0].defectDetails.find((defect) => defect.key === 'scratch')?.count, 1);
assert.equal(summary.byStation.length, 2);
assert.equal(summary.byInspector.find((row) => row.key === 'inspector-1')?.samples, 11);
assert.equal(summary.byInspector.find((row) => row.key === 'inspector-2')?.samples, 3);
assert.equal(summary.byInspector.find((row) => row.key === 'inspector-1')?.defects, 1);
assert.equal(summary.byInspector.find((row) => row.key === 'inspector-2')?.defects, 1);

console.log('quality daily inspection summary checks passed');

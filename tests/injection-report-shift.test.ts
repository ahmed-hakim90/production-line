import assert from 'node:assert/strict';
import {
  DEFAULT_INJECTION_SHIFT,
  getInjectionShiftLabel,
  isDuplicateProductionReport,
  normalizeInjectionShift,
} from '../modules/production/utils/injectionReportShift.ts';

const baseInjection = {
  date: '2026-06-15',
  lineId: 'line-1',
  employeeId: 'emp-1',
  productId: 'mat-1',
  reportType: 'component_injection' as const,
};

assert.equal(normalizeInjectionShift(undefined), DEFAULT_INJECTION_SHIFT);
assert.equal(normalizeInjectionShift('evening'), 'evening');
assert.equal(getInjectionShiftLabel('evening'), 'مسائي');
assert.equal(getInjectionShiftLabel(undefined), 'صباحي');

assert.equal(
  isDuplicateProductionReport(
    { id: 'r1', ...baseInjection, shift: 'morning' },
    { ...baseInjection, shift: 'morning' },
  ),
  true,
);

assert.equal(
  isDuplicateProductionReport(
    { id: 'r1', ...baseInjection, shift: 'morning' },
    { ...baseInjection, shift: 'evening' },
  ),
  false,
);

assert.equal(
  isDuplicateProductionReport(
    { id: 'r1', ...baseInjection },
    { ...baseInjection, shift: 'evening' },
  ),
  false,
);

assert.equal(
  isDuplicateProductionReport(
    { id: 'r1', ...baseInjection },
    { ...baseInjection, shift: 'morning' },
  ),
  true,
);

assert.equal(
  isDuplicateProductionReport(
    { id: 'r1', ...baseInjection, shift: 'morning' },
    { ...baseInjection, shift: 'morning' },
    'r1',
  ),
  false,
);

assert.equal(
  isDuplicateProductionReport(
    { id: 'r1', date: '2026-06-15', lineId: 'line-1', employeeId: 'emp-1', productId: 'prod-1', reportType: 'finished_product' },
    { date: '2026-06-15', lineId: 'line-1', employeeId: 'emp-1', productId: 'prod-1', reportType: 'finished_product' },
  ),
  true,
);

console.log('injection-report-shift.test.ts: ok');

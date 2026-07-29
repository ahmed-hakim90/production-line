import assert from 'node:assert/strict';
import { getOperationalDateString } from '../utils/calculations';
import {
  DEFAULT_REPORT_BEHAVIOR_SETTINGS,
  normalizeOperationalDayStartHour,
  resolveReportBehaviorSettings,
} from '../modules/production/lib/reportBehaviorSettings';

const defaults = resolveReportBehaviorSettings({ planSettings: {} as any });
assert.deepEqual(defaults, DEFAULT_REPORT_BEHAVIOR_SETTINGS);

assert.equal(normalizeOperationalDayStartHour(-10), 0);
assert.equal(normalizeOperationalDayStartHour(99), 23);
assert.equal(normalizeOperationalDayStartHour('6'), 6);
assert.equal(normalizeOperationalDayStartHour('bad'), 8);

const custom = resolveReportBehaviorSettings({
  planSettings: {
    reportBehavior: {
      operationalDayStartHour: 6,
      preventDuplicateReports: false,
      requireWorkHoursOnReports: false,
    },
  } as any,
});
assert.equal(custom.operationalDayStartHour, 6);
assert.equal(custom.preventDuplicateReports, false);
assert.equal(custom.requireWorkHoursOnReports, false);
assert.equal(custom.requirePositiveQuantityOnReports, true);

assert.equal(
  getOperationalDateString(8, new Date('2026-07-29T05:30:00')),
  '2026-07-28',
);
assert.equal(
  getOperationalDateString(6, new Date('2026-07-29T06:30:00')),
  '2026-07-29',
);

console.log('report-behavior-settings tests passed');

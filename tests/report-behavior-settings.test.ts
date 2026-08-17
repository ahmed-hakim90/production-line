import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      autoPostReportToPlanAndWorkOrder: false,
    },
  } as any,
});
assert.equal(custom.operationalDayStartHour, 6);
assert.equal(custom.preventDuplicateReports, false);
assert.equal(custom.requireWorkHoursOnReports, false);
assert.equal(custom.requirePositiveQuantityOnReports, true);
assert.equal(custom.requireWorkOrderOnQuickAction, false);
assert.equal(custom.autoPostReportToPlanAndWorkOrder, true);

const requireWo = resolveReportBehaviorSettings({
  planSettings: {
    reportBehavior: {
      requireWorkOrderOnQuickAction: true,
    },
  } as any,
});
assert.equal(requireWo.requireWorkOrderOnQuickAction, true);

assert.equal(
  getOperationalDateString(8, new Date('2026-07-29T05:30:00')),
  '2026-07-28',
);
assert.equal(
  getOperationalDateString(6, new Date('2026-07-29T06:30:00')),
  '2026-07-29',
);

const quickActionSource = readFileSync(new URL('../modules/production/pages/QuickAction.tsx', import.meta.url), 'utf8');
assert.match(
  quickActionSource,
  /workOrderRequired = reportBehavior.requireWorkOrderOnQuickAction \|\| isDelegatedEntry/,
);
assert.match(quickActionSource, /بدون أمر شغل/);
assert.doesNotMatch(
  quickActionSource,
  /requireWorkOrderOnQuickAction \|\| canCreateForAnySupervisor\s*\n\s*\? 'أمر شغل موجّه للمشرف \(إلزامي\)'/,
);

const storeSource = readFileSync(new URL('../store/useAppStore.ts', import.meta.url), 'utf8');
assert.match(storeSource, /Do not silently attach a work order when the operator left it empty/);

console.log('report-behavior-settings tests passed');

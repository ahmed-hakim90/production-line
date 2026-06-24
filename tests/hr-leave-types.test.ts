import assert from 'node:assert/strict';
import { HR_CONFIG_DEFAULTS, withLeaveReasonDefaults } from '../modules/hr/config/defaults.ts';
import { DEFAULT_LEAVE_REASONS, normalizeLeaveReasons, normalizeLeaveTypes } from '../modules/hr/leaveTypes.ts';

const defaultRows = normalizeLeaveTypes();
assert.ok(defaultRows.some((row) => row.key === 'annual'));
assert.ok(defaultRows.some((row) => row.key === 'unpaid'));

const rows = normalizeLeaveTypes([
  {
    type: 'personal_permission',
    labelAr: 'إذن شخصي',
    defaultBalance: 6,
    salaryImpact: 'deduct_percent',
    deductPercent: 50,
    requiresApproval: true,
    maxConsecutiveDays: 1,
    carryOverAllowed: false,
    maxCarryOverDays: 0,
  },
]);

const custom = rows.find((row) => row.key === 'personal_permission');
assert.ok(custom);
assert.equal(custom.label, 'إذن شخصي');
assert.equal(custom.isPaid, false);
assert.equal(custom.defaultBalance, 6);

assert.equal(rows.some((row) => row.key === 'annual'), false);
assert.equal(rows.some((row) => row.key === 'unpaid'), false);

const remainingDefaults = normalizeLeaveTypes([
  {
    type: 'annual',
    labelAr: 'إجازة سنوية',
    defaultBalance: 21,
    salaryImpact: 'full_paid',
    deductPercent: 0,
    requiresApproval: true,
    maxConsecutiveDays: 30,
    carryOverAllowed: true,
    maxCarryOverDays: 10,
  },
]);

assert.deepEqual(remainingDefaults.map((row) => row.key), ['annual']);

const emptySavedConfig = normalizeLeaveTypes([]);
assert.deepEqual(emptySavedConfig, []);

assert.deepEqual(normalizeLeaveReasons(), DEFAULT_LEAVE_REASONS);
assert.deepEqual(normalizeLeaveReasons().map((row) => row.label), [
  'مرض',
  'ظرف عائلي',
  'حالة طارئة',
  'مهمة شخصية',
  'سفر',
  'مرافقة مريض',
  'وفاة قريب',
  'زواج',
  'تجديد أوراق حكومية',
  'امتحانات / دراسة',
  'رعاية طفل / مولود',
  'حج / عمرة',
  'إصابة عمل',
  'إجازة أمومة / وضع',
  'راحة',
]);
assert.deepEqual(normalizeLeaveReasons([]), []);
assert.deepEqual(
  HR_CONFIG_DEFAULTS.leave.leaveReasons.map((row) => row.labelAr),
  DEFAULT_LEAVE_REASONS.map((row) => row.label),
);

const legacyLeaveConfig = withLeaveReasonDefaults({
  ...HR_CONFIG_DEFAULTS.leave,
  leaveReasons: [],
});
assert.deepEqual(
  legacyLeaveConfig.leaveReasons.map((row) => row.labelAr),
  DEFAULT_LEAVE_REASONS.map((row) => row.label),
);

const missingReasonsConfig = withLeaveReasonDefaults({
  ...HR_CONFIG_DEFAULTS.leave,
  leaveReasons: undefined,
});
assert.deepEqual(
  missingReasonsConfig.leaveReasons.map((row) => row.labelAr),
  DEFAULT_LEAVE_REASONS.map((row) => row.label),
);

const intentionallyEmptyReasonsConfig = withLeaveReasonDefaults({
  ...HR_CONFIG_DEFAULTS.leave,
  leaveReasons: [],
  leaveReasonsConfigured: true,
});
assert.deepEqual(intentionallyEmptyReasonsConfig.leaveReasons, []);

const leaveReasons = normalizeLeaveReasons([
  { code: 'medical_visit', labelAr: 'زيارة طبية' },
  { code: 'family_event', labelAr: 'مناسبة عائلية' },
  { code: 'family_event', labelAr: 'مناسبة أسرية' },
  { code: '', labelAr: 'بدون كود' },
]);

assert.deepEqual(leaveReasons, [
  { code: 'medical_visit', label: 'زيارة طبية' },
  { code: 'family_event', label: 'مناسبة أسرية' },
]);

console.log('hr-leave-types.test.ts: ok');

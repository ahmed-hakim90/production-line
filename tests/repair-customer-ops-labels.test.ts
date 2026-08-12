import assert from 'node:assert/strict';
import {
  CUSTOMER_REQUEST_STATUS_LABELS,
  REPLACEMENT_STATUS_LABELS,
  custodyAgeDays,
  daysSinceJobStatus,
  toRepairOpsUserError,
} from '../modules/repair/lib/repairCustomerOpsLabels';
import {
  repairCustodyAgeChipType,
  repairCustomerRequestStatusChipType,
  repairReplacementStatusChipType,
} from '../modules/repair/lib/repairSemanticStatus';

assert.equal(CUSTOMER_REQUEST_STATUS_LABELS.submitted, 'غير موزع');
assert.equal(REPLACEMENT_STATUS_LABELS.pending_approval, 'بانتظار الاعتماد');
assert.equal(repairCustomerRequestStatusChipType('assigned'), 'info');
assert.equal(repairReplacementStatusChipType('rejected'), 'danger');
assert.equal(repairCustodyAgeChipType(3), 'muted');
assert.equal(repairCustodyAgeChipType(7), 'warning');
assert.equal(repairCustodyAgeChipType(20), 'danger');

const now = Date.now();
assert.equal(custodyAgeDays(new Date(now - 3 * 86_400_000).toISOString()), 3);

{
  const readyAt = new Date(now - 2 * 86_400_000).toISOString();
  const days = daysSinceJobStatus(
    {
      status: 'ready',
      updatedAt: new Date(now - 10 * 86_400_000).toISOString(),
      statusHistory: [
        { status: 'repairing', at: new Date(now - 5 * 86_400_000).toISOString() },
        { status: 'ready', at: readyAt },
      ],
    },
    'ready',
  );
  assert.equal(days, 2);
  assert.equal(daysSinceJobStatus({ status: 'repairing' }, 'ready'), null);
}

assert.equal(
  toRepairOpsUserError({ code: 'permission-denied' }, 'fallback'),
  'ليس لديك صلاحية كافية لتنفيذ هذه العملية.',
);
assert.equal(
  toRepairOpsUserError({ message: 'الكمية غير كافية' }, 'fallback'),
  'الكمية غير كافية',
);
assert.equal(
  toRepairOpsUserError({ message: 'https://firebase.google.com/...' }, 'fallback'),
  'fallback',
);

console.log('repair-customer-ops-labels.test.ts: ok');

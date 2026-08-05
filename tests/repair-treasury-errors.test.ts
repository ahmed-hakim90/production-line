import assert from 'node:assert/strict';
import {
  REPAIR_TREASURY_INDEX_HINT,
  REPAIR_TREASURY_PERMISSION_HINT,
  REPAIR_TREASURY_TENANT_HINT,
  toRepairTreasuryErrorMessage,
} from '../modules/repair/lib/repairTreasuryErrors.ts';

{
  const msg = toRepairTreasuryErrorMessage(
    {
      code: 'failed-precondition',
      message: 'The query requires an index. You can create it here: https://console.firebase.google.com/...',
    },
    'تعذر تحميل جلسات الخزينة.',
  );
  assert.equal(msg, REPAIR_TREASURY_INDEX_HINT);
  assert.doesNotMatch(msg, /console\.firebase/);
}

{
  const msg = toRepairTreasuryErrorMessage(
    { code: 'permission-denied', message: 'Missing or insufficient permissions.' },
    'fallback',
  );
  assert.equal(msg, REPAIR_TREASURY_PERMISSION_HINT);
}

{
  const msg = toRepairTreasuryErrorMessage(
    new Error('Tenant context not initialised'),
    'fallback',
  );
  assert.equal(msg, REPAIR_TREASURY_TENANT_HINT);
}

{
  const msg = toRepairTreasuryErrorMessage(
    { code: 'unavailable', message: 'https://firestore.googleapis.com/...' },
    'تعذر تحميل جلسات الخزينة.',
  );
  assert.equal(msg, 'تعذر تحميل جلسات الخزينة.');
}

{
  const msg = toRepairTreasuryErrorMessage(new Error('يوجد خزينة مفتوحة بالفعل لهذا الفرع.'), 'fallback');
  assert.equal(msg, 'يوجد خزينة مفتوحة بالفعل لهذا الفرع.');
}

console.log('repair-treasury-errors tests passed');

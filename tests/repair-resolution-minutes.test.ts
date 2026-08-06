import assert from 'node:assert/strict';
import { buildRepairResolutionFields } from '../modules/repair/utils/repairWorkflowNormalize';
import { stripUndefinedDeep } from '../modules/repair/lib/stripUndefinedDeep';

/** Closing a job without assignedAt used to write resolutionMinutes: undefined and crash Firestore. */
{
  const fields = buildRepairResolutionFields(undefined, '2026-08-06T08:00:00.000Z');
  assert.deepEqual(fields, {});
  assert.equal(Object.prototype.hasOwnProperty.call(fields, 'resolutionMinutes'), false);
}

{
  const fields = buildRepairResolutionFields('', '2026-08-06T08:00:00.000Z');
  assert.deepEqual(fields, {});
}

{
  const fields = buildRepairResolutionFields('not-a-date', '2026-08-06T08:00:00.000Z');
  assert.deepEqual(fields, {});
}

{
  const fields = buildRepairResolutionFields(
    '2026-08-06T07:00:00.000Z',
    '2026-08-06T08:30:00.000Z',
  );
  assert.deepEqual(fields, { resolutionMinutes: 90 });
}

{
  const payload = stripUndefinedDeep({
    status: 'cancelled',
    isClosed: true,
    resolvedAt: '2026-08-06T08:00:00.000Z',
    ...buildRepairResolutionFields(undefined, '2026-08-06T08:00:00.000Z'),
    resolutionMinutes: undefined as number | undefined,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'resolutionMinutes'), false);
}

console.log('repair-resolution-minutes: ok');

import assert from 'node:assert/strict';
import { stripUndefinedDeep } from '../modules/repair/lib/stripUndefinedDeep';

/** Status changes without a reason used to write `note: undefined` and crash Firestore Transaction.set(). */
{
  const payload = stripUndefinedDeep({
    action: 'status_change',
    statusBefore: 'repairing',
    statusAfter: 'ready',
    note: undefined as string | undefined,
    payload: { dueAt: undefined, ok: true },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'note'), false);
  assert.deepEqual(payload, {
    action: 'status_change',
    statusBefore: 'repairing',
    statusAfter: 'ready',
    payload: { ok: true },
  });
}

{
  const withNote = stripUndefinedDeep({ note: 'سبب واضح', action: 'status_change' });
  assert.equal(withNote.note, 'سبب واضح');
}

console.log('repair-service-event-undefined: ok');

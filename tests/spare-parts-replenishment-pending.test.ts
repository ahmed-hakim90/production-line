import assert from 'node:assert/strict';
import { isPendingReplenishmentStatus } from '../modules/inventory/lib/sparePartsReplenishment.ts';

{
  assert.equal(isPendingReplenishmentStatus('submitted'), true);
  assert.equal(isPendingReplenishmentStatus('approved'), true);
  assert.equal(isPendingReplenishmentStatus('prepared'), true);
  assert.equal(isPendingReplenishmentStatus('responsible_approved'), true);
  assert.equal(isPendingReplenishmentStatus('received'), false);
  assert.equal(isPendingReplenishmentStatus('rejected'), false);
  assert.equal(isPendingReplenishmentStatus('cancelled'), false);
  console.log('spare-parts-replenishment-pending.test.ts: ok');
}

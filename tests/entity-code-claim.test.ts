import assert from 'node:assert/strict';
import {
  buildEntityCodeClaimId,
  isDuplicateEntityCodeError,
  DUPLICATE_ENTITY_CODE,
} from '../modules/shared/lib/entityCodeClaim.ts';

function testClaimId() {
  assert.equal(
    buildEntityCodeClaimId('tenant/1', 'material', 'mat-176'),
    'tenant_1__material__MAT-176',
  );
  assert.equal(
    buildEntityCodeClaimId('abc', 'material', 'MAT-176'),
    'abc__material__MAT-176',
  );
}

function testDuplicateErrorHelper() {
  const err = new Error(DUPLICATE_ENTITY_CODE);
  (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
  assert.equal(isDuplicateEntityCodeError(err), true);
  assert.equal(isDuplicateEntityCodeError(new Error('other')), false);
  assert.equal(isDuplicateEntityCodeError(null), false);
}

testClaimId();
testDuplicateErrorHelper();
console.log('entity-code-claim tests passed');

import assert from 'node:assert/strict';
import {
  canWritePortalPin,
  CUSTOMER_PORTAL_PIN_DIGITS,
  CUSTOMER_PORTAL_SESSION_MS,
  nextPortalCredentialVersion,
  portalSessionMatchesCredential,
} from '../functions/src/customerPortalCredentialPolicy.ts';

assert.equal(CUSTOMER_PORTAL_PIN_DIGITS, 6);
assert.equal(CUSTOMER_PORTAL_SESSION_MS, 12 * 60 * 60_000);
assert.equal(portalSessionMatchesCredential(3, 3), true);
assert.equal(portalSessionMatchesCredential(3, 2), false);
assert.equal(nextPortalCredentialVersion(3), 4);
assert.equal(nextPortalCredentialVersion(undefined), 1);
assert.equal(canWritePortalPin(false, false), true);
assert.equal(canWritePortalPin(true, false), false);
assert.equal(canWritePortalPin(true, undefined), false);
assert.equal(canWritePortalPin(true, true), true);

console.log('customer-portal-pin-policy.test.ts: ok');

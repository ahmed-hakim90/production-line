import assert from 'node:assert/strict';
import {
  isTransientFirestoreError,
  shouldCoalesceNetworkRecovery,
} from '../lib/firestoreErrorUtils.ts';

assert.equal(isTransientFirestoreError({ code: 'permission-denied' }), true);
assert.equal(isTransientFirestoreError({ code: 'unavailable' }), true);
assert.equal(isTransientFirestoreError({ message: 'Failed to fetch' }), true);
assert.equal(isTransientFirestoreError({ message: 'ERR_CONNECTION_RESET' }), true);
assert.equal(isTransientFirestoreError({ code: 'unauthenticated' }), true);
assert.equal(isTransientFirestoreError({ code: 'not-found' }), false);
assert.equal(isTransientFirestoreError({ message: 'كود المخزن مستخدم بالفعل' }), false);

assert.equal(shouldCoalesceNetworkRecovery(0, 10_000), false);
assert.equal(shouldCoalesceNetworkRecovery(9_000, 10_000, 4000), true);
assert.equal(shouldCoalesceNetworkRecovery(1_000, 10_000, 4000), false);

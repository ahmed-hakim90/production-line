import assert from 'node:assert/strict';
import {
  CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS,
  isCustomerPortalTab,
} from '../modules/repair/lib/customerPortalBottomBar.ts';

assert.deepEqual(
  CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS.map((i) => i.key),
  ['requests', 'compose', 'timeline', 'profile'],
);

assert.equal(
  CUSTOMER_PORTAL_BOTTOM_BAR_ITEMS.find((i) => i.key === 'compose')?.primary,
  true,
  'طلب جديد is the elevated primary action',
);

assert.equal(isCustomerPortalTab('requests'), true);
assert.equal(isCustomerPortalTab('compose'), true);
assert.equal(isCustomerPortalTab('admin'), false);

console.log('customer-portal-bottom-bar.test.ts: ok');

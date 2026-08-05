import assert from 'node:assert/strict';
import {
  CUSTOMER_LIST_LOAD_FALLBACK,
  toCustomerListLoadErrorMessage,
  waitForTenantId,
} from '../modules/customers/lib/customerListLoadError';
import { setCurrentTenant } from '../lib/currentTenant';

{
  const msg = toCustomerListLoadErrorMessage({
    code: 'failed-precondition',
    message: 'The query requires an index. You can create it here: https://console.firebase.google.com/...',
  });
  assert.match(msg, /فهرس العملاء/);
  assert.match(msg, /tenantId \+ code/);
  assert.doesNotMatch(msg, /console\.firebase/);
}

{
  const msg = toCustomerListLoadErrorMessage({
    code: 'permission-denied',
    message: 'Missing or insufficient permissions.',
  });
  assert.equal(msg, 'ليس لديك صلاحية قراءة العملاء.');
}

{
  const msg = toCustomerListLoadErrorMessage(new Error('Tenant context not initialised'));
  assert.equal(msg, 'سياق الشركة غير جاهز — أعد تحميل الصفحة.');
}

{
  const msg = toCustomerListLoadErrorMessage(new Error('something else'), CUSTOMER_LIST_LOAD_FALLBACK);
  assert.equal(msg, CUSTOMER_LIST_LOAD_FALLBACK);
}

{
  const msg = toCustomerListLoadErrorMessage(
    { code: 'failed-precondition', message: 'index is currently building' },
  );
  assert.match(msg, /فهرس العملاء/);
}

{
  setCurrentTenant(null);
  const missing = await waitForTenantId({ attempts: 2, delayMs: 1 });
  assert.equal(missing, null);

  setCurrentTenant('tenant-test');
  const ready = await waitForTenantId({ attempts: 1, delayMs: 0 });
  assert.equal(ready, 'tenant-test');
  setCurrentTenant(null);
}

console.log('customers-list-load-error: ok');

import assert from 'node:assert/strict';
import { matchCustomers } from '../modules/customers/lib/customerSearch.ts';
import {
  customerCodePrefixForType,
  maxCustomerSeqFromCodes,
  normalizeCustomerCode,
} from '../modules/customers/lib/customerCode.ts';
import { parseCustomerTypeLabel } from '../modules/customers/types.ts';
import type { Customer } from '../modules/customers/types.ts';

function sample(partial: Partial<Customer> & Pick<Customer, 'code' | 'name' | 'phone'>): Customer {
  return {
    tenantId: 't1',
    type: 'consumer',
    phoneDigits: String(partial.phone || '').replace(/\D/g, ''),
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

{
  assert.equal(normalizeCustomerCode(' cst-12 '), 'CST-12');
  assert.equal(customerCodePrefixForType('consumer'), 'CST');
  assert.equal(customerCodePrefixForType('trader'), 'TRD');
  assert.equal(maxCustomerSeqFromCodes(['CST-00001', 'CST-00012', 'TRD-00003'], 'CST'), 12);
  assert.equal(parseCustomerTypeLabel('مستهلك'), 'consumer');
  assert.equal(parseCustomerTypeLabel('تاجر'), 'trader');
  assert.equal(parseCustomerTypeLabel('xyz'), null);
}

{
  const customers = [
    sample({ id: '1', code: 'CST-00001', name: 'أحمد محمد', phone: '01001234567', type: 'consumer' }),
    sample({ id: '2', code: 'TRD-00001', name: 'مؤسسة النور', phone: '01009876543', type: 'trader' }),
    sample({ id: '3', code: 'CST-00002', name: 'سارة', phone: '01112223334', type: 'consumer', isActive: false }),
  ];

  const byCode = matchCustomers(customers, 'CST-00001');
  assert.equal(byCode[0]?.id, '1');

  const byPhone = matchCustomers(customers, '01009876543');
  assert.equal(byPhone[0]?.id, '2');

  const byName = matchCustomers(customers, 'نور');
  assert.equal(byName[0]?.id, '2');

  // inactive excluded from default search
  const inactive = matchCustomers(customers, 'سارة');
  assert.equal(inactive.length, 0);
}

console.log('customers-crm.test.ts: ok');

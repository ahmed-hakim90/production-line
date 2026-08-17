import assert from 'node:assert/strict';
import {
  mostFrequentCustomerSizeTier,
  mostFrequentCustomerType,
  rankCustomersByDebt,
  rankCustomersByJobCount,
  rankCustomersByVolume,
} from '../modules/customers/lib/customerBoardAnalytics.ts';
import type { Customer } from '../modules/customers/types.ts';

function sample(partial: Partial<Customer> & Pick<Customer, 'id' | 'code' | 'name'>): Customer {
  return {
    tenantId: 't1',
    type: 'consumer',
    phone: '01000000000',
    phoneDigits: '01000000000',
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const customers: Customer[] = [
  sample({ id: 'c1', code: 'CST-1', name: 'أحمد', businessVolume: 40_000, balance: 800, sizeTier: 'small' }),
  sample({ id: 'c2', code: 'TRD-1', name: 'النور', type: 'trader', businessVolume: 180_000, balance: 12_000, sizeTier: 'medium' }),
  sample({ id: 'c3', code: 'TRD-2', name: 'كبير', type: 'trader', businessVolume: 450_000, balance: -200, sizeTier: 'large' }),
  sample({ id: 'c4', code: 'CST-2', name: 'بدون مؤشرات' }),
  sample({ id: 'c5', code: 'CST-3', name: 'دين صغير', businessVolume: 10_000, balance: 50, sizeTier: 'small' }),
];

{
  const highest = rankCustomersByVolume(customers, 'desc', 3);
  assert.deepEqual(highest.map((row) => row.id), ['c3', 'c2', 'c1']);
  assert.equal(highest[0]?.value, 450_000);

  const lowest = rankCustomersByVolume(customers, 'asc', 3);
  assert.deepEqual(lowest.map((row) => row.id), ['c5', 'c1', 'c2']);
}

{
  const debt = rankCustomersByDebt(customers, 5);
  assert.deepEqual(debt.map((row) => row.id), ['c2', 'c1', 'c5']);
  assert.equal(debt.some((row) => row.id === 'c3'), false);
}

{
  const frequent = rankCustomersByJobCount(
    [
      { customerId: 'c1' },
      { customerId: 'c1' },
      { customerId: 'c1' },
      { customerId: 'c2' },
      { customerId: '' },
      { customerId: 'missing' },
    ],
    customers,
    5,
  );
  assert.equal(frequent[0]?.id, 'c1');
  assert.equal(frequent[0]?.value, 3);
  assert.equal(frequent[1]?.id, 'c2');
  assert.equal(frequent.length, 2);
}

{
  const typeBucket = mostFrequentCustomerType(customers);
  assert.equal(typeBucket?.key, 'consumer');
  assert.equal(typeBucket?.count, 3);

  const sizeBucket = mostFrequentCustomerSizeTier(customers);
  assert.equal(sizeBucket?.key, 'small');
  assert.equal(sizeBucket?.count, 2);
}

console.log('customers-board-analytics.test.ts: ok');

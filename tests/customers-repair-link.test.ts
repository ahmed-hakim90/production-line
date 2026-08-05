import assert from 'node:assert/strict';
import {
  planRepairJobCustomerLinks,
  summarizeRepairJobCustomerLinkPlan,
} from '../modules/customers/lib/linkRepairJobsByPhone.ts';

{
  const plans = planRepairJobCustomerLinks(
    [
      { id: 'j1', receiptNo: 'R-1', customerName: 'أحمد', customerPhone: '01001234567' },
      { id: 'j2', receiptNo: 'R-2', customerName: 'سارة', customerPhone: '01009876543', customerId: 'c9' },
      { id: 'j3', receiptNo: 'R-3', customerName: 'بدون', customerPhone: '123' },
      { id: 'j4', receiptNo: 'R-4', customerName: 'مجهول', customerPhone: '01112223334' },
      { id: 'j5', receiptNo: 'R-5', customerName: 'تعارض', customerPhone: '01555555555' },
    ],
    [
      { id: 'c1', code: 'CST-1', phone: '01001234567', phoneDigits: '01001234567' },
      { id: 'c2', code: 'CST-2', phone: '01555555555', phoneDigits: '01555555555' },
      { id: 'c3', code: 'CST-3', phone: '01555555555', phoneDigits: '01555555555' },
    ],
  );

  assert.equal(plans[0].status, 'link');
  assert.equal(plans[0].matchCustomerId, 'c1');
  assert.equal(plans[1].status, 'skip_already_linked');
  assert.equal(plans[2].status, 'skip_no_phone');
  assert.equal(plans[3].status, 'skip_no_match');
  assert.equal(plans[4].status, 'skip_ambiguous');

  const summary = summarizeRepairJobCustomerLinkPlan(plans);
  assert.equal(summary.link, 1);
  assert.equal(summary.alreadyLinked, 1);
  assert.equal(summary.noPhone, 1);
  assert.equal(summary.noMatch, 1);
  assert.equal(summary.ambiguous, 1);
}

console.log('customers-repair-link.test.ts: ok');

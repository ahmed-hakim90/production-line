import assert from 'node:assert/strict';
import { matchesRepairPaymentReadyJobSearch } from '../modules/repair/lib/repairPaymentReadyJobSearch.ts';

assert.equal(
  matchesRepairPaymentReadyJobSearch(
    {
      receiptNo: 'REP-0001',
      customerName: 'وزه',
      customerPhone: '01001234567',
      productName: 'كبه سوكانى',
      branchName: 'مركز المنصوره',
    },
    '',
  ),
  true,
);

assert.equal(
  matchesRepairPaymentReadyJobSearch(
    { receiptNo: 'REP-0001', customerName: 'وزه', customerPhone: '01001234567' },
    'rep-0001',
  ),
  true,
);

assert.equal(
  matchesRepairPaymentReadyJobSearch(
    { receiptNo: 'REP-0001', customerName: 'وزه', customerPhone: '01001234567' },
    'وزه',
  ),
  true,
);

assert.equal(
  matchesRepairPaymentReadyJobSearch(
    { receiptNo: 'REP-0001', customerName: 'وزه', customerPhone: '01001234567' },
    '٠١٠٠١٢٣٤٥٦٧',
  ),
  true,
);

assert.equal(
  matchesRepairPaymentReadyJobSearch(
    { receiptNo: 'REP-0001', customerName: 'وزه', branchName: 'مركز المنصوره' },
    'المنصوره',
  ),
  true,
);

assert.equal(
  matchesRepairPaymentReadyJobSearch(
    { receiptNo: 'REP-0001', customerName: 'وزه', productName: 'كبه' },
    'غير موجود',
  ),
  false,
);

console.log('repair-payment-ready-job-search tests passed');

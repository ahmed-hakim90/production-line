import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeliveryReceiptPDF } from '../modules/repair/components/DeliveryReceiptPDF';
import type { RepairBranch, RepairJob } from '../modules/repair/types';

const baseJob: RepairJob = {
  id: 'job-1',
  tenantId: 'tenant-1',
  receiptNo: 'R-1042',
  branchId: 'branch-1',
  customerName: 'عميل الاختبار',
  customerPhone: '01000000000',
  customerAddress: 'القاهرة',
  deviceType: 'appliance',
  deviceBrand: 'Brand',
  deviceModel: 'Model',
  problemDescription: 'لا يعمل',
  status: 'ready',
  warranty: '3months',
  partsUsed: [],
  jobProducts: [
    {
      itemId: 'p-1',
      productName: 'غسالة',
      serialNo: 'SN-1',
      quantity: 1,
      diagnosis: 'لا تعمل',
      technicianDiagnosis: 'تم تغيير الجزء التالف واختباره',
      accessories: 'كابل',
    },
    {
      itemId: 'p-2',
      productName: 'موتور',
      serialNo: 'SN-2',
      quantity: 2,
      diagnosis: 'صوت مرتفع',
      accessories: '—',
    },
  ],
  createdAt: '2026-08-04T08:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
};

const branch: RepairBranch = {
  id: 'branch-1',
  tenantId: 'tenant-1',
  name: 'مركز القاهرة',
  address: 'مدينة نصر',
  phone: '0220000000',
  isMain: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const beforeDelivery = renderToStaticMarkup(
  React.createElement(DeliveryReceiptPDF, { job: baseJob, branch }),
);
assert.equal(beforeDelivery, '<div></div>', 'delivery authorization must not render before delivery');

const deliveredJob: RepairJob = {
  ...baseJob,
  status: 'delivered',
  deliveredAt: '2026-08-04T12:30:00.000Z',
  deliveryAuthorizationNo: 'DEL-R-1042',
  deliveryAuthorizationIssuedAt: '2026-08-04T12:30:00.000Z',
  deliveryAuthorizationIssuedByName: 'موظف التسليم',
  finalCost: 1500,
  paidAmount: 1500,
  balanceDue: 0,
  paymentStatus: 'paid',
  isClosed: true,
};

const deliveredMarkup = renderToStaticMarkup(
  React.createElement(DeliveryReceiptPDF, { job: deliveredJob, branch }),
);

for (const expected of [
  'إذن تسليم منتج',
  'DEL-R-1042',
  'عميل الاختبار',
  'غسالة',
  'SN-1',
  'موتور',
  'SN-2',
  'مدفوع بالكامل',
  'موظف التسليم',
  'اسم وتوقيع المستلم',
  'اعتماد وختم الفرع',
]) {
  assert.ok(deliveredMarkup.includes(expected), `missing delivery print field: ${expected}`);
}

assert.ok(deliveredMarkup.includes('3'), 'total product quantity should be rendered');

console.log('repair-delivery-authorization.test.tsx: ok');

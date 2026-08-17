import assert from 'node:assert/strict';
import { buildRepairPaymentAccountBreakdown, formatRepairPaymentAccountText } from '../modules/repair/lib/repairPaymentProductBreakdown.ts';
import type { RepairJob, RepairPaymentAuthorization } from '../modules/repair/types.ts';

const job = (patch: Partial<RepairJob>): RepairJob => ({
  receiptNo: 'REP-0001',
  tenantId: 't1',
  branchId: 'b1',
  customerName: 'اونلاين سوكاني',
  customerPhone: '0100',
  deviceType: 'خلاط',
  deviceBrand: 'Sokany',
  deviceModel: 'SK',
  problemDescription: 'عطل',
  status: 'ready',
  createdAt: '2026-08-09T09:09:05.000Z',
  updatedAt: '2026-08-09T09:09:05.000Z',
  warranty: 'none',
  partsUsed: [],
  jobProducts: [],
  ...patch,
});

const auth = (patch: Partial<RepairPaymentAuthorization>): RepairPaymentAuthorization => ({
  tenantId: 't1',
  branchId: 'b1',
  jobId: 'j1',
  receiptNo: 'REP-0001',
  authorizationNo: 'PAY-REP-0001-R1',
  revision: 1,
  grossAmount: 150,
  serviceGross: 150,
  partsGross: 0,
  discountType: 'none',
  discountValue: 0,
  discountAmount: 0,
  netAmount: 150,
  paidAmount: 0,
  balanceDue: 150,
  status: 'approved',
  createdBy: 'u1',
  createdByName: 'استقبال',
  createdAt: '2026-08-09T09:09:05.000Z',
  updatedAt: '2026-08-09T09:09:05.000Z',
  ...patch,
});

{
  // Invoice screenshot case: 150 service on one of two out-of-warranty products.
  const view = buildRepairPaymentAccountBreakdown(
    job({
      jobProducts: [
        {
          itemId: 'p1',
          productName: 'SK-666N Sokany Blender',
          deviceBrand: 'Sokany',
          deviceModel: 'SK-666N',
          quantity: 1,
          inWarranty: false,
          serviceIds: ['diagnosis'],
          finalCost: 0,
        },
        {
          itemId: 'p2',
          productName: 'SK-7011N محضرة طعام',
          quantity: 1,
          inWarranty: false,
          serviceIds: [],
          finalCost: 0,
        },
      ],
    }),
    auth({
      serviceLines: [
        { id: 'diagnosis', name: 'تشخيص', quantity: 1, unitPrice: 150, lineTotal: 150 },
      ],
    }),
  );
  assert.equal(view.products.length, 2);
  assert.equal(view.products[0]?.customerTotal, 150);
  assert.equal(view.products[0]?.works[0]?.name, 'تشخيص');
  assert.equal(view.products[1]?.customerTotal, 0);
  assert.equal(view.products[1]?.works.length, 0);
  assert.equal(view.unassigned.length, 0);
}

{
  const view = buildRepairPaymentAccountBreakdown(
    job({
      warrantyScope: 'manufacturer',
      jobProducts: [
        {
          itemId: 'p1',
          productName: 'خلاط ضمان',
          quantity: 1,
          inWarranty: true,
          serviceIds: ['diagnosis'],
        },
      ],
    }),
    auth({
      settlementType: 'warranty',
      serviceLines: [
        { id: 'diagnosis', name: 'تشخيص', quantity: 1, unitPrice: 150, lineTotal: 150 },
      ],
    }),
  );
  assert.equal(view.products[0]?.inWarranty, true);
  assert.equal(view.products[0]?.customerTotal, 0);
  assert.equal(view.products[0]?.catalogTotal, 150);
}

{
  const view = buildRepairPaymentAccountBreakdown(
    job({
      jobProducts: [
        { itemId: 'p1', productName: 'جهاز 1', quantity: 1, inWarranty: false, serviceIds: [] },
        { itemId: 'p2', productName: 'جهاز 2', quantity: 1, inWarranty: false, serviceIds: [] },
      ],
      partsUsed: [
        { partId: 'm1', materialId: 'm1', partName: 'ترس', quantity: 1, unitCost: 80 },
      ],
    }),
    auth({
      partLines: [{ id: 'm1', name: 'ترس', quantity: 1, unitPrice: 80, lineTotal: 80 }],
    }),
  );
  assert.equal(view.unassigned.length, 1);
  assert.equal(view.unassigned[0]?.name, 'ترس');
  assert.equal(view.unassigned[0]?.customerTotal, 80);
}

{
  const view = buildRepairPaymentAccountBreakdown(
    job({
      jobProducts: [
        { itemId: 'p1', productName: 'جهاز واحد', quantity: 1, inWarranty: false, serviceIds: [] },
      ],
      partsUsed: [
        { partId: 'm1', materialId: 'm1', partName: 'سلك', quantity: 2, unitCost: 10, productItemId: 'p1' },
      ],
    }),
    auth({
      partLines: [{ id: 'm1', name: 'سلك', quantity: 2, unitPrice: 10, lineTotal: 20 }],
    }),
  );
  assert.equal(view.products[0]?.customerTotal, 20);
  assert.equal(view.products[0]?.works[0]?.kind, 'part');
  assert.equal(view.unassigned.length, 0);
}

{
  // Single product: leftover catalog service attaches to that product.
  const view = buildRepairPaymentAccountBreakdown(
    job({
      jobProducts: [
        { itemId: 'p1', productName: 'جهاز واحد', quantity: 1, inWarranty: false, serviceIds: [] },
      ],
    }),
    auth({
      serviceLines: [
        { id: 'diagnosis', name: 'تشخيص', quantity: 1, unitPrice: 150, lineTotal: 150 },
      ],
    }),
  );
  assert.equal(view.products[0]?.customerTotal, 150);
  assert.equal(view.products[0]?.works[0]?.name, 'تشخيص');
  assert.equal(view.unassigned.length, 0);
}

{
  // Legacy authorization without serviceIds: still show the billed service, unassigned when two products.
  const view = buildRepairPaymentAccountBreakdown(
    job({
      jobProducts: [
        { itemId: 'p1', productName: 'خلاط', quantity: 1, inWarranty: false, serviceIds: [], finalCost: 0 },
        { itemId: 'p2', productName: 'كبه', quantity: 1, inWarranty: false, serviceIds: [], finalCost: 0 },
      ],
    }),
    auth({
      serviceLines: [],
      serviceGross: 150,
      partsGross: 0,
    }),
  );
  assert.equal(view.products[0]?.works.length, 0);
  assert.equal(view.products[1]?.works.length, 0);
  assert.equal(view.unassigned.length, 1);
  assert.equal(view.unassigned[0]?.name, 'خدمات صيانة');
  assert.equal(view.unassigned[0]?.customerTotal, 150);
}

{
  const view = buildRepairPaymentAccountBreakdown(
    job({
      jobProducts: [
        { itemId: 'p1', productName: 'خلاط', quantity: 1, inWarranty: false, serviceIds: ['diagnosis'] },
      ],
    }),
    auth({
      serviceLines: [
        { id: 'diagnosis', name: 'تشخيص', quantity: 1, unitPrice: 150, lineTotal: 150 },
      ],
    }),
  );
  const text = formatRepairPaymentAccountText(view);
  assert.match(text, /خلاط/);
  assert.match(text, /تشخيص/);
  assert.match(text, /خدمة/);
}

console.log('repair-payment-product-breakdown.test.ts: ok');

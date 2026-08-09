import assert from 'node:assert/strict';
import { buildPublicRepairApprovalView } from '../modules/repair/lib/repairApprovalPublic.ts';

const baseJob = {
  receiptNo: 'REP-1001',
  customerName: 'أحمد علي',
  customerPhone: '01001234567',
  deviceBrand: 'Samsung',
  deviceModel: 'A54',
  deviceType: 'موبايل',
  problemDescription: 'الشاشة لا تعمل',
  approvalStatus: 'pending',
  laborCost: 150,
  serviceOnlyCost: 0,
  estimatedCost: 0,
  partsUsed: [
    { partName: 'شاشة أصلية', quantity: 1, unitCost: 1200 },
    { partName: 'لصق', quantity: 2, unitCost: 25 },
    { partName: 'ملغاة', quantity: 0, unitCost: 99 },
  ],
  jobProducts: [
    { productName: 'موبايل A54', quantity: 1, estimatedCost: 100, finalCost: 0 },
  ],
};

{
  const view = buildPublicRepairApprovalView(baseJob);
  assert.equal(view.receiptNo, 'REP-1001');
  assert.equal(view.customerName, 'أحمد علي');
  assert.equal(view.customerPhone, '01001234567');
  assert.equal(view.deviceBrand, 'Samsung');
  assert.equal(view.deviceModel, 'A54');
  assert.equal(view.parts.length, 2);
  assert.equal(view.parts[0]?.lineTotal, 1200);
  assert.equal(view.parts[1]?.lineTotal, 50);
  assert.equal(view.partsCost, 1250);
  assert.equal(view.laborCost, 150);
  assert.equal(view.estimatedTotal, 1400);
  assert.equal(view.parts[0]?.inWarranty, false);
  assert.ok(!('technicianId' in view));
  assert.ok(!('approvalTokenHash' in view));
  assert.ok(!('materialId' in (view.parts[0] || {})));
}

{
  // Prefer computed billable total over a higher stored estimate.
  const view = buildPublicRepairApprovalView({
    ...baseJob,
    estimatedCost: 2000,
  });
  assert.equal(view.estimatedTotal, 1400);
}

{
  // When computed is 0, fall back to stored estimate.
  const view = buildPublicRepairApprovalView({
    receiptNo: 'REP-stored',
    customerName: 'سعد',
    customerPhone: '011',
    laborCost: 0,
    serviceOnlyCost: 0,
    estimatedCost: 350,
    partsUsed: [],
    jobProducts: [],
  });
  assert.equal(view.estimatedTotal, 350);
}

{
  const view = buildPublicRepairApprovalView({
    receiptNo: 'REP-2',
    customerName: 'سعد',
    customerPhone: '011',
    partsUsed: undefined,
    jobProducts: undefined,
  });
  assert.equal(view.parts.length, 0);
  assert.equal(view.products.length, 0);
  assert.equal(view.estimatedTotal, 0);
  assert.equal(view.approvalStatus, 'pending');
}

{
  const longName = 'س'.repeat(300);
  const view = buildPublicRepairApprovalView({
    ...baseJob,
    customerName: longName,
    problemDescription: 'ع'.repeat(1500),
  });
  assert.ok(view.customerName.length <= 120);
  assert.ok(view.problemDescription.length <= 1000);
}

{
  const view = buildPublicRepairApprovalView({
    ...baseJob,
    partsUsed: [],
    laborCost: 0,
    estimatedCost: 0,
    jobProducts: [
      { productName: 'منتج ضمان', quantity: 1, finalCost: 500, inWarranty: true },
      { productName: 'منتج مدفوع', quantity: 1, finalCost: 200, inWarranty: false },
    ],
  });
  assert.equal(view.products.length, 2);
  assert.equal(view.products[0]?.warrantyLabel, 'داخل الضمان');
  assert.equal(view.products[0]?.lineCost, 0);
  assert.equal(view.products[1]?.warrantyLabel, 'بدون ضمان');
  assert.equal(view.products[1]?.lineCost, 200);
  assert.equal(view.billableProductsCost, 200);
  assert.equal(view.warrantyProductsCost, 500);
  assert.equal(view.estimatedTotal, 200);
}

{
  // Partial warranty: parts linked to warranty productItemId are free.
  const view = buildPublicRepairApprovalView({
    receiptNo: 'REP-partial',
    customerName: 'مختلط',
    customerPhone: '0100',
    warrantyScope: 'partial',
    laborCost: 100,
    serviceOnlyCost: 0,
    estimatedCost: 9999,
    jobProducts: [
      { productName: 'مضمون', quantity: 1, itemId: 'p-w', finalCost: 400, inWarranty: true },
      { productName: 'مدفوع', quantity: 1, itemId: 'p-b', finalCost: 150, inWarranty: false },
    ],
    partsUsed: [
      { partName: 'قطعة ضمان', quantity: 1, unitCost: 800, productItemId: 'p-w' },
      { partName: 'قطعة مدفوعة', quantity: 1, unitCost: 200, productItemId: 'p-b' },
    ],
  });
  assert.equal(view.parts.length, 2);
  assert.equal(view.parts[0]?.inWarranty, true);
  assert.equal(view.parts[0]?.lineTotal, 0);
  assert.equal(view.parts[0]?.warrantyLabel, 'داخل الضمان');
  assert.equal(view.parts[1]?.inWarranty, false);
  assert.equal(view.parts[1]?.lineTotal, 200);
  assert.equal(view.partsCost, 200);
  assert.equal(view.billableProductsCost, 150);
  assert.equal(view.estimatedTotal, 450); // 200 parts + 100 labor + 150 product
}

console.log('repair-approval-public.test.ts: ok');

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
  assert.ok(!('technicianId' in view));
  assert.ok(!('approvalTokenHash' in view));
  assert.ok(!('materialId' in (view.parts[0] || {})));
}

{
  const view = buildPublicRepairApprovalView({
    ...baseJob,
    estimatedCost: 2000,
  });
  assert.equal(view.estimatedTotal, 2000);
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

console.log('repair-approval-public.test.ts: ok');

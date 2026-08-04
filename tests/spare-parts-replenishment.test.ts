import assert from 'node:assert/strict';
import {
  canApproveSparePartsRequest,
  canCancelSparePartsRequest,
  canPrepareSparePartsRequest,
  canReceiveSparePartsRequest,
  canRejectSparePartsRequest,
  canResponsibleApproveSparePartsRequest,
  materialPurchaseCostPerBaseUnit,
  resolvePreparedQty,
  resolveReceiveQty,
  validateSparePartsDraftLines,
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
} from '../modules/inventory/lib/sparePartsReplenishment.ts';
import { WAREHOUSE_ROLE_LABELS, SOURCE_MODULE_LABELS } from '../modules/inventory/lib/stockLabels.ts';

assert.equal(WAREHOUSE_ROLE_LABELS.spare_parts_central, 'قطع غيار (مركزي)');
assert.equal(WAREHOUSE_ROLE_LABELS.maintenance_center, 'مخزن مركز صيانة');
assert.equal(SOURCE_MODULE_LABELS.spare_parts_replenishment, 'تموين قطع غيار للمراكز');
assert.equal(SPARE_PARTS_REPLENISHMENT_STATUS_LABELS.responsible_approved.includes('استلام'), true);

assert.equal(canApproveSparePartsRequest({ status: 'submitted' }), true);
assert.equal(canApproveSparePartsRequest({ status: 'approved' }), false);
assert.equal(canPrepareSparePartsRequest({ status: 'approved' }), true);
assert.equal(canResponsibleApproveSparePartsRequest({ status: 'prepared' }), true);
assert.equal(canReceiveSparePartsRequest({ status: 'responsible_approved' }), true);
assert.equal(canRejectSparePartsRequest({ status: 'submitted' }), true);
assert.equal(canRejectSparePartsRequest({ status: 'prepared' }), false);
assert.equal(canCancelSparePartsRequest({ status: 'responsible_approved' }), true);
assert.equal(canCancelSparePartsRequest({ status: 'received' }), false);

assert.equal(resolvePreparedQty({ requestedQty: 5 }), 5);
assert.equal(resolvePreparedQty({ requestedQty: 5, preparedQty: 3 }), 3);
assert.equal(resolveReceiveQty({ requestedQty: 5, preparedQty: 4 }), 4);
assert.equal(resolveReceiveQty({ requestedQty: 5, preparedQty: 4 }, 2), 2);

assert.equal(materialPurchaseCostPerBaseUnit({ purchaseCost: 100, conversionRate: 10 }), 10);
assert.equal(materialPurchaseCostPerBaseUnit({ purchaseCost: 20 }), 20);

assert.doesNotThrow(() => validateSparePartsDraftLines([
  { itemId: 'm1', quantity: 2 },
  { itemId: 'm2', quantity: 1 },
]));
assert.throws(() => validateSparePartsDraftLines([]));
assert.throws(() => validateSparePartsDraftLines([
  { itemId: 'm1', quantity: 1 },
  { itemId: 'm1', quantity: 2 },
]));

console.log('spare-parts-replenishment tests passed');

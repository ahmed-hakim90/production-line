import assert from 'node:assert/strict';
import {
  isManufacturerWarrantyJob,
  isWarrantySettlementAuth,
  resolveManufacturerWarrantyScope,
  sumManufacturerWarrantyPartsCost,
  sumWarrantyPartsIssueCost,
} from '../modules/repair/lib/repairManufacturerWarranty';

assert.equal(resolveManufacturerWarrantyScope([{ inWarranty: true }]), 'manufacturer');
assert.equal(resolveManufacturerWarrantyScope([{ inWarranty: false }, { inWarranty: false }]), 'none');
assert.equal(isManufacturerWarrantyJob({ warrantyScope: 'manufacturer' }), true);
assert.equal(isManufacturerWarrantyJob({ jobProducts: [{ inWarranty: true }] }), true);
assert.equal(isManufacturerWarrantyJob({ warrantyScope: 'none', jobProducts: [] }), false);

assert.equal(isWarrantySettlementAuth({ settlementType: 'warranty', grossAmount: 0 }), true);
assert.equal(isWarrantySettlementAuth({ settlementType: 'standard', grossAmount: 0 }), false);
assert.equal(isWarrantySettlementAuth({ grossAmount: 100 }), false);

assert.equal(
  sumWarrantyPartsIssueCost([
    { quantity: 2, unitCost: 50, unitCostSnapshot: 10, totalCostSnapshot: 20 },
    { quantity: 1, unitCost: 99 }, // legacy sale-only — excluded from warranty COGS KPI
  ]),
  20,
);

assert.equal(
  sumManufacturerWarrantyPartsCost([
    {
      warrantyScope: 'manufacturer',
      partsUsed: [{ quantity: 1, unitCost: 40, totalCostSnapshot: 12.5 }],
    },
    {
      jobProducts: [{ inWarranty: false }],
      partsUsed: [{ quantity: 1, unitCost: 40, totalCostSnapshot: 100 }],
    },
  ]),
  12.5,
);

console.log('repair-manufacturer-warranty.test.ts: ok');

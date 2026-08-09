import assert from 'node:assert/strict';
import {
  hasManufacturerWarrantyCoverage,
  isFullManufacturerWarrantyJob,
  isManufacturerWarrantyJob,
  isPartialManufacturerWarrantyJob,
  isWarrantySettlementAuth,
  manufacturerWarrantyLineLabel,
  manufacturerWarrantyScopeLabel,
  resolveManufacturerWarrantyScope,
  sumJobManufacturerWarrantyPartsCost,
  sumManufacturerWarrantyPartsCost,
  sumWarrantyPartsIssueCost,
} from '../modules/repair/lib/repairManufacturerWarranty';

assert.equal(resolveManufacturerWarrantyScope([{ inWarranty: true }]), 'manufacturer');
assert.equal(resolveManufacturerWarrantyScope([{ inWarranty: false }, { inWarranty: false }]), 'none');
assert.equal(
  resolveManufacturerWarrantyScope([{ inWarranty: true }, { inWarranty: false }]),
  'partial',
);

assert.equal(isManufacturerWarrantyJob({ warrantyScope: 'manufacturer' }), true);
assert.equal(isFullManufacturerWarrantyJob({ jobProducts: [{ inWarranty: true }] }), true);
assert.equal(isManufacturerWarrantyJob({ warrantyScope: 'none', jobProducts: [] }), false);
assert.equal(
  isManufacturerWarrantyJob({
    jobProducts: [{ inWarranty: true }, { inWarranty: false }],
  }),
  false,
);
assert.equal(
  isPartialManufacturerWarrantyJob({
    jobProducts: [{ inWarranty: true }, { inWarranty: false }],
  }),
  true,
);
assert.equal(
  hasManufacturerWarrantyCoverage({
    jobProducts: [{ inWarranty: true }, { inWarranty: false }],
  }),
  true,
);

assert.equal(manufacturerWarrantyLineLabel(true), 'داخل الضمان');
assert.equal(manufacturerWarrantyLineLabel(false), 'بدون ضمان');
assert.equal(manufacturerWarrantyScopeLabel('partial'), 'ضمان مختلط');
assert.equal(manufacturerWarrantyScopeLabel('manufacturer'), 'داخل الضمان');
assert.equal(manufacturerWarrantyScopeLabel('none'), 'بدون ضمان');

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

assert.equal(
  sumJobManufacturerWarrantyPartsCost({
    warrantyScope: 'partial',
    jobProducts: [
      { itemId: 'a', inWarranty: true },
      { itemId: 'b', inWarranty: false },
    ],
    partsUsed: [
      { productItemId: 'a', quantity: 1, totalCostSnapshot: 30 },
      { productItemId: 'b', quantity: 1, totalCostSnapshot: 80 },
      { scope: 'job', quantity: 1, totalCostSnapshot: 15 },
    ],
  }),
  30,
);

console.log('repair-manufacturer-warranty.test.ts: ok');

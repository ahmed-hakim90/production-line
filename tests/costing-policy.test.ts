import assert from 'node:assert/strict';
import {
  DEFAULT_COSTING_POLICY,
  resolveCostingPolicy,
  validateCostingPolicy,
} from '../utils/costingPolicy.ts';

const defaults = resolveCostingPolicy();
assert.deepEqual(defaults, DEFAULT_COSTING_POLICY);
assert.equal(defaults.primaryCostView, 'legacy_conversion');
assert.equal(validateCostingPolicy(defaults).length, 0);

assert.match(
  validateCostingPolicy({ ...defaults, legacyConversionEnabled: false, fullManufacturingEnabled: false })[0],
  /يجب تشغيل تكلفة التحويل/,
);
assert.match(
  validateCostingPolicy({ ...defaults, primaryCostView: 'full_manufacturing', fullManufacturingEnabled: false })[0],
  /لا يمكن اعتماد التكلفة الكاملة/,
);
assert.match(
  validateCostingPolicy({
    ...defaults,
    includeIndirectCenters: true,
    allowLinePercentageAllocation: false,
    allowQuantityAllocation: false,
  })[0],
  /طريقة توزيع واحدة/,
);
assert.match(
  validateCostingPolicy({ ...defaults, allowProvisionalValues: false, allowBomEstimateFallback: true })[0],
  /BOM التقديري/,
);

console.log('costing-policy.test.ts: ok');

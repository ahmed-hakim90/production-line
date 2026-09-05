import assert from 'node:assert/strict';
import {
  DEFAULT_COSTING_POLICY,
  resolveCostingPolicy,
  validateCostingPolicy,
} from '../utils/costingPolicy.ts';

const defaults = resolveCostingPolicy();
assert.deepEqual(defaults, DEFAULT_COSTING_POLICY);
assert.equal(defaults.primaryCostView, 'full_manufacturing');
assert.equal(defaults.includeDirectLabor, true);
assert.equal(defaults.includeSupervisor, false);
assert.equal(defaults.includeIndirectCenters, false);
assert.equal(defaults.includeActualMaterials, false);
assert.deepEqual(
  resolveCostingPolicy({ includeSupervisor: true, includeActualMaterials: true }),
  DEFAULT_COSTING_POLICY,
);
assert.equal(validateCostingPolicy(defaults).length, 0);

assert.match(
  validateCostingPolicy({ ...defaults, legacyConversionEnabled: false, fullManufacturingEnabled: false })[0],
  /يجب تشغيل تكلفة التحويل/,
);
assert.ok(
  validateCostingPolicy({ ...defaults, primaryCostView: 'full_manufacturing', fullManufacturingEnabled: false })
    .some((message) => /لا يمكن اعتماد التكلفة الكاملة/.test(message)),
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

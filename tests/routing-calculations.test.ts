import assert from 'node:assert/strict';
import {
  computeRoutingCalculation,
  resolveRoutingVarianceBasisSeconds,
  totalTimeSecondsFromSteps,
} from '../modules/production/routing/domain/calculations';

const single = computeRoutingCalculation({
  productId: 'p1',
  quantity: 10,
  workerHourRate: 120,
  steps: [
    {
      name: 'تجميع',
      durationSeconds: 30,
      workersCount: 2,
      actualDurationSeconds: 40,
      actualWorkersCount: 2,
    },
  ],
});

assert.equal(single.standardTotalTimeSeconds, 30);
assert.equal(single.actualTotalTimeSeconds, 40);
assert.equal(single.totalCost, (40 * 2 * 120) / 3600);
assert.equal(single.costPerUnit, single.totalCost / 10);
assert.equal(single.isExecutionComplete, true);

const multi = computeRoutingCalculation({
  productId: 'p2',
  quantity: 5,
  workerHourRate: 60,
  routingTargetUnitSeconds: 45,
  steps: [
    { name: 'قص', durationSeconds: 20, workersCount: 1, actualDurationSeconds: 18, actualWorkersCount: 1 },
    { name: 'تشطيب', durationSeconds: 40, workersCount: 3, actualDurationSeconds: 50, actualWorkersCount: 4 },
  ],
});

assert.equal(totalTimeSecondsFromSteps([{ durationSeconds: 20 }, { durationSeconds: 40 }]), 60);
assert.equal(multi.standardTotalTimeSeconds, 60);
assert.equal(multi.routingTargetUnitSeconds, 45);
assert.equal(multi.varianceBasisSecondsPerUnit, 45);
assert.equal(resolveRoutingVarianceBasisSeconds({ routingTargetUnitSeconds: 45, totalTimeSeconds: 60 }), 45);
assert.equal(resolveRoutingVarianceBasisSeconds({ totalTimeSeconds: 60 }), 60);
assert.equal(multi.stepVariances.length, 2);
assert.equal(Number(multi.stepVariances[1].timeVarianceRatio.toFixed(2)), 0.25);

const invalid = computeRoutingCalculation({
  productId: '',
  quantity: 0,
  workerHourRate: 100,
  routingTargetUnitSeconds: -1,
  steps: [
    { name: '', durationSeconds: 0, workersCount: 0, actualDurationSeconds: 0, actualWorkersCount: 0 },
  ],
});

assert.ok(invalid.warnings.includes('missing_product'));
assert.ok(invalid.warnings.includes('invalid_quantity'));
assert.ok(invalid.warnings.includes('invalid_target_seconds'));
assert.ok(invalid.warnings.includes('step_missing_name'));
assert.ok(invalid.warnings.includes('step_zero_duration'));
assert.ok(invalid.warnings.includes('step_zero_workers'));
assert.ok(invalid.warnings.includes('execution_incomplete'));
assert.equal(invalid.isExecutionComplete, false);

console.log('routing calculations tests passed');

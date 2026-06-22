import assert from 'node:assert/strict';
import { buildLaborGoalsAnalysis } from '../modules/dashboards/utils/laborGoalAnalysis.ts';
import type { LineProductConfig, ProductionReport } from '../types';

const report = (overrides: Partial<ProductionReport>): ProductionReport => ({
  employeeId: 'supervisor-1',
  productId: 'product-1',
  lineId: 'line-1',
  date: '2026-06-22',
  quantityProduced: 0,
  workersCount: 0,
  workHours: 0,
  reportType: 'finished_product',
  ...overrides,
});

const lineConfig = (overrides: Partial<LineProductConfig> = {}): LineProductConfig => ({
  lineId: 'line-1',
  productId: 'product-1',
  standardAssemblyTime: 5,
  dailyWorkerTargetQty: 50,
  ...overrides,
});

const empty = buildLaborGoalsAnalysis({
  productionReports: [report({ quantityProduced: 120, workersCount: 3 })],
  previousMonthProductionReports: [],
  lineProductConfigs: [],
  endDate: '2026-06-22',
});

assert.equal(empty.hasConfiguredTargets, false);
assert.equal(empty.averageAchievement, 0);
assert.equal(empty.totalTargetQty, 0);
assert.match(empty.summary, /لا توجد أهداف/);

const duplicatePresenceDay = buildLaborGoalsAnalysis({
  productionReports: [
    report({
      workerOutputs: [
        {
          workerId: 'worker-1',
          workerName: 'عامل 1',
          productId: 'product-1',
          productName: 'منتج',
          lineId: 'line-1',
          lineName: 'خط 1',
          dailyTargetQty: 0,
          outputQty: 0,
          achievementPercent: 0,
          isPresent: false,
        },
      ],
    }),
    report({
      lineId: 'line-2',
      workerOutputs: [
        {
          workerId: 'worker-1',
          workerName: 'عامل 1',
          productId: 'product-1',
          productName: 'منتج',
          lineId: 'line-2',
          lineName: 'خط 2',
          dailyTargetQty: 0,
          outputQty: 0,
          achievementPercent: 0,
        },
      ],
    }),
  ],
  previousMonthProductionReports: [],
  lineProductConfigs: [],
  endDate: '2026-06-22',
});
const duplicatePresenceDayPeriod = duplicatePresenceDay.periods.find((period) => period.key === 'day');
assert.equal(duplicatePresenceDayPeriod?.presentAssignments, 1);
assert.equal(duplicatePresenceDayPeriod?.absentAssignments, 0);

const fromWorkerOutputs = buildLaborGoalsAnalysis({
  productionReports: [
    report({
      workerOutputs: [
        {
          workerId: 'worker-1',
          workerName: 'عامل 1',
          productId: 'product-1',
          productName: 'منتج',
          lineId: 'line-1',
          lineName: 'خط',
          dailyTargetQty: 50,
          outputQty: 45,
          achievementPercent: 90,
        },
        {
          workerId: 'worker-2',
          workerName: 'عامل 2',
          productId: 'product-1',
          productName: 'منتج',
          lineId: 'line-1',
          lineName: 'خط',
          dailyTargetQty: 50,
          outputQty: 55,
          achievementPercent: 110,
        },
        {
          workerId: 'worker-3',
          workerName: 'عامل 3',
          productId: 'product-1',
          productName: 'منتج',
          lineId: 'line-1',
          lineName: 'خط',
          dailyTargetQty: 50,
          outputQty: 999,
          achievementPercent: 1998,
          isPresent: false,
        },
      ],
    }),
  ],
  previousMonthProductionReports: [],
  lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 80 })],
  endDate: '2026-06-22',
});

const dayFromWorkerOutputs = fromWorkerOutputs.periods.find((period) => period.key === 'day');
assert.equal(fromWorkerOutputs.hasConfiguredTargets, true);
assert.equal(dayFromWorkerOutputs?.targetQty, 100);
assert.equal(dayFromWorkerOutputs?.actualQty, 100);
assert.equal(dayFromWorkerOutputs?.achievement, 100);
assert.equal(dayFromWorkerOutputs?.presentAssignments, 2);
assert.equal(dayFromWorkerOutputs?.absentAssignments, 1);
assert.equal(fromWorkerOutputs.totalPresentAssignments, 2);
assert.equal(fromWorkerOutputs.totalAbsentAssignments, 1);

const fromLineConfig = buildLaborGoalsAnalysis({
  productionReports: [
    report({
      quantityProduced: 130,
      workersCount: 3,
    }),
  ],
  previousMonthProductionReports: [],
  lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 50 })],
  endDate: '2026-06-22',
});

const dayFromLineConfig = fromLineConfig.periods.find((period) => period.key === 'day');
assert.equal(dayFromLineConfig?.targetQty, 150);
assert.equal(dayFromLineConfig?.actualQty, 130);
assert.equal(dayFromLineConfig?.achievement, 87);

console.log('labor-goal-analysis.test.ts: ok');

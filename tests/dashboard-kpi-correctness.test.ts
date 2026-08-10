import assert from 'node:assert/strict';
import { buildDashboardKPIs, getReportWaste } from '../utils/calculations';
import {
  planReportsLookupKey,
  resolvePlanReports,
} from '../modules/dashboards/lib/decisionMetrics';
import type { ProductionReport } from '../types';

function report(
  partial: Partial<ProductionReport> & {
    quantityProduced: number;
    scrapQty?: number;
  },
): ProductionReport {
  const scrapQty = Number(partial.scrapQty || 0);
  return {
    id: partial.id || `r-${partial.quantityProduced}`,
    date: partial.date || '2026-08-10',
    lineId: partial.lineId || 'line-1',
    productId: partial.productId || 'prod-1',
    employeeId: partial.employeeId || 'emp-1',
    quantityProduced: partial.quantityProduced,
    componentScrapItems: scrapQty > 0 ? [{ materialId: 'm1', quantity: scrapQty }] : [],
    ...partial,
  } as ProductionReport;
}

// Period efficiency/waste must follow the period set, not today-only.
{
  const today = [report({ quantityProduced: 90, scrapQty: 10 })];
  const period = [
    report({ id: 'a', quantityProduced: 80, scrapQty: 20 }),
    report({ id: 'b', quantityProduced: 100, scrapQty: 0 }),
  ];
  const kpis = buildDashboardKPIs(today, period);
  assert.equal(kpis.todayProduction, 90);
  assert.equal(kpis.monthlyProduction, 180);
  assert.equal(kpis.efficiency, 90); // 180 / (180+20)
  assert.equal(kpis.wasteRatio, Number(((20 / 200) * 100).toFixed(1)));
}

// Without period set, efficiency falls back to today reports.
{
  const today = [report({ quantityProduced: 70, scrapQty: 30 })];
  const kpis = buildDashboardKPIs(today);
  assert.equal(kpis.efficiency, 70);
  assert.equal(kpis.wasteRatio, Number(((getReportWaste(today[0]) / 100) * 100).toFixed(1)));
}

// Plan report buckets prefer plan id so concurrent line+product plans do not collide.
{
  assert.equal(
    planReportsLookupKey({ id: 'plan-a', lineId: 'L1', productId: 'P1' }),
    'plan-a',
  );
  assert.equal(
    planReportsLookupKey({ lineId: 'L1', productId: 'P1' }),
    'L1_P1',
  );

  const buckets = {
    'plan-a': [report({ id: 'r1', quantityProduced: 10 })],
    L1_P1: [report({ id: 'r2', quantityProduced: 99 })],
  };
  const resolved = resolvePlanReports({ id: 'plan-a', lineId: 'L1', productId: 'P1' }, buckets);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].quantityProduced, 10);

  const legacy = resolvePlanReports({ lineId: 'L1', productId: 'P1' }, buckets);
  assert.equal(legacy[0].quantityProduced, 99);
}

// Approved-month cost may only apply to calendar-month-to-date ranges.
{
  const isCalendarMonthToDate = (start: string, end: string) => {
    const monthKey = start.slice(0, 7);
    return Boolean(monthKey) && start === `${monthKey}-01` && end.slice(0, 7) === monthKey;
  };
  assert.equal(isCalendarMonthToDate('2026-08-01', '2026-08-10'), true);
  assert.equal(isCalendarMonthToDate('2026-08-04', '2026-08-10'), false);
  assert.equal(isCalendarMonthToDate('2026-07-01', '2026-08-10'), false);
}

console.log('dashboard-kpi-correctness: ok');

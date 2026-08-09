import assert from 'node:assert/strict';
import {
  getHomeChartsPresetRange,
  inclusiveDayCount,
  monthsOverlappingPeriod,
} from '../modules/dashboards/lib/homeChartsPeriod.ts';

{
  const today = getHomeChartsPresetRange('today');
  assert.equal(today.start, today.end);
  assert.match(today.start, /^\d{4}-\d{2}-\d{2}$/);
}

{
  const week = getHomeChartsPresetRange('week');
  assert.equal(inclusiveDayCount(week.start, week.end), 7);
}

{
  const month = getHomeChartsPresetRange('month');
  assert.ok(month.start.endsWith('-01'));
  assert.ok(month.end >= month.start);
}

{
  const three = getHomeChartsPresetRange('3months');
  assert.ok(three.end >= three.start);
  assert.ok(inclusiveDayCount(three.start, three.end) >= 89);
}

{
  assert.equal(inclusiveDayCount('2026-08-01', '2026-08-01'), 1);
  assert.equal(inclusiveDayCount('2026-08-01', '2026-08-10'), 10);
  assert.equal(inclusiveDayCount('2026-08-10', '2026-08-01'), 1);
}

{
  assert.deepEqual(monthsOverlappingPeriod('2026-01-15', '2026-03-02'), [
    '2026-01',
    '2026-02',
    '2026-03',
  ]);
  assert.deepEqual(monthsOverlappingPeriod('bad', '2026-01-01'), []);
}

console.log('home-charts-period.test.ts: ok');

import assert from 'node:assert/strict';
import { resolveHomeChartDrilldown } from '../modules/dashboards/lib/homeChartsDrilldown.ts';

const period = { start: '2026-08-01', end: '2026-08-09' };

{
  const path = resolveHomeChartDrilldown('repair', { ...period, barName: 'متأخر' });
  assert.equal(path, '/repair/jobs?focus=overdue');
}

{
  const path = resolveHomeChartDrilldown('customers', { ...period, barName: 'نشط' });
  assert.equal(path, '/customers/kpi?active=1');
}

{
  const path = resolveHomeChartDrilldown('customers', { ...period, barName: 'يحتاج اتصال' });
  assert.equal(path, '/customers/kpi?followUp=needs_call');
}

{
  const path = resolveHomeChartDrilldown('customers', { ...period, barName: 'كبير' });
  assert.equal(path, '/customers/kpi?size=large');
}

{
  const path = resolveHomeChartDrilldown('inventory', { ...period, barName: 'تحت الحد' });
  assert.equal(path, '/inventory/exceptions?kind=low');
}

{
  const path = resolveHomeChartDrilldown('hr', { ...period, barName: 'حضور' });
  assert.ok(path.includes('/hr/attendance/daily'));
  assert.ok(path.includes('status=present'));
  assert.ok(path.includes('dateFrom=2026-08-01'));
  assert.ok(path.includes('dateTo=2026-08-09'));
}

{
  const path = resolveHomeChartDrilldown('production', period);
  assert.equal(path, '/production-plans?dateFrom=2026-08-01&dateTo=2026-08-09');
}

console.log('home-charts-drilldown.test.ts: ok');

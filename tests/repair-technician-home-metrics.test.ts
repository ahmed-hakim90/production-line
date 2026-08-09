/**
 * Repair technician home metrics — period KPIs + fixed/delayed lists.
 * Run: npx --yes tsx tests/repair-technician-home-metrics.test.ts
 */
import assert from 'node:assert/strict';
import {
  buildRepairOpenAgingBars,
  buildRepairTechnicianDailyOutcomes,
  formatRepairTechnicianDeviceLabel,
  isRepairJobDelayed,
  resolveRepairTechnicianHomeRange,
  summarizeRepairTechnicianHome,
  type RepairTechnicianHomeJob,
} from '../modules/repair/lib/repairTechnicianHomeMetrics.ts';

const OPEN = ['received', 'diagnosing', 'waiting_parts', 'repairing', 'testing', 'ready'] as const;

function job(partial: Partial<RepairTechnicianHomeJob> & { status: string }): RepairTechnicianHomeJob {
  return {
    id: partial.id || 'j1',
    receiptNo: partial.receiptNo || 'R-1',
    customerName: partial.customerName || 'عميل',
    deviceBrand: partial.deviceBrand || 'Samsung',
    deviceModel: partial.deviceModel || 'A12',
    createdAt: partial.createdAt,
    updatedAt: partial.updatedAt,
    deliveredAt: partial.deliveredAt,
    resolvedAt: partial.resolvedAt,
    closedAt: partial.closedAt,
    dueAt: partial.dueAt,
    status: partial.status,
  };
}

{
  const now = new Date('2026-08-15T12:00:00');
  const month = resolveRepairTechnicianHomeRange('monthly', now);
  assert.equal(new Date(month.startMs).getDate(), 1);
  assert.equal(new Date(month.startMs).getMonth(), 7);
  const day = resolveRepairTechnicianHomeRange('daily', now);
  assert.ok(day.startMs < day.endMs);
  assert.ok(month.startMs <= day.startMs);
}

{
  const nowMs = Date.parse('2026-08-15T12:00:00Z');
  const range = {
    startMs: Date.parse('2026-08-01T00:00:00Z'),
    endMs: Date.parse('2026-08-31T23:59:59Z'),
  };

  const jobs: RepairTechnicianHomeJob[] = [
    job({
      id: 'req',
      status: 'repairing',
      createdAt: '2026-08-10T10:00:00Z',
      dueAt: '2026-08-20T10:00:00Z',
    }),
    job({
      id: 'fixed-ready',
      status: 'ready',
      createdAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-08-12T10:00:00Z',
    }),
    job({
      id: 'fixed-delivered',
      status: 'delivered',
      createdAt: '2026-08-05T10:00:00Z',
      deliveredAt: '2026-08-14T10:00:00Z',
    }),
    job({
      id: 'outside',
      status: 'delivered',
      createdAt: '2026-07-05T10:00:00Z',
      deliveredAt: '2026-07-20T10:00:00Z',
    }),
    job({
      id: 'delayed',
      status: 'repairing',
      createdAt: '2026-08-01T10:00:00Z',
      dueAt: '2026-08-10T10:00:00Z',
    }),
    job({
      id: 'no-due',
      status: 'repairing',
      createdAt: '2026-08-02T10:00:00Z',
    }),
    job({
      id: 'unrep',
      status: 'unrepairable',
      createdAt: '2026-08-03T10:00:00Z',
      resolvedAt: '2026-08-11T10:00:00Z',
    }),
  ];

  const m = summarizeRepairTechnicianHome(jobs, { range, openStatusIds: OPEN, nowMs });

  assert.equal(m.requestsCount, 5, 'created in August (req, fixed-delivered, delayed, no-due, unrep)');
  assert.equal(m.fixedCount, 2);
  assert.equal(m.unrepairableCount, 1);
  assert.equal(m.completedOutcomesCount, 2);
  assert.deepEqual(m.fixedJobs.map((j) => j.id), ['fixed-delivered', 'fixed-ready']);
  assert.deepEqual(m.unrepairableJobs.map((j) => j.id), ['unrep']);
  assert.equal(m.delayedCount, 1);
  assert.equal(m.delayedJobs[0]?.id, 'delayed');
  assert.equal(m.openCount, 4, 'req + fixed-ready + delayed + no-due (ready is open in settings)');
  assert.equal(Math.round(m.successRate), 50, '1 delivered / (1 delivered + 1 unrepairable)');
}

{
  assert.equal(
    isRepairJobDelayed(
      job({ status: 'repairing', dueAt: '2020-01-01T00:00:00Z' }),
      OPEN,
      Date.parse('2026-08-15T00:00:00Z'),
    ),
    true,
  );
  assert.equal(
    isRepairJobDelayed(
      job({ status: 'delivered', dueAt: '2020-01-01T00:00:00Z' }),
      OPEN,
      Date.parse('2026-08-15T00:00:00Z'),
    ),
    false,
  );
  assert.equal(
    isRepairJobDelayed(
      job({ status: 'repairing' }),
      OPEN,
      Date.parse('2026-08-15T00:00:00Z'),
    ),
    false,
  );
}

{
  assert.equal(
    formatRepairTechnicianDeviceLabel(job({ status: 'ready', deviceBrand: 'LG', deviceModel: 'X' })),
    'LG X',
  );
}

{
  const range = {
    startMs: Date.parse('2026-08-14T00:00:00'),
    endMs: Date.parse('2026-08-15T23:59:59.999'),
  };
  const daily = buildRepairTechnicianDailyOutcomes(
    [
      job({ id: 'c1', status: 'repairing', createdAt: '2026-08-14T10:00:00' }),
      job({
        id: 'f1',
        status: 'delivered',
        createdAt: '2026-08-10T10:00:00',
        deliveredAt: '2026-08-15T12:00:00',
      }),
      job({
        id: 'u1',
        status: 'unrepairable',
        createdAt: '2026-08-14T08:00:00',
        resolvedAt: '2026-08-14T18:00:00',
      }),
    ],
    range,
  );
  assert.equal(daily.length, 2);
  const day14 = daily[0];
  const day15 = daily[1];
  assert.equal(day14.created, 2);
  assert.equal(day14.unrepairable, 1);
  assert.equal(day15.fixed, 1);
}

{
  const nowMs = Date.parse('2026-08-15T12:00:00Z');
  const bars = buildRepairOpenAgingBars(
    [
      job({ id: 'fresh', status: 'repairing', createdAt: '2026-08-15T06:00:00Z' }),
      job({ id: 'week', status: 'repairing', createdAt: '2026-08-07T12:00:00Z' }),
      job({ id: 'old', status: 'repairing', createdAt: '2026-07-01T12:00:00Z' }),
      job({ id: 'closed', status: 'delivered', createdAt: '2026-07-01T12:00:00Z' }),
    ],
    OPEN,
    nowMs,
  );
  assert.equal(bars.length, 5);
  assert.equal(bars.reduce((s, b) => s + b.value, 0), 3);
  assert.ok(bars[0].value >= 1, 'fresh job in 0–1 day bucket');
  assert.ok(bars[4].value >= 1, 'old job in +14 day bucket');
}

console.log('repair-technician-home-metrics.test.ts: ok');

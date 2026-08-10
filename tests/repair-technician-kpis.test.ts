/**
 * Manager technician KPI analysis helpers.
 * Run: npx --yes tsx tests/repair-technician-kpis.test.ts
 */
import assert from 'node:assert/strict';
import {
  UNASSIGNED_TECHNICIAN_ID,
  buildCountBars,
  buildRepairTechAttentionQueue,
  buildRepairTechWorkloadBars,
  buildRepairTechnicianPerfRows,
  compareTechnicianToTeam,
  compareTwoTechnicians,
  filterRepairTechKpiJobs,
  formatRepairTechKpiPeriodLabel,
  isRepairTechKpiPeriod,
  isRepairTechKpiSortKey,
  listDelayedJobsForScope,
  resolveRepairTechKpiDateInputs,
  resolveRepairTechKpiRange,
  sortRepairTechnicianPerfRows,
  summarizeRepairTechTeam,
  type RepairTechKpiJob,
} from '../modules/repair/lib/repairTechnicianKpis.ts';

const OPEN = ['received', 'diagnosing', 'waiting_parts', 'repairing', 'testing', 'ready'] as const;

function job(partial: Partial<RepairTechKpiJob> & { status: string }): RepairTechKpiJob {
  return {
    id: partial.id || 'j1',
    receiptNo: partial.receiptNo || 'R-1',
    technicianId: partial.technicianId,
    branchId: partial.branchId || 'b1',
    status: partial.status,
    deviceType: partial.deviceType || 'mobile',
    createdAt: partial.createdAt,
    assignedAt: partial.assignedAt,
    updatedAt: partial.updatedAt,
    deliveredAt: partial.deliveredAt,
    resolvedAt: partial.resolvedAt,
    closedAt: partial.closedAt,
    dueAt: partial.dueAt,
    revenue: partial.revenue ?? 0,
    technicianReleaseEvents: partial.technicianReleaseEvents,
  };
}

{
  const now = new Date('2026-08-15T12:00:00');
  const month = resolveRepairTechKpiRange('month', {}, now);
  assert.equal(new Date(month.startMs).getDate(), 1);
  assert.equal(new Date(month.startMs).getMonth(), 7);

  const dates = resolveRepairTechKpiDateInputs('month', now);
  assert.equal(dates.from, '2026-08-01');
  assert.equal(dates.to, '2026-08-15');

  const custom = resolveRepairTechKpiRange('custom', { from: '2026-08-01', to: '2026-08-10' }, now);
  assert.ok(custom.startMs < custom.endMs);
  assert.equal(new Date(custom.endMs).getDate(), 10);
}

{
  const nowMs = Date.parse('2026-08-15T12:00:00');
  const range = resolveRepairTechKpiRange('month', {}, new Date(nowMs));

  const jobs: RepairTechKpiJob[] = [
    job({
      id: 'd1',
      technicianId: 't1',
      status: 'delivered',
      createdAt: '2026-08-02T10:00:00',
      assignedAt: '2026-08-02T10:00:00',
      deliveredAt: '2026-08-05T10:00:00',
      revenue: 200,
      deviceType: 'laptop',
    }),
    job({
      id: 'u1',
      technicianId: 't1',
      status: 'unrepairable',
      createdAt: '2026-08-03T10:00:00',
      resolvedAt: '2026-08-04T10:00:00',
      revenue: 0,
    }),
    job({
      id: 'o1',
      technicianId: 't2',
      status: 'repairing',
      createdAt: '2026-08-10T10:00:00',
      dueAt: '2026-08-12T10:00:00',
    }),
    job({
      id: 'old',
      technicianId: 't1',
      status: 'delivered',
      createdAt: '2026-07-01T10:00:00',
      deliveredAt: '2026-07-02T10:00:00',
      revenue: 999,
    }),
    job({
      id: 'none',
      status: 'received',
      createdAt: '2026-08-14T10:00:00',
    }),
  ];

  const filtered = filterRepairTechKpiJobs(jobs, { range });
  assert.equal(filtered.length, 4);
  assert.ok(!filtered.some((j) => j.id === 'old'));

  const rows = buildRepairTechnicianPerfRows(filtered, { openStatusIds: OPEN, nowMs });
  const t1 = rows.find((r) => r.technicianId === 't1');
  const t2 = rows.find((r) => r.technicianId === 't2');
  const unassigned = rows.find((r) => r.technicianId === UNASSIGNED_TECHNICIAN_ID);

  assert.ok(t1);
  assert.equal(t1!.delivered, 1);
  assert.equal(t1!.unrepairable, 1);
  assert.equal(t1!.successRate, 50);
  assert.equal(t1!.revenue, 200);
  assert.ok(t1!.avgRepairDays != null && Math.abs(t1!.avgRepairDays! - 3) < 0.01);
  assert.equal(t1!.deviceBreakdown.laptop, 1);

  assert.ok(t2);
  assert.equal(t2!.open, 1);
  assert.equal(t2!.delayed, 1);

  assert.ok(unassigned);
  assert.equal(unassigned!.total, 1);

  const team = summarizeRepairTechTeam(rows, filtered, { openStatusIds: OPEN, nowMs });
  assert.equal(team.totalJobs, 4);
  assert.equal(team.delayed, 1);
  assert.equal(team.technicianCount, 2);
  assert.equal(team.successRate, 50);

  const sorted = sortRepairTechnicianPerfRows(rows, 'delayed', 'desc');
  assert.equal(sorted[0].technicianId, 't2');

  const bars = buildCountBars({ laptop: 2, mobile: 1 });
  assert.equal(bars[0].key, 'laptop');
  assert.equal(bars[0].share, (2 / 3) * 100);
}

{
  const range = resolveRepairTechKpiRange('custom', { from: '2026-08-01', to: '2026-08-31' });
  const jobs = [
    job({ id: 'a', technicianId: 'tech-aa', status: 'delivered', deliveredAt: '2026-08-05T00:00:00', createdAt: '2026-08-01' }),
    job({ id: 'b', technicianId: 'tech-bb', status: 'delivered', deliveredAt: '2026-08-05T00:00:00', createdAt: '2026-08-01' }),
  ];
  const names = new Map([['tech-aa', 'أحمد'], ['tech-bb', 'سارة']]);
  const filtered = filterRepairTechKpiJobs(jobs, {
    range,
    technicianQuery: 'أحمد',
    technicianNameById: names,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'a');
}

{
  const nowMs = Date.parse('2026-08-15T12:00:00');
  const jobs: RepairTechKpiJob[] = [
    job({
      id: 'slow',
      technicianId: 't-slow',
      status: 'delivered',
      createdAt: '2026-08-01T10:00:00',
      assignedAt: '2026-08-01T10:00:00',
      deliveredAt: '2026-08-14T10:00:00',
      revenue: 50,
    }),
    job({
      id: 'slow2',
      technicianId: 't-slow',
      status: 'delivered',
      createdAt: '2026-08-02T10:00:00',
      assignedAt: '2026-08-02T10:00:00',
      deliveredAt: '2026-08-14T10:00:00',
      revenue: 50,
    }),
    job({
      id: 'fail1',
      technicianId: 't-fail',
      status: 'unrepairable',
      createdAt: '2026-08-03T10:00:00',
      resolvedAt: '2026-08-04T10:00:00',
    }),
    job({
      id: 'fail2',
      technicianId: 't-fail',
      status: 'unrepairable',
      createdAt: '2026-08-05T10:00:00',
      resolvedAt: '2026-08-06T10:00:00',
    }),
    job({
      id: 'late',
      technicianId: 't-late',
      status: 'repairing',
      createdAt: '2026-08-10T10:00:00',
      dueAt: '2026-08-12T10:00:00',
    }),
    job({
      id: 'fast',
      technicianId: 't-fast',
      status: 'delivered',
      createdAt: '2026-08-10T10:00:00',
      assignedAt: '2026-08-10T10:00:00',
      deliveredAt: '2026-08-11T10:00:00',
      revenue: 300,
    }),
  ];

  const rows = buildRepairTechnicianPerfRows(jobs, { openStatusIds: OPEN, nowMs });
  const team = summarizeRepairTechTeam(rows, jobs, { openStatusIds: OPEN, nowMs });
  const delayed = listDelayedJobsForScope(jobs, OPEN, nowMs);
  assert.equal(delayed.length, 1);
  assert.ok(delayed[0].overdueDays >= 2);

  const attention = buildRepairTechAttentionQueue(rows, team, 5);
  assert.ok(attention.some((a) => a.technicianId === 't-late' && a.reasons.includes('delayed')));
  assert.ok(attention.some((a) => a.technicianId === 't-fail' && a.reasons.includes('low_success')));

  const slow = rows.find((r) => r.technicianId === 't-slow')!;
  const fast = rows.find((r) => r.technicianId === 't-fast')!;
  const delta = compareTechnicianToTeam(fast, team);
  assert.ok(delta.revenueShare > 0);
  assert.ok((delta.successRateDelta ?? 0) >= 0);

  const cmp = compareTwoTechnicians(fast, slow);
  assert.ok((cmp.successRateDelta ?? 0) >= 0);
  assert.ok(cmp.revenueDelta > 0);
}

{
  const rows = buildRepairTechnicianPerfRows([
    job({ id: 'w1', technicianId: 'a', status: 'delivered', deliveredAt: '2026-08-05', createdAt: '2026-08-01', revenue: 100 }),
    job({ id: 'w2', technicianId: 'a', status: 'delivered', deliveredAt: '2026-08-06', createdAt: '2026-08-01', revenue: 100 }),
    job({ id: 'w3', technicianId: 'b', status: 'delivered', deliveredAt: '2026-08-07', createdAt: '2026-08-01', revenue: 50 }),
  ], { openStatusIds: OPEN });
  const workload = buildRepairTechWorkloadBars(rows);
  assert.equal(workload.length, 2);
  assert.equal(workload[0].technicianId, 'a');
  assert.equal(workload[0].jobsShare, (2 / 3) * 100);
  assert.equal(workload[0].revenueShare, (200 / 250) * 100);
  assert.equal(formatRepairTechKpiPeriodLabel('month', '2026-08-01', '2026-08-15'), 'هذا الشهر');
  assert.equal(formatRepairTechKpiPeriodLabel('custom', '2026-08-01', '2026-08-10'), '2026-08-01 → 2026-08-10');
  assert.equal(isRepairTechKpiPeriod('week'), true);
  assert.equal(isRepairTechKpiPeriod('year'), false);
  assert.equal(isRepairTechKpiSortKey('delayed'), true);
}

{
  const nowMs = Date.parse('2026-08-15T12:00:00');
  const range = resolveRepairTechKpiRange('month', {}, new Date(nowMs));
  const periodJobs: RepairTechKpiJob[] = [
    job({
      id: 'd1',
      technicianId: 't1',
      status: 'delivered',
      createdAt: '2026-08-02T10:00:00',
      deliveredAt: '2026-08-05T10:00:00',
      revenue: 100,
    }),
  ];
  const liveJobs: RepairTechKpiJob[] = [
    ...periodJobs,
    job({
      id: 'open-now',
      technicianId: 't1',
      status: 'diagnosing',
      createdAt: '2026-07-01T10:00:00', // outside period activity
    }),
    job({
      id: 'released-job',
      status: 'received',
      createdAt: '2026-08-10T10:00:00',
      technicianReleaseEvents: [
        { technicianId: 't1', at: '2026-08-12T10:00:00' },
        { technicianId: 't1', at: '2026-07-02T10:00:00' }, // outside period
      ],
    }),
  ];

  const rows = buildRepairTechnicianPerfRows(periodJobs, {
    openStatusIds: OPEN,
    nowMs,
    liveJobs,
    range,
  });
  const t1 = rows.find((r) => r.technicianId === 't1');
  assert.ok(t1);
  assert.equal(t1!.assignedNow, 1);
  assert.equal(t1!.released, 1);
  // successRate = delivered / (delivered + unrepairable + released) = 1/2
  assert.equal(t1!.successRate, 50);

  const team = summarizeRepairTechTeam(rows, periodJobs, { openStatusIds: OPEN, nowMs });
  assert.equal(team.assignedNow, 1);
  assert.equal(team.released, 1);
  assert.equal(team.successRate, 50);
  assert.equal(isRepairTechKpiSortKey('assignedNow'), true);
  assert.equal(isRepairTechKpiSortKey('released'), true);
}

console.log('repair-technician-kpis.test.ts: ok');

import assert from 'node:assert/strict';
import { resolveRepairSettings } from '../modules/repair/config/repairSettings';
import { resolveRepairStatusChip } from '../modules/repair/lib/repairStatusChipStyle';
import { isOpenRepairJob } from '../modules/repair/lib/repairAdminDashboardMetrics';
import { isRepairJobOpenStatus } from '../modules/repair/lib/repairTechnicianHomeMetrics';
import { listAllowedWorkshopStatusTargets } from '../modules/repair/utils/repairStatusTransitions';
import { summarizeRepairJobs } from '../modules/repair/utils/repairBusinessLogic';
import type { SystemSettings } from '../types';

const legacySettings = {
  repairSettings: {
    workflow: {
      statuses: [
        { id: 'received', label: 'وارد', color: '#64748b', order: 1, isTerminal: false, isEnabled: true },
        { id: 'inspection', label: 'فحص', color: '#f59e0b', order: 2, isTerminal: false, isEnabled: true },
        { id: 'estimate_ready', label: 'التقدير جاهز لمراجعة الاستقبال', color: '#0284c7', order: 3, isTerminal: false, isEnabled: true },
        { id: 'repair', label: 'إصلاح', color: '#0ea5e9', order: 4, isTerminal: false, isEnabled: true },
        { id: 'ready', label: 'جاهز للتسليم', color: '#22c55e', order: 5, isTerminal: false, isEnabled: true },
        { id: 'delivered', label: 'تم التسليم', color: '#16a34a', order: 6, isTerminal: true, isEnabled: true },
        { id: 'unrepairable', label: 'غير قابل للإصلاح', color: '#ef4444', order: 7, isTerminal: true, isEnabled: true },
      ],
      initialStatusId: 'received',
      openStatusIds: ['received', 'inspection', 'estimate_ready', 'repair', 'ready'],
      assignmentTriggerStatusIds: ['inspection', 'repair'],
    },
  },
} as SystemSettings;

{
  const resolved = resolveRepairSettings(legacySettings);
  const ids = resolved.workflow.statuses.map((s) => s.id);
  assert.ok(ids.includes('diagnosing'));
  assert.ok(ids.includes('repairing'));
  assert.equal(ids.includes('inspection'), false);
  assert.equal(ids.includes('repair'), false);
  assert.equal(resolved.statusMap.diagnosing?.label, 'فحص');
  assert.equal(resolved.statusMap.repairing?.label, 'إصلاح');
  assert.ok(resolved.workflow.openStatusIds.includes('diagnosing'));
  assert.ok(resolved.workflow.openStatusIds.includes('repairing'));
  assert.ok(resolved.workflow.assignmentTriggerStatusIds.includes('diagnosing'));
  assert.ok(resolved.workflow.assignmentTriggerStatusIds.includes('repairing'));

  const workshop = listAllowedWorkshopStatusTargets({
    fromStatus: 'received',
    statuses: resolved.workflow.statuses,
  });
  assert.ok(workshop.includes('diagnosing'));
  assert.ok(workshop.includes('estimate_ready'));

  const chip = resolveRepairStatusChip('inspection', resolved.statusMap);
  assert.equal(chip.label, 'فحص');

  assert.equal(isOpenRepairJob({ status: 'diagnosing' }, resolved.workflow.openStatusIds), true);
  assert.equal(isRepairJobOpenStatus('inspection', ['inspection', 'repair']), true);
  assert.equal(isRepairJobOpenStatus('diagnosing', ['inspection', 'repair']), true);

  const summary = summarizeRepairJobs(
    [
      { status: 'diagnosing' } as any,
      { status: 'repairing' } as any,
      { status: 'delivered' } as any,
    ],
    ['received', 'inspection', 'repair', 'ready'],
  );
  assert.equal(summary.open, 2);
  assert.equal(summary.delivered, 1);
}

console.log('repair-legacy-status-settings.test.ts: ok');

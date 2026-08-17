import assert from 'node:assert/strict';
import { resolveRepairSettings } from '../modules/repair/config/repairSettings';
import {
  assignDefaultRolesToStatuses,
  resolveNextStatusForAction,
  statusIdForRole,
  validateMandatoryStatusRoles,
} from '../modules/repair/lib/repairStatusAdvance';
import type { SystemSettings } from '../types';

const defaultStatuses = resolveRepairSettings(null).workflow.statuses;

{
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'received',
      statuses: defaultStatuses,
      hasDiagnosis: true,
    }),
    'diagnosed',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      hasDiagnosis: true,
    }),
    'diagnosed',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      hasDiagnosis: true,
      hasServiceOrPartSignal: true,
    }),
    'estimate_ready',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'diagnosed',
      statuses: defaultStatuses,
      waitsForParts: true,
    }),
    'estimate_ready',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      waitsForParts: true,
    }),
    'estimate_ready',
  );
  assert.notEqual(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      waitsForParts: true,
    }),
    'waiting_parts',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'estimate_sent',
      currentStatus: 'estimate_ready',
      statuses: defaultStatuses,
    }),
    'waiting_approval',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'customer_approved',
      currentStatus: 'waiting_approval',
      statuses: defaultStatuses,
      waitsForParts: true,
    }),
    'waiting_parts',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'customer_approved',
      currentStatus: 'waiting_approval',
      statuses: defaultStatuses,
      waitsForParts: false,
    }),
    'repairing',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'parts_ready',
      currentStatus: 'waiting_parts',
      statuses: defaultStatuses,
    }),
    'repairing',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'repair_done',
      currentStatus: 'repairing',
      statuses: defaultStatuses,
    }),
    'ready',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'repair_done',
      currentStatus: 'received',
      statuses: defaultStatuses,
    }),
    null,
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'repairing',
      statuses: defaultStatuses,
      waitsForParts: true,
    }),
    'waiting_parts',
  );
}

{
  // Full manufacturer warranty: customer pays 0 — skip pricing approval.
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      hasDiagnosis: true,
      hasServiceOrPartSignal: true,
      skipCustomerApproval: true,
    }),
    'repairing',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      hasDiagnosis: true,
      hasServiceOrPartSignal: true,
      waitsForParts: true,
      skipCustomerApproval: true,
    }),
    'waiting_parts',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'diagnosed',
      statuses: defaultStatuses,
      skipCustomerApproval: true,
    }),
    'repairing',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'estimate_ready',
      statuses: defaultStatuses,
      skipCustomerApproval: true,
    }),
    'repairing',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'part_or_service_linked',
      currentStatus: 'waiting_approval',
      statuses: defaultStatuses,
      skipCustomerApproval: true,
    }),
    'repairing',
  );
  // Billable / mixed jobs still wait for customer pricing approval.
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'diagnosing',
      statuses: defaultStatuses,
      hasDiagnosis: true,
      hasServiceOrPartSignal: true,
      skipCustomerApproval: false,
    }),
    'estimate_ready',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'repair_done',
      currentStatus: 'estimate_ready',
      statuses: defaultStatuses,
      skipCustomerApproval: true,
    }),
    'ready',
  );
  assert.equal(
    resolveNextStatusForAction({
      action: 'repair_done',
      currentStatus: 'estimate_ready',
      statuses: defaultStatuses,
    }),
    null,
  );
}

{
  const custom = assignDefaultRolesToStatuses([
    { id: 'received', order: 1, role: 'intake', isEnabled: true },
    { id: 'custom_inspect', order: 2, role: 'diagnosis', isEnabled: true },
    { id: 'estimate_ready', order: 3, role: 'estimate_review', isEnabled: true },
    { id: 'waiting_approval', order: 4, role: 'awaiting_customer', isEnabled: true },
    { id: 'repairing', order: 5, role: 'in_repair', isEnabled: true },
    { id: 'ready', order: 6, role: 'ready_delivery', isEnabled: true },
    { id: 'unrepairable', order: 7, role: 'unrepairable', isEnabled: true, isTerminal: true },
  ]);
  // Custom configs without in_diagnosis still advance diagnosis_saved → diagnosis role target.
  assert.equal(
    resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: 'received',
      statuses: custom,
      hasDiagnosis: true,
    }),
    'custom_inspect',
  );
  assert.equal(statusIdForRole('diagnosis', custom), 'custom_inspect');
}

{
  const resolved = resolveRepairSettings({
    repairSettings: {
      workflow: {
        statuses: [
          { id: 'received', label: 'وارد', order: 1, isEnabled: true },
          { id: 'diagnosing', label: 'فحص مخصص', order: 2, isEnabled: true },
          { id: 'estimate_ready', label: 'تقدير', order: 3, isEnabled: true },
          { id: 'waiting_approval', label: 'موافقة', order: 4, isEnabled: true },
          { id: 'waiting_parts', label: 'قطع', order: 5, isEnabled: true },
          { id: 'repairing', label: 'إصلاح', order: 6, isEnabled: true },
          { id: 'ready', label: 'جاهز', order: 7, isEnabled: true },
          { id: 'delivered', label: 'تسليم', order: 8, isTerminal: true, isEnabled: true },
          { id: 'cancelled', label: 'ملغى', order: 9, isTerminal: true, isEnabled: true },
          { id: 'unrepairable', label: 'غير قابل', order: 10, isTerminal: true, isEnabled: true },
        ],
      },
    },
  } as SystemSettings);
  assert.equal(resolved.statusMap.diagnosing?.role, 'in_diagnosis');
  assert.equal(resolved.statusMap.diagnosing?.label, 'فحص مخصص');
  assert.equal(resolved.statusMap.diagnosed?.role, 'diagnosis');
  assert.equal(resolved.statusMap.diagnosed?.label, 'تم الفحص');
  assert.equal(resolved.statusMap.received?.role, 'intake');
  assert.equal(validateMandatoryStatusRoles(resolved.workflow.statuses).length, 0);
}

{
  const missing = validateMandatoryStatusRoles([
    { id: 'received', order: 1, role: 'intake', isEnabled: true },
    { id: 'ready', order: 2, role: 'ready_delivery', isEnabled: true },
  ]);
  assert.ok(missing.length > 0);
  assert.ok(missing[0]?.includes('لا يمكن الحفظ'));
}

{
  // Explicit `none` on a canonical id falls back to the default role for that id.
  const restored = validateMandatoryStatusRoles([
    { id: 'received', order: 1, role: 'none', isEnabled: true },
    { id: 'diagnosing', order: 2, role: 'none', isEnabled: true },
    { id: 'diagnosed', order: 3, role: 'none', isEnabled: true },
    { id: 'estimate_ready', order: 4, role: 'none', isEnabled: true },
    { id: 'waiting_approval', order: 5, role: 'none', isEnabled: true },
    { id: 'repairing', order: 6, role: 'none', isEnabled: true },
    { id: 'ready', order: 7, role: 'none', isEnabled: true },
    { id: 'unrepairable', order: 8, role: 'none', isEnabled: true, isTerminal: true },
  ]);
  assert.equal(restored.length, 0);
}

{
  const defaults = resolveRepairSettings(null);
  assert.equal(defaults.statusMap.diagnosing?.label, 'جاري الفحص');
  assert.equal(defaults.statusMap.diagnosing?.role, 'in_diagnosis');
  assert.equal(defaults.statusMap.diagnosed?.label, 'تم الفحص');
  assert.equal(defaults.statusMap.diagnosed?.role, 'diagnosis');
}

{
  // Legacy config without waiting_approval / estimate_ready / diagnosed gets them backfilled.
  const healed = resolveRepairSettings({
    repairSettings: {
      workflow: {
        statuses: [
          { id: 'received', label: 'وارد', order: 1, isEnabled: true },
          { id: 'diagnosing', label: 'فحص', order: 2, isEnabled: true },
          { id: 'repairing', label: 'إصلاح', order: 3, isEnabled: true },
          { id: 'ready', label: 'جاهز', order: 4, isEnabled: true },
          { id: 'delivered', label: 'تسليم', order: 5, isTerminal: true, isEnabled: true },
          { id: 'cancelled', label: 'ملغى', order: 6, isTerminal: true, isEnabled: true },
          { id: 'unrepairable', label: 'غير قابل', order: 7, isTerminal: true, isEnabled: true },
        ],
      },
    },
  } as SystemSettings);
  assert.equal(healed.statusMap.diagnosing?.role, 'in_diagnosis');
  assert.equal(healed.statusMap.diagnosing?.label, 'جاري الفحص');
  assert.equal(healed.statusMap.diagnosed?.role, 'diagnosis');
  assert.equal(healed.statusMap.estimate_ready?.role, 'estimate_review');
  assert.equal(healed.statusMap.waiting_approval?.role, 'awaiting_customer');
  assert.equal(validateMandatoryStatusRoles(healed.workflow.statuses).length, 0);
}

console.log('repair-status-advance.test.ts: ok');

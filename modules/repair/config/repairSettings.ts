import type { RepairSettings, SystemSettings } from '../../../types';

export type ResolvedRepairStatus = {
  id: string;
  label: string;
  color: string;
  order: number;
  isTerminal: boolean;
  isEnabled: boolean;
};

const DEFAULT_STATUSES: ResolvedRepairStatus[] = [
  { id: 'received', label: 'وارد', color: '#64748b', order: 1, isTerminal: false, isEnabled: true },
  { id: 'diagnosing', label: 'تشخيص', color: '#f59e0b', order: 2, isTerminal: false, isEnabled: true },
  { id: 'waiting_approval', label: 'بانتظار موافقة العميل', color: '#a855f7', order: 3, isTerminal: false, isEnabled: true },
  { id: 'waiting_parts', label: 'بانتظار قطع الغيار', color: '#ea580c', order: 4, isTerminal: false, isEnabled: true },
  { id: 'repairing', label: 'إصلاح', color: '#0ea5e9', order: 5, isTerminal: false, isEnabled: true },
  { id: 'testing', label: 'اختبار', color: '#6366f1', order: 6, isTerminal: false, isEnabled: true },
  { id: 'ready', label: 'جاهز للتسليم', color: '#22c55e', order: 7, isTerminal: false, isEnabled: true },
  { id: 'delivered', label: 'تم التسليم', color: '#16a34a', order: 8, isTerminal: true, isEnabled: true },
  { id: 'cancelled', label: 'ملغى', color: '#78716c', order: 9, isTerminal: true, isEnabled: true },
  { id: 'unrepairable', label: 'غير قابل للإصلاح', color: '#ef4444', order: 10, isTerminal: true, isEnabled: true },
];

const DEFAULT_REPAIR_SETTINGS = {
  access: { managerScope: 'branch' as const },
  workflow: {
    statuses: DEFAULT_STATUSES,
    initialStatusId: 'received',
    openStatusIds: [
      'received',
      'diagnosing',
      'waiting_approval',
      'waiting_parts',
      'repairing',
      'testing',
      'ready',
    ],
    assignmentTriggerStatusIds: ['diagnosing', 'waiting_parts', 'repairing', 'testing'],
  },
  defaults: {
    defaultWarranty: 'none' as const,
    defaultMinStock: 1,
    defaultSlaHours: 24,
  },
  treasury: {
    autoClose: {
      enabled: true,
      mode: 'scheduled_midnight' as const,
      timezone: 'Africa/Cairo',
      blockOperationsIfPrevDayOpen: true,
    },
  },
};

export const resolveRepairSettings = (
  systemSettings: SystemSettings | null | undefined,
): Required<RepairSettings> & {
  workflow: {
    statuses: ResolvedRepairStatus[];
    initialStatusId: string;
    openStatusIds: string[];
    assignmentTriggerStatusIds: string[];
  };
  statusMap: Record<string, ResolvedRepairStatus>;
} => {
  const fromRoot = systemSettings?.repairSettings;
  const fallbackManagerScope = systemSettings?.repairAccess?.managerScope;
  const rawStatuses = Array.isArray(fromRoot?.workflow?.statuses) ? fromRoot.workflow.statuses : [];
  const statuses = (rawStatuses.length > 0 ? rawStatuses : DEFAULT_STATUSES)
    .map((status, index) => ({
      id: String(status?.id || '').trim(),
      label: String(status?.label || '').trim() || String(status?.id || '').trim(),
      color: String(status?.color || '').trim() || '#64748b',
      order: Number.isFinite(Number(status?.order)) ? Number(status?.order) : index + 1,
      isTerminal: Boolean(status?.isTerminal),
      isEnabled: status?.isEnabled !== false,
    }))
    .filter((status) => status.id.length > 0)
    .sort((a, b) => a.order - b.order);
  const enabledStatuses = statuses.filter((status) => status.isEnabled);
  const initialStatusId = String(fromRoot?.workflow?.initialStatusId || '').trim()
    || (enabledStatuses[0]?.id || DEFAULT_REPAIR_SETTINGS.workflow.initialStatusId);
  const openStatusIds = Array.isArray(fromRoot?.workflow?.openStatusIds)
    ? fromRoot.workflow.openStatusIds.map((id) => String(id || '').trim()).filter(Boolean)
    : enabledStatuses.filter((status) => !status.isTerminal).map((status) => status.id);
  const normalizedOpenStatusIds = openStatusIds.length > 0 ? openStatusIds : DEFAULT_REPAIR_SETTINGS.workflow.openStatusIds;
  const rawAssignment = Array.isArray(fromRoot?.workflow?.assignmentTriggerStatusIds)
    ? fromRoot.workflow.assignmentTriggerStatusIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const assignmentTriggerStatusIds =
    rawAssignment.length > 0 ? rawAssignment : (DEFAULT_REPAIR_SETTINGS.workflow.assignmentTriggerStatusIds || []);
  const statusMap = Object.fromEntries(statuses.map((status) => [status.id, status]));

  return {
    access: {
      managerScope:
        fromRoot?.access?.managerScope === 'centers' || fromRoot?.access?.managerScope === 'branch'
          ? fromRoot.access.managerScope
          : (fallbackManagerScope === 'centers' || fallbackManagerScope === 'branch'
            ? fallbackManagerScope
            : DEFAULT_REPAIR_SETTINGS.access.managerScope),
    },
    workflow: {
      statuses,
      initialStatusId,
      openStatusIds: normalizedOpenStatusIds,
      assignmentTriggerStatusIds,
    },
    defaults: {
      defaultWarranty:
        fromRoot?.defaults?.defaultWarranty === '3months'
        || fromRoot?.defaults?.defaultWarranty === '6months'
        || fromRoot?.defaults?.defaultWarranty === 'none'
          ? fromRoot.defaults.defaultWarranty
          : DEFAULT_REPAIR_SETTINGS.defaults.defaultWarranty,
      defaultMinStock:
        typeof fromRoot?.defaults?.defaultMinStock === 'number'
        ? Math.max(0, Math.round(fromRoot.defaults.defaultMinStock))
        : DEFAULT_REPAIR_SETTINGS.defaults.defaultMinStock,
      defaultSlaHours:
        typeof fromRoot?.defaults?.defaultSlaHours === 'number'
        ? Math.max(0, Math.round(fromRoot.defaults.defaultSlaHours))
        : DEFAULT_REPAIR_SETTINGS.defaults.defaultSlaHours,
    },
    treasury: {
      autoClose: {
        enabled: fromRoot?.treasury?.autoClose?.enabled ?? DEFAULT_REPAIR_SETTINGS.treasury.autoClose.enabled,
        mode: 'scheduled_midnight',
        timezone: String(fromRoot?.treasury?.autoClose?.timezone || systemSettings?.branding?.timezone || DEFAULT_REPAIR_SETTINGS.treasury.autoClose.timezone),
        blockOperationsIfPrevDayOpen:
          fromRoot?.treasury?.autoClose?.blockOperationsIfPrevDayOpen
          ?? DEFAULT_REPAIR_SETTINGS.treasury.autoClose.blockOperationsIfPrevDayOpen,
      },
    },
    statusMap,
  };
};


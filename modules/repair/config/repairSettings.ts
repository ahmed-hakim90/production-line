import type {
  RepairAccessoryCatalogItem,
  RepairServiceCatalogItem,
  RepairSettings,
  SystemSettings,
} from '../../../types';

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
  { id: 'estimate_ready', label: 'التقدير جاهز لمراجعة الاستقبال', color: '#0284c7', order: 3, isTerminal: false, isEnabled: true },
  { id: 'waiting_approval', label: 'بانتظار موافقة العميل', color: '#a855f7', order: 4, isTerminal: false, isEnabled: true },
  { id: 'waiting_parts', label: 'بانتظار قطع الغيار', color: '#ea580c', order: 5, isTerminal: false, isEnabled: true },
  { id: 'repairing', label: 'إصلاح', color: '#0ea5e9', order: 6, isTerminal: false, isEnabled: true },
  { id: 'testing', label: 'اختبار', color: '#6366f1', order: 7, isTerminal: false, isEnabled: true },
  { id: 'ready', label: 'جاهز للتسليم', color: '#22c55e', order: 8, isTerminal: false, isEnabled: true },
  { id: 'delivered', label: 'تم التسليم', color: '#16a34a', order: 9, isTerminal: true, isEnabled: true },
  { id: 'cancelled', label: 'ملغى', color: '#78716c', order: 10, isTerminal: true, isEnabled: true },
  { id: 'unrepairable', label: 'غير قابل للإصلاح', color: '#ef4444', order: 11, isTerminal: true, isEnabled: true },
];

const DEFAULT_ACCESSORIES: RepairAccessoryCatalogItem[] = [
  { id: 'charger', label: 'شاحن', enabled: true },
  { id: 'cable', label: 'كابل', enabled: true },
  { id: 'case', label: 'جراب', enabled: true },
  { id: 'sim', label: 'شريحة', enabled: true },
  { id: 'memory_card', label: 'كرت ذاكرة', enabled: true },
];

const DEFAULT_SERVICES: RepairServiceCatalogItem[] = [
  { id: 'diagnosis', name: 'تشخيص', price: 50, enabled: true },
  { id: 'screen_repair', name: 'إصلاح شاشة', price: 200, enabled: true },
  { id: 'battery_replace', name: 'تغيير بطارية', price: 150, enabled: true },
  { id: 'software', name: 'صيانة برمجية', price: 100, enabled: true },
];

const DEFAULT_REPAIR_SETTINGS = {
  access: { managerScope: 'branch' as const },
  workflow: {
    statuses: DEFAULT_STATUSES,
    initialStatusId: 'received',
    openStatusIds: [
      'received',
      'diagnosing',
      'estimate_ready',
      'waiting_approval',
      'waiting_parts',
      'repairing',
      'testing',
      'ready',
    ],
    assignmentTriggerStatusIds: ['diagnosing', 'estimate_ready', 'waiting_parts', 'repairing', 'testing'],
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
  payments: {
    allowPartialCollection: true,
  },
  accessoriesCatalog: DEFAULT_ACCESSORIES,
  serviceCatalog: DEFAULT_SERVICES,
};

function normalizeAccessoriesCatalog(raw: unknown): RepairAccessoryCatalogItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_ACCESSORIES;
  return raw
    .map((row, index) => {
      const item = row as RepairAccessoryCatalogItem;
      const id = String(item?.id || '').trim() || `acc-${index + 1}`;
      const label = String(item?.label || '').trim();
      if (!label) return null;
      const categoryIds = Array.isArray(item?.categoryIds)
        ? item.categoryIds.map((cid) => String(cid || '').trim()).filter(Boolean)
        : [];
      return {
        id,
        label,
        enabled: item?.enabled !== false,
        ...(categoryIds.length > 0 ? { categoryIds } : {}),
      };
    })
    .filter(Boolean) as RepairAccessoryCatalogItem[];
}

function normalizeServiceCatalog(raw: unknown): RepairServiceCatalogItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SERVICES;
  return raw
    .map((row, index) => {
      const item = row as RepairServiceCatalogItem;
      const id = String(item?.id || '').trim() || `svc-${index + 1}`;
      const name = String(item?.name || '').trim();
      if (!name) return null;
      const price = Number(item?.price || 0);
      return {
        id,
        name,
        price: Number.isFinite(price) ? Math.max(0, price) : 0,
        enabled: item?.enabled !== false,
      };
    })
    .filter(Boolean) as RepairServiceCatalogItem[];
}

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
  const configuredStatuses = rawStatuses.length > 0 ? [...rawStatuses] : [...DEFAULT_STATUSES];
  if (!configuredStatuses.some((status) => String(status?.id || '') === 'estimate_ready')) {
    const diagnosingOrder = Number(configuredStatuses.find((status) => String(status?.id || '') === 'diagnosing')?.order || 2);
    configuredStatuses.push({
      id: 'estimate_ready',
      label: 'التقدير جاهز لمراجعة الاستقبال',
      color: '#0284c7',
      order: diagnosingOrder + 0.5,
      isTerminal: false,
      isEnabled: true,
    });
  }
  const statuses = configuredStatuses
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
  const accessoriesCatalog = normalizeAccessoriesCatalog(fromRoot?.accessoriesCatalog);
  const serviceCatalog = normalizeServiceCatalog(fromRoot?.serviceCatalog);

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
    payments: {
      allowPartialCollection:
        fromRoot?.payments?.allowPartialCollection
        ?? DEFAULT_REPAIR_SETTINGS.payments.allowPartialCollection,
    },
    accessoriesCatalog,
    serviceCatalog,
    statusMap,
  };
};

export function sumServiceCatalogPrices(
  serviceIds: string[] | undefined,
  catalog: RepairServiceCatalogItem[],
): number {
  if (!serviceIds?.length) return 0;
  const map = new Map(catalog.filter((s) => s.enabled !== false).map((s) => [s.id, s.price]));
  return serviceIds.reduce((sum, id) => sum + Math.max(0, Number(map.get(id) || 0)), 0);
}

export function accessoryLabelsFromIds(
  accessoryIds: string[] | undefined,
  catalog: RepairAccessoryCatalogItem[],
): string {
  if (!accessoryIds?.length) return '';
  const map = new Map(catalog.map((a) => [a.id, a.label]));
  return accessoryIds.map((id) => map.get(id) || id).filter(Boolean).join('، ');
}

/**
 * إكسسوارات ظاهرة لمنتج حسب فئته.
 * categoryIds فارغة = متاح لكل الفئات. بدون فئة منتج = نعرض فقط الإكسسوارات العامة.
 */
export function accessoriesForProductCategory(
  catalog: RepairAccessoryCatalogItem[],
  categoryId: string | null | undefined,
): RepairAccessoryCatalogItem[] {
  const enabled = catalog.filter((item) => item.enabled !== false);
  const cat = String(categoryId || '').trim();
  return enabled.filter((item) => {
    const ids = Array.isArray(item.categoryIds)
      ? item.categoryIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (ids.length === 0) return true;
    if (!cat) return false;
    return ids.includes(cat);
  });
}

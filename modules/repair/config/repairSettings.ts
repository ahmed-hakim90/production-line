import type {
  RepairAccessoryCatalogItem,
  RepairServiceCatalogItem,
  RepairSettings,
  RepairStatusRole,
  RepairUnrepairableReason,
  SystemSettings,
} from '../../../types';
import {
  assignDefaultRolesToStatuses,
  defaultRoleForStatusId,
  isRepairStatusRole,
  MANDATORY_REPAIR_STATUS_ROLES,
} from '../lib/repairStatusAdvance';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

export type ResolvedRepairStatus = {
  id: string;
  label: string;
  color: string;
  order: number;
  isTerminal: boolean;
  isEnabled: boolean;
  /** Semantic workflow role; filled by resolveRepairSettings (optional on ad-hoc fixtures). */
  role?: RepairStatusRole;
};

const DEFAULT_STATUSES: ResolvedRepairStatus[] = [
  { id: 'received', label: 'وارد', color: '#64748b', order: 1, isTerminal: false, isEnabled: true, role: 'intake' },
  { id: 'diagnosing', label: 'جاري الفحص', color: '#f59e0b', order: 2, isTerminal: false, isEnabled: true, role: 'in_diagnosis' },
  { id: 'diagnosed', label: 'تم الفحص', color: '#ca8a04', order: 3, isTerminal: false, isEnabled: true, role: 'diagnosis' },
  { id: 'estimate_ready', label: 'التقدير جاهز لمراجعة الاستقبال', color: '#0284c7', order: 4, isTerminal: false, isEnabled: true, role: 'estimate_review' },
  { id: 'waiting_approval', label: 'بانتظار موافقة العميل', color: '#a855f7', order: 5, isTerminal: false, isEnabled: true, role: 'awaiting_customer' },
  { id: 'waiting_parts', label: 'بانتظار قطع الغيار', color: '#ea580c', order: 6, isTerminal: false, isEnabled: true, role: 'awaiting_parts' },
  { id: 'repairing', label: 'إصلاح', color: '#0ea5e9', order: 7, isTerminal: false, isEnabled: true, role: 'in_repair' },
  { id: 'testing', label: 'اختبار', color: '#6366f1', order: 8, isTerminal: false, isEnabled: true, role: 'none' },
  { id: 'ready', label: 'جاهز للتسليم', color: '#22c55e', order: 9, isTerminal: false, isEnabled: true, role: 'ready_delivery' },
  { id: 'delivered', label: 'تم التسليم', color: '#16a34a', order: 10, isTerminal: true, isEnabled: true, role: 'delivered' },
  { id: 'cancelled', label: 'ملغى', color: '#78716c', order: 11, isTerminal: true, isEnabled: true, role: 'cancelled' },
  { id: 'unrepairable', label: 'غير قابل للإصلاح', color: '#ef4444', order: 12, isTerminal: true, isEnabled: true, role: 'unrepairable' },
];

const DEFAULT_ACCESSORIES: RepairAccessoryCatalogItem[] = [
  { id: 'charger', label: 'شاحن', enabled: true },
  { id: 'cable', label: 'كابل', enabled: true },
  { id: 'case', label: 'جراب', enabled: true },
  { id: 'sim', label: 'شريحة', enabled: true },
  { id: 'memory_card', label: 'كرت ذاكرة', enabled: true },
];

const DEFAULT_SERVICES: RepairServiceCatalogItem[] = [
  { id: 'diagnosis', name: 'تشخيص', price: 50, internalCost: 0, enabled: true },
  { id: 'screen_repair', name: 'إصلاح شاشة', price: 200, internalCost: 0, enabled: true },
  { id: 'battery_replace', name: 'تغيير بطارية', price: 150, internalCost: 0, enabled: true },
  { id: 'software', name: 'صيانة برمجية', price: 100, internalCost: 0, enabled: true },
];

export const DEFAULT_UNREPAIRABLE_REASONS: RepairUnrepairableReason[] = [
  { id: 'parts_unavailable', label: 'قطع الغيار غير متوفرة', enabled: true },
  { id: 'parts_discontinued', label: 'قطع الغيار متوقفة أو الموديل قديم', enabled: true },
  { id: 'uneconomical_repair', label: 'تكلفة الإصلاح غير اقتصادية', enabled: true },
  { id: 'severe_damage', label: 'تلف جسيم لا يمكن إصلاحه', enabled: true },
  { id: 'liquid_or_fire_damage', label: 'تلف بسبب سوائل أو حريق', enabled: true },
  { id: 'previous_tampering', label: 'عبث أو إصلاح سابق يمنع الإصلاح', enabled: true },
  { id: 'outside_service_scope', label: 'العطل خارج نطاق خدمات المركز', enabled: true },
  { id: 'other', label: 'سبب آخر', enabled: true },
];

const DEFAULT_REPAIR_SETTINGS = {
  access: { managerScope: 'branch' as const },
  workflow: {
    statuses: DEFAULT_STATUSES,
    initialStatusId: 'received',
    openStatusIds: [
      'received',
      'diagnosing',
      'diagnosed',
      'estimate_ready',
      'waiting_approval',
      'waiting_parts',
      'repairing',
      'testing',
      'ready',
    ],
    assignmentTriggerStatusIds: ['diagnosing', 'diagnosed', 'estimate_ready', 'waiting_parts', 'repairing', 'testing'],
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
  unrepairableReasons: DEFAULT_UNREPAIRABLE_REASONS,
};

function normalizeUnrepairableReasons(raw: unknown): RepairUnrepairableReason[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_UNREPAIRABLE_REASONS;
  const rows = raw.map((value, index) => {
    const row = value as RepairUnrepairableReason;
    const id = String(row?.id || `reason-${index + 1}`).trim();
    const label = String(row?.label || '').trim();
    return id && label ? { id, label, enabled: row?.enabled !== false } : null;
  }).filter(Boolean) as RepairUnrepairableReason[];
  return rows.length > 0 ? rows : DEFAULT_UNREPAIRABLE_REASONS;
}

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
      const internalCost = Number(item?.internalCost || 0);
      return {
        id,
        name,
        price: Number.isFinite(price) ? Math.max(0, price) : 0,
        internalCost: Number.isFinite(internalCost) ? Math.max(0, internalCost) : 0,
        enabled: item?.enabled !== false,
      };
    })
    .filter(Boolean) as RepairServiceCatalogItem[];
}

/** Legacy saved labels for diagnosing → canonical Arabic used on the jobs kanban. */
const LEGACY_DIAGNOSING_LABELS = new Set(['فحص', 'فحص (قديم)', 'inspection', 'diagnosing']);

function normalizeStatusLabel(id: string, rawLabel: string): string {
  const label = String(rawLabel || '').trim();
  if (id === 'diagnosing' && (!label || LEGACY_DIAGNOSING_LABELS.has(label))) {
    return 'جاري الفحص';
  }
  const fallback = DEFAULT_STATUSES.find((row) => row.id === id)?.label;
  return label || fallback || id;
}

/** Keep mandatory workflow roles visible (kanban / filters) even if a tenant disabled them. */
function ensureMandatoryRolesEnabled(rows: ResolvedRepairStatus[]): ResolvedRepairStatus[] {
  let next = rows.map((row) => ({ ...row }));
  for (const role of MANDATORY_REPAIR_STATUS_ROLES) {
    if (next.some((row) => row.isEnabled && row.role === role)) continue;
    const disabledIdx = next.findIndex((row) => row.role === role);
    if (disabledIdx >= 0) {
      next[disabledIdx] = { ...next[disabledIdx], isEnabled: true };
      continue;
    }
    const def = DEFAULT_STATUSES.find((row) => row.role === role);
    if (def) next = [...next, { ...def }].sort((a, b) => a.order - b.order);
  }
  return next;
}

/**
 * Older tenants bound role `diagnosis` on `diagnosing` (جاري الفحص).
 * Split so diagnosing = in_diagnosis and diagnosed (تم الفحص) owns diagnosis.
 */
function healDiagnosisRoleSplit(rows: ResolvedRepairStatus[]): ResolvedRepairStatus[] {
  const next = rows.map((row) => ({ ...row }));
  const diagnosing = next.find((row) => row.id === 'diagnosing');
  const diagnosed = next.find((row) => row.id === 'diagnosed');
  if (diagnosing && diagnosing.role === 'diagnosis') {
    diagnosing.role = 'in_diagnosis';
  }
  if (diagnosed && (diagnosed.role === 'none' || !diagnosed.role)) {
    diagnosed.role = 'diagnosis';
  }
  return next;
}

function ensureOpenStatusId(ids: string[], statusId: string, afterId?: string): void {
  if (ids.includes(statusId)) return;
  const afterIdx = afterId ? ids.indexOf(afterId) : -1;
  if (afterIdx >= 0) ids.splice(afterIdx + 1, 0, statusId);
  else ids.unshift(statusId);
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
  // Ensure canonical statuses that carry mandatory workflow roles still exist
  // (legacy tenants may lack estimate_ready / waiting_approval after earlier edits).
  for (const required of DEFAULT_STATUSES) {
    if (!required.role || required.role === 'none') continue;
    if (!MANDATORY_REPAIR_STATUS_ROLES.includes(required.role)) continue;
    const hasId = configuredStatuses.some(
      (status) => mapLegacyRepairStatus(String(status?.id || '')) === required.id,
    );
    if (hasId) continue;
    const hasRole = configuredStatuses.some((status) => {
      const id = mapLegacyRepairStatus(String(status?.id || ''));
      const roleRaw = (status as { role?: unknown })?.role;
      const role = isRepairStatusRole(roleRaw) && roleRaw !== 'none'
        ? roleRaw
        : defaultRoleForStatusId(id);
      return role === required.role && status?.isEnabled !== false;
    });
    if (hasRole) continue;
    const diagnosingOrder = configuredStatuses.find(
      (status) => mapLegacyRepairStatus(String(status?.id || '')) === 'diagnosing',
    );
    const nextOrder = required.id === 'diagnosed' && diagnosingOrder
      ? Number(diagnosingOrder.order || 2) + 0.5
      : required.order;
    configuredStatuses.push({ ...required, order: nextOrder });
  }
  const mappedStatuses = configuredStatuses
    .map((status, index) => {
      const id = mapLegacyRepairStatus(String(status?.id || '').trim());
      const roleRaw = (status as { role?: unknown })?.role;
      const role: RepairStatusRole = isRepairStatusRole(roleRaw)
        ? roleRaw
        : defaultRoleForStatusId(id);
      return {
        id,
        label: normalizeStatusLabel(id, String(status?.label || '')),
        color: String(status?.color || '').trim() || '#64748b',
        order: Number.isFinite(Number(status?.order)) ? Number(status?.order) : index + 1,
        isTerminal: Boolean(status?.isTerminal),
        isEnabled: status?.isEnabled !== false,
        role,
      };
    })
    .filter((status) => status.id.length > 0)
    .sort((a, b) => a.order - b.order);
  // Dedupe legacy+canonical pairs (inspection/diagnosing, repair/repairing).
  const deduped: ResolvedRepairStatus[] = [];
  const seenIds = new Set<string>();
  for (const status of mappedStatuses) {
    if (seenIds.has(status.id)) {
      const existing = deduped.find((row) => row.id === status.id);
      if (existing && status.isEnabled) existing.isEnabled = true;
      continue;
    }
    seenIds.add(status.id);
    deduped.push(status);
  }
  const statuses: ResolvedRepairStatus[] = ensureMandatoryRolesEnabled(
    healDiagnosisRoleSplit(assignDefaultRolesToStatuses(deduped)),
  );
  const enabledStatuses = statuses.filter((status) => status.isEnabled);
  const initialStatusId = mapLegacyRepairStatus(
    String(fromRoot?.workflow?.initialStatusId || '').trim()
      || (enabledStatuses[0]?.id || DEFAULT_REPAIR_SETTINGS.workflow.initialStatusId),
  );
  const openStatusIds = Array.isArray(fromRoot?.workflow?.openStatusIds)
    ? fromRoot.workflow.openStatusIds.map((id) => mapLegacyRepairStatus(String(id || '').trim())).filter(Boolean)
    : enabledStatuses.filter((status) => !status.isTerminal).map((status) => status.id);
  const normalizedOpenStatusIds = Array.from(new Set(
    openStatusIds.length > 0 ? openStatusIds : DEFAULT_REPAIR_SETTINGS.workflow.openStatusIds,
  ));
  // Keep inspection queue statuses in the open set for older tenant configs.
  if (enabledStatuses.some((row) => row.id === 'diagnosing')) {
    ensureOpenStatusId(normalizedOpenStatusIds, 'diagnosing', 'received');
  }
  if (enabledStatuses.some((row) => row.id === 'diagnosed')) {
    ensureOpenStatusId(normalizedOpenStatusIds, 'diagnosed', 'diagnosing');
  }
  const rawAssignment = Array.isArray(fromRoot?.workflow?.assignmentTriggerStatusIds)
    ? fromRoot.workflow.assignmentTriggerStatusIds.map((id) => mapLegacyRepairStatus(String(id || '').trim())).filter(Boolean)
    : [];
  const assignmentTriggerStatusIds = Array.from(new Set(
    rawAssignment.length > 0 ? rawAssignment : (DEFAULT_REPAIR_SETTINGS.workflow.assignmentTriggerStatusIds || []),
  ));
  const statusMap = Object.fromEntries(statuses.map((status) => [status.id, status]));
  const accessoriesCatalog = normalizeAccessoriesCatalog(fromRoot?.accessoriesCatalog);
  const serviceCatalog = normalizeServiceCatalog(fromRoot?.serviceCatalog);
  const unrepairableReasons = normalizeUnrepairableReasons(fromRoot?.unrepairableReasons);

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
    unrepairableReasons,
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

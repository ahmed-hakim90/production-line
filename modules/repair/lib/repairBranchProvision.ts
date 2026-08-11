import { repairMaintenanceWarehouseName } from './repairBranchMain';

export const CREATE_REPAIR_BRANCH_PERMISSION = 'repair.branches.manage';
export const COST_CENTER_CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/;

export type RepairBranchCreateInput = {
  name: string;
  phone?: string;
  address?: string;
  isMain?: boolean;
  managerEmployeeId: string;
  managerEmployeeName?: string;
  allowCreditDelivery?: boolean;
  allowCreditSalesInvoices?: boolean;
  salesInvoicesLocked?: boolean;
};

export type NormalizedRepairBranchCreateInput = {
  name: string;
  phone: string;
  address: string;
  isMain: boolean;
  managerEmployeeId: string;
  managerEmployeeName: string;
  allowCreditDelivery: boolean;
  allowCreditSalesInvoices: boolean;
  salesInvoicesLocked: boolean;
};

export type RepairWarehouseCodePrefix = 'MCW' | 'RCW' | 'RUW';

/** Deterministic maintenance-center warehouse id for a newly provisioned branch. */
export const repairCenterWarehouseId = (branchId: string): string =>
  `repair-center-${String(branchId || '').trim()}`;

/** Generic warehouse code: MCW-001 / RCW-001 / RUW-001. */
export const repairWarehouseCode = (
  prefix: RepairWarehouseCodePrefix,
  sequence: number,
): string => {
  const seq = Math.max(1, Math.floor(Number(sequence) || 1));
  return `${prefix}-${String(seq).padStart(3, '0')}`;
};

export const parseRepairWarehouseSequence = (code: string): number | null => {
  const match = String(code || '')
    .trim()
    .toUpperCase()
    .match(/^(?:MCW|RCW|RUW|RWH)-(\d{1,6})$/);
  if (!match) return null;
  const seq = Number(match[1]);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
};

export const maxRepairWarehouseSequence = (codes: Array<string | null | undefined>): number => {
  let max = 0;
  for (const code of codes) {
    const seq = parseRepairWarehouseSequence(String(code || ''));
    if (seq && seq > max) max = seq;
  }
  return max;
};

/** @deprecated Use repairWarehouseCode('MCW', sequence). Kept for call-site clarity. */
export const repairCenterWarehouseCode = (sequence: number): string =>
  repairWarehouseCode('MCW', sequence);

/** Cost-center code: REP-0001 … fits accounting `/^[A-Z0-9_-]{2,20}$/`. */
export const repairCostCenterCode = (sequence: number): string => {
  const seq = Math.max(1, Math.floor(Number(sequence) || 1));
  return `REP-${String(seq).padStart(4, '0')}`;
};

export const isValidRepairCostCenterCode = (code: string): boolean =>
  COST_CENTER_CODE_PATTERN.test(String(code || '').trim());

export const canCreateProvisionedRepairBranch = (
  permissions: Record<string, boolean> | null | undefined,
  isSuperAdmin = false,
): boolean => {
  if (isSuperAdmin) return true;
  return permissions?.[CREATE_REPAIR_BRANCH_PERMISSION] === true;
};

/**
 * Client-side create payload. Warehouse / cost center are provisioned by the server.
 * Does not accept or require warehouseId.
 */
export function normalizeRepairBranchCreateInput(
  input: RepairBranchCreateInput,
): NormalizedRepairBranchCreateInput {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('اسم الفرع مطلوب.');
  const managerEmployeeId = String(input.managerEmployeeId || '').trim();
  if (!managerEmployeeId) {
    throw new Error('اختر المسؤول عن الفرع قبل الحفظ.');
  }
  return {
    name,
    phone: String(input.phone || '').trim(),
    address: String(input.address || '').trim(),
    isMain: Boolean(input.isMain),
    managerEmployeeId,
    managerEmployeeName: String(input.managerEmployeeName || '').trim(),
    allowCreditDelivery: input.allowCreditDelivery !== false,
    allowCreditSalesInvoices: input.allowCreditSalesInvoices === true,
    salesInvoicesLocked: input.salesInvoicesLocked === true,
  };
}

export { repairMaintenanceWarehouseName };

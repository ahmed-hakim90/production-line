import type {
  DepartmentConsumableApprovalMode,
  DepartmentConsumableIssue,
  DepartmentConsumableIssueLine,
  DepartmentConsumableIssueStatus,
  DepartmentConsumableMonthlyReport,
  DepartmentConsumableMonthlyRow,
  DepartmentConsumableReturnLine,
  StockTransaction,
} from '../types';

export const DEPARTMENT_CONSUMABLE_ISSUES_COLLECTION = 'department_consumable_issues';
export const MAX_DEPARTMENT_CONSUMABLE_LINES = 40;
export const DEPARTMENT_CONSUMABLE_SOURCE_ISSUE = 'department_consumable_issue' as const;
export const DEPARTMENT_CONSUMABLE_SOURCE_RETURN = 'department_consumable_return' as const;

export const DEPARTMENT_CONSUMABLE_STATUS_LABELS: Record<DepartmentConsumableIssueStatus, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  issued: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

export const DEPARTMENT_CONSUMABLE_APPROVAL_MODE_LABELS: Record<DepartmentConsumableApprovalMode, string> = {
  direct: 'صرف مباشر',
  required: 'يتطلب موافقة',
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeApprovalMode(value: unknown): DepartmentConsumableApprovalMode {
  return value === 'required' ? 'required' : 'direct';
}

export function materialPurchaseCostPerBaseUnit(material: {
  purchaseCost?: number;
  conversionRate?: number;
}): number {
  const cost = toNumber(material.purchaseCost);
  const rate = toNumber(material.conversionRate);
  if (rate > 0) return cost / rate;
  return cost;
}

export function roundMoney(value: number): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
}

export type DraftLineInput = {
  itemId: string;
  quantity: number;
  locationId?: string;
  locationCode?: string;
};

export function departmentConsumableLineId(itemId: string, locationId?: string): string {
  return JSON.stringify([
    String(itemId || '').trim(),
    String(locationId || '').trim(),
  ]);
}

export function departmentConsumableLineKey(
  line: Pick<DepartmentConsumableIssueLine, 'lineId' | 'itemId' | 'locationId'>,
): string {
  return String(line.lineId || '').trim()
    || departmentConsumableLineId(line.itemId, line.locationId);
}

export function validateDraftLines(
  lines: DraftLineInput[],
  options?: { locationsRequired?: boolean },
): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('أضف بند مستهلك واحد على الأقل.');
  }
  if (lines.length > MAX_DEPARTMENT_CONSUMABLE_LINES) {
    throw new Error(`الحد الأقصى لعدد البنود هو ${MAX_DEPARTMENT_CONSUMABLE_LINES}.`);
  }
  const seen = new Set<string>();
  for (const line of lines) {
    const itemId = String(line.itemId || '').trim();
    if (!itemId) throw new Error('حدد الصنف لكل بند.');
    const qty = toNumber(line.quantity);
    if (!(qty > 0)) throw new Error('كمية كل بند يجب أن تكون أكبر من صفر.');
    const locationId = String(line.locationId || '').trim();
    if (options?.locationsRequired && !locationId) {
      throw new Error('حدد رف المصدر لكل بند.');
    }
    const key = `${itemId}__${locationId || '_'}`;
    if (seen.has(key)) {
      throw new Error('لا يمكن تكرار نفس الصنف والرف في نفس السند.');
    }
    seen.add(key);
  }
}

export function nextStatusAfterCreate(
  approvalMode: DepartmentConsumableApprovalMode,
): DepartmentConsumableIssueStatus {
  return approvalMode === 'direct' ? 'draft' : 'draft';
}

export function canSubmit(status: DepartmentConsumableIssueStatus, approvalMode: DepartmentConsumableApprovalMode): boolean {
  return approvalMode === 'required' && status === 'draft';
}

export function canApprove(status: DepartmentConsumableIssueStatus, approvalMode: DepartmentConsumableApprovalMode): boolean {
  return approvalMode === 'required' && status === 'submitted';
}

export function canReject(status: DepartmentConsumableIssueStatus, approvalMode: DepartmentConsumableApprovalMode): boolean {
  return approvalMode === 'required' && (status === 'submitted' || status === 'approved');
}

export function canIssue(status: DepartmentConsumableIssueStatus, approvalMode: DepartmentConsumableApprovalMode): boolean {
  if (approvalMode === 'direct') return status === 'draft';
  return status === 'approved';
}

export function canCancel(status: DepartmentConsumableIssueStatus): boolean {
  return status === 'draft' || status === 'submitted' || status === 'approved' || status === 'rejected';
}

export function canReturn(status: DepartmentConsumableIssueStatus): boolean {
  return status === 'issued';
}

export function sanitizeIssueLines(
  lines: DepartmentConsumableIssueLine[],
): DepartmentConsumableIssueLine[] {
  return lines.map((line) => ({
    lineId: departmentConsumableLineKey(line),
    itemType: 'material',
    itemId: String(line.itemId || '').trim(),
    itemName: String(line.itemName || '').trim(),
    itemCode: String(line.itemCode || '').trim(),
    unit: String(line.unit || 'piece').trim() || 'piece',
    quantity: toNumber(line.quantity),
    ...(line.locationId ? { locationId: String(line.locationId).trim() } : {}),
    ...(line.locationCode ? { locationCode: String(line.locationCode).trim() } : {}),
    ...(line.unitCostSnapshot != null ? { unitCostSnapshot: roundMoney(line.unitCostSnapshot) } : {}),
    ...(line.totalCostSnapshot != null ? { totalCostSnapshot: roundMoney(line.totalCostSnapshot) } : {}),
    ...(line.returnedQty != null ? { returnedQty: toNumber(line.returnedQty) } : {}),
  }));
}

export function issueTotalCost(lines: DepartmentConsumableIssueLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
}

export function validateReturnLines(
  issue: Pick<DepartmentConsumableIssue, 'lines' | 'status'>,
  returns: DepartmentConsumableReturnLine[],
): void {
  if (!canReturn(issue.status)) {
    throw new Error('لا يمكن تسجيل مرتجع إلا لسند منفّذ.');
  }
  if (!Array.isArray(returns) || returns.length === 0) {
    throw new Error('أضف بند مرتجع واحد على الأقل.');
  }
  const byLine = new Map(issue.lines.map((line) => [departmentConsumableLineKey(line), line]));
  const seen = new Set<string>();
  for (const row of returns) {
    const lineId = String(row.lineId || '').trim()
      || departmentConsumableLineId(row.itemId, row.locationId);
    const itemId = String(row.itemId || '').trim();
    const qty = toNumber(row.quantity);
    if (!lineId || !itemId) throw new Error('حدد الصنف للمرتجع.');
    if (!(qty > 0)) throw new Error('كمية المرتجع يجب أن تكون أكبر من صفر.');
    if (seen.has(lineId)) throw new Error('لا يمكن تكرار نفس بند المرتجع.');
    seen.add(lineId);
    const source = byLine.get(lineId);
    if (!source) throw new Error('بند الصنف والرف غير موجود في سند الصرف.');
    if (source.itemId !== itemId) throw new Error('الصنف لا يطابق بند المرتجع.');
    if (
      row.locationId
      && String(row.locationId).trim() !== String(source.locationId || '').trim()
    ) {
      throw new Error('الرف لا يطابق بند المرتجع.');
    }
    const already = toNumber(source.returnedQty);
    const remaining = toNumber(source.quantity) - already;
    if (qty > remaining + 0.000001) {
      throw new Error(`كمية المرتجع لـ ${source.itemName} تتجاوز المتاح (${remaining}).`);
    }
  }
}

export function applyReturnQuantities(
  lines: DepartmentConsumableIssueLine[],
  returns: DepartmentConsumableReturnLine[],
): DepartmentConsumableIssueLine[] {
  const next = lines.map((line) => ({
    ...line,
    lineId: departmentConsumableLineKey(line),
  }));
  const index = new Map(next.map((line, i) => [departmentConsumableLineKey(line), i]));
  for (const row of returns) {
    const key = String(row.lineId || '').trim()
      || departmentConsumableLineId(row.itemId, row.locationId);
    const i = index.get(key);
    if (i == null) continue;
    next[i] = {
      ...next[i],
      returnedQty: toNumber(next[i].returnedQty) + toNumber(row.quantity),
    };
  }
  return next;
}

export function monthRangeIso(month: string): { startIso: string; endExclusiveIso: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('صيغة الشهر يجب أن تكون YYYY-MM.');
  }
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), endExclusiveIso: end.toISOString() };
}

type AggregateTx = Pick<
  StockTransaction,
  | 'movementType'
  | 'sourceModule'
  | 'departmentId'
  | 'departmentName'
  | 'itemId'
  | 'itemName'
  | 'itemCode'
  | 'unit'
  | 'quantity'
  | 'totalCostSnapshot'
  | 'warehouseId'
  | 'sourceId'
>;

export function aggregateDepartmentConsumableMonthly(params: {
  month: string;
  transactions: AggregateTx[];
  departmentId?: string;
  warehouseId?: string;
}): DepartmentConsumableMonthlyReport {
  const departmentId = String(params.departmentId || '').trim() || undefined;
  const warehouseId = String(params.warehouseId || '').trim() || undefined;
  const map = new Map<string, DepartmentConsumableMonthlyRow>();
  const issueIds = new Set<string>();
  let totalIssuedCost = 0;
  let totalReturnedCost = 0;

  for (const tx of params.transactions) {
    if (departmentId && tx.departmentId !== departmentId) continue;
    if (warehouseId && tx.warehouseId !== warehouseId) continue;
    const isIssue =
      tx.sourceModule === DEPARTMENT_CONSUMABLE_SOURCE_ISSUE && tx.movementType === 'OUT';
    const isReturn =
      tx.sourceModule === DEPARTMENT_CONSUMABLE_SOURCE_RETURN && tx.movementType === 'IN';
    if (!isIssue && !isReturn) continue;

    const deptId = String(tx.departmentId || '').trim();
    const itemId = String(tx.itemId || '').trim();
    const unit = String(tx.unit || 'piece').trim() || 'piece';
    if (!deptId || !itemId) continue;

    const key = `${deptId}__${itemId}__${unit}`;
    const existing = map.get(key) || {
      departmentId: deptId,
      departmentName: String(tx.departmentName || deptId),
      itemId,
      itemName: String(tx.itemName || itemId),
      itemCode: String(tx.itemCode || ''),
      unit,
      issuedQty: 0,
      returnedQty: 0,
      netQty: 0,
      issuedCost: 0,
      returnedCost: 0,
      netCost: 0,
    };

    const qty = Math.abs(toNumber(tx.quantity));
    const cost = Math.abs(toNumber(tx.totalCostSnapshot));
    if (isIssue) {
      existing.issuedQty += qty;
      existing.issuedCost = roundMoney(existing.issuedCost + cost);
      totalIssuedCost = roundMoney(totalIssuedCost + cost);
      if (tx.sourceId) issueIds.add(tx.sourceId);
    } else {
      existing.returnedQty += qty;
      existing.returnedCost = roundMoney(existing.returnedCost + cost);
      totalReturnedCost = roundMoney(totalReturnedCost + cost);
    }
    existing.netQty = roundMoney(existing.issuedQty - existing.returnedQty);
    existing.netCost = roundMoney(existing.issuedCost - existing.returnedCost);
    existing.departmentName = String(tx.departmentName || existing.departmentName);
    existing.itemName = String(tx.itemName || existing.itemName);
    existing.itemCode = String(tx.itemCode || existing.itemCode);
    map.set(key, existing);
  }

  const rows = Array.from(map.values()).sort((a, b) => {
    const byDept = a.departmentName.localeCompare(b.departmentName, 'ar');
    if (byDept !== 0) return byDept;
    return a.itemName.localeCompare(b.itemName, 'ar');
  });

  return {
    month: params.month,
    ...(departmentId ? { departmentId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    issueCount: issueIds.size,
    totalIssuedCost,
    totalReturnedCost,
    totalNetCost: roundMoney(totalIssuedCost - totalReturnedCost),
    rows,
  };
}

export function formatDepartmentConsumableReference(seq: number): string {
  return `DCI-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;
}

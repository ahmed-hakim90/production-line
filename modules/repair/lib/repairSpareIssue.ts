import type {
  RepairSpareApprovalMode,
  RepairSpareIssue,
  RepairSpareIssueLine,
  RepairSpareIssueStatus,
  RepairSpareReturnLine,
} from '../types';

export const REPAIR_SPARE_ISSUES_COLLECTION = 'repair_spare_issues';
export const MAX_REPAIR_SPARE_ISSUE_LINES = 40;
export const REPAIR_SPARE_SOURCE_ISSUE = 'repair_spare_issue' as const;
export const REPAIR_SPARE_SOURCE_RETURN = 'repair_spare_return' as const;

export const REPAIR_SPARE_ISSUE_STATUS_LABELS: Record<RepairSpareIssueStatus, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  issued: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

export const REPAIR_SPARE_APPROVAL_MODE_LABELS: Record<RepairSpareApprovalMode, string> = {
  direct: 'صرف مباشر',
  required: 'يتطلب موافقة',
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeRepairSpareApprovalMode(value: unknown): RepairSpareApprovalMode {
  return value === 'required' ? 'required' : 'direct';
}

export function roundMoney(value: number): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
}

export type RepairSpareDraftLineInput = {
  itemId: string;
  quantity: number;
  locationId?: string;
  locationCode?: string;
};

export function repairSpareLineId(itemId: string, locationId?: string): string {
  return JSON.stringify([
    String(itemId || '').trim(),
    String(locationId || '').trim(),
  ]);
}

export function repairSpareLineKey(
  line: Pick<RepairSpareIssueLine, 'lineId' | 'itemId' | 'locationId'>,
): string {
  return String(line.lineId || '').trim()
    || repairSpareLineId(line.itemId, line.locationId);
}

export function validateRepairSpareDraftLines(
  lines: RepairSpareDraftLineInput[],
  options?: { locationsRequired?: boolean },
): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('أضف بند قطعة غيار واحد على الأقل.');
  }
  if (lines.length > MAX_REPAIR_SPARE_ISSUE_LINES) {
    throw new Error(`الحد الأقصى لعدد البنود هو ${MAX_REPAIR_SPARE_ISSUE_LINES}.`);
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

export function canSubmitRepairSpareIssue(
  status: RepairSpareIssueStatus,
  approvalMode: RepairSpareApprovalMode,
): boolean {
  return approvalMode === 'required' && status === 'draft';
}

export function canApproveRepairSpareIssue(
  status: RepairSpareIssueStatus,
  approvalMode: RepairSpareApprovalMode,
): boolean {
  return approvalMode === 'required' && status === 'submitted';
}

export function canRejectRepairSpareIssue(
  status: RepairSpareIssueStatus,
  approvalMode: RepairSpareApprovalMode,
): boolean {
  return approvalMode === 'required' && (status === 'submitted' || status === 'approved');
}

export function canIssueRepairSpareIssue(
  status: RepairSpareIssueStatus,
  approvalMode: RepairSpareApprovalMode,
): boolean {
  if (approvalMode === 'direct') return status === 'draft';
  return status === 'approved';
}

export function canCancelRepairSpareIssue(status: RepairSpareIssueStatus): boolean {
  return status === 'draft' || status === 'submitted' || status === 'approved' || status === 'rejected';
}

export function canReturnRepairSpareIssue(status: RepairSpareIssueStatus): boolean {
  return status === 'issued';
}

export function sanitizeRepairSpareIssueLines(
  lines: RepairSpareIssueLine[],
): RepairSpareIssueLine[] {
  return lines.map((line) => ({
    lineId: repairSpareLineKey(line),
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

export function validateRepairSpareReturnLines(
  issue: Pick<RepairSpareIssue, 'lines' | 'status'>,
  returns: RepairSpareReturnLine[],
): void {
  if (!canReturnRepairSpareIssue(issue.status)) {
    throw new Error('لا يمكن تسجيل مرتجع إلا لسند منفّذ.');
  }
  if (!Array.isArray(returns) || returns.length === 0) {
    throw new Error('أضف بند مرتجع واحد على الأقل.');
  }
  const byLine = new Map(issue.lines.map((line) => [repairSpareLineKey(line), line]));
  const seen = new Set<string>();
  for (const row of returns) {
    const lineId = String(row.lineId || '').trim()
      || repairSpareLineId(row.itemId, row.locationId);
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

export function applyRepairSpareReturnQuantities(
  lines: RepairSpareIssueLine[],
  returns: RepairSpareReturnLine[],
): RepairSpareIssueLine[] {
  const next = lines.map((line) => ({
    ...line,
    lineId: repairSpareLineKey(line),
  }));
  const index = new Map(next.map((line, i) => [repairSpareLineKey(line), i]));
  for (const row of returns) {
    const key = String(row.lineId || '').trim()
      || repairSpareLineId(row.itemId, row.locationId);
    const i = index.get(key);
    if (i == null) continue;
    next[i] = {
      ...next[i],
      returnedQty: toNumber(next[i].returnedQty) + toNumber(row.quantity),
    };
  }
  return next;
}

export function formatRepairSpareReference(seq: number): string {
  return `RSI-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;
}

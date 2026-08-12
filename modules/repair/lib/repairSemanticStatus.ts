/** Semantic chip types aligned with `@/src/components/erp/StatusBadge`. */

import type {
  RepairPartAvailabilityAtRequest,
  RepairPartFulfillmentStatus,
} from '../types';

export type RepairSemanticStatusType = 'success' | 'warning' | 'danger' | 'info' | 'muted';

/** Accent colors for status kanban column badges (aligned with StatusBadge semantics). */
export function semanticStatusAccent(type: RepairSemanticStatusType): string {
  if (type === 'success') return '#059669';
  if (type === 'warning') return '#d97706';
  if (type === 'danger') return '#dc2626';
  if (type === 'info') return '#0284c8';
  return '#64748b';
}

export function repairOpenClosedChipType(isOpen: boolean): RepairSemanticStatusType {
  return isOpen ? 'warning' : 'success';
}

/** Availability at request: green = center, blue = central, red = none. */
export function repairPartAvailabilityChipType(
  availability: RepairPartAvailabilityAtRequest,
): RepairSemanticStatusType {
  if (availability === 'center') return 'success';
  if (availability === 'central') return 'info';
  return 'danger';
}

export function repairPartFulfillmentChipType(
  status: RepairPartFulfillmentStatus,
): RepairSemanticStatusType {
  if (status === 'issued') return 'success';
  if (status === 'ready_to_issue') return 'info';
  if (status === 'pending_supply') return 'warning';
  return 'muted';
}

export function repairMonthCloseChipType(monthClosed: boolean): RepairSemanticStatusType {
  return monthClosed ? 'danger' : 'success';
}

export function repairInvoiceActiveChipType(cancelled: boolean): RepairSemanticStatusType {
  return cancelled ? 'danger' : 'success';
}

export function repairStockLevelChipType(isLow: boolean): RepairSemanticStatusType {
  return isLow ? 'danger' : 'success';
}

export function repairComplaintStatusChipType(status: string): RepairSemanticStatusType {
  if (status === 'open') return 'danger';
  if (status === 'in_progress') return 'warning';
  if (status === 'resolved') return 'success';
  if (status === 'closed') return 'muted';
  return 'muted';
}

export function repairSpareIssueStatusChipType(status: string): RepairSemanticStatusType {
  if (status === 'draft') return 'muted';
  if (status === 'submitted') return 'warning';
  if (status === 'approved') return 'info';
  if (status === 'issued') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'cancelled') return 'muted';
  return 'muted';
}

export function repairCustomerRequestStatusChipType(status: string): RepairSemanticStatusType {
  if (status === 'submitted') return 'warning';
  if (status === 'assigned') return 'info';
  if (status === 'converted') return 'success';
  if (status === 'cancelled') return 'muted';
  return 'muted';
}

export function repairReplacementStatusChipType(status: string): RepairSemanticStatusType {
  if (status === 'pending_approval') return 'warning';
  if (status === 'approved') return 'info';
  if (status === 'delivered') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'cancelled') return 'muted';
  return 'muted';
}

/** أذونات الدفع/التحصيل — لون الشارة حسب الحالة التشغيلية. */
export function repairPaymentAuthChipType(
  status: string,
  options?: { invalidPricing?: boolean; warrantySettlement?: boolean },
): RepairSemanticStatusType {
  if (options?.invalidPricing) return 'danger';
  if (options?.warrantySettlement && status === 'paid') return 'success';
  if (status === 'paid') return 'success';
  if (status === 'approved') return 'info';
  if (status === 'partial') return 'warning';
  if (status === 'pending_approval') return 'warning';
  if (status === 'void') return 'muted';
  return 'muted';
}

/** مدة بقاء العهدة: تنبيه تشغيلي للأرصدة المتأخرة. */
export function repairCustodyAgeChipType(ageDays: number): RepairSemanticStatusType {
  if (ageDays >= 14) return 'danger';
  if (ageDays >= 7) return 'warning';
  return 'muted';
}

export function repairTreasuryEntryTypeChip(
  entryType: string,
): { label: string; type: RepairSemanticStatusType } {
  switch (entryType) {
    case 'OPENING':
      return { label: 'افتتاح', type: 'info' };
    case 'INCOME':
      return { label: 'إيراد', type: 'success' };
    case 'EXPENSE':
      return { label: 'مصروف', type: 'danger' };
    case 'TRANSFER_OUT':
      return { label: 'تحويل بنكي داخلي', type: 'warning' };
    case 'TRANSFER_IN':
      return { label: 'وارد بنكي داخلي', type: 'info' };
    case 'SETTLEMENT_OUT':
      return { label: 'تسوية للإدارة', type: 'warning' };
    case 'SETTLEMENT_IN':
      return { label: 'تسوية واردة', type: 'success' };
    case 'CLOSING':
      return { label: 'إقفال', type: 'muted' };
    default:
      return { label: entryType || '—', type: 'muted' };
  }
}

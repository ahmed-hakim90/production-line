/** Semantic chip types aligned with `@/src/components/erp/StatusBadge`. */
export type RepairSemanticStatusType = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function repairOpenClosedChipType(isOpen: boolean): RepairSemanticStatusType {
  return isOpen ? 'warning' : 'success';
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
      return { label: 'تحويل صادر', type: 'warning' };
    case 'TRANSFER_IN':
      return { label: 'تحويل وارد', type: 'info' };
    case 'CLOSING':
      return { label: 'إقفال', type: 'muted' };
    default:
      return { label: entryType || '—', type: 'muted' };
  }
}

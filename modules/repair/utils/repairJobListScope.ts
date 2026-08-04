/** هل يُسمح بجلب قائمة الطلبات؟ fail-closed عند غياب نطاق الفروع أو معرفات الفني */
export function canLoadRepairJobList(input: {
  canViewAllBranches?: boolean;
  branchIds?: string[];
  branchId?: string;
  technicianOnly?: boolean;
  technicianIds?: string[];
}): boolean {
  if (input.technicianOnly) {
    return (input.technicianIds || []).some((id) => String(id || '').trim().length > 0);
  }
  if (input.canViewAllBranches) return true;
  const scopedBranchIds = (input.branchIds || []).filter((id) => String(id || '').trim().length > 0);
  if (scopedBranchIds.length > 0) return true;
  return Boolean(String(input.branchId || '').trim());
}

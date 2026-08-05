/**
 * Intake vs workshop rules for repair jobs.
 * Reception creates jobs without services/costs; technicians set those later.
 */
import type { RepairJob, RepairJobProduct, RepairWarrantyScope } from '../types';
import { resolveManufacturerWarrantyScope } from './repairManufacturerWarranty';
import { resolveRepairJobPrintProducts } from './repairJobPrint';

export { resolveManufacturerWarrantyScope };

/** Force create-time products to intake shape (no client-trusted services/pricing). */
export function stripRepairProductsToIntake(products: RepairJobProduct[]): RepairJobProduct[] {
  return products.map((item, idx) => {
    const serialNo = String(item?.serialNo || '').trim();
    const accessoryIds = Array.isArray(item?.accessoryIds)
      ? item.accessoryIds.map(String).filter(Boolean)
      : [];
    const next: RepairJobProduct = {
      itemId: String(item?.itemId || `item-${idx + 1}`),
      productId: item?.productId,
      productName: String(item?.productName || item?.deviceBrand || 'منتج'),
      quantity: Math.max(1, Math.round(Number(item?.quantity || 1))),
      deviceType: item?.deviceType,
      deviceBrand: item?.deviceBrand,
      deviceModel: item?.deviceModel,
      accessories: String(item?.accessories || ''),
      diagnosis: String(item?.diagnosis || ''),
      technicianDiagnosis: '',
      serviceIds: [],
      estimatedCost: 0,
      finalCost: 0,
      inWarranty: Boolean(item?.inWarranty),
    };
    if (serialNo) next.serialNo = serialNo;
    if (accessoryIds.length > 0) next.accessoryIds = accessoryIds;
    return next;
  });
}

export function warrantyScopeFromProducts(
  products: RepairJobProduct[] | null | undefined,
): RepairWarrantyScope {
  return resolveManufacturerWarrantyScope(products);
}

/** Hide cost columns on intake slips until workshop work has real pricing. */
export function shouldShowRepairPrintCosts(
  job: RepairJob,
  products?: RepairJobProduct[],
): boolean {
  if (Number(job.finalCostOverride ?? job.finalCost ?? 0) > 0) return true;
  if (Number(job.serviceOnlyCost || 0) > 0) return true;
  if (Boolean(job.isServiceOnly)) return true;
  if (Number(job.laborCost || 0) > 0) return true;
  if (Array.isArray(job.partsUsed) && job.partsUsed.length > 0) return true;

  const rows = resolveRepairJobPrintProducts(job, products);
  return rows.some(
    (row) =>
      (Array.isArray(row.serviceIds) && row.serviceIds.length > 0)
      || Number(row.finalCost || 0) > 0
      || Number(row.estimatedCost || 0) > 0,
  );
}

/**
 * Workshop pricing/services/parts — not reception intake.
 * Reception typically has create+edit; managers often have edit without create.
 */
export function canManageRepairWorkshopWork(input: {
  canEditJob: boolean;
  isRepairTechnician: boolean;
  isAssignedTechnician: boolean;
  canManageBranches: boolean;
  canViewAllCallCenter: boolean;
  canCreateJobs: boolean;
  canEditJobs: boolean;
}): boolean {
  if (!input.canEditJob) return false;
  if (input.isRepairTechnician || input.isAssignedTechnician) return true;
  if (input.canManageBranches || input.canViewAllCallCenter) return true;
  // Edit without create ≈ supervisor/admin, not front-desk reception.
  if (input.canEditJobs && !input.canCreateJobs) return true;
  return false;
}

/** When a branch has exactly one linked technician, assignment UI stays fixed. */
export function isSingleBranchTechnician(
  technicianIds: Array<string | null | undefined> | null | undefined,
): boolean {
  const ids = (technicianIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  return ids.length === 1;
}

/**
 * Public customer approval view — minimal fields only.
 * Used by the public approval page contract and unit tests.
 * Cloud Function mirrors the same shape (functions cannot import app modules).
 */

import {
  isFullManufacturerWarrantyJob,
  manufacturerWarrantyLineLabel,
  warrantyProductItemIds,
} from './repairManufacturerWarranty';

export type PublicRepairApprovalPartLine = {
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  inWarranty: boolean;
  warrantyLabel: string;
};

export type PublicRepairApprovalProductLine = {
  name: string;
  quantity: number;
  lineCost: number;
  inWarranty: boolean;
  warrantyLabel: string;
};

export type PublicRepairApprovalView = {
  receiptNo: string;
  customerName: string;
  customerPhone: string;
  deviceBrand: string;
  deviceModel: string;
  deviceType: string;
  problemDescription: string;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'not_required' | string;
  laborCost: number;
  serviceOnlyCost: number;
  partsCost: number;
  productsCost: number;
  warrantyProductsCost: number;
  billableProductsCost: number;
  /** Prefer computed billable total; fall back to stored estimate when computed is 0. */
  estimatedTotal: number;
  parts: PublicRepairApprovalPartLine[];
  products: PublicRepairApprovalProductLine[];
};

const money = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

const text = (value: unknown, max = 200): string =>
  String(value || '').trim().slice(0, max);

export type PublicRepairApprovalJobSource = {
  receiptNo?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  deviceBrand?: unknown;
  deviceModel?: unknown;
  deviceType?: unknown;
  problemDescription?: unknown;
  approvalStatus?: unknown;
  laborCost?: unknown;
  serviceOnlyCost?: unknown;
  estimatedCost?: unknown;
  finalCost?: unknown;
  finalCostOverride?: unknown;
  warrantyScope?: unknown;
  partsUsed?: Array<{
    partName?: unknown;
    quantity?: unknown;
    unitCost?: unknown;
    productItemId?: unknown;
  }> | unknown;
  jobProducts?: Array<{
    productName?: unknown;
    quantity?: unknown;
    estimatedCost?: unknown;
    finalCost?: unknown;
    inWarranty?: unknown;
    itemId?: unknown;
  }> | unknown;
};

/** Build the customer-facing estimate payload from a repair job document. */
export function buildPublicRepairApprovalView(
  job: PublicRepairApprovalJobSource,
): PublicRepairApprovalView {
  const rawProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const fullWarranty = isFullManufacturerWarrantyJob({
    warrantyScope: job.warrantyScope == null ? undefined : String(job.warrantyScope),
    jobProducts: rawProducts,
  });
  const warrantyIds = warrantyProductItemIds(rawProducts);

  const rawParts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
  const parts: PublicRepairApprovalPartLine[] = rawParts
    .slice(0, 50)
    .map((row) => {
      const partName = text(row?.partName, 120) || 'قطعة غيار';
      const quantity = Math.max(0, Math.round(Number(row?.quantity || 0)));
      const productItemId = String(row?.productItemId || '').trim();
      const inWarranty = fullWarranty || Boolean(productItemId && warrantyIds.has(productItemId));
      const unitPrice = inWarranty ? 0 : money(row?.unitCost);
      return {
        partName,
        quantity,
        unitPrice,
        lineTotal: money(quantity * unitPrice),
        inWarranty,
        warrantyLabel: manufacturerWarrantyLineLabel(inWarranty),
      };
    })
    .filter((row) => row.quantity > 0);

  const products: PublicRepairApprovalProductLine[] = rawProducts
    .slice(0, 30)
    .map((row) => {
      const name = text(row?.productName, 120) || 'منتج';
      const quantity = Math.max(1, Math.round(Number(row?.quantity || 1)));
      const inWarranty = Boolean(row?.inWarranty);
      const rawCost = money(row?.finalCost ?? row?.estimatedCost);
      const lineCost = inWarranty ? 0 : rawCost;
      return {
        name,
        quantity,
        lineCost,
        inWarranty,
        warrantyLabel: manufacturerWarrantyLineLabel(inWarranty),
      };
    })
    .filter((row) => row.name.length > 0);

  const partsCost = money(parts.reduce((sum, row) => sum + row.lineTotal, 0));
  const laborCost = fullWarranty ? 0 : money(job.laborCost);
  const serviceOnlyCost = fullWarranty ? 0 : money(job.serviceOnlyCost);
  const billableProductsCost = money(
    products.filter((row) => !row.inWarranty).reduce((sum, row) => sum + row.lineCost, 0),
  );
  const warrantyProductsCost = money(
    rawProducts
      .filter((row) => Boolean(row?.inWarranty))
      .reduce((sum, row) => sum + money(row?.finalCost ?? row?.estimatedCost), 0),
  );
  const productsCost = billableProductsCost;
  const computed = money(partsCost + laborCost + serviceOnlyCost + productsCost);
  const estimatedStored = money(job.estimatedCost);
  const estimatedTotal = computed > 0
    ? computed
    : (estimatedStored > 0 ? estimatedStored : money(job.finalCostOverride ?? job.finalCost));

  return {
    receiptNo: text(job.receiptNo, 64),
    customerName: text(job.customerName, 120),
    customerPhone: text(job.customerPhone, 32),
    deviceBrand: text(job.deviceBrand, 80),
    deviceModel: text(job.deviceModel, 80),
    deviceType: text(job.deviceType, 80),
    problemDescription: text(job.problemDescription, 1000),
    approvalStatus: text(job.approvalStatus, 32) || 'pending',
    laborCost,
    serviceOnlyCost,
    partsCost,
    productsCost,
    warrantyProductsCost,
    billableProductsCost,
    estimatedTotal,
    parts,
    products,
  };
}

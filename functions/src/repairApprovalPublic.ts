/**
 * Public repair approval payload builder.
 * Mirrors modules/repair/lib/repairApprovalPublic.ts (functions package is isolated).
 */

import {
  isFullManufacturerWarrantyJob,
  warrantyProductItemIds,
} from './repairManufacturerWarranty.js';
import { buildRepairPaymentAccountBreakdown } from './repairPaymentProductBreakdown.js';

export type PublicRepairApprovalPartLine = {
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  inWarranty: boolean;
  warrantyLabel: string;
};

export type PublicRepairApprovalWorkLine = {
  kind: 'service' | 'part';
  name: string;
  quantity: number;
  unitPrice: number;
  catalogTotal: number;
  lineCost: number;
  inWarranty: boolean;
};

export type PublicRepairApprovalProductLine = {
  name: string;
  quantity: number;
  lineCost: number;
  inWarranty: boolean;
  warrantyLabel: string;
  works?: PublicRepairApprovalWorkLine[];
};

export type PublicRepairApprovalView = {
  receiptNo: string;
  customerName: string;
  customerPhone: string;
  deviceBrand: string;
  deviceModel: string;
  deviceType: string;
  problemDescription: string;
  approvalStatus: string;
  laborCost: number;
  serviceOnlyCost: number;
  partsCost: number;
  productsCost: number;
  warrantyProductsCost: number;
  billableProductsCost: number;
  estimatedTotal: number;
  parts: PublicRepairApprovalPartLine[];
  products: PublicRepairApprovalProductLine[];
  unassignedWorks?: PublicRepairApprovalWorkLine[];
};

const money = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

const text = (value: unknown, max = 200): string =>
  String(value || '').trim().slice(0, max);

const warrantyLineLabel = (inWarranty: boolean) => (inWarranty ? 'داخل الضمان' : 'بدون ضمان');

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

export function buildPublicRepairApprovalView(
  job: PublicRepairApprovalJobSource,
  authorization?: {
    serviceLines?: unknown;
    partLines?: unknown;
    settlementType?: unknown;
    warrantyScope?: unknown;
    serviceGross?: unknown;
    partsGross?: unknown;
    netAmount?: unknown;
    grossAmount?: unknown;
  } | null,
): PublicRepairApprovalView {
  const rawProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const fullWarranty = isFullManufacturerWarrantyJob({
    warrantyScope: job.warrantyScope,
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
        warrantyLabel: warrantyLineLabel(inWarranty),
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
        warrantyLabel: warrantyLineLabel(inWarranty),
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

  const view: PublicRepairApprovalView = {
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

  if (!authorization) return view;

  const account = buildRepairPaymentAccountBreakdown(job, authorization);
  const pricedProducts: PublicRepairApprovalProductLine[] = account.products.map((row) => ({
    name: text(row.productLabel, 120) || 'منتج',
    quantity: 1,
    lineCost: row.customerTotal,
    inWarranty: row.inWarranty,
    warrantyLabel: row.warrantyLabel,
    works: row.works.map((work) => ({
      kind: work.kind,
      name: work.name,
      quantity: work.quantity,
      unitPrice: work.unitPrice,
      catalogTotal: work.catalogTotal,
      lineCost: work.customerTotal,
      inWarranty: work.inWarranty,
    })),
  }));
  const authPartsCost = money(authorization.partsGross);
  const authServiceCost = money(authorization.serviceGross);
  const authNet = money(authorization.netAmount);
  const authGross = money(authorization.grossAmount);
  return {
    ...view,
    products: pricedProducts.length > 0 ? pricedProducts : view.products,
    unassignedWorks: account.unassigned.map((work) => ({
      kind: work.kind,
      name: work.name,
      quantity: work.quantity,
      unitPrice: work.unitPrice,
      catalogTotal: work.catalogTotal,
      lineCost: work.customerTotal,
      inWarranty: work.inWarranty,
    })),
    partsCost: authPartsCost > 0 || authServiceCost > 0 ? authPartsCost : view.partsCost,
    productsCost: authServiceCost > 0 || authPartsCost > 0 ? authServiceCost : view.productsCost,
    billableProductsCost: money(pricedProducts.filter((row) => !row.inWarranty).reduce((sum, row) => sum + row.lineCost, 0)),
    laborCost: 0,
    serviceOnlyCost: 0,
    estimatedTotal: authNet > 0 || authGross > 0 ? authNet : view.estimatedTotal,
  };
}

/**
 * Public repair approval payload builder.
 * Mirrors modules/repair/lib/repairApprovalPublic.ts (functions package is isolated).
 */

export type PublicRepairApprovalPartLine = {
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PublicRepairApprovalProductLine = {
  name: string;
  quantity: number;
  lineCost: number;
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
  partsUsed?: Array<{
    partName?: unknown;
    quantity?: unknown;
    unitCost?: unknown;
  }> | unknown;
  jobProducts?: Array<{
    productName?: unknown;
    quantity?: unknown;
    estimatedCost?: unknown;
    finalCost?: unknown;
  }> | unknown;
};

export function buildPublicRepairApprovalView(
  job: PublicRepairApprovalJobSource,
): PublicRepairApprovalView {
  const rawParts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
  const parts: PublicRepairApprovalPartLine[] = rawParts
    .slice(0, 50)
    .map((row) => {
      const partName = text(row?.partName, 120) || 'قطعة غيار';
      const quantity = Math.max(0, Math.round(Number(row?.quantity || 0)));
      const unitPrice = money(row?.unitCost);
      return {
        partName,
        quantity,
        unitPrice,
        lineTotal: money(quantity * unitPrice),
      };
    })
    .filter((row) => row.quantity > 0);

  const rawProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const products: PublicRepairApprovalProductLine[] = rawProducts
    .slice(0, 30)
    .map((row) => {
      const name = text(row?.productName, 120) || 'منتج';
      const quantity = Math.max(1, Math.round(Number(row?.quantity || 1)));
      const lineCost = money(row?.finalCost ?? row?.estimatedCost);
      return { name, quantity, lineCost };
    })
    .filter((row) => row.name.length > 0);

  const partsCost = money(parts.reduce((sum, row) => sum + row.lineTotal, 0));
  const laborCost = money(job.laborCost);
  const serviceOnlyCost = money(job.serviceOnlyCost);
  const productsCost = money(products.reduce((sum, row) => sum + row.lineCost, 0));
  const computed = money(partsCost + laborCost + serviceOnlyCost + productsCost);
  // التفاصيل الظاهرة للعميل هي المصدر الأول حتى لا يختلف الإجمالي عن مجموع السطور.
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
    estimatedTotal,
    parts,
    products,
  };
}

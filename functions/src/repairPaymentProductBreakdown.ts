/**
 * Mirrors modules/repair/lib/repairPaymentProductBreakdown.ts (functions package is isolated).
 */
import { isFullManufacturerWarrantyJob } from './repairManufacturerWarranty.js';

export type RepairPaymentWorkKind = 'service' | 'part';

export type RepairPaymentWorkLine = {
  kind: RepairPaymentWorkKind;
  name: string;
  quantity: number;
  unitPrice: number;
  catalogTotal: number;
  customerTotal: number;
  inWarranty: boolean;
};

export type RepairPaymentProductBreakdown = {
  itemId: string;
  productLabel: string;
  serialNo: string;
  inWarranty: boolean;
  warrantyLabel: string;
  diagnosis: string;
  works: RepairPaymentWorkLine[];
  catalogTotal: number;
  customerTotal: number;
};

export type RepairPaymentAccountBreakdown = {
  products: RepairPaymentProductBreakdown[];
  unassigned: RepairPaymentWorkLine[];
};

type PricedLine = { id?: unknown; name?: unknown; quantity?: unknown; unitPrice?: unknown; lineTotal?: unknown };
type ProductRow = {
  itemId?: unknown;
  productName?: unknown;
  quantity?: unknown;
  inWarranty?: unknown;
  serviceIds?: unknown;
  serialNo?: unknown;
  diagnosis?: unknown;
  technicianDiagnosis?: unknown;
  finalCost?: unknown;
  estimatedCost?: unknown;
};
type PartRow = {
  quantity?: unknown;
  productItemId?: unknown;
  materialId?: unknown;
  partId?: unknown;
  partName?: unknown;
  unitCost?: unknown;
};

const money = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

const warrantyLabel = (inWarranty: boolean) => (inWarranty ? 'داخل الضمان' : 'بدون ضمان');

const workLine = (
  kind: RepairPaymentWorkKind,
  name: string,
  quantity: number,
  unitPrice: number,
  inWarranty: boolean,
): RepairPaymentWorkLine => {
  const qty = Math.max(0, quantity);
  const catalogTotal = money(qty * unitPrice);
  return {
    kind,
    name,
    quantity: qty,
    unitPrice: money(unitPrice),
    catalogTotal,
    customerTotal: inWarranty ? 0 : catalogTotal,
    inWarranty,
  };
};

const sumWorks = (works: RepairPaymentWorkLine[]) => ({
  catalogTotal: money(works.reduce((sum, row) => sum + row.catalogTotal, 0)),
  customerTotal: money(works.reduce((sum, row) => sum + row.customerTotal, 0)),
});

const pricedById = (lines: PricedLine[] | undefined) => {
  const map = new Map<string, PricedLine>();
  for (const row of lines || []) {
    const id = String(row?.id || '').trim();
    if (id) map.set(id, row);
  }
  return map;
};

export function buildRepairPaymentAccountBreakdown(
  job: {
    jobProducts?: unknown;
    partsUsed?: unknown;
    warrantyScope?: unknown;
    productName?: unknown;
    deviceBrand?: unknown;
  } | null | undefined,
  authorization: {
    serviceLines?: unknown;
    partLines?: unknown;
    settlementType?: unknown;
    warrantyScope?: unknown;
    serviceGross?: unknown;
    partsGross?: unknown;
  } | null | undefined,
): RepairPaymentAccountBreakdown {
  if (!job) return { products: [], unassigned: [] };
  const products = (Array.isArray(job.jobProducts) ? job.jobProducts : []) as ProductRow[];
  const rows = products.length > 0
    ? products
    : [{ productName: job.productName || job.deviceBrand || 'منتج', quantity: 1, inWarranty: false, serviceIds: [] }];
  const fullWarranty = isFullManufacturerWarrantyJob({
    warrantyScope: job.warrantyScope,
    jobProducts: rows,
  }) || String(authorization?.settlementType || '') === 'warranty';
  const services = pricedById(Array.isArray(authorization?.serviceLines) ? authorization.serviceLines as PricedLine[] : []);
  const partPrices = pricedById(Array.isArray(authorization?.partLines) ? authorization.partLines as PricedLine[] : []);
  const usedServiceIds = new Set<string>();
  const partsUsed = (Array.isArray(job.partsUsed) ? job.partsUsed : []) as PartRow[];

  const productRows: RepairPaymentProductBreakdown[] = rows.map((product) => {
    const itemId = String(product.itemId || '').trim();
    const inWarranty = fullWarranty || Boolean(product.inWarranty);
    const deviceQty = Math.max(1, Math.round(Number(product.quantity || 1)));
    const works: RepairPaymentWorkLine[] = [];
    const serviceIds = Array.isArray(product.serviceIds) ? product.serviceIds : [];
    for (const rawId of serviceIds) {
      const serviceId = String(rawId || '').trim();
      if (!serviceId) continue;
      usedServiceIds.add(serviceId);
      const priced = services.get(serviceId);
      if (!priced) continue;
      works.push(workLine('service', String(priced.name || 'خدمة صيانة').trim(), deviceQty, money(priced.unitPrice), inWarranty));
    }
    for (const part of partsUsed) {
      const qty = Math.max(0, Number(part.quantity || 0));
      if (qty <= 0) continue;
      const linkedId = String(part.productItemId || '').trim();
      const belongs = linkedId ? linkedId === itemId : rows.length === 1;
      if (!belongs) continue;
      const materialId = String(part.materialId || part.partId || '').trim();
      const priced = materialId ? partPrices.get(materialId) : undefined;
      works.push(workLine(
        'part',
        String(priced?.name || part.partName || 'قطعة غيار'),
        qty,
        money(priced?.unitPrice ?? part.unitCost),
        inWarranty,
      ));
    }
    if (works.length === 0) {
      const fallback = money(product.finalCost ?? product.estimatedCost);
      if (fallback > 0) works.push(workLine('service', 'صيانة', deviceQty, money(fallback / deviceQty), inWarranty));
    }
    const totals = sumWorks(works);
    return {
      itemId: itemId || String(product.productName || 'منتج'),
      productLabel: String(product.productName || 'منتج').trim() || 'منتج',
      serialNo: String(product.serialNo || '').trim(),
      inWarranty,
      warrantyLabel: warrantyLabel(inWarranty),
      diagnosis: String(product.technicianDiagnosis || product.diagnosis || '').trim(),
      works,
      catalogTotal: totals.catalogTotal,
      customerTotal: totals.customerTotal,
    };
  });

  const unassigned: RepairPaymentWorkLine[] = [];
  const serviceLines = Array.isArray(authorization?.serviceLines) ? authorization.serviceLines as PricedLine[] : [];
  for (const line of serviceLines) {
    const id = String(line.id || '').trim();
    if (!id || usedServiceIds.has(id)) continue;
    if (money(line.quantity) <= 0 && money(line.lineTotal) <= 0) continue;
    unassigned.push(workLine('service', String(line.name || 'خدمة صيانة'), Math.max(1, Number(line.quantity || 1)), money(line.unitPrice), fullWarranty));
  }
  for (const part of partsUsed) {
    const qty = Math.max(0, Number(part.quantity || 0));
    if (qty <= 0) continue;
    const linkedId = String(part.productItemId || '').trim();
    if (linkedId || rows.length === 1) continue;
    const materialId = String(part.materialId || part.partId || '').trim();
    const priced = materialId ? partPrices.get(materialId) : undefined;
    unassigned.push(workLine('part', String(priced?.name || part.partName || 'قطعة غيار'), qty, money(priced?.unitPrice ?? part.unitCost), fullWarranty));
  }
  const hasAnyWork = productRows.some((row) => row.works.length > 0) || unassigned.length > 0;
  if (!hasAnyWork) {
    if (money(authorization?.serviceGross) > 0) {
      unassigned.push(workLine('service', 'خدمات صيانة', 1, money(authorization?.serviceGross), fullWarranty));
    }
    if (money(authorization?.partsGross) > 0) {
      unassigned.push(workLine('part', 'قطع غيار', 1, money(authorization?.partsGross), fullWarranty));
    }
  }
  if (productRows.length === 1 && unassigned.length > 0) {
    const works = [...productRows[0]!.works, ...unassigned];
    productRows[0] = { ...productRows[0]!, works, ...sumWorks(works) };
    return { products: productRows, unassigned: [] };
  }
  return { products: productRows, unassigned };
}

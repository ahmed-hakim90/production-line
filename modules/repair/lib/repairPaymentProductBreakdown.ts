/**
 * Per-product work + customer charge for the repair account print.
 * Authorization service/part lines hold catalog prices; job products hold
 * which service/part belongs to which device.
 */
import { formatRepairPrintProductLabel, resolveRepairJobPrintProducts } from './repairJobPrint';
import {
  isFullManufacturerWarrantyJob,
  isWarrantySettlementAuth,
  manufacturerWarrantyLineLabel,
} from './repairManufacturerWarranty';
import type {
  RepairJob,
  RepairJobProduct,
  RepairPartUsage,
  RepairPaymentAuthorization,
  RepairPricedLine,
} from '../types';

export type RepairPaymentWorkKind = 'service' | 'part';

export type RepairPaymentWorkLine = {
  kind: RepairPaymentWorkKind;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Catalog value (what the work is worth). */
  catalogTotal: number;
  /** Amount billed to the customer (0 when warranty-covered). */
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

export type PublicAccountWorkLine = {
  kind: RepairPaymentWorkKind;
  name: string;
  quantity: number;
  unitPrice: number;
  catalogTotal: number;
  lineCost: number;
  inWarranty: boolean;
};

export const toPublicAccountWorkLine = (work: RepairPaymentWorkLine): PublicAccountWorkLine => ({
  kind: work.kind,
  name: work.name,
  quantity: work.quantity,
  unitPrice: work.unitPrice,
  catalogTotal: work.catalogTotal,
  lineCost: work.customerTotal,
  inWarranty: work.inWarranty,
});

const money = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

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

const withWorks = (
  product: RepairPaymentProductBreakdown,
  extra: RepairPaymentWorkLine[],
): RepairPaymentProductBreakdown => {
  if (extra.length === 0) return product;
  const works = [...product.works, ...extra];
  return { ...product, works, ...sumWorks(works) };
};

function pricedById(lines: RepairPricedLine[] | undefined): Map<string, RepairPricedLine> {
  const map = new Map<string, RepairPricedLine>();
  for (const row of lines || []) {
    const id = String(row?.id || '').trim();
    if (id) map.set(id, row);
  }
  return map;
}

function attachUnlinkedToSingleProduct(
  products: RepairJobProduct[],
  productItemId: string,
): boolean {
  if (productItemId) return false;
  return products.length === 1;
}

export function buildRepairPaymentAccountBreakdown(
  job: RepairJob | null | undefined,
  authorization: Pick<
    RepairPaymentAuthorization,
    'serviceLines' | 'partLines' | 'settlementType' | 'warrantyScope' | 'serviceGross' | 'partsGross'
  > | null | undefined,
): RepairPaymentAccountBreakdown {
  if (!job) return { products: [], unassigned: [] };
  const products = resolveRepairJobPrintProducts(job);
  const fullWarranty = isFullManufacturerWarrantyJob(job)
    || isWarrantySettlementAuth(authorization);
  const services = pricedById(authorization?.serviceLines);
  const partPrices = pricedById(authorization?.partLines);
  const usedServiceIds = new Set<string>();

  const productRows: RepairPaymentProductBreakdown[] = products.map((product) => {
    const itemId = String(product.itemId || '').trim();
    const inWarranty = fullWarranty || Boolean(product.inWarranty);
    const deviceQty = Math.max(1, Math.round(Number(product.quantity || 1)));
    const works: RepairPaymentWorkLine[] = [];

    for (const rawId of product.serviceIds || []) {
      const serviceId = String(rawId || '').trim();
      if (!serviceId) continue;
      usedServiceIds.add(serviceId);
      const priced = services.get(serviceId);
      if (!priced) continue;
      const name = String(priced.name || 'خدمة صيانة').trim();
      const unitPrice = money(priced.unitPrice);
      works.push(workLine('service', name, deviceQty, unitPrice, inWarranty));
    }

    const parts = (job.partsUsed || []) as RepairPartUsage[];
    for (const part of parts) {
      const qty = Math.max(0, Number(part.quantity || 0));
      if (qty <= 0) continue;
      const linkedId = String(part.productItemId || '').trim();
      const belongs = linkedId
        ? linkedId === itemId
        : attachUnlinkedToSingleProduct(products, linkedId);
      if (!belongs) continue;
      const materialId = String(part.materialId || part.partId || '').trim();
      const priced = materialId ? partPrices.get(materialId) : undefined;
      const unitPrice = money(priced?.unitPrice ?? part.unitCost);
      const name = String(priced?.name || part.partName || 'قطعة غيار').trim();
      works.push(workLine('part', name, qty, unitPrice, inWarranty));
    }

    if (works.length === 0) {
      const fallback = money(product.finalCost ?? product.estimatedCost);
      if (fallback > 0) {
        works.push(workLine('service', 'صيانة', deviceQty, money(fallback / deviceQty), inWarranty));
      }
    }

    const totals = sumWorks(works);
    return {
      itemId: itemId || product.productName,
      productLabel: formatRepairPrintProductLabel(product),
      serialNo: String(product.serialNo || '').trim(),
      inWarranty,
      warrantyLabel: manufacturerWarrantyLineLabel(inWarranty),
      diagnosis: String(product.technicianDiagnosis || product.diagnosis || '').trim(),
      works,
      catalogTotal: totals.catalogTotal,
      customerTotal: totals.customerTotal,
    };
  });

  const unassigned: RepairPaymentWorkLine[] = [];
  for (const line of authorization?.serviceLines || []) {
    const id = String(line.id || '').trim();
    if (!id || usedServiceIds.has(id)) continue;
    if (money(line.quantity) <= 0 && money(line.lineTotal) <= 0) continue;
    const qty = Math.max(1, Number(line.quantity || 1));
    unassigned.push(workLine('service', String(line.name || 'خدمة صيانة'), qty, money(line.unitPrice), fullWarranty));
  }
  for (const part of job.partsUsed || []) {
    const qty = Math.max(0, Number(part.quantity || 0));
    if (qty <= 0) continue;
    const linkedId = String(part.productItemId || '').trim();
    if (linkedId || attachUnlinkedToSingleProduct(products, linkedId)) continue;
    const materialId = String(part.materialId || part.partId || '').trim();
    const priced = materialId ? partPrices.get(materialId) : undefined;
    unassigned.push(workLine(
      'part',
      String(priced?.name || part.partName || 'قطعة غيار'),
      qty,
      money(priced?.unitPrice ?? part.unitCost),
      fullWarranty,
    ));
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
    productRows[0] = withWorks(productRows[0]!, unassigned);
    return { products: productRows, unassigned: [] };
  }

  return { products: productRows, unassigned };
}

export function formatRepairPaymentAccountText(
  account: RepairPaymentAccountBreakdown,
): string {
  const moneyText = (value: number) =>
    `${value.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
  const blocks: string[] = [];
  for (const product of account.products) {
    if (product.works.length === 0) continue;
    const lines = [`${product.productLabel}${product.inWarranty ? ' — داخل الضمان' : ''}:`];
    for (const work of product.works) {
      const kind = work.kind === 'part' ? 'قطعة' : 'خدمة';
      const amount = work.inWarranty ? 'مجاني' : moneyText(work.customerTotal);
      lines.push(`- ${kind}: ${work.name} — ${amount}`);
    }
    blocks.push(lines.join('\n'));
  }
  if (account.unassigned.length > 0) {
    const lines = ['بنود غير مربوطة بمنتج:'];
    for (const work of account.unassigned) {
      const kind = work.kind === 'part' ? 'قطعة' : 'خدمة';
      const amount = work.inWarranty ? 'مجاني' : moneyText(work.customerTotal);
      lines.push(`- ${kind}: ${work.name} — ${amount}`);
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

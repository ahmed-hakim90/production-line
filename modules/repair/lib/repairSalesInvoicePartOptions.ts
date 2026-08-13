import type { CustomerType } from '../../customers/types';
import { resolveRepairSalePrice } from '../utils/sparePartPricing';

export type RepairSalesInvoicePartOptionSource = 'material' | 'legacy_part';

export type RepairSalesInvoicePartOptionInput = {
  parts: Array<{
    id?: string | null;
    name?: string | null;
    code?: string | null;
    unit?: string | null;
    materialId?: string | null;
    rawMaterialId?: string | null;
    defaultSalePrice?: number | null;
  }>;
  materials: Array<{
    id?: string | null;
    name?: string | null;
    code?: string | null;
    barcode?: string | null;
    baseUnit?: string | null;
    defaultSalePrice?: number | null;
    traderSalePrice?: number | null;
    isActive?: boolean | null;
  }>;
  /** When trader, prefer Material.traderSalePrice; otherwise consumer defaultSalePrice. */
  customerType?: CustomerType | string | null;
  /** Warehouse balances keyed by material id (inventory SoT). */
  warehouseQtyByMaterialId: Map<string, number> | Record<string, number>;
  /** Legacy repair ledger balances keyed by part id. */
  legacyQtyByPartId: Map<string, number> | Record<string, number>;
  formatQty?: (n: number) => string;
};

export type RepairSalesInvoicePartOption = {
  /** Select value: `material:{id}` or `part:{id}` for legacy unlinked catalog rows. */
  value: string;
  label: string;
  source: RepairSalesInvoicePartOptionSource;
  materialId?: string;
  partId?: string;
  partName: string;
  code?: string;
  barcode?: string;
  scanKeys?: string[];
  unit?: string;
  salePrice: number;
  availableQty: number;
};

const qtyOf = (
  map: Map<string, number> | Record<string, number>,
  key: string,
): number => {
  if (map instanceof Map) return Number(map.get(key) || 0);
  return Number(map[key] || 0);
};

const fmtDefault = (n: number) => String(n);

/**
 * Build sales-invoice picker options from active materials + branch catalog.
 * Linked parts collapse onto their material id; unlinked parts stay as legacy rows.
 */
export function buildRepairSalesInvoicePartOptions(
  input: RepairSalesInvoicePartOptionInput,
): RepairSalesInvoicePartOption[] {
  const formatQty = input.formatQty || fmtDefault;
  const saleByMaterialId = new Map<string, { consumer: number; trader: number }>();
  for (const material of input.materials) {
    const id = String(material.id || '').trim();
    if (!id) continue;
    saleByMaterialId.set(id, {
      consumer: Number(material.defaultSalePrice || 0),
      trader: Number(material.traderSalePrice || 0),
    });
  }

  const partByMaterialId = new Map<string, (typeof input.parts)[number]>();
  const legacyParts: typeof input.parts = [];
  for (const part of input.parts) {
    const partId = String(part.id || '').trim();
    if (!partId) continue;
    const materialId = String(part.materialId || part.rawMaterialId || '').trim();
    if (materialId) {
      if (!partByMaterialId.has(materialId)) partByMaterialId.set(materialId, part);
    } else {
      legacyParts.push(part);
    }
  }

  const materialsById = new Map(
    input.materials
      .map((material) => [String(material.id || '').trim(), material] as const)
      .filter(([id]) => Boolean(id)),
  );

  const options: RepairSalesInvoicePartOption[] = [];
  const seenMaterials = new Set<string>();

  const pushMaterial = (
    materialId: string,
    name: string,
    code: string,
    unit: string | undefined,
    partSalePrice: number | undefined,
    partId?: string,
    extraCodes: Array<string | null | undefined> = [],
  ) => {
    if (!materialId || seenMaterials.has(materialId)) return;
    seenMaterials.add(materialId);
    const availableQty = qtyOf(input.warehouseQtyByMaterialId, materialId);
    const prices = saleByMaterialId.get(materialId);
    const salePrice = resolveRepairSalePrice({
      customerType: input.customerType,
      materialSalePrice: prices?.consumer,
      materialTraderSalePrice: prices?.trader,
      partSalePrice,
    });
    const barcode = String(materialsById.get(materialId)?.barcode || '').trim() || undefined;
    const codeSuffix = code ? ` (${code})` : '';
    options.push({
      value: `material:${materialId}`,
      label: `${name}${codeSuffix} — رصيد ${formatQty(availableQty)}`,
      source: 'material',
      materialId,
      partId,
      partName: name,
      code: code || undefined,
      barcode,
      scanKeys: [code, barcode, ...extraCodes].map((key) => String(key || '').trim()).filter(Boolean),
      unit,
      salePrice,
      availableQty,
    });
  };

  // Prefer catalog-linked materials first (stable names from branch parts).
  // Skip rows whose material is not in the eligible materials list (e.g. not for spare parts).
  for (const [materialId, part] of partByMaterialId.entries()) {
    if (!saleByMaterialId.has(materialId)) continue;
    pushMaterial(
      materialId,
      String(part.name || materialId),
      String(part.code || ''),
      part.unit ? String(part.unit) : undefined,
      part.defaultSalePrice != null ? Number(part.defaultSalePrice) : undefined,
      String(part.id || '').trim() || undefined,
      [materialsById.get(materialId)?.code],
    );
  }

  for (const material of input.materials) {
    if (material.isActive === false) continue;
    const materialId = String(material.id || '').trim();
    if (!materialId) continue;
    const linked = partByMaterialId.get(materialId);
    pushMaterial(
      materialId,
      String(material.name || materialId),
      String(material.code || ''),
      material.baseUnit ? String(material.baseUnit) : undefined,
      linked?.defaultSalePrice != null ? Number(linked.defaultSalePrice) : undefined,
      linked?.id ? String(linked.id) : undefined,
      [linked?.code],
    );
  }

  for (const part of legacyParts) {
    const partId = String(part.id || '').trim();
    if (!partId) continue;
    const availableQty = qtyOf(input.legacyQtyByPartId, partId);
    const name = String(part.name || partId);
    const code = String(part.code || '');
    const codeSuffix = code ? ` (${code})` : '';
    options.push({
      value: `part:${partId}`,
      label: `${name}${codeSuffix} — رصيد ${formatQty(availableQty)}`,
      source: 'legacy_part',
      partId,
      partName: name,
      code: code || undefined,
      scanKeys: code ? [code] : [],
      unit: part.unit ? String(part.unit) : undefined,
      salePrice: resolveRepairSalePrice({
        customerType: input.customerType,
        partSalePrice: part.defaultSalePrice,
      }),
      availableQty,
    });
  }

  return options.sort((a, b) => a.partName.localeCompare(b.partName, 'ar'));
}

export function parseRepairSalesInvoicePartOptionValue(value: string): {
  source: RepairSalesInvoicePartOptionSource;
  id: string;
} | null {
  const raw = String(value || '').trim();
  if (raw.startsWith('material:')) {
    const id = raw.slice('material:'.length).trim();
    return id ? { source: 'material', id } : null;
  }
  if (raw.startsWith('part:')) {
    const id = raw.slice('part:'.length).trim();
    return id ? { source: 'legacy_part', id } : null;
  }
  return null;
}

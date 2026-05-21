import { formatCategoryBreadcrumb } from '../../catalog/lib/categoryTree';
import type { Material, MaterialCategory, MaterialType } from '../types';

export type MaterialRequirementDetailExportRow = {
  productId: string;
  productCode: string;
  productName: string;
  productCategoryLabel: string;
  productQuantity: number;
  materialId: string;
  materialCode: string;
  materialName: string;
  materialCategoryName: string;
  materialType: MaterialType;
  materialTypeLabel: string;
  requiredQty: number;
  unit: string;
  availableQty: number;
  reservedQty: number;
  shortageQty: number;
  estimatedCost: number;
};

export type MaterialRequirementSummaryExportRow = {
  groupKey: string;
  categoryLabel: string;
  itemCount: number;
  requiredQty: number;
  availableQty: number;
  reservedQty: number;
  shortageQty: number;
  estimatedCost: number;
  materialCode?: string;
  materialName?: string;
};

export function resolveMaterialCategoryLabel(
  material: Material,
  materialCategories?: MaterialCategory[],
): string {
  const fromName = String(material.categoryName ?? '').trim();
  if (fromName) return fromName;
  const id = material.categoryId?.trim();
  if (id && materialCategories?.length) {
    return formatCategoryBreadcrumb(materialCategories, id);
  }
  return '';
}

export function materialAggregateKey(row: MaterialRequirementDetailExportRow): string {
  return [
    row.materialId,
    row.materialType,
    row.unit,
    row.materialCategoryName,
  ].join('|');
}

export function productCategoryAggregateKey(row: MaterialRequirementDetailExportRow): string {
  return row.productCategoryLabel || 'غير مصنف';
}

export function aggregateByMaterialKey(
  detailRows: MaterialRequirementDetailExportRow[],
): MaterialRequirementSummaryExportRow[] {
  const groups = new Map<string, MaterialRequirementDetailExportRow[]>();
  for (const row of detailRows) {
    const key = materialAggregateKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: MaterialRequirementSummaryExportRow[] = [];
  for (const [key, rows] of groups) {
    const first = rows[0];
    const requiredQty = rows.reduce((s, r) => s + r.requiredQty, 0);
    const estimatedCost = rows.reduce((s, r) => s + r.estimatedCost, 0);
    const availableQty = first.availableQty;
    const reservedQty = first.reservedQty;
    const shortageQty = Math.max(0, requiredQty - availableQty - reservedQty);
    out.push({
      groupKey: key,
      categoryLabel: first.materialCategoryName || '—',
      itemCount: rows.length,
      requiredQty,
      availableQty,
      reservedQty,
      shortageQty,
      estimatedCost,
      materialCode: first.materialCode,
      materialName: first.materialName,
    });
  }

  return out.sort((a, b) =>
    String(a.materialName || '').localeCompare(String(b.materialName || ''), 'ar'),
  );
}

export function aggregateByProductCategoryKey(
  detailRows: MaterialRequirementDetailExportRow[],
): MaterialRequirementSummaryExportRow[] {
  const groups = new Map<string, MaterialRequirementDetailExportRow[]>();
  for (const row of detailRows) {
    const key = productCategoryAggregateKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: MaterialRequirementSummaryExportRow[] = [];
  for (const [key, rows] of groups) {
    const requiredQty = rows.reduce((s, r) => s + r.requiredQty, 0);
    const estimatedCost = rows.reduce((s, r) => s + r.estimatedCost, 0);
    const uniqueMaterials = new Set(rows.map((r) => r.materialId));
    out.push({
      groupKey: key,
      categoryLabel: rows[0].productCategoryLabel || 'غير مصنف',
      itemCount: rows.length,
      requiredQty,
      availableQty: 0,
      reservedQty: 0,
      shortageQty: 0,
      estimatedCost,
      materialCode: uniqueMaterials.size === 1 ? rows[0].materialCode : 'متعدد',
      materialName: uniqueMaterials.size === 1 ? rows[0].materialName : 'متعدد',
    });
  }

  return out.sort((a, b) =>
    String(a.categoryLabel || '').localeCompare(String(b.categoryLabel || ''), 'ar'),
  );
}

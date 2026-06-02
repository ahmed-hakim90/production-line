import type { FirestoreProduct } from '../../../types';
import type { ProductCategory } from '../../catalog/services/categoryService';
import { resolveProductCategoryLabel } from '../../catalog/lib/resolveProductCategory';
import type {
  Material,
  MaterialCategory,
  MaterialRequirementInput,
  MaterialRequirementLine,
  MaterialType,
} from '../types';
import { MATERIAL_TYPE_LABELS } from '../types';
import {
  aggregateExplodedLeaves,
  explodeBom,
  type BomExplosionContext,
  type ExplodedLeafLine,
} from './bomExplosionEngine';
import { calculateMaterialLineCost, type MaterialUnitCostResolver } from './materialCostEngine';
import {
  resolveMaterialCategoryLabel,
  type MaterialRequirementDetailExportRow,
} from '../lib/materialRequirementsExportLib';

export type StockAvailabilityLookup = (materialId: string, legacyRawMaterialId?: string) => {
  availableQty: number;
  reservedQty: number;
};

export type ProductionPlanningInput = {
  inputs: MaterialRequirementInput[];
  explosionCtx: BomExplosionContext;
  materialsById: Map<string, Material>;
  stockLookup: StockAvailabilityLookup;
  materialCategories?: MaterialCategory[];
  resolveEffectiveUnitCost?: MaterialUnitCostResolver;
};

export type ProductionPlanningDetailInput = ProductionPlanningInput & {
  productsById: Map<string, FirestoreProduct>;
  productCategories: ProductCategory[];
};

export function generateMaterialRequirements(
  args: ProductionPlanningInput,
): MaterialRequirementLine[] {
  const allLeaves: ExplodedLeafLine[] = [];

  for (const input of args.inputs) {
    if (input.ownerType !== 'product' || !input.ownerId || input.quantity <= 0) continue;
    const leaves = explodeBom(args.explosionCtx, 'product', input.ownerId, input.quantity);
    allLeaves.push(...leaves);
  }

  const aggregated = aggregateExplodedLeaves(allLeaves);
  const lines: MaterialRequirementLine[] = [];

  for (const [, leaf] of aggregated) {
    const material = args.materialsById.get(leaf.materialId);
    if (!material) continue;

    const stock = args.stockLookup(leaf.materialId, material.legacyRawMaterialId);
    const cost = calculateMaterialLineCost({
      material,
      requiredQty: leaf.requiredQty,
      resolveEffectiveUnitCost: args.resolveEffectiveUnitCost,
    });

    const requiredQty = leaf.requiredQty;
    const availableQty = stock.availableQty;
    const reservedQty = stock.reservedQty;
    const shortageQty = Math.max(0, requiredQty - availableQty - reservedQty);

    lines.push({
      materialId: material.id || leaf.materialId,
      materialCode: material.code,
      materialName: material.name,
      materialType: material.type,
      materialCategoryName: resolveMaterialCategoryLabel(material, args.materialCategories),
      requiredQty,
      unit: material.baseUnit,
      availableQty,
      reservedQty,
      shortageQty,
      estimatedCost: cost.total,
      explodedFrom: leaf.explodedFrom,
    });
  }

  lines.sort((a, b) => a.materialName.localeCompare(b.materialName, 'ar'));
  return lines;
}

export function totalEstimatedCost(lines: MaterialRequirementLine[]): number {
  return lines.reduce((sum, l) => sum + Number(l.estimatedCost || 0), 0);
}

function detailRowFromLeaf(args: {
  input: MaterialRequirementInput;
  leaf: ExplodedLeafLine;
  material: Material;
  product?: FirestoreProduct;
  productCategories: ProductCategory[];
  materialCategories?: MaterialCategory[];
  stockLookup: StockAvailabilityLookup;
  resolveEffectiveUnitCost?: MaterialUnitCostResolver;
}): MaterialRequirementDetailExportRow {
  const {
    material,
    leaf,
    input,
    product,
    productCategories,
    materialCategories,
    stockLookup,
    resolveEffectiveUnitCost,
  } = args;
  const stock = stockLookup(leaf.materialId, material.legacyRawMaterialId);
  const cost = calculateMaterialLineCost({
    material,
    requiredQty: leaf.requiredQty,
    resolveEffectiveUnitCost,
  });
  const requiredQty = leaf.requiredQty;
  const availableQty = stock.availableQty;
  const reservedQty = stock.reservedQty;
  const shortageQty = Math.max(0, requiredQty - availableQty - reservedQty);
  const materialCategoryName = resolveMaterialCategoryLabel(material, materialCategories);

  return {
    productId: input.ownerId,
    productCode: product ? String(product.code || '') : '',
    productName: product ? String(product.name || '') : '',
    productCategoryLabel: product
      ? resolveProductCategoryLabel(product, productCategories) || 'غير مصنف'
      : 'غير مصنف',
    productQuantity: input.quantity,
    materialId: material.id || leaf.materialId,
    materialCode: material.code,
    materialName: material.name,
    materialCategoryName,
    materialType: material.type,
    materialTypeLabel: MATERIAL_TYPE_LABELS[material.type as MaterialType],
    requiredQty,
    unit: material.baseUnit,
    availableQty,
    reservedQty,
    shortageQty,
    estimatedCost: cost.total,
  };
}

export function generateMaterialRequirementDetailRows(
  args: ProductionPlanningDetailInput,
): MaterialRequirementDetailExportRow[] {
  const rows: MaterialRequirementDetailExportRow[] = [];

  for (const input of args.inputs) {
    if (input.ownerType !== 'product' || !input.ownerId || input.quantity <= 0) continue;
    const product = args.productsById.get(input.ownerId);
    const leaves = explodeBom(args.explosionCtx, 'product', input.ownerId, input.quantity);
    for (const leaf of leaves) {
      const material = args.materialsById.get(leaf.materialId);
      if (!material) continue;
      rows.push(
        detailRowFromLeaf({
          input,
          leaf,
          material,
          product,
          productCategories: args.productCategories,
          materialCategories: args.materialCategories,
          stockLookup: args.stockLookup,
          resolveEffectiveUnitCost: args.resolveEffectiveUnitCost,
        }),
      );
    }
  }

  return rows;
}

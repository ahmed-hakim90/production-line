import type { BomItem, Material } from '../types';
import { materialPurchaseCostPerBaseUnit } from '../types';

export type MaterialLineCostInput = {
  material: Material;
  requiredQty: number;
  bomItem?: Pick<
    BomItem,
    'wastePercent' | 'costBehavior' | 'directCostPerUnit' | 'indirectCostPerUnit'
  >;
};

export type MaterialLineCostBreakdown = {
  purchaseComponent: number;
  wasteComponent: number;
  directComponent: number;
  indirectComponent: number;
  total: number;
};

export function calculateMaterialLineCost(input: MaterialLineCostInput): MaterialLineCostBreakdown {
  const qty = Math.max(0, Number(input.requiredQty || 0));
  const purchasePerBase = materialPurchaseCostPerBaseUnit(input.material);
  const purchaseComponent = purchasePerBase * qty;

  const itemWaste = input.bomItem?.wastePercent;
  const wastePct = Number(itemWaste ?? input.material.wastePercent ?? 0);
  const wasteComponent = wastePct > 0 ? purchaseComponent * (wastePct / 100) : 0;

  const directPerUnit = Number(input.bomItem?.directCostPerUnit ?? 0);
  const indirectPerUnit = Number(input.bomItem?.indirectCostPerUnit ?? 0);
  const directComponent = directPerUnit * qty;
  const indirectComponent = indirectPerUnit * qty;

  const total = purchaseComponent + wasteComponent + directComponent + indirectComponent;
  return {
    purchaseComponent,
    wasteComponent,
    directComponent,
    indirectComponent,
    total,
  };
}

/** Spec example: 80/kg × 0.25 + direct 3 + indirect 2 + waste 1 = 26 */
export function calculateMaterialLineCostFromRates(args: {
  purchaseCostPerBaseUnit: number;
  usageQty: number;
  wastePercent?: number;
  directCost?: number;
  indirectCost?: number;
}): MaterialLineCostBreakdown {
  const material: Material = {
    code: '',
    name: '',
    type: 'raw_material',
    baseUnit: 'kg',
    purchaseCost: args.purchaseCostPerBaseUnit,
    conversionRate: 1,
    wastePercent: args.wastePercent ?? 0,
    isActive: true,
    createdAt: '',
  };
  return calculateMaterialLineCost({
    material,
    requiredQty: args.usageQty,
    bomItem: {
      directCostPerUnit: args.directCost != null ? args.directCost / Math.max(args.usageQty, 1) : 0,
      indirectCostPerUnit: args.indirectCost != null ? args.indirectCost / Math.max(args.usageQty, 1) : 0,
      wastePercent: 0,
    },
  });
}

export type BomItemCostRow = {
  itemId: string;
  itemName: string;
  itemType: BomItem['itemType'];
  materialType?: string;
  qtyPerUnit: number;
  unit: string;
  wastePercent: number;
  directCost: number;
  indirectCost: number;
  totalCost: number;
};

export function calculateBomItemUnitCost(
  material: Material | null,
  item: BomItem,
  qtyMultiplier: number = 1,
): BomItemCostRow {
  const qty = Number(item.qtyPerUnit || 0) * qtyMultiplier;
  if (!material) {
    return {
      itemId: item.itemId,
      itemName: item.itemName || item.itemId,
      itemType: item.itemType,
      qtyPerUnit: item.qtyPerUnit,
      unit: String(item.unit || ''),
      wastePercent: Number(item.wastePercent ?? 0),
      directCost: Number(item.directCostPerUnit ?? 0) * qty,
      indirectCost: Number(item.indirectCostPerUnit ?? 0) * qty,
      totalCost: (Number(item.directCostPerUnit ?? 0) + Number(item.indirectCostPerUnit ?? 0)) * qty,
    };
  }
  const breakdown = calculateMaterialLineCost({ material, requiredQty: qty, bomItem: item });
  return {
    itemId: item.itemId,
    itemName: item.itemName || material.name,
    itemType: item.itemType,
    materialType: material.type,
    qtyPerUnit: item.qtyPerUnit,
    unit: String(item.unit || material.baseUnit),
    wastePercent: Number(item.wastePercent ?? material.wastePercent ?? 0),
    directCost: breakdown.directComponent,
    indirectCost: breakdown.indirectComponent,
    totalCost: breakdown.total,
  };
}

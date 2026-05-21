export type MaterialType = 'raw_material' | 'semi_finished' | 'consumable' | 'packaging';

export type MaterialUnit = 'piece' | 'kg' | 'gram' | 'meter' | 'liter';

export type BomOwnerType = 'product' | 'material';

export type BomStatus = 'active' | 'draft';

export type BomItemType = 'material' | 'product';

export type CostBehavior = 'direct' | 'indirect';

export interface MaterialCategory {
  id?: string;
  tenantId?: string;
  name: string;
  parentId?: string | null;
  path?: string[];
  level?: number;
  sortOrder?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Material {
  id?: string;
  tenantId?: string;
  code: string;
  name: string;
  type: MaterialType;
  categoryId?: string | null;
  categoryName?: string;
  baseUnit: MaterialUnit;
  purchaseUnit?: string;
  conversionRate?: number;
  purchaseCost?: number;
  wastePercent?: number;
  isManufacturedInternally?: boolean;
  linkedCostCenterIds?: string[];
  legacyRawMaterialId?: string;
  minStock?: number;
  isActive: boolean;
  createdAt: string;
}

export interface Bom {
  id?: string;
  tenantId?: string;
  ownerType: BomOwnerType;
  ownerId: string;
  version: number;
  status: BomStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface BomItem {
  id?: string;
  tenantId?: string;
  bomId: string;
  itemId: string;
  itemType: BomItemType;
  itemName?: string;
  qtyPerUnit: number;
  unit: MaterialUnit | string;
  wastePercent?: number;
  costBehavior?: CostBehavior;
  costCenterId?: string;
  directCostPerUnit?: number;
  indirectCostPerUnit?: number;
  sortOrder?: number;
}

export interface MaterialRequirementExplodedFrom {
  ownerType: BomOwnerType;
  ownerId: string;
  path: string[];
}

export interface MaterialRequirementLine {
  materialId: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialType;
  materialCategoryName?: string;
  requiredQty: number;
  unit: MaterialUnit | string;
  availableQty: number;
  reservedQty: number;
  shortageQty: number;
  estimatedCost: number;
  explodedFrom?: MaterialRequirementExplodedFrom;
}

export type MaterialRequirementRunStatus = 'completed' | 'failed';

export interface MaterialRequirementInput {
  ownerType: 'product';
  ownerId: string;
  quantity: number;
}

export interface MaterialRequirementRun {
  id?: string;
  tenantId?: string;
  inputs: MaterialRequirementInput[];
  status: MaterialRequirementRunStatus;
  lines: MaterialRequirementLine[];
  totalEstimatedCost: number;
  generatedAt: string;
  generatedBy: string;
  errorMessage?: string;
}

export interface ProductionPlanMaterialRequirements {
  id?: string;
  tenantId?: string;
  planId?: string;
  planIds?: string[];
  lines: MaterialRequirementLine[];
  totalEstimatedCost: number;
  generatedAt: string;
  generatedBy: string;
  useRemainingQty?: boolean;
}

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  raw_material: 'مادة خام',
  semi_finished: 'نصف مصنع',
  consumable: 'مستهلكات',
  packaging: 'تعبئة وتغليف',
};

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  piece: 'قطعة',
  kg: 'كجم',
  gram: 'جرام',
  meter: 'متر',
  liter: 'لتر',
};

export const LEGACY_UNIT_TO_BASE: Record<string, MaterialUnit> = {
  unit: 'piece',
  piece: 'piece',
  pcs: 'piece',
  kg: 'kg',
  kilogram: 'kg',
  gram: 'gram',
  g: 'gram',
  meter: 'meter',
  m: 'meter',
  liter: 'liter',
  l: 'liter',
};

export function normalizeLegacyUnit(unit?: string): MaterialUnit {
  const key = String(unit || 'piece').trim().toLowerCase();
  return LEGACY_UNIT_TO_BASE[key] ?? 'piece';
}

export function materialPurchaseCostPerBaseUnit(material: Pick<Material, 'purchaseCost' | 'conversionRate'>): number {
  const cost = Number(material.purchaseCost ?? 0);
  const rate = Number(material.conversionRate ?? 0);
  if (rate > 0) return cost / rate;
  return cost;
}

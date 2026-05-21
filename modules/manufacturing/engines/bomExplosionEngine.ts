import type { Bom, BomItem, BomOwnerType, Material, MaterialRequirementExplodedFrom } from '../types';

export type ExplodedLeafLine = {
  materialId: string;
  requiredQty: number;
  explodedFrom?: MaterialRequirementExplodedFrom;
};

export type BomExplosionContext = {
  getActiveBom: (ownerType: BomOwnerType, ownerId: string) => Bom | null | undefined;
  getBomItems: (bomId: string) => BomItem[];
  getMaterial: (materialId: string) => Material | null | undefined;
  /** Semi-finished / child products recurse via material BOM when type is semi_finished */
  getMaterialType: (materialId: string) => string | undefined;
};

const ownerKey = (ownerType: BomOwnerType, ownerId: string) => `${ownerType}:${ownerId}`;

function effectiveQty(qtyPerUnit: number, wastePercent: number, parentMultiplier: number): number {
  const base = Number(qtyPerUnit || 0) * parentMultiplier;
  const waste = Number(wastePercent || 0);
  if (waste <= 0) return base;
  return base * (1 + waste / 100);
}

export function explodeBom(
  ctx: BomExplosionContext,
  ownerType: BomOwnerType,
  ownerId: string,
  quantity: number,
  visited: Set<string> = new Set(),
  path: string[] = [],
): ExplodedLeafLine[] {
  const key = ownerKey(ownerType, ownerId);
  if (visited.has(key)) {
    throw new Error(`BOM cycle detected at ${key}`);
  }
  visited.add(key);

  const bom = ctx.getActiveBom(ownerType, ownerId);
  if (!bom?.id) {
    visited.delete(key);
    return [];
  }

  const items = ctx.getBomItems(bom.id);
  const leaves: ExplodedLeafLine[] = [];
  const nextPath = [...path, key];

  for (const item of items) {
    const lineQty = effectiveQty(item.qtyPerUnit, item.wastePercent ?? 0, quantity);
    if (lineQty <= 0) continue;

    if (item.itemType === 'product') {
      const childLeaves = explodeBom(ctx, 'product', item.itemId, lineQty, visited, nextPath);
      leaves.push(...childLeaves);
      continue;
    }

    const material = ctx.getMaterial(item.itemId);
    const matType = material?.type ?? ctx.getMaterialType(item.itemId);
    const trace: MaterialRequirementExplodedFrom = {
      ownerType,
      ownerId,
      path: nextPath,
    };

    if (matType === 'semi_finished' && material?.isManufacturedInternally !== false) {
      const semiLeaves = explodeBom(ctx, 'material', item.itemId, lineQty, visited, nextPath);
      if (semiLeaves.length > 0) {
        leaves.push(...semiLeaves);
        continue;
      }
    }

    leaves.push({
      materialId: item.itemId,
      requiredQty: lineQty,
      explodedFrom: trace,
    });
  }

  visited.delete(key);
  return leaves;
}

export function aggregateExplodedLeaves(lines: ExplodedLeafLine[]): Map<string, ExplodedLeafLine> {
  const map = new Map<string, ExplodedLeafLine>();
  for (const line of lines) {
    const existing = map.get(line.materialId);
    if (existing) {
      existing.requiredQty += line.requiredQty;
    } else {
      map.set(line.materialId, { ...line });
    }
  }
  return map;
}

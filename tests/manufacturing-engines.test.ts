import assert from 'node:assert/strict';
import {
  aggregateExplodedLeaves,
  explodeBom,
  type BomExplosionContext,
} from '../modules/manufacturing/engines/bomExplosionEngine.ts';
import { calculateMaterialLineCost } from '../modules/manufacturing/engines/materialCostEngine.ts';
import {
  generateMaterialRequirements,
  totalEstimatedCost,
} from '../modules/manufacturing/engines/productionPlanningEngine.ts';
import type { Bom, BomItem, Material } from '../modules/manufacturing/types.ts';

function makeMaterial(id: string, overrides: Partial<Material> = {}): Material {
  return {
    id,
    code: id,
    name: id,
    type: 'raw_material',
    baseUnit: 'kg',
    purchaseCost: 80,
    conversionRate: 1,
    wastePercent: 0,
    isActive: true,
    createdAt: '',
    ...overrides,
  };
}

function ctxFromMaps(
  boms: Bom[],
  itemsByBom: Record<string, BomItem[]>,
  materials: Material[],
): BomExplosionContext {
  const bomByOwner = new Map<string, Bom>();
  for (const b of boms) {
    bomByOwner.set(`${b.ownerType}:${b.ownerId}`, b);
  }
  const matById = new Map(materials.map((m) => [m.id!, m]));
  return {
    getActiveBom(ownerType, ownerId) {
      return bomByOwner.get(`${ownerType}:${ownerId}`);
    },
    getBomItems(bomId) {
      return itemsByBom[bomId] ?? [];
    },
    getMaterial(id) {
      return matById.get(id) ?? null;
    },
    getMaterialType(id) {
      return matById.get(id)?.type;
    },
  };
}

// Spec example: 80/kg × 0.25 + direct 3 + indirect 2 + waste 1 = 26
{
  const breakdown = calculateMaterialLineCost({
    material: makeMaterial('resin', { purchaseCost: 80, baseUnit: 'kg' }),
    requiredQty: 0.25,
    bomItem: {
      wastePercent: 5,
      directCostPerUnit: 12,
      indirectCostPerUnit: 8,
    },
  });
  assert.equal(Math.round(breakdown.purchaseComponent), 20);
  assert.equal(Math.round(breakdown.wasteComponent), 1);
  assert.equal(Math.round(breakdown.directComponent), 3);
  assert.equal(Math.round(breakdown.indirectComponent), 2);
  assert.equal(Math.round(breakdown.total), 26);
}

// Effective unit resolver: 10 base + 2 manufacturing = 12
{
  const breakdown = calculateMaterialLineCost({
    material: makeMaterial('inject-part', { purchaseCost: 10, baseUnit: 'piece' }),
    requiredQty: 1,
    resolveEffectiveUnitCost: ({ purchaseCostPerBaseUnit }) => purchaseCostPerBaseUnit + 2,
  });
  assert.equal(Math.round(breakdown.purchaseComponent), 12);
  assert.equal(Math.round(breakdown.total), 12);
}

// Nested semi-finished
{
  const resin = makeMaterial('resin');
  const cover = makeMaterial('cover', { type: 'semi_finished', isManufacturedInternally: true });
  const productBom: Bom = { id: 'b1', ownerType: 'product', ownerId: 'p1', version: 1, status: 'active' };
  const coverBom: Bom = { id: 'b2', ownerType: 'material', ownerId: 'cover', version: 1, status: 'active' };
  const ctx = ctxFromMaps(
    [productBom, coverBom],
    {
      b1: [
        { bomId: 'b1', itemId: 'cover', itemType: 'material', qtyPerUnit: 1, unit: 'piece' },
      ],
      b2: [{ bomId: 'b2', itemId: 'resin', itemType: 'material', qtyPerUnit: 0.25, unit: 'kg' }],
    },
    [resin, cover],
  );
  const leaves = explodeBom(ctx, 'product', 'p1', 1000);
  const agg = aggregateExplodedLeaves(leaves);
  assert.equal(agg.get('resin')?.requiredQty, 250);
}

// Cycle detection
{
  const b1: Bom = { id: 'b1', ownerType: 'product', ownerId: 'p1', version: 1, status: 'active' };
  const ctx = ctxFromMaps(
    [b1],
    {
      b1: [{ bomId: 'b1', itemId: 'p1', itemType: 'product', qtyPerUnit: 1, unit: 'piece' }],
    },
    [],
  );
  assert.throws(() => explodeBom(ctx, 'product', 'p1', 1));
}

// Multi-product planning merge
{
  const m1 = makeMaterial('screw', { baseUnit: 'piece', purchaseCost: 1 });
  const m2 = makeMaterial('cable', { baseUnit: 'meter', purchaseCost: 2 });
  const bA: Bom = { id: 'ba', ownerType: 'product', ownerId: 'pa', version: 1, status: 'active' };
  const bB: Bom = { id: 'bb', ownerType: 'product', ownerId: 'pb', version: 1, status: 'active' };
  const ctx = ctxFromMaps(
    [bA, bB],
    {
      ba: [{ bomId: 'ba', itemId: 'screw', itemType: 'material', qtyPerUnit: 4, unit: 'piece' }],
      bb: [{ bomId: 'bb', itemId: 'cable', itemType: 'material', qtyPerUnit: 0.5, unit: 'meter' }],
    },
    [m1, m2],
  );
  const materialsById = new Map([
    ['screw', m1],
    ['cable', m2],
  ]);
  const lines = generateMaterialRequirements({
    inputs: [
      { ownerType: 'product', ownerId: 'pa', quantity: 1000 },
      { ownerType: 'product', ownerId: 'pb', quantity: 500 },
    ],
    explosionCtx: ctx,
    materialsById,
    stockLookup: () => ({ availableQty: 0, reservedQty: 0 }),
  });
  const screw = lines.find((l) => l.materialId === 'screw');
  const cable = lines.find((l) => l.materialId === 'cable');
  assert.equal(screw?.requiredQty, 4000);
  assert.equal(cable?.requiredQty, 250);
  assert.ok(totalEstimatedCost(lines) > 0);
}

// Resolver fallback in planning path
{
  const mat = makeMaterial('m-1', { baseUnit: 'piece', purchaseCost: 10 });
  const bom: Bom = { id: 'b-main', ownerType: 'product', ownerId: 'p-main', version: 1, status: 'active' };
  const ctx = ctxFromMaps(
    [bom],
    {
      'b-main': [{ bomId: 'b-main', itemId: 'm-1', itemType: 'material', qtyPerUnit: 1, unit: 'piece' }],
    },
    [mat],
  );
  const lines = generateMaterialRequirements({
    inputs: [{ ownerType: 'product', ownerId: 'p-main', quantity: 1 }],
    explosionCtx: ctx,
    materialsById: new Map([['m-1', mat]]),
    stockLookup: () => ({ availableQty: 0, reservedQty: 0 }),
    resolveEffectiveUnitCost: ({ purchaseCostPerBaseUnit }) => purchaseCostPerBaseUnit + 2,
  });
  assert.equal(lines.length, 1);
  assert.equal(Math.round(lines[0].estimatedCost), 12);
}

console.log('manufacturing-engines.test.ts: all assertions passed');

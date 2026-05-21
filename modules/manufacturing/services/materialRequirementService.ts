import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import type { FirestoreProduct } from '../../../types';
import type { ProductCategory } from '../../catalog/services/categoryService';
import {
  MATERIAL_REQUIREMENT_RUNS_COLLECTION,
  PRODUCTION_PLAN_MATERIAL_REQUIREMENTS_COLLECTION,
} from '../collections';
import type {
  Material,
  MaterialCategory,
  MaterialRequirementInput,
  MaterialRequirementLine,
  MaterialRequirementRun,
  ProductionPlanMaterialRequirements,
} from '../types';
import type { ProductionPlan } from '../../../types';
import type { BomExplosionContext } from '../engines/bomExplosionEngine';
import {
  buildExplosionContext,
  preloadOwnersForExplosion,
} from './manufacturingContextService';
import {
  generateMaterialRequirementDetailRows,
  generateMaterialRequirements,
  totalEstimatedCost,
  type StockAvailabilityLookup,
} from '../engines/productionPlanningEngine';
import type { MaterialRequirementDetailExportRow } from '../lib/materialRequirementsExportLib';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

type ExplosionRunResult = {
  lines: MaterialRequirementLine[];
  explosionCtx: BomExplosionContext;
  materialsById: Map<string, Material>;
  stockLookup: StockAvailabilityLookup;
};

async function runMaterialExplosion(
  inputs: MaterialRequirementInput[],
  materialCategories?: MaterialCategory[],
): Promise<ExplosionRunResult> {
  const { ctx, bundle } = await buildExplosionContext();
  await preloadOwnersForExplosion(
    inputs.map((i) => ({ ownerType: 'product', ownerId: i.ownerId })),
    bundle,
  );

  const explosionCtx: BomExplosionContext = {
    ...ctx,
    getActiveBom(ownerType, ownerId) {
      return bundle.bomsByOwner.get(`${ownerType}:${ownerId}`);
    },
    getBomItems(bomId) {
      return bundle.itemsByBomId.get(bomId) ?? [];
    },
  };

  const stockLookup: StockAvailabilityLookup = (materialId, legacyRawMaterialId) => {
    const stock =
      bundle.stockByMaterialId.get(materialId) ??
      (legacyRawMaterialId ? bundle.stockByMaterialId.get(legacyRawMaterialId) : undefined);
    return stock ?? { availableQty: 0, reservedQty: 0 };
  };

  const lines = generateMaterialRequirements({
    inputs,
    explosionCtx,
    materialsById: bundle.materialsById,
    stockLookup,
    materialCategories,
  });

  return { lines, explosionCtx, materialsById: bundle.materialsById, stockLookup };
}

export const materialRequirementService = {
  async generateFromInputs(
    inputs: MaterialRequirementInput[],
    generatedBy: string,
  ): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const { lines } = await runMaterialExplosion(inputs);

    const runPayload: Omit<MaterialRequirementRun, 'id'> = {
      tenantId,
      inputs,
      status: 'completed',
      lines,
      totalEstimatedCost: totalEstimatedCost(lines),
      generatedAt: new Date().toISOString(),
      generatedBy,
    };

    const ref = await addDoc(
      collection(db, MATERIAL_REQUIREMENT_RUNS_COLLECTION),
      stripUndefined(runPayload),
    );
    return ref.id;
  },

  async getDetailLinesForExport(
    inputs: MaterialRequirementInput[],
    products: FirestoreProduct[],
    productCategories: ProductCategory[],
    materialCategories?: MaterialCategory[],
  ): Promise<MaterialRequirementDetailExportRow[]> {
    const { explosionCtx, materialsById, stockLookup } = await runMaterialExplosion(
      inputs,
      materialCategories,
    );
    const productsById = new Map(
      products.filter((p) => p.id).map((p) => [p.id!, p] as const),
    );
    return generateMaterialRequirementDetailRows({
      inputs,
      explosionCtx,
      materialsById,
      stockLookup,
      materialCategories,
      productsById,
      productCategories,
    });
  },

  async listRuns(limitCount = 20): Promise<MaterialRequirementRun[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, MATERIAL_REQUIREMENT_RUNS_COLLECTION),
      where('tenantId', '==', tenantId),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as MaterialRequirementRun))
      .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))
      .slice(0, limitCount);
  },

  async getRunById(id: string): Promise<MaterialRequirementRun | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, MATERIAL_REQUIREMENT_RUNS_COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as MaterialRequirementRun;
  },

  async generateForPlans(
    plans: ProductionPlan[],
    generatedBy: string,
    options?: { useRemainingQty?: boolean },
  ): Promise<Array<{ planId: string; requirementId: string | null }>> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const useRemaining = options?.useRemainingQty !== false;
    const results: Array<{ planId: string; requirementId: string | null }> = [];

    for (const plan of plans) {
      if (!plan.id || !plan.productId) {
        results.push({ planId: plan.id || '', requirementId: null });
        continue;
      }
      const qty = useRemaining
        ? Math.max(0, Number(plan.plannedQuantity || 0) - Number(plan.producedQuantity || 0))
        : Number(plan.plannedQuantity || 0);
      if (qty <= 0) {
        results.push({ planId: plan.id, requirementId: null });
        continue;
      }

      const inputs: MaterialRequirementInput[] = [
        { ownerType: 'product', ownerId: plan.productId, quantity: qty },
      ];

      const { lines } = await runMaterialExplosion(inputs);

      const existing = await materialRequirementService.getByPlanId(plan.id);
      const payload: Omit<ProductionPlanMaterialRequirements, 'id'> = {
        tenantId,
        planId: plan.id,
        lines,
        totalEstimatedCost: totalEstimatedCost(lines),
        generatedAt: new Date().toISOString(),
        generatedBy,
        useRemainingQty: useRemaining,
      };

      if (existing?.id) {
        await updateDoc(
          doc(db, PRODUCTION_PLAN_MATERIAL_REQUIREMENTS_COLLECTION, existing.id),
          stripUndefined(payload),
        );
        results.push({ planId: plan.id, requirementId: existing.id });
      } else {
        const ref = await addDoc(
          collection(db, PRODUCTION_PLAN_MATERIAL_REQUIREMENTS_COLLECTION),
          stripUndefined(payload),
        );
        results.push({ planId: plan.id, requirementId: ref.id });
      }
    }

    return results;
  },

  async getByPlanId(planId: string): Promise<ProductionPlanMaterialRequirements | null> {
    if (!isConfigured || !planId) return null;
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, PRODUCTION_PLAN_MATERIAL_REQUIREMENTS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('planId', '==', planId),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs.sort((a, b) =>
      String(b.data().generatedAt || '').localeCompare(String(a.data().generatedAt || '')),
    )[0];
    return { id: d.id, ...d.data() } as ProductionPlanMaterialRequirements;
  },
};

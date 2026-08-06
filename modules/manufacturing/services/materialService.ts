import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { MATERIALS_COLLECTION } from '../collections';
import type { Material, MaterialUnit } from '../types';
import { materialCategoryService } from './materialCategoryService';
import { formatCategoryBreadcrumb } from '../../catalog/lib/categoryTree';
import { normalizeLegacyUnit } from '../types';
import {
  buildEntityCodeClaimId,
  allocateNextSequentialSuffixInTransaction,
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_CLAIMS_COLLECTION,
  isDuplicateEntityCodeError,
  peekNextSequentialSuffixCode,
  throwDuplicateEntityCode,
} from '../../shared/services/entityCodeSequenceService';
import {
  MATERIAL_CATEGORY_CODE_REQUIRED,
  MATERIAL_CODE_PADDING,
  isValidMaterialCategoryCode,
  materialCategoryCounterKey,
  maxMaterialCategorySequence,
  normalizeMaterialCategoryCode,
} from '../lib/materialCode';
import {
  MANUFACTURING_OPERATION_KEYS,
  assertCurrentTenantOperationPathEnabled,
  type MaterialCreatePath,
  type MaterialUpdatePath,
} from '../../system/lib/operationPathSettings';

const MATERIAL_ENTITY_TYPE = 'material';

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Sale prices must go through updateRepairPartsPricing (audit + permission). */
const stripClientSalePriceFields = <T extends Record<string, unknown>>(obj: T): T => {
  const next = { ...obj };
  delete next.defaultSalePrice;
  delete next.traderSalePrice;
  return next;
};

function normalizeMaterialCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeMaterialProcurementFields<T extends Partial<Material>>(
  payload: T,
  isManufacturedInternally: boolean,
): T {
  if (!isManufacturedInternally) return payload;
  return {
    ...payload,
    purchaseUnit: '',
    conversionRate: 1,
    purchaseCost: 0,
    wastePercent: 0,
  };
}

function materialClaimRef(tenantId: string, code: string) {
  return doc(db, ENTITY_CODE_CLAIMS_COLLECTION, buildEntityCodeClaimId(tenantId, MATERIAL_ENTITY_TYPE, code));
}

async function seedMaxCategoryMaterialCodes(categoryCode: string): Promise<number> {
  const materials = await materialService.getAll();
  return maxMaterialCategorySequence(
    materials.map((material) => material.code),
    categoryCode,
  );
}

export function toBaseQty(
  purchaseQty: number,
  conversionRate?: number,
): number {
  const rate = Number(conversionRate ?? 0);
  if (rate > 0) return purchaseQty * rate;
  return purchaseQty;
}

export { isDuplicateEntityCodeError, DUPLICATE_ENTITY_CODE };

export const materialService = {
  async getAll(): Promise<Material[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, MATERIALS_COLLECTION));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Material))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  },

  async getById(id: string): Promise<Material | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, MATERIALS_COLLECTION, id));
    if (!snap.exists()) return null;
    if (String(snap.data()?.tenantId || '') !== getCurrentTenantId()) return null;
    return { id: snap.id, ...snap.data() } as Material;
  },

  async getByCode(code: string): Promise<Material | null> {
    if (!isConfigured) return null;
    const want = normalizeMaterialCode(code);
    if (!want) return null;
    const rows = await materialService.getAll();
    return rows.find((r) => normalizeMaterialCode(r.code) === want) || null;
  },

  async getByLegacyRawMaterialId(legacyId: string): Promise<Material | null> {
    if (!isConfigured || !legacyId) return null;
    const tenantId = getCurrentTenantId();
    const q = query(
      collection(db, MATERIALS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('legacyRawMaterialId', '==', legacyId),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Material;
  },

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const want = normalizeMaterialCode(code);
    if (!want) return false;
    const tenantId = getCurrentTenantId();
    const claimSnap = await getDoc(materialClaimRef(tenantId, want));
    if (claimSnap.exists()) {
      const ownerId = String(claimSnap.data()?.ownerId || '');
      if (!excludeId || ownerId !== excludeId) return true;
    }
    const rows = await materialService.getAll();
    return rows.some((r) => {
      if (excludeId && r.id === excludeId) return false;
      return normalizeMaterialCode(r.code) === want;
    });
  },

  /**
   * Create material, or return the existing id when the business code is already taken.
   * Prevents duplicate catalog rows during imports / races.
   */
  async createOrGetByCode(
    payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'>,
    context: { path: MaterialCreatePath } | { internal: true },
  ): Promise<{ id: string; created: boolean }> {
    if ('path' in context) {
      await assertCurrentTenantOperationPathEnabled(
        MANUFACTURING_OPERATION_KEYS.materialCreate,
        context.path,
      );
    }
    const code = normalizeMaterialCode(payload.code);
    if (code) {
      const existing = await materialService.getByCode(code);
      if (existing?.id) return { id: existing.id, created: false };
    }
    try {
      const id = await materialService.create(payload, { internal: true });
      if (!id) throw new Error('تعذر إنشاء المادة.');
      return { id, created: true };
    } catch (error) {
      if (code && isDuplicateEntityCodeError(error)) {
        const existing = await materialService.getByCode(code);
        if (existing?.id) return { id: existing.id, created: false };
      }
      throw error;
    }
  },

  async resolveCategoryFields(
    categoryId?: string | null,
  ): Promise<Pick<Material, 'categoryId' | 'categoryName'>> {
    const id = categoryId?.trim() || null;
    if (!id) return { categoryId: null, categoryName: '' };
    const cat = await materialCategoryService.getById(id);
    const flat = await materialCategoryService.getAll();
    const name = cat
      ? formatCategoryBreadcrumb(flat, id) || String(cat.name || '').trim()
      : '';
    return { categoryId: id, categoryName: name };
  },

  async peekNextCode(categoryId: string): Promise<string> {
    const category = await materialCategoryService.getById(categoryId);
    const categoryCode = normalizeMaterialCategoryCode(category?.code);
    if (!category?.id || !isValidMaterialCategoryCode(categoryCode)) return '';
    return peekNextSequentialSuffixCode(
      materialCategoryCounterKey(categoryCode),
      categoryCode,
      MATERIAL_CODE_PADDING,
      () => seedMaxCategoryMaterialCodes(categoryCode),
    );
  },

  async create(
    payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'>,
    context: { path: MaterialCreatePath } | { internal: true },
  ): Promise<string | null> {
    if ('path' in context) {
      await assertCurrentTenantOperationPathEnabled(
        MANUFACTURING_OPERATION_KEYS.materialCreate,
        context.path,
      );
    }
    if (!isConfigured) return null;
    payload = normalizeMaterialProcurementFields(
      payload,
      payload.isManufacturedInternally === true,
    );
    const tenantId = getCurrentTenantId();
    const categoryFields = await materialService.resolveCategoryFields(payload.categoryId);
    const code = normalizeMaterialCode(payload.code);

    if (!code) {
      const categoryId = categoryFields.categoryId;
      const category = categoryId ? await materialCategoryService.getById(categoryId) : null;
      const categoryCode = normalizeMaterialCategoryCode(category?.code);
      if (!category?.id || !isValidMaterialCategoryCode(categoryCode)) {
        throw new Error(MATERIAL_CATEGORY_CODE_REQUIRED);
      }

      const materialRef = doc(collection(db, MATERIALS_COLLECTION));
      // Firestore web transactions cannot query a collection. Seed before the
      // transaction; concurrent first writers still serialize through the
      // counter document read/write inside the transaction.
      const initialMaxSequence = await seedMaxCategoryMaterialCodes(categoryCode);
      await runTransaction(db, async (tx) => {
        const allocatedCode = await allocateNextSequentialSuffixInTransaction(
          tx,
          materialCategoryCounterKey(categoryCode),
          categoryCode,
          MATERIAL_CODE_PADDING,
          async () => initialMaxSequence,
          async (nextCode, transaction) => {
            const claimRef = materialClaimRef(tenantId, nextCode);
            const claim = await transaction.get(claimRef);
            if (claim.exists()) throwDuplicateEntityCode();
            transaction.set(claimRef, {
              tenantId,
              entityType: MATERIAL_ENTITY_TYPE,
              code: nextCode,
              ownerId: materialRef.id,
              ownerCollection: MATERIALS_COLLECTION,
              createdAt: new Date().toISOString(),
            });
          },
        );
        tx.set(
          materialRef,
          stripClientSalePriceFields(stripUndefined({
            ...payload,
            ...categoryFields,
            code: allocatedCode,
            baseUnit: payload.baseUnit || normalizeLegacyUnit(payload.baseUnit as string),
            conversionRate: Number(payload.conversionRate ?? 1) || 1,
            purchaseCost: Number(payload.purchaseCost ?? 0),
            wastePercent: Number(payload.wastePercent ?? 0),
            isActive: payload.isActive !== false,
            linkedCostCenterIds: payload.linkedCostCenterIds ?? [],
            tenantId,
            createdAt: new Date().toISOString(),
          })),
        );
      });
      return materialRef.id;
    }

    if (await materialService.isCodeTaken(code)) {
      throwDuplicateEntityCode();
    }

    const materialRef = doc(collection(db, MATERIALS_COLLECTION));
    const claimRef = materialClaimRef(tenantId, code);

    try {
      await runTransaction(db, async (tx) => {
        const claimSnap = await tx.get(claimRef);
        if (claimSnap.exists()) throwDuplicateEntityCode();

        tx.set(claimRef, {
          tenantId,
          entityType: MATERIAL_ENTITY_TYPE,
          code,
          ownerId: materialRef.id,
          ownerCollection: MATERIALS_COLLECTION,
          createdAt: new Date().toISOString(),
        });
        tx.set(
          materialRef,
          stripClientSalePriceFields(stripUndefined({
            ...payload,
            ...categoryFields,
            code,
            baseUnit: payload.baseUnit || normalizeLegacyUnit(payload.baseUnit as string),
            conversionRate: Number(payload.conversionRate ?? 1) || 1,
            purchaseCost: Number(payload.purchaseCost ?? 0),
            wastePercent: Number(payload.wastePercent ?? 0),
            isActive: payload.isActive !== false,
            linkedCostCenterIds: payload.linkedCostCenterIds ?? [],
            tenantId,
            createdAt: new Date().toISOString(),
          })),
        );
      });
    } catch (error) {
      if (isDuplicateEntityCodeError(error)) throw error;
      // Concurrent create: claim won by another writer
      if (String((error as Error)?.message || '').includes('ABORTED') || (error as { code?: string })?.code === 'failed-precondition') {
        throwDuplicateEntityCode();
      }
      throw error;
    }

    return materialRef.id;
  },

  async update(
    id: string,
    payload: Partial<Material>,
    context: { path: MaterialUpdatePath } | { internal: true },
  ): Promise<void> {
    if ('path' in context) {
      await assertCurrentTenantOperationPathEnabled(
        MANUFACTURING_OPERATION_KEYS.materialUpdate,
        context.path,
      );
    }
    if (!isConfigured || !id) return;
    let extra: Partial<Material> = {};
    if (payload.categoryId !== undefined) {
      extra = await materialService.resolveCategoryFields(payload.categoryId);
    }

    const current = await materialService.getById(id);
    if (!current) throw new Error('المادة غير موجودة.');
    payload = normalizeMaterialProcurementFields(
      payload,
      payload.isManufacturedInternally ?? current.isManufacturedInternally ?? false,
    );

    const nextCode =
      payload.code !== undefined ? normalizeMaterialCode(payload.code) : normalizeMaterialCode(current.code);
    const prevCode = normalizeMaterialCode(current.code);
    const tenantId = getCurrentTenantId();

    if (payload.code !== undefined) {
      payload.code = nextCode as Material['code'];
      if (nextCode && nextCode !== prevCode && (await materialService.isCodeTaken(nextCode, id))) {
        throwDuplicateEntityCode();
      }
    }

    const { id: _id, tenantId: _t, createdAt: _c, ...rest } = { ...payload, ...extra };
    const materialRef = doc(db, MATERIALS_COLLECTION, id);
    const sanitizedRest = stripClientSalePriceFields(rest as Record<string, unknown>);

    if (payload.code === undefined || nextCode === prevCode) {
      await updateDoc(materialRef, stripUndefined(sanitizedRest));
      // Backfill claim for existing rows that predate the lock collection.
      if (nextCode) {
        const claimRef = materialClaimRef(tenantId, nextCode);
        const claimSnap = await getDoc(claimRef);
        if (!claimSnap.exists()) {
          await runTransaction(db, async (tx) => {
            const fresh = await tx.get(claimRef);
            if (fresh.exists()) {
              const ownerId = String(fresh.data()?.ownerId || '');
              if (ownerId && ownerId !== id) throwDuplicateEntityCode();
              return;
            }
            tx.set(claimRef, {
              tenantId,
              entityType: MATERIAL_ENTITY_TYPE,
              code: nextCode,
              ownerId: id,
              ownerCollection: MATERIALS_COLLECTION,
              createdAt: new Date().toISOString(),
            });
          });
        }
      }
      return;
    }

    await runTransaction(db, async (tx) => {
      const newClaimRef = nextCode ? materialClaimRef(tenantId, nextCode) : null;
      const oldClaimRef = prevCode ? materialClaimRef(tenantId, prevCode) : null;

      if (newClaimRef) {
        const newClaim = await tx.get(newClaimRef);
        if (newClaim.exists()) {
          const ownerId = String(newClaim.data()?.ownerId || '');
          if (ownerId !== id) throwDuplicateEntityCode();
        } else {
          tx.set(newClaimRef, {
            tenantId,
            entityType: MATERIAL_ENTITY_TYPE,
            code: nextCode,
            ownerId: id,
            ownerCollection: MATERIALS_COLLECTION,
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (oldClaimRef && prevCode && prevCode !== nextCode) {
        const oldClaim = await tx.get(oldClaimRef);
        if (oldClaim.exists()) {
          const ownerId = String(oldClaim.data()?.ownerId || '');
          if (!ownerId || ownerId === id) tx.delete(oldClaimRef);
        }
      }

      tx.update(materialRef, stripUndefined(sanitizedRest));
    });
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    const linkedReports = await getDocs(
      tenantQuery(db, 'production_reports', where('productId', '==', id), limit(1)),
    );
    if (!linkedReports.empty) {
      throw new Error('المادة مرتبطة بتقارير حقن ولا يمكن حذفها. احتفظ بها أو ادمجها مع المادة الصحيحة.');
    }
    const current = await materialService.getById(id);
    const code = normalizeMaterialCode(current?.code);
    const tenantId = getCurrentTenantId();

    if (!code) {
      await deleteDoc(doc(db, MATERIALS_COLLECTION, id));
      return;
    }

    const materialRef = doc(db, MATERIALS_COLLECTION, id);
    const claimRef = materialClaimRef(tenantId, code);
    await runTransaction(db, async (tx) => {
      const claimSnap = await tx.get(claimRef);
      if (claimSnap.exists()) {
        const ownerId = String(claimSnap.data()?.ownerId || '');
        if (!ownerId || ownerId === id) tx.delete(claimRef);
      }
      tx.delete(materialRef);
    });
  },

  toBaseUnitLabel(unit: MaterialUnit): string {
    const labels: Record<MaterialUnit, string> = {
      piece: 'قطعة',
      kg: 'كجم',
      gram: 'جرام',
      meter: 'متر',
      liter: 'لتر',
    };
    return labels[unit] ?? unit;
  },
};

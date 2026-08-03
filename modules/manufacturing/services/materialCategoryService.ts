import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import {
  buildCategoryPath,
  buildCategoryTree,
  getDescendantIds,
  wouldCreateCycle,
  type CategoryTreeNode,
} from '../../catalog/lib/categoryTree';
import { MATERIAL_CATEGORIES_COLLECTION } from '../collections';
import {
  buildEntityCodeClaimId,
  ENTITY_CODE_CLAIMS_COLLECTION,
  throwDuplicateEntityCode,
} from '../../shared/services/entityCodeSequenceService';
import {
  INVALID_MATERIAL_CATEGORY_CODE,
  isValidMaterialCategoryCode,
  normalizeMaterialCategoryCode,
} from '../lib/materialCode';

export interface MaterialCategory {
  id?: string;
  code?: string;
  name: string;
  parentId?: string | null;
  path?: string[];
  level?: number;
  sortOrder?: number;
  isActive: boolean;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

const MATERIAL_CATEGORY_ENTITY_TYPE = 'material_category';

function categoryClaimRef(tenantId: string, code: string) {
  return doc(
    db,
    ENTITY_CODE_CLAIMS_COLLECTION,
    buildEntityCodeClaimId(tenantId, MATERIAL_CATEGORY_ENTITY_TYPE, code),
  );
}

function withDefaults(row: Partial<MaterialCategory>): MaterialCategory {
  return {
    ...row,
    code: normalizeMaterialCategoryCode(row.code),
    parentId: row.parentId ?? null,
    path: row.path ?? [],
    level: row.level ?? 0,
    isActive: row.isActive !== false,
    name: String(row.name || ''),
  } as MaterialCategory;
}

function computeHierarchy(
  flat: MaterialCategory[],
  parentId: string | null | undefined,
): Pick<MaterialCategory, 'parentId' | 'path' | 'level'> {
  const normalizedParent = parentId ?? null;
  if (!normalizedParent) return { parentId: null, path: [], level: 0 };
  const { path: parentAncestors } = buildCategoryPath(flat, normalizedParent);
  const path = [...parentAncestors, normalizedParent];
  return { parentId: normalizedParent, path, level: path.length };
}

export const materialCategoryService = {
  async getAll(): Promise<MaterialCategory[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(collection(db, MATERIAL_CATEGORIES_COLLECTION), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => withDefaults({ id: d.id, ...d.data() } as MaterialCategory))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  },

  async getById(id: string): Promise<MaterialCategory | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, MATERIAL_CATEGORIES_COLLECTION, id));
    if (!snap.exists()) return null;
    if (String(snap.data()?.tenantId || '') !== getCurrentTenantId()) return null;
    return withDefaults({ id: snap.id, ...snap.data() } as MaterialCategory);
  },

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const normalizedCode = normalizeMaterialCategoryCode(code);
    if (!normalizedCode) return false;
    const tenantId = getCurrentTenantId();
    const claim = await getDoc(categoryClaimRef(tenantId, normalizedCode));
    if (claim.exists()) {
      const ownerId = String(claim.data()?.ownerId || '');
      if (!excludeId || ownerId !== excludeId) return true;
    }
    const categories = await materialCategoryService.getAll();
    return categories.some(
      (category) =>
        category.id !== excludeId &&
        normalizeMaterialCategoryCode(category.code) === normalizedCode,
    );
  },

  async getCategoryTree(activeOnly = true): Promise<CategoryTreeNode<MaterialCategory>[]> {
    let rows = await materialCategoryService.getAll();
    if (activeOnly) rows = rows.filter((r) => r.isActive);
    return buildCategoryTree(rows);
  },

  async getBulkCategoryUsageCounts(
    categories?: MaterialCategory[],
  ): Promise<Record<string, { materialCount: number; childrenCount: number }>> {
    const { materialService } = await import('./materialService');
    const [materials, rows] = await Promise.all([
      materialService.getAll(),
      categories ? Promise.resolve(categories) : materialCategoryService.getAll(),
    ]);
    const usage: Record<string, { materialCount: number; childrenCount: number }> = {};
    for (const cat of rows) {
      if (!cat.id) continue;
      usage[cat.id] = {
        materialCount: materials.filter((m) => m.categoryId === cat.id).length,
        childrenCount: rows.filter((c) => c.parentId === cat.id).length,
      };
    }
    return usage;
  },

  async getCategoryUsageCounts(categoryId: string): Promise<{ materialCount: number; childrenCount: number }> {
    const bulk = await materialCategoryService.getBulkCategoryUsageCounts();
    return bulk[categoryId] ?? { materialCount: 0, childrenCount: 0 };
  },

  async createCategory(
    payload: Omit<MaterialCategory, 'id' | 'createdAt' | 'updatedAt' | 'path' | 'level'>,
  ): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const flat = await materialCategoryService.getAll();
    const hierarchy = computeHierarchy(flat, payload.parentId ?? null);
    const code = normalizeMaterialCategoryCode(payload.code);
    const now = new Date().toISOString();

    // Legacy category migration may create uncoded rows. Operator-created categories
    // must provide a valid code in the page before they can generate material codes.
    if (!code) {
      const ref = await addDoc(collection(db, MATERIAL_CATEGORIES_COLLECTION), {
        ...payload,
        code: '',
        ...hierarchy,
        tenantId,
        createdAt: now,
        updatedAt: now,
      });
      return ref.id;
    }
    if (!isValidMaterialCategoryCode(code)) throw new Error(INVALID_MATERIAL_CATEGORY_CODE);
    if (await materialCategoryService.isCodeTaken(code)) throwDuplicateEntityCode();

    const categoryRef = doc(collection(db, MATERIAL_CATEGORIES_COLLECTION));
    const claimRef = categoryClaimRef(tenantId, code);
    await runTransaction(db, async (tx) => {
      const claim = await tx.get(claimRef);
      if (claim.exists()) throwDuplicateEntityCode();
      tx.set(claimRef, {
        tenantId,
        entityType: MATERIAL_CATEGORY_ENTITY_TYPE,
        code,
        ownerId: categoryRef.id,
        ownerCollection: MATERIAL_CATEGORIES_COLLECTION,
        createdAt: now,
      });
      tx.set(categoryRef, {
        ...payload,
        code,
        ...hierarchy,
        tenantId,
        createdAt: now,
        updatedAt: now,
      });
    });
    return categoryRef.id;
  },

  async updateCategory(id: string, payload: Partial<MaterialCategory>): Promise<void> {
    if (!isConfigured || !id) return;
    const current = await materialCategoryService.getById(id);
    if (!current) throw new Error('CATEGORY_NOT_FOUND');
    const nextPayload = { ...payload };

    if (nextPayload.parentId !== undefined) {
      const flat = await materialCategoryService.getAll();
      if (wouldCreateCycle(flat, id, nextPayload.parentId)) {
        throw new Error('CATEGORY_PARENT_CYCLE');
      }
      const hierarchy = computeHierarchy(
        flat.filter((c) => c.id !== id),
        nextPayload.parentId,
      );
      nextPayload.path = hierarchy.path;
      nextPayload.level = hierarchy.level;
      nextPayload.parentId = hierarchy.parentId;
    }

    const previousCode = normalizeMaterialCategoryCode(current.code);
    const nextCode =
      nextPayload.code === undefined
        ? previousCode
        : normalizeMaterialCategoryCode(nextPayload.code);
    if (nextPayload.code !== undefined) {
      if (!isValidMaterialCategoryCode(nextCode)) throw new Error(INVALID_MATERIAL_CATEGORY_CODE);
      nextPayload.code = nextCode;
      if (nextCode !== previousCode && (await materialCategoryService.isCodeTaken(nextCode, id))) {
        throwDuplicateEntityCode();
      }
    }

    const {
      id: _id,
      tenantId: _tenantId,
      createdAt: _createdAt,
      ...safePayload
    } = nextPayload;
    const categoryRef = doc(db, MATERIAL_CATEGORIES_COLLECTION, id);
    const updateData = {
      ...safePayload,
      updatedAt: new Date().toISOString(),
    };
    if (nextCode === previousCode) {
      await updateDoc(categoryRef, updateData);
      return;
    }

    const tenantId = getCurrentTenantId();
    const newClaimRef = categoryClaimRef(tenantId, nextCode);
    const oldClaimRef = previousCode ? categoryClaimRef(tenantId, previousCode) : null;
    await runTransaction(db, async (tx) => {
      const newClaim = await tx.get(newClaimRef);
      if (newClaim.exists() && String(newClaim.data()?.ownerId || '') !== id) {
        throwDuplicateEntityCode();
      }
      const oldClaim = oldClaimRef ? await tx.get(oldClaimRef) : null;
      tx.set(newClaimRef, {
        tenantId,
        entityType: MATERIAL_CATEGORY_ENTITY_TYPE,
        code: nextCode,
        ownerId: id,
        ownerCollection: MATERIAL_CATEGORIES_COLLECTION,
        createdAt: new Date().toISOString(),
      });
      if (oldClaimRef && oldClaim?.exists()) {
        const ownerId = String(oldClaim.data()?.ownerId || '');
        if (!ownerId || ownerId === id) tx.delete(oldClaimRef);
      }
      tx.update(categoryRef, updateData);
    });
  },

  async deactivateCategory(id: string): Promise<void> {
    await materialCategoryService.updateCategory(id, { isActive: false });
  },

  async deleteCategory(id: string): Promise<void> {
    const usage = await materialCategoryService.getCategoryUsageCounts(id);
    if (usage.childrenCount > 0) throw new Error('CATEGORY_HAS_CHILDREN');
    if (usage.materialCount > 0) throw new Error('CATEGORY_HAS_MATERIALS');
    const current = await materialCategoryService.getById(id);
    if (!current) return;
    const categoryRef = doc(db, MATERIAL_CATEGORIES_COLLECTION, id);
    const code = normalizeMaterialCategoryCode(current.code);
    if (!code) {
      await runTransaction(db, async (tx) => tx.delete(categoryRef));
      return;
    }
    const claimRef = categoryClaimRef(getCurrentTenantId(), code);
    await runTransaction(db, async (tx) => {
      const claim = await tx.get(claimRef);
      if (claim.exists()) {
        const ownerId = String(claim.data()?.ownerId || '');
        if (!ownerId || ownerId === id) tx.delete(claimRef);
      }
      tx.delete(categoryRef);
    });
  },

  async moveCategory(id: string, parentId: string | null): Promise<void> {
    await materialCategoryService.updateCategory(id, { parentId });
  },
};

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { productService } from '../../production/services/productService';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { getMergedPlanSettings } from '../../shared/services/entityCodePlanSettings';
import {
  DUPLICATE_ENTITY_CODE,
  ENTITY_CODE_COUNTER_KEYS,
  allocateNextCodeInTransaction,
  normalizeEntityCodePrefix,
  peekNextCode as peekNextEntityCode,
  seedMaxCategoryCodes,
  seedMaxCategoryCodesInTransaction,
  clampPadding,
} from '../../shared/services/entityCodeSequenceService';
import {
  buildCategoryPath,
  buildCategoryTree,
  getDescendantIds,
  normalizeCategoryName,
  wouldCreateCycle,
  type CategoryTreeNode,
} from '../lib/categoryTree';

export { normalizeCategoryName };

export type CategoryType = 'product' | 'raw_material';

export interface ProductCategory {
  id?: string;
  name: string;
  code?: string;
  type?: CategoryType;
  parentId?: string | null;
  path?: string[];
  level?: number;
  sortOrder?: number;
  isActive: boolean;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryUsageCounts {
  productCount: number;
  childrenCount: number;
}

const COLLECTION = 'product_categories';

export const getEffectiveCategoryType = (category?: Partial<ProductCategory>): CategoryType =>
  category?.type === 'raw_material' ? 'raw_material' : 'product';

export const isProductCategoryRow = (category?: Partial<ProductCategory>): boolean =>
  getEffectiveCategoryType(category) !== 'raw_material';

function withHierarchyDefaults(row: Partial<ProductCategory>): ProductCategory {
  const parentId = row.parentId ?? null;
  const level = row.level ?? 0;
  const path = row.path ?? [];
  return {
    ...row,
    parentId,
    level,
    path,
    isActive: row.isActive !== false,
    name: String(row.name || ''),
  } as ProductCategory;
}

async function getProductCategoriesOnly(): Promise<ProductCategory[]> {
  const all = await categoryService.getAll();
  return all.filter(isProductCategoryRow).map((c) => withHierarchyDefaults(c));
}

function computeHierarchyFields(
  flat: ProductCategory[],
  parentId: string | null | undefined,
): Pick<ProductCategory, 'parentId' | 'path' | 'level'> {
  const normalizedParent = parentId ?? null;
  if (!normalizedParent) {
    return { parentId: null, path: [], level: 0 };
  }
  const { path: parentAncestors } = buildCategoryPath(flat, normalizedParent);
  const path = [...parentAncestors, normalizedParent];
  return { parentId: normalizedParent, path, level: path.length };
}

async function recomputeDescendantHierarchy(
  flat: ProductCategory[],
  rootId: string,
): Promise<Array<{ id: string; path: string[]; level: number }>> {
  const updates: Array<{ id: string; path: string[]; level: number }> = [];
  const byParent = new Map<string | null, ProductCategory[]>();
  for (const row of flat) {
    if (!row.id) continue;
    const key = row.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }

  const walk = (parentId: string, parentPath: string[], parentLevel: number) => {
    for (const child of byParent.get(parentId) ?? []) {
      if (!child.id) continue;
      const path = [...parentPath, parentId];
      const level = parentLevel + 1;
      updates.push({ id: child.id, path, level });
      walk(child.id, path, level);
    }
  };

  walk(rootId, buildCategoryPath(flat, rootId).path, buildCategoryPath(flat, rootId).level);
  return updates;
}

export const categoryService = {
  async getAll(): Promise<ProductCategory[]> {
    if (!isConfigured) return [];
    const tenantId = getCurrentTenantId();
    const q = query(collection(db, COLLECTION), where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => withHierarchyDefaults({ id: d.id, ...d.data() } as ProductCategory))
      .sort((a, b) => {
        const la = a.level ?? 0;
        const lb = b.level ?? 0;
        if (la !== lb) return la - lb;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
      });
  },

  async getById(id: string): Promise<ProductCategory | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return withHierarchyDefaults({ id: snap.id, ...snap.data() } as ProductCategory);
  },

  async isCodeTaken(code: string, type: CategoryType, excludeId?: string): Promise<boolean> {
    if (!isConfigured) return false;
    const want = String(code || '').trim().toUpperCase();
    if (!want) return false;
    const rows = await categoryService.getAll();
    return rows.some((r) => {
      if (excludeId && r.id === excludeId) return false;
      if (getEffectiveCategoryType(r) !== type) return false;
      return String(r.code ?? '')
        .trim()
        .toUpperCase() === want;
    });
  },

  async peekNextCode(type: CategoryType = 'product'): Promise<string> {
    const plan = await getMergedPlanSettings();
    const prefix = normalizeEntityCodePrefix(plan.categoryCodePrefix ?? 'CAT', 'CAT');
    const padding = clampPadding(Number(plan.categoryCodePadding ?? 4), 4);
    const entityKey =
      type === 'raw_material'
        ? ENTITY_CODE_COUNTER_KEYS.categoryRawMaterial
        : ENTITY_CODE_COUNTER_KEYS.categoryProduct;
    const seedType = type === 'raw_material' ? ('raw_material' as const) : ('product' as const);
    return peekNextEntityCode(entityKey, prefix, padding, () => seedMaxCategoryCodes(prefix, seedType));
  },

  async getCategoryTree(activeOnly = true): Promise<CategoryTreeNode<ProductCategory>[]> {
    let rows = await getProductCategoriesOnly();
    if (activeOnly) rows = rows.filter((r) => r.isActive);
    return buildCategoryTree(rows);
  },

  async getRootCategories(activeOnly = true): Promise<ProductCategory[]> {
    let rows = await getProductCategoriesOnly();
    if (activeOnly) rows = rows.filter((r) => r.isActive);
    return rows.filter((r) => !r.parentId);
  },

  async getChildren(parentId: string, activeOnly = true): Promise<ProductCategory[]> {
    let rows = await getProductCategoriesOnly();
    if (activeOnly) rows = rows.filter((r) => r.isActive);
    return rows.filter((r) => r.parentId === parentId);
  },

  buildCategoryPath(categoryId: string | null | undefined, flat?: ProductCategory[]) {
    const rows = flat ?? [];
    return buildCategoryPath(rows, categoryId);
  },

  async getBulkCategoryUsageCounts(
    categories?: ProductCategory[],
  ): Promise<Record<string, CategoryUsageCounts>> {
    const productCategories = categories ?? (await getProductCategoriesOnly());
    const products = await productService.getAll();
    const usage: Record<string, CategoryUsageCounts> = {};
    for (const cat of productCategories) {
      if (!cat.id) continue;
      usage[cat.id] = {
        productCount: products.filter((p) => p.categoryId === cat.id).length,
        childrenCount: productCategories.filter((c) => c.parentId === cat.id).length,
      };
    }
    return usage;
  },

  async getCategoryUsageCounts(categoryId: string): Promise<CategoryUsageCounts> {
    const bulk = await categoryService.getBulkCategoryUsageCounts();
    return bulk[categoryId] ?? { productCount: 0, childrenCount: 0 };
  },

  async createCategory(
    payload: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt' | 'path' | 'level'> & {
      parentId?: string | null;
    },
  ): Promise<string | null> {
    return categoryService.create({
      ...payload,
      type: 'product',
    });
  },

  async create(
    payload: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt' | 'path' | 'level'>,
  ): Promise<string | null> {
    if (!isConfigured) return null;
    const tenantId = getCurrentTenantId();
    const effType = payload.type === 'raw_material' ? 'raw_material' : 'product';
    const entityKey =
      effType === 'raw_material'
        ? ENTITY_CODE_COUNTER_KEYS.categoryRawMaterial
        : ENTITY_CODE_COUNTER_KEYS.categoryProduct;
    const plan = await getMergedPlanSettings();
    const prefix = normalizeEntityCodePrefix(plan.categoryCodePrefix ?? 'CAT', 'CAT');
    const padding = clampPadding(Number(plan.categoryCodePadding ?? 4), 4);
    const trimmed = String(payload.code ?? '').trim();

    const flat = await categoryService.getAll();
    const hierarchy = computeHierarchyFields(flat, payload.parentId ?? null);

    const baseDoc = {
      ...payload,
      ...hierarchy,
      type: effType,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (trimmed) {
      const upper = trimmed.toUpperCase();
      if (await categoryService.isCodeTaken(upper, effType)) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      const ref = await addDoc(collection(db, COLLECTION), { ...baseDoc, code: upper });
      return ref.id;
    }

    const seedType = effType === 'raw_material' ? ('raw_material' as const) : ('product' as const);
    const id = await runTransaction(db, async (transaction) => {
      const code = await allocateNextCodeInTransaction(
        transaction,
        entityKey,
        prefix,
        padding,
        (tx) => seedMaxCategoryCodesInTransaction(tx, prefix, seedType),
      );
      const newRef = doc(collection(db, COLLECTION));
      transaction.set(newRef, { ...baseDoc, code });
      return newRef.id;
    });
    return id;
  },

  async updateCategory(id: string, payload: Partial<ProductCategory>): Promise<void> {
    return categoryService.update(id, payload);
  },

  async update(id: string, payload: Partial<ProductCategory>): Promise<void> {
    if (!isConfigured || !id) return;
    const snap = await getDoc(doc(db, COLLECTION, id));
    const row = snap.exists() ? ({ id: snap.id, ...snap.data() } as ProductCategory) : null;
    const effType =
      payload.type !== undefined
        ? getEffectiveCategoryType(payload)
        : getEffectiveCategoryType(row ?? { type: 'product' });

    if (payload.parentId !== undefined) {
      const flat = await categoryService.getAll();
      if (wouldCreateCycle(flat, id, payload.parentId)) {
        throw new Error('CATEGORY_PARENT_CYCLE');
      }
      const hierarchy = computeHierarchyFields(flat.filter((c) => c.id !== id), payload.parentId);
      payload.path = hierarchy.path;
      payload.level = hierarchy.level;
      payload.parentId = hierarchy.parentId;
    }

    if (payload.code !== undefined) {
      const upper = String(payload.code ?? '').trim().toUpperCase();
      if (upper && (await categoryService.isCodeTaken(upper, effType, id))) {
        const err = new Error(DUPLICATE_ENTITY_CODE);
        (err as Error & { code?: string }).code = DUPLICATE_ENTITY_CODE;
        throw err;
      }
      if (upper) (payload as Partial<ProductCategory>).code = upper;
    }

    const { id: _id, ...data } = payload as ProductCategory;
    await updateDoc(doc(db, COLLECTION, id), {
      ...data,
      updatedAt: new Date().toISOString(),
    } as Record<string, unknown>);

    if (payload.parentId !== undefined) {
      const flat = await categoryService.getAll();
      const descendantUpdates = await recomputeDescendantHierarchy(flat, id);
      if (descendantUpdates.length > 0) {
        const batch = writeBatch(db);
        const now = new Date().toISOString();
        for (const u of descendantUpdates) {
          batch.update(doc(db, COLLECTION, u.id), {
            path: u.path,
            level: u.level,
            updatedAt: now,
          });
        }
        await batch.commit();
      }
    }
  },

  async moveCategory(id: string, parentId: string | null): Promise<void> {
    await categoryService.update(id, { parentId });
  },

  async deactivateCategory(id: string): Promise<void> {
    await categoryService.update(id, { isActive: false });
  },

  async deleteCategory(id: string): Promise<void> {
    const usage = await categoryService.getCategoryUsageCounts(id);
    if (usage.childrenCount > 0) {
      throw new Error('CATEGORY_HAS_CHILDREN');
    }
    if (usage.productCount > 0) {
      throw new Error('CATEGORY_HAS_PRODUCTS');
    }
    await categoryService.delete(id);
  },

  async getByType(type: CategoryType): Promise<ProductCategory[]> {
    const rows = await this.getAll();
    return rows.filter((row) => getEffectiveCategoryType(row) === type);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async ensureHierarchyOnFlatCategories(): Promise<number> {
    if (!isConfigured) return 0;
    const rows = await categoryService.getAll();
    let updated = 0;
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    for (const row of rows) {
      if (!row.id) continue;
      if (row.path !== undefined && row.level !== undefined && row.parentId !== undefined) continue;
      const hierarchy = computeHierarchyFields(rows, row.parentId ?? null);
      batch.update(doc(db, COLLECTION, row.id), {
        parentId: hierarchy.parentId,
        path: hierarchy.path,
        level: hierarchy.level,
        updatedAt: now,
      });
      updated += 1;
    }
    if (updated > 0) await batch.commit();
    return updated;
  },

  async seedFromProductsModel(): Promise<{ created: number; skipped: number }> {
    if (!isConfigured) return { created: 0, skipped: 0 };
    const [categories, products] = await Promise.all([
      this.getByType('product'),
      productService.getAll(),
    ]);
    const byNormalized = new Map<string, ProductCategory>();
    categories.forEach((category) => {
      const normalized = normalizeCategoryName(String(category.name || ''));
      if (normalized) byNormalized.set(normalized, category);
    });

    let created = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const product of products) {
      const name = String(product.model || product.category || '').trim();
      const normalized = normalizeCategoryName(name);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      if (byNormalized.has(normalized)) {
        skipped += 1;
        continue;
      }
      const catId = await this.create({
        name,
        type: 'product',
        isActive: true,
        parentId: null,
      });
      if (catId) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
    return { created, skipped };
  },
};

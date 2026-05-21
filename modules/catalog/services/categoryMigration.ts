import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { productService } from '../../production/services/productService';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { DEFAULT_PLAN_SETTINGS } from '../../../utils/dashboardConfig';
import { normalizeCategoryName } from '../lib/categoryTree';
import {
  categoryService,
  getEffectiveCategoryType,
  type ProductCategory,
} from './categoryService';
import { materialService } from '../../manufacturing/services/materialService';
import { materialCategoryService, type MaterialCategory } from '../../manufacturing/services/materialCategoryService';
import { MATERIALS_COLLECTION } from '../../manufacturing/collections';

export type ProductCategoryMigrationResult = {
  categoriesHierarchyUpdated: number;
  productsUpdated: number;
  productsSkipped: number;
};

export type MaterialCategoryMigrationResult = {
  categoriesCreated: number;
  materialsUpdated: number;
  materialsSkipped: number;
};

/**
 * Idempotent migration: flat categories → hierarchy fields; products.model → categoryId.
 */
export async function migrateProductCategoriesV1(): Promise<ProductCategoryMigrationResult> {
  if (!isConfigured) {
    return { categoriesHierarchyUpdated: 0, productsUpdated: 0, productsSkipped: 0 };
  }

  const categoriesHierarchyUpdated = await categoryService.ensureHierarchyOnFlatCategories();

  const [allCategories, products] = await Promise.all([
    categoryService.getAll(),
    productService.getAll(),
  ]);

  const productCategories = allCategories.filter(
    (c) => getEffectiveCategoryType(c) === 'product' && c.isActive !== false,
  );

  const byNormalizedName = new Map<string, ProductCategory>();
  for (const cat of productCategories) {
    const key = normalizeCategoryName(String(cat.name || ''));
    if (key && !byNormalizedName.has(key)) {
      byNormalizedName.set(key, cat);
    }
  }

  let productsUpdated = 0;
  let productsSkipped = 0;
  let batch = writeBatch(db);
  let batchCount = 0;
  const now = new Date().toISOString();

  const flush = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    batchCount = 0;
  };

  for (const product of products) {
    if (!product.id) continue;
    if (product.categoryId?.trim()) {
      productsSkipped += 1;
      continue;
    }

    const legacyName = String(product.model || product.category || '').trim();
    if (!legacyName) {
      productsSkipped += 1;
      continue;
    }

    const match = byNormalizedName.get(normalizeCategoryName(legacyName));
    if (!match?.id) {
      productsSkipped += 1;
      continue;
    }

    const leafName = String(match.name || legacyName).trim();
    batch.update(doc(db, 'products', product.id), {
      categoryId: match.id,
      categoryName: leafName,
      model: leafName,
    });
    batchCount += 1;
    productsUpdated += 1;

    if (batchCount >= 400) {
      await flush();
    }
  }

  await flush();

  const current = await systemSettingsService.get();
  if (current) {
    await systemSettingsService.set({
      ...current,
      planSettings: {
        ...DEFAULT_PLAN_SETTINGS,
        ...(current.planSettings ?? {}),
        categoryMigrationV1At: new Date().toISOString(),
      },
    });
  }

  return { categoriesHierarchyUpdated, productsUpdated, productsSkipped };
}

/**
 * Map legacy Material.categoryName strings to material_categories + materials.categoryId.
 */
export async function migrateMaterialCategoriesV1(): Promise<MaterialCategoryMigrationResult> {
  if (!isConfigured) {
    return { categoriesCreated: 0, materialsUpdated: 0, materialsSkipped: 0 };
  }

  const materials = await materialService.getAll();
  const existingCategories = await materialCategoryService.getAll();
  const byNormalizedName = new Map<string, MaterialCategory>();
  for (const cat of existingCategories) {
    const key = normalizeCategoryName(String(cat.name || ''));
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, cat);
  }

  let categoriesCreated = 0;
  const seenNames = new Set<string>();

  for (const mat of materials) {
    const legacyName = String(mat.categoryName || '').trim();
    if (!legacyName) continue;
    const key = normalizeCategoryName(legacyName);
    if (!key || seenNames.has(key) || byNormalizedName.has(key)) continue;
    seenNames.add(key);
    const id = await materialCategoryService.createCategory({
      name: legacyName,
      parentId: null,
      isActive: true,
    });
    if (id) {
      categoriesCreated += 1;
      byNormalizedName.set(key, { id, name: legacyName, isActive: true });
    }
  }

  let materialsUpdated = 0;
  let materialsSkipped = 0;
  let batch = writeBatch(db);
  let batchCount = 0;

  const flush = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    batchCount = 0;
  };

  for (const mat of materials) {
    if (!mat.id) continue;
    if (mat.categoryId?.trim()) {
      materialsSkipped += 1;
      continue;
    }
    const legacyName = String(mat.categoryName || '').trim();
    if (!legacyName) {
      materialsSkipped += 1;
      continue;
    }
    const match = byNormalizedName.get(normalizeCategoryName(legacyName));
    if (!match?.id) {
      materialsSkipped += 1;
      continue;
    }
    const label = String(match.name || legacyName).trim();
    batch.update(doc(db, MATERIALS_COLLECTION, mat.id), {
      categoryId: match.id,
      categoryName: label,
    });
    batchCount += 1;
    materialsUpdated += 1;
    if (batchCount >= 400) await flush();
  }

  await flush();
  return { categoriesCreated, materialsUpdated, materialsSkipped };
}

/** @deprecated Use migrateProductCategoriesV1 */
export const runCategoryBackfillMigration = async () => {
  return categoryService.seedFromProductsModel();
};

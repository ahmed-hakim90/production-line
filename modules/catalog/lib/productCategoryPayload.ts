import type { FirestoreProduct } from '../../../types';
import type { ProductCategory } from '../services/categoryService';
import { resolveProductCategoryLeafName } from './resolveProductCategory';

export function buildProductCategorySaveFields(
  categoryId: string | null | undefined,
  categories: ProductCategory[],
): Pick<FirestoreProduct, 'categoryId' | 'categoryName' | 'model'> {
  const id = categoryId?.trim() || null;
  if (!id) {
    return { categoryId: null, categoryName: '', model: '' };
  }
  const cat = categories.find((c) => c.id === id);
  const leafName = cat ? String(cat.name).trim() : '';
  return {
    categoryId: id,
    categoryName: leafName,
    model: leafName,
  };
}

export async function validateProductCategorySelection(
  categoryId: string | null | undefined,
  categories: ProductCategory[],
): Promise<void> {
  const id = categoryId?.trim();
  if (!id) throw new Error('PRODUCT_CATEGORY_REQUIRED');
  const cat = categories.find((c) => c.id === id);
  if (!cat || !cat.isActive) throw new Error('PRODUCT_CATEGORY_INVALID');
}

export function legacyModelFromProduct(
  product: Pick<FirestoreProduct, 'categoryId' | 'categoryName' | 'category' | 'model'>,
  categories?: ProductCategory[],
): string {
  return resolveProductCategoryLeafName(product, categories);
}

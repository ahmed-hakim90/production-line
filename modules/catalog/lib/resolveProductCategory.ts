import type { FirestoreProduct } from '../../../types';
import type { ProductCategory } from '../services/categoryService';
import { formatCategoryBreadcrumb } from './categoryTree';

export function resolveProductCategoryLabel(
  product: Pick<FirestoreProduct, 'categoryId' | 'categoryName' | 'category' | 'model'>,
  categories?: ProductCategory[],
): string {
  const categoryId = product.categoryId?.trim();
  if (categoryId && categories?.length) {
    const breadcrumb = formatCategoryBreadcrumb(categories, categoryId);
    if (breadcrumb) return breadcrumb;
    const leaf = categories.find((c) => c.id === categoryId);
    if (leaf?.name) return String(leaf.name).trim();
  }
  const categoryName = String(product.categoryName ?? '').trim();
  if (categoryName) return categoryName;
  const category = String(product.category ?? '').trim();
  if (category) return category;
  return String(product.model ?? '').trim();
}

export function resolveProductCategoryLeafName(
  product: Pick<FirestoreProduct, 'categoryId' | 'categoryName' | 'category' | 'model'>,
  categories?: ProductCategory[],
): string {
  const categoryId = product.categoryId?.trim();
  if (categoryId && categories?.length) {
    const leaf = categories.find((c) => c.id === categoryId);
    if (leaf?.name) return String(leaf.name).trim();
  }
  const categoryName = String(product.categoryName ?? '').trim();
  if (categoryName) return categoryName;
  const category = String(product.category ?? '').trim();
  if (category) return category;
  return String(product.model ?? '').trim();
}

export function resolveProductCategoryFilterKey(
  product: Pick<FirestoreProduct, 'categoryId' | 'categoryName' | 'category' | 'model'>,
): string {
  const categoryId = product.categoryId?.trim();
  if (categoryId) return `id:${categoryId}`;
  const name = resolveProductCategoryLeafName(product);
  return name ? `name:${name}` : '';
}

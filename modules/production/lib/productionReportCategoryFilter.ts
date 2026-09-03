import type { FirestoreProduct } from '../../../types';
import type { ProductCategory } from '../../catalog/services/categoryService';
import { formatCategoryBreadcrumb } from '../../catalog/lib/categoryTree';
import { resolveProductCategoryLeafName } from '../../catalog/lib/resolveProductCategory';

export type ProductionReportCategoryOption = {
  value: string;
  label: string;
};

const normalize = (value: unknown): string => String(value ?? '').trim();

export function buildProductionReportCategoryOptions(
  products: FirestoreProduct[],
  categories: ProductCategory[],
): ProductionReportCategoryOption[] {
  const activeCategories = categories.filter((category) => category.id && category.isActive !== false);
  const options = activeCategories.map((category) => ({
    value: `id:${category.id}`,
    label: formatCategoryBreadcrumb(activeCategories, category.id) || normalize(category.name),
  }));
  const knownNames = new Set(activeCategories.map((category) => normalize(category.name)).filter(Boolean));
  const legacyNames = new Set<string>();

  products.forEach((product) => {
    if (normalize(product.categoryId)) return;
    const name = resolveProductCategoryLeafName(product);
    if (name && !knownNames.has(name)) legacyNames.add(name);
  });

  legacyNames.forEach((name) => options.push({ value: `name:${name}`, label: name }));
  return options.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

export function matchesProductionReportProductCategory(
  product: FirestoreProduct | undefined,
  selection: string,
  categories: ProductCategory[],
): boolean {
  if (!selection) return true;
  if (!product) return false;

  if (selection.startsWith('id:')) {
    const selectedId = selection.slice(3);
    const productCategoryId = normalize(product.categoryId);
    if (!selectedId || !productCategoryId) return false;
    if (productCategoryId === selectedId) return true;
    const productCategory = categories.find((category) => category.id === productCategoryId);
    return (productCategory?.path ?? []).includes(selectedId);
  }

  const selectedName = selection.startsWith('name:') ? selection.slice(5) : selection;
  return resolveProductCategoryLeafName(product) === selectedName;
}

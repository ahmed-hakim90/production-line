/**
 * Pure catalog home-board metrics — products, categories, materials, BOM coverage.
 * UI loads data; this file only aggregates (testable without Firestore).
 */

export type CatalogDashboardProductRow = {
  id?: string;
  categoryId?: string | null;
  category?: string;
  categoryName?: string;
  isManufactured?: boolean;
  barcode?: string;
  sellingPrice?: number;
};

export type CatalogDashboardCategoryRow = {
  id?: string;
  name?: string;
  isActive?: boolean;
  type?: string;
};

export type CatalogDashboardMaterialRow = {
  id?: string;
  name?: string;
  type?: string;
  isActive?: boolean;
  categoryId?: string | null;
  purchaseCost?: number;
  availableForSpareParts?: boolean;
};

export type CatalogDashboardMaterialCategoryRow = {
  id?: string;
  isActive?: boolean;
};

export type CatalogCategoryShare = {
  key: string;
  name: string;
  count: number;
};

export type CatalogDashboardMetrics = {
  productTotal: number;
  manufacturedCount: number;
  spareOnlyCount: number;
  productsWithoutCategory: number;
  productsWithoutBarcode: number;
  productsWithoutPrice: number;
  manufacturedWithoutBom: number;
  manufacturedWithBom: number;
  productCategoryTotal: number;
  productCategoryActive: number;
  materialTotal: number;
  materialActive: number;
  materialsWithoutCategory: number;
  materialsWithoutCost: number;
  materialsSpareEligible: number;
  materialCategoryTotal: number;
  materialCategoryActive: number;
  topProductCategories: CatalogCategoryShare[];
  materialTypeBars: CatalogCategoryShare[];
};

function hasProductCategory(product: CatalogDashboardProductRow): boolean {
  if (String(product.categoryId || '').trim()) return true;
  if (String(product.categoryName || '').trim()) return true;
  if (String(product.category || '').trim()) return true;
  return false;
}

function isManufacturedProduct(product: CatalogDashboardProductRow): boolean {
  return product.isManufactured !== false;
}

function isProductCategoryRow(category: CatalogDashboardCategoryRow): boolean {
  return category.type !== 'raw_material';
}

export function computeCatalogDashboardMetrics(input: {
  products?: CatalogDashboardProductRow[];
  productCategories?: CatalogDashboardCategoryRow[];
  materials?: CatalogDashboardMaterialRow[];
  materialCategories?: CatalogDashboardMaterialCategoryRow[];
  productIdsWithBom?: Iterable<string>;
  topCategoryLimit?: number;
}): CatalogDashboardMetrics {
  const products = input.products || [];
  const productCategories = (input.productCategories || []).filter(isProductCategoryRow);
  const materials = input.materials || [];
  const materialCategories = input.materialCategories || [];
  const bomIds = new Set(
    Array.from(input.productIdsWithBom || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const topLimit = Math.max(1, Number(input.topCategoryLimit || 6));

  let manufacturedCount = 0;
  let spareOnlyCount = 0;
  let productsWithoutCategory = 0;
  let productsWithoutBarcode = 0;
  let productsWithoutPrice = 0;
  let manufacturedWithoutBom = 0;
  let manufacturedWithBom = 0;

  const categoryCount = new Map<string, { name: string; count: number }>();

  for (const product of products) {
    const manufactured = isManufacturedProduct(product);
    if (manufactured) manufacturedCount += 1;
    else spareOnlyCount += 1;

    if (!hasProductCategory(product)) productsWithoutCategory += 1;
    if (!String(product.barcode || '').trim()) productsWithoutBarcode += 1;
    if (!(Number(product.sellingPrice) > 0)) productsWithoutPrice += 1;

    if (manufactured) {
      const id = String(product.id || '').trim();
      if (id && bomIds.has(id)) manufacturedWithBom += 1;
      else manufacturedWithoutBom += 1;
    }

    const catKey =
      String(product.categoryId || '').trim() ||
      String(product.categoryName || product.category || '').trim() ||
      '__none__';
    const catName =
      catKey === '__none__'
        ? 'بدون فئة'
        : String(product.categoryName || product.category || catKey).trim() || catKey;
    const prev = categoryCount.get(catKey);
    if (prev) prev.count += 1;
    else categoryCount.set(catKey, { name: catName, count: 1 });
  }

  let materialActive = 0;
  let materialsWithoutCategory = 0;
  let materialsWithoutCost = 0;
  let materialsSpareEligible = 0;
  const typeCount = new Map<string, number>();

  for (const material of materials) {
    if (material.isActive !== false) materialActive += 1;
    if (!String(material.categoryId || '').trim()) materialsWithoutCategory += 1;
    if (!(Number(material.purchaseCost) > 0)) materialsWithoutCost += 1;
    if (material.availableForSpareParts !== false) materialsSpareEligible += 1;
    const typeKey = String(material.type || 'raw_material').trim() || 'raw_material';
    typeCount.set(typeKey, (typeCount.get(typeKey) || 0) + 1);
  }

  const MATERIAL_TYPE_LABELS: Record<string, string> = {
    raw_material: 'خامات',
    semi_finished: 'نصف مُصنّع',
    consumable: 'مستهلك',
    packaging: 'تغليف',
  };

  const topProductCategories = Array.from(categoryCount.entries())
    .map(([key, row]) => ({ key, name: row.name, count: row.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'))
    .slice(0, topLimit);

  const materialTypeBars = Array.from(typeCount.entries())
    .map(([key, count]) => ({
      key,
      name: MATERIAL_TYPE_LABELS[key] || key,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));

  return {
    productTotal: products.length,
    manufacturedCount,
    spareOnlyCount,
    productsWithoutCategory,
    productsWithoutBarcode,
    productsWithoutPrice,
    manufacturedWithoutBom,
    manufacturedWithBom,
    productCategoryTotal: productCategories.length,
    productCategoryActive: productCategories.filter((c) => c.isActive !== false).length,
    materialTotal: materials.length,
    materialActive,
    materialsWithoutCategory,
    materialsWithoutCost,
    materialsSpareEligible,
    materialCategoryTotal: materialCategories.length,
    materialCategoryActive: materialCategories.filter((c) => c.isActive !== false).length,
    topProductCategories,
    materialTypeBars,
  };
}

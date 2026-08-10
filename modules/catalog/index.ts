/**
 * Catalog module — shared master data for products, categories, and components.
 * Prefer these exports over production-scoped product_materials reads.
 */
export { catalogProductService } from './services/catalogProductService';
export { catalogRawMaterialService } from './services/catalogRawMaterialService';
export { computeCatalogDashboardMetrics } from './lib/catalogDashboardMetrics';
export type { CatalogDashboardMetrics } from './lib/catalogDashboardMetrics';
export {
  CATALOG_BOARD_PATH,
  catalogMaterialsPath,
  catalogProductsPath,
  parseCatalogMaterialGap,
  parseCatalogProductGap,
} from './lib/catalogDrilldown';
export {
  type CatalogComponent,
  resolveCatalogComponents,
  materialsToCatalogComponents,
  catalogComponentsToProductMaterials,
  loadProductComponents,
  loadProductComponentsForProducts,
  loadProductComponentsByProductIds,
  loadProductMaterials,
  loadProductMaterialsByProductIds,
  loadAllCatalogMaterials,
  loadSparePartsCatalogMaterials,
  filterCatalogComponentsForSpareParts,
} from './lib/productComponents';

/**
 * Catalog module — shared master data for products, categories, and components.
 * Prefer these exports over production-scoped product_materials reads.
 */
export { catalogProductService } from './services/catalogProductService';
export { catalogRawMaterialService } from './services/catalogRawMaterialService';
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
} from './lib/productComponents';

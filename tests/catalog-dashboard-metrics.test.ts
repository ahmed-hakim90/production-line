import assert from 'node:assert/strict';
import { computeCatalogDashboardMetrics } from '../modules/catalog/lib/catalogDashboardMetrics';
import {
  catalogMaterialsPath,
  catalogProductsPath,
  parseCatalogMaterialGap,
  parseCatalogProductGap,
} from '../modules/catalog/lib/catalogDrilldown';

function run() {
  assert.equal(catalogProductsPath({ manufactured: 'yes', gap: 'no_bom' }), '/products?manufactured=yes&gap=no_bom');
  assert.equal(catalogProductsPath({ category: 'c1' }), '/products?category=c1');
  assert.equal(catalogProductsPath({ category: '__none__', gap: 'no_category' }), '/products?gap=no_category');
  assert.equal(catalogMaterialsPath({ gap: 'no_cost' }), '/manufacturing/materials?gap=no_cost');
  assert.equal(catalogMaterialsPath({ type: 'packaging' }), '/manufacturing/materials?type=packaging');
  assert.equal(parseCatalogProductGap('no_barcode'), 'no_barcode');
  assert.equal(parseCatalogProductGap('x'), '');
  assert.equal(parseCatalogMaterialGap('no_category'), 'no_category');

  const metrics = computeCatalogDashboardMetrics({
    products: [
      { id: 'p1', categoryId: 'c1', categoryName: 'هواتف', isManufactured: true, barcode: '111', sellingPrice: 10 },
      { id: 'p2', categoryId: 'c1', categoryName: 'هواتف', isManufactured: true },
      { id: 'p3', isManufactured: false, barcode: '222', sellingPrice: 5 },
      { id: 'p4', category: 'غسالات', isManufactured: true, barcode: '333', sellingPrice: 20 },
    ],
    productCategories: [
      { id: 'c1', name: 'هواتف', isActive: true, type: 'product' },
      { id: 'c2', name: 'خامات قديمة', isActive: true, type: 'raw_material' },
      { id: 'c3', name: 'معطّلة', isActive: false, type: 'product' },
    ],
    materials: [
      { id: 'm1', type: 'raw_material', isActive: true, categoryId: 'mc1', purchaseCost: 2, availableForSpareParts: true },
      { id: 'm2', type: 'packaging', isActive: true, purchaseCost: 0, availableForSpareParts: false },
      { id: 'm3', type: 'consumable', isActive: false, categoryId: 'mc2', purchaseCost: 1 },
    ],
    materialCategories: [
      { id: 'mc1', isActive: true },
      { id: 'mc2', isActive: false },
    ],
    productIdsWithBom: ['p1'],
  });

  assert.equal(metrics.productTotal, 4);
  assert.equal(metrics.manufacturedCount, 3);
  assert.equal(metrics.spareOnlyCount, 1);
  assert.equal(metrics.productsWithoutCategory, 1);
  assert.equal(metrics.productsWithoutBarcode, 1);
  assert.equal(metrics.productsWithoutPrice, 1);
  assert.equal(metrics.manufacturedWithBom, 1);
  assert.equal(metrics.manufacturedWithoutBom, 2);
  assert.equal(metrics.productCategoryTotal, 2);
  assert.equal(metrics.productCategoryActive, 1);
  assert.equal(metrics.materialTotal, 3);
  assert.equal(metrics.materialActive, 2);
  assert.equal(metrics.materialsWithoutCategory, 1);
  assert.equal(metrics.materialsWithoutCost, 1);
  assert.equal(metrics.materialsSpareEligible, 2);
  assert.equal(metrics.materialCategoryActive, 1);
  assert.equal(metrics.topProductCategories[0]?.name, 'هواتف');
  assert.equal(metrics.topProductCategories[0]?.count, 2);
  assert.ok(metrics.materialTypeBars.some((row) => row.key === 'packaging' && row.count === 1));

  console.log('catalog-dashboard-metrics.test.ts: OK');
}

run();

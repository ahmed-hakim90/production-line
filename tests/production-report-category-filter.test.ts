import assert from 'node:assert/strict';
import {
  buildProductionReportCategoryOptions,
  matchesProductionReportProductCategory,
} from '../modules/production/lib/productionReportCategoryFilter';
import type { FirestoreProduct } from '../types';
import type { ProductCategory } from '../modules/catalog/services/categoryService';

const categories: ProductCategory[] = [
  { id: 'home', name: 'منزلي', isActive: true, path: [] },
  { id: 'saraya', name: 'سرايا', isActive: true, parentId: 'home', path: ['home'] },
];
const products: FirestoreProduct[] = [
  { id: 'new', name: 'حديث', code: 'N', model: 'سرايا', categoryName: 'سرايا', categoryId: 'saraya', openingBalance: 0 },
  { id: 'legacy-name', name: 'قديم 1', code: 'L1', model: '', categoryName: 'عناية', openingBalance: 0 },
  { id: 'legacy-model', name: 'قديم 2', code: 'L2', model: 'كيه', openingBalance: 0 },
];

assert.equal(matchesProductionReportProductCategory(products[0], 'id:saraya', categories), true);
assert.equal(matchesProductionReportProductCategory(products[0], 'id:home', categories), true);
assert.equal(matchesProductionReportProductCategory(products[1], 'name:عناية', categories), true);
assert.equal(matchesProductionReportProductCategory(products[2], 'name:كيه', categories), true);
assert.equal(matchesProductionReportProductCategory(products[0], 'name:عناية', categories), false);

const options = buildProductionReportCategoryOptions(products, categories);
assert.equal(options.some((option) => option.value === 'id:saraya' && option.label === 'منزلي > سرايا'), true);
assert.equal(options.some((option) => option.value === 'name:عناية'), true);
assert.equal(options.some((option) => option.value === 'name:كيه'), true);

console.log('production report category filter tests passed');

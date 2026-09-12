import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'modules/production/pages/Products.tsx'), 'utf8');

assert.match(page, /products_table_visible_columns_v2/);
assert.match(page, /openingStock: false/);
assert.match(page, /totalProduction: false/);
assert.match(page, /monthlyProductionQty: false/);
assert.match(page, /wasteUnits: false/);
assert.match(page, /stockLevel: true/);
assert.match(page, /costPerUnit: true/);
assert.match(page, /sellingPrice: true/);
assert.match(page, /PRODUCT_COLUMN_PRESETS/);
assert.match(page, /applyColumnPreset\('compact'\)/);
assert.match(page, /applyColumnPreset\('operations'\)/);
assert.match(page, /applyColumnPreset\('costs'\)/);
assert.doesNotMatch(page, /<th className="erp-th text-center">نمط التجميع<\/th>/);

console.log('products-table-columns.test.ts: ok');

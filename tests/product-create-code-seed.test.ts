/**
 * Product auto-code allocation must seed max sequence OUTSIDE the Firestore
 * transaction. Web SDK transactions only accept DocumentReference gets — a
 * collection query inside the transaction fails and surfaces as a generic
 * "تعذر حفظ المنتج" in the create-product modal.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('productService seeds max product codes before runTransaction', () => {
  const src = readFileSync(join(root, 'modules/production/services/productService.ts'), 'utf8');
  assert.match(src, /const initialMaxSequence = await seedMaxProductCodes\(prefix\)/);
  assert.match(src, /async \(\) => initialMaxSequence/);
  assert.doesNotMatch(src, /txGetTenantDocs/);
  assert.doesNotMatch(src, /seedMaxProductCodesInTx/);
});

test('rawMaterialService and categoryService seed outside transactions', () => {
  const raw = readFileSync(join(root, 'modules/inventory/services/rawMaterialService.ts'), 'utf8');
  const cats = readFileSync(join(root, 'modules/catalog/services/categoryService.ts'), 'utf8');
  assert.match(raw, /initialMaxSequence = await seedMax/);
  assert.doesNotMatch(raw, /txGetTenantDocs/);
  assert.match(cats, /initialMaxSequence = await seedMaxCategoryCodes/);
  assert.doesNotMatch(cats, /seedMaxCategoryCodesInTransaction/);
});

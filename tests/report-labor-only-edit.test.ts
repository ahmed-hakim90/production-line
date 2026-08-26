import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'modules/production/pages/Reports.tsx'), 'utf8');

assert.match(source, /const \[laborOnlyEdit, setLaborOnlyEdit\] = useState\(false\)/);
assert.match(source, /rt === 'finished_product' && hasAppliedInventory/);
assert.match(source, /لهذا التقرير حركة مخزون مرتبطة؛ المتاح هنا تعديل العمالة وساعات العمل فقط/);
assert.match(source, /const updatePayload: Partial<ProductionReport> = laborOnlyEdit/);
assert.match(source, /workersProductionCount: Number\(form\.workersProductionCount \|\| 0\)/);
assert.match(source, /workersExternalCount: Number\(form\.workersExternalCount \|\| 0\)/);
assert.match(source, /workHours: Number\(form\.workHours \|\| 0\)/);

const laborOnlyPayload = source.slice(
  source.indexOf('const updatePayload: Partial<ProductionReport> = laborOnlyEdit'),
  source.indexOf('await updateReport(editId, updatePayload'),
);
for (const inventoryField of ['quantityProduced', 'productId', 'lineId', 'componentScrapItems', 'packagingLines']) {
  assert.doesNotMatch(laborOnlyPayload, new RegExp(`${inventoryField}:`));
}

console.log('report-labor-only-edit: ok');

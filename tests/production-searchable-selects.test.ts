import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

const componentScrapModal = read('modules/production/components/ComponentScrapModal.tsx');
assert.match(componentScrapModal, /<SearchableSelect/);
assert.match(componentScrapModal, /keywords:\s*opt\.materialId/);
assert.doesNotMatch(componentScrapModal, /<select/);
assert.match(componentScrapModal, /selectedIds/);

const quickAction = read('modules/production/pages/QuickAction.tsx');
assert.match(quickAction, /<output[\s\S]*?aria-label="إجمالي العمالة"/);
assert.match(quickAction, /grid grid-cols-2 gap-3 lg:grid-cols-3/);
assert.match(quickAction, /grid grid-cols-2 gap-3 sm:gap-5/);
assert.match(quickAction, /className="col-span-2"[\s\S]*?تاريخ التقرير/);
assert.match(quickAction, /className="col-span-2"[\s\S]*?اسم المكون \*[\s\S]*?المنتج \*/);
const workOrderSection = quickAction.slice(
  quickAction.indexOf('Work Order Selector'),
  quickAction.indexOf('scopedActiveWOs.length === 0'),
);
assert.match(workOrderSection, /<SearchableSelect/);
assert.match(workOrderSection, /searchPlaceholder="ابحث برقم أمر الشغل أو الصنف أو الخط"/);
assert.match(workOrderSection, /options=\{quickWorkOrderOptions\}/);
assert.match(quickAction, /keywords:\s*\[orderNumber, productName, lineName, wo\.id\]/);
assert.match(quickAction, /!workOrderRequired[\s\S]*?value:\s*''[\s\S]*?بدون أمر شغل/);

for (const path of [
  'components/modal-manager/modals/GlobalCreateReportModal.tsx',
  'modules/production/pages/Reports.tsx',
]) {
  const source = read(path);
  assert.match(source, /<SearchableSelect[\s\S]*?searchPlaceholder="ابحث برقم أمر الشغل أو الصنف أو الخط"/);
}

console.log('production-searchable-selects: ok');

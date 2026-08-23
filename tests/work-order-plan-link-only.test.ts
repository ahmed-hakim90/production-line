import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workOrderModal = readFileSync(
  new URL('../components/modal-manager/modals/GlobalCreateWorkOrderModal.tsx', import.meta.url),
  'utf8',
);

assert.match(
  workOrderModal,
  /onChange=\{\(value\) => setForm\(\(f\) => \(\{ \.\.\.f, planId: value \}\)\)\}/,
  'selecting a plan must update only the work-order plan link',
);
assert.match(
  workOrderModal,
  /productId: payloadPlanId \? '' : payloadProductId/,
  'opening from a plan must not copy its product into the work order',
);
assert.match(workOrderModal, /الربط بالخطة مرجعي فقط ولا يغيّر بيانات أمر الشغل/);
assert.doesNotMatch(workOrderModal, /productId: plan\?\.productId/);
assert.doesNotMatch(workOrderModal, /quantity: planRemaining/);

const reports = readFileSync(
  new URL('../modules/production/pages/Reports.tsx', import.meta.url),
  'utf8',
);
const selectorStart = reports.indexOf('{/* Work Order Selector */}');
const selectorEnd = reports.indexOf('<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">', selectorStart);
assert.ok(selectorStart >= 0 && selectorEnd > selectorStart, 'work-order selector section must exist');
const selector = reports.slice(selectorStart, selectorEnd);
assert.match(selector, /<SearchableSelect/);
assert.match(selector, /searchPlaceholder="ابحث برقم أمر الشغل أو الصنف أو الخط"/);
assert.match(selector, /workOrderNumber/);
assert.doesNotMatch(selector, /<Select(?:\s|>)/);

const globalReportModal = readFileSync(
  new URL('../components/modal-manager/modals/GlobalCreateReportModal.tsx', import.meta.url),
  'utf8',
);
assert.match(globalReportModal, /const workOrderOptions = useMemo/);
assert.match(globalReportModal, /searchPlaceholder="ابحث برقم أمر الشغل أو الصنف أو الخط"/);
assert.match(globalReportModal, /workOrderNumber/);

console.log('work-order-plan-link-only.test.ts: ok');

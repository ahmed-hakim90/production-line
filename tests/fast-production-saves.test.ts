import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storeSource = readFileSync(new URL('../store/useAppStore.ts', import.meta.url), 'utf8');
const quickActionSource = readFileSync(new URL('../modules/production/pages/QuickAction.tsx', import.meta.url), 'utf8');
const reportsSource = readFileSync(new URL('../modules/production/pages/Reports.tsx', import.meta.url), 'utf8');
const createReportModalSource = readFileSync(
  new URL('../components/modal-manager/modals/GlobalCreateReportModal.tsx', import.meta.url),
  'utf8',
);
const createWorkOrderModalSource = readFileSync(
  new URL('../components/modal-manager/modals/GlobalCreateWorkOrderModal.tsx', import.meta.url),
  'utf8',
);
const importReportsModalSource = readFileSync(
  new URL('../components/modal-manager/modals/GlobalImportReportsModal.tsx', import.meta.url),
  'utf8',
);
const importPlansModalSource = readFileSync(
  new URL('../components/modal-manager/modals/GlobalImportProductionPlansModal.tsx', import.meta.url),
  'utf8',
);
const plansPageSource = readFileSync(
  new URL('../modules/production/pages/ProductionPlans.tsx', import.meta.url),
  'utf8',
);
const issueRequestsSource = readFileSync(
  new URL('../modules/production/pages/ProductionIssueRequests.tsx', import.meta.url),
  'utf8',
);
const wasteReportsSource = readFileSync(
  new URL('../modules/production/pages/ComponentWasteReports.tsx', import.meta.url),
  'utf8',
);

function extractFunctionBody(source: string, name: string): string {
  const marker = `${name}: async `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  // Skip past the parameter list — look for `) => {` then the opening body brace.
  const arrow = source.indexOf(') => {', start);
  assert.ok(arrow >= 0, `missing arrow body for ${name}`);
  const braceStart = arrow + ') => '.length;
  assert.equal(source[braceStart], '{', `expected body brace for ${name}`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unclosed body for ${name}`);
}

const createWorkOrderBody = extractFunctionBody(storeSource, 'createWorkOrder');
const createPlanBody = extractFunctionBody(storeSource, 'createProductionPlan');
const updatePlanBody = extractFunctionBody(storeSource, 'updateProductionPlan');
const deletePlanBody = extractFunctionBody(storeSource, 'deleteProductionPlan');
const deleteWorkOrderBody = extractFunctionBody(storeSource, 'deleteWorkOrder');
const fetchPlansBody = extractFunctionBody(storeSource, 'fetchProductionPlans');
const updateReportBody = extractFunctionBody(storeSource, 'updateReport');
const deleteReportBody = extractFunctionBody(storeSource, 'deleteReport');
const reconcileWorkOrderBody = extractFunctionBody(storeSource, 'reconcileWorkOrderFromReports');

assert.match(
  createWorkOrderBody,
  /void \(async \(\) => \{/,
  'createWorkOrder must run notify/reconcile in a background void async',
);
assert.match(
  createWorkOrderBody,
  /void \(async \(\) => \{[\s\S]*reconcileWorkOrderFromReports/,
  'reconcileWorkOrderFromReports must run only inside the background side-effect block',
);
assert.match(
  createWorkOrderBody,
  /generateNextNumber/,
  'createWorkOrder must generate the work-order number when missing',
);
const createWoBeforeBackground = createWorkOrderBody.split('void (async () => {')[0] ?? '';
assert.doesNotMatch(
  createWoBeforeBackground,
  /reconcileWorkOrderFromReports/,
  'createWorkOrder must not call reconcile before returning to the UI',
);
assert.doesNotMatch(
  createWoBeforeBackground,
  /fetchWorkOrders\(\{\s*force:\s*true\s*\}\)/,
  'createWorkOrder must not force-reload work orders before return',
);

assert.doesNotMatch(
  createPlanBody,
  /await get\(\)\.fetchProductionPlans\(\{\s*force:\s*true\s*\}\)/,
  'createProductionPlan must not await a forced plans reload before return',
);
assert.match(
  createPlanBody,
  /upsertLoadedProductionPlan/,
  'createProductionPlan must upsert the local productionPlans list',
);
assert.match(
  createPlanBody,
  /void \(async \(\) => \{/,
  'createProductionPlan side effects must be backgrounded',
);

assert.doesNotMatch(
  updatePlanBody,
  /await get\(\)\.fetchProductionPlans\(\{\s*force:\s*true\s*\}\)/,
  'updateProductionPlan must not await a forced plans reload',
);
assert.match(updatePlanBody, /upsertLoadedProductionPlan/);

assert.doesNotMatch(
  deletePlanBody,
  /await get\(\)\.fetchProductionPlans\(\{\s*force:\s*true\s*\}\)/,
  'deleteProductionPlan must not await a forced plans reload',
);
assert.match(deletePlanBody, /productionPlans\.filter/);

assert.doesNotMatch(
  deleteWorkOrderBody,
  /await get\(\)\.fetchWorkOrders\(\{\s*force:\s*true\s*\}\)/,
  'deleteWorkOrder must not await a forced work-order reload',
);
assert.match(deleteWorkOrderBody, /workOrders\.filter/);

assert.doesNotMatch(
  fetchPlansBody,
  /reportService\.getByProduct/,
  'fetchProductionPlans must not N+1 getByProduct for every plan',
);
assert.match(
  fetchPlansBody,
  /buildPlanReportsFromCachedReports/,
  'fetchProductionPlans should rebuild planReports from cached reports',
);

const updateReportBeforeBackground = updateReportBody.split('void (async () => {')[0] ?? '';
assert.match(updateReportBody, /upsertLoadedReportRow/);
assert.match(updateReportBody, /void \(async \(\) => \{/);
assert.doesNotMatch(
  updateReportBeforeBackground,
  /fetchProductionPlans\(\{\s*force:\s*true\s*\}\)/,
  'updateReport must not force-reload plans before return',
);
assert.doesNotMatch(
  updateReportBeforeBackground,
  /reconcileWorkOrderFromReports/,
  'updateReport must not await work-order reconcile before return',
);
assert.doesNotMatch(
  updateReportBeforeBackground,
  /reconcileProductionPlanFromReports/,
  'updateReport must not await plan reconcile before return',
);

const deleteReportBeforeBackground = deleteReportBody.split('void (async () => {')[0] ?? '';
assert.match(deleteReportBody, /reverseProductionReportInventory/);
assert.match(deleteReportBody, /void \(async \(\) => \{/);
assert.doesNotMatch(
  deleteReportBeforeBackground,
  /fetchProductionPlans\(\{\s*force:\s*true\s*\}\)/,
  'deleteReport must not force-reload plans before return',
);
assert.doesNotMatch(
  deleteReportBeforeBackground,
  /reconcileWorkOrderFromReports/,
  'deleteReport must not await work-order reconcile before return',
);
assert.match(
  deleteReportBody,
  /mode:\s*'linkedOnly'/,
  'deleteReport background reconcile should use linkedOnly mode',
);
assert.match(
  updateReportBody,
  /mode:\s*'linkedOnly'/,
  'updateReport background reconcile should use linkedOnly mode',
);

assert.match(
  reconcileWorkOrderBody,
  /linkedOnly/,
  'reconcileWorkOrderFromReports must support linkedOnly mode',
);

assert.match(quickActionSource, /queueReportCreate\(data/);
assert.match(quickActionSource, /REPORT_SAVE_PENDING_MESSAGE/);
assert.doesNotMatch(
  quickActionSource,
  /تمت إضافة التقرير وجارٍ تأكيد حفظه/,
  'QuickAction must not show success before the save is confirmed',
);
assert.doesNotMatch(
  quickActionSource,
  /await createReport\(/,
  'QuickAction create path must not await createReport on the critical path',
);

assert.match(reportsSource, /queueReportCreate\(payload/);
assert.match(reportsSource, /REPORT_SAVE_PENDING_MESSAGE/);
assert.match(reportsSource, /retryQueuedReportCreate/);
assert.match(reportsSource, /clientSaveState === 'failed'/);
assert.doesNotMatch(
  reportsSource,
  /await createReport\(payload,\s*\{\s*path:\s*PRODUCTION_REPORT_CREATE_PATHS\.reportsPage/,
  'Reports page create path must queue instead of awaiting createReport',
);
assert.match(
  reportsSource,
  /queueReportCreate\(toReportData\(row\)/,
  'Reports import create path must queueReportCreate',
);
assert.doesNotMatch(
  reportsSource,
  /await createReport\(toReportData/,
  'Reports import must not await createReport in the UI loop',
);
assert.match(
  reportsSource,
  /showAppToast\('success',\s*'تم حذف التقرير بنجاح'\)/,
  'Reports delete must toast via showAppToast',
);

assert.match(createReportModalSource, /queueReportCreate\(reportPayload/);
assert.match(createReportModalSource, /REPORT_SAVE_PENDING_MESSAGE/);
assert.doesNotMatch(
  createReportModalSource,
  /await createReport\(/,
  'GlobalCreateReportModal must not await createReport on the critical path',
);

assert.match(createWorkOrderModalSource, /showAppToast\('success'/);
assert.match(createWorkOrderModalSource, /close\(\)/);
assert.doesNotMatch(createWorkOrderModalSource, /setMessage\(/);
assert.match(
  createWorkOrderModalSource,
  /workOrderNumber:\s*woNumber/,
  'GlobalCreateWorkOrderModal must defer numbering to the store',
);

assert.match(plansPageSource, /showAppToast\('success',\s*'تم حفظ خطة الإنتاج'\)/);
assert.doesNotMatch(
  plansPageSource,
  /await fetchProductionPlans\(\)/,
  'ProductionPlans page must not force-reload all plans after bulk date shift',
);

assert.match(importReportsModalSource, /queueReportCreate\(/);
assert.match(importReportsModalSource, /useJobsStore/);
assert.doesNotMatch(
  importReportsModalSource,
  /await createReport\(/,
  'GlobalImportReportsModal must not await createReport on the critical UI path',
);

assert.match(importPlansModalSource, /useJobsStore/);
assert.match(importPlansModalSource, /createProductionPlan\(/);
assert.match(
  importPlansModalSource,
  /showAppToast\('success'/,
  'GlobalImportProductionPlansModal must toast and close while import runs in jobs panel',
);

assert.doesNotMatch(
  issueRequestsSource,
  /await createProductionPlan\([\s\S]*?await fetchProductionPlans\(\)/,
  'ProductionIssueRequests must not reload plans after createProductionPlan',
);

assert.match(
  wasteReportsSource,
  /void loadRecentReports\(\)/,
  'ComponentWasteReports must not await force reload after save',
);

console.log('fast-production-saves.test.ts: ok');

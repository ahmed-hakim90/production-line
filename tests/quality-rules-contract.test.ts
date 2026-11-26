import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore/production-line.rules.fragment', import.meta.url), 'utf8');
const genericStart = rules.indexOf('function pl_isErpBusinessCollection');
const genericEnd = rules.indexOf('function pl_superAdminTenantScopedCreateOk');
const generic = rules.slice(genericStart, genericEnd);

for (const name of ['quality_pallets', 'quality_inspections', 'quality_defects', 'quality_capa']) {
  assert.equal(generic.includes(`'${name}'`), false, `${name} must leave the generic tenant-wide writer list`);
}

assert.match(rules, /match \/quality_pallets\/\{docId\}/);
assert.match(rules, /function pl_qualityCanRecordDefects\(\)/);
assert.match(rules, /match \/quality_saved_filters\/\{docId\}/);
assert.match(rules, /match \/quality_scrap_reasons\/\{docId\}/);
assert.match(rules, /match \/quality_second_sort_reasons\/\{docId\}/);
assert.match(rules, /match \/quality_second_sort_returns\/\{docId\}/);
assert.match(rules, /match \/quality_carton_receipts\/\{docId\}/);
assert.match(rules, /match \/quality_plastic_receipts\/\{docId\}/);
assert.match(rules, /match \/quality_injection_machines\/\{docId\}/);
assert.match(rules, /match \/quality_injection_records\/\{docId\}/);
assert.match(rules, /record\.acceptedQuantity \+ record\.rejectedQuantity == record\.totalQuantity/);
assert.match(rules, /function pl_qualityCanIncoming\(\)/);
assert.match(rules, /function pl_qualityCanOpenLinePull\(\)/);
assert.match(rules, /function pl_qualityLineStationInspectorOk\(employeeId\)/);
assert.match(rules, /function pl_qualityLinePullAssignedInspector\(employeeId\)/);
assert.match(rules, /pl_qualityLineStationInspectorOk\(request\.resource\.data\.inspectorEmployeeId\)/);
assert.match(rules, /pl_qualityLinePullInspectorUnchangedOrAssigned\(\)/);
assert.equal(generic.includes("'quality_scrap_reasons'"), false);
assert.equal(generic.includes("'quality_second_sort_returns'"), false);
assert.equal(generic.includes("'quality_carton_receipts'"), false);
assert.equal(generic.includes("'quality_plastic_receipts'"), false);
assert.doesNotMatch(rules, /INCOMING_BULK_DELETE_PASSWORD/);
assert.match(rules, /createdByUid == request\.auth\.uid/);
assert.equal(generic.includes("'quality_saved_filters'"), false);
assert.match(rules, /pl_qualityCanOverride\(\)/);
assert.match(rules, /request\.resource\.data\.overrideReason/);
assert.doesNotMatch(rules, /pl_qualityCanInspect\(\)[\s\S]{0,80}overrideReason/);

const storage = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
assert.match(storage, /module == 'quality'/);
assert.match(storage, /quality\.photos\.manage/);
assert.match(rules, /!\('responsibility' in request\.resource\.data\)/);
assert.doesNotMatch(rules, /responsibility in \[/);
for (const fn of ['pl_qualityCanRead', 'pl_qualityCanInspect', 'pl_qualityCanOverride', 'pl_qualityCanReopen', 'pl_qualityCanManageWorkers']) {
  const start = rules.indexOf(`function ${fn}(`);
  const next = rules.indexOf('\n    function ', start + 10);
  assert.equal(rules.slice(start, next).includes('responsibility'), false, fn);
}
assert.match(rules, /function pl_qualityAssignedInspector\(employeeId\)/);
assert.match(rules, /function pl_qualityInspectorFacts\(employeeId, inspectorName\)/);
assert.match(rules, /additionalInspectorTechnician\.get\('isActive', true\) == true/);
assert.match(rules, /qualityTechnicians\.hasAny\(\[/);
assert.match(rules, /function pl_qualityPalletDefectOpen\(palletId\)/);
assert.match(rules, /function pl_qualityDefectIdentityStable\(\)/);
assert.match(rules, /parent\.inspectionStatus != 'تم الفحص'/);
assert.match(rules, /parent\.status != 'completed'/);
const assignmentFnStart = rules.indexOf('function pl_qualityInspectorFacts');
const assignmentFnEnd = rules.indexOf('function pl_qualityAssignedInspector');
assert.equal(rules.slice(assignmentFnStart, assignmentFnEnd).includes('responsibility'), false);
assert.match(rules, /function pl_qualityCanManageWorkers\(\)/);
assert.match(rules, /match \/quality_workers_assignments\/\{docId\}/);
assert.match(rules, /docId == request\.resource\.data\.tenantId \+ '__' \+ request\.resource\.data\.employeeId/);
assert.doesNotMatch(rules, /quality_workers_assignments[\s\S]{0,120}allow create, update, delete: if false/);
assert.match(rules, /function pl_workOrderUpdateKeepsCloseOnServer\(collectionName\)/);
assert.match(rules, /request\.resource\.data\.status != 'completed'/);

console.log('quality rules contract passed');

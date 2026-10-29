import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_PERMISSIONS, checkPermission } from '../utils/permissions.ts';
import {
  assertStaffDraft,
  inspectorMayBeSelected,
  selectableInspectors,
  staffAssignmentDocId,
} from '../modules/quality/domain/staff.ts';
import type { QualityStaffAssignment } from '../modules/quality/model.ts';

const employee = {
  id: 'emp-1',
  tenantId: 'tenant-a',
  name: 'سما',
  isActive: true,
};

const assignment = (overrides: Partial<QualityStaffAssignment> = {}): QualityStaffAssignment => ({
  id: 'tenant-a__emp-1',
  tenantId: 'tenant-a',
  employeeId: 'emp-1',
  employeeName: 'سما',
  userId: '',
  stationIds: [],
  lineIds: [],
  isActive: true,
  createdByUid: 'uid',
  createdByName: 'مدير',
  updatedByUid: 'uid',
  updatedByName: 'مدير',
  ...overrides,
});

const screen = readFileSync(new URL('../modules/quality/pages/QualityStaff.tsx', import.meta.url), 'utf8');
const domain = readFileSync(new URL('../modules/quality/domain/staff.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../modules/quality/services/qualityStaffService.ts', import.meta.url), 'utf8');
assert.equal(screen.includes('QUALITY_RESPONSIBILITY'), false);
assert.equal(screen.includes('مفاتيح الدور'), false);
assert.equal(domain.includes('responsibility'), false);
assert.equal(service.includes('responsibility'), false);
assert.equal(service.includes('roles.permissions'), false);

const qualityKeys = [
  'quality.pallets.view',
  'quality.pallets.inspect',
  'quality.samples.view',
  'quality.samples.inspect',
  'quality.defects.record',
  'quality.pallets.override',
  'quality.records.reopen',
  'quality.scrap.view',
  'quality.scrap.manage',
  'quality.secondSort.view',
  'quality.secondSort.manage',
  'quality.photos.view',
  'quality.photos.manage',
  'quality.reports.view',
  'quality.reports.export',
  'quality.print',
  'quality.settings.view',
  'quality.settings.manage',
  'quality.workers.view',
  'quality.workers.manage',
  'quality.records.delete',
] as const;
for (const key of qualityKeys) assert.equal(ALL_PERMISSIONS.includes(key), true, key);

assert.equal(staffAssignmentDocId('tenant-a', 'emp-1'), 'tenant-a__emp-1');
const active = assignment();
assert.equal(inspectorMayBeSelected({ tenantId: 'tenant-a', employee, assignment: active }), true);
assert.equal(checkPermission({}, 'quality.pallets.inspect'), false);
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-a',
  employee: { ...employee, isActive: false },
  assignment: active,
}), false);
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-a',
  employee,
  assignment: assignment({ isActive: false }),
}), false);
assert.equal(checkPermission({ 'quality.pallets.inspect': true }, 'quality.pallets.inspect'), true);
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-b',
  employee,
  assignment: active,
}), false);
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-a',
  employee,
  assignment: assignment({ stationIds: ['station-1'] }),
  stationId: 'station-2',
}), false);
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-a',
  employee,
  assignment: assignment({ lineIds: ['line-1'] }),
  lineId: 'line-1',
}), true);
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-a',
  employee,
  assignment: assignment({ stationIds: ['station-1'] }),
  stationIsNew: true,
}), false);
assert.equal(selectableInspectors([employee, { ...employee, id: 'emp-2', name: 'آخر' }], [active], {
  tenantId: 'tenant-a',
}).length, 1);

const historical = { inspectorEmployeeId: 'emp-1', inspectorName: 'سما' };
assert.equal(inspectorMayBeSelected({
  tenantId: 'tenant-a',
  employee,
  assignment: assignment({ isActive: false }),
}), false);
assert.equal(historical.inspectorName, 'سما');

const draft = assertStaffDraft({
  employeeId: 'emp-1',
  stationIds: [],
  lineIds: [],
  isActive: true,
  responsibility: 'manager',
} as never);
assert.equal('responsibility' in draft, false);
assert.throws(() => assertStaffDraft({
  employeeId: 'emp-1',
  stationIds: [],
  lineIds: [],
  isActive: true,
  permissions: { 'quality.workers.manage': true },
} as never), /صلاحيات/);
assert.equal(checkPermission({ 'quality.print': true }, 'quality.pallets.view'), false);
assert.equal(checkPermission({ 'quality.print': true }, 'quality.workers.view'), false);
assert.equal(checkPermission({ 'quality.settings.manage': true }, 'quality.workers.manage'), true);
assert.equal(checkPermission({ 'quality.workers.view': false, 'quality.settings.view': true }, 'quality.workers.view'), false);

console.log('quality staff checks passed');

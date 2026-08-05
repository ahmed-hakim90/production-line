import assert from 'node:assert/strict';
import {
  canManageRepairWorkshopWork,
  isSingleBranchTechnician,
  shouldShowRepairPrintCosts,
  stripRepairProductsToIntake,
} from '../modules/repair/lib/repairJobIntake';
import type { RepairJob, RepairJobProduct } from '../modules/repair/types';

// Reception: create+edit → no workshop services UI (detail = assign + view only)
assert.equal(
  canManageRepairWorkshopWork({
    canEditJob: true,
    isRepairTechnician: false,
    isAssignedTechnician: false,
    canManageBranches: false,
    canViewAllCallCenter: false,
    canCreateJobs: true,
    canEditJobs: true,
  }),
  false,
);

// Supervisor: edit without create → workshop
assert.equal(
  canManageRepairWorkshopWork({
    canEditJob: true,
    isRepairTechnician: false,
    isAssignedTechnician: false,
    canManageBranches: false,
    canViewAllCallCenter: false,
    canCreateJobs: false,
    canEditJobs: true,
  }),
  true,
);

// Assigned technician → workshop
assert.equal(
  canManageRepairWorkshopWork({
    canEditJob: true,
    isRepairTechnician: true,
    isAssignedTechnician: true,
    canManageBranches: false,
    canViewAllCallCenter: false,
    canCreateJobs: false,
    canEditJobs: false,
  }),
  true,
);

// No edit → never
assert.equal(
  canManageRepairWorkshopWork({
    canEditJob: false,
    isRepairTechnician: true,
    isAssignedTechnician: true,
    canManageBranches: true,
    canViewAllCallCenter: true,
    canCreateJobs: true,
    canEditJobs: true,
  }),
  false,
);

// Single branch technician → fixed assignment UI
assert.equal(isSingleBranchTechnician(['tech-1']), true);
assert.equal(isSingleBranchTechnician(['tech-1', 'tech-2']), false);
assert.equal(isSingleBranchTechnician([]), false);
assert.equal(isSingleBranchTechnician(null), false);
assert.equal(isSingleBranchTechnician(['', '  ']), false);
assert.equal(isSingleBranchTechnician([' a ', '']), true);

const intakeJob = {
  tenantId: 't1',
  receiptNo: '1',
  branchId: 'b1',
  customerName: 'x',
  customerPhone: '1',
  deviceType: 'a',
  deviceBrand: 'b',
  deviceModel: 'c',
  problemDescription: 'p',
  status: 'received',
  warranty: 'none',
  partsUsed: [],
  finalCost: 0,
  createdAt: '',
  updatedAt: '',
} as RepairJob;

assert.equal(shouldShowRepairPrintCosts(intakeJob), false);

const stripped = stripRepairProductsToIntake([{
  itemId: '1',
  serviceIds: ['a'],
  finalCost: 9,
  estimatedCost: 9,
  diagnosis: 'عطل العميل',
  technicianDiagnosis: 'تشخيص فني يجب أن يُصفَّر عند الاستقبال',
} as RepairJobProduct])[0];
assert.deepEqual(stripped.serviceIds, []);
assert.equal(stripped.diagnosis, 'عطل العميل');
assert.equal(stripped.technicianDiagnosis, '');
assert.equal(stripped.finalCost, 0);

console.log('repair-workshop-access.test.ts: ok');

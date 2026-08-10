import assert from 'node:assert/strict';
import {
  isActorBranchTechnician,
  isAssignableBranchTechnicianId,
  resolveTechnicianIdForJobAssignment,
} from '../modules/repair/lib/repairTechnicianAssignment.ts';

const techs = [
  { id: 'emp-1', userId: 'uid-1', name: 'فني ١' },
  { id: 'emp-2', name: 'فني بدون حساب' },
];

assert.deepEqual(
  resolveTechnicianIdForJobAssignment({
    selectedBranchTechnicianId: 'emp-1',
    branchTechnicians: techs,
  }),
  { assignId: 'uid-1', hasLinkedUser: true },
);

assert.deepEqual(
  resolveTechnicianIdForJobAssignment({
    selectedBranchTechnicianId: 'uid-1',
    branchTechnicians: techs,
  }),
  { assignId: 'uid-1', hasLinkedUser: true },
);

assert.deepEqual(
  resolveTechnicianIdForJobAssignment({
    selectedBranchTechnicianId: 'emp-2',
    branchTechnicians: techs,
  }),
  { assignId: 'emp-2', hasLinkedUser: false },
);

assert.deepEqual(
  resolveTechnicianIdForJobAssignment({
    selectedBranchTechnicianId: '',
    branchTechnicians: techs,
  }),
  { assignId: '', hasLinkedUser: false },
);

assert.equal(
  isActorBranchTechnician({
    actorUserId: 'uid-1',
    actorEmployeeId: null,
    branchTechnicians: techs,
  }),
  true,
);

assert.equal(
  isActorBranchTechnician({
    actorUserId: 'reception-uid',
    actorEmployeeId: 'reception-emp',
    branchTechnicians: techs,
  }),
  false,
);

assert.equal(
  isActorBranchTechnician({
    actorUserId: null,
    actorEmployeeId: 'emp-2',
    branchTechnicians: techs,
  }),
  true,
);

assert.equal(
  isActorBranchTechnician({
    actorUserId: '',
    actorEmployeeId: '',
    branchTechnicians: techs,
  }),
  false,
);

assert.equal(
  isAssignableBranchTechnicianId({
    assigneeId: '',
    branchTechnicianIds: ['emp-1', 'uid-1'],
  }),
  true,
);

assert.equal(
  isAssignableBranchTechnicianId({
    assigneeId: 'uid-1',
    originalId: 'emp-1',
    linkedEmployeeId: 'emp-1',
    branchTechnicianIds: ['emp-1'],
  }),
  true,
);

assert.equal(
  isAssignableBranchTechnicianId({
    assigneeId: 'reception-uid',
    originalId: 'reception-uid',
    linkedEmployeeId: 'reception-emp',
    branchTechnicianIds: ['emp-1', 'uid-1'],
  }),
  false,
);

assert.equal(
  isAssignableBranchTechnicianId({
    assigneeId: 'uid-1',
    branchTechnicianIds: [],
  }),
  false,
);

console.log('repair-technician-assignment tests passed');

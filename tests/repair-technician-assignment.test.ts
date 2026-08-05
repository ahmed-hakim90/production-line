import assert from 'node:assert/strict';
import { resolveTechnicianIdForJobAssignment } from '../modules/repair/lib/repairTechnicianAssignment.ts';

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

console.log('repair-technician-assignment tests passed');

import assert from 'node:assert/strict';
import {
  jobHasTechnicianDiagnosis,
  resolveAssignmentStatusPatch,
  statusAfterTechnicianAssign,
  statusAfterTechnicianUnassign,
} from '../modules/repair/lib/repairAssignmentStatus.ts';
import {
  jobHasTechnicianDiagnosis as jobHasTechnicianDiagnosisFn,
  resolveAssignmentStatusPatch as resolveAssignmentStatusPatchFn,
  statusAfterTechnicianAssign as statusAfterTechnicianAssignFn,
  statusAfterTechnicianUnassign as statusAfterTechnicianUnassignFn,
} from '../functions/src/repairAssignmentStatus.ts';

/** Client + Functions mirrors must keep identical assign/unassign status behavior. */
const assignCases = ['received', 'inspection', 'diagnosing', 'repairing', 'ready', 'delivered', ''];
for (const status of assignCases) {
  assert.equal(
    statusAfterTechnicianAssign(status),
    statusAfterTechnicianAssignFn(status),
    `assign status mismatch for ${status || '(empty)'}`,
  );
}

const unassignCases: Array<{ status: string; hasDiagnosis: boolean }> = [
  { status: 'diagnosing', hasDiagnosis: false },
  { status: 'diagnosing', hasDiagnosis: true },
  { status: 'repairing', hasDiagnosis: false },
  { status: 'received', hasDiagnosis: false },
  { status: 'inspection', hasDiagnosis: false },
];
for (const row of unassignCases) {
  assert.equal(
    statusAfterTechnicianUnassign({
      currentStatus: row.status,
      hasTechnicianDiagnosis: row.hasDiagnosis,
    }),
    statusAfterTechnicianUnassignFn({
      currentStatus: row.status,
      hasTechnicianDiagnosis: row.hasDiagnosis,
    }),
    `unassign mismatch for ${row.status} diagnosis=${row.hasDiagnosis}`,
  );
}

assert.equal(
  jobHasTechnicianDiagnosis({ jobProducts: [{ technicianDiagnosis: 'x' }] }),
  jobHasTechnicianDiagnosisFn({ jobProducts: [{ technicianDiagnosis: 'x' }] }),
);
assert.equal(
  resolveAssignmentStatusPatch({ action: 'assign', currentStatus: 'received' }),
  resolveAssignmentStatusPatchFn({ action: 'assign', currentStatus: 'received' }),
);
assert.equal(
  resolveAssignmentStatusPatch({
    action: 'unassign',
    currentStatus: 'diagnosing',
    jobProducts: [{ technicianDiagnosis: '' }],
  }),
  resolveAssignmentStatusPatchFn({
    action: 'unassign',
    currentStatus: 'diagnosing',
    jobProducts: [{ technicianDiagnosis: '' }],
  }),
);

console.log('repair-assignment-status-sync.test.ts: ok');

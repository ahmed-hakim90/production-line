import assert from 'node:assert/strict';
import {
  jobHasTechnicianDiagnosis,
  resolveAssignmentStatusPatch,
  statusAfterTechnicianAssign,
  statusAfterTechnicianUnassign,
} from '../modules/repair/lib/repairAssignmentStatus.ts';

assert.equal(statusAfterTechnicianAssign('received'), 'diagnosing');
assert.equal(statusAfterTechnicianAssign('inspection'), null); // legacy alias = diagnosing already
assert.equal(statusAfterTechnicianAssign('diagnosing'), null);
assert.equal(statusAfterTechnicianAssign('repairing'), null);
assert.equal(statusAfterTechnicianAssign('ready'), null);

assert.equal(
  statusAfterTechnicianUnassign({ currentStatus: 'diagnosing', hasTechnicianDiagnosis: false }),
  'received',
);
assert.equal(
  statusAfterTechnicianUnassign({ currentStatus: 'diagnosing', hasTechnicianDiagnosis: true }),
  null,
);
assert.equal(
  statusAfterTechnicianUnassign({ currentStatus: 'repairing', hasTechnicianDiagnosis: false }),
  null,
);

assert.equal(
  jobHasTechnicianDiagnosis({
    jobProducts: [{ technicianDiagnosis: '' }, { technicianDiagnosis: '  ' }],
  }),
  false,
);
assert.equal(
  jobHasTechnicianDiagnosis({
    jobProducts: [{ technicianDiagnosis: 'عطل لوحة' }],
  }),
  true,
);

assert.equal(
  resolveAssignmentStatusPatch({ action: 'assign', currentStatus: 'received' }),
  'diagnosing',
);
assert.equal(
  resolveAssignmentStatusPatch({
    action: 'unassign',
    currentStatus: 'diagnosing',
    jobProducts: [{ technicianDiagnosis: '' }],
  }),
  'received',
);
assert.equal(
  resolveAssignmentStatusPatch({
    action: 'unassign',
    currentStatus: 'diagnosing',
    jobProducts: [{ technicianDiagnosis: 'تم الفحص' }],
  }),
  null,
);

console.log('repair-assignment-status.test.ts: ok');

import assert from 'node:assert/strict';
import { decideTechnicianQrClaim } from '../functions/src/repairTechnicianClaimPolicy.ts';

const base = { isClosed: false, status: 'received', currentTechnicianId: '',
  actorUid: 'user-tech', actorIds: ['user-tech', 'employee-tech'] };

assert.equal(decideTechnicianQrClaim(base), 'claim');
assert.equal(decideTechnicianQrClaim({ ...base, currentTechnicianId: 'user-tech' }), 'already_self');
assert.equal(decideTechnicianQrClaim({ ...base, currentTechnicianId: 'employee-tech' }), 'claim');
assert.equal(decideTechnicianQrClaim({ ...base, currentTechnicianId: 'other-tech' }), 'assigned_other');
assert.equal(decideTechnicianQrClaim({ ...base, status: 'ready' }), 'terminal');
assert.equal(decideTechnicianQrClaim({ ...base, status: 'delivered' }), 'terminal');
assert.equal(decideTechnicianQrClaim({ ...base, isClosed: true }), 'terminal');
// Closed/terminal + assigned to this tech → reopen for view (no new claim).
assert.equal(
  decideTechnicianQrClaim({ ...base, isClosed: true, currentTechnicianId: 'user-tech' }),
  'already_self',
);
assert.equal(
  decideTechnicianQrClaim({ ...base, status: 'delivered', currentTechnicianId: 'employee-tech' }),
  'already_self',
);
assert.equal(
  decideTechnicianQrClaim({ ...base, isClosed: true, currentTechnicianId: 'other-tech' }),
  'terminal',
);

console.log('repair-technician-qr-claim.test.ts: ok');

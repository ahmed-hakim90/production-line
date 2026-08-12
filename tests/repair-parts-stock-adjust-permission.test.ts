import assert from 'node:assert/strict';
import { checkPermission } from '../utils/permissions.ts';

{
  // Typical center manager: parts manage only — no manual stock buttons.
  assert.equal(
    checkPermission({ 'repair.parts.manage': true }, 'repair.parts.stockAdjust'),
    false,
  );
}

{
  assert.equal(
    checkPermission({ 'repair.parts.stockAdjust': true }, 'repair.parts.stockAdjust'),
    true,
  );
  assert.equal(
    checkPermission({ 'inventory.counts.manage': true }, 'repair.parts.stockAdjust'),
    true,
  );
  assert.equal(
    checkPermission({ 'repair.adminDashboard.view': true }, 'repair.parts.stockAdjust'),
    true,
  );
  assert.equal(
    checkPermission({ 'repair.branches.manage': true }, 'repair.parts.stockAdjust'),
    true,
  );
}

console.log('repair-parts-stock-adjust-permission.test.ts: ok');

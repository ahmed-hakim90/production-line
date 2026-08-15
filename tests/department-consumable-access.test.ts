import assert from 'node:assert/strict';
import {
  actorHasDepartmentConsumableAccess,
  resolveConsumableActorRoleKey,
} from '../functions/src/departmentConsumableAccess.ts';

function testRoleKeyFromName() {
  assert.equal(
    resolveConsumableActorRoleKey({ name: 'مسؤول مخزن المستلزمات' }),
    'materials_warehouse',
  );
  assert.equal(
    resolveConsumableActorRoleKey({ roleKey: 'factory_manager', name: 'مسؤول مخزن المستلزمات' }),
    'factory_manager',
  );
}

function testMaterialsWarehouseCanIssueWithoutExactKeys() {
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: 'materials_warehouse', permissions: { 'inventory.view': true } },
      ['departmentConsumables.create', 'inventory.transactions.create'],
    ),
    true,
  );
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: 'inventory_viewer', permissions: { 'inventory.view': true } },
      ['departmentConsumables.create', 'inventory.transactions.create'],
    ),
    false,
  );
}

function testCreateAliasFromInventoryTransactions() {
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: null, permissions: { 'inventory.transactions.create': true } },
      ['departmentConsumables.create'],
    ),
    true,
  );
}

testRoleKeyFromName();
testMaterialsWarehouseCanIssueWithoutExactKeys();
testCreateAliasFromInventoryTransactions();
console.log('department-consumable-access.test.ts: ok');

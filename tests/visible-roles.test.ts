import assert from 'node:assert/strict';
import {
  getVisibleRoles,
  getVisibleRolesForAssignment,
  resolveCanonicalRoleId,
} from '../modules/system/lib/visibleRoles.ts';
import type { FirestoreRole } from '../types.ts';

const roles: FirestoreRole[] = [
  {
    id: 'dup-admin-a',
    name: 'مدير النظام',
    roleKey: 'admin',
    color: '',
    permissions: { 'dashboard.view': true },
  },
  {
    id: 'dup-admin-b',
    name: 'مدير النظام',
    roleKey: 'admin',
    color: '',
    permissions: { 'dashboard.view': true, 'users.manage': true },
  },
  {
    id: 'custom-only',
    name: 'دور مخصص',
    color: '',
    permissions: { 'dashboard.view': true },
  },
];

const visible = getVisibleRoles(roles);
assert.equal(visible.length, 2);
assert.equal(visible.find((r) => r.name === 'مدير النظام')?.id, 'dup-admin-b');

assert.equal(resolveCanonicalRoleId('dup-admin-a', roles), 'dup-admin-b');

const forUser = getVisibleRolesForAssignment(roles, 'dup-admin-a');
assert.equal(forUser.find((r) => r.name === 'مدير النظام')?.id, 'dup-admin-a');

console.log('visible-roles.test.ts passed');

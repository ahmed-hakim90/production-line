import assert from 'node:assert/strict';
import {
  isNamedRepairOpsRole,
  isSystemOrFactoryChromeRole,
  resolveNamedRepairOpsPersona,
} from '../modules/repair/lib/repairRoleChrome.ts';

assert.equal(isSystemOrFactoryChromeRole({ roleKey: 'admin' }), true);
assert.equal(isSystemOrFactoryChromeRole({ roleName: 'مدير النظام' }), true);
assert.equal(isSystemOrFactoryChromeRole({ roleName: 'مدير المصنع' }), true);
assert.equal(isSystemOrFactoryChromeRole({ roleName: 'مدير الصيانة' }), false);

assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مدير الصيانة' }), 'admin');
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مدير مراكز' }), 'admin');
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مدير المراكز' }), 'admin');
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مسؤول الصيانة' }), 'reception');
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مسئول الصيانة' }), 'reception');
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مدير مركز' }), 'reception');
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'استقبال صيانة' }), 'reception');
assert.equal(resolveNamedRepairOpsPersona({ roleKey: 'repair_reception' }), 'reception');
assert.equal(
  resolveNamedRepairOpsPersona({ roleName: 'مسؤول مخزن مركز صيانة' }),
  'ops',
);
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'فني صيانة' }), null);
assert.equal(resolveNamedRepairOpsPersona({ roleName: 'مسؤول مخزن قطع الغيار المركزي' }), null);
assert.equal(isNamedRepairOpsRole({ roleName: 'مدير الصيانة' }), true);
assert.equal(isNamedRepairOpsRole({ roleName: 'فني صيانة' }), false);

console.log('repair-role-chrome.test.ts: ok');

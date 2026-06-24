import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

/**
 * Programmatic equivalent of Rules Playground checks for app bootstrap (users/{uid} read).
 * Isolated project id requires `emulators.singleProjectMode: false` in firebase.json.
 */
const projectId = 'demo-firestore-rules';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

const seed = async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set. Run: npm run test:rules');
  }
  if (!getAdminApps().length) {
    initAdminApp({ projectId });
  }
  const adb = getAdminFirestore();
  const set = (coll, id, data) => adb.collection(coll).doc(id).set(data);

  await set('roles', 'tenantA-admin-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.view': true,
      'repair.jobs.create': true,
      'repair.jobs.edit': true,
      'repair.jobs.delete': true,
      'repair.parts.view': true,
      'repair.parts.manage': true,
    },
  });
  await set('roles', 'tenantA-operator-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.view': true,
      'repair.parts.view': true,
    },
  });
  await set('roles', 'tenantA-hr-settings-role', {
    tenantId: 'tenantA',
    permissions: {
      'hrSettings.view': true,
      'hrSettings.edit': true,
    },
  });
  await set('roles', 'tenantA-leave-manager-role', {
    tenantId: 'tenantA',
    permissions: {
      'leave.view': true,
      'leave.manage': true,
    },
  });
  await set('roles', 'tenantB-admin-role', {
    tenantId: 'tenantB',
    permissions: {
      'repair.view': true,
      'repair.jobs.create': true,
    },
  });
  await set('users', 'userAAdmin', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-admin-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userAOperator', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-operator-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userAHrSettings', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-hr-settings-role',
  });
  await set('users', 'userALeaveManager', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-leave-manager-role',
  });
  await set('users', 'userBAdmin', {
    tenantId: 'tenantB',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantB-admin-role',
    repairBranchId: 'branchB',
    repairBranchIds: ['branchB'],
  });
  await set('products', 'tenantA_product', {
    tenantId: 'tenantA',
    name: 'A Product',
  });
  await set('products', 'tenantB_product', {
    tenantId: 'tenantB',
    name: 'B Product',
  });
  await set('repair_jobs', 'job_branchA', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    status: 'received',
  });
  await set('repair_jobs', 'job_branchB', {
    tenantId: 'tenantA',
    branchId: 'branchB',
    status: 'received',
  });
  await adb.collection('repair_jobs').doc('job_branchB').collection('service_events').doc('ev_branchB').set({
    tenantId: 'tenantA',
    branchId: 'branchB',
    jobId: 'job_branchB',
    at: new Date().toISOString(),
    actorUid: 'userB',
    actorName: 'Other',
    action: 'note',
    note: 'branch b',
  });
  await adb.collection('repair_jobs').doc('job_branchA').collection('service_events').doc('ev1').set({
    tenantId: 'tenantA',
    branchId: 'branchA',
    jobId: 'job_branchA',
    at: new Date().toISOString(),
    actorUid: 'userAAdmin',
    actorName: 'Admin',
    action: 'note',
    note: 'test event',
  });
  await set('repair_part_reservations', 'res_branchA', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    jobId: 'job_branchA',
    partId: 'part1',
    partName: 'قطعة تجريبية',
    quantity: 1,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await set('payroll_records', 'payrollA', {
    tenantId: 'tenantA',
    netSalary: 1000,
  });
  await set('hr_config_modules', 'leave', {
    tenantId: 'tenantA',
    configVersion: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'seed',
    defaultAnnualBalance: 21,
    defaultSickBalance: 14,
    defaultEmergencyBalance: 3,
    leaveTypes: [],
  });
};

await seed();

// 0–1) userService.get bootstrap + tenant isolation (compat Firestore from rules-unit-testing only).
{
  const userAAdminDb = testEnv.authenticatedContext('userAAdmin').firestore();
  await assertSucceeds(userAAdminDb.collection('users').doc('userAAdmin').get());
  await assertFails(userAAdminDb.collection('users').doc('userAOperator').get());

  const anonDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(anonDb.collection('users').doc('userAAdmin').get());

  await assertSucceeds(userAAdminDb.collection('products').doc('tenantA_product').get());
  await assertFails(userAAdminDb.collection('products').doc('tenantB_product').get());
}

// 2) Role restrictions: operator cannot access payroll.
{
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertFails(operatorDb.collection('payroll_records').doc('payrollA').get());
}

// 3) Repair branch restrictions: operator with branchA cannot read branchB job.
{
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertSucceeds(operatorDb.collection('repair_jobs').doc('job_branchA').get());
  await assertFails(operatorDb.collection('repair_jobs').doc('job_branchB').get());
}

// 4) Repair job service_events + part reservations respect branch scope.
{
  const adminDb = testEnv.authenticatedContext('userAAdmin').firestore();
  await assertSucceeds(
    adminDb.collection('repair_jobs').doc('job_branchA').collection('service_events').doc('ev1').get(),
  );
  await assertSucceeds(adminDb.collection('repair_part_reservations').doc('res_branchA').get());
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertSucceeds(
    operatorDb.collection('repair_jobs').doc('job_branchA').collection('service_events').doc('ev1').get(),
  );
  await assertFails(
    operatorDb.collection('repair_jobs').doc('job_branchB').collection('service_events').doc('ev_branchB').get(),
  );
}

// 5) Production report create transaction may read/write the unique guard doc.
{
  const adminDb = testEnv.authenticatedContext('userAAdmin').firestore();
  const uniqueId = '2026-05-14__line-a__emp-a__product-a__finished_product';
  await assertSucceeds(adminDb.runTransaction(async (tx) => {
    const uniqueRef = adminDb.collection('production_report_uniques').doc(uniqueId);
    const reportRef = adminDb.collection('production_reports').doc('reportA');
    const uniqueSnap = await tx.get(uniqueRef);
    if (uniqueSnap.exists) throw new Error('unexpected duplicate');
    tx.set(reportRef, {
      tenantId: 'tenantA',
      reportCode: 'PR-2026-0001',
      date: '2026-05-14',
      lineId: 'line-a',
      employeeId: 'emp-a',
      productId: 'product-a',
      reportType: 'finished_product',
      quantityProduced: 10,
      workersCount: 1,
      workHours: 8,
      createdAt: new Date(),
    });
    tx.set(uniqueRef, {
      tenantId: 'tenantA',
      reportId: reportRef.id,
      date: '2026-05-14',
      lineId: 'line-a',
      employeeId: 'emp-a',
      productId: 'product-a',
      reportType: 'finished_product',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }));

  await assertFails(adminDb.collection('production_report_uniques').doc('tenantB-unique').set({
    tenantId: 'tenantB',
    reportId: 'foreign-report',
  }));
}

// 6) HR leave type config writes require tenant scope and HR config/leave-management permission.
{
  const hrSettingsDb = testEnv.authenticatedContext('userAHrSettings').firestore();
  const leaveManagerDb = testEnv.authenticatedContext('userALeaveManager').firestore();
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();

  const leaveConfig = {
    tenantId: 'tenantA',
    configVersion: 2,
    updatedAt: new Date().toISOString(),
    updatedBy: 'HR Settings',
    defaultAnnualBalance: 21,
    defaultSickBalance: 14,
    defaultEmergencyBalance: 3,
    leaveTypes: [{
      type: 'custom_leave_1',
      labelAr: 'إجازة خاصة',
      defaultBalance: 0,
      salaryImpact: 'unpaid',
      deductPercent: 100,
      requiresApproval: true,
      maxConsecutiveDays: 0,
      carryOverAllowed: false,
      maxCarryOverDays: 0,
    }],
  };

  await assertSucceeds(hrSettingsDb.collection('hr_config_modules').doc('leave').set(leaveConfig));
  await assertSucceeds(leaveManagerDb.collection('hr_config_modules').doc('leave').set({
    ...leaveConfig,
    configVersion: 3,
    updatedBy: 'Leave Manager',
  }));
  await assertFails(operatorDb.collection('hr_config_modules').doc('leave').set({
    ...leaveConfig,
    configVersion: 4,
    updatedBy: 'Operator',
  }));
  await assertFails(leaveManagerDb.collection('hr_config_modules').doc('leave').set({
    ...leaveConfig,
    tenantId: 'tenantB',
    configVersion: 5,
  }));
  await assertFails(leaveManagerDb.collection('hr_config_modules').doc('general').set({
    tenantId: 'tenantA',
    configVersion: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Leave Manager',
  }));

  await assertSucceeds(leaveManagerDb.collection('hr_config_audit_logs').add({
    tenantId: 'tenantA',
    module: 'leave',
    action: 'update',
    previousVersion: 2,
    newVersion: 3,
    changedFields: ['leaveTypes'],
    performedBy: 'Leave Manager',
    timestamp: new Date().toISOString(),
    details: 'updated leave types',
  }));
  await assertFails(leaveManagerDb.collection('hr_config_audit_logs').add({
    module: 'leave',
    action: 'update',
    previousVersion: 3,
    newVersion: 4,
    changedFields: ['leaveTypes'],
    performedBy: 'Leave Manager',
    timestamp: new Date().toISOString(),
    details: 'missing tenant',
  }));
}

await testEnv.cleanup();
assert.ok(true);

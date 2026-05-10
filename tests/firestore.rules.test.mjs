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
    roleId: 'tenantA-admin-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userAOperator', {
    tenantId: 'tenantA',
    isActive: true,
    roleId: 'tenantA-operator-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userBAdmin', {
    tenantId: 'tenantB',
    isActive: true,
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

await testEnv.cleanup();
assert.ok(true);

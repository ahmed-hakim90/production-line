import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = `erp-rules-${Date.now()}`;
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

const seed = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'roles', 'tenantA-admin-role'), {
      tenantId: 'tenantA',
      permissions: {
        'repair.view': true,
        'repair.jobs.create': true,
        'repair.jobs.edit': true,
        'repair.jobs.delete': true,
      },
    });
    await setDoc(doc(db, 'roles', 'tenantA-operator-role'), {
      tenantId: 'tenantA',
      permissions: {
        'repair.view': true,
      },
    });
    await setDoc(doc(db, 'roles', 'tenantB-admin-role'), {
      tenantId: 'tenantB',
      permissions: {
        'repair.view': true,
        'repair.jobs.create': true,
      },
    });
    await setDoc(doc(db, 'users', 'userAAdmin'), {
      tenantId: 'tenantA',
      isActive: true,
      roleId: 'tenantA-admin-role',
      repairBranchId: 'branchA',
      repairBranchIds: ['branchA'],
    });
    await setDoc(doc(db, 'users', 'userAOperator'), {
      tenantId: 'tenantA',
      isActive: true,
      roleId: 'tenantA-operator-role',
      repairBranchId: 'branchA',
      repairBranchIds: ['branchA'],
    });
    await setDoc(doc(db, 'users', 'userBAdmin'), {
      tenantId: 'tenantB',
      isActive: true,
      roleId: 'tenantB-admin-role',
      repairBranchId: 'branchB',
      repairBranchIds: ['branchB'],
    });
    await setDoc(doc(db, 'products', 'tenantA_product'), {
      tenantId: 'tenantA',
      name: 'A Product',
    });
    await setDoc(doc(db, 'products', 'tenantB_product'), {
      tenantId: 'tenantB',
      name: 'B Product',
    });
    await setDoc(doc(db, 'repair_jobs', 'job_branchA'), {
      tenantId: 'tenantA',
      branchId: 'branchA',
      status: 'received',
    });
    await setDoc(doc(db, 'repair_jobs', 'job_branchB'), {
      tenantId: 'tenantA',
      branchId: 'branchB',
      status: 'received',
    });
    await setDoc(doc(db, 'payroll_records', 'payrollA'), {
      tenantId: 'tenantA',
      netSalary: 1000,
    });
  });
};

await seed();

// 1) Tenant isolation: A user cannot read Tenant B.
{
  const userATenantDb = testEnv.authenticatedContext('userAAdmin').firestore();
  await assertSucceeds(getDoc(doc(userATenantDb, 'products', 'tenantA_product')));
  await assertFails(getDoc(doc(userATenantDb, 'products', 'tenantB_product')));
}

// 2) Role restrictions: operator cannot access payroll.
{
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertFails(getDoc(doc(operatorDb, 'payroll_records', 'payrollA')));
}

// 3) Repair branch restrictions: operator with branchA cannot read branchB job.
{
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertSucceeds(getDoc(doc(operatorDb, 'repair_jobs', 'job_branchA')));
  await assertFails(getDoc(doc(operatorDb, 'repair_jobs', 'job_branchB')));
}

await testEnv.cleanup();
assert.ok(true);

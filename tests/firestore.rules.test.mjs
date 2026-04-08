import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteField, doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

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
    await setDoc(doc(db, 'roles', 'tenantA-od-role'), {
      tenantId: 'tenantA',
      permissions: {
        'onlineDispatch.view': true,
        'onlineDispatch.manage': true,
        'onlineDispatch.handoffToWarehouse': true,
        'onlineDispatch.handoffToPost': true,
      },
    });
    await setDoc(doc(db, 'users', 'userAOnlineDispatch'), {
      tenantId: 'tenantA',
      isActive: true,
      roleId: 'tenantA-od-role',
    });
    await setDoc(doc(db, 'roles', 'tenantA-od-postonly'), {
      tenantId: 'tenantA',
      permissions: {
        'onlineDispatch.view': true,
        'onlineDispatch.handoffToPost': true,
      },
    });
    await setDoc(doc(db, 'users', 'userAODPostOnly'), {
      tenantId: 'tenantA',
      isActive: true,
      roleId: 'tenantA-od-postonly',
    });
    await setDoc(doc(db, 'roles', 'tenantA-od-warehouse-only'), {
      tenantId: 'tenantA',
      permissions: {
        'onlineDispatch.view': true,
        'onlineDispatch.handoffToWarehouse': true,
      },
    });
    await setDoc(doc(db, 'users', 'userAODWarehouseOnly'), {
      tenantId: 'tenantA',
      isActive: true,
      roleId: 'tenantA-od-warehouse-only',
    });
    await setDoc(doc(db, 'online_dispatch_shipments', 'odRevert'), {
      tenantId: 'tenantA',
      barcode: 'BOSTA_9999999999',
      status: 'at_warehouse',
      handedToWarehouseAt: Timestamp.now(),
      handedToWarehouseByUid: 'userAOnlineDispatch',
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

// 4) Online dispatch: operator cannot read; authorized user can create and transition.
{
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertFails(getDoc(doc(operatorDb, 'online_dispatch_shipments', 'od1')));

  const odDb = testEnv.authenticatedContext('userAOnlineDispatch').firestore();
  await assertSucceeds(
    setDoc(doc(odDb, 'online_dispatch_shipments', 'od1'), {
      tenantId: 'tenantA',
      barcode: 'BOSTA_0000000001',
      status: 'pending',
      createdAt: Timestamp.now(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(odDb, 'online_dispatch_shipments', 'od1'), {
      status: 'at_warehouse',
      handedToWarehouseAt: Timestamp.now(),
      handedToWarehouseByUid: 'userAOnlineDispatch',
    }),
  );
  await assertSucceeds(
    updateDoc(doc(odDb, 'online_dispatch_shipments', 'od1'), {
      status: 'handed_to_post',
      handedToPostAt: Timestamp.now(),
      handedToPostByUid: 'userAOnlineDispatch',
    }),
  );
}

// 5) Revert first warehouse handoff: at_warehouse -> pending
{
  const odDb = testEnv.authenticatedContext('userAOnlineDispatch').firestore();
  await assertSucceeds(
    updateDoc(doc(odDb, 'online_dispatch_shipments', 'odRevert'), {
      status: 'pending',
      handedToWarehouseAt: deleteField(),
      handedToWarehouseByUid: deleteField(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(odDb, 'online_dispatch_shipments', 'odRevert'), {
      status: 'at_warehouse',
      handedToWarehouseAt: Timestamp.now(),
      handedToWarehouseByUid: 'userAOnlineDispatch',
    }),
  );
  const postOnlyDb = testEnv.authenticatedContext('userAODPostOnly').firestore();
  await assertFails(
    updateDoc(doc(postOnlyDb, 'online_dispatch_shipments', 'odRevert'), {
      status: 'pending',
      handedToWarehouseAt: deleteField(),
      handedToWarehouseByUid: deleteField(),
    }),
  );
}

// 6) Cannot revert from handed_to_post to pending
{
  const odDb = testEnv.authenticatedContext('userAOnlineDispatch').firestore();
  await assertFails(
    updateDoc(doc(odDb, 'online_dispatch_shipments', 'od1'), {
      status: 'pending',
      handedToWarehouseAt: deleteField(),
      handedToWarehouseByUid: deleteField(),
      handedToPostAt: deleteField(),
      handedToPostByUid: deleteField(),
    }),
  );
}

// 7) Warehouse handoff can create shipment at at_warehouse (first scan); cannot create pending
{
  const whDb = testEnv.authenticatedContext('userAODWarehouseOnly').firestore();
  await assertSucceeds(
    setDoc(doc(whDb, 'online_dispatch_shipments', 'odWhFirstScan'), {
      tenantId: 'tenantA',
      barcode: 'SCAN_FIRST_001',
      status: 'at_warehouse',
      createdAt: Timestamp.now(),
      handedToWarehouseAt: Timestamp.now(),
      handedToWarehouseByUid: 'userAODWarehouseOnly',
    }),
  );
  await assertFails(
    setDoc(doc(whDb, 'online_dispatch_shipments', 'odWhPendingBad'), {
      tenantId: 'tenantA',
      barcode: 'SCAN_PENDING_BAD',
      status: 'pending',
      createdAt: Timestamp.now(),
    }),
  );
}

await testEnv.cleanup();
assert.ok(true);

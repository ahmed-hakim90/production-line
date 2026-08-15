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
      'repair.callCenter.viewAll': true,
      'repair.customerRequests.assign': true,
      'repair.custody.view': true,
      'repair.replacements.approve': true,
      'products.view': true,
      'products.create': true,
      'products.edit': true,
      'payroll.accounts.disburse': true,
    },
  });
  await set('roles', 'tenantA-users-manager-role', {
    tenantId: 'tenantA',
    permissions: {
      'users.manage': true,
      'inventory.view': true,
    },
  });
  await set('roles', 'tenantA-operator-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.view': true,
      'repair.parts.view': true,
    },
  });
  await set('roles', 'tenantA-repair-treasury-admin-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.treasury.view': true,
      'repair.treasury.manage': true,
      'repair.branches.manage': true,
    },
  });
  await set('roles', 'tenantA-repair-reception-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.view': true,
      'repair.jobs.reception': true,
      'repair.finance.view': true,
      'repair.payments.view': true,
      'repair.customerRequests.view': true,
      'repair.customerRequests.receive': true,
      'repair.custody.view': true,
      'repair.custody.handover': true,
      'repair.replacements.view': true,
      'repair.replacements.deliver': true,
    },
  });
  await set('roles', 'tenantA-repair-technician-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.jobs.technician': true,
      'repair.parts.request': true,
    },
  });
  await set('roles', 'tenantA-settings-role', {
    tenantId: 'tenantA',
    permissions: {
      'settings.view': true,
      'settings.edit': true,
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
  await set('roles', 'tenantA-supervisor-request-role', {
    tenantId: 'tenantA',
    permissions: {
      'employeeDashboard.view': true,
      'quickAction.view': true,
      'reports.create': true,
      'leave.create': true,
      'production.workerReports.view': true,
    },
  });
  await set('roles', 'tenantA-approval-manager-role', {
    tenantId: 'tenantA',
    permissions: {
      'approval.view': true,
    },
  });
  await set('roles', 'tenantA-approval-hr-role', {
    tenantId: 'tenantA',
    permissions: {
      'approval.view': true,
      'approval.manage': true,
      'approval.delegate': true,
    },
  });
  await set('roles', 'tenantA-packaging-role', {
    tenantId: 'tenantA',
    permissions: {
      'productionHandover.approve': true,
      'inventory.view': true,
    },
  });
  await set('roles', 'tenantA-inventory-viewer-role', {
    tenantId: 'tenantA',
    permissions: {
      'inventory.view': true,
    },
  });
  await set('roles', 'tenantA-inventory-writer-role', {
    tenantId: 'tenantA',
    permissions: {
      'inventory.view': true,
      'inventory.transactions.create': true,
      'inventory.items.manage': true,
      'inventory.transfers.approve': true,
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
  await set('users', 'userAPackaging', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-packaging-role',
  });
  await set('users', 'userAWarehouseBound', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-inventory-viewer-role',
    inventoryWarehouseId: 'whA',
  });
  await set('users', 'userASparePartsCentral', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-inventory-viewer-role',
    inventoryWarehouseId: 'whCentralSp',
  });
  await set('users', 'userAMaintCenterBound', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-inventory-viewer-role',
    inventoryWarehouseId: 'whMaintCenter',
  });
  await set('users', 'userACenterParts', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-operator-role',
    inventoryWarehouseId: 'whA',
  });
  await set('users', 'userAInventoryWriter', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-inventory-writer-role',
    inventoryWarehouseId: 'whA',
  });
  await set('users', 'userAUsersManager', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-users-manager-role',
  });
  await set('users', 'userAOperator', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-operator-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userARepairTreasuryAdmin', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-repair-treasury-admin-role',
  });
  await set('users', 'userAReception', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-repair-reception-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userATechnician', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-repair-technician-role',
    repairBranchId: 'branchA',
    repairBranchIds: ['branchA'],
  });
  await set('users', 'userAObserver', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-operator-role',
  });
  await set('users', 'userASettings', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-settings-role',
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
  await set('users', 'userASupervisor', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-supervisor-request-role',
  });
  await set('users', 'userAManager', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-approval-manager-role',
  });
  await set('users', 'userAHrApprover', {
    tenantId: 'tenantA',
    isActive: true,
    isSuperAdmin: false,
    roleId: 'tenantA-approval-hr-role',
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
  await set('system_settings', 'tenantA', {
    tenantId: 'tenantA',
    planSettings: {
      productionRequestFirstApproverEmployeeId: '',
      productionRequestFinalApproverEmployeeId: '',
      productionRequestObserverEmployeeIds: ['emp-observer-a'],
      productionRequestObserverUserIds: ['userAObserver'],
    },
  });
  await set('production_workers', 'workerA', {
    tenantId: 'tenantA',
    employeeId: 'emp-worker-a',
    name: 'Worker A',
    code: 'WA',
    isActive: true,
    workerType: 'production',
  });
  await set('production_line_worker_assignments', 'workerLineA', {
    tenantId: 'tenantA',
    workerId: 'workerA',
    employeeId: 'emp-worker-a',
    lineId: 'line-a',
    isActive: true,
    startDate: '2026-06-01',
  });
  await set('repair_jobs', 'job_branchA', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    status: 'received',
    technicianId: 'userATechnician',
    customerPhone: '01000000000',
    finalCost: 100,
  });
  await set('repair_jobs', 'job_unassigned_branchA', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    status: 'received',
    technicianId: '',
    customerPhone: '01000000002',
    finalCost: 50,
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
  await set('repair_job_financials', 'job_branchA', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    jobId: 'job_branchA',
    netAmount: 100,
    paidAmount: 0,
    balanceDue: 100,
  });
  await set('repair_payment_authorizations', 'job_branchA__r1', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    jobId: 'job_branchA',
    status: 'approved',
  });
  await set('repair_branches', 'branchA', {
    tenantId: 'tenantA',
    name: 'فرع A',
    warehouseId: 'whA',
    // Dual-write like production: employee id + Auth uid for pl_isTechnicianAssignedToBranch.
    technicianIds: ['emp-tech-a', 'userATechnician'],
  });
  await set('repair_branches', 'branchB', {
    tenantId: 'tenantA',
    name: 'فرع B',
    warehouseId: 'whB',
    technicianIds: [],
  });
  await set('customer_service_requests', 'request_branchA', {
    tenantId: 'tenantA', branchId: 'branchA', customerId: 'customerA', status: 'assigned',
  });
  await set('customer_service_requests', 'request_branchB', {
    tenantId: 'tenantA', branchId: 'branchB', customerId: 'customerA', status: 'assigned',
  });
  await set('repair_custody_records', 'custody_branchA', {
    tenantId: 'tenantA', branchId: 'branchA', jobId: 'job_branchA', receivedQuantity: 1,
  });
  await set('repair_custody_records', 'custody_branchB', {
    tenantId: 'tenantA', branchId: 'branchB', jobId: 'job_branchB', receivedQuantity: 1,
  });
  await set('repair_replacement_requests', 'replacement_branchA', {
    tenantId: 'tenantA', branchId: 'branchA', jobId: 'job_branchA', status: 'pending_approval',
  });
  await set('repair_replacement_requests', 'replacement_branchB', {
    tenantId: 'tenantA', branchId: 'branchB', jobId: 'job_branchB', status: 'pending_approval',
  });
  await set('customer_portal_credentials', 'tenantA__customerA', {
    tenantId: 'tenantA', customerId: 'customerA', pinHash: 'secret', salt: 'secret',
  });
  await set('repair_spare_parts', 'part_branchA', {
    tenantId: 'tenantA',
    branchId: 'branchA',
    name: 'قطعة A',
    code: 'SP-001',
    createdAt: new Date().toISOString(),
  });
  await set('repair_spare_parts', 'part_branchB', {
    tenantId: 'tenantA',
    branchId: 'branchB',
    name: 'قطعة B',
    code: 'SP-002',
    createdAt: new Date().toISOString(),
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
  await assertSucceeds(userAAdminDb.collection('products').doc('tenantA_product').update({
    searchPrefixes: Array.from({ length: 80 }, (_, index) => `p${index}`),
  }));
  await assertFails(userAAdminDb.collection('products').doc('tenantA_product').update({
    searchPrefixes: Array.from({ length: 81 }, (_, index) => `p${index}`),
  }));
  await assertSucceeds(userAAdminDb.collection('users').doc('userAAdmin').update({
    searchPrefixes: Array.from({ length: 80 }, (_, index) => `u${index}`),
  }));
  await assertFails(userAAdminDb.collection('users').doc('userAAdmin').update({
    searchPrefixes: Array.from({ length: 81 }, (_, index) => `u${index}`),
  }));
  await assertSucceeds(userAAdminDb.collection('materials').doc('tenantA_material').set({
    tenantId: 'tenantA',
    name: 'مادة اختبار',
    code: 'MAT-1',
    searchPrefixes: Array.from({ length: 80 }, (_, index) => `m${index}`),
  }));
  await assertFails(userAAdminDb.collection('materials').doc('tenantA_material').update({
    searchPrefixes: Array.from({ length: 81 }, (_, index) => `m${index}`),
  }));
}

// 1b) System settings writes are limited to settings admins.
{
  const settingsDb = testEnv.authenticatedContext('userASettings').firestore();
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();

  await assertSucceeds(operatorDb.collection('system_settings').doc('tenantA').get());
  await assertSucceeds(settingsDb.collection('system_settings').doc('tenantA').set({
    tenantId: 'tenantA',
    planSettings: {
      productionRequestFirstApproverEmployeeId: 'emp-manager-a',
      productionRequestFinalApproverEmployeeId: 'emp-hr-a',
    },
  }, { merge: true }));
  await assertFails(operatorDb.collection('system_settings').doc('tenantA').set({
    tenantId: 'tenantA',
    planSettings: {
      productionRequestFirstApproverEmployeeId: 'emp-operator-a',
    },
  }, { merge: true }));
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

// 4a) Technician uses a sanitized callable: raw commercial and financial docs are never readable.
{
  const technicianDb = testEnv.authenticatedContext('userATechnician').firestore();
  const receptionDb = testEnv.authenticatedContext('userAReception').firestore();
  await assertFails(technicianDb.collection('repair_jobs').doc('job_branchA').get());
  await assertFails(technicianDb.collection('repair_job_financials').doc('job_branchA').get());
  await assertFails(technicianDb.collection('repair_payment_authorizations').doc('job_branchA__r1').get());
  // Assigned technician may list/get workshop service events under their job.
  await assertSucceeds(
    technicianDb.collection('repair_jobs').doc('job_branchA').collection('service_events').doc('ev1').get(),
  );
  await assertSucceeds(
    technicianDb.collection('repair_jobs').doc('job_branchA').collection('service_events').orderBy('at', 'desc').get(),
  );
  await assertFails(
    technicianDb.collection('repair_jobs').doc('job_branchB').collection('service_events').doc('ev_branchB').get(),
  );
  await assertSucceeds(receptionDb.collection('repair_jobs').doc('job_branchA').get());
  await assertSucceeds(receptionDb.collection('repair_job_financials').doc('job_branchA').get());
  await assertSucceeds(receptionDb.collection('repair_payment_authorizations').doc('job_branchA__r1').get());
}

// 4a2) Reception may assign a branch technician or clear assignment, but not self-assign via «إسناد لي».
{
  const receptionDb = testEnv.authenticatedContext('userAReception').firestore();
  const jobRef = receptionDb.collection('repair_jobs').doc('job_unassigned_branchA');

  await assertSucceeds(jobRef.set({
    tenantId: 'tenantA',
    branchId: 'branchA',
    status: 'received',
    technicianId: 'userATechnician',
    customerPhone: '01000000002',
    finalCost: 50,
    assignedAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }, { merge: true }));

  await assertFails(jobRef.set({
    tenantId: 'tenantA',
    branchId: 'branchA',
    status: 'received',
    technicianId: 'userAReception',
    customerPhone: '01000000002',
    finalCost: 50,
    assignedAt: '2026-08-10T00:01:00.000Z',
    updatedAt: '2026-08-10T00:01:00.000Z',
  }, { merge: true }));

  await assertSucceeds(jobRef.set({
    tenantId: 'tenantA',
    branchId: 'branchA',
    status: 'received',
    technicianId: '',
    customerPhone: '01000000002',
    finalCost: 50,
    assignedAt: '',
    updatedAt: '2026-08-10T00:02:00.000Z',
  }, { merge: true }));
}

// 4b) Center warehouse bind (inventoryWarehouseId) grants spare-parts read for that branch only.
{
  const centerDb = testEnv.authenticatedContext('userACenterParts').firestore();
  await assertSucceeds(centerDb.collection('repair_spare_parts').doc('part_branchA').get());
  await assertFails(centerDb.collection('repair_spare_parts').doc('part_branchB').get());
  // Inventory-only bind without repair.parts.view still cannot read spare parts.
  const invOnlyDb = testEnv.authenticatedContext('userAWarehouseBound').firestore();
  await assertFails(invOnlyDb.collection('repair_spare_parts').doc('part_branchA').get());
}

// 4c) Portal operational records are branch isolated and server-owned; secrets are never client-readable.
{
  const adminDb = testEnv.authenticatedContext('userAAdmin').firestore();
  const receptionDb = testEnv.authenticatedContext('userAReception').firestore();
  const tenantBDb = testEnv.authenticatedContext('userBAdmin').firestore();
  const anonDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(adminDb.collection('customer_service_requests').doc('request_branchB').get());
  await assertSucceeds(receptionDb.collection('customer_service_requests').doc('request_branchA').get());
  await assertFails(receptionDb.collection('customer_service_requests').doc('request_branchB').get());
  await assertSucceeds(receptionDb.collection('repair_custody_records').doc('custody_branchA').get());
  await assertFails(receptionDb.collection('repair_custody_records').doc('custody_branchB').get());
  await assertSucceeds(receptionDb.collection('repair_replacement_requests').doc('replacement_branchA').get());
  await assertFails(receptionDb.collection('repair_replacement_requests').doc('replacement_branchB').get());
  await assertFails(tenantBDb.collection('repair_custody_records').doc('custody_branchA').get());
  await assertFails(adminDb.collection('repair_custody_records').doc('manual').set({ tenantId: 'tenantA', branchId: 'branchA' }));
  await assertFails(adminDb.collection('customer_portal_credentials').doc('tenantA__customerA').get());
  await assertFails(anonDb.collection('customer_portal_credentials').doc('tenantA__customerA').get());
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

// 7) Supervisor-created approval workflow docs are tenant-scoped and role-gated.
{
  const supervisorDb = testEnv.authenticatedContext('userASupervisor').firestore();
  const managerDb = testEnv.authenticatedContext('userAManager').firestore();
  const hrDb = testEnv.authenticatedContext('userAHrApprover').firestore();
  const adminDb = testEnv.authenticatedContext('userAAdmin').firestore();
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  const observerDb = testEnv.authenticatedContext('userAObserver').firestore();
  const tenantBDb = testEnv.authenticatedContext('userBAdmin').firestore();
  const createdAt = new Date();
  const approvalDoc = {
    tenantId: 'tenantA',
    requestType: 'leave',
    employeeId: 'emp-worker-a',
    employeeName: 'Worker A',
    departmentId: 'dept-a',
    requestData: {
      startDate: '2026-06-24',
      endDate: '2026-06-24',
      requestedByEmployeeId: 'emp-supervisor-a',
      requestedOnBehalf: true,
      productionLineId: 'line-a',
    },
    approvalChain: [{
      approverEmployeeId: 'emp-manager-a',
      approverName: 'Manager A',
      approverJobTitle: 'Manager',
      level: 2,
      departmentId: 'dept-a',
      departmentName: 'Dept A',
      status: 'pending',
      actionDate: null,
      notes: '',
      delegatedTo: null,
      delegatedToName: null,
    }],
    currentStep: 0,
    status: 'pending',
    history: [],
    sourceRequestId: 'leave-a',
    createdBy: 'userASupervisor',
    createdAt,
    updatedAt: createdAt,
  };

  await assertSucceeds(supervisorDb.collection('production_workers').where('tenantId', '==', 'tenantA').get());
  await assertSucceeds(
    supervisorDb.collection('production_line_worker_assignments').where('tenantId', '==', 'tenantA').get(),
  );
  await assertSucceeds(supervisorDb.collection('leave_balances').add({
    tenantId: 'tenantA',
    employeeId: 'emp-worker-a',
    annualBalance: 21,
    sickBalance: 14,
    unpaidTaken: 0,
    emergencyBalance: 3,
    lastUpdated: createdAt,
  }));
  await assertSucceeds(supervisorDb.collection('leave_requests').doc('leave-a').set({
    tenantId: 'tenantA',
    employeeId: 'emp-worker-a',
    employeeName: 'Worker A',
    leaveType: 'annual',
    startDate: '2026-06-24',
    endDate: '2026-06-24',
    totalDays: 1,
    affectsSalary: false,
    status: 'pending',
    approvalChain: [],
    finalStatus: 'pending',
    reason: 'team request',
    createdBy: 'userASupervisor',
    createdAt,
  }));
  await assertSucceeds(
    supervisorDb
      .collection('approval_requests')
      .where('tenantId', '==', 'tenantA')
      .where('createdBy', '==', 'userASupervisor')
      .get(),
  );
  await assertSucceeds(supervisorDb.collection('approval_requests').doc('approval-a').set(approvalDoc));
  await assertSucceeds(supervisorDb.collection('approval_requests').doc('approval-a').get());
  await assertFails(supervisorDb.collection('approval_requests').doc('approval-other').set({
    ...approvalDoc,
    createdBy: 'userAManager',
  }));
  await assertFails(supervisorDb.collection('approval_requests').doc('approval-foreign').set({
    ...approvalDoc,
    tenantId: 'tenantB',
  }));

  await assertSucceeds(supervisorDb.collection('approval_requests').doc('approval-cancel').set({
    ...approvalDoc,
    sourceRequestId: 'leave-cancel',
    history: [],
  }));
  await assertSucceeds(supervisorDb.collection('approval_requests').doc('approval-cancel').update({
    status: 'cancelled',
    updatedAt: createdAt,
    history: [{
      step: 0,
      action: 'cancelled',
      performedBy: 'emp-supervisor-a',
      performedByName: 'Supervisor A',
      timestamp: createdAt,
      notes: 'cancel before approval',
      previousStatus: 'pending',
      newStatus: 'cancelled',
    }],
  }));
  await assertFails(operatorDb.collection('approval_requests').doc('approval-cancel').update({
    status: 'cancelled',
    updatedAt: createdAt,
    history: [{
      step: 0,
      action: 'cancelled',
      performedBy: 'operator',
      performedByName: 'Operator',
      timestamp: createdAt,
      notes: 'not owner',
      previousStatus: 'pending',
      newStatus: 'cancelled',
    }],
  }));
  await assertSucceeds(supervisorDb.collection('approval_requests').doc('approval-restrict').set({
    ...approvalDoc,
    sourceRequestId: 'leave-restrict',
  }));
  await assertFails(supervisorDb.collection('approval_requests').doc('approval-restrict').update({
    requestData: {
      ...approvalDoc.requestData,
      reason: 'arbitrary edit should fail',
    },
  }));
  await assertSucceeds(supervisorDb.collection('leave_requests').doc('leave-a').update({
    approvalChain: [{
      approverEmployeeId: 'emp-manager-a',
      level: 2,
      status: 'pending',
      actionDate: null,
      notes: '',
    }],
    finalStatus: 'rejected',
    status: 'rejected',
  }));

  await assertSucceeds(
    managerDb
      .collection('approval_requests')
      .where('tenantId', '==', 'tenantA')
      .where('status', '==', 'pending')
      .get(),
  );
  await assertSucceeds(managerDb.collection('approval_requests').doc('approval-a').update({
    tenantId: 'tenantA',
    status: 'in_progress',
    currentStep: 1,
    updatedAt: createdAt,
  }));
  await assertFails(supervisorDb.collection('approval_requests').doc('approval-a').update({
    status: 'cancelled',
    updatedAt: createdAt,
    history: [{
      step: 1,
      action: 'cancelled',
      performedBy: 'emp-supervisor-a',
      performedByName: 'Supervisor A',
      timestamp: createdAt,
      notes: 'too late',
      previousStatus: 'in_progress',
      newStatus: 'cancelled',
    }],
  }));
  await assertSucceeds(hrDb.collection('approval_requests').doc('approval-a').update({
    tenantId: 'tenantA',
    status: 'approved',
    updatedAt: createdAt,
  }));
  await assertSucceeds(hrDb.collection('employee_deductions').add({
    tenantId: 'tenantA',
    employeeId: 'emp-worker-a',
    deductionTypeId: 'disciplinary_penalty',
    deductionTypeName: 'جزاء',
    amount: 25,
    isRecurring: false,
    startMonth: '2026-06',
    endMonth: null,
    reason: 'penalty approved',
    category: 'disciplinary',
    status: 'active',
    createdBy: 'emp-manager-a',
    createdAt,
    updatedAt: createdAt,
  }));
  await assertSucceeds(managerDb.collection('approval_audit_logs').add({
    tenantId: 'tenantA',
    requestId: 'approval-a',
    requestType: 'leave',
    employeeId: 'emp-worker-a',
    action: 'approved',
    performedBy: 'emp-manager-a',
    performedByName: 'Manager A',
    step: 0,
    details: { notes: 'ok' },
    timestamp: createdAt,
  }));
  await assertSucceeds(managerDb.collection('hr_notifications').doc('notification-a').set({
    tenantId: 'tenantA',
    recipientEmployeeId: 'emp-worker-a',
    recipientUserId: 'userASupervisor',
    type: 'new_approval_request',
    title: 'طلب موافقة جديد',
    body: 'يوجد طلب بانتظار الموافقة',
    requestId: 'approval-a',
    read: false,
    actionUrl: '/hr/approvals',
    createdAt,
  }));
  await assertSucceeds(supervisorDb.collection('hr_notifications').doc('notification-a').get());
  await assertSucceeds(supervisorDb.collection('hr_notifications').doc('notification-a').update({
    tenantId: 'tenantA',
    recipientEmployeeId: 'emp-worker-a',
    recipientUserId: 'userASupervisor',
    type: 'new_approval_request',
    title: 'طلب موافقة جديد',
    body: 'يوجد طلب بانتظار الموافقة',
    requestId: 'approval-a',
    read: true,
    actionUrl: '/hr/approvals',
    createdAt,
  }));

  const productionApprovalDoc = {
    ...approvalDoc,
    requestData: {
      ...approvalDoc.requestData,
      productionLineName: 'Line A',
      productionRequestObserverEmployeeIds: ['emp-observer-a'],
      productionRequestObserverUserIds: ['userAObserver'],
    },
    currentApproverEmployeeIds: ['emp-manager-a'],
    currentApproverUserIds: ['userAManager'],
    participantEmployeeIds: ['emp-worker-a', 'emp-supervisor-a', 'emp-observer-a'],
    participantUserIds: ['userASupervisor', 'userAObserver'],
  };
  await assertSucceeds(supervisorDb.collection('production_approval_requests').doc('prod-approval-a').set(productionApprovalDoc));
  await assertSucceeds(observerDb.collection('production_approval_requests').doc('prod-approval-a').get());
  await assertSucceeds(
    observerDb.collection('production_approval_requests').where('tenantId', '==', 'tenantA').get(),
  );
  await assertFails(
    operatorDb.collection('production_approval_requests').where('tenantId', '==', 'tenantA').get(),
  );
  await assertFails(operatorDb.collection('production_approval_requests').doc('prod-approval-a').get());
  await assertFails(observerDb.collection('production_approval_requests').doc('prod-approval-a').update({
    status: 'approved',
    updatedAt: createdAt,
    history: [{
      step: 0,
      action: 'approved',
      performedBy: 'emp-observer-a',
      performedByName: 'Observer A',
      timestamp: createdAt,
      notes: 'observer should not approve',
      previousStatus: 'pending',
      newStatus: 'approved',
    }],
  }));

  await assertFails(operatorDb.collection('approval_requests').doc('approval-denied').set(approvalDoc));
  await assertFails(operatorDb.collection('approval_requests').doc('approval-a').get());
  await assertFails(tenantBDb.collection('approval_requests').doc('approval-a').get());
  await assertFails(operatorDb.collection('approval_audit_logs').add({
    tenantId: 'tenantA',
    requestId: 'approval-a',
    requestType: 'leave',
    employeeId: 'emp-worker-a',
    action: 'created',
    performedBy: 'emp-worker-a',
    performedByName: 'Worker A',
    step: null,
    details: {},
    timestamp: createdAt,
  }));
  await assertFails(managerDb.collection('hr_notifications').doc('notification-foreign').set({
    tenantId: 'tenantB',
    recipientEmployeeId: 'manager-a',
    recipientUserId: 'userASupervisor',
    type: 'new_approval_request',
    title: 'طلب موافقة جديد',
    body: 'يوجد طلب بانتظار الموافقة',
    requestId: 'approval-a',
    read: false,
    actionUrl: '/hr/approvals',
    createdAt,
  }));
  await assertSucceeds(adminDb.collection('payroll_distributions').add({
    tenantId: 'tenantA',
    month: '2026-06',
    distributedAt: createdAt,
    distributedBy: 'userAAdmin',
    distributedByName: 'Admin',
    employeeCount: 1,
    status: 'distributed',
  }));
  await assertFails(adminDb.collection('payroll_distributions').add({
    month: '2026-06',
    distributedAt: createdAt,
    distributedBy: 'userAAdmin',
    distributedByName: 'Admin',
    employeeCount: 1,
    status: 'distributed',
  }));

  // Production handover receipts: client read with permission; no client writes.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adb = context.firestore();
    await adb.collection('production_handover_receipts').doc('receipt-a').set({
      tenantId: 'tenantA',
      handoverRequestId: 'handover-a',
      quantity: 5,
      createdAt,
    });
    await adb.collection('production_handover_receipts').doc('receipt-b').set({
      tenantId: 'tenantB',
      handoverRequestId: 'handover-b',
      quantity: 3,
      createdAt,
    });
  });
  const packagingDb = testEnv.authenticatedContext('userAPackaging').firestore();
  const anonDbHandover = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(packagingDb.collection('production_handover_receipts').doc('receipt-a').get());
  await assertFails(packagingDb.collection('production_handover_receipts').doc('receipt-b').get());
  await assertFails(operatorDb.collection('production_handover_receipts').doc('receipt-a').get());
  await assertFails(anonDbHandover.collection('production_handover_receipts').doc('receipt-a').get());
  await assertFails(packagingDb.collection('production_handover_receipts').doc('receipt-new').set({
    tenantId: 'tenantA',
    handoverRequestId: 'handover-a',
    quantity: 1,
    createdAt,
  }));
  await assertFails(packagingDb.collection('production_handover_receipts').doc('receipt-a').update({
    quantity: 99,
  }));
  await assertFails(packagingDb.collection('production_handover_receipts').doc('receipt-a').delete());

  // Inventory warehouse bind: users.inventoryWarehouseId scopes stock_* + warehouses.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adb = context.firestore();
    await adb.collection('warehouses').doc('whA').set({
      tenantId: 'tenantA',
      name: 'Warehouse A',
      code: 'A',
      isActive: true,
    });
    await adb.collection('warehouses').doc('whB').set({
      tenantId: 'tenantA',
      name: 'Warehouse B',
      code: 'B',
      isActive: true,
    });
    await adb.collection('stock_items').doc('whA__material__item1').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      itemType: 'material',
      itemId: 'item1',
      itemName: 'Item 1',
      itemCode: 'I1',
      quantity: 10,
      minStock: 0,
      updatedAt: createdAt,
    });
    await adb.collection('stock_items').doc('whB__material__item1').set({
      tenantId: 'tenantA',
      warehouseId: 'whB',
      itemType: 'material',
      itemId: 'item1',
      itemName: 'Item 1',
      itemCode: 'I1',
      quantity: 5,
      minStock: 0,
      updatedAt: createdAt,
    });
    await adb.collection('stock_transactions').doc('txA').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      itemType: 'material',
      itemId: 'item1',
      itemName: 'Item 1',
      movementType: 'IN',
      quantity: 10,
      createdAt,
    });
    await adb.collection('stock_transactions').doc('txB').set({
      tenantId: 'tenantA',
      warehouseId: 'whB',
      itemType: 'material',
      itemId: 'item1',
      itemName: 'Item 1',
      movementType: 'IN',
      quantity: 5,
      createdAt,
    });
    await adb.collection('inventory_transfer_requests').doc('transfer-source-a').set({
      tenantId: 'tenantA',
      fromWarehouseId: 'whA',
      toWarehouseId: 'whB',
      status: 'pending',
      createdAt,
    });
    await adb.collection('inventory_transfer_requests').doc('transfer-destination-a').set({
      tenantId: 'tenantA',
      fromWarehouseId: 'whB',
      toWarehouseId: 'whA',
      status: 'pending',
      createdAt,
    });
  });

  const boundDb = testEnv.authenticatedContext('userAWarehouseBound').firestore();
  const unboundAdminDb = testEnv.authenticatedContext('userAAdmin').firestore();
  const usersManagerDb = testEnv.authenticatedContext('userAUsersManager').firestore();

  await assertSucceeds(boundDb.collection('stock_items').doc('whA__material__item1').get());
  await assertFails(boundDb.collection('stock_items').doc('whB__material__item1').get());
  await assertSucceeds(boundDb.collection('warehouses').doc('whA').get());
  await assertFails(boundDb.collection('warehouses').doc('whB').get());
  await assertSucceeds(boundDb.collection('stock_transactions').doc('txA').get());
  await assertFails(boundDb.collection('stock_transactions').doc('txB').get());

  // Central spare-parts bind may read maintenance_center warehouse docs (destinations),
  // but not other warehouses or center stock balances.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adb = context.firestore();
    await adb.collection('warehouses').doc('whCentralSp').set({
      tenantId: 'tenantA',
      name: 'Spare Parts Central',
      code: 'SPC',
      warehouseRole: 'spare_parts_central',
      isActive: true,
    });
    await adb.collection('warehouses').doc('whMaintCenter').set({
      tenantId: 'tenantA',
      name: 'Maintenance Center',
      code: 'MC1',
      warehouseRole: 'maintenance_center',
      isActive: true,
    });
    await adb.collection('warehouses').doc('whGeneralBoundPeer').set({
      tenantId: 'tenantA',
      name: 'General Peer',
      code: 'GP',
      warehouseRole: 'general',
      isActive: true,
    });
    await adb.collection('warehouses').doc('whMaintCenterB').set({
      tenantId: 'tenantB',
      name: 'Other Tenant Center',
      code: 'MCB',
      warehouseRole: 'maintenance_center',
      isActive: true,
    });
    await adb.collection('stock_items').doc('whMaintCenter__material__item1').set({
      tenantId: 'tenantA',
      warehouseId: 'whMaintCenter',
      itemType: 'material',
      itemId: 'item1',
      itemName: 'Item 1',
      itemCode: 'I1',
      quantity: 3,
      minStock: 0,
      updatedAt: createdAt,
    });
  });

  const centralSpDb = testEnv.authenticatedContext('userASparePartsCentral').firestore();
  const maintCenterDb = testEnv.authenticatedContext('userAMaintCenterBound').firestore();

  await assertSucceeds(centralSpDb.collection('warehouses').doc('whCentralSp').get());
  await assertSucceeds(centralSpDb.collection('warehouses').doc('whMaintCenter').get());
  await assertFails(centralSpDb.collection('warehouses').doc('whGeneralBoundPeer').get());
  await assertFails(centralSpDb.collection('warehouses').doc('whMaintCenterB').get());
  await assertFails(centralSpDb.collection('stock_items').doc('whMaintCenter__material__item1').get());
  await assertSucceeds(
    centralSpDb.collection('warehouses')
      .where('tenantId', '==', 'tenantA')
      .where('warehouseRole', '==', 'maintenance_center')
      .get(),
  );
  await assertFails(
    centralSpDb.collection('warehouses').where('tenantId', '==', 'tenantA').get(),
  );
  await assertFails(
    boundDb.collection('warehouses')
      .where('tenantId', '==', 'tenantA')
      .where('warehouseRole', '==', 'maintenance_center')
      .get(),
  );
  await assertSucceeds(maintCenterDb.collection('warehouses').doc('whMaintCenter').get());
  await assertFails(maintCenterDb.collection('warehouses').doc('whCentralSp').get());
  await assertFails(maintCenterDb.collection('warehouses').doc('whGeneralBoundPeer').get());

  await assertSucceeds(boundDb.collection('inventory_transfer_requests').doc('transfer-source-a').get());
  await assertSucceeds(boundDb.collection('inventory_transfer_requests').doc('transfer-destination-a').get());
  await assertSucceeds(
    boundDb.collection('inventory_transfer_requests')
      .where('tenantId', '==', 'tenantA')
      .where('fromWarehouseId', '==', 'whA')
      .get(),
  );
  await assertSucceeds(
    boundDb.collection('inventory_transfer_requests')
      .where('tenantId', '==', 'tenantA')
      .where('toWarehouseId', '==', 'whA')
      .get(),
  );
  await assertFails(
    boundDb.collection('inventory_transfer_requests')
      .where('tenantId', '==', 'tenantA')
      .get(),
  );
  await assertFails(boundDb.collection('inventory_transfer_requests').doc('transfer-source-a').update({
    status: 'approved',
  }));
  await assertFails(boundDb.collection('stock_items').doc('whB__material__item2').set({
    tenantId: 'tenantA',
    warehouseId: 'whB',
    itemType: 'material',
    itemId: 'item2',
    itemName: 'Item 2',
    itemCode: 'I2',
    quantity: 1,
    minStock: 0,
    updatedAt: createdAt,
  }));
  await assertSucceeds(unboundAdminDb.collection('stock_items').doc('whB__material__item1').get());

  // Bound user cannot clear their own inventoryWarehouseId (needs users.manage).
  await assertFails(boundDb.collection('users').doc('userAWarehouseBound').update({
    inventoryWarehouseId: null,
  }));
  await assertSucceeds(usersManagerDb.collection('users').doc('userAWarehouseBound').update({
    inventoryWarehouseId: 'whA',
  }));

  // P0: tenant users.manage cannot escalate isSuperAdmin.
  await assertFails(usersManagerDb.collection('users').doc('userAUsersManager').update({
    isSuperAdmin: true,
  }));
  await assertFails(usersManagerDb.collection('users').doc('userAOperator').update({
    isSuperAdmin: true,
  }));
  await assertFails(usersManagerDb.collection('users').doc('userAOperator').update({
    tenantId: 'tenantB',
  }));

  // P0: self-create cannot set privileged roleId / isActive:true.
  const selfEscalationDb = testEnv.authenticatedContext('userSelfEscalation').firestore();
  await assertFails(selfEscalationDb.collection('users').doc('userSelfEscalation').set({
    email: 'evil@example.com',
    displayName: 'Evil',
    roleId: 'tenantA__admin',
    tenantId: 'tenantA',
    isActive: true,
  }));
  await assertFails(selfEscalationDb.collection('users').doc('userSelfEscalation').set({
    email: 'evil@example.com',
    displayName: 'Evil',
    roleId: 'tenantA__admin',
    tenantId: 'tenantA',
    isActive: false,
  }));
  await assertSucceeds(selfEscalationDb.collection('users').doc('userSelfEscalation').set({
    email: 'pending@example.com',
    displayName: 'Pending',
    roleId: 'tenantA__inventory_viewer',
    tenantId: 'tenantA',
    isActive: false,
  }));
  await assertSucceeds(testEnv.authenticatedContext('userCompanyPending').firestore()
    .collection('users').doc('userCompanyPending').set({
      email: 'company@example.com',
      displayName: 'Company Admin Pending',
      roleId: '',
      tenantId: 'pendingTenant1',
      isActive: false,
    }));

  // P0: inventory.view alone cannot write stock ledger.
  await assertFails(boundDb.collection('stock_items').doc('whA__material__item3').set({
    tenantId: 'tenantA',
    warehouseId: 'whA',
    itemType: 'material',
    itemId: 'item3',
    itemName: 'Item 3',
    itemCode: 'I3',
    quantity: 1,
    minStock: 0,
    updatedAt: createdAt,
  }));
  await assertFails(boundDb.collection('stock_transactions').doc('txViewerDenied').set({
    tenantId: 'tenantA',
    warehouseId: 'whA',
    itemType: 'material',
    itemId: 'item1',
    itemName: 'Item 1',
    movementType: 'IN',
    quantity: 1,
    createdAt,
  }));

  // Inventory writer with warehouse bind can write own warehouse only.
  const writerDb = testEnv.authenticatedContext('userAInventoryWriter').firestore();
  await assertSucceeds(writerDb.collection('stock_transactions').doc('txWriterOk').set({
    tenantId: 'tenantA',
    warehouseId: 'whA',
    itemType: 'material',
    itemId: 'item1',
    itemName: 'Item 1',
    movementType: 'IN',
    quantity: 1,
    createdAt,
  }));
  await assertFails(writerDb.collection('stock_transactions').doc('txWriterOtherWh').set({
    tenantId: 'tenantA',
    warehouseId: 'whB',
    itemType: 'material',
    itemId: 'item1',
    itemName: 'Item 1',
    movementType: 'IN',
    quantity: 1,
    createdAt,
  }));
  await assertSucceeds(writerDb.collection('inventory_transfer_requests').doc('transfer-created-from-bound').set({
    tenantId: 'tenantA',
    fromWarehouseId: 'whA',
    toWarehouseId: 'whB',
    status: 'pending',
    createdAt,
  }));
  await assertSucceeds(writerDb.collection('inventory_transfer_requests').doc('transfer-created-to-bound').set({
    tenantId: 'tenantA',
    fromWarehouseId: 'whB',
    toWarehouseId: 'whA',
    status: 'pending',
    createdAt,
  }));
  await assertFails(writerDb.collection('inventory_transfer_requests').doc('transfer-outside-bound').set({
    tenantId: 'tenantA',
    fromWarehouseId: 'whB',
    toWarehouseId: 'whC',
    status: 'pending',
    createdAt,
  }));
  await assertSucceeds(writerDb.collection('inventory_transfer_requests').doc('transfer-source-a').update({
    status: 'approved',
  }));
  await assertSucceeds(writerDb.collection('inventory_transfer_requests').doc('transfer-destination-a').update({
    status: 'rejected',
  }));
  await assertFails(writerDb.collection('inventory_transfer_requests').doc('transfer-source-a').update({
    fromWarehouseId: 'whB',
    toWarehouseId: 'whC',
  }));
}

// 12) Spare-parts replenishment + repair spare issues: unbound list/count-safe; bound needs warehouse filter.
{
  const createdAt = new Date();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adb = context.firestore();
    await adb.collection('repair_spare_issues').doc('rsi-whA').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      status: 'submitted',
      createdAt,
    });
    await adb.collection('repair_spare_issues').doc('rsi-whB').set({
      tenantId: 'tenantA',
      warehouseId: 'whB',
      status: 'draft',
      createdAt,
    });
    await adb.collection('spare_parts_replenishment_requests').doc('spr-whA').set({
      tenantId: 'tenantA',
      fromWarehouseId: 'whA',
      toWarehouseId: 'whB',
      status: 'submitted',
      createdAt,
    });
    await adb.collection('spare_parts_replenishment_requests').doc('spr-whB').set({
      tenantId: 'tenantA',
      fromWarehouseId: 'whB',
      toWarehouseId: 'whC',
      status: 'responsible_approved',
      createdAt,
    });
  });

  // Unbound inventory viewer: tenant-scoped status list must succeed (dashboard getCountFromServer).
  const unboundInvDb = testEnv.authenticatedContext('userAUsersManager').firestore();
  await assertSucceeds(
    unboundInvDb.collection('spare_parts_replenishment_requests')
      .where('tenantId', '==', 'tenantA')
      .where('status', 'in', ['submitted', 'approved', 'prepared'])
      .get(),
  );
  await assertSucceeds(
    unboundInvDb.collection('spare_parts_replenishment_requests')
      .where('tenantId', '==', 'tenantA')
      .where('status', '==', 'responsible_approved')
      .get(),
  );

  // Unbound repair operator: spare-issue pending statuses without warehouse filter.
  const unboundRepairDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertSucceeds(
    unboundRepairDb.collection('repair_spare_issues')
      .where('tenantId', '==', 'tenantA')
      .where('status', 'in', ['draft', 'submitted', 'approved'])
      .get(),
  );

  // Bound inventory viewer: must filter warehouse; unconstrained tenant list fails.
  const boundInvDb = testEnv.authenticatedContext('userAWarehouseBound').firestore();
  await assertFails(
    boundInvDb.collection('spare_parts_replenishment_requests')
      .where('tenantId', '==', 'tenantA')
      .where('status', 'in', ['submitted', 'approved', 'prepared'])
      .get(),
  );
  await assertSucceeds(
    boundInvDb.collection('spare_parts_replenishment_requests')
      .where('tenantId', '==', 'tenantA')
      .where('status', 'in', ['submitted', 'approved', 'prepared'])
      .where('fromWarehouseId', '==', 'whA')
      .get(),
  );

  // Bound center parts user: must filter warehouseId for repair spare issues.
  const boundRepairDb = testEnv.authenticatedContext('userACenterParts').firestore();
  await assertFails(
    boundRepairDb.collection('repair_spare_issues')
      .where('tenantId', '==', 'tenantA')
      .where('status', 'in', ['draft', 'submitted', 'approved'])
      .get(),
  );
  await assertSucceeds(
    boundRepairDb.collection('repair_spare_issues')
      .where('tenantId', '==', 'tenantA')
      .where('status', 'in', ['draft', 'submitted', 'approved'])
      .where('warehouseId', '==', 'whA')
      .get(),
  );
}

// 12b) Spare-parts purchase invoices: client read only; warehouse-bound lists must filter.
{
  const postedAt = new Date();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adb = context.firestore();
    await adb.collection('spare_parts_purchase_invoices').doc('spi-whA').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      invoiceNo: 'SPI-00001',
      status: 'posted',
      postedAt,
    });
    await adb.collection('spare_parts_purchase_invoices').doc('spi-whB').set({
      tenantId: 'tenantA',
      warehouseId: 'whB',
      invoiceNo: 'SPI-00002',
      status: 'posted',
      postedAt,
    });
    await adb.collection('spare_parts_purchase_invoices').doc('spi-tenantB').set({
      tenantId: 'tenantB',
      warehouseId: 'whA',
      invoiceNo: 'SPI-00003',
      status: 'posted',
      postedAt,
    });
  });

  const unboundInvDb = testEnv.authenticatedContext('userAUsersManager').firestore();
  await assertSucceeds(
    unboundInvDb.collection('spare_parts_purchase_invoices')
      .where('tenantId', '==', 'tenantA')
      .get(),
  );
  await assertFails(
    unboundInvDb.collection('spare_parts_purchase_invoices').doc('spi-whA').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      invoiceNo: 'SPI-FORGED',
      status: 'posted',
    }),
  );
  await assertFails(
    unboundInvDb.collection('spare_parts_purchase_invoices').doc('spi-whA').update({
      status: 'void',
    }),
  );

  const writerDb = testEnv.authenticatedContext('userAInventoryWriter').firestore();
  await assertSucceeds(writerDb.collection('spare_parts_purchase_invoices').doc('spi-whA').get());
  await assertFails(writerDb.collection('spare_parts_purchase_invoices').doc('spi-whB').get());
  await assertFails(
    writerDb.collection('spare_parts_purchase_invoices')
      .where('tenantId', '==', 'tenantA')
      .get(),
  );
  await assertSucceeds(
    writerDb.collection('spare_parts_purchase_invoices')
      .where('tenantId', '==', 'tenantA')
      .where('warehouseId', '==', 'whA')
      .get(),
  );

  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertFails(operatorDb.collection('spare_parts_purchase_invoices').doc('spi-whA').get());

  const otherTenantDb = testEnv.authenticatedContext('userBAdmin').firestore();
  await assertFails(otherTenantDb.collection('spare_parts_purchase_invoices').doc('spi-whA').get());
}

// 12c) Department consumable issues: tenant list + warehouse bind; departments list must filter tenantId.
{
  const createdAt = new Date().toISOString();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adb = context.firestore();
    await adb.collection('department_consumable_issues').doc('dci-whA').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      departmentId: 'dept-a',
      status: 'draft',
      createdAt,
    });
    await adb.collection('department_consumable_issues').doc('dci-whB').set({
      tenantId: 'tenantA',
      warehouseId: 'whB',
      departmentId: 'dept-a',
      status: 'draft',
      createdAt,
    });
    await adb.collection('departments').doc('dept-a').set({
      tenantId: 'tenantA',
      name: 'الإنتاج',
      isActive: true,
    });
    await adb.collection('departments').doc('dept-b').set({
      tenantId: 'tenantB',
      name: 'أخرى',
      isActive: true,
    });
  });

  const unboundInvDb = testEnv.authenticatedContext('userAUsersManager').firestore();
  await assertSucceeds(
    unboundInvDb.collection('department_consumable_issues')
      .where('tenantId', '==', 'tenantA')
      .get(),
  );
  await assertSucceeds(
    unboundInvDb.collection('departments').where('tenantId', '==', 'tenantA').get(),
  );

  const boundInvDb = testEnv.authenticatedContext('userAWarehouseBound').firestore();
  await assertFails(
    boundInvDb.collection('department_consumable_issues')
      .where('tenantId', '==', 'tenantA')
      .get(),
  );
  await assertSucceeds(
    boundInvDb.collection('department_consumable_issues')
      .where('tenantId', '==', 'tenantA')
      .where('warehouseId', '==', 'whA')
      .get(),
  );
  await assertFails(
    boundInvDb.collection('department_consumable_issues').doc('dci-whB').get(),
  );
  await assertFails(
    unboundInvDb.collection('department_consumable_issues').doc('dci-whA').set({
      tenantId: 'tenantA',
      warehouseId: 'whA',
      status: 'issued',
    }),
  );
}

// 13) Repair expenses are server-owned approval requests; clients can only read their scope.
{
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection('repair_treasury_expense_requests').doc('expense-request-a').set({
      tenantId: 'tenantA',
      branchId: 'branchA',
      sessionId: 'sessionA',
      requestId: 'manual_approval_test',
      status: 'pending',
      amount: 125,
      note: 'مصروف اختبار',
      requestedBy: 'userAOperator',
      requestedAt: new Date(),
    });
  });

  const treasuryAdminDb = testEnv.authenticatedContext('userARepairTreasuryAdmin').firestore();
  const operatorDb = testEnv.authenticatedContext('userAOperator').firestore();
  await assertSucceeds(
    treasuryAdminDb.collection('repair_treasury_expense_requests').doc('expense-request-a').get(),
  );
  await assertFails(
    operatorDb.collection('repair_treasury_expense_requests').doc('expense-request-a').get(),
  );
  await assertFails(
    treasuryAdminDb.collection('repair_treasury_expense_requests').doc('expense-client-create').set({
      tenantId: 'tenantA',
      branchId: 'branchA',
      status: 'approved',
      amount: 125,
    }),
  );
  await assertFails(
    treasuryAdminDb.collection('repair_treasury_expense_requests').doc('expense-request-a').update({
      status: 'approved',
    }),
  );
}

await testEnv.cleanup();
assert.ok(true);

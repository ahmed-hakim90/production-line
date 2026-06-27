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
      'payroll.accounts.disburse': true,
    },
  });
  await set('roles', 'tenantA-operator-role', {
    tenantId: 'tenantA',
    permissions: {
      'repair.view': true,
      'repair.parts.view': true,
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
}

await testEnv.cleanup();
assert.ok(true);

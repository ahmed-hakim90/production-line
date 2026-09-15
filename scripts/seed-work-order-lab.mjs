import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-production-line-lab';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
if (!projectId.startsWith('demo-') || !firestoreHost.startsWith('127.0.0.1:') || !authHost.startsWith('127.0.0.1:')) {
  throw new Error('Refusing to seed: this script only runs against localhost emulators and a demo-* project.');
}

if (!getApps().length) initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();
const tenantId = 'lab-tenant';
const roleId = 'lab-admin';
const email = 'lab@forgeops.local';
const password = 'Lab123456!';

let user;
try { user = await auth.getUserByEmail(email); }
catch { user = await auth.createUser({ email, password, displayName: 'مدير مختبر التشغيل' }); }

const permissions = Object.fromEntries([
  'dashboard.view', 'adminDashboard.view', 'productionDashboard.view', 'products.view',
  'lines.view', 'employees.view', 'employees.viewDetails', 'workOrders.view',
  'workOrders.create', 'workOrders.edit', 'workOrders.delete', 'workOrders.viewCost',
  'reports.view', 'reports.create', 'plans.view', 'productionIssue.request',
  'quality.view', 'quality.inspect', 'quality.approve', 'inventory.view',
  'productionHandover.approve', 'settings.view',
].map((key) => [key, true]));

const now = FieldValue.serverTimestamp();
const writes = [
  ['tenants', tenantId, { name: 'مصنع الاختبار المحلي', slug: 'lab', status: 'active', activityPacks: ['production', 'inventory', 'quality'], createdAt: now }],
  ['tenant_slugs', 'lab', { tenantId, status: 'active' }],
  ['roles', roleId, { tenantId, name: 'مدير المختبر', roleKey: 'admin', permissions, createdAt: now }],
  ['users', user.uid, { tenantId, email, displayName: 'مدير مختبر التشغيل', roleId, isSuperAdmin: false, isActive: true, createdAt: now }],
  ['products', 'lab-product', { tenantId, name: 'منتج تجريبي', code: 'LAB-P-001', category: 'تجريبي', stockLevel: 0, stockStatus: 'available', openingStock: 0, totalProduction: 0, avgDailyProduction: 0, wasteUnits: 0, avgAssemblyTime: 0, isManufactured: true, createdAt: now }],
  ['production_lines', 'lab-line', { tenantId, name: 'خط الاختبار 1', code: 'LAB-L-01', status: 'active', isActive: true, createdAt: now }],
  ['employees', 'lab-supervisor', { tenantId, name: 'مشرف الاختبار', level: 2, departmentId: '', jobPositionId: '', employmentType: 'full_time', baseSalary: 0, hourlyRate: 25, hasSystemAccess: false, isActive: true, createdAt: now }],
];

const batch = db.batch();
writes.forEach(([collectionName, id, data]) => batch.set(db.collection(collectionName).doc(id), data, { merge: true }));
const labOrderRef = db.collection('work_orders').doc('lab-hourly-order');
batch.set(labOrderRef, {
  tenantId, workOrderNumber: 'LAB-WO-001', productId: 'lab-product', lineId: 'lab-line',
  supervisorId: 'lab-supervisor', quantity: 800, producedQuantity: 0, maxWorkers: 8,
  workHours: 6, startDate: '2026-09-07', targetDate: '2026-09-08', estimatedCost: 0,
  actualCost: 0, status: 'pending', workdayStartTime: '08:00', breakStartTime: '12:00',
  breakEndTime: '12:30', workdayEndTime: '11:00', dailyTarget: 400,
  hourlyScheduleVersion: 1, createdBy: user.uid, createdAt: now,
});
[
  ['2026-09-07_0800', '2026-09-07', '08:00', '09:00', 133.33],
  ['2026-09-07_0900', '2026-09-07', '09:00', '10:00', 133.33],
  ['2026-09-07_1000', '2026-09-07', '10:00', '11:00', 133.34],
  ['2026-09-08_0800', '2026-09-08', '08:00', '09:00', 133.33],
  ['2026-09-08_0900', '2026-09-08', '09:00', '10:00', 133.33],
  ['2026-09-08_1000', '2026-09-08', '10:00', '11:00', 133.34],
].forEach(([id, date, startTime, endTime, targetQuantity]) => batch.set(labOrderRef.collection('hourly_slots').doc(String(id)), {
  tenantId, workOrderId: labOrderRef.id, id, date, startTime, endTime,
  targetQuantity, status: 'planned', createdAt: now, updatedAt: now,
}));
await batch.commit();

console.log(`Lab seeded: http://localhost:3000/t/lab/login`);
console.log(`Email: ${email}`);
console.log(`Password: ${password}`);

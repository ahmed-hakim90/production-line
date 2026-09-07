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
await batch.commit();

console.log(`Lab seeded: http://localhost:3000/t/lab/login`);
console.log(`Email: ${email}`);
console.log(`Password: ${password}`);

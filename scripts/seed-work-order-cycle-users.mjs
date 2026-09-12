import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT;
if (projectId !== 'demo-production-line-lab' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Only the isolated local lab is allowed');
initializeApp({ projectId });
const auth = getAuth(); const db = getFirestore(); const tenantId = 'lab-tenant';
const roles = [
  ['production-manager', 'مدير الإنتاج', ['workOrders.create', 'workOrders.approve']],
  ['production-supervisor', 'مشرف الإنتاج', ['workOrders.execute']],
  ['quality-manager', 'مدير الجودة', ['workOrders.assignInspectors']],
  ['quality-inspector-1', 'مراقب الجودة الأول', ['workOrders.inspect']],
  ['quality-inspector-2', 'مراقب الجودة الثاني', ['workOrders.inspect']],
  ['packaging-supervisor', 'مشرف التغليف', ['productionHandover.approve']],
];
for (const [key, name, grants] of roles) {
  const uid = `lab-${key}`; const email = `${key}@forgeops.local`;
  try { await auth.getUser(uid); } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, email, password: 'Lab123456!', displayName: name });
  }
  await db.collection('roles').doc(uid).set({ tenantId, name, roleKey: `lab_${key.replaceAll('-', '_')}`, permissions: Object.fromEntries(['dashboard.view', 'workOrders.view', ...grants].map(permission => [permission, true])) });
  await db.collection('users').doc(uid).set({ tenantId, roleId: uid, displayName: name, email, isActive: true, isSuperAdmin: false });
  console.log(`${name}: ${email}`);
}
for (let i = 1; i <= 3; i++) await db.collection('employees').doc(`lab-cycle-worker-${i}`).set({ tenantId, name: `عامل الاختبار ${i}`, isActive: true, level: 1 });
await db.collection('production_lines').doc('lab-cycle-line').set({ tenantId, name: 'خط تجربة الدورة الجديدة', isActive: true });
console.log('All lab accounts: Lab123456! — existing orders were not changed.');

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { requireWorkOrderLab } from './workOrderCycle.js';

const denied = () => new HttpsError('permission-denied', 'لا تملك صلاحية الوصول أو التكليف المطلوب.');
const clean = (data: Record<string, any>): Record<string, any> => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value?.toDate instanceof Function ? value.toDate().toISOString() : value]));

/** Bounded, tenant/assignment-scoped reads; directories never expose HR/payroll or auth fields. */
export async function readWorkOrderCycle(uid: string, input: { orderId?: string; directory?: boolean } = {}) {
  requireWorkOrderLab();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const db = getDb();
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (user?.isActive !== true || !user.roleId || !user.tenantId) throw denied();
  const role = (await db.collection('roles').doc(String(user.roleId)).get()).data();
  if (!role || role.tenantId !== user.tenantId) throw denied();
  const tenantId = String(user.tenantId);
  const permissions = role.permissions || {};
  const manager = permissions['workOrders.create'] === true || permissions['workOrders.approve'] === true || permissions['workOrders.assignInspectors'] === true;
  const supervisor = permissions['workOrders.execute'] === true;
  const inspector = permissions['workOrders.inspect'] === true;
  const packaging = permissions['productionHandover.approve'] === true;
  if (!manager && !supervisor && !inspector && !packaging) throw denied();
  const assignment = inspector ? await db.collection('work_order_line_assignments').where('tenantId', '==', tenantId).where('inspectorUids', 'array-contains', uid).get() : null;
  const lineIds = new Set(assignment?.docs.map(doc => doc.data().lineId) || []);
  const visible = (order: Record<string, any>) => order.tenantId === tenantId && order.cycleVersion === 2 && (manager || (supervisor && order.supervisorUid === uid) || (inspector && lineIds.has(order.lineId)));
  let rows: { id: string; data: Record<string, any> }[] = [];
  let truncated = false;
  if (input.orderId) {
    if (!/^[\w-]{1,120}$/.test(input.orderId)) throw new HttpsError('invalid-argument', 'هوية الأمر غير صالحة.');
    const snap = await db.collection('work_orders').doc(input.orderId).get();
    const data = snap.data();
    if (!data || !visible(data)) throw denied();
    rows = [{ id: snap.id, data }];
  } else if (manager || supervisor || inspector) {
    let query = db.collection('work_orders').where('tenantId', '==', tenantId).where('cycleVersion', '==', 2);
    if (!manager && supervisor && !inspector) query = query.where('supervisorUid', '==', uid);
    const snap = await query.limit(101).get();
    truncated = snap.size > 100;
    rows = snap.docs.slice(0, 100).filter(doc => visible(doc.data())).map(doc => ({ id: doc.id, data: doc.data() }));
  }
  const orders = await Promise.all(rows.map(async ({ id, data }) => {
    const [slots, lineAssignment, audit] = await Promise.all([
      db.collection('work_orders').doc(id).collection('hourly_slots').get(),
      db.collection('work_order_line_assignments').doc(`${tenantId}--${data.lineId}`).get(),
      input.orderId ? db.collection('work_orders').doc(id).collection('cycle_audit').orderBy('revision', 'desc').limit(101).get() : Promise.resolve(null),
    ]);
    return { ...clean(data), id, auditTruncated: (audit?.size || 0) > 100, audit: audit?.docs.slice(0, 100).map(doc => { const event = doc.data(); return { id: doc.id, action: event.action, actorUid: event.actorUid, actorName: event.actorName || event.actorUid, createdAt: event.createdAt, revision: event.revision, reason: event.payload?.reason || '', previousSupervisorUid: event.previousSupervisorUid || '', supervisorUid: event.action === 'reassignSupervisor' ? event.payload?.supervisorUid : '' }; }) || [], inspectorUids: lineAssignment.data()?.inspectorUids || [], slots: slots.docs.map(slot => ({ ...clean(slot.data()), id: slot.id }) as Record<string, any>).sort((a, b) => String(a.date + a.startTime).localeCompare(String(b.date + b.startTime))) };
  }));
  const directory: Record<string, { id: string; name: string }[]> = { products: [], lines: [], supervisors: [], inspectors: [], workers: [] };
  if (input.directory) {
    const basic = async (collection: string) => {
      const snap = await db.collection(collection).where('tenantId', '==', tenantId).limit(501).get();
      if (snap.size > 500) throw new HttpsError('resource-exhausted', 'دليل الاختيار تجاوز حد المختبر؛ يحتاج بحثًا مقسمًا.');
      return snap.docs.filter(doc => collection === 'employees' ? doc.data().isActive === true : doc.data().isActive !== false).map(doc => ({ id: doc.id, name: String(doc.data().name || doc.id) }));
    };
    if (permissions['workOrders.create'] === true) [directory.products, directory.lines] = await Promise.all([basic('products'), basic('production_lines')]);
    if (supervisor) directory.workers = await basic('employees');
    if (permissions['workOrders.create'] === true || permissions['workOrders.approve'] === true || permissions['workOrders.assignInspectors'] === true) {
      const [users, roles] = await Promise.all([db.collection('users').where('tenantId', '==', tenantId).limit(501).get(), db.collection('roles').where('tenantId', '==', tenantId).limit(501).get()]);
      if (users.size > 500 || roles.size > 500) throw new HttpsError('resource-exhausted', 'دليل المستخدمين تجاوز حد المختبر.');
      const roleMap = new Map(roles.docs.map(doc => [doc.id, doc.data().permissions || {}]));
      for (const doc of users.docs) {
        const person = doc.data(); const grants = roleMap.get(person.roleId) || {};
        if (person.isActive !== true) continue;
        const entry = { id: doc.id, name: String(person.displayName || doc.id) };
        if (grants['workOrders.execute'] === true && (permissions['workOrders.create'] === true || permissions['workOrders.approve'] === true)) directory.supervisors.push(entry);
        if (grants['workOrders.inspect'] === true && permissions['workOrders.assignInspectors'] === true) directory.inspectors.push(entry);
      }
    }
  }
  return { uid, permissions, orders, directory, truncated, fetchedAt: new Date().toISOString() };
}

export const getWorkOrderCycleWorkspace = onCall({ region: 'us-central1' }, request => readWorkOrderCycle(request.auth?.uid || '', request.data || {}));

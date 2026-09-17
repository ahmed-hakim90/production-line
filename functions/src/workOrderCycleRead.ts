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
  const canSeeAudit = permissions['workOrders.approve'] === true || permissions['workOrders.assignInspectors'] === true;
  const supervisor = permissions['workOrders.execute'] === true;
  const inspector = permissions['workOrders.inspect'] === true;
  const packaging = permissions['productionHandover.approve'] === true;
  if (!manager && !supervisor && !inspector && !packaging) throw denied();
  const assignment = inspector ? await db.collection('work_order_line_assignments').where('tenantId', '==', tenantId).where('inspectorUids', 'array-contains', uid).get() : null;
  const lineIds = new Set(assignment?.docs.map(doc => doc.data().lineId) || []);
  // Packaging is a factory-wide role (all lines), so it gets manager-like blanket visibility rather than a line/assignment scope.
  const visible = (order: Record<string, any>) => order.tenantId === tenantId && order.cycleVersion === 2 && (manager || packaging || (supervisor && order.supervisorUid === uid) || (inspector && lineIds.has(order.lineId)));
  let rows: { id: string; data: Record<string, any> }[] = [];
  let truncated = false;
  if (input.orderId) {
    if (!/^[\w-]{1,120}$/.test(input.orderId)) throw new HttpsError('invalid-argument', 'هوية الأمر غير صالحة.');
    const snap = await db.collection('work_orders').doc(input.orderId).get();
    const data = snap.data();
    if (!data || !visible(data)) throw denied();
    rows = [{ id: snap.id, data }];
  } else if (manager || supervisor || inspector || packaging) {
    let query = db.collection('work_orders').where('tenantId', '==', tenantId).where('cycleVersion', '==', 2);
    if (!manager && !packaging && supervisor && !inspector) query = query.where('supervisorUid', '==', uid);
    const snap = await query.limit(101).get();
    truncated = snap.size > 100;
    rows = snap.docs.slice(0, 100).filter(doc => visible(doc.data())).map(doc => ({ id: doc.id, data: doc.data() }));
  }
  const orders = await Promise.all(rows.map(async ({ id, data }) => {
    const [slots, lineAssignment, audit, planRevisions] = await Promise.all([
      db.collection('work_orders').doc(id).collection('hourly_slots').get(),
      db.collection('work_order_line_assignments').doc(`${tenantId}--${data.lineId}`).get(),
      input.orderId && canSeeAudit ? db.collection('work_orders').doc(id).collection('cycle_audit').orderBy('revision', 'desc').limit(101).get() : Promise.resolve(null),
      input.orderId ? db.collection('work_orders').doc(id).collection('plan_revisions').orderBy('proposedAt', 'desc').limit(101).get() : Promise.resolve(null),
    ]);
    const packagingEventsOf = async (ref: FirebaseFirestore.DocumentReference, data: Record<string, any>) => {
      if (!input.orderId || !(Number(data.packagingReceivedQuantity || 0) > 0)) return { truncated: false, rows: [] as Record<string, any>[] };
      const snap = await ref.collection('packaging_events').orderBy('createdAt', 'desc').limit(101).get();
      return { truncated: snap.size > 100, rows: snap.docs.slice(0, 100).map(doc => ({ ...clean(doc.data()), id: doc.id })) };
    };
    const slotRows = await Promise.all(slots.docs.map(async slot => {
      const slotData = slot.data();
      const [contributions, corrections, reworkAttempts, packagingEvents] = await Promise.all([
        input.orderId && slotData.inspectedQuantity > 0 ? slot.ref.collection('quality_contributions').orderBy('submittedAt', 'desc').limit(101).get() : Promise.resolve(null),
        input.orderId && slotData.qualityCorrectionCount > 0 ? slot.ref.collection('quality_corrections').orderBy('createdAt', 'desc').limit(101).get() : Promise.resolve(null),
        input.orderId && Number(slotData.rejectedDisposition?.reworkQuantity || 0) > 0 ? slot.ref.collection('rework_attempts').orderBy('attemptNumber', 'asc').limit(101).get() : Promise.resolve(null),
        packagingEventsOf(slot.ref, slotData),
      ]);
      const attemptRows = await Promise.all((reworkAttempts?.docs.slice(0, 100) || []).map(async attempt => {
        const attemptData = attempt.data();
        const [attemptContributions, attemptPackagingEvents] = await Promise.all([
          attemptData.inspectedQuantity > 0 ? attempt.ref.collection('quality_contributions').orderBy('submittedAt', 'desc').limit(101).get() : Promise.resolve(null),
          packagingEventsOf(attempt.ref, attemptData),
        ]);
        return { ...clean(attemptData), id: attempt.id, contributionsTruncated: (attemptContributions?.size || 0) > 100, qualityContributions: attemptContributions?.docs.slice(0, 100).map(doc => ({ ...clean(doc.data()), id: doc.id })) || [], packagingEventsTruncated: attemptPackagingEvents.truncated, packagingEvents: attemptPackagingEvents.rows } as Record<string, any>;
      }));
      return { ...clean(slotData), id: slot.id, contributionsTruncated: (contributions?.size || 0) > 100, qualityContributions: contributions?.docs.slice(0, 100).map(doc => ({ ...clean(doc.data()), id: doc.id })) || [], qualityCorrections: corrections?.docs.slice(0, 100).map(doc => ({ ...clean(doc.data()), id: doc.id })) || [], reworkAttemptsTruncated: (reworkAttempts?.size || 0) > 100, reworkAttempts: attemptRows, packagingEventsTruncated: packagingEvents.truncated, packagingEvents: packagingEvents.rows } as Record<string, any>;
    }));
    const auditEvents = audit?.docs.slice(0, 100).map(doc => { const event = doc.data(); return { id: doc.id, action: event.action, actorUid: event.actorUid, actorName: event.actorName || event.actorUid, createdAt: event.createdAt, revision: event.revision, reason: event.payload?.reason || '', previousSupervisorUid: String(event.previousSupervisorUid || ''), supervisorUid: event.action === 'reassignSupervisor' ? String(event.payload?.supervisorUid || '') : '' }; }) || [];
    const supervisorUidsToResolve = new Set<string>();
    for (const event of auditEvents) { if (event.previousSupervisorUid) supervisorUidsToResolve.add(event.previousSupervisorUid); if (event.supervisorUid) supervisorUidsToResolve.add(event.supervisorUid); }
    const supervisorNameDocs = await Promise.all([...supervisorUidsToResolve].map(supervisorUid => db.collection('users').doc(supervisorUid).get()));
    const supervisorNames = new Map(supervisorNameDocs.map(doc => [doc.id, String(doc.data()?.displayName || doc.id)]));
    const resolvedAudit = auditEvents.map(event => ({ ...event, previousSupervisorUid: event.previousSupervisorUid ? (supervisorNames.get(event.previousSupervisorUid) || event.previousSupervisorUid) : '', supervisorUid: event.supervisorUid ? (supervisorNames.get(event.supervisorUid) || event.supervisorUid) : '' }));
    return { ...clean(data), id, auditTruncated: (audit?.size || 0) > 100, audit: resolvedAudit, inspectorUids: lineAssignment.data()?.inspectorUids || [], planRevisionsTruncated: (planRevisions?.size || 0) > 100, planRevisions: planRevisions?.docs.slice(0, 100).map(doc => ({ ...clean(doc.data()), id: doc.id })) || [], slots: slotRows.sort((a, b) => String(a.date + a.startTime).localeCompare(String(b.date + b.startTime))) };
  }));
  const directory: Record<string, { id: string; name: string }[]> = { products: [], lines: [], supervisors: [], inspectors: [], workers: [] };
  if (input.directory) {
    const DIRECTORY_LIMIT = 5000;
    const basic = async (collection: string) => {
      const snap = await db.collection(collection).where('tenantId', '==', tenantId).limit(DIRECTORY_LIMIT + 1).get();
      if (snap.size > DIRECTORY_LIMIT) throw new HttpsError('resource-exhausted', 'دليل الاختيار كبير جدًا؛ يحتاج بحثًا مقسمًا (لم يُبنَ بعد).');
      return snap.docs.filter(doc => collection === 'employees' ? doc.data().isActive === true : doc.data().isActive !== false).map(doc => ({ id: doc.id, name: String(doc.data().name || doc.id) }));
    };
    if (permissions['workOrders.create'] === true) [directory.products, directory.lines] = await Promise.all([basic('products'), basic('production_lines')]);
    if (supervisor) {
      const scopeLineId = input.orderId && rows[0] ? String(rows[0].data.lineId || '') : '';
      if (scopeLineId) {
        const assignmentsSnap = await db.collection('production_line_worker_assignments')
          .where('tenantId', '==', tenantId).where('lineId', '==', scopeLineId).where('isActive', '==', true).limit(301).get();
        const productionWorkerIds = [...new Set(assignmentsSnap.docs.slice(0, 300).map(doc => String(doc.data().workerId || '')).filter(Boolean))];
        const workerDocs = await Promise.all(productionWorkerIds.map(pwId => db.collection('production_workers').doc(pwId).get()));
        const employeeIds = new Set(workerDocs.map(doc => String(doc.data()?.employeeId || '')).filter(Boolean));
        const allEmployees = await basic('employees');
        directory.workers = allEmployees.filter(employee => employeeIds.has(employee.id));
      } else {
        directory.workers = await basic('employees');
      }
    }
    if (permissions['workOrders.create'] === true || permissions['workOrders.approve'] === true || permissions['workOrders.assignInspectors'] === true) {
      const [users, roles] = await Promise.all([db.collection('users').where('tenantId', '==', tenantId).limit(DIRECTORY_LIMIT + 1).get(), db.collection('roles').where('tenantId', '==', tenantId).limit(DIRECTORY_LIMIT + 1).get()]);
      if (users.size > DIRECTORY_LIMIT || roles.size > DIRECTORY_LIMIT) throw new HttpsError('resource-exhausted', 'دليل المستخدمين كبير جدًا؛ يحتاج بحثًا مقسمًا (لم يُبنَ بعد).');
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

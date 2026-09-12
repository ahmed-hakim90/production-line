import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';

// Deliberately unavailable in deployed environments until all rollout gates pass.
export function requireWorkOrderLab() {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
  if (!project.startsWith('demo-') || !/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw new HttpsError('failed-precondition', 'الدورة الجديدة متاحة في المختبر المحلي فقط.');
  }
}

const permissions = {
  prepare: 'workOrders.create', approve: 'workOrders.approve',
  assignInspectors: 'workOrders.assignInspectors', defineQualityReport: 'workOrders.assignInspectors',
  assignWorkers: 'workOrders.execute', start: 'workOrders.execute',
  submit: 'workOrders.execute', pause: 'workOrders.execute', resume: 'workOrders.execute', submitQualityReport: 'workOrders.inspect',
} as const;
type Action = keyof typeof permissions;
type Input = { requestId: string; orderId: string; action: Action; payload?: Record<string, unknown> };
function fail(message: string): never { throw new HttpsError('failed-precondition', message); }
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,120}$/.test(value)) throw new HttpsError('invalid-argument', 'هوية غير صالحة.');
  return value;
}
function quantity(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw new HttpsError('invalid-argument', 'كمية غير صالحة.');
  }
  return value;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) fail('اختر التكليف الفعلي.');
  const result = (value as unknown[]).map(id);
  if (new Set(result).size !== result.length) fail('التكليف مكرر.');
  return result;
}
function reason(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) fail('السبب مطلوب، بحد أقصى ٢٠٠٠ حرف.');
  return (value as string).trim();
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}

/** Auth records, assignments, state, request receipt and audit commit in one transaction. */
export async function executeWorkOrderCycle(uid: string, input: Input) {
  requireWorkOrderLab();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  if (!input || !Object.hasOwn(permissions, input.action)) throw new HttpsError('invalid-argument', 'إجراء غير صالح.');
  const orderId = id(input.orderId); const requestId = id(input.requestId);
  const payload = input.payload || {};
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new HttpsError('invalid-argument', 'بيانات الإجراء غير صالحة.');
  const encoded = canonical({ ...input, payload });
  if (encoded.length > 100_000) throw new HttpsError('invalid-argument', 'حجم الطلب أكبر من المسموح.');
  const fingerprint = createHash('sha256').update(encoded).digest('hex');
  const db = getDb(); const orderRef = db.collection('work_orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const user = (await tx.get(db.collection('users').doc(uid))).data();
    if (user?.isActive !== true || !user.tenantId || !user.roleId) throw new HttpsError('permission-denied', 'الحساب غير نشط أو غير مرتبط بدور.');
    const tenantId = String(user.tenantId);
    const role = (await tx.get(db.collection('roles').doc(String(user.roleId)))).data();
    if (role?.tenantId !== tenantId || role.permissions?.[permissions[input.action]] !== true) throw new HttpsError('permission-denied', 'ليس لديك صلاحية الإجراء.');
    const receiptRef = orderRef.collection('cycle_requests').doc(requestId);
    const receipt = (await tx.get(receiptRef)).data();
    if (receipt) {
      if (receipt.uid !== uid || receipt.tenantId !== tenantId || receipt.fingerprint !== fingerprint) throw new HttpsError('already-exists', 'رقم الطلب مستخدم لإجراء مختلف.');
      return receipt.result;
    }
    const order = (await tx.get(orderRef)).data();
    const now = new Date().toISOString();
    const result = { ok: true, orderId, requestId, revision: Number(order?.cycleRevision || 0) + 1 };
    const patch: Record<string, unknown> = { cycleRevision: result.revision, updatedAt: FieldValue.serverTimestamp() };
    if (input.action === 'prepare') {
      if (order) fail('أمر الشغل موجود بالفعل؛ لا يتم تحويل الأوامر القديمة تلقائيًا.');
      const productId = id(payload.productId); const lineId = id(payload.lineId); const supervisorUid = id(payload.supervisorUid);
      const product = (await tx.get(db.collection('products').doc(productId))).data();
      const line = (await tx.get(db.collection('production_lines').doc(lineId))).data();
      const supervisor = (await tx.get(db.collection('users').doc(supervisorUid))).data();
      if (product?.tenantId !== tenantId || product.isActive === false || line?.tenantId !== tenantId || line.isActive === false || supervisor?.tenantId !== tenantId || supervisor.isActive !== true) fail('المنتج أو الخط أو المشرف خارج المصنع أو غير صالح.');
      const supervisorRole = supervisor.roleId ? (await tx.get(db.collection('roles').doc(String(supervisor.roleId)))).data() : null;
      if (supervisorRole?.tenantId !== tenantId || supervisorRole.permissions?.['workOrders.execute'] !== true) fail('المشرف لا يملك صلاحية التشغيل.');
      const requested = quantity(payload.quantity, true);
      if (!Array.isArray(payload.slots) || !payload.slots.length || payload.slots.length > 240) fail('خطة الساعات مطلوبة بحد أقصى ٢٤٠ ساعة.');
      const slots = (payload.slots as Record<string, unknown>[]).map((slot, index) => {
        const date = String(slot.date || ''); const startTime = String(slot.startTime || ''); const endTime = String(slot.endTime || '');
        const parsedDate = new Date(date + 'T00:00:00Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) fail('توقيت الساعة غير صالح؛ عبور منتصف الليل غير مدعوم بعد.');
        return { id: `hour-${String(index + 1).padStart(3, '0')}`, date, startTime, endTime, targetQuantity: quantity(slot.targetQuantity), status: 'planned', tenantId, workOrderId: orderId };
      });
      for (let i = 1; i < slots.length; i++) {
        if (slots[i].date + slots[i].startTime < slots[i - 1].date + slots[i - 1].endTime) fail('الساعات متداخلة أو غير مرتبة.');
      }
      if (Math.abs(slots.reduce((sum, slot) => sum + slot.targetQuantity, 0) - requested) > 0.001) fail('مجموع أهداف الساعات لا يساوي كمية الأمر.');
      Object.assign(patch, { tenantId, cycleVersion: 2, productionStatus: 'draft', status: 'pending', fulfillmentStatus: 'pending', productId, lineId, supervisorUid, productName: String(product.name || productId), lineName: String(line.name || lineId), supervisorName: String(supervisor.displayName || supervisorUid), quantity: requested, approvedAcceptedQuantity: 0, producedQuantity: 0, workOrderNumber: reason(payload.workOrderNumber), activeSlotId: null, workerIds: [], inspectorUids: [], preparedBy: uid, preparedAt: now, createdAt: FieldValue.serverTimestamp() });
      for (const slot of slots) tx.create(orderRef.collection('hourly_slots').doc(slot.id), { ...slot, containerId: `${orderId}--${slot.id}` });
      tx.create(orderRef, patch);
    } else {
      if (!order || order.tenantId !== tenantId) throw new HttpsError('permission-denied', 'أمر الشغل غير متاح.');
      if (order.cycleVersion !== 2) fail('هذا الأمر يستخدم الدورة القديمة.');
      const operator = ['assignWorkers', 'start', 'submit', 'pause', 'resume'].includes(input.action);
      if (operator && order.supervisorUid !== uid) throw new HttpsError('permission-denied', 'أنت غير مكلّف بهذا الأمر.');
      if (input.action === 'approve') {
        if (order.productionStatus !== 'draft') fail('الأمر ليس في مرحلة التجهيز.');
        Object.assign(patch, { productionStatus: 'approved', approvedBy: uid, approvedAt: now });
      } else if (input.action === 'assignInspectors') {
        const inspectorUids = ids(payload.inspectorUids);
        for (const inspectorUid of inspectorUids) {
          const inspector = (await tx.get(db.collection('users').doc(inspectorUid))).data();
          if (inspector?.tenantId !== tenantId || inspector.isActive !== true || !inspector.roleId) fail('مراقب غير صالح.');
          const inspectorRole = (await tx.get(db.collection('roles').doc(String(inspector.roleId)))).data();
          if (inspectorRole?.tenantId !== tenantId || inspectorRole.permissions?.['workOrders.inspect'] !== true) fail('المستخدم ليس مراقب جودة.');
        }
        // Line assignment is authoritative across this tenant's orders on that line.
        tx.set(db.collection('work_order_line_assignments').doc(`${tenantId}--${order.lineId}`), { tenantId, lineId: order.lineId, inspectorUids, assignedBy: uid, assignedAt: now });
        Object.assign(patch, { inspectorUids });
      } else if (input.action === 'defineQualityReport') {
        if (!['draft', 'approved'].includes(order.productionStatus)) fail('يجب تعريف نموذج الجودة قبل بدء الإنتاج.');
        if (!Array.isArray(payload.qualityReportTemplate)) fail('نموذج الجودة يجب أن يكون قائمة معايير.');
        const template = (payload.qualityReportTemplate as Record<string, unknown>[]).map((check, idx) => {
          if (typeof check.label !== 'string' || !check.label.trim() || check.label.length > 200) fail(`المعيار ${idx + 1}: الاسم مطلوب، بحد أقصى ٢٠٠ حرف.`);
          const inputType = String(check.inputType || '');
          if (!['number', 'text'].includes(inputType)) fail(`المعيار ${idx + 1}: نوع الإدخال يجب أن يكون رقم أو نص.`);
          if (typeof check.required !== 'boolean') fail(`المعيار ${idx + 1}: حالة الإلزام مطلوبة.`);
          const result: Record<string, unknown> = { id: String(check.id || `check-${idx}`), label: String(check.label).trim(), inputType, required: Boolean(check.required) };
          if (inputType === 'number') {
            if (check.minValue !== undefined) {
              if (typeof check.minValue !== 'number' || !Number.isFinite(check.minValue)) fail(`المعيار ${idx + 1}: الحد الأدنى يجب أن يكون رقم صحيح.`);
              result.minValue = check.minValue;
            }
            if (check.maxValue !== undefined) {
              if (typeof check.maxValue !== 'number' || !Number.isFinite(check.maxValue)) fail(`المعيار ${idx + 1}: الحد الأقصى يجب أن يكون رقم صحيح.`);
              result.maxValue = check.maxValue;
            }
            if (result.minValue !== undefined && result.maxValue !== undefined && Number(result.minValue) > Number(result.maxValue)) fail(`المعيار ${idx + 1}: الحد الأدنى أكبر من الأقصى.`);
          }
          return result;
        });
        if (template.length > 50) fail('عدد معايير الجودة محدود بـ ٥٠ معيار.');
        Object.assign(patch, { qualityReportTemplate: template });
      } else if (input.action === 'submitQualityReport') {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        if (slot.status !== 'quality_pending') fail('الساعة ليست في انتظار فحص الجودة.');
        if (!Array.isArray(order.qualityReportTemplate) || !order.qualityReportTemplate.length) fail('لا يوجد نموذج جودة معرّف.');
        if (!Array.isArray(payload.qualityResults)) fail('نتائج الجودة يجب أن تكون قائمة.');
        const results = (payload.qualityResults as Record<string, unknown>[]).map((result, idx) => {
          if (typeof result.checkId !== 'string' || !result.checkId) fail(`النتيجة ${idx + 1}: معرّف المعيار مطلوب.`);
          if (typeof result.value === 'number' || typeof result.value === 'string') {
            if (typeof result.value === 'string' && !result.value.trim()) fail(`النتيجة ${idx + 1}: القيمة مطلوبة.`);
          } else fail(`النتيجة ${idx + 1}: القيمة مطلوبة.`);
          const notes = typeof result.notes === 'string' ? result.notes.trim() : '';
          if (notes.length > 500) fail(`النتيجة ${idx + 1}: الملاحظات بحد أقصى ٥٠٠ حرف.`);
          return { checkId: String(result.checkId), label: String(result.label || ''), value: result.value, notes };
        });
        tx.update(slotRef, { qualityResults: results, qualityReviewedAt: now, qualityReviewedBy: uid });
      } else {
        if (!['approved', 'in_progress'].includes(order.productionStatus)) fail('الإنتاج غير معتمد أو مقفول.');
        if (input.action === 'assignWorkers') {
          const workerIds = ids(payload.workerIds);
          for (const workerId of workerIds) {
            const worker = (await tx.get(db.collection('employees').doc(workerId))).data();
            if (worker?.tenantId !== tenantId || worker.isActive !== true) fail('عامل غير نشط أو خارج المصنع.');
          }
          Object.assign(patch, { workerIds });
        } else {
          const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
          const slot = (await tx.get(slotRef)).data();
          if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
          const lineRef = db.collection('work_order_line_states').doc(`${tenantId}--${order.lineId}`);
          const lineState = (await tx.get(lineRef)).data();
          if (input.action === 'start') {
            if (order.qualityHold || order.activeSlotId || lineState?.activeOrderId || slot.status !== 'planned') fail('يوجد قفل أو ساعة جارية على الخط.');
            const planned = await tx.get(orderRef.collection('hourly_slots').where('status', '==', 'planned'));
            const first = planned.docs.sort((a, b) => (a.data().date + a.data().startTime).localeCompare(b.data().date + b.data().startTime))[0];
            if (first?.id !== slotId) fail('ابدأ الساعة المخططة التالية.');
            const workerIds = ids(order.workerIds);
            const workersSnapshot: { id: string; name: string }[] = [];
            for (const workerId of workerIds) {
              const worker = (await tx.get(db.collection('employees').doc(workerId))).data();
              if (worker?.tenantId !== tenantId || worker.isActive !== true) fail('راجع تكليف العمالة قبل التشغيل.');
              workersSnapshot.push({ id: workerId, name: String(worker.name || workerId) });
            }
            tx.update(slotRef, { status: 'open', openedAt: now, openedBy: uid, workerIdsSnapshot: workerIds, workersSnapshot, workersSnapshotCount: workerIds.length });
            tx.set(lineRef, { tenantId, activeOrderId: orderId, activeSlotId: slotId });
            Object.assign(patch, { activeSlotId: slotId, productionStatus: 'in_progress', status: 'in_progress' });
          } else {
            if (order.activeSlotId !== slotId || lineState?.activeOrderId !== orderId || lineState.activeSlotId !== slotId) fail('الساعة ليست الجارية.');
            if (input.action === 'submit') {
              if (slot.status !== 'open' || order.qualityHold) fail('الساعة متوقفة.');
              const actualQuantity = quantity(payload.actualQuantity); const rejectedQuantity = quantity(payload.rejectedQuantity);
              if (rejectedQuantity > actualQuantity) fail('المرفوض يتجاوز المنتج.');
              const notes = typeof payload.notes === 'string' ? payload.notes.trim() : '';
              if (notes.length > 2000) fail('الملاحظات بحد أقصى ٢٠٠٠ حرف.');
              tx.update(slotRef, { status: 'quality_pending', actualQuantity, rejectedQuantity, productionNotes: notes, submittedAt: now, submittedBy: uid, productionDocumentId: `${orderId}--${slotId}--production-v1` });
              tx.set(lineRef, { tenantId, activeOrderId: null, activeSlotId: null });
              Object.assign(patch, { activeSlotId: null, producedQuantity: quantity(Number(order.producedQuantity || 0) + actualQuantity) });
            } else if (input.action === 'pause') {
              if (slot.status !== 'open') fail('الساعة ليست قيد التشغيل.');
              const pauseReason = reason(payload.reason);
              tx.update(slotRef, { status: 'paused', pausedAt: now, pauseReason });
              tx.create(slotRef.collection('stops').doc(requestId), { tenantId, reason: pauseReason, startedAt: now, actorUid: uid, source: 'production' });
              Object.assign(patch, { activeStopId: requestId });
            } else if (input.action === 'resume') {
              if (slot.status !== 'paused' || order.qualityHold || !order.activeStopId) fail('لا يمكن استئناف الساعة.');
              tx.update(slotRef, { status: 'open', resumedAt: now, totalPausedSeconds: Number(slot.totalPausedSeconds || 0) + Math.max(0, (Date.parse(now) - Date.parse(slot.pausedAt)) / 1000) });
              tx.update(slotRef.collection('stops').doc(order.activeStopId), { endedAt: now, resumedBy: uid });
              Object.assign(patch, { activeStopId: null });
            }
          }
        }
      }
      tx.update(orderRef, patch);
    }
    tx.create(receiptRef, { uid, tenantId, fingerprint, result, createdAt: now });
    tx.create(orderRef.collection('cycle_audit').doc(requestId), { tenantId, actorUid: uid, action: input.action, payload, revision: result.revision, createdAt: now });
    return result;
  });
}

export const mutateWorkOrderCycle = onCall({ region: 'us-central1' }, (request) => executeWorkOrderCycle(request.auth?.uid || '', request.data));

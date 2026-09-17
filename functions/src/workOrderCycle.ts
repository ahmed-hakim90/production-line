import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { validateQualityResults } from './workOrderQualityValidation.js';
import { resolveInventoryRoutingFromSettings } from './productionInventoryRouting.js';

// Local-only lock lifted for production activation (explicit decision, 2026-09-15).
export function requireWorkOrderLab() {}

const permissions = {
  prepare: 'workOrders.create', editDraft: 'workOrders.create', reassignSupervisor: 'workOrders.approve', approve: 'workOrders.approve',
  assignInspectors: 'workOrders.assignInspectors', defineQualityReport: 'workOrders.assignInspectors',
  assignWorkers: 'workOrders.execute', start: 'workOrders.execute',
  claimQualityInspection: 'workOrders.inspect', releaseQualityInspection: 'workOrders.assignInspectors',
  submit: 'workOrders.execute', pause: 'workOrders.execute', resume: 'workOrders.execute', submitQualityReport: 'workOrders.inspect',
  approveQualityReport: 'workOrders.assignInspectors', returnQualityReport: 'workOrders.assignInspectors',
  correctQualityReport: 'workOrders.assignInspectors',
  lockQuality: 'workOrders.assignInspectors', unlockQuality: 'workOrders.assignInspectors',
  decideRejectedDisposition: 'workOrders.assignInspectors', submitRework: 'workOrders.execute',
  claimReworkInspection: 'workOrders.inspect', submitReworkQualityReport: 'workOrders.inspect',
  approveReworkQualityReport: 'workOrders.assignInspectors',
  receivePackaging: 'productionHandover.approve', packageContainer: 'productionHandover.approve',
  deliverToWarehouse: 'productionHandover.approve',
  proposePlanRevision: 'workOrders.approve', applyPlanRevision: 'workOrders.approve',
  closeProduction: 'workOrders.approve',
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
    const hasPermission = role?.permissions?.[permissions[input.action]] === true;
    if (role?.tenantId !== tenantId || !hasPermission) throw new HttpsError('permission-denied', 'ليس لديك صلاحية الإجراء.');
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
    if (input.action === 'prepare' || input.action === 'editDraft') {
      if (input.action === 'prepare' && order) fail('أمر الشغل موجود بالفعل؛ لا يتم تحويل الأوامر القديمة تلقائيًا.');
      const editing = input.action === 'editDraft';
      if (editing && (!order || order.tenantId !== tenantId || order.cycleVersion !== 2)) throw new HttpsError('permission-denied', 'الأمر غير متاح للتعديل.');
      if (editing && (order!.productionStatus !== 'draft' || order!.activeSlotId)) fail('التعديل متاح للمسودة فقط.');
      if (editing && payload.expectedRevision !== order!.cycleRevision) fail('تغير الأمر؛ حدّث البيانات وراجع التعديل.');
      const previousSlots = editing ? await tx.get(orderRef.collection('hourly_slots')) : null;
      if (previousSlots?.docs.some(doc => doc.data().status !== 'planned')) fail('لا يمكن تغيير ساعات بدأت بالفعل.');
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
      if (editing) {
        // Keep original preparation metadata and all unrelated fields. Archive the prior draft atomically.
        tx.create(orderRef.collection('draft_versions').doc(requestId), { order, slots: previousSlots!.docs.map(doc => ({ ...doc.data(), id: doc.id })), replacedAt: now, actorUid: uid });
        for (const field of ['preparedBy', 'preparedAt', 'createdAt', 'workerIds', 'inspectorUids']) delete patch[field];
        if (order!.lineId !== lineId) Object.assign(patch, { workerIds: [], inspectorUids: [] });
        if (order!.productId !== productId) patch.qualityReportTemplate = FieldValue.delete();
        const nextIds = new Set(slots.map(slot => slot.id));
        for (const old of previousSlots!.docs) if (!nextIds.has(old.id)) tx.delete(old.ref);
      }
      for (const slot of slots) tx.set(orderRef.collection('hourly_slots').doc(slot.id), { ...slot, containerId: `${orderId}--${slot.id}` });
      if (editing) tx.update(orderRef, patch); else tx.create(orderRef, patch);
    } else {
      if (!order || order.tenantId !== tenantId) throw new HttpsError('permission-denied', 'أمر الشغل غير متاح.');
      if (order.cycleVersion !== 2) fail('هذا الأمر يستخدم الدورة القديمة.');
      const packagingActions = ['receivePackaging', 'packageContainer', 'deliverToWarehouse'];
      if (order.productionStatus === 'closed' && input.action !== 'closeProduction' && !packagingActions.includes(input.action)) fail('الإنتاج مقفل؛ لا يمكن تنفيذ هذا الإجراء بعد الإقفال. التغليف والتسليم يبقيان متاحين.');
      const operator = ['assignWorkers', 'start', 'submit', 'pause', 'resume', 'submitRework'].includes(input.action);
      if (operator && order.supervisorUid !== uid) throw new HttpsError('permission-denied', 'أنت غير مكلّف بهذا الأمر.');
      if (input.action === 'reassignSupervisor') {
        if (!['draft', 'approved', 'in_progress'].includes(order.productionStatus)) fail('لا يمكن إعادة الإسناد بعد إقفال الإنتاج.');
        if (payload.expectedRevision !== order.cycleRevision) fail('تغير الأمر؛ حدّث البيانات وراجع الإسناد.');
        const reassignmentReason = reason(payload.reason);
        const supervisorUid = id(payload.supervisorUid);
        if (supervisorUid === order.supervisorUid) fail('اختر مشرفًا مختلفًا.');
        const supervisor = (await tx.get(db.collection('users').doc(supervisorUid))).data();
        if (supervisor?.tenantId !== tenantId || supervisor.isActive !== true || !supervisor.roleId) fail('المشرف غير صالح.');
        const supervisorRole = (await tx.get(db.collection('roles').doc(String(supervisor.roleId)))).data();
        if (supervisorRole?.tenantId !== tenantId || supervisorRole.permissions?.['workOrders.execute'] !== true) fail('المشرف لا يملك صلاحية التشغيل.');
        Object.assign(patch, { supervisorUid, supervisorName: String(supervisor.displayName || supervisorUid) });
        tx.create(orderRef.collection('supervisor_assignments').doc(requestId), { tenantId, previousUid: order.supervisorUid, nextUid: supervisorUid, reason: reassignmentReason, actorUid: uid, createdAt: now });
      } else if (input.action === 'approve') {
        if (order.productionStatus !== 'draft') fail('الأمر ليس في مرحلة التجهيز.');
        Object.assign(patch, { productionStatus: 'approved', approvedBy: uid, approvedAt: now });
      } else if (input.action === 'lockQuality') {
        if (order.qualityHold) fail('التشغيل مقفول بالفعل.');
        const lockReason = reason(payload.reason);
        let pausedSlotId: string | null = null;
        if (order.activeSlotId) {
          const activeSlotRef = orderRef.collection('hourly_slots').doc(String(order.activeSlotId));
          const activeSlot = (await tx.get(activeSlotRef)).data();
          if (activeSlot?.status === 'open') {
            tx.update(activeSlotRef, { status: 'paused', pausedAt: now, pauseReason: lockReason });
            tx.create(activeSlotRef.collection('stops').doc(requestId), { tenantId, reason: lockReason, startedAt: now, actorUid: uid, source: 'quality_lock' });
            Object.assign(patch, { activeStopId: requestId });
            pausedSlotId = String(order.activeSlotId);
          }
        }
        tx.create(orderRef.collection('quality_holds').doc(requestId), { tenantId, action: 'lock', reason: lockReason, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now, pausedSlotId });
        tx.create(db.collection('notifications').doc(), { tenantId, recipientId: order.supervisorUid, type: 'work_order_quality_lock', title: `قفل جودة على أمر الشغل ${order.workOrderNumber}`, message: lockReason, referenceId: orderId, isRead: false, createdAt: FieldValue.serverTimestamp() });
        Object.assign(patch, { qualityHold: true, qualityHoldReason: lockReason, qualityHoldBy: uid, qualityHoldByName: String(user.displayName || uid), qualityHoldAt: now });
      } else if (input.action === 'unlockQuality') {
        if (!order.qualityHold) fail('التشغيل غير مقفول حاليًا.');
        const unlockReason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 2000) : '';
        let resumedSlotId: string | null = null;
        if (order.activeSlotId && order.activeStopId) {
          const activeSlotRef = orderRef.collection('hourly_slots').doc(String(order.activeSlotId));
          const activeSlot = (await tx.get(activeSlotRef)).data();
          const stopRef = activeSlotRef.collection('stops').doc(String(order.activeStopId));
          const stop = (await tx.get(stopRef)).data();
          if (activeSlot?.status === 'paused' && stop?.source === 'quality_lock') {
            tx.update(activeSlotRef, { status: 'open', resumedAt: now, totalPausedSeconds: Number(activeSlot.totalPausedSeconds || 0) + Math.max(0, (Date.parse(now) - Date.parse(activeSlot.pausedAt)) / 1000) });
            tx.update(stopRef, { endedAt: now, resumedBy: uid });
            Object.assign(patch, { activeStopId: null });
            resumedSlotId = String(order.activeSlotId);
          }
        }
        tx.create(orderRef.collection('quality_holds').doc(requestId), { tenantId, action: 'unlock', reason: unlockReason, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now, resumedSlotId });
        Object.assign(patch, { qualityHold: false, qualityHoldReason: FieldValue.delete(), qualityHoldBy: FieldValue.delete(), qualityHoldByName: FieldValue.delete(), qualityHoldAt: FieldValue.delete() });
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
        if (!template.length || template.length > 50 || new Set(template.map(check => check.id)).size !== template.length) fail('النموذج يتطلب من ١ إلى ٥٠ معيارًا بهويات غير مكررة.');
        Object.assign(patch, { qualityReportTemplate: template });
      } else if (input.action === 'correctQualityReport') {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        if (slot.status !== 'quality_accepted') fail('التصحيح متاح فقط بعد اعتماد نتيجة الفحص.');
        if (Number(slot.packagingReceivedQuantity || 0) > 0) fail('لا يمكن تصحيح تقرير بدأ التغليف استلامه؛ الكمية تحركت بالفعل.');
        const correctionReason = reason(payload.reason);
        const inspectedTotal = quantity(Number(slot.inspectedQuantity || 0));
        const newAccepted = quantity(payload.acceptedQuantity);
        const newRejected = quantity(payload.rejectedQuantity);
        if (Math.abs(newAccepted + newRejected - inspectedTotal) > 0.000001) fail('مجموع المقبول والمرفوض بعد التصحيح يجب أن يساوي إجمالي المفحوص.');
        const previousAccepted = Number(slot.qualityApprovedAcceptedQuantity || 0);
        const previousRejected = Number(slot.qualityApprovedRejectedQuantity || 0);
        if (newAccepted === previousAccepted && newRejected === previousRejected) fail('لا يوجد تغيير فعلي لتسجيله.');
        tx.create(slotRef.collection('quality_corrections').doc(requestId), { tenantId, workOrderId: orderId, slotId, previousAcceptedQuantity: previousAccepted, previousRejectedQuantity: previousRejected, newAcceptedQuantity: newAccepted, newRejectedQuantity: newRejected, reason: correctionReason, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now });
        tx.update(slotRef, { qualityApprovedAcceptedQuantity: newAccepted, qualityApprovedRejectedQuantity: newRejected, qualityCorrectionCount: FieldValue.increment(1) });
        Object.assign(patch, { approvedAcceptedQuantity: Number(order.approvedAcceptedQuantity || 0) - previousAccepted + newAccepted });
      } else if (input.action === 'decideRejectedDisposition') {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        const attemptId = payload.attemptId !== undefined && payload.attemptId !== null && payload.attemptId !== '' ? id(payload.attemptId) : null;
        const targetRef = attemptId ? slotRef.collection('rework_attempts').doc(attemptId) : slotRef;
        const target = attemptId ? (await tx.get(targetRef)).data() : slot;
        if (attemptId && (!target || target.tenantId !== tenantId || target.slotId !== slotId)) fail('محاولة إعادة التشغيل غير صالحة.');
        if (target!.status !== 'quality_accepted') fail('القرار متاح فقط بعد اعتماد نتيجة الفحص.');
        if (target!.rejectedDisposition) fail('تم اتخاذ قرار المرفوض بالفعل لهذه الحاوية.');
        const totalRejected = Number(target!.qualityApprovedRejectedQuantity || 0);
        if (totalRejected <= 0) fail('لا توجد كمية مرفوضة لاتخاذ قرار بشأنها.');
        const dispositionReason = reason(payload.reason);
        const reworkQuantity = quantity(payload.reworkQuantity);
        const scrapQuantity = quantity(payload.scrapQuantity);
        if (Math.abs(reworkQuantity + scrapQuantity - totalRejected) > 0.000001) fail('مجموع إعادة التشغيل والهالك النهائي يجب أن يساوي إجمالي المرفوض.');
        const attemptsSnap = reworkQuantity > 0 ? await tx.get(slotRef.collection('rework_attempts')) : null;
        tx.update(targetRef, { rejectedDisposition: { reworkQuantity, scrapQuantity, reason: dispositionReason, actorUid: uid, actorName: String(user.displayName || uid), decidedAt: now } });
        if (reworkQuantity > 0) {
          tx.create(slotRef.collection('rework_attempts').doc(requestId), { tenantId, workOrderId: orderId, slotId, parentAttemptId: attemptId, attemptNumber: attemptsSnap!.size + 1, requestedQuantity: reworkQuantity, status: 'planned', reason: dispositionReason, createdBy: uid, createdByName: String(user.displayName || uid), createdAt: now });
        }
      } else if (input.action === 'submitRework') {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        const attemptId = id(payload.attemptId); const attemptRef = slotRef.collection('rework_attempts').doc(attemptId);
        const attempt = (await tx.get(attemptRef)).data();
        if (!attempt || attempt.tenantId !== tenantId || attempt.slotId !== slotId) fail('محاولة إعادة التشغيل غير صالحة.');
        if (attempt.status !== 'planned') fail('محاولة إعادة التشغيل ليست بانتظار التسجيل.');
        const actualQuantity = quantity(payload.actualQuantity, true);
        if (actualQuantity > Number(attempt.requestedQuantity)) fail('لا يمكن أن يتجاوز الناتج الكمية المرسلة لإعادة التشغيل.');
        const notes = typeof payload.notes === 'string' ? payload.notes.trim() : '';
        if (notes.length > 2000) fail('الملاحظات بحد أقصى ٢٠٠٠ حرف.');
        tx.update(attemptRef, { status: 'quality_pending', actualQuantity, notes, submittedAt: now, submittedBy: uid });
      } else if (['claimReworkInspection', 'submitReworkQualityReport', 'approveReworkQualityReport'].includes(input.action)) {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        const attemptId = id(payload.attemptId); const attemptRef = slotRef.collection('rework_attempts').doc(attemptId);
        const attempt = (await tx.get(attemptRef)).data();
        if (!attempt || attempt.tenantId !== tenantId || attempt.slotId !== slotId) fail('محاولة إعادة التشغيل غير صالحة.');
        if (!Array.isArray(order.qualityReportTemplate) || !order.qualityReportTemplate.length) fail('لا يوجد نموذج جودة معرّف.');
        if (attempt.status !== 'quality_pending') fail('محاولة إعادة التشغيل ليست في انتظار فحص الجودة.');
        const claim = attempt.qualityClaim;
        if (input.action === 'approveReworkQualityReport') {
          if (claim) fail('يوجد حجز فحص نشط؛ فكه أولًا.');
          const inspected = quantity(Number(attempt.inspectedQuantity || 0));
          const remaining = quantity(Number(attempt.actualQuantity)) - inspected;
          if (remaining > 0) fail('الفحص غير مكتمل بعد؛ لا يمكن الاعتماد.');
          const acceptedQuantity = Number(attempt.inspectedAcceptedQuantity || 0);
          const rejectedQuantity = Number(attempt.inspectedRejectedQuantity || 0);
          tx.update(attemptRef, { status: 'quality_accepted', qualityApprovedAcceptedQuantity: acceptedQuantity, qualityApprovedRejectedQuantity: rejectedQuantity, qualityApprovedBy: uid, qualityApprovedByName: String(user.displayName || uid), qualityApprovedAt: now });
          Object.assign(patch, { approvedAcceptedQuantity: Number(order.approvedAcceptedQuantity || 0) + acceptedQuantity });
        } else {
          const assignment = (await tx.get(db.collection('work_order_line_assignments').doc(`${tenantId}--${order.lineId}`))).data();
          if (assignment?.tenantId !== tenantId || assignment.lineId !== order.lineId || !Array.isArray(assignment.inspectorUids) || !assignment.inspectorUids.includes(uid)) throw new HttpsError('permission-denied', 'أنت غير مكلّف بفحص هذا الخط.');
          const inspected = quantity(Number(attempt.inspectedQuantity || 0));
          const remaining = quantity(Number(attempt.actualQuantity)) - inspected;
          if (input.action === 'claimReworkInspection') {
            if (claim || remaining <= 0) fail('الفحص محجوز أو اكتملت كمية الفحص.');
            tx.update(attemptRef, { qualityClaim: { id: requestId, uid, name: String(user.displayName || uid), startedAt: now } });
          } else {
            if (!claim || claim.uid !== uid || claim.id !== id(payload.claimId)) fail('ابدأ حجز الفحص أولًا؛ الحجز الحالي لا يخص هذه المشاركة.');
            const inspectedQuantity = quantity(payload.inspectedQuantity, true);
            const acceptedQuantity = quantity(payload.acceptedQuantity);
            const rejectedQuantity = quantity(payload.rejectedQuantity);
            if (inspectedQuantity > remaining || Math.abs(acceptedQuantity + rejectedQuantity - inspectedQuantity) > 0.000001) fail('كميات المشاركة لا تتطابق أو تتجاوز المتبقي.');
            const results = validateQualityResults(order.qualityReportTemplate, payload.qualityResults);
            tx.create(attemptRef.collection('quality_contributions').doc(claim.id), { tenantId, workOrderId: orderId, slotId, attemptId, claimId: claim.id, inspectorUid: uid, inspectorName: String(user.displayName || uid), startedAt: claim.startedAt, submittedAt: now, inspectedQuantity, acceptedQuantity, rejectedQuantity, results, templateSnapshot: order.qualityReportTemplate });
            tx.update(attemptRef, { qualityClaim: null, inspectedQuantity: inspected + inspectedQuantity, inspectedAcceptedQuantity: Number(attempt.inspectedAcceptedQuantity || 0) + acceptedQuantity, inspectedRejectedQuantity: Number(attempt.inspectedRejectedQuantity || 0) + rejectedQuantity });
          }
        }
      } else if (['receivePackaging', 'packageContainer', 'deliverToWarehouse'].includes(input.action)) {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        const attemptId = payload.attemptId !== undefined && payload.attemptId !== null && payload.attemptId !== '' ? id(payload.attemptId) : null;
        const targetRef = attemptId ? slotRef.collection('rework_attempts').doc(attemptId) : slotRef;
        const target = attemptId ? (await tx.get(targetRef)).data() : slot;
        if (attemptId && (!target || target.tenantId !== tenantId || target.slotId !== slotId)) fail('محاولة إعادة التشغيل غير صالحة.');
        if (target!.status !== 'quality_accepted') fail('الاستلام متاح فقط من مقبول معتمد بعد اعتماد الجودة.');
        const approved = Number(target!.qualityApprovedAcceptedQuantity || 0);
        const received = Number(target!.packagingReceivedQuantity || 0);
        const packaged = Number(target!.packagingPackagedQuantity || 0);
        const delivered = Number(target!.packagingDeliveredQuantity || 0);
        const moveQuantity = quantity(payload.quantity, true);
        const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 2000) : '';
        if (input.action === 'receivePackaging') {
          if (moveQuantity > approved - received + 0.000001) fail('الكمية تتجاوز المقبول المعتمد غير المستلم بعد.');
          tx.update(targetRef, { packagingReceivedQuantity: received + moveQuantity });
          tx.create(targetRef.collection('packaging_events').doc(requestId), { tenantId, workOrderId: orderId, slotId, attemptId, action: 'receive', quantity: moveQuantity, note, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now });
        } else if (input.action === 'packageContainer') {
          if (moveQuantity > received - packaged + 0.000001) fail('الكمية تتجاوز المستلم غير المغلف بعد.');
          tx.update(targetRef, { packagingPackagedQuantity: packaged + moveQuantity });
          tx.create(targetRef.collection('packaging_events').doc(requestId), { tenantId, workOrderId: orderId, slotId, attemptId, action: 'package', quantity: moveQuantity, note, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now });
        } else {
          if (moveQuantity > packaged - delivered + 0.000001) fail('الكمية تتجاوز المغلف غير المسلّم بعد.');
          const settingsSnap = await tx.get(db.collection('system_settings').doc(tenantId));
          const routing = resolveInventoryRoutingFromSettings((settingsSnap.data() || {}) as { planSettings?: Record<string, unknown> });
          const warehouseId = routing.finalProductWarehouseId;
          if (!warehouseId) fail('مخزن المنتج التام غير مضبوط في إعدادات المصنع؛ راجع إعدادات المخزون قبل التسليم.');
          const productId = String(order.productId || '');
          const productSnap = await tx.get(db.collection('products').doc(productId));
          const product = productSnap.data() as { name?: string; code?: string } | undefined;
          if (!productSnap.exists) fail('المنتج غير موجود.');
          const stockItemRef = db.collection('stock_items').doc(`${warehouseId}__finished_good__${productId}`);
          tx.set(stockItemRef, { warehouseId, itemType: 'finished_good', itemId: productId, itemName: String(product?.name || order.productName || productId), itemCode: String(product?.code || ''), unit: 'piece', quantity: FieldValue.increment(moveQuantity), updatedAt: FieldValue.serverTimestamp(), tenantId }, { merge: true });
          tx.create(db.collection('stock_transactions').doc(requestId), { warehouseId, itemType: 'finished_good', itemId: productId, itemName: String(product?.name || order.productName || productId), itemCode: String(product?.code || ''), unit: 'piece', movementType: 'IN', quantity: moveQuantity, referenceNo: `WO2-PKG-${requestId.slice(0, 8).toUpperCase()}`, note: note || `تسليم تغليف — أمر ${order.workOrderNumber}`, sourceModule: 'work_order_cycle_packaging', sourceId: attemptId ? `${slotId}--${attemptId}` : slotId, createdBy: String(user.displayName || uid), createdByUserId: uid, createdAt: FieldValue.serverTimestamp(), tenantId });
          tx.update(targetRef, { packagingDeliveredQuantity: delivered + moveQuantity });
          tx.create(targetRef.collection('packaging_events').doc(requestId), { tenantId, workOrderId: orderId, slotId, attemptId, action: 'deliver', quantity: moveQuantity, warehouseId, note, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now });
        }
      } else if (['claimQualityInspection', 'releaseQualityInspection', 'submitQualityReport', 'approveQualityReport', 'returnQualityReport'].includes(input.action)) {
        const slotId = id(payload.slotId); const slotRef = orderRef.collection('hourly_slots').doc(slotId);
        const slot = (await tx.get(slotRef)).data();
        if (!slot || slot.tenantId !== tenantId || slot.workOrderId !== orderId) fail('الساعة غير صالحة.');
        if (slot.status !== 'quality_pending') fail('الساعة ليست في انتظار فحص الجودة.');
        if (!Array.isArray(order.qualityReportTemplate) || !order.qualityReportTemplate.length) fail('لا يوجد نموذج جودة معرّف.');
        if (slot.qualityResults !== undefined) fail('هذه الساعة بها نتائج من النموذج السابق؛ يلزم مراجعتها قبل إدخال مشاركات جديدة.');
        const claim = slot.qualityClaim;
        if (input.action === 'releaseQualityInspection') {
          reason(payload.reason);
          if (!claim || claim.id !== id(payload.claimId)) fail('الحجز تغير أو غير موجود؛ حدّث الصفحة.');
          tx.update(slotRef, { qualityClaim: null });
        } else if (input.action === 'approveQualityReport') {
          if (claim) fail('يوجد حجز فحص نشط؛ فكه أولًا.');
          const inspected = quantity(Number(slot.inspectedQuantity || 0));
          const remaining = quantity(Number(slot.actualQuantity)) - inspected;
          if (remaining > 0) fail('الفحص غير مكتمل بعد؛ لا يمكن الاعتماد.');
          const acceptedQuantity = Number(slot.inspectedAcceptedQuantity || 0);
          const rejectedQuantity = Number(slot.inspectedRejectedQuantity || 0);
          tx.update(slotRef, { status: 'quality_accepted', qualityApprovedAcceptedQuantity: acceptedQuantity, qualityApprovedRejectedQuantity: rejectedQuantity, qualityApprovedBy: uid, qualityApprovedByName: String(user.displayName || uid), qualityApprovedAt: now });
          Object.assign(patch, { approvedAcceptedQuantity: Number(order.approvedAcceptedQuantity || 0) + acceptedQuantity });
        } else if (input.action === 'returnQualityReport') {
          if (claim) fail('يوجد حجز فحص نشط؛ فكه أولًا.');
          const returnReason = reason(payload.reason);
          const inspected = Number(slot.inspectedQuantity || 0);
          if (inspected <= 0) fail('لا توجد مشاركات فحص لإرجاعها.');
          const contributions = await tx.get(slotRef.collection('quality_contributions'));
          tx.create(slotRef.collection('quality_returns').doc(requestId), { tenantId, workOrderId: orderId, slotId, reason: returnReason, actorUid: uid, actorName: String(user.displayName || uid), createdAt: now, contributions: contributions.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
          for (const doc of contributions.docs) tx.delete(doc.ref);
          tx.update(slotRef, { inspectedQuantity: 0, inspectedAcceptedQuantity: 0, inspectedRejectedQuantity: 0, qualityClaim: null });
        } else {
          const assignment = (await tx.get(db.collection('work_order_line_assignments').doc(`${tenantId}--${order.lineId}`))).data();
          if (assignment?.tenantId !== tenantId || assignment.lineId !== order.lineId || !Array.isArray(assignment.inspectorUids) || !assignment.inspectorUids.includes(uid)) throw new HttpsError('permission-denied', 'أنت غير مكلّف بفحص هذا الخط.');
          const inspected = quantity(Number(slot.inspectedQuantity || 0));
          const remaining = quantity(Number(slot.actualQuantity)) - inspected;
          if (input.action === 'claimQualityInspection') {
            if (claim || remaining <= 0) fail('الفحص محجوز أو اكتملت كمية الفحص.');
            tx.update(slotRef, { qualityClaim: { id: requestId, uid, name: String(user.displayName || uid), startedAt: now } });
          } else {
            if (!claim || claim.uid !== uid || claim.id !== id(payload.claimId)) fail('ابدأ حجز الفحص أولًا؛ الحجز الحالي لا يخص هذه المشاركة.');
            const inspectedQuantity = quantity(payload.inspectedQuantity, true);
            const acceptedQuantity = quantity(payload.acceptedQuantity);
            const rejectedQuantity = quantity(payload.rejectedQuantity);
            if (inspectedQuantity > remaining || Math.abs(acceptedQuantity + rejectedQuantity - inspectedQuantity) > 0.000001) fail('كميات المشاركة لا تتطابق أو تتجاوز المتبقي.');
            const results = validateQualityResults(order.qualityReportTemplate, payload.qualityResults);
            tx.create(slotRef.collection('quality_contributions').doc(claim.id), { tenantId, workOrderId: orderId, slotId, containerId: slot.containerId, claimId: claim.id, inspectorUid: uid, inspectorName: String(user.displayName || uid), startedAt: claim.startedAt, submittedAt: now, inspectedQuantity, acceptedQuantity, rejectedQuantity, results, templateSnapshot: order.qualityReportTemplate });
            tx.update(slotRef, { qualityClaim: null, inspectedQuantity: inspected + inspectedQuantity, inspectedAcceptedQuantity: Number(slot.inspectedAcceptedQuantity || 0) + acceptedQuantity, inspectedRejectedQuantity: Number(slot.inspectedRejectedQuantity || 0) + rejectedQuantity });
          }
        }
      } else if (input.action === 'closeProduction') {
        if (order.productionStatus === 'closed') fail('الإنتاج مقفل بالفعل.');
        if (!['approved', 'in_progress'].includes(order.productionStatus)) fail('لا يمكن إقفال أمر لم يُعتمد بعد.');
        const slotsSnap = await tx.get(orderRef.collection('hourly_slots'));
        const slotDocs = slotsSnap.docs;
        if (slotDocs.some(doc => ['open', 'paused'].includes(String(doc.data().status)))) fail('توجد ساعة جارية أو متوقفة لم تُحسم بعد.');
        if (slotDocs.some(doc => doc.data().status === 'quality_pending')) fail('توجد ساعة بانتظار اعتماد تقرير الجودة.');
        if (slotDocs.some(doc => Number(doc.data().qualityApprovedRejectedQuantity || 0) > 0 && !doc.data().rejectedDisposition)) fail('توجد كمية مرفوضة لم يُتخذ قرار بشأنها بعد.');
        const reworkSnaps = await Promise.all(slotDocs.map(doc => tx.get(doc.ref.collection('rework_attempts'))));
        const allAttempts = reworkSnaps.flatMap(snap => snap.docs.map(doc => doc.data()));
        if (allAttempts.some(attempt => ['planned', 'quality_pending'].includes(String(attempt.status)))) fail('توجد محاولة إعادة تشغيل قيد التنفيذ أو بانتظار الفحص.');
        if (allAttempts.some(attempt => Number(attempt.qualityApprovedRejectedQuantity || 0) > 0 && !attempt.rejectedDisposition)) fail('توجد كمية مرفوضة من إعادة التشغيل لم يُتخذ قرار بشأنها بعد.');
        const plannedSlots = slotDocs.filter(doc => doc.data().status === 'planned');
        const closeReason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 2000) : '';
        const achieved = Number(order.approvedAcceptedQuantity || 0);
        const deficit = achieved < Number(order.quantity || 0);
        if ((deficit || plannedSlots.length > 0) && !closeReason) fail('سبب الإقفال مطلوب عند وجود عجز عن الهدف أو ساعات لم تبدأ بعد.');
        for (const doc of plannedSlots) {
          tx.update(doc.ref, { status: 'cancelled', cancelledAt: now, cancelledReason: closeReason, cancelledBy: uid, cancelledByName: String(user.displayName || uid) });
        }
        Object.assign(patch, { productionStatus: 'closed', productionClosedAt: now, productionClosedBy: uid, productionClosedByName: String(user.displayName || uid), productionClosedWithDeficit: deficit, productionClosedCancelledSlotCount: plannedSlots.length });
        if (closeReason) patch.productionCloseReason = closeReason;
        tx.create(orderRef.collection('production_closures').doc(requestId), { tenantId, workOrderId: orderId, reason: closeReason, deficit, achievedQuantity: achieved, targetQuantity: Number(order.quantity || 0), cancelledSlotIds: plannedSlots.map(doc => doc.id), actorUid: uid, actorName: String(user.displayName || uid), createdAt: now });
      } else if (['proposePlanRevision', 'applyPlanRevision'].includes(input.action)) {
        if (!['approved', 'in_progress'].includes(order.productionStatus)) fail('التخطيط متاح فقط بعد اعتماد الأمر.');
        if (input.action === 'applyPlanRevision') {
          const revisionId = id(payload.revisionId);
          const revisionRef = orderRef.collection('plan_revisions').doc(revisionId);
          const revision = (await tx.get(revisionRef)).data();
          if (!revision || revision.tenantId !== tenantId || revision.workOrderId !== orderId) fail('الاقتراح غير موجود.');
          if (revision.status !== 'proposed') fail('هذا الاقتراح لم يعد قابلًا للاعتماد؛ أعد الحساب.');
          if (Number(order.approvedAcceptedQuantity || 0) !== Number(revision.achievedQuantity || 0)) fail('تغيّر تنفيذ الأمر منذ الاقتراح؛ أعد حساب التوزيع.');
          const slotsSnap = await tx.get(orderRef.collection('hourly_slots'));
          const slotById = new Map(slotsSnap.docs.map(doc => [doc.id, doc.data()]));
          const revisionSlots = revision.slots as { slotId: string; previousTargetQuantity: number; proposedTargetQuantity: number }[];
          for (const entry of revisionSlots) {
            const current = slotById.get(entry.slotId);
            if (!current || current.status !== 'planned' || Number(current.targetQuantity) !== Number(entry.previousTargetQuantity)) fail('تغيّرت إحدى الساعات المقترحة منذ الاقتراح؛ أعد حساب التوزيع.');
          }
          for (const entry of revisionSlots) tx.update(orderRef.collection('hourly_slots').doc(entry.slotId), { targetQuantity: entry.proposedTargetQuantity });
          tx.update(revisionRef, { status: 'approved', approvedAt: now, approvedBy: uid, approvedByName: String(user.displayName || uid) });
        } else {
          const slotsSnap = await tx.get(orderRef.collection('hourly_slots'));
          const slotDocs = slotsSnap.docs;
          const plannedSlots = slotDocs.filter(doc => doc.data().status === 'planned').sort((a, b) => String(a.data().date + a.data().startTime).localeCompare(String(b.data().date + b.data().startTime)));
          if (!plannedSlots.length) fail('لا توجد ساعات مستقبلية لم تبدأ لإعادة توزيعها.');
          const pendingQualityQuantity = slotDocs.filter(doc => doc.data().status === 'quality_pending').reduce((sum, doc) => sum + Number(doc.data().actualQuantity || 0), 0);
          const reworkSnaps = await Promise.all(slotDocs.map(doc => tx.get(doc.ref.collection('rework_attempts'))));
          const allAttempts = reworkSnaps.flatMap(snap => snap.docs.map(doc => doc.data()));
          const pendingReworkQuantity = allAttempts.filter(a => a.status === 'planned').reduce((sum, a) => sum + Number(a.requestedQuantity || 0), 0)
            + allAttempts.filter(a => a.status === 'quality_pending').reduce((sum, a) => sum + Number(a.actualQuantity || 0), 0);
          const achieved = Number(order.approvedAcceptedQuantity || 0);
          const remainingToTarget = Math.max(0, Number(order.quantity || 0) - achieved - pendingQualityQuantity - pendingReworkQuantity);
          const hoursOfSlot = (data: Record<string, unknown>) => {
            const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
            return Math.max(0.01, (minutesOf(String(data.endTime)) - minutesOf(String(data.startTime))) / 60);
          };
          const ownHistorical = slotDocs.filter(doc => doc.data().status === 'quality_accepted');
          let sumAccepted = ownHistorical.reduce((sum, doc) => sum + Number(doc.data().qualityApprovedAcceptedQuantity || 0), 0);
          let sumHours = ownHistorical.reduce((sum, doc) => sum + hoursOfSlot(doc.data()), 0);
          let rateSource: 'this_order' | 'product_line_history' | 'original_plan_fallback' = sumHours > 0 ? 'this_order' : 'original_plan_fallback';
          if (sumHours <= 0) {
            const others = await tx.get(db.collection('work_orders').where('tenantId', '==', tenantId).where('productId', '==', order.productId).where('lineId', '==', order.lineId).where('cycleVersion', '==', 2).limit(6));
            const candidateOrders = others.docs.filter(doc => doc.id !== orderId);
            const otherSlotsSnaps = await Promise.all(candidateOrders.map(doc => tx.get(doc.ref.collection('hourly_slots').where('status', '==', 'quality_accepted'))));
            for (const snap of otherSlotsSnaps) {
              for (const doc of snap.docs) { sumAccepted += Number(doc.data().qualityApprovedAcceptedQuantity || 0); sumHours += hoursOfSlot(doc.data()); }
            }
            if (sumHours > 0) rateSource = 'product_line_history';
          }
          const lowConfidence = rateSource === 'original_plan_fallback';
          const ratePerHour = lowConfidence ? null : sumAccepted / sumHours;
          const rawEstimates = plannedSlots.map(doc => ({
            slotId: doc.id,
            previousTargetQuantity: Number(doc.data().targetQuantity || 0),
            rawEstimate: lowConfidence ? Number(doc.data().targetQuantity || 0) : ratePerHour! * hoursOfSlot(doc.data()),
          }));
          const rawSum = rawEstimates.reduce((sum, entry) => sum + entry.rawEstimate, 0);
          const scale = rawSum > 0 ? remainingToTarget / rawSum : 0;
          let allocated = 0;
          const finalSlots = rawEstimates.map((entry, index) => {
            const value = index === rawEstimates.length - 1 ? Math.round(Math.max(0, remainingToTarget - allocated) * 1000) / 1000 : Math.round(entry.rawEstimate * scale * 1000) / 1000;
            allocated += value;
            return { slotId: entry.slotId, previousTargetQuantity: entry.previousTargetQuantity, proposedTargetQuantity: value };
          });
          const previousProposed = await tx.get(orderRef.collection('plan_revisions').where('status', '==', 'proposed'));
          for (const doc of previousProposed.docs) tx.update(doc.ref, { status: 'superseded', supersededAt: now });
          tx.create(orderRef.collection('plan_revisions').doc(requestId), {
            tenantId, workOrderId: orderId, status: 'proposed', proposedAt: now, proposedBy: uid, proposedByName: String(user.displayName || uid),
            basis: { rateSource, ratePerHour, sampleHours: lowConfidence ? 0 : sumHours, lowConfidence },
            remainingToTarget, pendingQualityQuantity, pendingReworkQuantity, achievedQuantity: achieved, targetQuantity: Number(order.quantity || 0),
            slots: finalSlots,
          });
        }
      } else {
        if (!['approved', 'in_progress'].includes(order.productionStatus)) fail('الإنتاج غير معتمد أو مقفول.');
        if (input.action === 'assignWorkers') {
          const hasIds = payload.workerIds !== undefined; const hasCount = payload.workerCount !== undefined;
          if (hasIds === hasCount) fail('حدد تكليف العمالة إما بالأسماء أو بالعدد، وليس الاثنين معًا.');
          if (hasIds) {
            const workerIds = ids(payload.workerIds);
            for (const workerId of workerIds) {
              const worker = (await tx.get(db.collection('employees').doc(workerId))).data();
              if (worker?.tenantId !== tenantId || worker.isActive !== true) fail('عامل غير نشط أو خارج المصنع.');
            }
            Object.assign(patch, { workerIds, workerCount: FieldValue.delete() });
          } else {
            const workerCount = Number(payload.workerCount);
            if (!Number.isInteger(workerCount) || workerCount <= 0 || workerCount > 500) fail('عدد العمالة غير صالح.');
            Object.assign(patch, { workerIds: [], workerCount });
          }
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
            let workerIds: string[] = []; const workersSnapshot: { id: string; name: string }[] = []; let workersSnapshotCount: number;
            if (Array.isArray(order.workerIds) && order.workerIds.length) {
              workerIds = ids(order.workerIds);
              for (const workerId of workerIds) {
                const worker = (await tx.get(db.collection('employees').doc(workerId))).data();
                if (worker?.tenantId !== tenantId || worker.isActive !== true) fail('راجع تكليف العمالة قبل التشغيل.');
                workersSnapshot.push({ id: workerId, name: String(worker.name || workerId) });
              }
              workersSnapshotCount = workerIds.length;
            } else if (Number(order.workerCount) > 0) {
              workersSnapshotCount = Number(order.workerCount);
            } else {
              fail('اختر التكليف الفعلي أو أدخل عدد العمالة قبل التشغيل.');
            }
            tx.update(slotRef, { status: 'open', openedAt: now, openedBy: uid, workerIdsSnapshot: workerIds, workersSnapshot, workersSnapshotCount });
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
    tx.create(orderRef.collection('cycle_audit').doc(requestId), { tenantId, actorUid: uid, actorName: String(user.displayName || uid), action: input.action, payload, previousSupervisorUid: order?.supervisorUid || null, revision: result.revision, createdAt: now });
    return result;
  });
}

export const mutateWorkOrderCycle = onCall({ region: 'us-central1' }, (request) => executeWorkOrderCycle(request.auth?.uid || '', request.data));

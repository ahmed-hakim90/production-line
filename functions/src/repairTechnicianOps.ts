import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { loadProtectedRepairServiceCatalog } from './repairServiceCatalogOps.js';
import { decideTechnicianQrClaim, type TechnicianQrClaimDecision } from './repairTechnicianClaimPolicy.js';
import { recordAssignedJobFullyUnrepairable } from './repairCustomerPortalOps.js';
import { mapLegacyRepairStatus } from './repairStatusIds.js';
import { resolveAssignmentStatusPatch } from './repairAssignmentStatus.js';
import {
  loadTenantWorkflowStatuses,
  resolveNextStatusForAction,
  resolveStatusRole,
} from './repairStatusAdvance.js';

const db = getDb();

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
};

const requireActor = async (request: CallableRequest): Promise<Actor> => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as Record<string, unknown>;
  if (user.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    const role = roleSnap.data() as Record<string, unknown> | undefined;
    if (!roleSnap.exists || String(role?.tenantId || '') !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    permissions = (role?.permissions || {}) as Record<string, boolean>;
  }
  const isSuperAdmin = user.isSuperAdmin === true;
  if (!isSuperAdmin && permissions['repair.jobs.technician'] !== true) {
    throw new HttpsError('permission-denied', 'هذه العملية متاحة للفني فقط.');
  }
  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.name || user.email || uid),
    permissions,
    isSuperAdmin,
  };
};

const cleanNestedLine = (raw: unknown): Record<string, unknown> => {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (/(cost|price|amount|discount|paid|balance|treasury|account|journal|revenue)/i.test(key)) continue;
    next[key] = value;
  }
  return next;
};

export const sanitizeRepairJobForTechnician = (
  id: string,
  raw: Record<string, unknown>,
): Record<string, unknown> => {
  const blocked = new Set([
    'customerId', 'customerName', 'customerPhone', 'customerAddress', 'customerEmail',
    'estimatedCost', 'finalCost', 'finalCostOverride', 'serviceOnlyCost', 'laborCost',
    'paidAmount', 'balanceDue', 'paymentStatus', 'discountAmount', 'discountType',
    'financialState', 'treasuryEntryId', 'deliveryAuthorizationNo',
    'deliveryAuthorizationIssuedAt', 'deliveryAuthorizationIssuedBy',
    'deliveryAuthorizationIssuedByName',
  ]);
  const result: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(raw)) {
    if (blocked.has(key) || /(treasury|journal|revenue)/i.test(key)) continue;
    if (key === 'jobProducts' && Array.isArray(value)) {
      result[key] = value.map(cleanNestedLine);
    } else if (key === 'partsUsed' && Array.isArray(value)) {
      result[key] = value.map(cleanNestedLine);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const resolveActorTechnicianIds = async (actor: Actor): Promise<string[]> => {
  const ids = new Set<string>([actor.uid]);
  const employeeSnap = await db.collection('employees')
    .where('tenantId', '==', actor.tenantId)
    .where('userId', '==', actor.uid)
    .limit(1)
    .get();
  if (!employeeSnap.empty) {
    ids.add(employeeSnap.docs[0].id);
  }
  return Array.from(ids).filter(Boolean);
};

const isAssignedToActor = (job: Record<string, unknown>, technicianIds: string[]) => {
  const assigned = String(job.technicianId || '').trim();
  return assigned.length > 0 && technicianIds.includes(assigned);
};

const loadAssignedJob = async (actor: Actor, jobId: string) => {
  const ref = db.collection('repair_jobs').doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  const job = snap.data() as Record<string, unknown>;
  if (String(job.tenantId || '') !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
  }
  if (!actor.isSuperAdmin) {
    const technicianIds = await resolveActorTechnicianIds(actor);
    if (!isAssignedToActor(job, technicianIds)) {
      throw new HttpsError('permission-denied', 'الطلب غير مسند لك.');
    }
  }
  return { ref, job };
};

const listAssigned = async (actor: Actor) => {
  const technicianIds = await resolveActorTechnicianIds(actor);
  const ids = technicianIds.slice(0, 10);
  if (ids.length === 0) return { ok: true as const, jobs: [] as ReturnType<typeof sanitizeRepairJobForTechnician>[] };
  const snap = await db.collection('repair_jobs')
    .where('tenantId', '==', actor.tenantId)
    .where('technicianId', 'in', ids)
    .limit(500)
    .get();
  const jobs = snap.docs
    .map((row) => sanitizeRepairJobForTechnician(row.id, row.data() as Record<string, unknown>))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  return { ok: true as const, jobs };
};

const rejectClaimDecision = (decision: TechnicianQrClaimDecision): void => {
  if (decision === 'terminal') throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن استلامه للعمل.');
  if (decision === 'assigned_other') throw new HttpsError('already-exists', 'الطلب مسند بالفعل لفني آخر.');
};

const claimJobFromInternalQr = async (actor: Actor, data: Record<string, unknown>) => {
  const jobId = String(data.jobId || '').trim();
  if (!jobId) throw new HttpsError('invalid-argument', 'رقم الطلب مطلوب.');
  const jobRef = db.collection('repair_jobs').doc(jobId);
  // Job + technician identity in parallel so "assigned to someone else" fails without a slow
  // unscoped employees scan, and without waiting for a write transaction first.
  const [jobSnap, actorIds] = await Promise.all([
    jobRef.get(),
    resolveActorTechnicianIds(actor),
  ]);
  if (!jobSnap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  const job = jobSnap.data() as Record<string, unknown>;
  if (String(job.tenantId || '') !== actor.tenantId) throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
  const branchId = String(job.branchId || '').trim();
  const preDecision = decideTechnicianQrClaim({
    isClosed: job.isClosed === true,
    status: String(job.status || ''),
    currentTechnicianId: String(job.technicianId || '').trim(),
    actorUid: actor.uid,
    actorIds,
  });
  rejectClaimDecision(preDecision);
  // Already owned by this technician — open workspace without a no-op transaction.
  if (preDecision === 'already_self') {
    return { ok: true as const, jobId, claimed: false };
  }
  // Desk assign rejects non-branch techs; QR claim must match (no cross-branch claim).
  if (!branchId) throw new HttpsError('failed-precondition', 'الطلب غير مرتبط بفرع.');
  const branchSnap = await db.collection('repair_branches').doc(branchId).get();
  if (!branchSnap.exists) throw new HttpsError('not-found', 'فرع الطلب غير موجود.');
  const branchData = branchSnap.data() as { tenantId?: string; technicianIds?: unknown };
  if (String(branchData.tenantId || '') !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'فرع الطلب خارج شركتك.');
  }
  const branchTechnicianIds = new Set(
    (Array.isArray(branchData.technicianIds) ? branchData.technicianIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  if (!actorIds.some((id) => branchTechnicianIds.has(id))) {
    throw new HttpsError('permission-denied', 'لست فنيًا مربوطًا بفرع هذا الطلب.');
  }
  const at = new Date().toISOString();
  let claimed = false;
  let advancedStatus: string | null = null;
  let statusBeforeClaim = '';
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(jobRef);
    if (!fresh.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const row = fresh.data() as Record<string, unknown>;
    const currentTechnicianId = String(row.technicianId || '').trim();
    const decision = decideTechnicianQrClaim({
      isClosed: row.isClosed === true,
      status: String(row.status || ''),
      currentTechnicianId,
      actorUid: actor.uid,
      actorIds,
    });
    rejectClaimDecision(decision);
    if (decision === 'claim') {
      const patch: Record<string, unknown> = {
        technicianId: actor.uid,
        assignedAt: row.assignedAt || at,
        updatedAt: at,
      };
      statusBeforeClaim = mapLegacyRepairStatus(String(row.status || ''));
      const nextStatus = resolveAssignmentStatusPatch({
        action: 'assign',
        currentStatus: String(row.status || ''),
        jobProducts: Array.isArray(row.jobProducts)
          ? (row.jobProducts as Array<{ technicianDiagnosis?: string | null }>)
          : [],
      });
      if (nextStatus && nextStatus !== statusBeforeClaim) {
        const history = Array.isArray(row.statusHistory) ? [...(row.statusHistory as unknown[])] : [];
        history.push({
          status: nextStatus,
          at,
          technicianId: actor.uid,
          reason: 'إسناد فني عبر QR — بدء الفحص',
          source: 'technician_qr_claim',
        });
        patch.status = nextStatus;
        patch.statusHistory = history;
        advancedStatus = nextStatus;
      }
      tx.update(jobRef, patch);
      claimed = true;
    }
  });
  if (claimed) {
    const events: Promise<unknown>[] = [
      jobRef.collection('service_events').doc(`technician-qr-claim__${actor.uid}`).set({
        tenantId: actor.tenantId, branchId, jobId, at, actorUid: actor.uid, actorName: actor.displayName,
        action: 'technician_assigned', domainEvent: 'technician.assigned', eventSchemaVersion: 1,
        payload: { source: 'internal_qr', technicianId: actor.uid },
      }, { merge: true }),
    ];
    if (advancedStatus && advancedStatus !== statusBeforeClaim) {
      const domainEvent = advancedStatus === 'diagnosing' && statusBeforeClaim !== 'diagnosing'
        ? 'diagnosis.started'
        : 'job.status_changed';
      events.push(jobRef.collection('service_events').doc(`technician-qr-claim-status__${actor.uid}`).set({
        tenantId: actor.tenantId, branchId, jobId, at, actorUid: actor.uid, actorName: actor.displayName,
        action: 'status_change',
        domainEvent,
        eventSchemaVersion: 1,
        statusBefore: statusBeforeClaim,
        statusAfter: advancedStatus,
        note: 'تقدم تلقائي بعد إسناد الفني عبر QR',
      }, { merge: true }));
    }
    if (String(job.customerId || '')) {
      events.push(db.collection('customer_service_events').doc(`technician-qr-claim__${jobId}__${actor.uid}`).set({
        tenantId: actor.tenantId, customerId: String(job.customerId || ''), referenceType: 'repair_job', referenceId: jobId,
        action: 'job.technician_assigned', title: 'بدأ الفني العمل على الطلب',
        message: 'تم استلام الطلب وبدأ أحد الفنيين العمل عليه.', branchId,
        actorUid: actor.uid, actorName: actor.displayName, createdAt: at,
      }, { merge: true }));
    }
    await Promise.all(events);
  }
  return { ok: true as const, jobId, claimed };
};

const normalizeProducts = (
  incoming: unknown,
  existing: unknown,
): Record<string, unknown>[] => {
  const oldRows = Array.isArray(existing) ? existing as Array<Record<string, unknown>> : [];
  const byId = new Map(oldRows.map((row) => [String(row.itemId || ''), row]));
  if (!Array.isArray(incoming)) return oldRows.map(cleanNestedLine);
  return incoming.slice(0, 50).map((raw, index) => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const itemId = String(row.itemId || `item-${index + 1}`).slice(0, 100);
    const old = byId.get(itemId) || oldRows[index] || {};
    const serviceIds = Array.isArray(row.serviceIds)
      ? row.serviceIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 50)
      : [];
    return cleanNestedLine({
      ...old,
      itemId,
      serviceIds,
      technicianDiagnosis: String(row.technicianDiagnosis || '').trim().slice(0, 4000),
      accessories: String(old.accessories || ''),
      accessoryIds: Array.isArray(old.accessoryIds) ? old.accessoryIds : [],
      diagnosis: String(old.diagnosis || ''),
      quantity: Math.max(1, Math.round(Number(old.quantity || 1))),
      inWarranty: Boolean(row.inWarranty ?? old.inWarranty),
    });
  });
};

const saveTechnical = async (actor: Actor, data: Record<string, unknown>) => {
  const jobId = String(data.jobId || '').trim();
  const { ref, job } = await loadAssignedJob(actor, jobId);
  if (job.isClosed === true || ['delivered', 'cancelled'].includes(String(job.status || ''))) {
    throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن تعديله.');
  }
  const products = normalizeProducts(data.jobProducts, job.jobProducts);
  const at = new Date().toISOString();
  const warrantyCount = products.filter((row) => Boolean(row.inWarranty)).length;
  const warrantyScope = warrantyCount === 0
    ? 'none'
    : (warrantyCount === products.length ? 'manufacturer' : 'partial');
  const hasDiagnosis = products.some((row) => String(row.technicianDiagnosis || '').trim());
  const hasService = products.some((row) =>
    Array.isArray(row.serviceIds) && row.serviceIds.some((id) => String(id || '').trim()),
  );
  const hasPart = (Array.isArray(job.partsUsed) ? job.partsUsed as Array<Record<string, unknown>> : [])
    .some((row) => Number(row.quantity || 0) > 0);
  const statuses = await loadTenantWorkflowStatuses(db, actor.tenantId);
  const nextStatus = resolveNextStatusForAction({
    action: 'diagnosis_saved',
    currentStatus: String(job.status || ''),
    statuses,
    hasDiagnosis,
    hasServiceOrPartSignal: hasService || hasPart,
  });
  const prevStatus = mapLegacyRepairStatus(String(job.status || ''));
  const patch: Record<string, unknown> = {
    jobProducts: products,
    isServiceOnly: Boolean(data.isServiceOnly),
    warrantyScope,
    ...(warrantyScope === 'manufacturer' || warrantyScope === 'partial' ? { warranty: 'none' } : {}),
    updatedAt: at,
  };
  if (nextStatus && nextStatus !== prevStatus) {
    const history = Array.isArray(job.statusHistory) ? [...job.statusHistory as unknown[]] : [];
    history.push({ status: nextStatus, at, technicianId: actor.uid, source: 'diagnosis_saved' });
    patch.status = nextStatus;
    patch.statusHistory = history;
  }
  await ref.update(patch);
  if (nextStatus && nextStatus !== prevStatus) {
    await ref.collection('service_events').add({
      tenantId: actor.tenantId,
      branchId: String(job.branchId || ''),
      jobId,
      at,
      actorUid: actor.uid,
      actorName: actor.displayName,
      action: 'status_change',
      domainEvent: nextStatus === 'diagnosing' || resolveStatusRole(nextStatus, statuses) === 'diagnosis'
        ? 'diagnosis.completed'
        : 'job.status_changed',
      eventSchemaVersion: 1,
      statusBefore: prevStatus,
      statusAfter: nextStatus,
      note: 'تقدم تلقائي بعد حفظ التشخيص',
    });
  }
  return {
    ok: true as const,
    job: sanitizeRepairJobForTechnician(jobId, {
      ...job,
      ...patch,
      jobProducts: products,
      isServiceOnly: Boolean(data.isServiceOnly),
      warrantyScope,
      updatedAt: at,
      ...(nextStatus ? { status: nextStatus } : {}),
    }),
  };
};

const changeTechnicalStatus = async (actor: Actor, data: Record<string, unknown>) => {
  const jobId = String(data.jobId || '').trim();
  const requested = mapLegacyRepairStatus(String(data.status || '').trim());
  const { ref, job } = await loadAssignedJob(actor, jobId);
  if (job.isClosed === true || ['delivered', 'cancelled'].includes(String(job.status || ''))) {
    throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن تغيير حالته.');
  }
  const statuses = await loadTenantWorkflowStatuses(db, actor.tenantId);
  const requestedRole = resolveStatusRole(requested, statuses);
  const isRepairDone = requestedRole === 'ready_delivery';
  const isUnrepairable = requestedRole === 'unrepairable' || requested === 'unrepairable';
  if (!isRepairDone && !isUnrepairable) {
    throw new HttpsError(
      'invalid-argument',
      'الورشة تغيّر الحالة يدوياً لـ«تم الإصلاح» أو «غير قابل للإصلاح» فقط. باقي الحالات تتقدم تلقائياً.',
    );
  }
  let status = requested;
  if (isRepairDone) {
    const waitsForParts = (Array.isArray(job.partsUsed) ? job.partsUsed as Array<Record<string, unknown>> : [])
      .some((row) => ['pending_supply', 'ready_to_issue'].includes(String(row.fulfillmentStatus || '')));
    const advanced = resolveNextStatusForAction({
      action: 'repair_done',
      currentStatus: String(job.status || ''),
      statuses,
      waitsForParts,
    });
    if (!advanced) {
      throw new HttpsError(
        'failed-precondition',
        'لا يمكن تعليم الطلب كـ«تم الإصلاح» قبل مرحلة الإصلاح أو مع قطع ناقصة.',
      );
    }
    status = advanced;
  }
  const reason = String(data.reason || '').trim().slice(0, 2000);
  const reasonCode = String(data.reasonCode || '').trim().slice(0, 80);
  if (isUnrepairable && !reasonCode) {
    throw new HttpsError('invalid-argument', 'اختر سبب عدم قابلية الإصلاح من القائمة.');
  }
  if (isRepairDone) {
    const products = Array.isArray(job.jobProducts) ? job.jobProducts as Array<Record<string, unknown>> : [];
    const hasSelectedService = products.some((row) =>
      Array.isArray(row.serviceIds) && row.serviceIds.some((id) => String(id || '').trim()),
    );
    const hasUsedPart = (Array.isArray(job.partsUsed) ? job.partsUsed as Array<Record<string, unknown>> : [])
      .some((row) => Number(row.quantity || 0) > 0);
    if (!hasSelectedService && !hasUsedPart) {
      throw new HttpsError(
        'failed-precondition',
        'اختر خدمة صيانة أو سجّل قطعة غيار قبل تحويل الطلب إلى جاهز للتسليم.',
      );
    }
  }
  const at = new Date().toISOString();
  const history = Array.isArray(job.statusHistory) ? [...job.statusHistory] : [];
  history.push({
    status,
    at,
    technicianId: actor.uid,
    ...(reason ? { reason } : {}),
  });
  if (isUnrepairable) {
    await recordAssignedJobFullyUnrepairable({
      uid: actor.uid,
      tenantId: actor.tenantId,
      displayName: actor.displayName,
      permissions: actor.permissions,
      isSuperAdmin: actor.isSuperAdmin,
      jobId,
      reasonCode,
      reasonNote: reason,
    });
    await ref.set({
      statusHistory: history,
      updatedAt: at,
      resolvedAt: at,
      closedAt: at,
      closedReason: reason,
      isClosed: true,
    }, { merge: true });
    await ref.collection('service_events').add({
      tenantId: actor.tenantId,
      branchId: String(job.branchId || ''),
      jobId,
      at,
      actorUid: actor.uid,
      actorName: actor.displayName,
      action: 'status_change',
      domainEvent: 'job.unrepairable',
      eventSchemaVersion: 1,
      statusBefore: String(job.status || ''),
      statusAfter: status,
      note: reason,
    });
    return { ok: true as const, status };
  }
  await ref.update({
    status,
    statusHistory: history,
    updatedAt: at,
    resolvedAt: at,
  });
  await ref.collection('service_events').add({
    tenantId: actor.tenantId,
    branchId: String(job.branchId || ''),
    jobId,
    at,
    actorUid: actor.uid,
    actorName: actor.displayName,
    action: 'status_change',
    domainEvent: 'job.ready',
    eventSchemaVersion: 1,
    statusBefore: String(job.status || ''),
    statusAfter: status,
    ...(reason ? { note: reason } : {}),
  });
  return { ok: true as const, status };
};

const addPhoto = async (actor: Actor, data: Record<string, unknown>) => {
  const jobId = String(data.jobId || '').trim();
  const url = String(data.url || '').trim();
  if (!url || url.length > 4000) throw new HttpsError('invalid-argument', 'رابط الصورة غير صالح.');
  const { ref, job } = await loadAssignedJob(actor, jobId);
  const urls = Array.isArray(job.repairPhotoUrls) ? job.repairPhotoUrls.map(String) : [];
  const next = Array.from(new Set([...urls, url])).slice(0, 12);
  const at = new Date().toISOString();
  await ref.update({ repairPhotoUrls: next, updatedAt: at });
  await ref.collection('service_events').add({
    tenantId: actor.tenantId, branchId: String(job.branchId || ''), jobId, at,
    actorUid: actor.uid, actorName: actor.displayName, action: 'photo_added',
    domainEvent: 'job.photo_added', eventSchemaVersion: 1, payload: { field: 'repair' },
  });
  return { ok: true as const, repairPhotoUrls: next };
};

const loadPartsCatalog = async (actor: Actor, data: Record<string, unknown>) => {
  const jobId = String(data.jobId || '').trim();
  const { job } = await loadAssignedJob(actor, jobId);
  const branchId = String(job.branchId || '');
  const branchSnap = await db.collection('repair_branches').doc(branchId).get();
  const branch = branchSnap.data() as Record<string, unknown> | undefined;
  if (!branchSnap.exists || String(branch?.tenantId || '') !== actor.tenantId) {
    throw new HttpsError('failed-precondition', 'فرع الصيانة غير صالح.');
  }
  const centerWarehouseId = String(branch?.warehouseId || '');
  // Prefer center spare-parts catalog (branch-scoped) over scanning all tenant materials.
  const [branchPartsSnap, centralWarehouses, serviceCatalog] = await Promise.all([
    db.collection('repair_spare_parts')
      .where('tenantId', '==', actor.tenantId)
      .where('branchId', '==', branchId)
      .limit(300)
      .get(),
    db.collection('warehouses')
      .where('tenantId', '==', actor.tenantId)
      .where('warehouseRole', '==', 'spare_parts_central')
      .limit(5)
      .get(),
    loadProtectedRepairServiceCatalog(actor.tenantId),
  ]);
  const centralWarehouse = centralWarehouses.docs.find((row) => row.data().isActive !== false);
  const balanceId = (warehouseId: string, materialId: string) => `${warehouseId}__material__${materialId}`;

  const materialIds = Array.from(new Set(
    branchPartsSnap.docs
      .map((row) => {
        const data = row.data() as { materialId?: string; componentId?: string };
        return String(data.materialId || data.componentId || '').trim();
      })
      .filter(Boolean),
  )).slice(0, 300);

  let materialDocs: Array<FirebaseFirestore.DocumentSnapshot> = [];
  if (materialIds.length > 0) {
    const materialRefs = materialIds.map((id) => db.collection('materials').doc(id));
    const chunkSize = 100;
    for (let i = 0; i < materialRefs.length; i += chunkSize) {
      const chunk = await db.getAll(...materialRefs.slice(i, i + chunkSize));
      materialDocs = materialDocs.concat(chunk);
    }
  } else {
    // Empty center catalog: bounded spare-parts materials only (never full tenant scan).
    const materialsSnap = await db.collection('materials')
      .where('tenantId', '==', actor.tenantId)
      .where('availableForSpareParts', '==', true)
      .limit(200)
      .get();
    materialDocs = materialsSnap.docs;
  }

  const active = materialDocs.filter((row) => {
    if (!row.exists) return false;
    if (String(row.data()?.tenantId || '') !== actor.tenantId) return false;
    const item = row.data() as { isActive?: boolean; availableForSpareParts?: boolean | null };
    if (item.isActive === false) return false;
    if (item.availableForSpareParts === false) return false;
    return true;
  });

  const stockRefs = active.flatMap((row) => [
    ...(centerWarehouseId ? [db.collection('stock_items').doc(balanceId(centerWarehouseId, row.id))] : []),
    ...(centralWarehouse?.id ? [db.collection('stock_items').doc(balanceId(centralWarehouse.id, row.id))] : []),
  ]);
  let balances: Array<FirebaseFirestore.DocumentSnapshot> = [];
  const stockChunk = 100;
  for (let i = 0; i < stockRefs.length; i += stockChunk) {
    balances = balances.concat(await db.getAll(...stockRefs.slice(i, i + stockChunk)));
  }
  const qtyById = new Map(balances.map((row) => [row.id, Number(row.data()?.quantity || 0)]));
  const materials = active.map((row) => {
    const item = row.data() as Record<string, unknown>;
    return {
      id: row.id,
      name: String(item.name || ''),
      code: String(item.code || ''),
      unit: String(item.baseUnit || item.unit || 'قطعة'),
      centerQty: centerWarehouseId ? Number(qtyById.get(balanceId(centerWarehouseId, row.id)) || 0) : 0,
      centralQty: centralWarehouse?.id ? Number(qtyById.get(balanceId(centralWarehouse.id, row.id)) || 0) : 0,
    };
  });
  return {
    ok: true as const,
    materials,
    centerWarehouseId,
    services: serviceCatalog.services
      .filter((row) => row.enabled !== false)
      .map(({ id, name, enabled }) => ({ id, name, enabled })),
  };
};

export const repairTechnicianOpsHandler = async (request: CallableRequest) => {
  const actor = await requireActor(request);
  const data = (request.data || {}) as Record<string, unknown>;
  const operation = String(data.operation || '');
  if (operation === 'list') return listAssigned(actor);
  if (operation === 'claim_qr') return claimJobFromInternalQr(actor, data);
  if (operation === 'get') {
    const jobId = String(data.jobId || '').trim();
    const { job } = await loadAssignedJob(actor, jobId);
    return { ok: true as const, job: sanitizeRepairJobForTechnician(jobId, job) };
  }
  if (operation === 'save') return saveTechnical(actor, data);
  if (operation === 'status') return changeTechnicalStatus(actor, data);
  if (operation === 'add_photo') return addPhoto(actor, data);
  if (operation === 'catalog') return loadPartsCatalog(actor, data);
  throw new HttpsError('invalid-argument', 'عملية فني غير مدعومة.');
};

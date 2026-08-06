import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { loadProtectedRepairServiceCatalog } from './repairServiceCatalogOps.js';
import { decideTechnicianQrClaim } from './repairTechnicianClaimPolicy.js';
const db = getDb();
const TECH_STATUSES = new Set([
    'received',
    'diagnosing',
    'estimate_ready',
    'waiting_parts',
    'repairing',
    'testing',
    'ready',
    'unrepairable',
]);
const requireActor = async (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists)
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    const user = userSnap.data();
    if (user.isActive === false)
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId)
        throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
    let permissions = {};
    const roleId = String(user.roleId || '').trim();
    if (roleId) {
        const roleSnap = await db.collection('roles').doc(roleId).get();
        const role = roleSnap.data();
        if (!roleSnap.exists || String(role?.tenantId || '') !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        permissions = (role?.permissions || {});
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
const cleanNestedLine = (raw) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const next = {};
    for (const [key, value] of Object.entries(source)) {
        if (/(cost|price|amount|discount|paid|balance|treasury|account|journal|revenue)/i.test(key))
            continue;
        next[key] = value;
    }
    return next;
};
export const sanitizeRepairJobForTechnician = (id, raw) => {
    const blocked = new Set([
        'customerId', 'customerName', 'customerPhone', 'customerAddress', 'customerEmail',
        'estimatedCost', 'finalCost', 'finalCostOverride', 'serviceOnlyCost', 'laborCost',
        'paidAmount', 'balanceDue', 'paymentStatus', 'discountAmount', 'discountType',
        'financialState', 'treasuryEntryId', 'deliveryAuthorizationNo',
        'deliveryAuthorizationIssuedAt', 'deliveryAuthorizationIssuedBy',
        'deliveryAuthorizationIssuedByName',
    ]);
    const result = { id };
    for (const [key, value] of Object.entries(raw)) {
        if (blocked.has(key) || /(treasury|journal|revenue)/i.test(key))
            continue;
        if (key === 'jobProducts' && Array.isArray(value)) {
            result[key] = value.map(cleanNestedLine);
        }
        else if (key === 'partsUsed' && Array.isArray(value)) {
            result[key] = value.map(cleanNestedLine);
        }
        else {
            result[key] = value;
        }
    }
    return result;
};
const resolveActorTechnicianIds = async (actor) => {
    const ids = new Set([actor.uid]);
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
const isAssignedToActor = (job, technicianIds) => {
    const assigned = String(job.technicianId || '').trim();
    return assigned.length > 0 && technicianIds.includes(assigned);
};
const loadAssignedJob = async (actor, jobId) => {
    const ref = db.collection('repair_jobs').doc(jobId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const job = snap.data();
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
const listAssigned = async (actor) => {
    const technicianIds = await resolveActorTechnicianIds(actor);
    const snap = await db.collection('repair_jobs')
        .where('technicianId', 'in', technicianIds.slice(0, 10))
        .limit(500)
        .get();
    const jobs = snap.docs
        .filter((row) => String(row.data().tenantId || '') === actor.tenantId)
        .map((row) => sanitizeRepairJobForTechnician(row.id, row.data()))
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    return { ok: true, jobs };
};
const rejectClaimDecision = (decision) => {
    if (decision === 'terminal')
        throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن استلامه للعمل.');
    if (decision === 'assigned_other')
        throw new HttpsError('already-exists', 'الطلب مسند بالفعل لفني آخر.');
};
const claimJobFromInternalQr = async (actor, data) => {
    const jobId = String(data.jobId || '').trim();
    if (!jobId)
        throw new HttpsError('invalid-argument', 'رقم الطلب مطلوب.');
    const jobRef = db.collection('repair_jobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists)
        throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const job = jobSnap.data();
    if (String(job.tenantId || '') !== actor.tenantId)
        throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
    const branchId = String(job.branchId || '').trim();
    const employeeSnap = await db.collection('employees').where('userId', '==', actor.uid).limit(20).get();
    const employeeIds = employeeSnap.docs
        .filter((doc) => String(doc.data().tenantId || '') === actor.tenantId)
        .map((doc) => doc.id);
    const actorIds = new Set([actor.uid, ...employeeIds]);
    rejectClaimDecision(decideTechnicianQrClaim({ isClosed: job.isClosed === true,
        status: String(job.status || ''), currentTechnicianId: String(job.technicianId || '').trim(),
        actorUid: actor.uid, actorIds: Array.from(actorIds) }));
    const at = new Date().toISOString();
    let claimed = false;
    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(jobRef);
        if (!fresh.exists)
            throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
        const row = fresh.data();
        const currentTechnicianId = String(row.technicianId || '').trim();
        const decision = decideTechnicianQrClaim({ isClosed: row.isClosed === true,
            status: String(row.status || ''), currentTechnicianId, actorUid: actor.uid, actorIds: Array.from(actorIds) });
        rejectClaimDecision(decision);
        if (decision === 'claim') {
            tx.update(jobRef, { technicianId: actor.uid, assignedAt: row.assignedAt || at, updatedAt: at });
            claimed = true;
        }
    });
    if (claimed) {
        await Promise.all([
            jobRef.collection('service_events').doc(`technician-qr-claim__${actor.uid}`).set({
                tenantId: actor.tenantId, branchId, jobId, at, actorUid: actor.uid, actorName: actor.displayName,
                action: 'technician_assigned', domainEvent: 'technician.assigned', eventSchemaVersion: 1,
                payload: { source: 'internal_qr', technicianId: actor.uid },
            }, { merge: true }),
            String(job.customerId || '') ? db.collection('customer_service_events').doc(`technician-qr-claim__${jobId}__${actor.uid}`).set({
                tenantId: actor.tenantId, customerId: String(job.customerId || ''), referenceType: 'repair_job', referenceId: jobId,
                action: 'job.technician_assigned', title: 'بدأ الفني العمل على الطلب',
                message: 'تم استلام الطلب وبدأ أحد الفنيين العمل عليه.', branchId,
                actorUid: actor.uid, actorName: actor.displayName, createdAt: at,
            }, { merge: true }) : Promise.resolve(),
        ]);
    }
    return { ok: true, jobId, claimed };
};
const normalizeProducts = (incoming, existing) => {
    const oldRows = Array.isArray(existing) ? existing : [];
    const byId = new Map(oldRows.map((row) => [String(row.itemId || ''), row]));
    if (!Array.isArray(incoming))
        return oldRows.map(cleanNestedLine);
    return incoming.slice(0, 50).map((raw, index) => {
        const row = raw && typeof raw === 'object' ? raw : {};
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
const saveTechnical = async (actor, data) => {
    const jobId = String(data.jobId || '').trim();
    const { ref, job } = await loadAssignedJob(actor, jobId);
    if (job.isClosed === true || ['delivered', 'cancelled'].includes(String(job.status || ''))) {
        throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن تعديله.');
    }
    const products = normalizeProducts(data.jobProducts, job.jobProducts);
    const at = new Date().toISOString();
    const warrantyScope = products.some((row) => Boolean(row.inWarranty)) ? 'manufacturer' : 'none';
    await ref.update({
        jobProducts: products,
        isServiceOnly: Boolean(data.isServiceOnly),
        warrantyScope,
        ...(warrantyScope === 'manufacturer' ? { warranty: 'none' } : {}),
        updatedAt: at,
    });
    return {
        ok: true,
        job: sanitizeRepairJobForTechnician(jobId, {
            ...job,
            jobProducts: products,
            isServiceOnly: Boolean(data.isServiceOnly),
            warrantyScope,
            updatedAt: at,
        }),
    };
};
const changeTechnicalStatus = async (actor, data) => {
    const jobId = String(data.jobId || '').trim();
    const status = String(data.status || '').trim();
    if (!TECH_STATUSES.has(status) || status === 'received') {
        throw new HttpsError('invalid-argument', 'هذه الحالة ليست من إجراءات الفني.');
    }
    const { ref, job } = await loadAssignedJob(actor, jobId);
    if (job.isClosed === true || ['delivered', 'cancelled'].includes(String(job.status || ''))) {
        throw new HttpsError('failed-precondition', 'الطلب مغلق ولا يمكن تغيير حالته.');
    }
    const reason = String(data.reason || '').trim().slice(0, 2000);
    if (status === 'unrepairable' && !reason) {
        throw new HttpsError('invalid-argument', 'سبب عدم قابلية الإصلاح مطلوب.');
    }
    if (status === 'ready') {
        const products = Array.isArray(job.jobProducts) ? job.jobProducts : [];
        const hasSelectedService = products.some((row) => Array.isArray(row.serviceIds) && row.serviceIds.some((id) => String(id || '').trim()));
        const hasUsedPart = (Array.isArray(job.partsUsed) ? job.partsUsed : [])
            .some((row) => Number(row.quantity || 0) > 0);
        if (!hasSelectedService && !hasUsedPart) {
            throw new HttpsError('failed-precondition', 'اختر خدمة صيانة أو سجّل قطعة غيار قبل تحويل الطلب إلى جاهز للتسليم.');
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
    await ref.update({
        status,
        statusHistory: history,
        updatedAt: at,
        ...(status === 'ready' || status === 'unrepairable' ? { resolvedAt: at } : {}),
        ...(status === 'unrepairable' ? { closedReason: reason } : {}),
    });
    await ref.collection('service_events').add({
        tenantId: actor.tenantId,
        branchId: String(job.branchId || ''),
        jobId,
        at,
        actorUid: actor.uid,
        actorName: actor.displayName,
        action: 'status_change',
        domainEvent: status === 'ready' ? 'job.ready' : 'job.status_changed',
        eventSchemaVersion: 1,
        statusBefore: String(job.status || ''),
        statusAfter: status,
        ...(reason ? { note: reason } : {}),
    });
    return { ok: true, status };
};
const addPhoto = async (actor, data) => {
    const jobId = String(data.jobId || '').trim();
    const url = String(data.url || '').trim();
    if (!url || url.length > 4000)
        throw new HttpsError('invalid-argument', 'رابط الصورة غير صالح.');
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
    return { ok: true, repairPhotoUrls: next };
};
const loadPartsCatalog = async (actor, data) => {
    const jobId = String(data.jobId || '').trim();
    const { job } = await loadAssignedJob(actor, jobId);
    const branchId = String(job.branchId || '');
    const branchSnap = await db.collection('repair_branches').doc(branchId).get();
    const branch = branchSnap.data();
    if (!branchSnap.exists || String(branch?.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('failed-precondition', 'فرع الصيانة غير صالح.');
    }
    const centerWarehouseId = String(branch?.warehouseId || '');
    const [materialsSnap, centralWarehouses, serviceCatalog] = await Promise.all([
        db.collection('materials').where('tenantId', '==', actor.tenantId).limit(1000).get(),
        db.collection('warehouses')
            .where('tenantId', '==', actor.tenantId)
            .where('warehouseRole', '==', 'spare_parts_central')
            .limit(5)
            .get(),
        loadProtectedRepairServiceCatalog(actor.tenantId),
    ]);
    const centralWarehouse = centralWarehouses.docs.find((row) => row.data().isActive !== false);
    const balanceId = (warehouseId, materialId) => `${warehouseId}__material__${materialId}`;
    const active = materialsSnap.docs.filter((row) => row.data().isActive !== false);
    const refs = active.flatMap((row) => [
        ...(centerWarehouseId ? [db.collection('stock_items').doc(balanceId(centerWarehouseId, row.id))] : []),
        ...(centralWarehouse?.id ? [db.collection('stock_items').doc(balanceId(centralWarehouse.id, row.id))] : []),
    ]);
    const balances = refs.length > 0 ? await db.getAll(...refs) : [];
    const qtyById = new Map(balances.map((row) => [row.id, Number(row.data()?.quantity || 0)]));
    const materials = active.map((row) => {
        const item = row.data();
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
        ok: true,
        materials,
        centerWarehouseId,
        services: serviceCatalog.services
            .filter((row) => row.enabled !== false)
            .map(({ id, name, enabled }) => ({ id, name, enabled })),
    };
};
export const repairTechnicianOpsHandler = async (request) => {
    const actor = await requireActor(request);
    const data = (request.data || {});
    const operation = String(data.operation || '');
    if (operation === 'list')
        return listAssigned(actor);
    if (operation === 'claim_qr')
        return claimJobFromInternalQr(actor, data);
    if (operation === 'get') {
        const jobId = String(data.jobId || '').trim();
        const { job } = await loadAssignedJob(actor, jobId);
        return { ok: true, job: sanitizeRepairJobForTechnician(jobId, job) };
    }
    if (operation === 'save')
        return saveTechnical(actor, data);
    if (operation === 'status')
        return changeTechnicalStatus(actor, data);
    if (operation === 'add_photo')
        return addPhoto(actor, data);
    if (operation === 'catalog')
        return loadPartsCatalog(actor, data);
    throw new HttpsError('invalid-argument', 'عملية فني غير مدعومة.');
};

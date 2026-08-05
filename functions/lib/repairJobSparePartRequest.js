/**
 * Repair job spare-part request: deduct from center warehouse or upsert open
 * replenishment basket (central / stockout), then fulfill after receive.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { createRepairSpareIssueHandler, issueRepairSpareIssueHandler, } from './repairSpareIssues.js';
import { loadCustomerType, pickRepairSalePrice, roundRepairMoney } from './repairSalePrice.js';
const db = getDb();
const USERS = 'users';
const ROLES = 'roles';
const JOBS = 'repair_jobs';
const BRANCHES = 'repair_branches';
const WAREHOUSES = 'warehouses';
const MATERIALS = 'materials';
const SPARE_PARTS = 'repair_spare_parts';
const STOCK_ITEMS = 'stock_items';
const REQUESTS = 'spare_parts_replenishment_requests';
const COUNTERS = 'inventory_counters';
const ACTIVITY = 'activity_logs';
const CENTRAL_ROLE = 'spare_parts_central';
const CENTER_ROLE = 'maintenance_center';
const MAX_LINES = 40;
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const toIsoNow = () => new Date().toISOString();
const balanceDocId = (warehouseId, itemType, itemId) => `${warehouseId}__${itemType}__${itemId}`;
const materialPurchaseCostPerBaseUnit = (material) => {
    const cost = toNumber(material.purchaseCost);
    const rate = toNumber(material.conversionRate);
    if (rate > 0)
        return cost / rate;
    return cost;
};
const requireAuth = (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    return uid;
};
const loadActor = async (uid) => {
    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists)
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    const user = userSnap.data();
    if (user.isActive !== true) {
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    }
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId) {
        throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    }
    let permissions = {};
    const roleId = String(user.roleId || '').trim();
    if (roleId) {
        const roleSnap = await db.collection(ROLES).doc(roleId).get();
        if (!roleSnap.exists) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        const role = roleSnap.data();
        if (String(role.tenantId || '').trim() !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        permissions = role.permissions || {};
    }
    return {
        uid,
        tenantId,
        displayName: String(user.displayName || user.email || uid).trim() || uid,
        permissions,
        isSuperAdmin: user.isSuperAdmin === true,
        repairBranchIds: Array.from(new Set([
            ...(Array.isArray(user.repairBranchIds) ? user.repairBranchIds : []),
            String(user.repairBranchId || ''),
        ].map((id) => String(id || '').trim()).filter(Boolean))),
        inventoryWarehouseId: String(user.inventoryWarehouseId || '').trim(),
    };
};
const hasPerm = (actor, keys) => {
    if (actor.isSuperAdmin)
        return true;
    return keys.some((key) => actor.permissions[key] === true);
};
const assertPerm = (actor, keys, message) => {
    if (!hasPerm(actor, keys)) {
        throw new HttpsError('permission-denied', message);
    }
};
const actorCanViewAllBranches = (actor) => actor.isSuperAdmin
    || actor.permissions['repair.branches.manage'] === true
    || actor.permissions['repair.callCenter.viewAll'] === true;
/** Server-side equivalent of the repair branch scope enforced by Firestore rules. */
const assertActorCanAccessBranch = async (actor, branchId, branch) => {
    if (actorCanViewAllBranches(actor))
        return;
    if (actor.repairBranchIds.includes(branchId))
        return;
    if (actor.inventoryWarehouseId
        && actor.inventoryWarehouseId === String(branch.warehouseId || '').trim())
        return;
    const technicianIds = Array.isArray(branch.technicianIds)
        ? branch.technicianIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 100)
        : [];
    if (technicianIds.includes(actor.uid))
        return;
    const employeeIds = Array.from(new Set([
        ...technicianIds,
        String(branch.managerEmployeeId || '').trim(),
    ].filter(Boolean)));
    if (employeeIds.length > 0) {
        const employeeSnaps = await db.getAll(...employeeIds.map((employeeId) => db.collection('employees').doc(employeeId)));
        const linked = employeeSnaps.some((snap) => {
            if (!snap.exists)
                return false;
            const employee = snap.data();
            return String(employee.tenantId || '').trim() === actor.tenantId
                && String(employee.userId || '').trim() === actor.uid;
        });
        if (linked)
            return;
    }
    throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
};
const resolveAvailability = (centerQty, centralQty, neededQty) => {
    if (!(neededQty > 0))
        return 'none';
    if (centerQty >= neededQty)
        return 'center';
    if (centralQty > 0)
        return 'central';
    return 'none';
};
const readStockQty = async (tenantId, warehouseId, itemId) => {
    const snap = await db.collection(STOCK_ITEMS).doc(balanceDocId(warehouseId, 'material', itemId)).get();
    if (!snap.exists)
        return 0;
    if (String(snap.data()?.tenantId || '').trim() !== tenantId)
        return 0;
    return toNumber(snap.data()?.quantity);
};
const resolveCentralWarehouseId = async (tenantId) => {
    const snap = await db
        .collection(WAREHOUSES)
        .where('tenantId', '==', tenantId)
        .where('warehouseRole', '==', CENTRAL_ROLE)
        .limit(5)
        .get();
    const active = snap.docs.find((doc) => {
        const data = doc.data();
        return data.isActive !== false;
    });
    if (!active) {
        throw new HttpsError('failed-precondition', 'لا يوجد مخزن قطع غيار مركزي نشط لهذه الشركة.');
    }
    return active.id;
};
const loadWarehouse = async (tenantId, warehouseId) => {
    const snap = await db.collection(WAREHOUSES).doc(warehouseId).get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'المخزن غير موجود.');
    const data = snap.data();
    if (String(data.tenantId || '').trim() !== tenantId) {
        throw new HttpsError('permission-denied', 'المخزن خارج شركتك.');
    }
    if (data.isActive === false) {
        throw new HttpsError('failed-precondition', 'المخزن غير نشط.');
    }
    return {
        id: snap.id,
        name: String(data.name || snap.id).trim(),
        role: String(data.warehouseRole || 'general').trim(),
    };
};
const ensureBranchSparePart = async (input) => {
    const materialSale = toNumber(input.materialSalePrice) > 0 ? roundMoney(toNumber(input.materialSalePrice)) : 0;
    const resolvedSale = roundRepairMoney(pickRepairSalePrice({
        customerType: input.customerType,
        consumerSalePrice: input.materialSalePrice,
        traderSalePrice: input.materialTraderSalePrice,
    }));
    const existing = await db
        .collection(SPARE_PARTS)
        .where('tenantId', '==', input.tenantId)
        .where('branchId', '==', input.branchId)
        .where('materialId', '==', input.materialId)
        .limit(1)
        .get();
    if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data();
        const partSale = toNumber(data.defaultSalePrice) > 0 ? roundMoney(toNumber(data.defaultSalePrice)) : 0;
        const salePrice = resolvedSale > 0
            ? resolvedSale
            : (materialSale > 0 ? materialSale : partSale);
        return {
            partId: doc.id,
            salePrice,
        };
    }
    const partRef = db.collection(SPARE_PARTS).doc();
    const now = toIsoNow();
    await partRef.set({
        tenantId: input.tenantId,
        branchId: input.branchId,
        name: input.itemName,
        code: input.itemCode,
        category: 'تموين',
        unit: input.unit || 'قطعة',
        minStock: 0,
        materialId: input.materialId,
        purchaseUnitCost: input.unitCostSnapshot,
        // Cache of company consumer price for offline/legacy UI; source of truth is Material.
        defaultSalePrice: materialSale,
        createdAt: now,
    });
    return { partId: partRef.id, salePrice: resolvedSale > 0 ? resolvedSale : materialSale };
};
const mergeDemandIntoLines = (existingLines, demand) => {
    const itemId = demand.itemId;
    const link = {
        jobId: demand.jobId,
        usageId: demand.usageId,
        quantity: demand.quantity,
    };
    const lines = existingLines.map((line) => ({ ...line }));
    const idx = lines.findIndex((line) => String(line.itemId || '').trim() === itemId);
    if (idx >= 0) {
        const line = lines[idx];
        const nextQty = toNumber(line.requestedQty) + demand.quantity;
        const sourceJobIds = Array.from(new Set([...(line.sourceJobIds || []), demand.jobId].filter(Boolean)));
        lines[idx] = {
            ...line,
            requestedQty: nextQty,
            totalCostSnapshot: roundMoney(toNumber(line.unitCostSnapshot) * nextQty),
            sourceJobIds,
            demandLinks: [...(line.demandLinks || []), link],
            availabilityAtRequest: line.availabilityAtRequest === 'none' || demand.availabilityAtRequest === 'none'
                ? 'none'
                : 'central',
        };
        return lines;
    }
    if (lines.length >= MAX_LINES) {
        throw new HttpsError('failed-precondition', `الحد الأقصى لعدد البنود هو ${MAX_LINES}.`);
    }
    lines.push({
        lineId: itemId,
        itemType: 'material',
        itemId,
        itemName: demand.itemName,
        itemCode: demand.itemCode,
        unit: demand.unit,
        requestedQty: demand.quantity,
        unitCostSnapshot: demand.unitCostSnapshot,
        totalCostSnapshot: roundMoney(demand.unitCostSnapshot * demand.quantity),
        sourceJobIds: [demand.jobId],
        demandLinks: [link],
        availabilityAtRequest: demand.availabilityAtRequest,
    });
    return lines;
};
const nextSprReferenceNo = async (tenantId) => {
    const counterRef = db.collection(COUNTERS).doc(`${tenantId}__spare_parts_replenishment`);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists ? toNumber(snap.data()?.value) : 0;
        const value = current + 1;
        tx.set(counterRef, { value, tenantId, updatedAt: toIsoNow() }, { merge: true });
        return `SPR-${String(value).padStart(5, '0')}`;
    });
};
const findOpenBasket = async (tenantId, toWarehouseId) => {
    const snap = await db
        .collection(REQUESTS)
        .where('tenantId', '==', tenantId)
        .where('toWarehouseId', '==', toWarehouseId)
        .where('status', '==', 'submitted')
        .limit(10)
        .get();
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.openBasket === false)
            continue;
        return { id: doc.id, data };
    }
    return null;
};
const writeActivity = async (actor, action, entityId, metadata) => {
    await db.collection(ACTIVITY).add({
        module: 'repair',
        action,
        entityType: 'repair_job_spare_part',
        entityId,
        description: action,
        metadata,
        createdBy: actor.displayName,
        createdByUserId: actor.uid,
        createdAt: toIsoNow(),
        tenantId: actor.tenantId,
    });
};
const asCallable = (request, data) => ({
    ...request,
    data,
});
/**
 * Ensure catalog part + create RSI (+ issue when direct).
 * Returns created issue id / reference and part id.
 */
const issueFromCenterStock = async (request, input) => {
    const { partId } = await ensureBranchSparePart({
        tenantId: input.actor.tenantId,
        branchId: input.branchId,
        materialId: input.materialId,
        itemName: input.itemName,
        itemCode: input.itemCode,
        unit: input.unit,
        unitCostSnapshot: input.unitCostSnapshot,
        materialSalePrice: input.materialSalePrice,
        materialTraderSalePrice: input.materialTraderSalePrice,
        customerType: input.customerType,
    });
    const created = await createRepairSpareIssueHandler(asCallable(request, {
        warehouseId: input.warehouseId,
        branchId: input.branchId,
        jobId: input.jobId,
        jobCode: input.jobCode,
        note: 'صرف من طلب صيانة (مخزن المركز)',
        lines: [{ itemId: input.materialId, quantity: input.quantity }],
        jobPartUsage: stripUndefined({
            partId,
            partName: input.itemName,
            scope: 'job',
            usageId: input.usageId,
        }),
    }));
    if (created.approvalMode === 'direct') {
        const issued = await issueRepairSpareIssueHandler(asCallable(request, { issueId: created.id }));
        return {
            path: 'center',
            issueId: created.id,
            referenceNo: issued.referenceNo,
            status: issued.status,
            approvalMode: created.approvalMode,
            partId,
        };
    }
    return {
        path: 'center',
        issueId: created.id,
        referenceNo: created.referenceNo,
        status: created.status,
        approvalMode: created.approvalMode,
        partId,
    };
};
export const requestRepairJobSparePartHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, ['repair.parts.manage', 'repairSpareIssues.create', 'repair.jobs.edit'], 'ليس لديك صلاحية طلب قطعة غيار على طلب الصيانة.');
    const payload = (request.data || {});
    const jobId = String(payload.jobId || '').trim();
    const materialId = String(payload.materialId || '').trim();
    const quantity = Math.round(toNumber(payload.quantity));
    if (!jobId)
        throw new HttpsError('invalid-argument', 'jobId مطلوب.');
    if (!materialId)
        throw new HttpsError('invalid-argument', 'حدد المكوّن.');
    if (!(quantity > 0))
        throw new HttpsError('invalid-argument', 'الكمية يجب أن تكون أكبر من صفر.');
    const jobRef = db.collection(JOBS).doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists)
        throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const job = jobSnap.data();
    if (String(job.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'طلب الصيانة خارج شركتك.');
    }
    const customerType = await loadCustomerType(db, actor.tenantId, String(job.customerId || ''));
    const branchId = String(job.branchId || '').trim();
    if (!branchId)
        throw new HttpsError('failed-precondition', 'طلب الصيانة بلا فرع.');
    const branchSnap = await db.collection(BRANCHES).doc(branchId).get();
    if (!branchSnap.exists)
        throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
    const branch = branchSnap.data();
    if (String(branch.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'الفرع خارج شركتك.');
    }
    await assertActorCanAccessBranch(actor, branchId, branch);
    const warehouseId = String(branch.warehouseId || '').trim();
    if (!warehouseId) {
        throw new HttpsError('failed-precondition', 'هذا الفرع لا يملك مخزناً مرتبطاً.');
    }
    const [centerWh, materialSnap, warehouseSnap] = await Promise.all([
        loadWarehouse(actor.tenantId, warehouseId),
        db.collection(MATERIALS).doc(materialId).get(),
        db.collection(WAREHOUSES).doc(warehouseId).get(),
    ]);
    const warehouseCode = String(warehouseSnap.data()?.code || '').trim();
    const isCenterWh = centerWh.role === CENTER_ROLE || /^RWH-\d{3}$/.test(warehouseCode);
    if (!isCenterWh) {
        throw new HttpsError('failed-precondition', 'مخزن الفرع يجب أن يكون مخزن مركز صيانة.');
    }
    if (!materialSnap.exists)
        throw new HttpsError('not-found', 'المكوّن غير موجود.');
    const material = materialSnap.data();
    if (String(material.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'المكوّن خارج شركتك.');
    }
    if (material.isActive === false) {
        throw new HttpsError('failed-precondition', 'المكوّن غير نشط.');
    }
    const itemName = String(material.name || materialId).trim();
    const itemCode = String(material.code || '').trim();
    const unit = String(material.baseUnit || material.unit || 'قطعة').trim() || 'قطعة';
    const unitCostSnapshot = roundMoney(materialPurchaseCostPerBaseUnit(material));
    const centralWarehouseId = await resolveCentralWarehouseId(actor.tenantId);
    const [centerQty, centralQty] = await Promise.all([
        readStockQty(actor.tenantId, warehouseId, materialId),
        readStockQty(actor.tenantId, centralWarehouseId, materialId),
    ]);
    const availability = resolveAvailability(centerQty, centralQty, quantity);
    if (availability === 'center') {
        const result = await issueFromCenterStock(request, {
            actor,
            warehouseId,
            branchId,
            jobId,
            jobCode: String(job.receiptNo || jobId),
            materialId,
            quantity,
            itemName,
            itemCode,
            unit,
            unitCostSnapshot,
            materialSalePrice: toNumber(material.defaultSalePrice),
            materialTraderSalePrice: toNumber(material.traderSalePrice),
            customerType,
        });
        await writeActivity(actor, 'repair_job_spare_part.center_issue', jobId, {
            materialId,
            quantity,
            issueId: result.issueId,
            referenceNo: result.referenceNo,
        });
        return {
            path: 'center',
            availability,
            issueId: result.issueId,
            referenceNo: result.referenceNo,
            status: result.status,
            approvalMode: result.approvalMode,
        };
    }
    // pending_supply + upsert open basket
    const usageId = `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const demandAvailability = availability === 'central' ? 'central' : 'none';
    const { partId, salePrice } = await ensureBranchSparePart({
        tenantId: actor.tenantId,
        branchId,
        materialId,
        itemName,
        itemCode,
        unit,
        unitCostSnapshot,
        materialSalePrice: toNumber(material.defaultSalePrice),
        materialTraderSalePrice: toNumber(material.traderSalePrice),
        customerType,
    });
    const fromWh = await loadWarehouse(actor.tenantId, centralWarehouseId);
    const open = await findOpenBasket(actor.tenantId, warehouseId);
    let replenishmentRequestId = '';
    let replenishmentReferenceNo = '';
    if (open) {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(db.collection(REQUESTS).doc(open.id));
            if (!snap.exists)
                throw new HttpsError('not-found', 'طلب التموين غير موجود.');
            const current = snap.data();
            if (current.status !== 'submitted' || current.openBasket === false) {
                throw new HttpsError('aborted', 'سلة التموين لم تعد قابلة للدمج.');
            }
            if (String(current.tenantId || '').trim() !== actor.tenantId) {
                throw new HttpsError('permission-denied', 'طلب التموين خارج شركتك.');
            }
            const lines = mergeDemandIntoLines(current.lines || [], {
                itemId: materialId,
                itemName,
                itemCode,
                unit,
                quantity,
                unitCostSnapshot,
                jobId,
                usageId,
                availabilityAtRequest: demandAvailability,
            });
            const totalCostSnapshot = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
            tx.update(snap.ref, { lines, totalCostSnapshot });
        });
        replenishmentRequestId = open.id;
        replenishmentReferenceNo = open.data.referenceNo;
    }
    else {
        const referenceNo = await nextSprReferenceNo(actor.tenantId);
        const lines = mergeDemandIntoLines([], {
            itemId: materialId,
            itemName,
            itemCode,
            unit,
            quantity,
            unitCostSnapshot,
            jobId,
            usageId,
            availabilityAtRequest: demandAvailability,
        });
        const totalCostSnapshot = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalCostSnapshot), 0));
        const ref = db.collection(REQUESTS).doc();
        const doc = {
            referenceNo,
            status: 'submitted',
            fromWarehouseId: centralWarehouseId,
            fromWarehouseName: fromWh.name,
            toWarehouseId: warehouseId,
            toWarehouseName: centerWh.name,
            lines,
            note: 'سلة تموين من طلبات الصيانة',
            totalCostSnapshot,
            sourceBranchId: branchId,
            openBasket: true,
            createdBy: actor.displayName,
            createdByUserId: actor.uid,
            createdAt: toIsoNow(),
            tenantId: actor.tenantId,
        };
        await ref.set(doc);
        replenishmentRequestId = ref.id;
        replenishmentReferenceNo = referenceNo;
    }
    const prevParts = Array.isArray(job.partsUsed) ? [...job.partsUsed] : [];
    prevParts.push(stripUndefined({
        usageId,
        partId,
        partName: itemName,
        quantity,
        unitCost: salePrice,
        materialId,
        scope: 'job',
        fulfillmentStatus: 'pending_supply',
        availabilityAtRequest: demandAvailability,
        replenishmentRequestId,
        replenishmentReferenceNo,
    }));
    const jobUpdate = {
        partsUsed: prevParts,
        updatedAt: toIsoNow(),
    };
    // Soft-nudge workflow when waiting on parts (do not force illegal transitions).
    if (String(job.status || '') === 'repairing' || String(job.status || '') === 'diagnosing') {
        jobUpdate.status = 'waiting_parts';
    }
    await jobRef.update(jobUpdate);
    await writeActivity(actor, 'repair_job_spare_part.pending_supply', jobId, {
        materialId,
        quantity,
        availability: demandAvailability,
        replenishmentRequestId,
        replenishmentReferenceNo,
    });
    return {
        path: 'pending_supply',
        availability: demandAvailability,
        usageId,
        replenishmentRequestId,
        replenishmentReferenceNo,
    };
};
export const issuePendingRepairPartUsageHandler = async (request) => {
    const uid = requireAuth(request);
    const actor = await loadActor(uid);
    assertPerm(actor, ['repair.parts.manage', 'repairSpareIssues.issue', 'repairSpareIssues.create', 'repair.jobs.edit'], 'ليس لديك صلاحية صرف القطعة على الطلب.');
    const payload = (request.data || {});
    const jobId = String(payload.jobId || '').trim();
    const usageId = String(payload.usageId || '').trim();
    if (!jobId || !usageId) {
        throw new HttpsError('invalid-argument', 'jobId و usageId مطلوبان.');
    }
    const jobRef = db.collection(JOBS).doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists)
        throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    const job = jobSnap.data();
    if (String(job.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'طلب الصيانة خارج شركتك.');
    }
    const customerType = await loadCustomerType(db, actor.tenantId, job.customerId);
    const parts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
    const usage = parts.find((row) => String(row.usageId || '').trim() === usageId);
    if (!usage)
        throw new HttpsError('not-found', 'سطر القطعة غير موجود على الطلب.');
    const status = String(usage.fulfillmentStatus || '');
    if (status !== 'ready_to_issue' && status !== 'pending_supply') {
        throw new HttpsError('failed-precondition', 'السطر ليس جاهزاً للصرف.');
    }
    const materialId = String(usage.materialId || '').trim();
    const quantity = toNumber(usage.quantity);
    if (!materialId || !(quantity > 0)) {
        throw new HttpsError('failed-precondition', 'بيانات سطر القطعة غير صالحة.');
    }
    const branchId = String(job.branchId || '').trim();
    if (!branchId)
        throw new HttpsError('failed-precondition', 'طلب الصيانة بلا فرع.');
    const branchSnap = await db.collection(BRANCHES).doc(branchId).get();
    if (!branchSnap.exists)
        throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
    const branch = branchSnap.data();
    if (String(branch.tenantId || '').trim() !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'الفرع خارج شركتك.');
    }
    await assertActorCanAccessBranch(actor, branchId, branch);
    const warehouseId = String(branch.warehouseId || '').trim();
    if (!warehouseId) {
        throw new HttpsError('failed-precondition', 'هذا الفرع لا يملك مخزناً مرتبطاً.');
    }
    const centerQty = await readStockQty(actor.tenantId, warehouseId, materialId);
    if (centerQty < quantity) {
        throw new HttpsError('failed-precondition', 'الرصيد غير كافٍ في مخزن المركز للصرف.');
    }
    const materialSnap = await db.collection(MATERIALS).doc(materialId).get();
    const material = materialSnap.data();
    const result = await issueFromCenterStock(request, {
        actor,
        warehouseId,
        branchId,
        jobId,
        jobCode: String(job.receiptNo || jobId),
        materialId,
        quantity,
        itemName: String(usage.partName || material?.name || materialId),
        itemCode: String(material?.code || ''),
        unit: String(material?.baseUnit || material?.unit || 'قطعة'),
        unitCostSnapshot: roundMoney(materialPurchaseCostPerBaseUnit(material || {})),
        materialSalePrice: toNumber(material?.defaultSalePrice),
        materialTraderSalePrice: toNumber(material?.traderSalePrice),
        customerType,
        usageId,
    });
    return {
        issueId: result.issueId,
        referenceNo: result.referenceNo,
        status: result.status,
    };
};
/**
 * After SPR receive: mark linked job usages ready_to_issue, then attempt auto-issue.
 */
export async function fulfillJobDemandsAfterReplenishmentReceive(input) {
    const links = [];
    for (const line of input.lines || []) {
        for (const link of line.demandLinks || []) {
            const jobId = String(link.jobId || '').trim();
            const usageId = String(link.usageId || '').trim();
            const quantity = toNumber(link.quantity);
            if (!jobId || !usageId || !(quantity > 0))
                continue;
            links.push({ jobId, usageId, quantity });
        }
    }
    if (links.length === 0)
        return { marked: 0, issued: 0, failed: 0 };
    const byJob = new Map();
    for (const link of links) {
        const list = byJob.get(link.jobId) || [];
        list.push(link);
        byJob.set(link.jobId, list);
    }
    let marked = 0;
    for (const [jobId, jobLinks] of byJob.entries()) {
        const jobRef = db.collection(JOBS).doc(jobId);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(jobRef);
            if (!snap.exists)
                return;
            const data = snap.data();
            if (String(data.tenantId || '').trim() !== input.tenantId)
                return;
            const parts = Array.isArray(data.partsUsed) ? [...data.partsUsed] : [];
            let changed = false;
            for (const link of jobLinks) {
                const idx = parts.findIndex((row) => String(row.usageId || '').trim() === link.usageId);
                if (idx < 0)
                    continue;
                const status = String(parts[idx].fulfillmentStatus || '');
                if (status !== 'pending_supply')
                    continue;
                parts[idx] = {
                    ...parts[idx],
                    fulfillmentStatus: 'ready_to_issue',
                };
                changed = true;
                marked += 1;
            }
            if (changed) {
                tx.update(jobRef, { partsUsed: parts, updatedAt: toIsoNow() });
            }
        });
    }
    let issued = 0;
    let failed = 0;
    for (const link of links) {
        try {
            await issuePendingRepairPartUsageHandler(asCallable(input.request, { jobId: link.jobId, usageId: link.usageId }));
            issued += 1;
        }
        catch (err) {
            failed += 1;
            console.error('repair_job_spare_part.auto_issue_after_receive failed', {
                requestId: input.requestId,
                jobId: link.jobId,
                usageId: link.usageId,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return { marked, issued, failed };
}

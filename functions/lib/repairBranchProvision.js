import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { applyRepairBranchAccountingLink } from './accountingOps.js';
import { ensureRepairCustomerWarehouses } from './repairCustomerPortalOps.js';
import { allocateRepairWarehouseSequence, formatRepairWarehouseCode, } from './repairWarehouseCodes.js';
const db = getDb();
const USERS = 'users';
const ROLES = 'roles';
const EMPLOYEES = 'employees';
const BRANCHES = 'repair_branches';
const WAREHOUSES = 'warehouses';
const COST_CENTERS = 'cost_centers';
const COUNTERS = '_counters';
const CREATE_PERMISSION = 'repair.branches.manage';
const COST_CENTER_CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/;
const nowIso = () => new Date().toISOString();
const text = (value, max = 200) => String(value || '').trim().slice(0, max);
const repairMaintenanceWarehouseName = (branchName) => `مخزن صيانة - ${String(branchName || '').trim() || 'فرع'}`;
const repairCenterWarehouseId = (branchId) => `repair-center-${String(branchId || '').trim()}`;
const repairCostCenterCode = (sequence) => {
    const seq = Math.max(1, Math.floor(Number(sequence) || 1));
    return `REP-${String(seq).padStart(4, '0')}`;
};
async function actorFromRequest(request) {
    const uid = text(request.auth?.uid, 128);
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists)
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    const user = userSnap.data();
    if (user.isActive === false)
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    const tenantId = text(user.tenantId, 128);
    if (!tenantId)
        throw new HttpsError('failed-precondition', 'المستخدم غير مرتبط بشركة.');
    let permissions = {};
    const roleId = text(user.roleId, 128);
    if (roleId) {
        const roleSnap = await db.collection(ROLES).doc(roleId).get();
        const role = roleSnap.data();
        if (!roleSnap.exists || text(role?.tenantId, 128) !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        permissions = (role?.permissions || {});
    }
    return {
        uid,
        tenantId,
        displayName: text(user.displayName || user.name || user.email || uid, 160),
        permissions,
        isSuperAdmin: user.isSuperAdmin === true,
    };
}
function requireCreatePermission(actor) {
    if (actor.isSuperAdmin || actor.permissions[CREATE_PERMISSION] === true)
        return;
    throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة المراكز.');
}
async function allocateMaintenanceWarehouseCode(tenantId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const sequence = await allocateRepairWarehouseSequence(tenantId);
        const warehouseCode = formatRepairWarehouseCode('MCW', sequence);
        const taken = await db
            .collection(WAREHOUSES)
            .where('tenantId', '==', tenantId)
            .where('code', '==', warehouseCode)
            .limit(1)
            .get();
        if (taken.empty)
            return { sequence, warehouseCode };
    }
    throw new HttpsError('already-exists', 'تعذر توليد كود مخزن فريد.');
}
async function nextCostCenterCode(tenantId) {
    const counterRef = db.collection(COUNTERS).doc(`repair_cost_centers_${tenantId}`);
    const existing = await db
        .collection(COST_CENTERS)
        .where('tenantId', '==', tenantId)
        .limit(1000)
        .get();
    const usedCodes = new Set(existing.docs
        .map((snap) => String(snap.data()?.code || '').trim().toUpperCase())
        .filter(Boolean));
    let sequence = 1;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        sequence = Number(snap.data()?.value || 0) + 1;
        tx.set(counterRef, { tenantId, value: sequence, updatedAt: nowIso() }, { merge: true });
    });
    for (let offset = 0; offset < 100; offset += 1) {
        const code = repairCostCenterCode(sequence + offset);
        if (!COST_CENTER_CODE_PATTERN.test(code)) {
            throw new HttpsError('failed-precondition', 'تعذر توليد كود مركز تكلفة صالح.');
        }
        if (!usedCodes.has(code)) {
            if (offset > 0) {
                await counterRef.set({ tenantId, value: sequence + offset, updatedAt: nowIso() }, { merge: true });
            }
            return code;
        }
    }
    throw new HttpsError('already-exists', 'تعذر توليد كود مركز تكلفة فريد.');
}
async function clearOtherMainBranches(tenantId, exceptId) {
    const branches = await db
        .collection(BRANCHES)
        .where('tenantId', '==', tenantId)
        .limit(500)
        .get();
    const at = nowIso();
    const updates = branches.docs
        .filter((snap) => snap.id !== exceptId && snap.data()?.isMain === true)
        .map((snap) => snap.ref.update({ isMain: false, updatedAt: at }));
    if (updates.length)
        await Promise.all(updates);
}
export async function createRepairBranchProvisionedHandler(request) {
    const actor = await actorFromRequest(request);
    requireCreatePermission(actor);
    const data = (request.data || {});
    const name = text(data.name, 160);
    if (!name)
        throw new HttpsError('invalid-argument', 'اسم الفرع مطلوب.');
    const managerEmployeeId = text(data.managerEmployeeId, 128);
    if (!managerEmployeeId) {
        throw new HttpsError('invalid-argument', 'اختر المسؤول عن الفرع قبل الحفظ.');
    }
    const employeeSnap = await db.collection(EMPLOYEES).doc(managerEmployeeId).get();
    if (!employeeSnap.exists) {
        throw new HttpsError('not-found', 'الموظف المسؤول غير موجود.');
    }
    const employee = employeeSnap.data();
    const employeeTenantId = text(employee.tenantId, 128);
    if (employeeTenantId && employeeTenantId !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'الموظف المسؤول خارج الشركة.');
    }
    if (employee.isActive === false) {
        throw new HttpsError('failed-precondition', 'الموظف المسؤول غير نشط.');
    }
    const managerEmployeeName = text(data.managerEmployeeName, 160) || text(employee.name, 160);
    const isMain = data.isMain === true;
    const at = nowIso();
    const branchRef = db.collection(BRANCHES).doc();
    const branchId = branchRef.id;
    const warehouseId = repairCenterWarehouseId(branchId);
    const { sequence, warehouseCode } = await allocateMaintenanceWarehouseCode(actor.tenantId);
    if (isMain) {
        await clearOtherMainBranches(actor.tenantId, branchId);
    }
    const opening = db.batch();
    opening.set(branchRef, {
        tenantId: actor.tenantId,
        name,
        phone: text(data.phone, 40),
        address: text(data.address, 200),
        isMain,
        managerEmployeeId,
        managerEmployeeName,
        technicianIds: [],
        warehouseId,
        warehouseCode,
        allowCreditDelivery: data.allowCreditDelivery !== false,
        allowCreditSalesInvoices: data.allowCreditSalesInvoices === true,
        salesInvoicesLocked: data.salesInvoicesLocked === true,
        createdAt: at,
        updatedAt: at,
        createdBy: actor.uid,
    });
    opening.set(db.collection(WAREHOUSES).doc(warehouseId), {
        tenantId: actor.tenantId,
        name: repairMaintenanceWarehouseName(name),
        code: warehouseCode,
        warehouseRole: 'maintenance_center',
        isActive: true,
        createdAt: at,
        updatedAt: at,
    });
    await opening.commit();
    let custodyWarehouseId = '';
    let unrepairableWarehouseId = '';
    try {
        const customerWarehouses = await ensureRepairCustomerWarehouses(actor.tenantId, branchId, { sequence });
        custodyWarehouseId = customerWarehouses.custodyWarehouseId;
        unrepairableWarehouseId = customerWarehouses.unrepairableWarehouseId;
    }
    catch (error) {
        const message = error instanceof HttpsError
            ? error.message
            : 'تعذر إنشاء مخازن العهدة وغير القابل للإصلاح.';
        throw new HttpsError('failed-precondition', `تم إنشاء الفرع لكن ${message} احذف الفرع ثم أعد المحاولة.`);
    }
    let costCenterId = '';
    try {
        const costCenterCode = await nextCostCenterCode(actor.tenantId);
        const centerRef = db.collection(COST_CENTERS).doc();
        costCenterId = centerRef.id;
        await centerRef.set({
            tenantId: actor.tenantId,
            code: costCenterCode,
            name,
            accountingCategory: 'repair',
            parentId: null,
            branchId,
            warehouseId,
            allowPosting: true,
            isActive: true,
            type: 'direct',
            productionCostingEnabled: false,
            createdAt: at,
            createdBy: actor.uid,
            updatedAt: at,
            updatedBy: actor.uid,
        });
    }
    catch (error) {
        const message = error instanceof HttpsError
            ? error.message
            : 'تعذر إنشاء مركز التكلفة.';
        throw new HttpsError('failed-precondition', `تم إنشاء الفرع والمخازن لكن ${message} اربطه من الحسابات أو احذف الفرع ثم أعد المحاولة.`);
    }
    try {
        await applyRepairBranchAccountingLink({
            tenantId: actor.tenantId,
            uid: actor.uid,
            branchId,
            costCenterId,
            useDefaultAccounts: true,
        });
    }
    catch (error) {
        const message = error instanceof HttpsError
            ? error.message
            : 'تعذر الربط بالحسابات الافتراضية.';
        throw new HttpsError('failed-precondition', `تم إنشاء الفرع والمخازن ومركز التكلفة لكن ${message} أكمل الربط من الحسابات ← إعدادات الحسابات.`);
    }
    return {
        ok: true,
        branchId,
        warehouseId,
        warehouseCode,
        custodyWarehouseId,
        unrepairableWarehouseId,
        costCenterId,
    };
}

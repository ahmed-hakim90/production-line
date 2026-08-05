import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
const db = getFirestore();
const USERS = 'users';
const ROLES = 'roles';
/** Additive-only grants for built-in roles. Never used to revoke. */
const BUILTIN_ROLE_PERMISSION_GRANTS = {
    accountant: [
        'accounting.view',
        'accounting.accounts.manage',
        'accounting.journals.post',
        'accounting.journals.reverse',
        'accounting.periods.manage',
        'accounting.settings.manage',
        'accounting.inventory.view',
    ],
    factory_manager: [
        'reports.create',
        'reports.edit',
        'reports.componentInjection.manage',
        'products.create',
        'products.edit',
        'productionWorkers.view',
        'production.workers.view',
        'production.workers.manage',
        'production.workerTargets.manage',
        'production.workerReports.view',
        'production.workerRatings.view',
        'production.workerRatings.manage',
        'production.workerBonus.view',
        'production.workerBonus.manage',
        'lineWorkers.view',
        'approval.view',
        'sparePartsReplenishment.view',
        'sparePartsReplenishment.approve',
        'sparePartsReplenishment.responsibleApprove',
    ],
    hall_supervisor: [
        'reports.create',
        'productionWorkers.view',
        'production.workers.view',
        'production.workerReports.view',
        'production.workerRatings.view',
    ],
    materials_warehouse: [
        'departmentConsumables.view',
        'departmentConsumables.create',
        'departmentConsumables.approve',
        'departmentConsumables.issue',
        'departmentConsumables.export',
        'sparePartsReplenishment.view',
        'sparePartsReplenishment.create',
        'sparePartsReplenishment.approve',
        'sparePartsReplenishment.prepare',
        'sparePartsReplenishment.responsibleApprove',
        'sparePartsReplenishment.receive',
    ],
    inventory_viewer: [
        'sparePartsReplenishment.view',
    ],
    repair_reception: [
        'dashboard.view',
        'repair.view',
        'repair.dashboard.view',
        'repair.jobs.create',
        'repair.jobs.edit',
        'repair.jobs.reception',
        'repair.finance.view',
        'repair.payments.view',
        'repair.payments.collect',
        'repair.discounts.request',
        'repair.credit.request',
        'customers.view',
        'customers.create',
        'print',
    ],
    repair_technician: [
        'dashboard.view',
        'repair.jobs.technician',
        'repair.parts.request',
    ],
};
const normalizeRoleName = (value) => String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const NAME_TO_ROLE_KEY = {
    [normalizeRoleName('مدير المصنع')]: 'factory_manager',
    [normalizeRoleName('مشرف الصالة')]: 'hall_supervisor',
    [normalizeRoleName('مسؤول مخزن المستلزمات')]: 'materials_warehouse',
    [normalizeRoleName('عرض مخزون فقط')]: 'inventory_viewer',
    [normalizeRoleName('استقبال صيانة')]: 'repair_reception',
    [normalizeRoleName('فني صيانة')]: 'repair_technician',
};
const resolveRoleKey = (role) => {
    const key = String(role.roleKey || '').trim();
    if (key)
        return key;
    return NAME_TO_ROLE_KEY[normalizeRoleName(role.name)] || '';
};
/**
 * Idempotent additive sync of built-in role permission grants for the caller tenant.
 * Safe for any active tenant user: only adds allowlisted keys, never elevates to admin.
 */
export const syncBuiltInRolePermissionGrants = onCall({
    region: 'us-central1',
    memory: '256MiB',
}, async (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists) {
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    }
    const user = userSnap.data();
    if (user.isActive !== true && user.isSuperAdmin !== true) {
        throw new HttpsError('permission-denied', 'الحساب غير مفعّل.');
    }
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId) {
        throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    }
    const rolesSnap = await db.collection(ROLES).where('tenantId', '==', tenantId).get();
    let patchedRoles = 0;
    let grantedKeys = 0;
    for (const roleDoc of rolesSnap.docs) {
        const role = roleDoc.data();
        const roleKey = resolveRoleKey(role);
        const toGrant = BUILTIN_ROLE_PERMISSION_GRANTS[roleKey];
        if (!toGrant?.length)
            continue;
        const current = { ...(role.permissions || {}) };
        let changed = false;
        for (const perm of toGrant) {
            if (current[perm] !== true) {
                current[perm] = true;
                changed = true;
                grantedKeys += 1;
            }
        }
        if (!changed)
            continue;
        await roleDoc.ref.set({
            permissions: current,
            ...(role.roleKey ? {} : { roleKey }),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        patchedRoles += 1;
    }
    return { ok: true, tenantId, patchedRoles, grantedKeys };
});

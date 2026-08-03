import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
const db = getFirestore();
const USERS = 'users';
const ROLES = 'roles';
const defaultRoleDocId = (tenantId, roleKey) => `${String(tenantId).replace(/\//g, '_')}__${roleKey}`;
const hasManageUsersPermission = async (uid) => {
    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists)
        return false;
    const user = userSnap.data();
    if (user.isSuperAdmin === true)
        return true;
    const roleId = String(user.roleId || '').trim();
    if (!roleId)
        return false;
    const roleSnap = await db.collection(ROLES).doc(roleId).get();
    if (!roleSnap.exists)
        return false;
    const role = roleSnap.data();
    const permissions = role.permissions || {};
    return permissions['users.manage'] === true || permissions['roles.manage'] === true;
};
const assertRoleInTenant = async (roleId, tenantId) => {
    const roleSnap = await db.collection(ROLES).doc(roleId).get();
    if (!roleSnap.exists) {
        throw new HttpsError('invalid-argument', 'الدور غير موجود.');
    }
    const role = roleSnap.data();
    if (String(role.tenantId || '') !== tenantId) {
        throw new HttpsError('permission-denied', 'الدور لا يتبع نفس الشركة.');
    }
};
/**
 * Admin-provisioned Auth + users/{uid} with privileged roleId/isActive.
 * Client self-create must stay least-privilege (pending) only — see Firestore rules.
 */
export const adminCreateUser = onCall({
    region: 'us-central1',
    memory: '256MiB',
}, async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const permitted = await hasManageUsersPermission(requesterUid);
    if (!permitted) {
        throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة المستخدمين.');
    }
    const data = (request.data || {});
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    const displayName = String(data.displayName || '').trim();
    const roleId = String(data.roleId || '').trim();
    const isActive = data.isActive !== false;
    if (!email.includes('@')) {
        throw new HttpsError('invalid-argument', 'صيغة البريد الإلكتروني غير صحيحة.');
    }
    if (password.length < 6) {
        throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    }
    if (!displayName) {
        throw new HttpsError('invalid-argument', 'اسم العرض مطلوب.');
    }
    if (!roleId) {
        throw new HttpsError('invalid-argument', 'يجب اختيار دور.');
    }
    const requesterSnap = await db.collection(USERS).doc(requesterUid).get();
    const requester = requesterSnap.data();
    const requesterTenantId = String(requester?.tenantId || '').trim();
    const isSuperAdmin = requester?.isSuperAdmin === true;
    const tenantId = isSuperAdmin
        ? String(data.tenantId || requesterTenantId).trim()
        : requesterTenantId;
    if (!tenantId) {
        throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');
    }
    await assertRoleInTenant(roleId, tenantId);
    let uid = '';
    try {
        const created = await getAuth().createUser({
            email,
            password,
            displayName,
            emailVerified: false,
            disabled: false,
        });
        uid = created.uid;
        await db.collection(USERS).doc(uid).set({
            email,
            displayName,
            roleId,
            tenantId,
            isActive,
            isSuperAdmin: false,
            createdBy: requesterUid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        if (uid) {
            try {
                await getAuth().deleteUser(uid);
            }
            catch {
                /* best effort */
            }
            try {
                await db.collection(USERS).doc(uid).delete();
            }
            catch {
                /* best effort */
            }
        }
        const code = String(error?.code || '');
        if (code.includes('email-already-exists') || code.includes('already-exists')) {
            throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم بالفعل.');
        }
        if (error instanceof HttpsError)
            throw error;
        throw new HttpsError('internal', 'تعذر إنشاء المستخدم.');
    }
    return { ok: true, uid };
});
/**
 * First active admin for an empty tenant. Caller must already have Auth session
 * (Setup creates Auth then calls this). Uses Admin SDK so privileged fields
 * are never written via the open self-create rule.
 */
export const bootstrapTenantAdmin = onCall({
    region: 'us-central1',
    memory: '256MiB',
}, async (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const data = (request.data || {});
    const tenantId = String(data.tenantId || '').trim();
    const displayName = String(data.displayName || '').trim();
    if (!tenantId) {
        throw new HttpsError('invalid-argument', 'معرّف الشركة مطلوب.');
    }
    if (!displayName) {
        throw new HttpsError('invalid-argument', 'الاسم مطلوب.');
    }
    const existing = await db.collection(USERS).where('tenantId', '==', tenantId).limit(5).get();
    const otherUsers = existing.docs.filter((d) => d.id !== uid);
    if (otherUsers.length > 0) {
        throw new HttpsError('failed-precondition', 'يوجد مستخدمون بالفعل لهذه الشركة.');
    }
    const authUser = await getAuth().getUser(uid);
    const email = String(data.email || authUser.email || '').trim().toLowerCase();
    if (!email) {
        throw new HttpsError('failed-precondition', 'البريد غير متوفر على الحساب.');
    }
    const adminRoleId = defaultRoleDocId(tenantId, 'admin');
    const viewerRoleId = defaultRoleDocId(tenantId, 'inventory_viewer');
    const adminRoleSnap = await db.collection(ROLES).doc(adminRoleId).get();
    if (!adminRoleSnap.exists) {
        await db.collection(ROLES).doc(adminRoleId).set({
            name: 'مدير النظام',
            color: 'bg-rose-100 text-rose-700',
            roleKey: 'admin',
            tenantId,
            permissions: {
                'roles.manage': true,
                'users.manage': true,
                'settings.view': true,
                'settings.edit': true,
                'dashboard.view': true,
            },
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    const viewerSnap = await db.collection(ROLES).doc(viewerRoleId).get();
    if (!viewerSnap.exists) {
        await db.collection(ROLES).doc(viewerRoleId).set({
            name: 'عرض المخزون',
            color: 'bg-slate-100 text-slate-700',
            roleKey: 'inventory_viewer',
            tenantId,
            permissions: {
                'inventory.view': true,
                'dashboard.view': true,
            },
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    await db.collection(USERS).doc(uid).set({
        email,
        displayName,
        roleId: adminRoleId,
        tenantId,
        isActive: true,
        isSuperAdmin: false,
        createdBy: 'setup',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, uid, roleId: adminRoleId };
});

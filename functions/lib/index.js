import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { TENANT_SCOPED_COLLECTIONS } from './tenantFootprintCollections.js';
import { buildTenantBackup, assertBackupJsonSize } from './tenantBackupExport.js';
import { deleteTenantCascade } from './tenantDeleteCascade.js';
import { runAdminImportBackup, saveAdminImportHistory, } from './tenantImportRestore.js';
initializeApp();
const db = getFirestore();
const TENANT_SLUGS_COLLECTION = 'tenant_slugs';
const TENANTS_COLLECTION = 'tenants';
const PENDING_TENANTS_COLLECTION = 'pending_tenants';
const statsRootForTenant = (tenantId) => `dashboardStats/${tenantId || 'global'}`;
const EMPLOYEES_COLLECTION = 'employees';
const USER_DEVICES_COLLECTION = 'user_devices';
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const ASSETS_COLLECTION = 'assets';
const ASSET_DEPRECIATIONS_COLLECTION = 'asset_depreciations';
const FCM_TOKEN_SUBCOLLECTION = 'fcmTokens';
const toNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const deriveComponentWaste = (items) => {
    if (!Array.isArray(items))
        return 0;
    return items.reduce((sum, item) => sum + toNumber(item?.quantity), 0);
};
const normalizeReport = (value) => {
    if (!value || !value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date))
        return null;
    return {
        date: value.date,
        tenantId: String(value.tenantId || 'global').trim() || 'global',
        quantityProduced: toNumber(value.quantityProduced),
        componentScrapItems: Array.isArray(value.componentScrapItems) ? value.componentScrapItems : [],
        totalCost: toNumber(value.totalCost),
    };
};
const monthKey = (date) => date.slice(0, 7);
const normalizePeriod = (value) => {
    if (value && /^\d{4}-\d{2}$/.test(value))
        return value;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const periodToDate = (period) => {
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month - 1, 1);
};
const formatPeriod = (date) => (`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
const addMonthsToPeriod = (period, months) => {
    const base = periodToDate(period);
    return formatPeriod(new Date(base.getFullYear(), base.getMonth() + months, 1));
};
const periodEndDate = (period) => {
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month, 0, 23, 59, 59, 999);
};
const toNumberSafe = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const calculateMonthlyDepreciationSafe = (purchaseCost, salvageValue, usefulLifeMonths) => {
    const safeCost = Math.max(0, toNumberSafe(purchaseCost));
    const safeSalvage = Math.max(0, toNumberSafe(salvageValue));
    const safeLife = Math.max(1, Math.floor(toNumberSafe(usefulLifeMonths, 1)));
    return Math.max(0, safeCost - safeSalvage) / safeLife;
};
const runAssetDepreciationForPeriod = async (periodInput) => {
    const period = normalizePeriod(periodInput);
    const periodEnd = periodEndDate(period);
    let processedAssets = 0;
    let createdEntries = 0;
    let skippedEntries = 0;
    const tenantsSnap = await db.collection(TENANTS_COLLECTION).get();
    const activeTenantIds = tenantsSnap.docs
        .filter((d) => String(d.data().status || '') === 'active')
        .map((d) => d.id);
    const assetQueries = [];
    if (activeTenantIds.length === 0) {
        assetQueries.push(db.collection(ASSETS_COLLECTION).where('status', '==', 'active').get());
    }
    else {
        activeTenantIds.forEach((tid) => {
            assetQueries.push(db
                .collection(ASSETS_COLLECTION)
                .where('status', '==', 'active')
                .where('tenantId', '==', tid)
                .get());
        });
    }
    const assetSnapshots = await Promise.all(assetQueries);
    const assetDocs = assetSnapshots.flatMap((s) => s.docs);
    for (const assetDoc of assetDocs) {
        const asset = assetDoc.data();
        const assetTenantId = String(asset.tenantId || 'global').trim() || 'global';
        const purchaseDate = new Date(String(asset.purchaseDate || ''));
        if (Number.isNaN(purchaseDate.getTime()) || purchaseDate > periodEnd) {
            skippedEntries += 1;
            continue;
        }
        const purchaseStartPeriod = formatPeriod(new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1));
        const purchaseCost = Math.max(0, toNumberSafe(asset.purchaseCost));
        const salvageValue = Math.max(0, toNumberSafe(asset.salvageValue));
        const usefulLifeMonths = Math.max(1, Math.floor(toNumberSafe(asset.usefulLifeMonths, 1)));
        const fallbackMonthly = calculateMonthlyDepreciationSafe(purchaseCost, salvageValue, usefulLifeMonths);
        const monthlyDep = Math.max(0, toNumberSafe(asset.monthlyDepreciation || fallbackMonthly, fallbackMonthly));
        const startPeriod = purchaseStartPeriod;
        if (startPeriod > period) {
            skippedEntries += 1;
            continue;
        }
        let runningAccumulated = 0;
        let runningBookValue = purchaseCost;
        let assetHasNewEntries = false;
        for (let cursor = startPeriod; cursor <= period; cursor = addMonthsToPeriod(cursor, 1)) {
            const remaining = Math.max(0, (purchaseCost - salvageValue) - runningAccumulated);
            const depreciationAmount = Math.min(monthlyDep, remaining);
            if (depreciationAmount <= 0) {
                break;
            }
            const nextAccumulated = runningAccumulated + depreciationAmount;
            const nextBookValue = Math.max(salvageValue, purchaseCost - nextAccumulated);
            const depDocId = `${assetDoc.id}_${cursor}`;
            const depRef = db.collection(ASSET_DEPRECIATIONS_COLLECTION).doc(depDocId);
            const batch = db.batch();
            batch.set(depRef, {
                tenantId: assetTenantId,
                assetId: assetDoc.id,
                period: cursor,
                depreciationAmount,
                accumulatedDepreciation: nextAccumulated,
                bookValue: nextBookValue,
                createdAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            await batch.commit();
            runningAccumulated = nextAccumulated;
            runningBookValue = nextBookValue;
            createdEntries += 1;
            assetHasNewEntries = true;
        }
        if (!assetHasNewEntries) {
            skippedEntries += 1;
            continue;
        }
        await assetDoc.ref.set({
            accumulatedDepreciation: runningAccumulated,
            currentValue: runningBookValue,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        processedAssets += 1;
    }
    return {
        period,
        processedAssets,
        createdEntries,
        skippedEntries,
    };
};
const assertSuperAdmin = async (uid) => {
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists) {
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    }
    const user = userSnap.data();
    if (user.isSuperAdmin !== true) {
        throw new HttpsError('permission-denied', 'هذه العملية متاحة لمشرف المنصة فقط.');
    }
};
const hasManageUsersPermission = async (uid) => {
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists)
        return false;
    const user = userSnap.data();
    if (user.isSuperAdmin === true)
        return true;
    const roleId = String(user.roleId || '').trim();
    if (!roleId)
        return false;
    const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
    if (!roleSnap.exists)
        return false;
    const role = roleSnap.data();
    const permissions = role.permissions || {};
    return permissions['users.manage'] === true || permissions['roles.manage'] === true;
};
const userReceivesProductionReportPush = async (roleId) => {
    const rid = String(roleId || '').trim();
    if (!rid)
        return false;
    const roleSnap = await db.collection(ROLES_COLLECTION).doc(rid).get();
    if (!roleSnap.exists)
        return false;
    const role = roleSnap.data();
    const key = String(role.roleKey || '').toLowerCase();
    if (key === 'admin' || key === 'factory_manager' || key === 'system_manager')
        return true;
    const p = role.permissions || {};
    return p['reports.view'] === true && p['factoryDashboard.view'] === true;
};
const hasAnyPermission = async (uid, permissionKeys) => {
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists)
        return false;
    const user = userSnap.data();
    const roleId = String(user.roleId || '').trim();
    if (!roleId)
        return false;
    const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
    if (!roleSnap.exists)
        return false;
    const role = roleSnap.data();
    const permissions = role.permissions || {};
    return permissionKeys.some((key) => permissions[key] === true);
};
const applyDelta = async (report, factor) => {
    const tid = String(report.tenantId || 'global').trim() || 'global';
    const root = statsRootForTenant(tid);
    const dailyRef = db.doc(`${root}/daily/${report.date}`);
    const monthlyRef = db.doc(`${root}/monthly/${monthKey(report.date)}`);
    const wasteQuantity = deriveComponentWaste(report.componentScrapItems);
    const payload = {
        totalProduction: FieldValue.increment(report.quantityProduced * factor),
        totalWaste: FieldValue.increment(wasteQuantity * factor),
        totalCost: FieldValue.increment(report.totalCost * factor),
        reportsCount: FieldValue.increment(1 * factor),
        updatedAt: FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    batch.set(dailyRef, { date: report.date, month: monthKey(report.date), ...payload }, { merge: true });
    batch.set(monthlyRef, { month: monthKey(report.date), ...payload }, { merge: true });
    await batch.commit();
};
export const aggregateProductionReports = onDocumentWritten({
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
}, async (event) => {
    const before = normalizeReport(event.data?.before?.data());
    const after = normalizeReport(event.data?.after?.data());
    if (before) {
        await applyDelta(before, -1);
    }
    if (after) {
        await applyDelta(after, 1);
    }
});
export const sendPushOnNotificationCreate = onDocumentWritten({
    document: 'notifications/{notificationId}',
    region: 'us-central1',
    memory: '256MiB',
}, async (event) => {
    const after = event.data?.after;
    if (!after?.exists)
        return;
    // Guard: only on create.
    if (event.data?.before?.exists)
        return;
    const payload = after.data();
    const recipientId = String(payload.recipientId || '').trim();
    if (!recipientId)
        return;
    const devicesSnap = await db
        .collection(USER_DEVICES_COLLECTION)
        .where('employeeId', '==', recipientId)
        .where('enabled', '==', true)
        .get();
    if (devicesSnap.empty)
        return;
    const tokens = devicesSnap.docs
        .map((d) => String(d.data().token || '').trim())
        .filter(Boolean);
    if (tokens.length === 0)
        return;
    const notificationId = String(after.id);
    const deepLink = '/activity-log';
    const multicast = {
        tokens,
        notification: {
            title: String(payload.title || 'إشعار جديد'),
            body: String(payload.message || ''),
        },
        data: {
            notificationId,
            type: String(payload.type || ''),
            referenceId: String(payload.referenceId || ''),
            link: deepLink,
        },
        android: {
            notification: {
                sound: 'default',
                channelId: 'default',
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                },
            },
        },
        webpush: {
            notification: {
                icon: '/icons/pwa-icon-192.png',
                badge: '/icons/pwa-icon-192.png',
                requireInteraction: false,
                silent: false,
                vibrate: [150, 50, 150],
                tag: notificationId,
            },
            headers: {
                Urgency: 'high',
            },
        },
    };
    const sendResult = await getMessaging().sendEachForMulticast(multicast);
    const invalidTokenIndexes = [];
    sendResult.responses.forEach((response, index) => {
        const code = response.error?.code || '';
        if (!response.success && (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token'))) {
            invalidTokenIndexes.push(index);
        }
    });
    if (invalidTokenIndexes.length === 0)
        return;
    const cleanupBatch = db.batch();
    invalidTokenIndexes.forEach((idx) => {
        const token = tokens[idx];
        if (!token)
            return;
        cleanupBatch.set(db.collection(USER_DEVICES_COLLECTION).doc(token), {
            enabled: false,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    await cleanupBatch.commit();
});
export const onProductionReportCreated = onDocumentCreated({
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
}, async (event) => {
    const reportSnap = event.data;
    if (!reportSnap?.exists)
        return;
    const reportId = String(event.params.reportId || reportSnap.id || '').trim();
    if (!reportId)
        return;
    const report = reportSnap.data();
    const producedQty = Number(report.quantityProduced ?? report.producedQty ?? 0);
    const reportTitle = '📋 تقرير إنتاج جديد';
    const reportBody = [
        String(report.productName || report.reportCode || 'منتج'),
        String(report.lineName || 'خط إنتاج'),
        `${Number.isFinite(producedQty) ? producedQty : 0} وحدة`,
    ].join(' — ');
    const reportTenant = String(report.tenantId || '').trim();
    let usersQuery = db
        .collection(USERS_COLLECTION)
        .where('isActive', '==', true);
    if (reportTenant) {
        usersQuery = usersQuery.where('tenantId', '==', reportTenant);
    }
    const usersSnap = await usersQuery.get();
    if (usersSnap.empty)
        return;
    const tokenEntries = [];
    const seenTokens = new Set();
    const roleNotifyCache = new Map();
    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const roleId = String(userData.roleId || userData.role || '').trim();
        let canReceiveByRole = roleNotifyCache.get(roleId);
        if (canReceiveByRole === undefined) {
            canReceiveByRole = await userReceivesProductionReportPush(roleId);
            roleNotifyCache.set(roleId, canReceiveByRole);
        }
        if (!canReceiveByRole)
            continue;
        if (userData.notifications?.productionReports === false)
            continue;
        const userTokensSnap = await userDoc.ref.collection(FCM_TOKEN_SUBCOLLECTION).get();
        userTokensSnap.forEach((tokenDoc) => {
            const tokenData = tokenDoc.data();
            const token = String(tokenData.token || '').trim();
            if (!token || tokenData.enabled === false || seenTokens.has(token))
                return;
            seenTokens.add(token);
            tokenEntries.push({ token, ref: tokenDoc.ref });
        });
    }
    if (tokenEntries.length === 0)
        return;
    const allTokens = tokenEntries.map((entry) => entry.token);
    const BATCH_SIZE = 500;
    const cleanupRefs = [];
    for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
        const batchEntries = tokenEntries.slice(i, i + BATCH_SIZE);
        const batchTokens = batchEntries.map((entry) => entry.token);
        const sendResult = await getMessaging().sendEachForMulticast({
            tokens: batchTokens,
            notification: {
                title: reportTitle,
                body: reportBody,
            },
            data: {
                type: 'production_report',
                reportId,
                productName: String(report.productName || ''),
                lineName: String(report.lineName || ''),
                producedQty: String(Number.isFinite(producedQty) ? producedQty : 0),
                supervisorName: String(report.supervisorName || ''),
                date: String(report.date || ''),
                url: '/reports',
                sound: 'notification.mp3',
                clickAction: 'OPEN_REPORT',
            },
            android: {
                notification: {
                    channelId: 'production_reports',
                    priority: 'high',
                    sound: 'default',
                },
            },
            webpush: {
                headers: { Urgency: 'high' },
                notification: {
                    title: reportTitle,
                    body: reportBody,
                    icon: '/icons/pwa-icon-192.png',
                    badge: '/icons/pwa-icon-192.png',
                    tag: `production-report-${reportId}`,
                    renotify: true,
                    requireInteraction: false,
                    silent: false,
                    vibrate: [200, 100, 200],
                },
                fcmOptions: {
                    link: '/reports',
                },
            },
        });
        sendResult.responses.forEach((response, idx) => {
            if (response.success)
                return;
            const code = String(response.error?.code || '');
            if (code.includes('messaging/invalid-registration-token')
                || code.includes('messaging/registration-token-not-registered')
                || code.includes('registration-token-not-registered')
                || code.includes('invalid-registration-token')) {
                cleanupRefs.push(batchEntries[idx].ref);
            }
        });
    }
    if (cleanupRefs.length === 0)
        return;
    const batch = db.batch();
    cleanupRefs.forEach((ref) => {
        batch.set(ref, {
            enabled: false,
            lastSeen: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    await batch.commit();
});
export const adminDeleteUserHard = onCall({
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
    const targetUid = String(request.data?.targetUid || '').trim();
    if (!targetUid) {
        throw new HttpsError('invalid-argument', 'يجب تمرير targetUid.');
    }
    if (targetUid === requesterUid) {
        throw new HttpsError('failed-precondition', 'لا يمكن حذف حسابك الحالي.');
    }
    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const targetUserSnap = await db.collection(USERS_COLLECTION).doc(targetUid).get();
    if (!targetUserSnap.exists) {
        throw new HttpsError('not-found', 'المستخدم غير موجود.');
    }
    const reqCtx = requesterSnap.data();
    const tgtCtx = targetUserSnap.data();
    if (!reqCtx?.isSuperAdmin && reqCtx?.tenantId !== tgtCtx?.tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكنك إدارة مستخدم من شركة أخرى.');
    }
    const linkedEmployees = await db
        .collection(EMPLOYEES_COLLECTION)
        .where('userId', '==', targetUid)
        .get();
    if (!linkedEmployees.empty) {
        const batch = db.batch();
        linkedEmployees.docs.forEach((employeeDoc) => {
            batch.update(employeeDoc.ref, {
                userId: '',
                email: '',
                hasSystemAccess: false,
                updatedAt: FieldValue.serverTimestamp(),
            });
        });
        await batch.commit();
    }
    await db.collection(USERS_COLLECTION).doc(targetUid).delete();
    try {
        await getAuth().deleteUser(targetUid);
    }
    catch (error) {
        const code = String(error?.code || '');
        if (code !== 'auth/user-not-found') {
            throw new HttpsError('internal', 'تعذر حذف حساب المصادقة.');
        }
    }
    return { ok: true, targetUid };
});
export const adminUpdateUserCredentials = onCall({
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
    const targetUid = String(request.data?.targetUid || '').trim();
    const nextEmail = String(request.data?.email || '').trim().toLowerCase();
    const nextPassword = String(request.data?.password || '').trim();
    if (!targetUid) {
        throw new HttpsError('invalid-argument', 'يجب تمرير targetUid.');
    }
    if (targetUid === requesterUid) {
        throw new HttpsError('failed-precondition', 'لا يمكن تعديل بيانات حسابك من هذا الإجراء.');
    }
    if (!nextEmail && !nextPassword) {
        throw new HttpsError('invalid-argument', 'يجب تمرير بريد أو كلمة مرور جديدة.');
    }
    if (nextEmail && !nextEmail.includes('@')) {
        throw new HttpsError('invalid-argument', 'صيغة البريد الإلكتروني غير صحيحة.');
    }
    if (nextPassword && nextPassword.length < 6) {
        throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    }
    const requesterSnapUpd = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const targetUserSnapUpd = await db.collection(USERS_COLLECTION).doc(targetUid).get();
    if (!targetUserSnapUpd.exists) {
        throw new HttpsError('not-found', 'المستخدم غير موجود.');
    }
    const reqUpd = requesterSnapUpd.data();
    const tgtUpd = targetUserSnapUpd.data();
    if (!reqUpd?.isSuperAdmin && reqUpd?.tenantId !== tgtUpd?.tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكنك إدارة مستخدم من شركة أخرى.');
    }
    if (nextEmail) {
        const tenantId = String(tgtUpd?.tenantId || '').trim();
        const existing = tenantId
            ? await db
                .collection(USERS_COLLECTION)
                .where('email', '==', nextEmail)
                .where('tenantId', '==', tenantId)
                .get()
            : await db
                .collection(USERS_COLLECTION)
                .where('email', '==', nextEmail)
                .get();
        const usedByOther = existing.docs.some((docSnap) => docSnap.id !== targetUid);
        if (usedByOther) {
            throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم بالفعل.');
        }
    }
    try {
        await getAuth().updateUser(targetUid, {
            ...(nextEmail ? { email: nextEmail } : {}),
            ...(nextPassword ? { password: nextPassword } : {}),
        });
    }
    catch (error) {
        const code = String(error?.code || '');
        if (code.includes('email-already-exists')) {
            throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم بالفعل في Firebase Auth.');
        }
        if (code.includes('user-not-found')) {
            throw new HttpsError('not-found', 'المستخدم غير موجود في Firebase Auth.');
        }
        throw new HttpsError('internal', 'تعذر تحديث بيانات الحساب في Firebase Auth.');
    }
    if (nextEmail) {
        await db.collection(USERS_COLLECTION).doc(targetUid).set({
            email: nextEmail,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        const linkedEmployees = await db
            .collection(EMPLOYEES_COLLECTION)
            .where('userId', '==', targetUid)
            .get();
        if (!linkedEmployees.empty) {
            const batch = db.batch();
            linkedEmployees.docs.forEach((employeeDoc) => {
                batch.update(employeeDoc.ref, {
                    email: nextEmail,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            });
            await batch.commit();
        }
    }
    return { ok: true, targetUid };
});
export const scheduledAssetDepreciationJob = onSchedule({
    schedule: '0 2 1 * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
}, async () => {
    await runAssetDepreciationForPeriod();
});
export const runAssetDepreciationJob = onCall({
    region: 'us-central1',
    memory: '256MiB',
}, async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const permitted = await hasAnyPermission(requesterUid, [
        'assets.depreciation.run',
        'costs.manage',
        'roles.manage',
    ]);
    if (!permitted) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية تشغيل احتساب الإهلاك.');
    }
    const requestedPeriod = String(request.data?.period || '').trim();
    return runAssetDepreciationForPeriod(requestedPeriod || undefined);
});
const TENANT_FOOTPRINT_AVG_DOC_BYTES = 900;
/** Super-admin: aggregate document counts per tenant (for platform insights). */
export const getTenantFirestoreFootprint = onCall({
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
}, async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);
    const tenantId = String(request.data?.tenantId || '').trim();
    if (!tenantId) {
        throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }
    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    if (!tenantSnap.exists) {
        throw new HttpsError('not-found', 'الشركة غير موجودة.');
    }
    const t = tenantSnap.data();
    const perCollection = {};
    const failedCollections = [];
    const chunkSize = 12;
    for (let i = 0; i < TENANT_SCOPED_COLLECTIONS.length; i += chunkSize) {
        const slice = TENANT_SCOPED_COLLECTIONS.slice(i, i + chunkSize);
        await Promise.all(slice.map(async (collName) => {
            try {
                const q = db.collection(collName).where('tenantId', '==', tenantId);
                const agg = await q.count().get();
                const c = agg.data().count;
                if (c > 0) {
                    perCollection[collName] = c;
                }
            }
            catch {
                failedCollections.push(collName);
            }
        }));
    }
    try {
        const ss = await db.collection('system_settings').doc(tenantId).get();
        if (ss.exists) {
            perCollection.system_settings_doc = 1;
        }
    }
    catch {
        failedCollections.push('system_settings_doc');
    }
    try {
        const dailyAgg = await db
            .collection('dashboardStats')
            .doc(tenantId)
            .collection('daily')
            .count()
            .get();
        const d = dailyAgg.data().count;
        if (d > 0) {
            perCollection['dashboardStats/daily'] = d;
        }
    }
    catch {
        failedCollections.push('dashboardStats/daily');
    }
    try {
        const monthlyAgg = await db
            .collection('dashboardStats')
            .doc(tenantId)
            .collection('monthly')
            .count()
            .get();
        const m = monthlyAgg.data().count;
        if (m > 0) {
            perCollection['dashboardStats/monthly'] = m;
        }
    }
    catch {
        failedCollections.push('dashboardStats/monthly');
    }
    const totalDocuments = Object.values(perCollection).reduce((sum, n) => sum + n, 0);
    const userCount = perCollection.users ?? 0;
    const collectionsWithData = Object.keys(perCollection).length;
    const estimatedStorageBytes = Math.round(totalDocuments * TENANT_FOOTPRINT_AVG_DOC_BYTES);
    return {
        tenantId,
        slug: String(t.slug || ''),
        name: String(t.name || ''),
        status: String(t.status || ''),
        userCount,
        collectionsWithData,
        totalDocuments,
        perCollection,
        failedCollections,
        estimatedStorageBytes,
        avgDocBytesAssumption: TENANT_FOOTPRINT_AVG_DOC_BYTES,
        usageNoteAr: 'فوترة Firebase تُحسب على مستوى المشروع بالكامل (قراءات، كتابات، تخزين، شبكة). الأرقام هنا من استعلامات عدّ المستندات ذات tenantId. حجم التخزين تقدير تقريبي ولا يعكس الفوترة الفعلية.',
    };
});
/** Super-admin: export one tenant backup JSON (same shape as client backup file). */
export const exportTenantBackup = onCall({
    region: 'us-central1',
    memory: '2GiB',
    timeoutSeconds: 300,
}, async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);
    const tenantId = String(request.data?.tenantId || '').trim();
    if (!tenantId) {
        throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }
    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    if (!tenantSnap.exists) {
        throw new HttpsError('not-found', 'الشركة غير موجودة.');
    }
    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const requesterEmail = String(requesterSnap.data()?.email || '').trim();
    const createdBy = requesterEmail || requesterUid;
    try {
        const backup = await buildTenantBackup(db, tenantId, createdBy);
        assertBackupJsonSize(backup);
        return { backup };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'فشل بناء النسخة الاحتياطية.';
        if (msg.includes('كبيرة جداً')) {
            throw new HttpsError('resource-exhausted', msg);
        }
        throw new HttpsError('internal', msg);
    }
});
/** Super-admin: delete all tenant data in Firestore + Auth users for that tenant. */
export const adminDeleteTenantCascade = onCall({
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 540,
}, async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);
    const tenantId = String(request.data?.tenantId || '').trim();
    const confirmPhrase = String(request.data?.confirmPhrase || '').trim();
    if (!tenantId) {
        throw new HttpsError('invalid-argument', 'يجب تمرير tenantId.');
    }
    const expected = `DELETE_TENANT_${tenantId}`;
    if (confirmPhrase !== expected) {
        throw new HttpsError('invalid-argument', `يجب إدخال نص التأكيد بالضبط: ${expected}`);
    }
    const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
    if (!tenantSnap.exists) {
        throw new HttpsError('not-found', 'الشركة غير موجودة.');
    }
    const t = tenantSnap.data();
    const slug = String(t.slug || '').trim().toLowerCase();
    try {
        const result = await deleteTenantCascade(db, tenantId, slug);
        return { ok: true, ...result };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'فشل الحذف.';
        throw new HttpsError('internal', msg);
    }
});
const MAX_IMPORT_BACKUP_JSON_CHARS = 31 * 1024 * 1024;
/** Super-admin: restore Firestore from backup JSON (Admin SDK — bypasses client security rules). */
export const importTenantBackup = onCall({
    region: 'us-central1',
    memory: '2GiB',
    timeoutSeconds: 540,
}, async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    await assertSuperAdmin(requesterUid);
    const data = request.data;
    const mode = String(data?.mode || 'merge').trim();
    if (!['merge', 'replace', 'full_reset'].includes(mode)) {
        throw new HttpsError('invalid-argument', 'وضع الاستعادة غير صالح.');
    }
    const backup = data?.backup;
    if (!backup || typeof backup !== 'object') {
        throw new HttpsError('invalid-argument', 'يجب تمرير backup.');
    }
    const jsonLen = JSON.stringify(backup).length;
    if (jsonLen > MAX_IMPORT_BACKUP_JSON_CHARS) {
        throw new HttpsError('resource-exhausted', 'حجم النسخة كبير جداً لإرسالها عبر هذه الدالة. جرّب الاستعادة من العميل مع تفعيل «تخطي النسخة التلقائية» أو قسّم البيانات.');
    }
    const requesterSnap = await db.collection(USERS_COLLECTION).doc(requesterUid).get();
    const createdBy = String(requesterSnap.data()?.email || requesterUid);
    try {
        const restored = await runAdminImportBackup(db, backup, mode);
        const tenantIdForHistory = String(data?.tenantIdForHistory || '').trim();
        await saveAdminImportHistory(db, {
            tenantId: tenantIdForHistory || undefined,
            mode,
            restored,
            collectionNames: Object.keys(backup.collections || {}),
            createdBy,
            fileMetadataType: String(backup.metadata?.type || ''),
        });
        return { success: true, restored };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'فشلت الاستعادة';
        throw new HttpsError('internal', msg);
    }
});
/** Public: resolve tenant slug before login (client cannot read tenant_slugs without auth). */
export const resolveTenantSlug = onCall({
    region: 'us-central1',
    memory: '128MiB',
    cors: true,
    invoker: 'public',
}, async (request) => {
    const slug = String(request.data?.slug || '')
        .trim()
        .toLowerCase();
    if (!slug || !/^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/.test(slug)) {
        throw new HttpsError('invalid-argument', 'معرّف الشركة غير صالح.');
    }
    const slugSnap = await db.collection(TENANT_SLUGS_COLLECTION).doc(slug).get();
    if (slugSnap.exists) {
        const tenantId = String(slugSnap.data()?.tenantId || '').trim();
        if (!tenantId) {
            return { exists: false };
        }
        const tenantSnap = await db.collection(TENANTS_COLLECTION).doc(tenantId).get();
        const status = tenantSnap.exists
            ? String(tenantSnap.data()?.status || 'active')
            : 'unknown';
        return { exists: true, tenantId, status };
    }
    const pendingSnap = await db
        .collection(PENDING_TENANTS_COLLECTION)
        .where('slug', '==', slug)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
    if (!pendingSnap.empty) {
        const docSnap = pendingSnap.docs[0];
        const data = docSnap.data();
        return {
            exists: true,
            tenantId: docSnap.id,
            status: String(data?.status || 'pending'),
            pendingRegistration: true,
        };
    }
    return { exists: false };
});

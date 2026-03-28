import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const STATS_ROOT = 'dashboardStats/global';
const EMPLOYEES_COLLECTION = 'employees';
const USER_DEVICES_COLLECTION = 'user_devices';
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';
const ASSETS_COLLECTION = 'assets';
const ASSET_DEPRECIATIONS_COLLECTION = 'asset_depreciations';
const FCM_TOKEN_SUBCOLLECTION = 'fcmTokens';
const REPORT_NOTIFY_ROLE_IDS = new Set(['admin', 'factory_manager', 'system_manager']);

type ReportLike = {
  date?: string;
  quantityProduced?: number;
  componentScrapItems?: Array<{ quantity?: number }>;
  totalCost?: number;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const deriveComponentWaste = (items: ReportLike['componentScrapItems']): number => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + toNumber(item?.quantity), 0);
};

const normalizeReport = (value: ReportLike | undefined): Required<ReportLike> | null => {
  if (!value || !value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  return {
    date: value.date,
    quantityProduced: toNumber(value.quantityProduced),
    componentScrapItems: Array.isArray(value.componentScrapItems) ? value.componentScrapItems : [],
    totalCost: toNumber(value.totalCost),
  };
};

const monthKey = (date: string) => date.slice(0, 7);

const normalizePeriod = (value?: string): string => {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const periodToDate = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1);
};

const formatPeriod = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

const addMonthsToPeriod = (period: string, months: number): string => {
  const base = periodToDate(period);
  return formatPeriod(new Date(base.getFullYear(), base.getMonth() + months, 1));
};

const periodEndDate = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const calculateMonthlyDepreciationSafe = (
  purchaseCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
): number => {
  const safeCost = Math.max(0, toNumberSafe(purchaseCost));
  const safeSalvage = Math.max(0, toNumberSafe(salvageValue));
  const safeLife = Math.max(1, Math.floor(toNumberSafe(usefulLifeMonths, 1)));
  return Math.max(0, safeCost - safeSalvage) / safeLife;
};

const runAssetDepreciationForPeriod = async (periodInput?: string) => {
  const period = normalizePeriod(periodInput);
  const periodEnd = periodEndDate(period);
  const activeAssetsSnap = await db
    .collection(ASSETS_COLLECTION)
    .where('status', '==', 'active')
    .get();

  let processedAssets = 0;
  let createdEntries = 0;
  let skippedEntries = 0;

  for (const assetDoc of activeAssetsSnap.docs) {
    const asset = assetDoc.data() as {
      purchaseDate?: string;
      purchaseCost?: number;
      salvageValue?: number;
      usefulLifeMonths?: number;
      monthlyDepreciation?: number;
      accumulatedDepreciation?: number;
      currentValue?: number;
    };
    const purchaseDate = new Date(String(asset.purchaseDate || ''));
    if (Number.isNaN(purchaseDate.getTime()) || purchaseDate > periodEnd) {
      skippedEntries += 1;
      continue;
    }
    const purchaseStartPeriod = formatPeriod(
      new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1),
    );
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

const hasManageUsersPermission = async (uid: string): Promise<boolean> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return false;
  const user = userSnap.data() as { roleId?: string };
  const roleId = String(user.roleId || '').trim();
  if (!roleId) return false;
  const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
  if (!roleSnap.exists) return false;
  const role = roleSnap.data() as { permissions?: Record<string, boolean> };
  const permissions = role.permissions || {};
  return permissions['users.manage'] === true || permissions['roles.manage'] === true;
};

const hasAnyPermission = async (uid: string, permissionKeys: string[]): Promise<boolean> => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return false;
  const user = userSnap.data() as { roleId?: string };
  const roleId = String(user.roleId || '').trim();
  if (!roleId) return false;
  const roleSnap = await db.collection(ROLES_COLLECTION).doc(roleId).get();
  if (!roleSnap.exists) return false;
  const role = roleSnap.data() as { permissions?: Record<string, boolean> };
  const permissions = role.permissions || {};
  return permissionKeys.some((key) => permissions[key] === true);
};

const applyDelta = async (report: Required<ReportLike>, factor: 1 | -1) => {
  const dailyRef = db.doc(`${STATS_ROOT}/daily/${report.date}`);
  const monthlyRef = db.doc(`${STATS_ROOT}/monthly/${monthKey(report.date)}`);
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

export const aggregateProductionReports = onDocumentWritten(
  {
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const before = normalizeReport(event.data?.before?.data() as ReportLike | undefined);
    const after = normalizeReport(event.data?.after?.data() as ReportLike | undefined);

    if (before) {
      await applyDelta(before, -1);
    }
    if (after) {
      await applyDelta(after, 1);
    }
  },
);

export const sendPushOnNotificationCreate = onDocumentWritten(
  {
    document: 'notifications/{notificationId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    // Guard: only on create.
    if (event.data?.before?.exists) return;

    const payload = after.data() as {
      recipientId?: string;
      title?: string;
      message?: string;
      type?: string;
      referenceId?: string;
    };
    const recipientId = String(payload.recipientId || '').trim();
    if (!recipientId) return;

    const devicesSnap = await db
      .collection(USER_DEVICES_COLLECTION)
      .where('employeeId', '==', recipientId)
      .where('enabled', '==', true)
      .get();

    if (devicesSnap.empty) return;
    const tokens = devicesSnap.docs
      .map((d) => String((d.data() as { token?: string }).token || '').trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    const notificationId = String(after.id);
    const deepLink = '/#/activity-log';
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
    const invalidTokenIndexes: number[] = [];
    sendResult.responses.forEach((response, index) => {
      const code = response.error?.code || '';
      if (!response.success && (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token'))) {
        invalidTokenIndexes.push(index);
      }
    });
    if (invalidTokenIndexes.length === 0) return;

    const cleanupBatch = db.batch();
    invalidTokenIndexes.forEach((idx) => {
      const token = tokens[idx];
      if (!token) return;
      cleanupBatch.set(db.collection(USER_DEVICES_COLLECTION).doc(token), {
        enabled: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await cleanupBatch.commit();
  },
);

export const onProductionReportCreated = onDocumentCreated(
  {
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const reportSnap = event.data;
    if (!reportSnap?.exists) return;
    const reportId = String(event.params.reportId || reportSnap.id || '').trim();
    if (!reportId) return;

    const report = reportSnap.data() as {
      productName?: string;
      lineName?: string;
      quantityProduced?: number;
      producedQty?: number;
      supervisorName?: string;
      date?: string;
      reportCode?: string;
      workOrderId?: string;
      employeeId?: string;
    };

    const producedQty = Number(report.quantityProduced ?? report.producedQty ?? 0);
    const reportTitle = '📋 تقرير إنتاج جديد';
    const reportBody = [
      String(report.productName || report.reportCode || 'منتج'),
      String(report.lineName || 'خط إنتاج'),
      `${Number.isFinite(producedQty) ? producedQty : 0} وحدة`,
    ].join(' — ');

    const usersSnap = await db
      .collection(USERS_COLLECTION)
      .where('isActive', '==', true)
      .get();
    if (usersSnap.empty) return;

    const tokenEntries: Array<{ token: string; ref: FirebaseFirestore.DocumentReference }> = [];
    const seenTokens = new Set<string>();

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data() as {
        roleId?: string;
        role?: string;
        notifications?: { productionReports?: boolean };
      };
      const roleCandidate = String(userData.roleId || userData.role || '').trim().toLowerCase();
      const canReceiveByRole = REPORT_NOTIFY_ROLE_IDS.has(roleCandidate);
      if (!canReceiveByRole) continue;
      if (userData.notifications?.productionReports === false) continue;

      const userTokensSnap = await userDoc.ref.collection(FCM_TOKEN_SUBCOLLECTION).get();
      userTokensSnap.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data() as { token?: string; enabled?: boolean };
        const token = String(tokenData.token || '').trim();
        if (!token || tokenData.enabled === false || seenTokens.has(token)) return;
        seenTokens.add(token);
        tokenEntries.push({ token, ref: tokenDoc.ref });
      });
    }

    // ── Also notify the supervisor whose work order received the report ────
    // Uses employeeId from the report (the supervisor who submitted it).
    // seenTokens prevents double-sending if the supervisor is also an admin.
    const supervisorEmployeeId = String(report.employeeId || '').trim();
    if (supervisorEmployeeId) {
      const supUserSnap = await db
        .collection(USERS_COLLECTION)
        .where('employeeId', '==', supervisorEmployeeId)
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (!supUserSnap.empty) {
        const supUserDoc = supUserSnap.docs[0];
        const supUserData = supUserDoc.data() as { notifications?: { productionReports?: boolean } };
        if (supUserData.notifications?.productionReports !== false) {
          const supTokensSnap = await supUserDoc.ref.collection(FCM_TOKEN_SUBCOLLECTION).get();
          supTokensSnap.forEach((tokenDoc) => {
            const tokenData = tokenDoc.data() as { token?: string; enabled?: boolean };
            const token = String(tokenData.token || '').trim();
            if (!token || tokenData.enabled === false || seenTokens.has(token)) return;
            seenTokens.add(token);
            tokenEntries.push({ token, ref: tokenDoc.ref });
          });
        }
      }
    }

    if (tokenEntries.length === 0) return;

    const allTokens = tokenEntries.map((entry) => entry.token);
    const BATCH_SIZE = 500;
    const cleanupRefs: FirebaseFirestore.DocumentReference[] = [];

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
            link: '/#/reports',
          },
        },
      });

      sendResult.responses.forEach((response, idx) => {
        if (response.success) return;
        const code = String(response.error?.code || '');
        if (
          code.includes('messaging/invalid-registration-token')
          || code.includes('messaging/registration-token-not-registered')
          || code.includes('registration-token-not-registered')
          || code.includes('invalid-registration-token')
        ) {
          cleanupRefs.push(batchEntries[idx].ref);
        }
      });
    }

    if (cleanupRefs.length === 0) return;
    const batch = db.batch();
    cleanupRefs.forEach((ref) => {
      batch.set(ref, {
        enabled: false,
        lastSeen: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  },
);

export const adminDeleteUserHard = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const permitted = await hasManageUsersPermission(requesterUid);
    if (!permitted) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة المستخدمين.');
    }

    const targetUid = String((request.data as { targetUid?: string })?.targetUid || '').trim();
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'يجب تمرير targetUid.');
    }
    if (targetUid === requesterUid) {
      throw new HttpsError('failed-precondition', 'لا يمكن حذف حسابك الحالي.');
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
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code !== 'auth/user-not-found') {
        throw new HttpsError('internal', 'تعذر حذف حساب المصادقة.');
      }
    }

    return { ok: true, targetUid };
  },
);

export const adminUpdateUserCredentials = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const requesterUid = String(request.auth?.uid || '').trim();
    if (!requesterUid) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    }
    const permitted = await hasManageUsersPermission(requesterUid);
    if (!permitted) {
      throw new HttpsError('permission-denied', 'لا تملك صلاحية إدارة المستخدمين.');
    }

    const targetUid = String((request.data as { targetUid?: string })?.targetUid || '').trim();
    const nextEmail = String((request.data as { email?: string })?.email || '').trim().toLowerCase();
    const nextPassword = String((request.data as { password?: string })?.password || '').trim();

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

    if (nextEmail) {
      const existing = await db
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
    } catch (error: any) {
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
      await db.collection(USERS_COLLECTION).doc(targetUid).set(
        {
          email: nextEmail,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

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
  },
);

export const scheduledAssetDepreciationJob = onSchedule(
  {
    schedule: '0 2 1 * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    await runAssetDepreciationForPeriod();
  },
);

export const runAssetDepreciationJob = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
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

    const requestedPeriod = String((request.data as { period?: string } | undefined)?.period || '').trim();
    return runAssetDepreciationForPeriod(requestedPeriod || undefined);
  },
);

// ── Work Order Completion Notification ────────────────────────────────────────
// Fires when a work order's status changes to 'completed'.
// Sends a push notification to the supervisor responsible for that order.
export const onWorkOrderCompleted = onDocumentWritten(
  {
    document: 'work_orders/{woId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const before = event.data?.before.data() as
      | { status?: string; supervisorId?: string; workOrderNumber?: string }
      | undefined;
    const after = event.data?.after.data() as
      | { status?: string; supervisorId?: string; workOrderNumber?: string }
      | undefined;

    if (!before || !after) return;
    if (before.status === after.status) return;
    if (after.status !== 'completed') return;

    const supervisorId = String(after.supervisorId || '').trim();
    if (!supervisorId) return;

    const supSnap = await db
      .collection(USERS_COLLECTION)
      .where('employeeId', '==', supervisorId)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    if (supSnap.empty) return;

    const supDoc = supSnap.docs[0];
    const tokensSnap = await supDoc.ref.collection(FCM_TOKEN_SUBCOLLECTION).get();
    const tokens: string[] = [];
    tokensSnap.forEach((td) => {
      const t = String(td.data().token || '').trim();
      if (t && td.data().enabled !== false) tokens.push(t);
    });
    if (tokens.length === 0) return;

    const woNumber = String(after.workOrderNumber || event.params.woId || '');
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '✅ اكتمل أمر الشغل',
        body: `أمر الشغل ${woNumber} اكتمل بنجاح`,
      },
      data: {
        type: 'work_order_completed',
        workOrderId: String(event.params.woId),
        url: '/work-orders',
        clickAction: 'OPEN_WORK_ORDER',
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          icon: '/icons/pwa-icon-192.png',
          badge: '/icons/pwa-icon-192.png',
          tag: `wo-completed-${event.params.woId}`,
          vibrate: [200, 100, 200],
        },
        fcmOptions: { link: '/#/work-orders' },
      },
    });
  },
);

// ── Production Plan Completion Notification ───────────────────────────────────
// Fires when a production plan's status changes to 'completed'.
// Sends a push notification to admin and factory_manager roles.
export const onProductionPlanCompleted = onDocumentWritten(
  {
    document: 'production_plans/{planId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const before = event.data?.before.data() as { status?: string } | undefined;
    const after = event.data?.after.data() as
      | { status?: string; productName?: string; plannedQuantity?: number }
      | undefined;

    if (!before || !after) return;
    if (before.status === after.status) return;
    if (after.status !== 'completed') return;

    const productName = String(after.productName || '').trim();
    const plannedQty = Number(after.plannedQuantity || 0);

    const usersSnap = await db
      .collection(USERS_COLLECTION)
      .where('isActive', '==', true)
      .get();
    if (usersSnap.empty) return;

    const seenTokens = new Set<string>();
    const tokenEntries: Array<{ token: string; ref: FirebaseFirestore.DocumentReference }> = [];

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data() as { roleId?: string; role?: string };
      const roleCandidate = String(userData.roleId || userData.role || '').trim().toLowerCase();
      if (!REPORT_NOTIFY_ROLE_IDS.has(roleCandidate)) continue;

      const tSnap = await userDoc.ref.collection(FCM_TOKEN_SUBCOLLECTION).get();
      tSnap.forEach((td) => {
        const t = String(td.data().token || '').trim();
        if (!t || td.data().enabled === false || seenTokens.has(t)) return;
        seenTokens.add(t);
        tokenEntries.push({ token: t, ref: td.ref });
      });
    }

    if (tokenEntries.length === 0) return;

    const body = [
      productName || 'منتج',
      plannedQty > 0 ? `${plannedQty} وحدة` : null,
    ].filter(Boolean).join(' — ');

    await getMessaging().sendEachForMulticast({
      tokens: tokenEntries.map((e) => e.token),
      notification: {
        title: '🎯 خطة إنتاج مكتملة',
        body,
      },
      data: {
        type: 'plan_completed',
        planId: String(event.params.planId),
        url: '/production-plans',
        clickAction: 'OPEN_PLAN',
      },
      webpush: {
        headers: { Urgency: 'normal' },
        notification: {
          icon: '/icons/pwa-icon-192.png',
          badge: '/icons/pwa-icon-192.png',
          tag: `plan-completed-${event.params.planId}`,
          vibrate: [150, 50, 150],
        },
        fcmOptions: { link: '/#/production-plans' },
      },
    });
  },
);

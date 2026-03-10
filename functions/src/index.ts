import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
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
    };
    const purchaseDate = new Date(String(asset.purchaseDate || ''));
    if (Number.isNaN(purchaseDate.getTime()) || purchaseDate > periodEnd) {
      skippedEntries += 1;
      continue;
    }

    const depDocId = `${assetDoc.id}_${period}`;
    const depRef = db.collection(ASSET_DEPRECIATIONS_COLLECTION).doc(depDocId);
    const existing = await depRef.get();
    if (existing.exists) {
      skippedEntries += 1;
      continue;
    }

    const purchaseCost = Math.max(0, toNumberSafe(asset.purchaseCost));
    const salvageValue = Math.max(0, toNumberSafe(asset.salvageValue));
    const usefulLifeMonths = Math.max(1, Math.floor(toNumberSafe(asset.usefulLifeMonths, 1)));
    const accumulated = Math.max(0, toNumberSafe(asset.accumulatedDepreciation));
    const fallbackMonthly = calculateMonthlyDepreciationSafe(purchaseCost, salvageValue, usefulLifeMonths);
    const monthlyDep = Math.max(0, toNumberSafe(asset.monthlyDepreciation || fallbackMonthly, fallbackMonthly));
    const remaining = Math.max(0, (purchaseCost - salvageValue) - accumulated);
    const depreciationAmount = Math.min(monthlyDep, remaining);
    if (depreciationAmount <= 0) {
      skippedEntries += 1;
      continue;
    }

    const nextAccumulated = accumulated + depreciationAmount;
    const nextBookValue = Math.max(salvageValue, purchaseCost - nextAccumulated);

    const batch = db.batch();
    batch.set(depRef, {
      assetId: assetDoc.id,
      period,
      depreciationAmount,
      accumulatedDepreciation: nextAccumulated,
      bookValue: nextBookValue,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(assetDoc.ref, {
      accumulatedDepreciation: nextAccumulated,
      currentValue: nextBookValue,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    processedAssets += 1;
    createdEntries += 1;
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

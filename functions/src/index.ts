import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const STATS_ROOT = 'dashboardStats/global';
const EMPLOYEES_COLLECTION = 'employees';
const LINES_COLLECTION = 'production_lines';
const REPORTS_COLLECTION = 'production_reports';
const ASSIGNMENTS_COLLECTION = 'line_worker_assignments';
const NOTIFICATIONS_COLLECTION = 'notifications';
const AUTOMATION_RUNS_COLLECTION = 'automation_runs';
const USER_DEVICES_COLLECTION = 'user_devices';
const USERS_COLLECTION = 'users';
const ROLES_COLLECTION = 'roles';

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

const toYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getOperationalDate = (startHour = 8, now = new Date()): string => {
  const d = new Date(now);
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return toYmd(d);
};

const summarizeNames = (names: string[], maxItems = 5): string => {
  if (names.length === 0) return '—';
  const picked = names.slice(0, maxItems);
  const rest = names.length - picked.length;
  return rest > 0 ? `${picked.join('، ')} +${rest}` : picked.join('، ');
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

export const notifyDailySupervisorReportCompliance = onSchedule(
  {
    schedule: '5 16 * * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    const operationalDate = getOperationalDate(8, new Date());
    const runRef = db.doc(`${AUTOMATION_RUNS_COLLECTION}/report_compliance_daily_${operationalDate}`);

    const [employeesSnap, linesSnap, assignmentsSnap, reportsSnap] = await Promise.all([
      db.collection(EMPLOYEES_COLLECTION).get(),
      db.collection(LINES_COLLECTION).get(),
      db.collection(ASSIGNMENTS_COLLECTION).where('date', '==', operationalDate).get(),
      db.collection(REPORTS_COLLECTION).where('date', '==', operationalDate).get(),
    ]);

    const lineNameById = new Map<string, string>();
    linesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { name?: string };
      lineNameById.set(docSnap.id, String(data.name || '').trim() || docSnap.id);
    });

    const supervisorsById = new Map<string, { id: string; name: string }>();
    const recipients: Array<{ id: string; name: string }> = [];
    employeesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { name?: string; level?: number; isActive?: boolean };
      const id = docSnap.id;
      const level = Number(data.level || 0);
      const isActive = data.isActive !== false;
      if (!isActive) return;

      const name = String(data.name || '').trim() || id;
      if (level === 2) supervisorsById.set(id, { id, name });
      if (level >= 3) recipients.push({ id, name });
    });

    const assignedMap = new Map<string, { id: string; name: string; lineNames: string[] }>();
    assignmentsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { employeeId?: string; lineId?: string };
      const employeeId = String(data.employeeId || '').trim();
      if (!employeeId || !supervisorsById.has(employeeId)) return;

      const existing = assignedMap.get(employeeId) || {
        id: employeeId,
        name: supervisorsById.get(employeeId)?.name || employeeId,
        lineNames: [],
      };
      const lineId = String(data.lineId || '').trim();
      const lineName = lineNameById.get(lineId) || lineId || '—';
      if (lineName && !existing.lineNames.includes(lineName)) existing.lineNames.push(lineName);
      assignedMap.set(employeeId, existing);
    });

    const submittedIds = new Set<string>();
    reportsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { employeeId?: string };
      const employeeId = String(data.employeeId || '').trim();
      if (employeeId && supervisorsById.has(employeeId)) submittedIds.add(employeeId);
    });

    const submitted = Array.from(assignedMap.values())
      .filter((row) => submittedIds.has(row.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const missing = Array.from(assignedMap.values())
      .filter((row) => !submittedIds.has(row.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const title = `متابعة تقارير المشرفين (${operationalDate})`;
    const message =
      `المطلوب: ${assignedMap.size} | بعت: ${submitted.length} | ما بعتش: ${missing.length}` +
      `\nبعت: ${summarizeNames(submitted.map((row) => row.name))}` +
      `\nما بعتش: ${summarizeNames(missing.map((row) => row.name))}`;

    let alreadySent = false;
    await db.runTransaction(async (tx) => {
      const runSnap = await tx.get(runRef);
      if (runSnap.exists) {
        alreadySent = true;
        return;
      }

      tx.create(runRef, {
        operationalDate,
        assignedSupervisorsCount: assignedMap.size,
        submittedCount: submitted.length,
        missingCount: missing.length,
        submittedSupervisorIds: submitted.map((row) => row.id),
        missingSupervisorIds: missing.map((row) => row.id),
        deliveredTo: recipients.map((r) => r.id),
        createdAt: FieldValue.serverTimestamp(),
      });

      recipients.forEach((recipient) => {
        const notifRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
        tx.create(notifRef, {
          recipientId: recipient.id,
          type: 'report_compliance_daily',
          title,
          message,
          referenceId: operationalDate,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    });

    if (alreadySent) return;
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

export const notifySupervisorsMissingDailyReport = onSchedule(
  {
    schedule: '30 14 * * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    const operationalDate = getOperationalDate(8, new Date());
    const runRef = db.doc(`${AUTOMATION_RUNS_COLLECTION}/supervisor_missing_report_${operationalDate}`);

    let alreadySent = false;
    await db.runTransaction(async (tx) => {
      const runSnap = await tx.get(runRef);
      if (runSnap.exists) {
        alreadySent = true;
        return;
      }

      const [employeesSnap, assignmentsSnap, reportsSnap] = await Promise.all([
        db.collection(EMPLOYEES_COLLECTION).get(),
        db.collection(ASSIGNMENTS_COLLECTION).where('date', '==', operationalDate).get(),
        db.collection(REPORTS_COLLECTION).where('date', '==', operationalDate).get(),
      ]);

      const supervisorsById = new Set<string>();
      employeesSnap.docs.forEach((d) => {
        const data = d.data() as { level?: number; isActive?: boolean };
        if (data.isActive === false) return;
        if (Number(data.level || 0) === 2) supervisorsById.add(d.id);
      });

      const assignedSupervisorIds = new Set<string>();
      assignmentsSnap.docs.forEach((d) => {
        const data = d.data() as { employeeId?: string };
        const employeeId = String(data.employeeId || '').trim();
        if (!employeeId || !supervisorsById.has(employeeId)) return;
        assignedSupervisorIds.add(employeeId);
      });

      const submittedSupervisorIds = new Set<string>();
      reportsSnap.docs.forEach((d) => {
        const data = d.data() as { employeeId?: string };
        const employeeId = String(data.employeeId || '').trim();
        if (!employeeId || !supervisorsById.has(employeeId)) return;
        submittedSupervisorIds.add(employeeId);
      });

      const missingSupervisorIds = Array.from(assignedSupervisorIds).filter((id) => !submittedSupervisorIds.has(id));
      tx.create(runRef, {
        operationalDate,
        assignedCount: assignedSupervisorIds.size,
        submittedCount: submittedSupervisorIds.size,
        missingCount: missingSupervisorIds.length,
        missingSupervisorIds,
        createdAt: FieldValue.serverTimestamp(),
      });

      missingSupervisorIds.forEach((recipientId) => {
        const notifRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
        tx.create(notifRef, {
          recipientId,
          type: 'daily_report_missing',
          title: `تنبيه تقرير الإنتاج (${operationalDate})`,
          message: 'لم يتم إرسال تقرير الإنتاج اليوم حتى الآن. برجاء الإرسال قبل نهاية الوردية.',
          referenceId: operationalDate,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    });

    if (alreadySent) return;
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

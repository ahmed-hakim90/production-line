import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { randomUUID } from 'node:crypto';
import { getDb } from './adminApp.js';

const db = getDb();
const ZONE = 'Africa/Cairo';
const SESSIONS = 'production_gate_sessions';
const STATES = 'production_gate_states';
const AUDIT = 'production_gate_audit_logs';
const EVENTS = 'production_gate_events';

type Actor = {
  uid: string;
  tenantId: string;
  name: string;
  superAdmin: boolean;
  permissions: Record<string, boolean>;
};

const cairoParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value || 0);
  const year = value('year'); const month = value('month'); const day = value('day');
  return {
    year, month, day, hour: value('hour'), minute: value('minute'), second: value('second'),
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
};

const zonedDateToUtc = (year: number, month: number, day: number, hour: number, minute = 0): Date => {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const p = cairoParts(new Date(guess));
    const rendered = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += Date.UTC(year, month - 1, day, hour, minute) - rendered;
  }
  return new Date(guess);
};

const loadActor = async (request: CallableRequest): Promise<Actor> => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() as Record<string, unknown> | undefined;
  if (!userSnap.exists || user?.isActive !== true) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = String(user?.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  if (user?.roleId) {
    const roleSnap = await db.collection('roles').doc(String(user.roleId)).get();
    if (String(roleSnap.data()?.tenantId || '') !== tenantId) throw new HttpsError('permission-denied', 'الدور غير صالح.');
    permissions = (roleSnap.data()?.permissions || {}) as Record<string, boolean>;
  }
  return {
    uid, tenantId, permissions, superAdmin: user?.isSuperAdmin === true,
    name: String(user?.displayName || user?.email || uid),
  };
};

const requirePermission = (actor: Actor, key: string) => {
  if (!actor.superAdmin && actor.permissions[key] !== true) throw new HttpsError('permission-denied', 'ليس لديك صلاحية تنفيذ الإجراء.');
};

const findActiveEmployeeByCode = async (tenantId: string, code: string) => {
  const employeeSnap = await db.collection('employees')
    .where('tenantId', '==', tenantId).where('code', '==', code).limit(2).get();
  const activeEmployees = employeeSnap.docs.filter((doc) => doc.data().isActive === true);
  if (activeEmployees.length > 1) throw new HttpsError('failed-precondition', 'كود الموظف مكرر؛ يرجى تصحيحه من ملف الموظفين.');
  const employeeDoc = activeEmployees[0];
  if (!employeeDoc) throw new HttpsError('not-found', 'كود الموظف غير موجود أو الموظف غير نشط.');
  return employeeDoc;
};

const findActiveEmployeeForRegistration = async (tenantId: string, code: string, employeeId?: string) => {
  const normalizedId = String(employeeId || '').trim();
  if (!normalizedId) return findActiveEmployeeByCode(tenantId, code);
  const employeeDoc = await db.collection('employees').doc(normalizedId).get();
  const employee = employeeDoc.data();
  if (!employeeDoc.exists || employee?.tenantId !== tenantId || employee?.isActive !== true || String(employee?.code || '').trim() !== code) {
    throw new HttpsError('not-found', 'كود الموظف غير موجود أو الموظف غير نشط.');
  }
  return employeeDoc;
};

export const previewProductionGateEmployee = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const actor = await loadActor(request);
    requirePermission(actor, 'production.gate.register');
    const code = String((request.data as { employeeCode?: string })?.employeeCode || '').trim();
    if (!code || code.length > 80) throw new HttpsError('invalid-argument', 'أدخل كود موظف صحيح.');

    const employeeDoc = await findActiveEmployeeByCode(actor.tenantId, code);
    const employee = employeeDoc.data() || {};
    const now = new Date();
    const local = cairoParts(now);
    const seconds = local.hour * 3600 + local.minute * 60 + local.second;
    const [stateSnap, todaySnap] = await Promise.all([
      db.collection(STATES).doc(`${actor.tenantId}__${employeeDoc.id}`).get(),
      db.collection(SESSIONS)
        .where('tenantId', '==', actor.tenantId)
        .where('employeeId', '==', employeeDoc.id)
        .where('date', '==', local.dateKey)
        .get(),
    ]);
    const openSessionId = String(stateSnap.data()?.openSessionId || '').trim();
    const openSnap = openSessionId ? await db.collection(SESSIONS).doc(openSessionId).get() : null;
    const isOutside = Boolean(openSnap?.exists && openSnap.data()?.tenantId === actor.tenantId && openSnap.data()?.status === 'open');
    const exitAt = isOutside ? openSnap?.data()?.exitAt as Timestamp : null;
    const todayExitCount = todaySnap.docs.filter((item) => item.data().status !== 'cancelled').length;

    return {
      employeeId: employeeDoc.id,
      employeeName: String(employee.name || code),
      employeeCode: code,
      currentStatus: isOutside ? 'outside' : 'inside',
      nextAction: isOutside ? 'entry' : 'exit',
      exitAt: exitAt ? exitAt.toDate().toISOString() : null,
      currentDurationMinutes: exitAt ? Math.max(0, Math.floor((now.getTime() - exitAt.toMillis()) / 60_000)) : 0,
      todayExitCount,
      registrationAllowed: seconds >= 8 * 3600 && seconds < 16 * 3600,
    };
  },
);

/** Minimal, permission-gated directory used by the dedicated gate device offline. */
export const syncProductionGateEmployeeCache = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const actor = await loadActor(request);
    requirePermission(actor, 'production.gate.register');
    const [employeesSnap, openSnap] = await Promise.all([
      db.collection('employees').where('tenantId', '==', actor.tenantId).where('isActive', '==', true).get(),
      db.collection(SESSIONS).where('tenantId', '==', actor.tenantId).where('status', '==', 'open').get(),
    ]);
    const openByEmployee = new Map(openSnap.docs.map((item) => [String(item.data().employeeId), item.data()]));
    const local = cairoParts();
    const seconds = local.hour * 3600 + local.minute * 60 + local.second;
    return {
      syncedAt: new Date().toISOString(),
      employees: employeesSnap.docs.map((item) => {
        const employee = item.data();
        const open = openByEmployee.get(item.id);
        const exitAt = open?.exitAt as Timestamp | undefined;
        return {
          employeeId: item.id,
          employeeName: String(employee.name || employee.code || item.id),
          employeeCode: String(employee.code || '').trim(),
          currentStatus: open ? 'outside' : 'inside',
          nextAction: open ? 'entry' : 'exit',
          exitAt: exitAt ? exitAt.toDate().toISOString() : null,
          currentDurationMinutes: exitAt ? Math.max(0, Math.floor((Date.now() - exitAt.toMillis()) / 60_000)) : 0,
          todayExitCount: 0,
          registrationAllowed: seconds >= 8 * 3600 && seconds < 16 * 3600,
        };
      }).filter((item) => item.employeeCode),
    };
  },
);

export const registerProductionGateAction = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const actor = await loadActor(request);
    requirePermission(actor, 'production.gate.register');
    const data = request.data as { employeeCode?: string; employeeId?: string; eventId?: string; occurredAt?: string; expectedAction?: 'exit' | 'entry' };
    const code = String(data?.employeeCode || '').trim();
    if (!code || code.length > 80) throw new HttpsError('invalid-argument', 'أدخل كود موظف صحيح.');

    const receivedAt = new Date();
    const requestedAt = data.occurredAt ? new Date(data.occurredAt) : receivedAt;
    if (Number.isNaN(requestedAt.getTime()) || requestedAt.getTime() > receivedAt.getTime() + 5 * 60_000 || requestedAt.getTime() < receivedAt.getTime() - 36 * 60 * 60_000) {
      throw new HttpsError('invalid-argument', 'وقت الحركة المحلية غير صالح؛ راجع الحركة يدويًا.');
    }
    const eventId = String(data.eventId || '').trim() || randomUUID();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(eventId)) throw new HttpsError('invalid-argument', 'معرّف الحركة غير صالح.');
    const now = requestedAt;
    const local = cairoParts(now);
    const seconds = local.hour * 3600 + local.minute * 60 + local.second;
    if (seconds < 8 * 3600 || seconds >= 16 * 3600) {
      throw new HttpsError('failed-precondition', 'غير مصرح بالإدخال خارج الفترة من 8 صباحًا إلى 4 مساءً.');
    }

    const employeeDoc = await findActiveEmployeeForRegistration(actor.tenantId, code, data?.employeeId);
    const employee = employeeDoc.data() || {};
    const stateId = `${actor.tenantId}__${employeeDoc.id}`;
    const stateRef = db.collection(STATES).doc(stateId);
    const sessionRef = db.collection(SESSIONS).doc();
    const eventRef = db.collection(EVENTS).doc(`${actor.tenantId}__${eventId}`);
    const nowTs = Timestamp.fromDate(now);

    return db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) return eventSnap.data()?.result as Record<string, unknown>;
      const stateSnap = await tx.get(stateRef);
      const state = stateSnap.data();
      const lastAction = state?.lastActionAt as Timestamp | undefined;
      if (lastAction && nowTs.toMillis() <= lastAction.toMillis()) {
        throw new HttpsError('aborted', 'توجد حركة أحدث لهذا الموظف؛ راجع الحركة قبل المزامنة.');
      }
      if (lastAction && nowTs.toMillis() - lastAction.toMillis() < 10_000) {
        throw new HttpsError('already-exists', 'تم تسجيل حركة لهذا الموظف بالفعل خلال آخر 10 ثوانٍ.');
      }

      if (state?.openSessionId) {
        const openRef = db.collection(SESSIONS).doc(String(state.openSessionId));
        const openSnap = await tx.get(openRef);
        if (openSnap.exists && openSnap.data()?.status === 'open') {
          if (data.expectedAction && data.expectedAction !== 'entry') throw new HttpsError('aborted', 'حالة العامل تغيرت؛ راجع الحركة قبل المزامنة.');
          const exitAt = openSnap.data()?.exitAt as Timestamp;
          const durationMinutes = Math.max(0, Math.round((nowTs.toMillis() - exitAt.toMillis()) / 60_000));
          tx.update(openRef, {
            entryAt: nowTs, durationMinutes, status: 'completed', entryRecordedBy: actor.uid,
            entryRecordedByName: actor.name, updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(stateRef, { tenantId: actor.tenantId, employeeId: employeeDoc.id, openSessionId: null, lastActionAt: nowTs }, { merge: true });
          const result = { action: 'entry', sessionId: openRef.id, tenantId: actor.tenantId, employeeId: employeeDoc.id, employeeName: String(employee.name || code), employeeCode: code, actionAt: now.toISOString(), durationMinutes };
          tx.set(eventRef, { tenantId: actor.tenantId, eventId, source: data.occurredAt ? 'offline_queue' : 'online', occurredAt: nowTs, receivedAt: FieldValue.serverTimestamp(), result });
          return result;
        }
      }

      if (data.expectedAction && data.expectedAction !== 'exit') throw new HttpsError('aborted', 'حالة العامل تغيرت؛ راجع الحركة قبل المزامنة.');

      tx.set(sessionRef, {
        tenantId: actor.tenantId, employeeId: employeeDoc.id, employeeName: String(employee.name || code), employeeCode: code,
        date: local.dateKey, exitAt: nowTs, entryAt: null, durationMinutes: null, status: 'open',
        exitRecordedBy: actor.uid, exitRecordedByName: actor.name,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(stateRef, { tenantId: actor.tenantId, employeeId: employeeDoc.id, openSessionId: sessionRef.id, lastActionAt: nowTs }, { merge: true });
      const result = { action: 'exit', sessionId: sessionRef.id, tenantId: actor.tenantId, employeeId: employeeDoc.id, employeeName: String(employee.name || code), employeeCode: code, actionAt: now.toISOString(), durationMinutes: null };
      tx.set(eventRef, { tenantId: actor.tenantId, eventId, source: data.occurredAt ? 'offline_queue' : 'online', occurredAt: nowTs, receivedAt: FieldValue.serverTimestamp(), result });
      return result;
    });
  },
);

export const correctProductionGateSession = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const actor = await loadActor(request);
    requirePermission(actor, 'production.gate.correct');
    const data = request.data as { sessionId?: string; exitAt?: string; entryAt?: string | null; reason?: string; cancel?: boolean };
    const sessionId = String(data.sessionId || '').trim();
    const reason = String(data.reason || '').trim();
    if (!sessionId || reason.length < 3) throw new HttpsError('invalid-argument', 'سبب التصحيح مطلوب.');
    const ref = db.collection(SESSIONS).doc(sessionId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.tenantId !== actor.tenantId) throw new HttpsError('not-found', 'الحركة غير موجودة.');
      const before = snap.data()!;
      const stateRef = db.collection(STATES).doc(`${actor.tenantId}__${before.employeeId}`);
      const patch: Record<string, unknown> = data.cancel
        ? { status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() }
        : {};
      if (!data.cancel) {
        const exitAt = data.exitAt ? new Date(data.exitAt) : (before.exitAt as Timestamp).toDate();
        const entryAt = data.entryAt ? new Date(data.entryAt) : null;
        if (Number.isNaN(exitAt.getTime()) || (entryAt && (Number.isNaN(entryAt.getTime()) || entryAt <= exitAt))) {
          throw new HttpsError('invalid-argument', 'أوقات التصحيح غير صحيحة.');
        }
        Object.assign(patch, {
          exitAt: Timestamp.fromDate(exitAt), entryAt: entryAt ? Timestamp.fromDate(entryAt) : null,
          durationMinutes: entryAt ? Math.round((entryAt.getTime() - exitAt.getTime()) / 60_000) : null,
          status: entryAt ? 'completed' : 'open',
        });
      }
      tx.update(ref, { ...patch, correctedAt: FieldValue.serverTimestamp(), correctedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
      if (data.cancel && before.status === 'open') {
        tx.set(stateRef, { openSessionId: null }, { merge: true });
      } else if (!data.cancel && patch.status === 'open') {
        tx.set(stateRef, { tenantId: actor.tenantId, employeeId: before.employeeId, openSessionId: sessionId }, { merge: true });
      } else if (!data.cancel && before.status === 'open') {
        tx.set(stateRef, { openSessionId: null }, { merge: true });
      }
      tx.set(db.collection(AUDIT).doc(), {
        tenantId: actor.tenantId, sessionId, action: data.cancel ? 'cancel' : 'correct', reason,
        before: { exitAt: before.exitAt, entryAt: before.entryAt || null, durationMinutes: before.durationMinutes ?? null, status: before.status },
        after: patch, actorId: actor.uid, actorName: actor.name, createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  },
);

export const closeOpenProductionGateSessions = onSchedule(
  { schedule: '0 16 * * *', timeZone: ZONE, region: 'us-central1', memory: '256MiB' },
  async () => {
    const local = cairoParts();
    const snap = await db.collection(SESSIONS).where('status', '==', 'open').where('date', '<=', local.dateKey).get();
    for (let offset = 0; offset < snap.docs.length; offset += 400) {
      const batch = db.batch();
      snap.docs.slice(offset, offset + 400).forEach((item) => {
        const exitAt = item.data().exitAt as Timestamp;
        const [year, month, day] = String(item.data().date).split('-').map(Number);
        const closeAt = Timestamp.fromDate(zonedDateToUtc(year, month, day, 16));
        batch.update(item.ref, {
          entryAt: closeAt, durationMinutes: Math.max(0, Math.round((closeAt.toMillis() - exitAt.toMillis()) / 60_000)),
          status: 'auto_closed', updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(db.collection(STATES).doc(`${item.data().tenantId}__${item.data().employeeId}`), { openSessionId: null, lastActionAt: closeAt }, { merge: true });
      });
      await batch.commit();
    }
  },
);

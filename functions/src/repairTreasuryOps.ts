import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { ensureDefaultAccounts } from './accountingOps.js';
import {
  accountingPostingDecision,
  queuePendingAccounting,
  validateAutomaticPostingMaster,
} from './accountingPostingPolicy.js';
import {
  getRepairTreasuryExpenseType,
  REPAIR_MANUAL_INCOME_ACCOUNT_CODE,
  REPAIR_MANUAL_INCOME_ACCOUNT_NAME,
} from './repairTreasuryExpenseTypes.js';

const db = getDb();

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  branchIds: string[];
};

type PaymentMethod = 'cash' | 'card' | 'bank_transfer';
type ManualEntryType = 'INCOME' | 'EXPENSE' | 'TRANSFER_OUT' | 'TRANSFER_IN';

const roundMoney = (value: unknown): number => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
};

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const loadActor = async (uid: string): Promise<Actor> => {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as Record<string, unknown>;
  if (user.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    const role = roleSnap.data() as Record<string, unknown> | undefined;
    if (!roleSnap.exists || String(role?.tenantId || '').trim() !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    permissions = (role?.permissions || {}) as Record<string, boolean>;
  }
  const branchIds = Array.from(new Set([
    ...(Array.isArray(user.repairBranchIds) ? user.repairBranchIds : []),
    user.repairBranchId,
  ].map((id) => String(id || '').trim()).filter(Boolean)));
  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.name || user.email || uid),
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    branchIds,
  };
};

const requirePermission = (actor: Actor, keys: string[], message: string) => {
  if (actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true)) return;
  throw new HttpsError('permission-denied', message);
};

const assertBranchScope = (actor: Actor, branchId: string) => {
  if (
    actor.isSuperAdmin
    || actor.permissions['repair.branches.manage'] === true
    || actor.permissions['repair.callCenter.viewAll'] === true
    || actor.branchIds.includes(branchId)
  ) {
    return;
  }
  throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
};

const paymentMethodAccountKey = (method: PaymentMethod): 'cash' | 'card' | 'bankTransfer' => {
  if (method === 'card') return 'card';
  if (method === 'bank_transfer') return 'bankTransfer';
  return 'cash';
};

const loadBranchPaymentAccounts = async (actor: Actor, branchId: string) => {
  const branchRef = db.collection('repair_branches').doc(branchId);
  const branchSnap = await branchRef.get();
  if (!branchSnap.exists || String(branchSnap.data()?.tenantId || '') !== actor.tenantId) {
    throw new HttpsError('failed-precondition', 'فرع الصيانة غير موجود.');
  }
  const costCenterId = String(branchSnap.data()?.costCenterId || '').trim();
  if (!costCenterId) {
    throw new HttpsError(
      'failed-precondition',
      'اربط الفرع بمركز تكلفة من الحسابات ← إعدادات الحسابات ثم احفظ الربط.',
    );
  }
  const map = (branchSnap.data()?.accountingAccounts || {}) as Record<string, unknown>;
  const keys = ['cash', 'card', 'bankTransfer'] as const;
  if (keys.some((key) => !String(map[key] || '').trim())) {
    throw new HttpsError(
      'failed-precondition',
      'أكمل ربط حسابات النقدية/البطاقات/التحويل لفرع الصيانة قبل تسجيل حركة الخزينة.',
    );
  }
  const snapshots = await db.getAll(
    ...keys.map((key) => db.collection('accounting_accounts').doc(`${actor.tenantId}__${String(map[key]).trim()}`)),
  );
  const invalidKey = keys.find((key, index) => {
    const snap = snapshots[index];
    const account = snap.data() as Record<string, unknown> | undefined;
    return !snap.exists
      || String(account?.tenantId || '') !== actor.tenantId
      || account?.isActive === false
      || account?.allowPosting === false
      || account?.type !== 'asset';
  });
  if (invalidKey) {
    throw new HttpsError(
      'failed-precondition',
      `حساب وسيلة الدفع غير صالح (حقل: ${invalidKey}). راجع ربط الفرع في إعدادات الحسابات.`,
    );
  }
  const accounts = Object.fromEntries(keys.map((key, index) => {
    const account = snapshots[index].data() as Record<string, unknown>;
    return [key, {
      code: String(account.code || map[key]),
      name: String(account.name || key),
    }];
  })) as Record<'cash' | 'card' | 'bankTransfer', { code: string; name: string }>;
  await validateAutomaticPostingMaster({
    tenantId: actor.tenantId,
    accountCodes: Object.values(accounts).map((account) => account.code),
    costCenterId,
  });
  return { branchRef, costCenterId, accounts, branchName: String(branchSnap.data()?.name || branchId) };
};

const resolvePostingAccount = async (
  tenantId: string,
  code: string,
  expectedType: string,
) => {
  const snap = await db.collection('accounting_accounts').doc(`${tenantId}__${code}`).get();
  const account = snap.data() as Record<string, unknown> | undefined;
  if (
    !snap.exists
    || String(account?.tenantId || '') !== tenantId
    || account?.isActive === false
    || account?.allowPosting === false
    || account?.type !== expectedType
  ) {
    throw new HttpsError(
      'failed-precondition',
      `حساب ${code} غير جاهز للترحيل. من الحسابات ← شجرة الحسابات: نفّذ بذرة الحسابات الافتراضية.`,
    );
  }
  return {
    code: String(account?.code || code),
    name: String(account?.name || code),
  };
};

async function postManualTreasuryEntry(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.treasury.manage'], 'ليس لديك صلاحية إدارة خزينة الصيانة.');
  const branchId = String(data.branchId || '').trim();
  const entryType = String(data.entryType || '').trim() as ManualEntryType;
  const method = String(data.paymentMethod || '').trim() as PaymentMethod;
  const amount = roundMoney(data.amount);
  const note = String(data.note || '').trim();
  const requestId = String(data.requestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const expenseTypeKey = String(data.expenseType || '').trim();

  if (!branchId || !requestId || amount <= 0) {
    throw new HttpsError('invalid-argument', 'بيانات حركة الخزينة غير مكتملة.');
  }
  if (!['INCOME', 'EXPENSE', 'TRANSFER_OUT', 'TRANSFER_IN'].includes(entryType)) {
    throw new HttpsError('invalid-argument', 'نوع حركة الخزينة غير صالح.');
  }
  if (!['cash', 'card', 'bank_transfer'].includes(method)) {
    throw new HttpsError('invalid-argument', 'وسيلة الدفع مطلوبة.');
  }
  if (note.length < 3) {
    throw new HttpsError('invalid-argument', 'سبب الحركة مطلوب بوضوح.');
  }
  assertBranchScope(actor, branchId);

  await ensureDefaultAccounts(actor);
  const live = await loadBranchPaymentAccounts(actor, branchId);
  const methodAccount = live.accounts[paymentMethodAccountKey(method)];
  const bankAccount = live.accounts.bankTransfer;

  let contraAccount = methodAccount;
  let expenseType: string | null = null;
  let expenseAccountId: string | null = null;
  let debit = methodAccount;
  let credit = methodAccount;

  if (entryType === 'EXPENSE') {
    const expenseDef = getRepairTreasuryExpenseType(expenseTypeKey);
    if (!expenseDef) {
      throw new HttpsError('invalid-argument', 'اختر نوع المصروف قبل التسجيل.');
    }
    contraAccount = await resolvePostingAccount(actor.tenantId, expenseDef.accountCode, 'expense');
    expenseType = expenseDef.key;
    expenseAccountId = `${actor.tenantId}__${expenseDef.accountCode}`;
    debit = contraAccount;
    credit = methodAccount;
  } else if (entryType === 'INCOME') {
    contraAccount = await resolvePostingAccount(
      actor.tenantId,
      REPAIR_MANUAL_INCOME_ACCOUNT_CODE,
      'revenue',
    );
    debit = methodAccount;
    credit = contraAccount;
  } else if (entryType === 'TRANSFER_OUT') {
    // Intra-branch cash → bank reclass (not HQ settlement).
    debit = bankAccount;
    credit = live.accounts.cash;
  } else {
    // TRANSFER_IN: intra-branch bank → cash reclass.
    debit = live.accounts.cash;
    credit = bankAccount;
  }

  const openSessions = await db.collection('repair_treasury_sessions')
    .where('branchId', '==', branchId)
    .where('status', '==', 'open')
    .limit(5)
    .get();
  const sessionDoc = openSessions.docs
    .filter((snap) => String(snap.data().tenantId || '') === actor.tenantId)
    .sort((a, b) => String(b.data().openedAt || '').localeCompare(String(a.data().openedAt || '')))[0];
  if (!sessionDoc) {
    throw new HttpsError('failed-precondition', 'لا توجد خزينة مفتوحة لهذا الفرع.');
  }
  if (sessionDoc.data()?.needsManualClose === true) {
    throw new HttpsError('failed-precondition', 'الخزينة غير متاحة — أقفل يوم أمس أولاً.');
  }

  const month = String(sessionDoc.data().openedAt || new Date().toISOString()).slice(0, 7);
  const monthCloseRef = db.collection('repair_treasury_month_closes').doc(`${actor.tenantId}_${branchId}_${month}`);
  const treasuryEntryRef = db.collection('repair_treasury_entries').doc(`${actor.tenantId}__repair_treasury_manual__${requestId}`);
  const journalRef = db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_treasury_manual__${requestId}`);
  const at = new Date().toISOString();
  const postingDecision = await accountingPostingDecision(actor.tenantId, 'autoPostRepairTreasury', at);
  const referenceNo = `TR-${entryType.slice(0, 3)}-${requestId.slice(-6).toUpperCase()}`;

  const result = await db.runTransaction(async (tx) => {
    const [treasurySnap, journalSnap, sessionSnap, monthCloseSnap] = await Promise.all([
      tx.get(treasuryEntryRef),
      tx.get(journalRef),
      tx.get(sessionDoc.ref),
      tx.get(monthCloseRef),
    ]);
    if (treasurySnap.exists || journalSnap.exists) {
      return {
        entryId: treasuryEntryRef.id,
        journalEntryId: postingDecision.enabled ? journalRef.id : null,
        duplicated: true,
      };
    }
    if (!sessionSnap.exists || String(sessionSnap.data()?.status || '') !== 'open') {
      throw new HttpsError('failed-precondition', 'الخزينة غير متاحة لتسجيل الحركة.');
    }
    if (monthCloseSnap.exists && String(monthCloseSnap.data()?.status || '') === 'closed') {
      throw new HttpsError('failed-precondition', 'شهر الخزينة مقفول.');
    }

    tx.create(treasuryEntryRef, {
      tenantId: actor.tenantId,
      branchId,
      sessionId: sessionDoc.id,
      entryType,
      amount,
      note,
      paymentMethod: method,
      costCenterId: live.costCenterId,
      source: 'manual_treasury',
      sourceId: requestId,
      expenseType: expenseType || null,
      expenseAccountId: expenseAccountId || null,
      journalEntryId: postingDecision.enabled ? journalRef.id : null,
      accountingStatus: postingDecision.enabled ? 'posted' : 'pending_accounting',
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
    });

    if (postingDecision.enabled) {
      tx.create(journalRef, {
        tenantId: actor.tenantId,
        branchId,
        costCenterId: live.costCenterId,
        source: 'repair_treasury_manual',
        sourceId: requestId,
        expenseType: expenseType || null,
        referenceNo,
        description: note,
        status: 'posted',
        postedAt: at,
        date: at.slice(0, 10),
        createdBy: actor.uid,
        createdByName: actor.displayName,
        createdAt: at,
        totalDebit: amount,
        totalCredit: amount,
        lines: [
          {
            accountCode: debit.code,
            accountName: debit.name,
            debit: amount,
            credit: 0,
            costCenterId: live.costCenterId,
            description: note,
          },
          {
            accountCode: credit.code,
            accountName: credit.name,
            debit: 0,
            credit: amount,
            costCenterId: live.costCenterId,
            description: note,
          },
        ],
      });
    } else {
      queuePendingAccounting(tx, {
        tenantId: actor.tenantId, source: 'repair_treasury_manual', sourceId: requestId,
        branchId, costCenterId: live.costCenterId, amount, date: at,
        reason: postingDecision.reason,
        payload: { referenceNo, entryType, method, expenseType: expenseType || null, note },
      });
    }

    return {
      entryId: treasuryEntryRef.id,
      journalEntryId: postingDecision.enabled ? journalRef.id : null,
      duplicated: false,
    };
  });

  return {
    ok: true as const,
    ...result,
    amount,
    entryType,
    expenseType,
  };
}


const requireAdminTreasury = (actor: Actor) => {
  if (
    actor.isSuperAdmin
    || actor.permissions['repair.branches.manage'] === true
    || actor.permissions['repair.callCenter.viewAll'] === true
  ) {
    return;
  }
  throw new HttpsError('permission-denied', 'اعتماد التسوية متاح لإدارة المراكز فقط.');
};

const resolveMainBranchId = async (tenantId: string): Promise<{ id: string; name: string }> => {
  const snap = await db.collection('repair_branches')
    .where('tenantId', '==', tenantId)
    .where('isMain', '==', true)
    .limit(5)
    .get();
  const rows = snap.docs.filter((doc) => doc.data()?.isMain === true);
  if (rows.length !== 1) {
    throw new HttpsError(
      'failed-precondition',
      rows.length === 0
        ? 'عيّن فرعًا رئيسيًا واحدًا (خزينة الإدارة) من إعدادات الفروع.'
        : 'يوجد أكثر من فرع رئيسي. أبقِ فرعًا رئيسيًا واحدًا فقط.',
    );
  }
  return { id: rows[0].id, name: String(rows[0].data()?.name || rows[0].id) };
};

const loadOpenSessionForBranch = async (actor: Actor, branchId: string) => {
  const openSessions = await db.collection('repair_treasury_sessions')
    .where('branchId', '==', branchId)
    .where('status', '==', 'open')
    .limit(5)
    .get();
  const sessionDoc = openSessions.docs
    .filter((snap) => String(snap.data().tenantId || '') === actor.tenantId)
    .sort((a, b) => String(b.data().openedAt || '').localeCompare(String(a.data().openedAt || '')))[0];
  if (!sessionDoc) {
    throw new HttpsError('failed-precondition', `لا توجد خزينة مفتوحة للفرع ${branchId}.`);
  }
  if (sessionDoc.data()?.needsManualClose === true) {
    throw new HttpsError('failed-precondition', 'الخزينة غير متاحة — أقفل يوم أمس أولًا.');
  }
  return sessionDoc;
};

async function submitTreasurySettlement(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.treasury.manage'], 'ليس لديك صلاحية إدارة خزينة الصيانة.');
  const fromBranchId = String(data.branchId || data.fromBranchId || '').trim();
  const requestId = String(data.requestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const countedAmount = roundMoney(data.countedAmount ?? data.amount);
  const expectedAmount = roundMoney(data.expectedAmount ?? countedAmount);
  const note = String(data.note || '').trim();
  const varianceReason = String(data.varianceReason || '').trim();
  if (!fromBranchId || !requestId || countedAmount <= 0) {
    throw new HttpsError('invalid-argument', 'بيانات التسوية غير مكتملة.');
  }
  assertBranchScope(actor, fromBranchId);
  const main = await resolveMainBranchId(actor.tenantId);
  if (fromBranchId === main.id) {
    throw new HttpsError('failed-precondition', 'الفرع الرئيسي لا يُرسل تسوية لنفسه.');
  }
  const variance = roundMoney(countedAmount - expectedAmount);
  if (Math.abs(variance) > 0.001 && varianceReason.length < 3) {
    throw new HttpsError('invalid-argument', 'اكتب سبب فرق العدّ قبل إرسال التسوية.');
  }
  // Ensure source session exists before submit (soft check).
  await loadOpenSessionForBranch(actor, fromBranchId);
  const settlementRef = db.collection('repair_treasury_settlements').doc(`${actor.tenantId}__${requestId}`);
  const at = new Date().toISOString();
  const result = await db.runTransaction(async (tx) => {
    const current = await tx.get(settlementRef);
    if (current.exists) {
      const row = current.data() as Record<string, unknown>;
      if (String(row.status || '') === 'rejected') {
        throw new HttpsError('failed-precondition', 'هذه التسوية مرفوضة. أنشئ طلبًا جديدًا.');
      }
      return { settlementId: settlementRef.id, status: String(row.status || 'submitted'), duplicated: true };
    }
    tx.create(settlementRef, {
      tenantId: actor.tenantId,
      fromBranchId,
      toBranchId: main.id,
      toBranchName: main.name,
      expectedAmount,
      countedAmount,
      amount: countedAmount,
      variance,
      varianceReason: varianceReason || null,
      note: note || null,
      status: 'submitted',
      submittedBy: actor.uid,
      submittedByName: actor.displayName,
      submittedAt: at,
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
      updatedAt: at,
    });
    return { settlementId: settlementRef.id, status: 'submitted', duplicated: false };
  });
  return { ok: true as const, ...result, countedAmount, toBranchId: main.id };
}

async function rejectTreasurySettlement(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.treasury.manage'], 'ليس لديك صلاحية إدارة خزينة الصيانة.');
  requireAdminTreasury(actor);
  const settlementId = String(data.settlementId || '').trim();
  const reason = String(data.reason || data.rejectionReason || '').trim();
  if (!settlementId || reason.length < 3) {
    throw new HttpsError('invalid-argument', 'سبب الرفض مطلوب.');
  }
  const settlementRef = db.collection('repair_treasury_settlements').doc(settlementId);
  const at = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(settlementRef);
    if (!snap.exists || String(snap.data()?.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('not-found', 'طلب التسوية غير موجود.');
    }
    const status = String(snap.data()?.status || '');
    if (status === 'rejected') return;
    if (status === 'approved') {
      throw new HttpsError('failed-precondition', 'لا يمكن رفض تسوية معتمدة.');
    }
    if (status !== 'submitted') {
      throw new HttpsError('failed-precondition', 'حالة التسوية لا تسمح بالرفض.');
    }
    tx.update(settlementRef, {
      status: 'rejected',
      rejectedBy: actor.uid,
      rejectedByName: actor.displayName,
      rejectedAt: at,
      rejectionReason: reason,
      updatedAt: at,
    });
  });
  return { ok: true as const, settlementId, status: 'rejected' as const };
}

async function approveTreasurySettlement(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.treasury.manage'], 'ليس لديك صلاحية إدارة خزينة الصيانة.');
  requireAdminTreasury(actor);
  const settlementId = String(data.settlementId || '').trim();
  if (!settlementId) throw new HttpsError('invalid-argument', 'معرّف التسوية مطلوب.');

  const settlementRef = db.collection('repair_treasury_settlements').doc(settlementId);
  const initial = await settlementRef.get();
  if (!initial.exists || String(initial.data()?.tenantId || '') !== actor.tenantId) {
    throw new HttpsError('not-found', 'طلب التسوية غير موجود.');
  }
  const settlement = initial.data() as Record<string, unknown>;
  if (String(settlement.status || '') === 'approved') {
    return {
      ok: true as const,
      settlementId,
      status: 'approved' as const,
      duplicated: true,
      fromEntryId: String(settlement.fromEntryId || ''),
      toEntryId: String(settlement.toEntryId || ''),
      journalEntryId: String(settlement.journalEntryId || ''),
    };
  }
  if (String(settlement.status || '') !== 'submitted') {
    throw new HttpsError('failed-precondition', 'التسوية ليست بانتظار الاعتماد.');
  }

  const fromBranchId = String(settlement.fromBranchId || '').trim();
  const toBranchId = String(settlement.toBranchId || '').trim();
  const amount = roundMoney(settlement.countedAmount ?? settlement.amount);
  if (!fromBranchId || !toBranchId || amount <= 0) {
    throw new HttpsError('failed-precondition', 'بيانات التسوية غير صالحة.');
  }
  const main = await resolveMainBranchId(actor.tenantId);
  if (toBranchId !== main.id) {
    throw new HttpsError('failed-precondition', 'وجهة التسوية ليست الفرع الرئيسي الحالي.');
  }

  await ensureDefaultAccounts(actor);
  const [fromLive, toLive, fromSession, toSession] = await Promise.all([
    loadBranchPaymentAccounts(actor, fromBranchId),
    loadBranchPaymentAccounts(actor, toBranchId),
    loadOpenSessionForBranch(actor, fromBranchId),
    loadOpenSessionForBranch(actor, toBranchId),
  ]);

  const fromMonth = String(fromSession.data().openedAt || new Date().toISOString()).slice(0, 7);
  const toMonth = String(toSession.data().openedAt || new Date().toISOString()).slice(0, 7);
  const fromMonthCloseRef = db.collection('repair_treasury_month_closes').doc(`${actor.tenantId}_${fromBranchId}_${fromMonth}`);
  const toMonthCloseRef = db.collection('repair_treasury_month_closes').doc(`${actor.tenantId}_${toBranchId}_${toMonth}`);
  const fromEntryRef = db.collection('repair_treasury_entries').doc(`${actor.tenantId}__repair_hq_settlement_out__${settlementId}`);
  const toEntryRef = db.collection('repair_treasury_entries').doc(`${actor.tenantId}__repair_hq_settlement_in__${settlementId}`);
  const journalRef = db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_hq_settlement__${settlementId}`);
  const at = new Date().toISOString();
  const postingDecision = await accountingPostingDecision(actor.tenantId, 'autoPostRepairTreasury', at);
  const note = String(settlement.note || `تسوية خزينة إلى ${main.name}`).trim();

  const result = await db.runTransaction(async (tx) => {
    const [
      settlementSnap,
      fromEntrySnap,
      toEntrySnap,
      journalSnap,
      fromSessionSnap,
      toSessionSnap,
      fromMonthCloseSnap,
      toMonthCloseSnap,
    ] = await Promise.all([
      tx.get(settlementRef),
      tx.get(fromEntryRef),
      tx.get(toEntryRef),
      tx.get(journalRef),
      tx.get(fromSession.ref),
      tx.get(toSession.ref),
      tx.get(fromMonthCloseRef),
      tx.get(toMonthCloseRef),
    ]);
    if (!settlementSnap.exists || String(settlementSnap.data()?.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('not-found', 'طلب التسوية غير موجود.');
    }
    if (String(settlementSnap.data()?.status || '') === 'approved' || fromEntrySnap.exists || toEntrySnap.exists || journalSnap.exists) {
      return {
        fromEntryId: fromEntryRef.id,
        toEntryId: toEntryRef.id,
        journalEntryId: postingDecision.enabled ? journalRef.id : null,
        duplicated: true,
      };
    }
    if (String(settlementSnap.data()?.status || '') !== 'submitted') {
      throw new HttpsError('failed-precondition', 'التسوية ليست بانتظار الاعتماد.');
    }
    if (!fromSessionSnap.exists || String(fromSessionSnap.data()?.status || '') !== 'open') {
      throw new HttpsError('failed-precondition', 'خزينة الفرع المُرسِل غير مفتوحة.');
    }
    if (!toSessionSnap.exists || String(toSessionSnap.data()?.status || '') !== 'open') {
      throw new HttpsError('failed-precondition', 'خزينة الفرع الرئيسي غير مفتوحة.');
    }
    if (fromMonthCloseSnap.exists && String(fromMonthCloseSnap.data()?.status || '') === 'closed') {
      throw new HttpsError('failed-precondition', 'شهر خزينة الفرع المُرسِل مقفول.');
    }
    if (toMonthCloseSnap.exists && String(toMonthCloseSnap.data()?.status || '') === 'closed') {
      throw new HttpsError('failed-precondition', 'شهر خزينة الفرع الرئيسي مقفول.');
    }

    tx.create(fromEntryRef, {
      tenantId: actor.tenantId,
      branchId: fromBranchId,
      sessionId: fromSession.id,
      entryType: 'SETTLEMENT_OUT',
      amount,
      note,
      paymentMethod: 'cash',
      costCenterId: fromLive.costCenterId,
      source: 'hq_settlement',
      sourceId: settlementId,
      settlementId,
      counterpartBranchId: toBranchId,
      journalEntryId: postingDecision.enabled ? journalRef.id : null,
      accountingStatus: postingDecision.enabled ? 'posted' : 'pending_accounting',
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
    });
    tx.create(toEntryRef, {
      tenantId: actor.tenantId,
      branchId: toBranchId,
      sessionId: toSession.id,
      entryType: 'SETTLEMENT_IN',
      amount,
      note,
      paymentMethod: 'cash',
      costCenterId: toLive.costCenterId,
      source: 'hq_settlement',
      sourceId: settlementId,
      settlementId,
      counterpartBranchId: fromBranchId,
      journalEntryId: postingDecision.enabled ? journalRef.id : null,
      accountingStatus: postingDecision.enabled ? 'posted' : 'pending_accounting',
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
    });
    if (postingDecision.enabled) tx.create(journalRef, {
      tenantId: actor.tenantId,
      branchId: toBranchId,
      costCenterId: toLive.costCenterId,
      source: 'repair_hq_settlement',
      sourceId: settlementId,
      referenceNo: `HQ-${settlementId.slice(-8).toUpperCase()}`,
      description: note,
      status: 'posted',
      postedAt: at,
      date: at.slice(0, 10),
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
      totalDebit: amount,
      totalCredit: amount,
      lines: [
        {
          accountCode: toLive.accounts.cash.code,
          accountName: toLive.accounts.cash.name,
          debit: amount,
          credit: 0,
          costCenterId: toLive.costCenterId,
          description: note,
        },
        {
          accountCode: fromLive.accounts.cash.code,
          accountName: fromLive.accounts.cash.name,
          debit: 0,
          credit: amount,
          costCenterId: fromLive.costCenterId,
          description: note,
        },
      ],
    });
    else queuePendingAccounting(tx, {
      tenantId: actor.tenantId, source: 'repair_hq_settlement', sourceId: settlementId,
      branchId: toBranchId, costCenterId: toLive.costCenterId, amount, date: at,
      reason: postingDecision.reason,
      payload: { fromBranchId, toBranchId, note },
    });
    tx.update(settlementRef, {
      status: 'approved',
      approvedBy: actor.uid,
      approvedByName: actor.displayName,
      approvedAt: at,
      fromEntryId: fromEntryRef.id,
      toEntryId: toEntryRef.id,
      journalEntryId: postingDecision.enabled ? journalRef.id : null,
      accountingStatus: postingDecision.enabled ? 'posted' : 'pending_accounting',
      fromSessionId: fromSession.id,
      toSessionId: toSession.id,
      updatedAt: at,
    });
    return {
      fromEntryId: fromEntryRef.id,
      toEntryId: toEntryRef.id,
      journalEntryId: postingDecision.enabled ? journalRef.id : null,
      duplicated: false,
    };
  });

  return { ok: true as const, settlementId, status: 'approved' as const, amount, ...result };
}

export const mutateRepairTreasuryHandler = async (request: CallableRequest) => {
  const actor = await loadActor(requireAuth(request));
  const data = (request.data || {}) as Record<string, unknown>;
  const operation = String(data.operation || '').trim();
  if (operation === 'post_manual_entry') {
    return postManualTreasuryEntry(actor, data);
  }
  if (operation === 'submit_settlement') {
    return submitTreasurySettlement(actor, data);
  }
  if (operation === 'approve_settlement') {
    return approveTreasurySettlement(actor, data);
  }
  if (operation === 'reject_settlement') {
    return rejectTreasurySettlement(actor, data);
  }
  throw new HttpsError(
    'invalid-argument',
    operation
      ? `عملية خزينة غير مدعومة (${operation}).`
      : 'عملية خزينة غير مدعومة.',
  );
};

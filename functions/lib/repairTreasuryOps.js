import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { ensureDefaultAccounts } from './accountingOps.js';
import { getRepairTreasuryExpenseType, REPAIR_MANUAL_INCOME_ACCOUNT_CODE, } from './repairTreasuryExpenseTypes.js';
const db = getDb();
const roundMoney = (value) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n))
        return 0;
    return Math.max(0, Math.round(n * 100) / 100);
};
const requireAuth = (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    return uid;
};
const loadActor = async (uid) => {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists)
        throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
    const user = userSnap.data();
    if (user.isActive === false)
        throw new HttpsError('permission-denied', 'الحساب غير نشط.');
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId)
        throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
    let permissions = {};
    const roleId = String(user.roleId || '').trim();
    if (roleId) {
        const roleSnap = await db.collection('roles').doc(roleId).get();
        const role = roleSnap.data();
        if (!roleSnap.exists || String(role?.tenantId || '').trim() !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        permissions = (role?.permissions || {});
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
const requirePermission = (actor, keys, message) => {
    if (actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true))
        return;
    throw new HttpsError('permission-denied', message);
};
const assertBranchScope = (actor, branchId) => {
    if (actor.isSuperAdmin
        || actor.permissions['repair.branches.manage'] === true
        || actor.permissions['repair.callCenter.viewAll'] === true
        || actor.branchIds.includes(branchId)) {
        return;
    }
    throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
};
const paymentMethodAccountKey = (method) => {
    if (method === 'card')
        return 'card';
    if (method === 'bank_transfer')
        return 'bankTransfer';
    return 'cash';
};
const loadBranchPaymentAccounts = async (actor, branchId) => {
    const branchRef = db.collection('repair_branches').doc(branchId);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists || String(branchSnap.data()?.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('failed-precondition', 'فرع الصيانة غير موجود.');
    }
    const costCenterId = String(branchSnap.data()?.costCenterId || '').trim();
    if (!costCenterId) {
        throw new HttpsError('failed-precondition', 'اربط الفرع بمركز تكلفة من الحسابات ← إعدادات الحسابات ثم احفظ الربط.');
    }
    const map = (branchSnap.data()?.accountingAccounts || {});
    const keys = ['cash', 'card', 'bankTransfer'];
    if (keys.some((key) => !String(map[key] || '').trim())) {
        throw new HttpsError('failed-precondition', 'أكمل ربط حسابات النقدية/البطاقات/التحويل لفرع الصيانة قبل تسجيل حركة الخزينة.');
    }
    const snapshots = await db.getAll(...keys.map((key) => db.collection('accounting_accounts').doc(`${actor.tenantId}__${String(map[key]).trim()}`)));
    const invalidKey = keys.find((key, index) => {
        const snap = snapshots[index];
        const account = snap.data();
        return !snap.exists
            || String(account?.tenantId || '') !== actor.tenantId
            || account?.isActive === false
            || account?.allowPosting === false
            || account?.type !== 'asset';
    });
    if (invalidKey) {
        throw new HttpsError('failed-precondition', `حساب وسيلة الدفع غير صالح (حقل: ${invalidKey}). راجع ربط الفرع في إعدادات الحسابات.`);
    }
    const accounts = Object.fromEntries(keys.map((key, index) => {
        const account = snapshots[index].data();
        return [key, {
                code: String(account.code || map[key]),
                name: String(account.name || key),
            }];
    }));
    return { branchRef, costCenterId, accounts, branchName: String(branchSnap.data()?.name || branchId) };
};
const resolvePostingAccount = async (tenantId, code, expectedType) => {
    const snap = await db.collection('accounting_accounts').doc(`${tenantId}__${code}`).get();
    const account = snap.data();
    if (!snap.exists
        || String(account?.tenantId || '') !== tenantId
        || account?.isActive === false
        || account?.allowPosting === false
        || account?.type !== expectedType) {
        throw new HttpsError('failed-precondition', `حساب ${code} غير جاهز للترحيل. من الحسابات ← شجرة الحسابات: نفّذ بذرة الحسابات الافتراضية.`);
    }
    return {
        code: String(account?.code || code),
        name: String(account?.name || code),
    };
};
async function postManualTreasuryEntry(actor, data) {
    requirePermission(actor, ['repair.treasury.manage'], 'ليس لديك صلاحية إدارة خزينة الصيانة.');
    const branchId = String(data.branchId || '').trim();
    const entryType = String(data.entryType || '').trim();
    const method = String(data.paymentMethod || '').trim();
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
    let expenseType = null;
    let expenseAccountId = null;
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
    }
    else if (entryType === 'INCOME') {
        contraAccount = await resolvePostingAccount(actor.tenantId, REPAIR_MANUAL_INCOME_ACCOUNT_CODE, 'revenue');
        debit = methodAccount;
        credit = contraAccount;
    }
    else if (entryType === 'TRANSFER_OUT') {
        // خروج نقدية الفرع إلى الخزينة الرئيسية / تحويل بنكي
        debit = bankAccount;
        credit = live.accounts.cash;
    }
    else {
        // TRANSFER_IN
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
                journalEntryId: journalRef.id,
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
            journalEntryId: journalRef.id,
            createdBy: actor.uid,
            createdByName: actor.displayName,
            createdAt: at,
        });
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
        return {
            entryId: treasuryEntryRef.id,
            journalEntryId: journalRef.id,
            duplicated: false,
        };
    });
    return {
        ok: true,
        ...result,
        amount,
        entryType,
        expenseType,
    };
}
export const mutateRepairTreasuryHandler = async (request) => {
    const actor = await loadActor(requireAuth(request));
    const data = (request.data || {});
    const operation = String(data.operation || '').trim();
    if (operation === 'post_manual_entry') {
        return postManualTreasuryEntry(actor, data);
    }
    throw new HttpsError('invalid-argument', operation
        ? `عملية خزينة غير مدعومة (${operation}).`
        : 'عملية خزينة غير مدعومة.');
};

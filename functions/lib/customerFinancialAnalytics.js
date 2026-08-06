import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
import { summarizeCustomerFinancialRows } from './customerFinancialSummary.js';
const db = getDb();
const money = (value) => {
    const n = Number(value || 0);
    return Number.isFinite(n) ? Math.round(Math.max(0, n) * 100) / 100 : 0;
};
const isWarrantyJob = (job) => {
    if (String(job.warrantyScope || '') === 'manufacturer')
        return true;
    return (Array.isArray(job.jobProducts) ? job.jobProducts : [])
        .some((raw) => Boolean(raw.inWarranty));
};
const inPeriod = (value, from, to) => {
    const day = String(value || '').slice(0, 10);
    if (!day)
        return !from && !to;
    return (!from || day >= from) && (!to || day <= to);
};
const sumPartsActualCost = (value) => money((Array.isArray(value) ? value : []).reduce((sum, raw) => {
    const row = raw;
    const total = Number(row.totalCostSnapshot);
    if (Number.isFinite(total) && total >= 0)
        return sum + total;
    return sum + money(row.quantity) * money(row.unitCostSnapshot);
}, 0));
const loadActor = async (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!userSnap.exists || user?.isActive === false)
        throw new HttpsError('permission-denied', 'الحساب غير صالح.');
    const tenantId = String(user?.tenantId || '').trim();
    let allowed = user?.isSuperAdmin === true;
    const roleId = String(user?.roleId || '').trim();
    if (!allowed && roleId) {
        const roleSnap = await db.collection('roles').doc(roleId).get();
        if (!roleSnap.exists || String(roleSnap.data()?.tenantId || '') !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        allowed = roleSnap.data()?.permissions?.['customers.view'] === true;
    }
    if (!allowed)
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية عرض العملاء.');
    return { uid, tenantId };
};
const getDocsByIds = async (collection, ids) => {
    if (ids.length === 0)
        return [];
    return db.getAll(...ids.map((id) => db.collection(collection).doc(id)));
};
const getPaymentsForJobs = async (jobIds, tenantId) => {
    const rows = [];
    for (let i = 0; i < jobIds.length; i += 30) {
        const chunk = jobIds.slice(i, i + 30);
        const snap = await db.collection('repair_payments').where('jobId', 'in', chunk).get();
        rows.push(...snap.docs.filter((doc) => String(doc.data().tenantId || '') === tenantId));
    }
    return rows;
};
export async function getCustomerFinancialAnalyticsHandler(request) {
    const actor = await loadActor(request);
    const data = (request.data || {});
    const customerId = String(data.customerId || '').trim();
    const from = String(data.from || '').slice(0, 10);
    const to = String(data.to || '').slice(0, 10);
    if (!customerId)
        throw new HttpsError('invalid-argument', 'العميل مطلوب.');
    if (from && to && from > to)
        throw new HttpsError('invalid-argument', 'فترة التحليل غير صالحة.');
    const customerSnap = await db.collection('customers').doc(customerId).get();
    if (!customerSnap.exists || String(customerSnap.data()?.tenantId || '') !== actor.tenantId) {
        throw new HttpsError('not-found', 'العميل غير موجود.');
    }
    const [jobsSnap, invoicesSnap] = await Promise.all([
        db.collection('repair_jobs').where('tenantId', '==', actor.tenantId).where('customerId', '==', customerId).get(),
        db.collection('repair_sales_invoices').where('tenantId', '==', actor.tenantId).where('customerId', '==', customerId).get(),
    ]);
    const jobDocs = jobsSnap.docs.filter((doc) => inPeriod(doc.data().createdAt, from, to));
    const jobIds = jobDocs.map((doc) => doc.id);
    const [financialSnaps, paymentDocs] = await Promise.all([
        getDocsByIds('repair_job_financials', jobIds),
        getPaymentsForJobs(jobIds, actor.tenantId),
    ]);
    const financialByJob = new Map(financialSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()]));
    const repairRows = jobDocs.map((doc) => {
        const job = doc.data();
        const fin = financialByJob.get(doc.id) || {};
        const warranty = isWarrantyJob(job) || String(fin.settlementType || '') === 'warranty';
        const partsActual = warranty ? money(fin.warrantyPartsActualCost || sumPartsActualCost(job.partsUsed)) : 0;
        const serviceInternal = warranty ? money(fin.warrantyServiceInternalCost) : 0;
        const gross = money(fin.grossAmount);
        const legacyIncomplete = warranty && (!fin.settlementType || fin.warrantyServiceInternalCost === undefined);
        return {
            id: doc.id, receiptNo: String(job.receiptNo || doc.id), createdAt: String(job.createdAt || ''),
            deliveredAt: String(job.deliveredAt || ''), status: String(job.status || ''), warranty,
            grossAmount: gross, discountAmount: money(fin.discountAmount),
            warrantyAllowance: warranty ? money(fin.discountAmount || gross) : 0,
            netAmount: warranty ? 0 : money(fin.netAmount), paidAmount: warranty ? 0 : money(fin.paidAmount),
            balanceDue: warranty ? 0 : money(fin.balanceDue), warrantyPartsActualCost: partsActual,
            warrantyServiceInternalCost: serviceInternal, warrantyActualCost: money(partsActual + serviceInternal),
            serviceLines: Array.isArray(fin.serviceLines) ? fin.serviceLines : [],
            partLines: Array.isArray(fin.partLines) ? fin.partLines : [],
            partsUsed: Array.isArray(job.partsUsed) ? job.partsUsed : [],
            jobProducts: Array.isArray(job.jobProducts) ? job.jobProducts : [], legacyIncomplete,
            cancelled: String(job.status || '') === 'cancelled',
        };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const paymentRows = paymentDocs.map((doc) => {
        const row = doc.data();
        return { id: doc.id, jobId: String(row.jobId || ''), paymentNo: String(row.paymentNo || doc.id),
            amount: money(row.amount), method: String(row.method || ''), status: String(row.status || ''),
            createdAt: String(row.createdAt || ''), reversedAt: String(row.reversedAt || '') };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const invoiceRows = invoicesSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((row) => inPeriod(row.postedAt || row.createdAt, from, to))
        .map((row) => ({
        id: row.id, invoiceNo: String(row.invoiceNo || row.id), createdAt: String(row.createdAt || ''),
        postedAt: String(row.postedAt || ''), status: String(row.status || 'draft'),
        grossAmount: money(row.grossAmount || row.total), discountAmount: money(row.discountAmount),
        netAmount: money(row.total), quantity: money((Array.isArray(row.lines) ? row.lines : []).reduce((sum, raw) => sum + money(raw.quantity), 0)),
        fullDiscount: money(row.grossAmount || row.total) > 0 && money(row.total) === 0,
        lines: Array.isArray(row.lines) ? row.lines : [], paymentMethod: String(row.paymentMethod || ''),
    })).sort((a, b) => String(b.postedAt || b.createdAt).localeCompare(String(a.postedAt || a.createdAt)));
    const summary = summarizeCustomerFinancialRows(repairRows, invoiceRows, paymentRows);
    return { ok: true, customerId, period: { from, to }, summary, repairRows, invoiceRows, paymentRows };
}

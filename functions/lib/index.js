import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
initializeApp();
const db = getFirestore();
const STATS_ROOT = 'dashboardStats/global';
const toNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeReport = (value) => {
    if (!value || !value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date))
        return null;
    return {
        date: value.date,
        quantityProduced: toNumber(value.quantityProduced),
        quantityWaste: toNumber(value.quantityWaste),
        totalCost: toNumber(value.totalCost),
    };
};
const monthKey = (date) => date.slice(0, 7);
const applyDelta = async (report, factor) => {
    const dailyRef = db.doc(`${STATS_ROOT}/daily/${report.date}`);
    const monthlyRef = db.doc(`${STATS_ROOT}/monthly/${monthKey(report.date)}`);
    const payload = {
        totalProduction: FieldValue.increment(report.quantityProduced * factor),
        totalWaste: FieldValue.increment(report.quantityWaste * factor),
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

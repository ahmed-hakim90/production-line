import { HttpsError } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';
/** Legacy reports must not post stock, progress or costs for the new order cycle. */
export async function assertLegacyReportOrder(report, transaction) {
    const orderId = String(report.workOrderId || '').trim();
    if (!orderId)
        return;
    const ref = getDb().collection('work_orders').doc(orderId);
    const snapshot = transaction ? await transaction.get(ref) : await ref.get();
    if (Number(snapshot.data()?.cycleVersion || 1) === 2) {
        throw new HttpsError('failed-precondition', 'أمر الشغل يستخدم الدورة الجديدة؛ مسار تقارير الإنتاج القديم غير مسموح له.');
    }
}

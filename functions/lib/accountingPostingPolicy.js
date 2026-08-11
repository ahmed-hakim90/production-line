import { HttpsError } from "firebase-functions/v2/https";
import { getDb } from "./adminApp.js";
const db = getDb();
const DEFAULT_CUTOVER_PERIOD = "2026-09";
export async function validateAutomaticPostingMaster(input) {
    const accountCodes = Array.from(new Set(input.accountCodes.map((code) => String(code || "").trim()).filter(Boolean)));
    if (accountCodes.length !== input.accountCodes.length || accountCodes.length === 0) {
        throw new HttpsError("failed-precondition", "حسابات الترحيل الآلي غير مكتملة.");
    }
    const refs = accountCodes.map((code) => db.collection("accounting_accounts").doc(`${input.tenantId}__${code}`));
    const snaps = await db.getAll(...refs);
    const invalidCode = accountCodes.find((code, index) => {
        const row = snaps[index].data();
        return !snaps[index].exists
            || String(row?.tenantId || "") !== input.tenantId
            || row?.isActive === false
            || row?.allowPosting === false;
    });
    if (invalidCode) {
        throw new HttpsError("failed-precondition", `الحساب ${invalidCode} غير صالح للترحيل.`);
    }
    const costCenterId = String(input.costCenterId || "").trim();
    if (!costCenterId && input.requireCostCenter !== false) {
        throw new HttpsError("failed-precondition", "مركز التكلفة مطلوب للترحيل.");
    }
    if (costCenterId) {
        const center = await db.collection("cost_centers").doc(costCenterId).get();
        if (!center.exists
            || String(center.data()?.tenantId || "") !== input.tenantId
            || center.data()?.isActive === false
            || center.data()?.allowPosting === false) {
            throw new HttpsError("failed-precondition", "مركز التكلفة غير صالح للترحيل.");
        }
    }
}
export async function accountingPostingDecision(tenantId, flag, dateIso) {
    const period = String(dateIso || "").slice(0, 7);
    const settingsSnap = await db.collection("accounting_settings").doc(tenantId).get();
    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const cutoverPeriod = String(settings.cutoverPeriod || DEFAULT_CUTOVER_PERIOD);
    // Historical behavior remains untouched before the agreed cutover.
    if (period < cutoverPeriod)
        return { enabled: true, period, reason: "enabled" };
    if (settings[flag] === false) {
        return { enabled: false, period, reason: "automation_disabled" };
    }
    if (settings.openingBalanceStatus !== "approved") {
        return { enabled: false, period, reason: "opening_balance_pending" };
    }
    if (settings.enforceOpenPeriods !== false) {
        const periodSnap = await db
            .collection("accounting_periods")
            .doc(`${tenantId}__${period}`)
            .get();
        if (periodSnap.exists && periodSnap.data()?.status === "closed") {
            return { enabled: false, period, reason: "period_closed" };
        }
    }
    return { enabled: true, period, reason: "enabled" };
}
export function queuePendingAccounting(tx, input) {
    const safeSource = input.source.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeSourceId = input.sourceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const ref = db
        .collection("accounting_posting_outbox")
        .doc(`${input.tenantId}__${safeSource}__${safeSourceId}`);
    tx.set(ref, {
        tenantId: input.tenantId,
        source: input.source,
        sourceId: input.sourceId,
        branchId: input.branchId || null,
        costCenterId: input.costCenterId || null,
        amount: Number(input.amount || 0),
        date: input.date,
        period: input.date.slice(0, 7),
        status: "pending",
        pendingReason: input.reason,
        payload: input.payload || {},
        attempts: 0,
        createdAt: input.date,
        updatedAt: input.date,
    }, { merge: true });
    return ref.id;
}

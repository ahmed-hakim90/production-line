import { getDb } from './adminApp.js';
const db = getDb();
const WAREHOUSES = 'warehouses';
const COUNTERS = '_counters';
const nowIso = () => new Date().toISOString();
export function formatRepairWarehouseCode(prefix, sequence) {
    const seq = Math.max(1, Math.floor(Number(sequence) || 1));
    return `${prefix}-${String(seq).padStart(3, '0')}`;
}
export function parseRepairWarehouseSequence(code) {
    const match = String(code || '')
        .trim()
        .toUpperCase()
        .match(/^(?:MCW|RCW|RUW|RWH)-(\d{1,6})$/);
    if (!match)
        return null;
    const seq = Number(match[1]);
    return Number.isFinite(seq) && seq > 0 ? seq : null;
}
export function maxRepairWarehouseSequence(codes) {
    let max = 0;
    for (const code of codes) {
        const seq = parseRepairWarehouseSequence(String(code || ''));
        if (seq && seq > max)
            max = seq;
    }
    return max;
}
export async function allocateRepairWarehouseSequence(tenantId) {
    const counterRef = db.collection(COUNTERS).doc(`repair_warehouse_seq_${tenantId}`);
    const warehouses = await db
        .collection(WAREHOUSES)
        .where('tenantId', '==', tenantId)
        .limit(2000)
        .get();
    const maxFromCodes = maxRepairWarehouseSequence(warehouses.docs.map((snap) => String(snap.data()?.code || '')));
    let next = 1;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        next = Math.max(Number(snap.data()?.value || 0) + 1, maxFromCodes + 1);
        tx.set(counterRef, { tenantId, value: next, updatedAt: nowIso() }, { merge: true });
    });
    return next;
}

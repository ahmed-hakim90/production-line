export function normalizeRepairSalePrice(value) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n < 0)
        return 0;
    return Math.round(n * 10000) / 10000;
}
export function roundRepairMoney(value) {
    return Math.round(normalizeRepairSalePrice(value) * 100) / 100;
}
/**
 * trader → traderSalePrice when > 0, else consumer.
 * consumer / missing → consumer (defaultSalePrice) only — no branch catalog fallback.
 */
export function pickRepairSalePrice(input) {
    const consumer = normalizeRepairSalePrice(input.consumerSalePrice);
    if (input.customerType === 'trader') {
        const trader = normalizeRepairSalePrice(input.traderSalePrice);
        if (trader > 0)
            return trader;
    }
    return consumer;
}
export function parseCustomerType(value) {
    if (value === 'trader')
        return 'trader';
    if (value === 'consumer')
        return 'consumer';
    return null;
}
export async function loadCustomerType(db, tenantId, customerId) {
    const id = String(customerId || '').trim();
    if (!id)
        return null;
    const snap = await db.collection('customers').doc(id).get();
    if (!snap.exists)
        return null;
    const data = snap.data();
    if (String(data.tenantId || '').trim() !== tenantId)
        return null;
    return parseCustomerType(data.type);
}
export async function loadCustomerTypeInTx(t, db, tenantId, customerId) {
    const id = String(customerId || '').trim();
    if (!id)
        return null;
    const snap = await t.get(db.collection('customers').doc(id));
    if (!snap.exists)
        return null;
    const data = snap.data();
    if (String(data.tenantId || '').trim() !== tenantId)
        return null;
    return parseCustomerType(data.type);
}

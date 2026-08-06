/**
 * Server-side stock reservation on stock_items.reservedQty.
 * available = max(0, quantity - reservedQty). Client must not write reservedQty.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
export const stockAvailableQty = (balance) => {
    const quantity = Number(balance?.quantity || 0);
    const reserved = Number(balance?.reservedQty || 0);
    const qty = Number.isFinite(quantity) ? quantity : 0;
    const reservedQty = Number.isFinite(reserved) && reserved > 0 ? reserved : 0;
    return Math.max(0, qty - reservedQty);
};
export const stockReservedQty = (balance) => {
    const reserved = Number(balance?.reservedQty || 0);
    return Number.isFinite(reserved) && reserved > 0 ? reserved : 0;
};
const assertTenant = (balance, tenantId, label) => {
    if (!balance)
        return;
    if (String(balance.tenantId || '').trim() !== tenantId) {
        throw new HttpsError('permission-denied', `${label} خارج شركتك.`);
    }
};
/**
 * Increase reservedQty. Fails when available < qty.
 * Creates the balance doc skeleton when missing (quantity 0).
 */
export const reserveStockInTx = (tx, ref, input, existing) => {
    const qty = Number(input.qty);
    if (!(qty > 0) || !Number.isFinite(qty)) {
        throw new HttpsError('invalid-argument', 'كمية الحجز غير صالحة.');
    }
    assertTenant(existing, input.tenantId, input.label || 'رصيد المخزون');
    const available = stockAvailableQty(existing);
    if (available + 1e-9 < qty) {
        throw new HttpsError('failed-precondition', `الرصيد المتاح غير كافٍ للحجز (المتاح ${available}).`);
    }
    if (!existing) {
        tx.set(ref, {
            tenantId: input.tenantId,
            warehouseId: input.warehouseId,
            itemType: input.itemType,
            itemId: input.itemId,
            quantity: 0,
            reservedQty: qty,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
    }
    tx.update(ref, {
        reservedQty: stockReservedQty(existing) + qty,
        updatedAt: FieldValue.serverTimestamp(),
    });
};
/** Decrease reservedQty without changing physical quantity. */
export const releaseStockInTx = (tx, ref, input, existing) => {
    const qty = Number(input.qty);
    if (!(qty > 0) || !Number.isFinite(qty))
        return;
    if (!existing)
        return;
    assertTenant(existing, input.tenantId, input.label || 'رصيد المخزون');
    const next = Math.max(0, stockReservedQty(existing) - qty);
    tx.update(ref, {
        reservedQty: next,
        updatedAt: FieldValue.serverTimestamp(),
    });
};
/**
 * Consume a reservation as stock leaves (OUT/TRANSFER): lower reservedQty by qty.
 * Physical quantity is updated by the caller’s movement write.
 */
export const consumeReservedInTx = (tx, ref, input, existing) => {
    releaseStockInTx(tx, ref, input, existing);
};

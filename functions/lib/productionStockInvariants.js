export const PRODUCTION_QUANTITY_TOLERANCE = 0.000001;
const QUANTITY_DECIMAL_PLACES = 6;
export const quantitiesMatch = (left, right) => Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= PRODUCTION_QUANTITY_TOLERANCE;
export const canonicalProductionQuantity = (value) => {
    if (!Number.isFinite(value))
        return 'invalid';
    const rounded = Math.round(value * (10 ** QUANTITY_DECIMAL_PLACES))
        / (10 ** QUANTITY_DECIMAL_PLACES);
    return rounded.toFixed(QUANTITY_DECIMAL_PLACES);
};
export const buildProductionHandoverIdempotencyKey = (handoverRequestId, expectedReceivedQuantity, quantity) => [
    'production-handover',
    'v1',
    encodeURIComponent(handoverRequestId.trim()),
    canonicalProductionQuantity(expectedReceivedQuantity),
    canonicalProductionQuantity(quantity),
].join(':');

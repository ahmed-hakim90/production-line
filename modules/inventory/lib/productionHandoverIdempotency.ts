const QUANTITY_DECIMAL_PLACES = 6;

const canonicalQuantity = (value: number): string => {
  if (!Number.isFinite(value)) return 'invalid';
  const rounded = Math.round(value * (10 ** QUANTITY_DECIMAL_PLACES))
    / (10 ** QUANTITY_DECIMAL_PLACES);
  return rounded.toFixed(QUANTITY_DECIMAL_PLACES);
};

/**
 * Identifies one receipt attempt by the request's expected pre-receipt state.
 * Network retries reuse the key, while a later partial receipt gets a new key.
 */
export const buildProductionHandoverIdempotencyKey = (
  handoverRequestId: string,
  expectedReceivedQuantity: number,
  quantity: number,
): string => [
  'production-handover',
  'v1',
  encodeURIComponent(handoverRequestId.trim()),
  canonicalQuantity(expectedReceivedQuantity),
  canonicalQuantity(quantity),
].join(':');

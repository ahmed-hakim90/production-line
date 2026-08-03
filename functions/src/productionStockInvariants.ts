export const PRODUCTION_QUANTITY_TOLERANCE = 0.000001;

const QUANTITY_DECIMAL_PLACES = 6;

export const quantitiesMatch = (left: number, right: number): boolean =>
  Number.isFinite(left)
  && Number.isFinite(right)
  && Math.abs(left - right) <= PRODUCTION_QUANTITY_TOLERANCE;

export const canonicalProductionQuantity = (value: number): string => {
  if (!Number.isFinite(value)) return 'invalid';
  const rounded = Math.round(value * (10 ** QUANTITY_DECIMAL_PLACES))
    / (10 ** QUANTITY_DECIMAL_PLACES);
  return rounded.toFixed(QUANTITY_DECIMAL_PLACES);
};

export const buildProductionHandoverIdempotencyKey = (
  handoverRequestId: string,
  expectedReceivedQuantity: number,
  quantity: number,
  options?: { isFinalReceipt?: boolean },
): string => [
  'production-handover',
  options?.isFinalReceipt ? 'v2-final' : 'v1',
  encodeURIComponent(handoverRequestId.trim()),
  canonicalProductionQuantity(expectedReceivedQuantity),
  canonicalProductionQuantity(quantity),
].join(':');

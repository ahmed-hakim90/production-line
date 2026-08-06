import type { FirestoreProduct } from '../../../types';

export const normalizeRepairProductBarcode = (value: unknown): string =>
  String(value || '').trim().toUpperCase();

export function findRepairProductByBarcode(
  products: FirestoreProduct[],
  barcode: unknown,
): FirestoreProduct | undefined {
  const normalized = normalizeRepairProductBarcode(barcode);
  if (!normalized) return undefined;
  return products.find((product) =>
    normalizeRepairProductBarcode(product.barcode) === normalized
    || normalizeRepairProductBarcode((product as FirestoreProduct & { barcodeNormalized?: string }).barcodeNormalized) === normalized,
  );
}

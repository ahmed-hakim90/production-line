import type { FirestoreProduct } from '../../../types';

type RepairProductScanSource = Pick<FirestoreProduct, 'barcode' | 'code'> & {
  barcodeNormalized?: string;
};

export const normalizeRepairProductBarcode = (value: unknown): string =>
  String(value || '').trim().toUpperCase();

/** Exact codes a USB gun / camera scan should match in the intake search field. */
export function repairProductScanKeys(product: RepairProductScanSource): string[] {
  return Array.from(new Set(
    [
      product.barcode,
      product.barcodeNormalized,
      product.code,
    ]
      .map((value) => normalizeRepairProductBarcode(value))
      .filter(Boolean),
  ));
}

export function findRepairProductByBarcode(
  products: FirestoreProduct[],
  barcode: unknown,
): FirestoreProduct | undefined {
  const normalized = normalizeRepairProductBarcode(barcode);
  if (!normalized) return undefined;
  const hits = products.filter((product) => repairProductScanKeys(product).includes(normalized));
  return hits.length === 1 ? hits[0] : undefined;
}

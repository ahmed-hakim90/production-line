import type { FirestoreProduct, Product } from '../types';

/** Minimal shape for raw material rows (e.g. ReportsUiRawMaterialOption). */
export type ManufacturingRawMaterialRef = {
  id: string;
  name?: string;
  code?: string;
};

function setIfMissing(map: Map<string, string>, id: string | undefined, value: string | undefined) {
  const pid = String(id ?? '').trim();
  const v = String(value ?? '').trim();
  if (!pid || !v) return;
  if (!map.has(pid)) map.set(pid, v);
}

/**
 * Resolves display names for production / cost keys that may reference:
 * - catalog products (_rawProducts),
 * - UI product list (includes items filtered out of _rawProducts but still in `products`),
 * - raw materials (component_injection report productId).
 */
export function buildManufacturingItemNameMap(
  rawProducts: Pick<FirestoreProduct, 'id' | 'name'>[],
  products: Pick<Product, 'id' | 'name'>[],
  rawMaterialOptions: ManufacturingRawMaterialRef[],
): Map<string, string> {
  const nameMap = new Map<string, string>();
  for (const p of rawProducts) setIfMissing(nameMap, p.id, p.name);
  for (const p of products) setIfMissing(nameMap, p.id, p.name);
  for (const m of rawMaterialOptions) setIfMissing(nameMap, m.id, m.name);
  return nameMap;
}

export function buildManufacturingItemCodeMap(
  rawProducts: Pick<FirestoreProduct, 'id' | 'code'>[],
  products: Pick<Product, 'id' | 'code'>[],
  rawMaterialOptions: ManufacturingRawMaterialRef[],
): Map<string, string> {
  const codeMap = new Map<string, string>();
  for (const p of rawProducts) setIfMissing(codeMap, p.id, p.code);
  for (const p of products) setIfMissing(codeMap, p.id, p.code);
  for (const m of rawMaterialOptions) setIfMissing(codeMap, m.id, m.code);
  return codeMap;
}

export function resolveManufacturingItemName(
  productId: string | undefined,
  nameMap: Map<string, string>,
): string {
  const pid = String(productId ?? '').trim();
  if (!pid) return '—';
  return nameMap.get(pid) ?? '—';
}

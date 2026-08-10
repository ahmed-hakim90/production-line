/**
 * Catalog home → list page drilldowns (query keys applied by Products / Materials).
 */

export type CatalogProductGap =
  | 'no_category'
  | 'no_barcode'
  | 'no_price'
  | 'no_bom';

export type CatalogMaterialGap = 'no_category' | 'no_cost';

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') q.set(key, value);
  });
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function catalogProductsPath(opts?: {
  manufactured?: 'yes' | 'no';
  gap?: CatalogProductGap;
  /** Category filter value used by Products SmartFilterBar (`categoryId` or `name:…`). */
  category?: string;
  action?: 'create';
}): string {
  return withQuery('/products', {
    manufactured: opts?.manufactured,
    gap: opts?.gap,
    category: opts?.category && opts.category !== '__none__' ? opts.category : undefined,
    action: opts?.action,
  });
}

export function catalogMaterialsPath(opts?: {
  type?: string;
  gap?: CatalogMaterialGap;
  action?: 'create';
}): string {
  return withQuery('/manufacturing/materials', {
    type: opts?.type,
    gap: opts?.gap,
    action: opts?.action,
  });
}

export function parseCatalogProductGap(raw: string | null | undefined): CatalogProductGap | '' {
  const v = String(raw || '').trim();
  if (v === 'no_category' || v === 'no_barcode' || v === 'no_price' || v === 'no_bom') return v;
  return '';
}

export function parseCatalogMaterialGap(raw: string | null | undefined): CatalogMaterialGap | '' {
  const v = String(raw || '').trim();
  if (v === 'no_category' || v === 'no_cost') return v;
  return '';
}

/** Home board path for the catalog module. */
export const CATALOG_BOARD_PATH = '/catalog';

type MaterialScanSource = {
  barcode?: string | null;
  code?: string | null;
  scanKeys?: string[] | null;
};

/** Exact codes a USB gun / typed scan should match in a SearchableSelect. */
export function materialScanKeys(source: MaterialScanSource): string[] {
  const extra = Array.isArray(source.scanKeys) ? source.scanKeys : [];
  return Array.from(new Set(
    [source.barcode, source.code, ...extra]
      .map((key) => String(key || '').trim())
      .filter(Boolean),
  ));
}

/** Normalize Arabic-Indic digits and case so SK-7015A matches "7015" / "٧٠١٥". */
export function normalizeProductionReportSearchText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function matchesProductionReportSearchQuery(
  query: string,
  haystacks: Array<string | number | null | undefined>,
): boolean {
  const needle = normalizeProductionReportSearchText(query);
  if (!needle) return true;
  return haystacks.some((value) =>
    normalizeProductionReportSearchText(String(value ?? '')).includes(needle),
  );
}

export function buildReportRangeLoadKey(params: {
  startDate: string;
  endDate: string;
  lineId?: string;
  employeeId?: string;
}): string {
  return [
    params.startDate,
    params.endDate,
    String(params.lineId || '').trim(),
    String(params.employeeId || '').trim(),
  ].join('|');
}

/**
 * List search is client-side. Range mode only fetches one page unless we expand
 * to the full period — otherwise a product code like 7015 can be missing from
 * the first 50 rows even when reports exist later in the month.
 */
export function shouldLoadFullRangeForClientSearch(params: {
  viewMode: 'today' | 'range' | 'general';
  query: string;
  hasMore: boolean;
  loading: boolean;
  alreadyLoadedKey: string;
  rangeKey: string;
}): boolean {
  if (params.viewMode !== 'range') return false;
  if (!normalizeProductionReportSearchText(params.query)) return false;
  if (params.loading) return false;
  if (!params.hasMore) return false;
  if (!params.rangeKey || params.alreadyLoadedKey === params.rangeKey) return false;
  return true;
}

import type { BostaApiMergedRow } from './bostaApiMerge';
import { categorizeBostaStateLabel, type BostaStateCategory } from './bostaStatePresentation';

export type BostaMergedAnalytics = {
  total: number;
  noLocalCount: number;
  byCategory: Record<BostaStateCategory, number>;
};

const emptyByCategory = (): Record<BostaStateCategory, number> => ({
  delivered: 0,
  in_transit: 0,
  exception: 0,
  cancelled: 0,
  unknown: 0,
});

export function summarizeMergedBostaRows(rows: BostaApiMergedRow[]): BostaMergedAnalytics {
  const byCategory = emptyByCategory();
  let noLocalCount = 0;
  for (const r of rows) {
    if (!r.local) noLocalCount++;
    const cat = categorizeBostaStateLabel(r.api.stateLabel);
    byCategory[cat]++;
  }
  return { total: rows.length, noLocalCount, byCategory };
}

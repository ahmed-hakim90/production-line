import type { ProductionReport, ProductionReportShift } from '../../../types';
import { resolveReportType } from './reportTypes';

export const DEFAULT_INJECTION_SHIFT: ProductionReportShift = 'morning';

export const INJECTION_SHIFT_OPTIONS: Array<{ value: ProductionReportShift; label: string }> = [
  { value: 'morning', label: 'صباحي' },
  { value: 'evening', label: 'مسائي' },
];

export function isInjectionShiftSelected(value?: string | null): value is ProductionReportShift {
  return value === 'morning' || value === 'evening';
}

export function normalizeInjectionShift(value?: string | null): ProductionReportShift {
  return value === 'evening' ? 'evening' : 'morning';
}

export function getInjectionShiftLabel(value?: string | null): string {
  return normalizeInjectionShift(value) === 'evening' ? 'مسائي' : 'صباحي';
}

export type ReportDuplicateCandidate = Pick<
  ProductionReport,
  'id' | 'date' | 'lineId' | 'employeeId' | 'productId' | 'reportType' | 'shift'
>;

export function isDuplicateProductionReport(
  existing: ReportDuplicateCandidate,
  candidate: Pick<ReportDuplicateCandidate, 'date' | 'lineId' | 'employeeId' | 'productId' | 'reportType' | 'shift'>,
  excludeReportId?: string | null,
): boolean {
  if (existing.id && excludeReportId && existing.id === excludeReportId) return false;

  const existingType = resolveReportType(existing.reportType);
  const candidateType = resolveReportType(candidate.reportType);

  if (
    existing.date !== candidate.date
    || existing.lineId !== candidate.lineId
    || existing.employeeId !== candidate.employeeId
    || existing.productId !== candidate.productId
    || existingType !== candidateType
  ) {
    return false;
  }

  if (candidateType === 'component_injection') {
    return normalizeInjectionShift(existing.shift) === normalizeInjectionShift(candidate.shift);
  }

  return true;
}

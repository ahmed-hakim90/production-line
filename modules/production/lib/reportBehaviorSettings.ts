import type { ReportBehaviorSettings, SystemSettings } from '../../../types';

export const DEFAULT_REPORT_BEHAVIOR_SETTINGS: Required<ReportBehaviorSettings> = {
  operationalDayStartHour: 8,
  preventDuplicateReports: true,
  requireWorkHoursOnReports: true,
  requirePositiveQuantityOnReports: true,
  requireLaborForFinishedReports: true,
  requireInjectionShift: true,
  restrictPackagingReportsToPackagingLines: true,
  allowPackagingLaborOptional: true,
  autoLinkSupplyCycleOnReportSave: true,
  autoApplyInventoryOnReportSave: true,
  autoPostReportToPlanAndWorkOrder: true,
};

export function normalizeOperationalDayStartHour(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_REPORT_BEHAVIOR_SETTINGS.operationalDayStartHour;
  return Math.min(23, Math.max(0, n));
}

export function resolveReportBehaviorSettings(
  systemSettings: Pick<SystemSettings, 'planSettings'> | null | undefined,
): Required<ReportBehaviorSettings> {
  const raw = systemSettings?.planSettings?.reportBehavior ?? {};
  return {
    ...DEFAULT_REPORT_BEHAVIOR_SETTINGS,
    ...raw,
    operationalDayStartHour: normalizeOperationalDayStartHour(raw.operationalDayStartHour),
    preventDuplicateReports: raw.preventDuplicateReports !== false,
    requireWorkHoursOnReports: raw.requireWorkHoursOnReports !== false,
    requirePositiveQuantityOnReports: raw.requirePositiveQuantityOnReports !== false,
    requireLaborForFinishedReports: raw.requireLaborForFinishedReports !== false,
    requireInjectionShift: raw.requireInjectionShift !== false,
    restrictPackagingReportsToPackagingLines: raw.restrictPackagingReportsToPackagingLines !== false,
    allowPackagingLaborOptional: raw.allowPackagingLaborOptional !== false,
    autoLinkSupplyCycleOnReportSave: raw.autoLinkSupplyCycleOnReportSave !== false,
    autoApplyInventoryOnReportSave: raw.autoApplyInventoryOnReportSave !== false,
    // Execution progress is a business invariant: every production report must
    // reconcile the matching plan/work order when either one exists.
    autoPostReportToPlanAndWorkOrder: true,
  };
}

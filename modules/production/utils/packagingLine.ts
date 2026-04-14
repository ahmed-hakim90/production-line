import type { FirestoreProductionLine, PackagingReportLine, ProductionReport } from '../../../types';
import { resolveReportType } from './reportTypes';

/**
 * Packaging lines track wrapped quantities separately. Reports on these lines are excluded from
 * work-order «produced quantity» rollup so packaging throughput does not inflate manufacturing progress.
 */
export function isPackagingLine(
  line: Pick<FirestoreProductionLine, 'isPackagingLine'> | undefined,
): boolean {
  return Boolean(line?.isPackagingLine);
}

export function isPackagingLineId(
  lineId: string | undefined,
  lines: Pick<FirestoreProductionLine, 'id' | 'isPackagingLine'>[],
): boolean {
  if (!lineId?.trim()) return false;
  const line = lines.find((l) => String(l.id) === String(lineId));
  return isPackagingLine(line);
}

/** Packaging throughput (explicit type or packaging line) must not inflate work-order manufacturing progress. */
export function isPackagingThroughputReport(
  report: Pick<ProductionReport, 'lineId' | 'reportType'>,
  lines: Pick<FirestoreProductionLine, 'id' | 'isPackagingLine'>[],
): boolean {
  if (report.reportType === 'packaging') return true;
  return isPackagingLineId(report.lineId, lines);
}

export function excludePackagingLineReportsForWorkOrderProduction(
  reports: ProductionReport[],
  lines: Pick<FirestoreProductionLine, 'id' | 'isPackagingLine'>[],
): ProductionReport[] {
  return reports.filter((r) => !isPackagingThroughputReport(r, lines));
}

export function sumQuantityProducedForWorkOrderExcludingPackaging(
  reports: ProductionReport[],
  lines: Pick<FirestoreProductionLine, 'id' | 'isPackagingLine'>[],
): number {
  return excludePackagingLineReportsForWorkOrderProduction(reports, lines).reduce(
    (sum, report) => sum + Number(report.quantityProduced || 0),
    0,
  );
}

/**
 * Effective pieces for one packaging line: if product has units/carton, uses cartons + remainder;
 * otherwise uses quantityPieces only.
 */
export function canonicalPackagingLine(
  line: PackagingReportLine,
  getUnitsPerCarton?: (productId: string) => number | undefined,
): PackagingReportLine {
  const productId = String(line?.productId || '').trim();
  if (!productId) return { productId: '', quantityPieces: 0 };
  const u = Math.floor(Number(getUnitsPerCarton?.(productId) ?? 0));
  if (u > 0) {
    const full = Math.max(0, Math.floor(Number(line.quantityCartons ?? 0)));
    const rem = Math.max(0, Math.min(u - 1, Math.floor(Number(line.remainderPieces ?? 0))));
    return { productId, quantityPieces: full * u + rem };
  }
  return { productId, quantityPieces: Math.max(0, Number(line.quantityPieces || 0)) };
}

export function effectivePackagingPieces(
  line: PackagingReportLine,
  getUnitsPerCarton?: (productId: string) => number | undefined,
): number {
  return canonicalPackagingLine(line, getUnitsPerCarton).quantityPieces;
}

/** Normalize packaging multi-line payload: derive productId + quantityProduced from packagingLines when non-empty. */
export function normalizePackagingLinesForSave(
  data: Omit<ProductionReport, 'id' | 'createdAt'>,
  getUnitsPerCarton?: (productId: string) => number | undefined,
): Omit<ProductionReport, 'id' | 'createdAt'> {
  if (resolveReportType(data.reportType) !== 'packaging') return data;
  const lines = (data.packagingLines ?? [])
    .map((l) => canonicalPackagingLine(l as PackagingReportLine, getUnitsPerCarton))
    .map(({ productId, quantityPieces }) => ({ productId, quantityPieces }))
    .filter((l) => l.productId && l.quantityPieces > 0);
  if (lines.length === 0) {
    return { ...data, packagingLines: [] };
  }
  return {
    ...data,
    packagingLines: lines,
    productId: lines[0].productId,
    quantityProduced: lines.reduce((s, l) => s + l.quantityPieces, 0),
  };
}

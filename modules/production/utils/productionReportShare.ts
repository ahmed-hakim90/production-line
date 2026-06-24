import type { PrintTemplateSettings, ProductionReport } from '../../../types';
import type { ReportPrintRow } from '../components/ProductionReportPrint';
import {
  buildShareStandardVarianceBanner,
  computeProductionReportStandardQtyVariance,
} from '../../../utils/productionReportStandardVariance';
import { formatProductionReportShareCaption } from '../../../utils/productionReportShareCaption';
import type { ShareResult } from '../../../utils/reportExport';
import { resolveReportType } from './reportTypes';

type VarianceParams = Parameters<typeof computeProductionReportStandardQtyVariance>[0];

export type ProductionReportShareStandardContext = Pick<
  VarianceParams,
  | 'lineProductConfigs'
  | 'routingVarianceBasisSecondsByProduct'
  | 'routingPlanTargetUnitSecondsByProduct'
  | 'routingProductTargetUnitSecondsByProduct'
>;

export function getProductionReportShareKey(report: ProductionReport): string {
  return report.id || report.reportCode || `${report.date}-${report.lineId}-${report.productId}`;
}

export function buildProductionReportShareRow(
  report: ProductionReport,
  baseRow: ReportPrintRow,
  context: ProductionReportShareStandardContext,
): ReportPrintRow {
  const reportType = resolveReportType(report.reportType);
  const validPackagingLines = (report.packagingLines ?? [])
    .map((line) => ({
      productId: String(line?.productId || '').trim(),
      quantityPieces: Math.max(0, Number(line?.quantityPieces || 0)),
    }))
    .filter((line) => line.productId && line.quantityPieces > 0);
  const packagingMultiProduct = reportType === 'packaging' && validPackagingLines.length > 1;
  const variance = computeProductionReportStandardQtyVariance({
    productId: report.productId,
    lineId: report.lineId,
    quantityProduced: report.quantityProduced || 0,
    workersCount: report.workersCount || 0,
    workHours: report.workHours || 0,
    ...context,
  });

  return {
    ...baseRow,
    sourceReportType: reportType,
    ...(reportType === 'packaging' ? { packagingShareImage: true } : {}),
    ...(!packagingMultiProduct
      ? { shareStandardVariance: buildShareStandardVarianceBanner(variance) }
      : {}),
  };
}

export async function shareProductionReportCardToWhatsApp(input: {
  node: HTMLElement;
  row: ReportPrintRow;
  printSettings?: PrintTemplateSettings;
}): Promise<ShareResult> {
  const { captureNodeAndShareToWhatsApp } = await import('@/src/shared/utils/exportNodeToImage');
  const caption = formatProductionReportShareCaption(input.row, input.printSettings);
  const reportNumber = input.row.reportCode?.trim()
    || (input.row.reportId ? `RPT-${input.row.reportId.slice(-6).toUpperCase()}` : 'RPT-NA');

  return captureNodeAndShareToWhatsApp(
    input.node,
    `production-report-${reportNumber}`,
    { caption },
  );
}

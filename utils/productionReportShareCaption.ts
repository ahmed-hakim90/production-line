/**
 * Plain-text captions for Web Share (WhatsApp image caption). Mirrors SingleReportPrint / bulk header order.
 */
import type { PrintTemplateSettings } from '../types';
import { DEFAULT_PRINT_TEMPLATE } from './dashboardConfig';
import type { ReportPrintRow } from '../modules/production/components/ProductionReportPrint';
import {
  formatPackagingLineDisplay,
  totalWorkersForPrintRow,
} from '../modules/production/components/ProductionReportPrint';

function fmtNum(value: number, decimalPlaces: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

function shortProductName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[1]}`;
}

function formatReportNumber(reportId?: string): string {
  if (!reportId) return 'RPT-NA';
  const shortId = reportId.slice(-6).toUpperCase();
  return `RPT-${shortId}`;
}

const section = (title: string, lines: string[]) => [title, ...lines.filter(Boolean)].join('\n');

/**
 * Caption matching the single production report card (same field order as PrintReportLayout).
 */
export function formatProductionReportShareCaption(
  report: ReportPrintRow,
  printSettings?: PrintTemplateSettings,
): string {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const dp = ps.decimalPlaces ?? 0;
  const total = Number(report.quantityProduced || 0) + Number(report.wasteQuantity || 0);
  const wasteRatio = total > 0 ? ((Number(report.wasteQuantity || 0) / total) * 100).toFixed(dp) : '0';
  const rt = report.sourceReportType;
  const reportTypeHeading =
    rt === 'component_injection'
      ? 'تقرير مكون حقن'
      : rt === 'packaging'
        ? 'تقرير تغليف'
        : 'تقرير إنتاج';
  const qtyKpiLabel = rt === 'packaging' ? 'الكمية المغلفة' : 'الكمية المنتجة';
  const hideWasteUi = rt === 'packaging' || rt === 'component_injection';
  const isShareImage = Boolean(report.shareStandardVariance);
  const printMeta = {
    reportNumber: report.reportCode?.trim() || formatReportNumber(report.reportId),
    reportDate: report.date || '—',
    lineName: report.lineName || '—',
    supervisorName: report.employeeName || '—',
  };

  const laborDistributionValue = `إنتاج: ${report.workersProductionCount ?? 0} | تغليف: ${report.workersPackagingCount ?? 0} | جودة: ${report.workersQualityCount ?? 0} | صيانة: ${report.workersMaintenanceCount ?? 0} | خارجية: ${report.workersExternalCount ?? 0}`;
  const detailLines: string[] = [`ساعات العمل: ${fmtNum(report.workHours, dp)} ساعات`];
  if (!hideWasteUi) detailLines.push(`نسبة الهالك: ${wasteRatio}%`);
  if (rt !== 'packaging') {
    if (isShareImage && rt === 'component_injection') {
      detailLines.push(`إجمالي العمالة: ${totalWorkersForPrintRow(report)}`);
    } else {
      detailLines.push(`توزيع العمالة: ${laborDistributionValue}`);
    }
  }

  const packagingLines = report.packagingPrintLines;
  const packagingPiecesTotal = packagingLines?.reduce((s, l) => s + Number(l.quantityPieces || 0), 0);
  const qtyKpiValue =
    rt === 'packaging' && packagingLines && packagingLines.length > 0 && packagingPiecesTotal != null
      ? packagingPiecesTotal
      : Number(report.quantityProduced || 0);

  const kpiLines: string[] = [
    `${qtyKpiLabel}: ${typeof qtyKpiValue === 'number' ? qtyKpiValue.toLocaleString('ar-EG') : qtyKpiValue} وحدة`,
  ];
  if (!hideWasteUi) {
    kpiLines.push(`الهالك: ${fmtNum(Number(report.wasteQuantity || 0), dp)} وحدة`);
  }
  if (rt !== 'packaging') {
    kpiLines.push(`العمال: ${totalWorkersForPrintRow(report)}`);
  }
  kpiLines.push(
    `تكلفة الوحدة: ${
      report.costPerUnit != null && report.costPerUnit > 0 ? report.costPerUnit.toFixed(2) : '—'
    } ج.م`,
  );

  const productTitle =
    rt === 'packaging'
      ? packagingLines && packagingLines.length > 0
        ? 'المنتجات المغلفة'
        : 'المنتج المغلف'
      : 'المنتج وأمر الشغل';

  const productLines: string[] =
    rt === 'packaging' && packagingLines && packagingLines.length > 0
      ? packagingLines.map(
          (line) =>
            `${shortProductName(line.productName || '—')}: ${formatPackagingLineDisplay(
              line.quantityPieces,
              line.unitsPerCarton,
            )}`,
        )
      : rt === 'packaging'
        ? [`المنتج: ${shortProductName(report.productName || '—')}`]
        : [
            `المنتج: ${shortProductName(report.productName || '—')}`,
            `أمر الشغل: ${report.workOrderNumber || '—'}`,
          ];

  const detailsTitle = rt === 'packaging' ? 'تفاصيل التغليف' : 'تفاصيل الإنتاج';

  const blocks: string[] = [];

  blocks.push(
    [
      ps.headerText || 'مؤسسة المغربي للإستيراد',
      reportTypeHeading,
      '—',
      rt === 'packaging'
        ? section('بيانات التقرير', [
            `رقم التقرير: ${printMeta.reportNumber}`,
            `تاريخ التقرير: ${printMeta.reportDate}`,
            `خط التغليف: ${printMeta.lineName}`,
            `مشرف التغليف: ${printMeta.supervisorName}`,
          ])
        : section('بيانات التقرير', [
            `رقم التقرير: ${printMeta.reportNumber}`,
            `تاريخ التقرير: ${printMeta.reportDate}`,
            `خط الإنتاج: ${printMeta.lineName}`,
            `الإشراف: ${printMeta.supervisorName}`,
          ]),
      '—',
      section('المؤشرات', kpiLines),
      '—',
      section(productTitle, productLines),
      '—',
      section(detailsTitle, detailLines),
    ].join('\n'),
  );

  return blocks.filter(Boolean).join('\n\n');
}

export function formatBulkProductionReportsShareCaption(input: {
  title: string;
  subtitle?: string;
  totals: {
    totalProduced: number;
    totalWaste: number;
    totalHours: number;
    totalWorkers: number;
    wasteRatio: string;
    reportsCount: number;
  };
  decimalPlaces?: number;
}): string {
  const dp = input.decimalPlaces ?? 0;
  const t = input.totals;
  const lines = [
    input.title,
    input.subtitle ? input.subtitle : null,
    '—',
    'الإجماليات',
    `الكمية المنتجة: ${fmtNum(t.totalProduced, dp)} وحدة`,
    `الكمية الهالكة: ${fmtNum(t.totalWaste, dp)} وحدة`,
    `نسبة الهالك: ${t.wasteRatio}%`,
    `ساعات العمل: ${fmtNum(t.totalHours, dp)} ساعة`,
    `عدد العمال (مجموع التقارير): ${fmtNum(t.totalWorkers, dp)}`,
    `عدد التقارير: ${t.reportsCount}`,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

/**
 * ProductionReportPrint - Configurable printable production report.
 * Reads printTemplate settings from system_settings/{tenantId} (via props).
 * Accepts data via props so it contains ZERO business logic.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ProductionReport, PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { getReportWaste } from '../../../utils/calculations';
import { PrintReportLayout } from '@/src/components/erp/PrintReportLayout';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import type { FactoryPrintTableRow } from '@/src/components/erp/FactoryPrintTable';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import { cn } from '@/lib/utils';
import type { ShareStandardVarianceTone } from '../../../utils/productionReportStandardVariance';
import { shareVarianceTailwindToneClass } from '../../../utils/productionReportStandardVariance';
import { resolveReportType } from '../utils/reportTypes';
import { getInjectionShiftLabel } from '../utils/injectionReportShift';
import { summarizeWorkerPresenceDays } from '../utils/workerPresence';

export type { ShareStandardVarianceTone };

export interface ReportPrintRow {
  reportId?: string;
  reportCode?: string;
  /** When set, drives print headings (production / injection / packaging). */
  sourceReportType?: ProductionReport['reportType'];
  /** Injection reports only. */
  shift?: ProductionReport['shift'];
  date: string;
  lineName: string;
  productName: string;
  employeeName: string;
  quantityProduced: number;
  wasteQuantity: number;
  workersCount: number;
  workersProductionCount?: number;
  workersPackagingCount?: number;
  workersQualityCount?: number;
  workersMaintenanceCount?: number;
  workersExternalCount?: number;
  presentAssignments?: number;
  absentAssignments?: number;
  workHours: number;
  notes?: string;
  costPerUnit?: number;
  /** Optional selling price when page is allowed to include it */
  sellingPrice?: number;
  workOrderNumber?: string;
  /** Finished/injection: pieces per carton from product card (for share cartons KPI). */
  unitsPerCarton?: number;
  /** Filled only for WhatsApp/image share — omitted for print/PDF. */
  shareStandardVariance?: {
    headline: string;
    lines: string[];
    tone: ShareStandardVarianceTone;
  };
  /** Packaging share capture: outer ref + labor hiding without variance banner. */
  packagingShareImage?: boolean;
  /** Multi-line packaging quantities for print/share table. */
  packagingPrintLines?: Array<{
    productName: string;
    quantityPieces: number;
    unitsPerCarton?: number;
  }>;
}

export interface ReportPrintProps {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  rows: ReportPrintRow[];
  totals?: {
    totalProduced: number;
    totalWaste: number;
    totalHours: number;
    totalWorkers: number;
    wasteRatio: string;
    reportsCount: number;
  };
  printSettings?: PrintTemplateSettings;
}

/**
 * Convert raw ProductionReport[] to ReportPrintRow[] using lookup fns.
 * Call this from the parent page - keeps logic out of the print component.
 */
export function buildPackagingPrintLinesFromReport(
  r: ProductionReport,
  lookups: {
    getProductName: (
      id: string,
      reportType?: ProductionReport['reportType'],
      productNameSnapshot?: string,
    ) => string;
    getUnitsPerCarton?: (productId: string) => number | undefined;
  },
): ReportPrintRow['packagingPrintLines'] | undefined {
  if (resolveReportType(r.reportType) !== 'packaging') return undefined;
  const upc = lookups.getUnitsPerCarton;
  const trimmed = (r.packagingLines ?? [])
    .map((l) => ({
      productId: String(l?.productId || '').trim(),
      quantityPieces: Math.max(0, Number(l?.quantityPieces || 0)),
    }))
    .filter((l) => l.productId && l.quantityPieces > 0);
  if (trimmed.length > 0) {
    return trimmed.map((l) => ({
      productName: lookups.getProductName(l.productId, r.reportType),
      quantityPieces: l.quantityPieces,
      unitsPerCarton: upc?.(l.productId),
    }));
  }
  const q = Number(r.quantityProduced || 0);
  if (r.productId && q > 0) {
    return [{
      productName: lookups.getProductName(r.productId, r.reportType),
      quantityPieces: q,
      unitsPerCarton: upc?.(r.productId),
    }];
  }
  return undefined;
}

export const mapReportsToPrintRows = (
  reports: ProductionReport[],
  lookups: {
    getLineName: (id: string) => string;
    getProductName: (
      id: string,
      reportType?: ProductionReport['reportType'],
      productNameSnapshot?: string,
    ) => string;
    getEmployeeName: (id: string) => string;
    getWorkOrder?: (id: string) => { workOrderNumber: string } | undefined;
    getUnitsPerCarton?: (productId: string) => number | undefined;
  },
  costMap?: Map<string, number>,
): ReportPrintRow[] =>
  reports.map((r) => {
    const wo = r.workOrderId && lookups.getWorkOrder ? lookups.getWorkOrder(r.workOrderId) : undefined;
    const presence = summarizeWorkerPresenceDays((r.workerOutputs ?? []).map((row) => ({
      workerId: row.workerId,
      date: r.date,
      isPresent: row.isPresent,
    })));
    return {
      date: r.date,
      reportId: r.id,
      reportCode: r.reportCode,
      sourceReportType: r.reportType,
      shift: r.shift,
      lineName: lookups.getLineName(r.lineId),
      productName: lookups.getProductName(r.productId, r.reportType, r.productNameSnapshot),
      employeeName: lookups.getEmployeeName(r.employeeId),
      quantityProduced: r.quantityProduced || 0,
      wasteQuantity: getReportWaste(r),
      workersCount: r.workersCount || 0,
      workersProductionCount: r.workersProductionCount || 0,
      workersPackagingCount: r.workersPackagingCount || 0,
      workersQualityCount: r.workersQualityCount || 0,
      workersMaintenanceCount: r.workersMaintenanceCount || 0,
      workersExternalCount: r.workersExternalCount || 0,
      presentAssignments: presence.presentDays,
      absentAssignments: presence.absentDays,
      workHours: r.workHours || 0,
      notes: r.notes,
      costPerUnit: r.id && costMap ? costMap.get(r.id) : undefined,
      workOrderNumber: wo?.workOrderNumber,
      unitsPerCarton: r.productId && lookups.getUnitsPerCarton
        ? lookups.getUnitsPerCarton(r.productId)
        : undefined,
      packagingPrintLines: buildPackagingPrintLinesFromReport(r, lookups),
    };
  });

/**
 * Compute totals from rows.
 */
export const computePrintTotals = (rows: ReportPrintRow[], decimalPlaces = 0) => {
  const totalProduced = rows.reduce((s, r) => s + r.quantityProduced, 0);
  const totalWaste = rows.reduce((s, r) => s + r.wasteQuantity, 0);
  const totalHours = rows.reduce((s, r) => s + r.workHours, 0);
  const totalWorkers = rows.reduce((s, r) => s + r.workersCount, 0);
  const total = totalProduced + totalWaste;
  const wasteRatio = total > 0 ? ((totalWaste / total) * 100).toFixed(decimalPlaces) : '0';
  return { totalProduced, totalWaste, totalHours, totalWorkers, wasteRatio, reportsCount: rows.length };
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

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

/** Human-readable packaging quantity: pieces, or cartons + remainder when units/carton is set. */
export function formatPackagingLineDisplay(quantityPieces: number, unitsPerCarton?: number): string {
  const q = Math.max(0, Number(quantityPieces || 0));
  const u = Number(unitsPerCarton || 0);
  if (!u || u <= 0) return `${q.toLocaleString('ar-EG')} قطعة`;
  const cartons = Math.floor(q / u);
  const rem = q % u;
  const parts: string[] = [];
  if (cartons > 0) parts.push(`${cartons.toLocaleString('ar-EG')} كرتون`);
  if (rem > 0) parts.push(`${rem.toLocaleString('ar-EG')} قطعة متبقية`);
  if (parts.length === 0) return `${q.toLocaleString('ar-EG')} قطعة`;
  return parts.join(' و ');
}

/**
 * Carton equivalent for share caption/KPI when units/carton is known.
 * Packaging multi-line: sum of (pieces ÷ upc) for lines that have upc.
 */
export function resolveReportCartonsCount(report: ReportPrintRow): number | null {
  if (report.sourceReportType === 'packaging' && report.packagingPrintLines && report.packagingPrintLines.length > 0) {
    let sum = 0;
    let hasUpc = false;
    for (const line of report.packagingPrintLines) {
      const u = Number(line.unitsPerCarton || 0);
      if (u <= 0) continue;
      hasUpc = true;
      sum += Number(line.quantityPieces || 0) / u;
    }
    if (!hasUpc) return null;
    return Number(sum.toFixed(2));
  }
  const u = Number(report.unitsPerCarton || 0);
  if (u <= 0) return null;
  const pieces = Number(report.quantityProduced || 0);
  if (!Number.isFinite(pieces)) return null;
  return Number((pieces / u).toFixed(2));
}

export function formatReportCartonsCount(cartons: number): string {
  const n = Number(cartons);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
}

function formatReportNumber(reportId?: string): string {
  if (!reportId) return 'RPT-NA'
  const shortId = reportId.slice(-6).toUpperCase()
  return `RPT-${shortId}`
}

/** Headcount for print/share: prefer sum of role breakdown when present, else stored workersCount. */
export function totalWorkersForPrintRow(row: ReportPrintRow): number {
  const sum =
    (row.workersProductionCount ?? 0)
    + (row.workersPackagingCount ?? 0)
    + (row.workersQualityCount ?? 0)
    + (row.workersMaintenanceCount ?? 0)
    + (row.workersExternalCount ?? 0);
  return sum > 0 ? sum : Number(row.workersCount || 0);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ProductionReportPrint — Bulk report printout                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

export const ProductionReportPrint = React.forwardRef<HTMLDivElement, ReportPrintProps>(
  ({ title, subtitle, generatedAt, rows, totals, printSettings }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'productionReport');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const dp = ps.decimalPlaces;
    const t = totals ?? computePrintTotals(rows, dp);
    const now = generatedAt ?? new Date().toLocaleString('ar-EG');
    const paper = PAPER_DIMENSIONS[ps.paperSize] || PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';

    const showWaste = doc.isFieldVisible('waste');
    const showEmployee = doc.isFieldVisible('employee');
    const showCosts = doc.isFieldVisible('costs') && rows.some((r) => r.costPerUnit != null && r.costPerUnit > 0);
    const showWO = doc.isFieldVisible('workOrder') && rows.some((r) => !!r.workOrderNumber);
    const showSignatures = doc.isFieldVisible('signatures');
    const showQR = doc.isFieldVisible('qrCode');
    const showNotes = rows.some((r) => !!r.notes?.trim());

    const columns = [
      { key: 'idx', header: '#', width: '4%', align: 'center' as const },
      { key: 'date', header: 'التاريخ', width: '9%' },
      { key: 'line', header: 'خط الإنتاج', width: '10%' },
      { key: 'product', header: 'المنتج', width: '14%' },
      ...(showEmployee ? [{ key: 'employee', header: 'المشرف', width: '10%' }] : []),
      ...(showWO ? [{ key: 'wo', header: 'أمر شغل', width: '9%' }] : []),
      ...(showNotes ? [{ key: 'notes', header: 'ملاحظات', width: '10%' }] : []),
      { key: 'qty', header: 'الكمية', width: '8%', align: 'center' as const },
      ...(showWaste ? [{ key: 'waste', header: 'الهالك', width: '7%', align: 'center' as const }] : []),
      { key: 'workers', header: 'عمال', width: '6%', align: 'center' as const },
      { key: 'labor', header: 'تفصيل العمالة', width: '12%' },
      { key: 'presence', header: 'الحضور', width: '10%' },
      { key: 'hours', header: 'ساعات', width: '7%', align: 'center' as const },
      ...(showCosts ? [{ key: 'cost', header: 'تكلفة', width: '7%', align: 'center' as const }] : []),
    ];

    const dataRows: FactoryPrintTableRow[] = rows.map((row, i) => ({
      key: `row-${i}`,
      cells: {
        idx: i + 1,
        date: row.date,
        line: row.lineName,
        product: shortProductName(row.productName),
        employee: row.employeeName,
        wo: row.workOrderNumber || '—',
        notes: row.notes?.trim() || '—',
        qty: <strong style={{ color: '#059669' }}>{fmtNum(row.quantityProduced, dp)}</strong>,
        waste: <strong>{fmtNum(row.wasteQuantity, dp)}</strong>,
        workers: row.workersCount,
        labor: `إ:${row.workersProductionCount ?? 0} | ت:${row.workersPackagingCount ?? 0} | ج:${row.workersQualityCount ?? 0} | ص:${row.workersMaintenanceCount ?? 0} | خ:${row.workersExternalCount ?? 0}`,
        presence: `حاضر:${row.presentAssignments ?? 0} | غائب:${row.absentAssignments ?? 0}`,
        hours: fmtNum(row.workHours, dp),
        cost:
          row.costPerUnit != null && row.costPerUnit > 0 ? (
            <strong style={{ color: accent }}>{fmtNum(row.costPerUnit, 2)}</strong>
          ) : (
            '—'
          ),
      },
    }));

    const avgCost = (() => {
      const costsArr = rows.filter((r) => r.costPerUnit != null && r.costPerUnit > 0).map((r) => r.costPerUnit!);
      if (!costsArr.length) return 0;
      return costsArr.reduce((s, v) => s + v, 0) / costsArr.length;
    })();

    dataRows.push({
      key: 'totals',
      cells: {
        idx: '',
        date: 'الإجمالي',
        line: '',
        product: '',
        employee: '',
        wo: '',
        notes: '',
        qty: <strong style={{ color: '#059669' }}>{fmtNum(t.totalProduced, dp)}</strong>,
        waste: <strong style={{ color: '#f43f5e' }}>{fmtNum(t.totalWaste, dp)}</strong>,
        workers: fmtNum(t.totalWorkers, dp),
        labor: '—',
        presence: '—',
        hours: fmtNum(t.totalHours, dp),
        cost: avgCost > 0 ? <strong style={{ color: accent }}>{fmtNum(avgCost, 2)}</strong> : '—',
      },
    });

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || 'مؤسسة المغربي للإستيراد'}
        documentType={title || 'تقرير إنتاج'}
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : ps.paperSize === 'a5' ? '8mm 9mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          ...(subtitle ? [{ label: 'الوصف', value: subtitle }] : []),
          { label: 'عدد السجلات', value: String(rows.length) },
          { label: 'تاريخ الطباعة', value: now },
        ]}
        kpis={[
          { label: 'الكمية المنتجة', value: fmtNum(t.totalProduced, dp), unit: 'وحدة', tone: 'indigo' as const },
          ...(showWaste
            ? [
                { label: 'الهالك', value: fmtNum(t.totalWaste, dp), unit: 'وحدة', tone: 'red' as const },
                { label: 'نسبة الهالك', value: `${t.wasteRatio}%`, tone: 'sky' as const },
              ]
            : []),
          { label: 'ساعات العمل', value: fmtNum(t.totalHours, dp), unit: 'ساعة' },
          { label: 'عدد التقارير', value: t.reportsCount },
        ]}
        signatures={
          !isThermal && showSignatures
            ? [
                { title: 'مدير المصنع' },
                ...(showEmployee ? [{ title: 'مدير الخط' }] : []),
                { title: 'مراقب الجودة' },
              ]
            : undefined
        }
      >
        <FactoryPrintSectionTitle title="تفاصيل التقارير" accent={accent} />
        <FactoryPrintTable
          dense={isThermal}
          brandAccent={accent}
          printSettings={ps}
          columns={columns}
          rows={dataRows}
        />
        {showQR ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <QRCodeSVG
              value={`report-batch|${now}|count:${rows.length}|produced:${t.totalProduced}`}
              size={isThermal ? 40 : 64}
              level="L"
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>
              امسح رمز QR للتحقق من صحة التقرير
            </span>
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

ProductionReportPrint.displayName = 'ProductionReportPrint';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SingleReportPrint — Printable layout for ONE production report            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface SingleReportPrintProps {
  report: ReportPrintRow | null;
  printSettings?: PrintTemplateSettings;
  /** Unique root id when multiple export layouts exist on one page (e.g. showcase). */
  exportRootId?: string;
}

export const SingleReportPrint = React.forwardRef<HTMLDivElement, SingleReportPrintProps>(
  ({ report, printSettings, exportRootId }, ref) => {
    if (!report) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'productionReport');
    const font = resolvePrintFont(ps);
    const dp = ps.decimalPlaces ?? 0;
    const now = new Date().toLocaleString('ar-EG');
    const total = Number(report.quantityProduced || 0) + Number(report.wasteQuantity || 0);
    const wasteRatio = total > 0 ? ((Number(report.wasteQuantity || 0) / total) * 100).toFixed(dp) : '0';
    const rt = report.sourceReportType;
    const reportTypeHeading = rt === 'component_injection'
      ? 'تقرير مكون حقن'
      : rt === 'packaging'
        ? 'تقرير تغليف'
        : 'تقرير إنتاج';
    const qtyKpiLabel = rt === 'packaging' ? 'الكمية المغلفة' : 'الكمية المنتجة';
    const hideWasteUi = rt === 'packaging' || rt === 'component_injection' || !doc.isFieldVisible('waste');
    const showEmployee = doc.isFieldVisible('employee');
    const showCosts = doc.isFieldVisible('costs');
    const showWorkOrder = doc.isFieldVisible('workOrder');
    const showSellingPrice = doc.isFieldVisible('sellingPrice') && report.sellingPrice != null && report.sellingPrice > 0;
    const showSignatures = doc.isFieldVisible('signatures');
    const shareOuterCapture = Boolean(report.shareStandardVariance || report.packagingShareImage);
    const isShareImage = Boolean(report.shareStandardVariance);
    const printMeta = {
      reportNumber: report.reportCode?.trim() || formatReportNumber(report.reportId),
      reportDate: report.date || '—',
      lineName: report.lineName || '—',
      supervisorName: showEmployee ? (report.employeeName || '—') : '—',
    };

    const presenceValue = `حاضر: ${report.presentAssignments ?? 0} | غائب: ${report.absentAssignments ?? 0}`;
    const laborDistributionValue = `إنتاج: ${report.workersProductionCount ?? 0} | تغليف: ${report.workersPackagingCount ?? 0} | جودة: ${report.workersQualityCount ?? 0} | صيانة: ${report.workersMaintenanceCount ?? 0} | خارجية: ${report.workersExternalCount ?? 0}`;
    const detailSectionRows = [
      { label: 'ساعات العمل', value: `${fmtNum(report.workHours, dp)} ساعات` },
      ...(rt === 'component_injection'
        ? [{ label: 'الوردية', value: getInjectionShiftLabel(report.shift) }]
        : []),
      ...(hideWasteUi ? [] : [{ label: 'نسبة الهالك', value: `${wasteRatio}%` }]),
      ...(showSellingPrice
        ? [{ label: 'سعر البيع', value: `${Number(report.sellingPrice).toFixed(2)} ج.م` }]
        : []),
      ...(rt === 'packaging'
        ? []
        : (isShareImage && rt === 'component_injection'
          ? [{ label: 'إجمالي العمالة', value: String(totalWorkersForPrintRow(report)) }]
          : [
            { label: 'توزيع العمالة', value: laborDistributionValue },
            { label: 'الحضور', value: presenceValue },
          ])),
    ];

    const packagingLines = report.packagingPrintLines;
    const packagingPiecesTotal = packagingLines?.reduce((s, l) => s + Number(l.quantityPieces || 0), 0);
    const qtyKpiValue = rt === 'packaging' && packagingLines && packagingLines.length > 0 && packagingPiecesTotal != null
      ? packagingPiecesTotal
      : Number(report.quantityProduced || 0);

    const kpiItems = [
      { label: qtyKpiLabel, value: qtyKpiValue, unit: 'وحدة', color: 'indigo' as const },
      ...(hideWasteUi
        ? []
        : [{ label: 'الهالك', value: Number(report.wasteQuantity || 0), unit: 'وحدة', color: (report.wasteQuantity ?? 0) > 0 ? 'red' as const : 'default' as const }]),
      ...(rt === 'packaging'
        ? []
        : [{
          label: 'العمال',
          value: totalWorkersForPrintRow(report),
          color: hideWasteUi ? 'sky' as const : 'default' as const,
        }]),
      ...(showCosts
        ? [{
          label: 'تكلفة الوحدة',
          value: report.costPerUnit != null && report.costPerUnit > 0 ? report.costPerUnit.toFixed(2) : '—',
          unit: 'ج.م',
          color: 'green' as const,
        }]
        : []),
    ];

    const productSectionTitle = rt === 'packaging'
      ? (packagingLines && packagingLines.length > 0 ? 'المنتجات المغلفة' : 'المنتج المغلف')
      : 'المنتج وأمر الشغل';
    const productSectionRows = rt === 'packaging' && packagingLines && packagingLines.length > 0
      ? packagingLines.map((line) => ({
        label: shortProductName(line.productName || '—'),
        value: formatPackagingLineDisplay(line.quantityPieces, line.unitsPerCarton),
        highlight: true as const,
      }))
      : rt === 'packaging'
        ? [{ label: 'المنتج', value: shortProductName(report.productName || '—'), highlight: true as const }]
        : [
          { label: 'المنتج', value: shortProductName(report.productName || '—'), highlight: true as const },
          ...(showWorkOrder ? [{ label: 'أمر الشغل', value: report.workOrderNumber || '—' }] : []),
        ];

    const metaCards = rt === 'packaging' ? [
      { label: 'رقم التقرير', value: printMeta.reportNumber },
      { label: 'تاريخ التقرير', value: printMeta.reportDate },
      { label: 'خط التغليف', value: printMeta.lineName },
      ...(showEmployee ? [{ label: 'مشرف التغليف', value: printMeta.supervisorName }] : []),
    ] : showEmployee ? undefined : [
      { label: 'رقم التقرير', value: printMeta.reportNumber },
      { label: 'تاريخ التقرير', value: printMeta.reportDate },
      { label: 'خط الإنتاج', value: printMeta.lineName },
    ];

    const layout = (
      <PrintReportLayout
        ref={shareOuterCapture ? undefined : ref}
        nestedInShareWrapper={shareOuterCapture}
        exportRootId={exportRootId}
        companyName={doc.headerText || 'مؤسسة المغربي للإستيراد'}
        reportType={reportTypeHeading}
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={resolvePrintAccentHex(ps.primaryColor)}
        footerTagline={doc.footerText?.trim() || undefined}
        paperSize={ps.paperSize}
        orientation={ps.orientation}
        meta={printMeta}
        metaCards={metaCards}
        kpis={kpiItems}
        extraLines={doc.customLines}
        fontFamily={font.fontFamily}
        fontSize={font.fontSize}
        signatures={showSignatures ? [{ title: 'المشرف' }, { title: 'مدير الخط' }] : undefined}
        sections={[
          {
            title: productSectionTitle,
            rows: productSectionRows,
            progress: undefined,
          },
          {
            title: rt === 'packaging' ? 'تفاصيل التغليف' : 'تفاصيل الإنتاج',
            rows: detailSectionRows,
          },
        ]}
      />
    );

    const v = report.shareStandardVariance;
    if (!shareOuterCapture) {
      return layout;
    }

    return (
      <div
        ref={ref}
        dir="rtl"
        lang="ar"
        className="print-root print-report arabic-export-root bg-white w-[640px] mx-auto p-0"
        style={{
          fontFamily: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
          width: 640,
          minWidth: 640,
          maxWidth: 640,
          boxSizing: 'border-box',
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          padding: 0,
          overflow: 'visible',
        }}
      >
        {v ? (
          <div
            className={cn(
              'mx-auto w-full max-w-[640px] border-2 rounded-lg px-4 py-3 mb-3',
              shareVarianceTailwindToneClass[v.tone],
            )}
            style={{ letterSpacing: 'normal' }}
          >
            <p className="text-[13px] font-bold leading-snug mb-1.5">{v.headline}</p>
            {v.lines.map((line, i) => (
              <p key={i} className="text-[11px] font-semibold leading-relaxed opacity-95">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {layout}
      </div>
    );
  },
);

SingleReportPrint.displayName = 'SingleReportPrint';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  WorkOrderPrint — Printable layout for a single work order                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface WorkOrderPrintData {
  workOrderNumber: string;
  productName: string;
  lineName: string;
  supervisorName: string;
  quantity: number;
  producedQuantity: number;
  maxWorkers: number;
  targetDate: string;
  status: string;
  statusLabel: string;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string;
  showCosts?: boolean;
}

export interface WorkOrderPrintProps {
  data: WorkOrderPrintData | null;
  printSettings?: PrintTemplateSettings;
}

export const WorkOrderPrint = React.forwardRef<HTMLDivElement, WorkOrderPrintProps>(
  ({ data, printSettings }, ref) => {
    const lastDataRef = React.useRef<WorkOrderPrintData | null>(null);
    if (data) lastDataRef.current = data;
    const resolved = data ?? lastDataRef.current;
    if (!resolved) return <div ref={ref} className="print-root print-report" />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'workOrder');
    const font = resolvePrintFont(ps);
    const dp = ps.decimalPlaces;
    const now = new Date().toLocaleString('ar-EG');
    const progress = resolved.quantity > 0 ? Math.min((resolved.producedQuantity / resolved.quantity) * 100, 100) : 0;
    const remaining = Math.max(0, Number(resolved.quantity || 0) - Number(resolved.producedQuantity || 0));
    const showCosts = !!resolved.showCosts && doc.isFieldVisible('costs');
    const showNotes = doc.isFieldVisible('notes');

    return (
      <PrintReportLayout
        ref={ref}
        companyName={doc.headerText || 'مؤسسة المغربي للإستيراد'}
        reportType="أمر شغل"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={resolvePrintAccentHex(ps.primaryColor)}
        footerTagline={doc.footerText?.trim() || undefined}
        extraLines={doc.customLines}
        paperSize={ps.paperSize}
        orientation={ps.orientation}
        paperWidth={ps.paperSize === 'a5' ? '148mm' : '210mm'}
        minHeight={ps.paperSize === 'a5' ? '210mm' : '297mm'}
        padding={ps.paperSize === 'a5' ? '8mm 9mm' : '10mm 12mm'}
        fontFamily={font.fontFamily}
        fontSize={font.fontSize}
        meta={{
          reportNumber: resolved.workOrderNumber || '—',
          reportDate: resolved.targetDate || '—',
          lineName: resolved.lineName || '—',
          supervisorName: resolved.supervisorName || '—',
        }}
        metaCards={
          doc.isFieldVisible('meta')
            ? [
                { label: 'رقم أمر الشغل', value: resolved.workOrderNumber || '—' },
                { label: 'تاريخ الاستهداف', value: resolved.targetDate || '—' },
                { label: 'خط الإنتاج', value: resolved.lineName || '—' },
                { label: 'إشراف', value: resolved.supervisorName || '—' },
              ]
            : []
        }
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'الكمية المخططة', value: Number(resolved.quantity || 0), unit: 'وحدة', color: 'indigo' },
                { label: 'الكمية المنتجة', value: Number(resolved.producedQuantity || 0), unit: 'وحدة', color: 'green' },
                { label: 'المتبقي', value: remaining, unit: 'وحدة', color: remaining > 0 ? 'red' : 'default' },
                { label: 'نسبة الإنجاز', value: progress.toFixed(dp), unit: '%', color: progress >= 100 ? 'green' : 'default' },
              ]
            : []
        }
        sections={[
          {
            title: 'المنتج وأمر الشغل',
            rows: [
              { label: 'المنتج', value: resolved.productName || '—', highlight: true },
              { label: 'الحالة', value: resolved.statusLabel || resolved.status || '—' },
            ],
            progress: { label: 'تقدم أمر الشغل', value: Math.round(Math.max(0, Math.min(100, progress))) },
          },
          {
            title: 'تفاصيل التنفيذ',
            rows: [
              { label: 'الحد الأقصى للعمالة', value: `${resolved.maxWorkers || 0} عامل` },
              ...(showCosts && resolved.estimatedCost != null
                ? [{ label: 'التكلفة التقديرية', value: `${fmtNum(resolved.estimatedCost, 2)} ج.م` }]
                : []),
              ...(showCosts && resolved.actualCost != null && resolved.actualCost > 0
                ? [{ label: 'التكلفة الفعلية', value: `${fmtNum(resolved.actualCost, 2)} ج.م` }]
                : []),
              ...(showNotes && resolved.notes ? [{ label: 'ملاحظات', value: resolved.notes }] : []),
            ],
          },
        ]}
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'المشرف' }, { title: 'اعتماد الإدارة' }]
            : undefined
        }
      />
    );
  },
);

WorkOrderPrint.displayName = 'WorkOrderPrint';

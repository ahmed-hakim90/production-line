import type { CSSProperties } from 'react';
import type { PrintTemplateSettings } from '../../../types';
import {
  formatPackagingLineDisplay,
  formatReportCartonsCount,
  resolveReportCartonsCount,
  totalWorkersForPrintRow,
  type ReportPrintRow,
} from './ProductionReportPrint';
import { getInjectionShiftLabel } from '../utils/injectionReportShift';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import { PrintExtraLines } from '@/src/components/erp/PrintExtraLines';
import { resolveImageExportPalette } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '@/utils/printTheme';

export interface ProductionReportShareCardProps {
  report: ReportPrintRow;
  generatedAt?: string;
  printSettings?: PrintTemplateSettings;
  version?: string;
}

const CARD_WIDTH = 1080;

const baseText: CSSProperties = {
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  lineHeight: 1.5,
};

const ltrText: CSSProperties = {
  direction: 'ltr',
  unicodeBidi: 'plaintext',
  textAlign: 'left',
};

const formatNumber = (value: number, digits = 0) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const shortProductName = (name: string): string => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return String(name || '—').trim() || '—';
  return `${parts[0]} ${parts[1]}`;
};

const reportNumberOf = (report: ReportPrintRow): string => {
  if (report.reportCode?.trim()) return report.reportCode.trim();
  if (!report.reportId) return 'RPT-NA';
  return `RPT-${report.reportId.slice(-6).toUpperCase()}`;
};

const reportTypeLabel = (report: ReportPrintRow): string => {
  if (report.sourceReportType === 'component_injection') return 'تقرير مكون حقن';
  if (report.sourceReportType === 'packaging') return 'تقرير تغليف';
  return 'تقرير إنتاج';
};

const quantityLabel = (report: ReportPrintRow): string =>
  report.sourceReportType === 'packaging' ? 'الكمية المغلفة' : 'الكمية المنتجة';

const producedQuantity = (report: ReportPrintRow): number => {
  if (report.sourceReportType !== 'packaging') return Number(report.quantityProduced || 0);
  const total = report.packagingPrintLines?.reduce((sum, line) => sum + Number(line.quantityPieces || 0), 0);
  return total && total > 0 ? total : Number(report.quantityProduced || 0);
};

const shouldShowReferenceWarning = (report: ReportPrintRow): boolean => {
  const banner = report.shareStandardVariance;
  if (!banner) return false;
  return banner.tone === 'amber' || banner.headline.includes('لا يتوفر مرجع') || banner.headline.includes('تعذر احتساب');
};

const DetailRow = ({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) => (
  <div style={{ ...baseText, display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18, padding: '16px 0', borderBottom: '1px solid #e5e7eb' }}>
    <div style={{ ...baseText, color: '#64748b', fontSize: 24, fontWeight: 700 }}>{label}</div>
    <div
      dir={ltr ? 'ltr' : 'rtl'}
      style={{
        ...baseText,
        ...(ltr ? ltrText : {}),
        color: '#0f172a',
        fontSize: 26,
        fontWeight: 800,
        overflowWrap: 'anywhere',
      }}
    >
      {value || '—'}
    </div>
  </div>
);

export function ProductionReportShareCard({
  report,
  generatedAt = new Date().toLocaleString('ar-EG'),
  printSettings,
  version = __APP_VERSION__,
}: ProductionReportShareCardProps) {
  const doc = resolvePrintDocumentConfig(printSettings, 'productionReport');
  const font = resolvePrintFont(printSettings);
  const accent = resolvePrintAccentHex(printSettings?.primaryColor);
  const palette = resolveImageExportPalette(accent);
  const companyName = doc.headerText || 'Sokany-eg';
  const reportNumber = reportNumberOf(report);
  const produced = producedQuantity(report);
  const cartons = resolveReportCartonsCount(report);
  const workerCount = totalWorkersForPrintRow(report);
  const showCosts = doc.isFieldVisible('costs');
  const showWaste =
    doc.isFieldVisible('waste')
    && report.sourceReportType !== 'packaging'
    && report.sourceReportType !== 'component_injection';
  const showEmployee = doc.isFieldVisible('employee');
  const showWorkOrder = doc.isFieldVisible('workOrder');
  const costValue =
    report.costPerUnit != null && report.costPerUnit > 0
      ? `${formatNumber(report.costPerUnit, 2)} EGP`
      : '—';
  const showWarning = shouldShowReferenceWarning(report);
  const packagingLines = report.packagingPrintLines || [];
  const detailTitle = report.sourceReportType === 'packaging' ? 'تفاصيل التغليف' : 'تفاصيل الإنتاج';
  const productTitle =
    report.sourceReportType === 'packaging' && packagingLines.length > 1
      ? 'المنتجات وأمر الشغل'
      : 'المنتج وأمر الشغل';
  const kpiItems: Array<[string, string, string]> = [
    [quantityLabel(report), `${formatNumber(produced)} وحدة`, accent],
    ...(showWaste
      ? [['الهالك', `${formatNumber(Number(report.wasteQuantity || 0))} وحدة`, '#dc2626'] as [string, string, string]]
      : []),
    ...(cartons != null
      ? [['عدد الكراتين', formatReportCartonsCount(cartons), palette.workersStrip] as [string, string, string]]
      : []),
    ['العمال', formatNumber(workerCount), palette.workersStrip],
    ...(showCosts ? [['تكلفة الوحدة', costValue, '#059669'] as [string, string, string]] : []),
  ];
  const shareFontSize = Math.round(14 + font.fontSizePt * 1.2);

  return (
    <div
      dir="rtl"
      lang="ar"
      data-print-font={font.fontFamily}
      style={{
        ...baseText,
        width: CARD_WIDTH,
        minWidth: CARD_WIDTH,
        maxWidth: CARD_WIDTH,
        background: '#ffffff',
        color: '#0f172a',
        padding: 54,
        fontFamily: font.fontFamily,
        fontSize: shareFontSize,
        letterSpacing: 0,
        overflow: 'visible',
      }}
    >
      {showWarning ? (
        <div
          style={{
            ...baseText,
            border: '2px solid #fde68a',
            background: '#fffbeb',
            color: '#78350f',
            borderRadius: 8,
            padding: '22px 26px',
            marginBottom: 28,
          }}
        >
          <div style={{ ...baseText, fontSize: 27, fontWeight: 900, marginBottom: 8 }}>
            {report.shareStandardVariance?.headline}
          </div>
          {(report.shareStandardVariance?.lines || []).map((line, index) => (
            <div key={index} style={{ ...baseText, fontSize: 21, fontWeight: 700 }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}

      <header style={{ ...baseText, display: 'flex', justifyContent: 'space-between', gap: 32, alignItems: 'flex-start' }}>
        <div style={{ ...baseText, textAlign: 'right' }}>
          <div style={{ ...baseText, fontSize: 42, fontWeight: 950, color: '#111827' }}>{companyName}</div>
          <div dir="ltr" style={{ ...baseText, ...ltrText, fontSize: 24, fontWeight: 800, color: accent, marginTop: 4 }}>
            Hakim Production System
          </div>
        </div>
        <div style={{ ...baseText, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              ...baseText,
              background: palette.badgeBg,
              color: palette.badgeText,
              border: `1px solid ${palette.progressTrack}`,
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 24,
              fontWeight: 900,
            }}
          >
            {reportTypeLabel(report)}
          </div>
          <div dir="ltr" style={{ ...baseText, ...ltrText, color: '#64748b', fontSize: 20, fontWeight: 700 }}>
            {generatedAt}
          </div>
        </div>
      </header>

      {doc.customLines.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <PrintExtraLines lines={doc.customLines} />
        </div>
      ) : null}

      <div style={{ ...baseText, height: 3, background: accent, margin: '30px 0' }} />

      <section style={{ ...baseText, display: 'grid', gridTemplateColumns: `repeat(${showEmployee ? 4 : 3}, 1fr)`, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'visible' }}>
        {[
          ['رقم التقرير', reportNumber, true],
          ['تاريخ التقرير', report.date || '—', true],
          [report.sourceReportType === 'packaging' ? 'خط التغليف' : 'خط الإنتاج', report.lineName || '—', false],
          ...(showEmployee
            ? [[report.sourceReportType === 'packaging' ? 'إشراف التغليف' : 'إشراف', report.employeeName || '—', false] as [string, string, boolean]]
            : []),
        ].map(([label, value, ltr], index, rows) => (
          <div
            key={String(label)}
            style={{
              ...baseText,
              padding: '20px 22px',
              background: '#f8fafc',
              borderLeft: index < rows.length - 1 ? '1px solid #e2e8f0' : 'none',
              minWidth: 0,
            }}
          >
            <div style={{ ...baseText, color: '#64748b', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{label}</div>
            <div
              dir={ltr ? 'ltr' : 'rtl'}
              style={{
                ...baseText,
                ...(ltr ? ltrText : {}),
                color: '#111827',
                fontSize: 22,
                fontWeight: 900,
                overflowWrap: 'anywhere',
              }}
            >
              {String(value)}
            </div>
          </div>
        ))}
      </section>

      <section
        style={{
          ...baseText,
          display: 'grid',
          gridTemplateColumns: `repeat(${kpiItems.length}, 1fr)`,
          gap: 18,
          marginTop: 24,
        }}
      >
        {kpiItems.map(([label, value, color]) => (
          <div
            key={String(label)}
            style={{
              ...baseText,
              border: '1px solid #e2e8f0',
              borderRight: `8px solid ${color}`,
              borderRadius: 8,
              background: '#ffffff',
              padding: '26px 24px',
              minHeight: 142,
            }}
          >
            <div style={{ ...baseText, color: '#64748b', fontSize: 21, fontWeight: 800, marginBottom: 12 }}>{label}</div>
            <div dir="ltr" style={{ ...baseText, ...ltrText, color: String(color), fontSize: 38, fontWeight: 950 }}>
              {String(value)}
            </div>
          </div>
        ))}
      </section>

      <section style={{ ...baseText, marginTop: 32 }}>
        <h2 style={{ ...baseText, margin: '0 0 8px', color: accent, fontSize: 25, fontWeight: 950 }}>
          {productTitle}
        </h2>
        <div style={{ ...baseText, borderTop: '1px solid #e5e7eb' }}>
          {report.sourceReportType === 'packaging' && packagingLines.length > 0 ? (
            packagingLines.map((line) => (
              <DetailRow
                key={`${line.productName}-${line.quantityPieces}`}
                label={shortProductName(line.productName || '—')}
                value={formatPackagingLineDisplay(line.quantityPieces, line.unitsPerCarton)}
                ltr
              />
            ))
          ) : (
            <DetailRow label="المنتج" value={shortProductName(report.productName || '—')} />
          )}
          {showWorkOrder ? (
            <DetailRow label="أمر الشغل" value={report.workOrderNumber || '—'} ltr />
          ) : null}
        </div>
      </section>

      <section style={{ ...baseText, marginTop: 26 }}>
        <h2 style={{ ...baseText, margin: '0 0 8px', color: accent, fontSize: 25, fontWeight: 950 }}>
          {detailTitle}
        </h2>
        <div style={{ ...baseText, borderTop: '1px solid #e5e7eb' }}>
          <DetailRow label="ساعات العمل" value={`${formatNumber(report.workHours, 2)} ساعة`} ltr />
          {report.sourceReportType === 'component_injection' ? (
            <DetailRow label="الوردية" value={getInjectionShiftLabel(report.shift)} />
          ) : null}
          <DetailRow label="توزيع العمالة" value={`إنتاج ${report.workersProductionCount ?? 0} | تغليف ${report.workersPackagingCount ?? 0} | جودة ${report.workersQualityCount ?? 0} | صيانة ${report.workersMaintenanceCount ?? 0} | خارجية ${report.workersExternalCount ?? 0}`} ltr />
          <DetailRow label="الحضور" value={`حاضر ${report.presentAssignments ?? 0} | غائب ${report.absentAssignments ?? 0}`} ltr />
          {showWaste ? (
            <DetailRow label="الهالك" value={`${formatNumber(report.wasteQuantity)} وحدة`} ltr />
          ) : null}
        </div>
      </section>

      {showCosts || report.notes?.trim() ? (
        <section style={{ ...baseText, marginTop: 26 }}>
          <h2 style={{ ...baseText, margin: '0 0 8px', color: accent, fontSize: 25, fontWeight: 950 }}>
            أي ملاحظات أو تكلفة
          </h2>
          <div style={{ ...baseText, borderTop: '1px solid #e5e7eb' }}>
            {showCosts ? <DetailRow label="تكلفة الوحدة" value={costValue} ltr /> : null}
            <DetailRow label="ملاحظات" value={report.notes?.trim() || '—'} />
          </div>
        </section>
      ) : null}

      <footer style={{ ...baseText, marginTop: 34, paddingTop: 20, borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'center' }}>
        <div style={{ ...baseText, color: '#64748b', fontSize: 20, fontWeight: 800 }}>
          {doc.footerText || 'تم إنشاء هذا التقرير آليًا من نظام إدارة الإنتاج'}
        </div>
        <div dir="ltr" style={{ ...baseText, ...ltrText, color: accent, fontSize: 20, fontWeight: 950 }}>
          HAKIM {version}
        </div>
      </footer>
    </div>
  );
}

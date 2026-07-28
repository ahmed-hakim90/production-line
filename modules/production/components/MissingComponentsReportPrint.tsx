import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';

export type MissingComponentsReportLine = {
  materialName: string;
  materialCode: string;
  requiredForTarget: number;
  availableQty: number;
  shortageQty: number;
};

export type MissingComponentsReportSection = {
  productId: string;
  productName: string;
  productCode?: string;
  kind: 'none' | 'partial';
  remaining: number;
  maxAssemblable: number;
  lines: MissingComponentsReportLine[];
};

export type MissingComponentsReportPrintProps = {
  title?: string;
  subtitle?: string;
  generatedAt?: string;
  warehouseName?: string;
  sections: MissingComponentsReportSection[];
  printSettings?: PrintTemplateSettings;
};

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const fmt = (value: number) =>
  Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 3,
  });

const kindLabel = (kind: MissingComponentsReportSection['kind']) =>
  (kind === 'none' ? 'بدون مكونات (متاح تجميع 0)' : 'تغطية جزئية');

/**
 * Printable shortage report: summary then products with component lines nested under each product.
 */
export const MissingComponentsReportPrint = React.forwardRef<
  HTMLDivElement,
  MissingComponentsReportPrintProps
>(({ title, subtitle, generatedAt, warehouseName, sections, printSettings }, ref) => {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const palette = getPrintThemePalette(ps);
  const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
  const isThermal = ps.paperSize === 'thermal';
  const now = generatedAt ?? new Date().toLocaleString('ar-EG');
  const productCount = sections.length;
  const lineCount = sections.reduce((sum, row) => sum + row.lines.length, 0);
  const shortageTotal = sections.reduce(
    (sum, row) => sum + row.lines.reduce((s, line) => s + Number(line.shortageQty || 0), 0),
    0,
  );

  const thStyle: React.CSSProperties = {
    border: `1px solid ${palette.border}`,
    padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
    fontSize: isThermal ? '7pt' : '10pt',
    background: palette.tableHeaderBg,
    color: palette.tableHeaderText,
    fontWeight: 800,
  };
  const tdStyle: React.CSSProperties = {
    border: `1px solid ${palette.border}`,
    padding: isThermal ? '1.5mm 1mm' : '2.5mm 2mm',
    fontSize: isThermal ? '7pt' : '10pt',
    color: palette.text,
  };
  const productHeaderStyle: React.CSSProperties = {
    ...tdStyle,
    background: palette.tableHeaderBg,
    fontWeight: 900,
    fontSize: isThermal ? '8pt' : '11pt',
  };

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        fontFamily: 'Calibri, Segoe UI, Tahoma, sans-serif',
        width: paper.width,
        padding: isThermal ? '4mm 3mm' : '10mm 12mm',
        background: '#fff',
        color: palette.text,
        fontSize: isThermal ? '8pt' : '11pt',
        lineHeight: 1.45,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          marginBottom: isThermal ? '3mm' : '6mm',
          borderBottom: `3px solid ${ps.primaryColor}`,
          paddingBottom: isThermal ? '2mm' : '5mm',
        }}
      >
        {ps.logoUrl && (
          <img
            src={ps.logoUrl}
            alt="logo"
            style={{
              maxHeight: isThermal ? '12mm' : '18mm',
              marginBottom: '2mm',
              objectFit: 'contain',
            }}
          />
        )}
        <h1
          style={{
            margin: 0,
            fontSize: isThermal ? '12pt' : '18pt',
            fontWeight: 900,
            color: palette.primary,
          }}
        >
          {ps.headerText}
        </h1>
        <p
          style={{
            margin: '2mm 0 0',
            fontSize: isThermal ? '7pt' : '10pt',
            color: palette.mutedText,
            fontWeight: 600,
          }}
        >
          الإنتاج — تقرير المكونات الناقصة
        </p>
      </div>

      <div style={{ marginBottom: isThermal ? '3mm' : '5mm' }}>
        <h2
          style={{
            margin: 0,
            fontSize: isThermal ? '10pt' : '15pt',
            fontWeight: 800,
            color: palette.text,
          }}
        >
          {title || 'تقرير المكونات الناقصة'}
        </h2>
        {subtitle && (
          <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '10pt', color: palette.mutedText }}>
            {subtitle}
          </p>
        )}
        <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '6pt' : '9pt', color: palette.mutedText }}>
          تاريخ الطباعة: {now}
          {warehouseName ? ` · المخزن: ${warehouseName}` : ''}
        </p>
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: isThermal ? '3mm' : '5mm',
        }}
      >
        <tbody>
          <tr>
            <td style={{ ...tdStyle, fontWeight: 700, width: '22%', background: palette.tableHeaderBg, color: palette.tableHeaderText }}>
              عدد المنتجات
            </td>
            <td style={{ ...tdStyle, fontWeight: 800, width: '12%' }}>{fmt(productCount)}</td>
            <td style={{ ...tdStyle, fontWeight: 700, width: '22%', background: palette.tableHeaderBg, color: palette.tableHeaderText }}>
              بنود ناقصة
            </td>
            <td style={{ ...tdStyle, fontWeight: 800, width: '12%' }}>{fmt(lineCount)}</td>
            <td style={{ ...tdStyle, fontWeight: 700, width: '18%', background: palette.tableHeaderBg, color: palette.tableHeaderText }}>
              إجمالي النقص
            </td>
            <td style={{ ...tdStyle, fontWeight: 800, color: palette.danger }}>{fmt(shortageTotal)}</td>
          </tr>
        </tbody>
      </table>

      {sections.length === 0 ? (
        <p style={{ color: palette.mutedText, fontWeight: 600 }}>لا توجد مكونات ناقصة للطباعة.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'right', width: '38%' }}>المكوّن / المنتج</th>
              <th style={{ ...thStyle, textAlign: 'center', width: '14%' }}>الكود</th>
              <th style={{ ...thStyle, textAlign: 'center', width: '16%' }}>مطلوب للخطة</th>
              <th style={{ ...thStyle, textAlign: 'center', width: '16%' }}>متاح</th>
              <th style={{ ...thStyle, textAlign: 'center', width: '16%' }}>ناقص</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, index) => {
              const productShortage = section.lines.reduce(
                (sum, line) => sum + Number(line.shortageQty || 0),
                0,
              );
              return (
                <React.Fragment key={`${section.kind}-${section.productId}`}>
                  <tr>
                    <td style={productHeaderStyle} colSpan={2}>
                      {index + 1}. {section.productName}
                      <span style={{ display: 'block', fontSize: isThermal ? '6pt' : '8pt', fontWeight: 600, color: palette.mutedText, marginTop: '1mm' }}>
                        {section.productCode || section.productId}
                        {' · '}
                        {kindLabel(section.kind)}
                        {' · '}
                        متبقي خطة {fmt(section.remaining)}
                        {' · '}
                        متاح تجميع {fmt(section.maxAssemblable)}
                      </span>
                    </td>
                    <td style={{ ...productHeaderStyle, textAlign: 'center' }} colSpan={2}>
                      {section.lines.length} بند ناقص
                    </td>
                    <td style={{ ...productHeaderStyle, textAlign: 'center', color: palette.danger }}>
                      {fmt(productShortage)}
                    </td>
                  </tr>
                  {section.lines.length === 0 ? (
                    <tr>
                      <td style={{ ...tdStyle, color: palette.mutedText }} colSpan={5}>
                        لا توجد تفاصيل مكوّنات — راجع تعريف BOM.
                      </td>
                    </tr>
                  ) : (
                    section.lines.map((line, lineIndex) => (
                      <tr
                        key={`${section.productId}-${line.materialCode}-${lineIndex}`}
                        style={{ background: lineIndex % 2 === 1 ? palette.tableRowAltBg : '#fff' }}
                      >
                        <td style={{ ...tdStyle, textAlign: 'right', paddingInlineStart: isThermal ? '3mm' : '5mm' }}>
                          {line.materialName}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText }}>
                          {line.materialCode || '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(line.requiredForTarget)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(line.availableQty)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'center',
                            fontWeight: 800,
                            color: palette.danger,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmt(line.shortageQty)}
                        </td>
                      </tr>
                    ))
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {ps.footerText && (
        <p
          style={{
            marginTop: isThermal ? '4mm' : '8mm',
            paddingTop: '3mm',
            borderTop: `1px solid ${palette.border}`,
            fontSize: isThermal ? '6pt' : '9pt',
            color: palette.mutedText,
            textAlign: 'center',
          }}
        >
          {ps.footerText}
        </p>
      )}
    </div>
  );
});

MissingComponentsReportPrint.displayName = 'MissingComponentsReportPrint';

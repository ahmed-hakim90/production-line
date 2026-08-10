import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { PrintExtraLines } from '@/src/components/erp/PrintExtraLines';

export type ProductBomCountCardLine = {
  itemId?: string;
  itemCode: string;
  itemName: string;
  unit: string;
  qtyPerUnit: number;
  /** Resolved shelf/location code for warehouse counting. */
  locationCode?: string;
  /** Warehouse on-hand quantity (system). */
  stockQty?: number;
  /** Available quantity (availableQty ?? quantity). */
  availableQty?: number;
};

export type ProductBomCountCard = {
  productId: string;
  productCode: string;
  productName: string;
  category?: string;
  warehouseId?: string;
  warehouseName?: string;
  lines: ProductBomCountCardLine[];
};

export interface ProductBomCountCardPrintProps {
  cards: ProductBomCountCard[];
  printSettings?: PrintTemplateSettings;
  printedAt?: string;
  /** When true (default if any card has warehouse), show stock/available columns. */
  showStock?: boolean;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const formatQty = (value: number | undefined) =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });

const summaryPairRow = (
  leftLabel: string,
  leftValue: string,
  rightLabel?: string,
  rightValue?: string,
  even?: boolean,
) => (
  <tr style={{ background: even ? 'var(--print-row-alt, #f8fafc)' : '#ffffff' }}>
    <td
      style={{
        padding: '3mm 4mm',
        width: '18%',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        color: 'var(--print-muted-text, #475569)',
        fontWeight: 700,
      }}
    >
      {leftLabel}
    </td>
    <td
      style={{
        padding: '3mm 4mm',
        width: '32%',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        color: 'var(--print-text, #0f172a)',
        fontWeight: 700,
      }}
    >
      {leftValue}
    </td>
    <td
      style={{
        padding: '3mm 4mm',
        width: '18%',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        color: 'var(--print-muted-text, #475569)',
        fontWeight: 700,
      }}
    >
      {rightLabel || ''}
    </td>
    <td
      style={{
        padding: '3mm 4mm',
        width: '32%',
        borderBottom: '1px solid var(--print-border, #e2e8f0)',
        color: 'var(--print-text, #0f172a)',
        fontWeight: 700,
      }}
    >
      {rightValue || ''}
    </td>
  </tr>
);

const blankCell = (minHeight = '8mm') => (
  <span
    style={{
      display: 'inline-block',
      width: '100%',
      minHeight,
      borderBottom: '1px solid #94a3b8',
    }}
  />
);

export const ProductBomCountCardPrint = React.forwardRef<HTMLDivElement, ProductBomCountCardPrintProps>(
  ({ cards, printSettings, printedAt, showStock }, ref) => {
    if (!cards.length) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'productBomCountCard');
    const palette = getPrintThemePalette(ps);
    const font = resolvePrintFont(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const includeStock =
      (showStock ?? cards.some((card) => Boolean(card.warehouseId || card.warehouseName)))
      && doc.isFieldVisible('stock');
    const brandName = String(doc.headerText || '').trim() || ps.headerText;
    const footerText = String(doc.footerText || '').trim() || ps.footerText;
    const printedLabel =
      printedAt ||
      new Date().toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

    const thStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: '2mm 1.5mm',
      fontSize: isThermal ? '6.5pt' : includeStock ? '8.5pt' : '10pt',
      background: palette.tableHeaderBg,
      color: palette.tableHeaderText,
    };
    const tdStyle: React.CSSProperties = {
      border: `1px solid ${palette.border}`,
      padding: '2mm 1.5mm',
      fontSize: isThermal ? '6.5pt' : includeStock ? '8.5pt' : '10pt',
    };

    return (
      <div ref={ref}>
        {cards.map((card, cardIndex) => (
          <div
            key={card.productId}
            dir="rtl"
            className="print-root print-report arabic-export-root"
            style={{
              fontFamily: font.fontFamily,
              width: paper.width,
              minHeight: paper.minHeight,
              padding: isThermal ? '4mm 3mm' : '10mm 12mm',
              background: '#fff',
              color: palette.text,
              ['--print-text' as string]: palette.text,
              ['--print-muted-text' as string]: palette.mutedText,
              ['--print-border' as string]: palette.border,
              ['--print-row-alt' as string]: palette.tableRowAltBg,
              fontSize: isThermal ? font.denseFontSize : font.fontSize,
              lineHeight: 1.5,
              boxSizing: 'border-box',
              pageBreakAfter: cardIndex < cards.length - 1 ? 'always' : 'auto',
              breakAfter: cardIndex < cards.length - 1 ? 'page' : 'auto',
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
                  color: ps.primaryColor,
                }}
              >
                {brandName}
              </h1>
              <p
                style={{
                  margin: '2mm 0 0',
                  fontSize: isThermal ? '10pt' : '16pt',
                  fontWeight: 900,
                  color: palette.mutedText,
                }}
              >
                كارت جرد صنف
              </p>
            </div>

            <PrintExtraLines lines={doc.customLines} dense={isThermal} />

            <table
              className="erp-table"
              style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '6mm' }}
            >
              <tbody>
                {summaryPairRow('المنتج', card.productName, 'الكود', card.productCode || '—')}
                {summaryPairRow(
                  'التصنيف',
                  doc.isFieldVisible('category') ? (card.category || '—') : '—',
                  'تاريخ الطباعة',
                  printedLabel,
                  true,
                )}
                {summaryPairRow(
                  'المخزن',
                  doc.isFieldVisible('warehouse') ? (card.warehouseName || '……………………') : '—',
                  'عدد المنتجات المعدودة',
                  '……………………',
                )}
                {summaryPairRow(
                  'عدد المكونات',
                  String(card.lines.length),
                  'ملاحظات عامة',
                  '……………………',
                  true,
                )}
              </tbody>
            </table>

            <h2
              style={{
                margin: 0,
                marginBottom: '3mm',
                fontSize: isThermal ? '9pt' : '12pt',
                fontWeight: 900,
                color: '#0f172a',
              }}
            >
              مكونات الـ BOM (لكل وحدة منتج)
              {includeStock ? ' — مع رصيد النظام' : ''}
            </h2>

            <table
              className="erp-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                marginBottom: isThermal ? '3mm' : '6mm',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: includeStock ? '5%' : '7%' }}>م</th>
                  <th style={{ ...thStyle, width: includeStock ? '14%' : '18%' }}>اللوكيشن</th>
                  <th style={{ ...thStyle, width: includeStock ? '20%' : '28%' }}>المكون</th>
                  <th style={{ ...thStyle, width: includeStock ? '8%' : '10%' }}>الوحدة</th>
                  <th style={{ ...thStyle, width: includeStock ? '10%' : '13%' }}>كمية BOM</th>
                  {includeStock && (
                    <>
                      <th style={{ ...thStyle, width: '10%' }}>الرصيد</th>
                      <th style={{ ...thStyle, width: '10%' }}>المتاح</th>
                    </>
                  )}
                  <th style={{ ...thStyle, width: includeStock ? '12%' : '13%' }}>الكمية الفعلية</th>
                  <th style={{ ...thStyle, width: includeStock ? '11%' : '11%' }}>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {card.lines.map((line, index) => (
                  <tr
                    key={`${card.productId}-${line.itemCode}-${index}`}
                    style={{ background: index % 2 ? palette.tableRowAltBg : '#fff' }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'center', fontWeight: 700 }}>
                      {line.locationCode || '—'}
                    </td>
                    <td style={tdStyle}>{line.itemName || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{line.unit || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                      {formatQty(line.qtyPerUnit)}
                    </td>
                    {includeStock && (
                      <>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                          {formatQty(line.stockQty)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                          {formatQty(line.availableQty)}
                        </td>
                      </>
                    )}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{blankCell()}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{blankCell()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {doc.isFieldVisible('signatures') ? (
            <div
              style={{
                marginTop: isThermal ? '6mm' : '10mm',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8mm',
              }}
            >
              {['الجارد', 'مراجع المخزن', 'المعتمد'].map((title) => (
                <div key={title} style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 900, color: palette.mutedText }}>{title}</p>
                  <div style={{ marginTop: '12mm', borderTop: `1px solid ${palette.border}` }} />
                </div>
              ))}
            </div>
            ) : null}
            {footerText ? (
              <p style={{ marginTop: '4mm', textAlign: 'center', fontSize: isThermal ? '6pt' : '9pt', color: palette.mutedText, fontWeight: 700 }}>
                {footerText}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    );
  },
);

ProductBomCountCardPrint.displayName = 'ProductBomCountCardPrint';

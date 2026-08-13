import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import {
  FactoryPrintTable,
  type FactoryPrintTableRow,
} from '@/src/components/erp/FactoryPrintTable';

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
 * Printable shortage report — engine chrome.
 */
export const MissingComponentsReportPrint = React.forwardRef<
  HTMLDivElement,
  MissingComponentsReportPrintProps
>(({ title, subtitle, generatedAt, warehouseName, sections, printSettings }, ref) => {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const doc = resolvePrintDocumentConfig(ps, 'missingComponentsReport');
  const font = resolvePrintFont(ps);
  const accent = resolvePrintAccentHex(ps.primaryColor);
  const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
  const isThermal = ps.paperSize === 'thermal';
  const now = generatedAt ?? new Date().toLocaleString('ar-EG');
  const productCount = sections.length;
  const lineCount = sections.reduce((sum, row) => sum + row.lines.length, 0);
  const shortageTotal = sections.reduce(
    (sum, row) => sum + row.lines.reduce((s, line) => s + Number(line.shortageQty || 0), 0),
    0,
  );
  const brandName = String(doc.headerText || '').trim() || ps.headerText || 'الشركة';
  const footerText = String(doc.footerText || '').trim() || Factory_DEFAULT_FOOTER_TAGLINE;

  const flatRows: FactoryPrintTableRow[] = sections.flatMap(
    (section, index): FactoryPrintTableRow[] => {
      const productShortage = section.lines.reduce(
        (sum, line) => sum + Number(line.shortageQty || 0),
        0,
      );
      const headerRow: FactoryPrintTableRow = {
        key: `product-${section.productId}`,
        cells: {
          name: (
            <span>
              <strong>
                {index + 1}. {section.productName}
              </strong>
              <br />
              <span style={{ fontSize: 9, fontWeight: 600, color: '#64748b' }}>
                {section.productCode || section.productId}
                {' · '}
                {kindLabel(section.kind)}
                {' · '}
                متبقي خطة {fmt(section.remaining)}
                {' · '}
                متاح تجميع {fmt(section.maxAssemblable)}
              </span>
            </span>
          ),
          code: `${section.lines.length} بند`,
          required: '—',
          available: '—',
          shortage: <strong style={{ color: '#dc2626' }}>{fmt(productShortage)}</strong>,
        },
      };
      if (section.lines.length === 0) {
        return [
          headerRow,
          {
            key: `empty-${section.productId}`,
            cells: {
              name: 'لا توجد تفاصيل مكوّنات — راجع تعريف BOM.',
              code: '—',
              required: '—',
              available: '—',
              shortage: '—',
            },
          },
        ];
      }
      return [
        headerRow,
        ...section.lines.map(
          (line, lineIndex): FactoryPrintTableRow => ({
            key: `${section.productId}-${line.materialCode}-${lineIndex}`,
            cells: {
              name: line.materialName,
              code: line.materialCode || '—',
              required: fmt(line.requiredForTarget),
              available: fmt(line.availableQty),
              shortage: <strong style={{ color: '#dc2626' }}>{fmt(line.shortageQty)}</strong>,
            },
          }),
        ),
      ];
    },
  );

  return (
    <FactoryPrintShell
      ref={ref}
      companyName={brandName}
      documentType={title || 'تقرير المكونات الناقصة'}
      printDate={now}
      logoUrl={ps.logoUrl}
      brandAccent={accent}
      footerTagline={footerText}
      paperWidth={paper.width}
      minHeight={paper.minHeight}
      padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
      dense={isThermal}
      fontFamily={font.fontFamily}
      fontSize={isThermal ? font.denseFontSize : font.fontSize}
      extraLines={doc.customLines}
      metaCards={[
        ...(subtitle ? [{ label: 'الوصف', value: subtitle }] : []),
        ...(doc.isFieldVisible('warehouse') && warehouseName
          ? [{ label: 'المخزن', value: warehouseName }]
          : []),
      ]}
      kpis={[
        { label: 'عدد المنتجات', value: productCount, tone: 'indigo' as const },
        { label: 'بنود ناقصة', value: lineCount },
        { label: 'إجمالي النقص', value: fmt(shortageTotal), tone: 'red' as const },
      ]}
    >
      {sections.length === 0 ? (
        <p style={{ color: '#64748b', fontWeight: 600 }}>لا توجد مكونات ناقصة للطباعة.</p>
      ) : (
        <>
          <FactoryPrintSectionTitle title="تفاصيل النقص حسب المنتج" />
          <FactoryPrintTable
            dense={isThermal}
            brandAccent={accent}
            printSettings={ps}
            columns={[
              { key: 'name', header: 'المكوّن / المنتج', width: '38%' },
              { key: 'code', header: 'الكود', width: '14%', align: 'center' },
              { key: 'required', header: 'مطلوب للخطة', width: '16%', align: 'center' },
              { key: 'available', header: 'متاح', width: '16%', align: 'center' },
              { key: 'shortage', header: 'ناقص', width: '16%', align: 'center' },
            ]}
            rows={flatRows}
          />
        </>
      )}
    </FactoryPrintShell>
  );
});

MissingComponentsReportPrint.displayName = 'MissingComponentsReportPrint';

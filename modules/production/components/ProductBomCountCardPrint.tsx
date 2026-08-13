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
  FactoryPrintTableAccentValue,
} from '@/src/components/erp/FactoryPrintTable';

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

export const ProductBomCountCardPrint = React.forwardRef<HTMLDivElement, ProductBomCountCardPrintProps>(
  ({ cards, printSettings, printedAt, showStock }, ref) => {
    if (!cards.length) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'productBomCountCard');
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const font = resolvePrintFont(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const includeStock =
      (showStock ?? cards.some((card) => Boolean(card.warehouseId || card.warehouseName))) &&
      doc.isFieldVisible('stock');
    const brandName = String(doc.headerText || '').trim() || ps.headerText || 'الشركة';
    const footerText = String(doc.footerText || '').trim() || Factory_DEFAULT_FOOTER_TAGLINE;
    const printedLabel =
      printedAt ||
      new Date().toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

    const bomColumns = [
      { key: 'idx', header: 'م', width: includeStock ? '5%' : '7%', align: 'center' as const },
      { key: 'location', header: 'اللوكيشن', width: includeStock ? '14%' : '18%', align: 'center' as const },
      { key: 'name', header: 'المكون', width: includeStock ? '20%' : '28%' },
      { key: 'unit', header: 'الوحدة', width: includeStock ? '8%' : '10%', align: 'center' as const },
      { key: 'bomQty', header: 'كمية BOM', width: includeStock ? '10%' : '13%', align: 'center' as const },
      ...(includeStock
        ? [
            { key: 'stock', header: 'الرصيد', width: '10%', align: 'center' as const },
            { key: 'available', header: 'المتاح', width: '10%', align: 'center' as const },
          ]
        : []),
      {
        key: 'actual',
        header: 'الكمية الفعلية',
        width: includeStock ? '12%' : '13%',
        align: 'center' as const,
        blank: true as const,
      },
      {
        key: 'notes',
        header: 'ملاحظات',
        width: includeStock ? '11%' : '11%',
        align: 'center' as const,
        blank: true as const,
      },
    ];

    return (
      <div ref={ref}>
        {cards.map((card, cardIndex) => (
          <div
            key={card.productId}
            style={{
              pageBreakAfter: cardIndex < cards.length - 1 ? 'always' : 'auto',
              breakAfter: cardIndex < cards.length - 1 ? 'page' : 'auto',
            }}
          >
            <FactoryPrintShell
              exportRootId={`product-bom-count-${card.productId}`}
              companyName={brandName}
              documentType="كارت جرد صنف"
              printDate={printedLabel}
              logoUrl={ps.logoUrl}
              brandAccent={accent}
              footerTagline={footerText}
              extraLines={doc.customLines}
              paperWidth={paper.width}
              minHeight={paper.minHeight}
              padding={isThermal ? '4mm 3mm' : '10mm 12mm'}
              dense={isThermal}
              fontFamily={font.fontFamily}
              fontSize={isThermal ? font.denseFontSize : font.fontSize}
              metaCards={[
                { label: 'المنتج', value: card.productName || '—' },
                { label: 'الكود', value: card.productCode || '—' },
                {
                  label: 'التصنيف',
                  value: doc.isFieldVisible('category') ? card.category || '—' : '—',
                },
                {
                  label: 'المخزن',
                  value: doc.isFieldVisible('warehouse') ? card.warehouseName || '……………………' : '—',
                },
                { label: 'عدد المكونات', value: String(card.lines.length) },
                { label: 'تاريخ الطباعة', value: printedLabel },
              ]}
              signatures={
                doc.isFieldVisible('signatures')
                  ? [{ title: 'الجارد' }, { title: 'مراجع المخزن' }, { title: 'المعتمد' }]
                  : undefined
              }
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isThermal ? '1fr' : '1fr 1fr',
                  gap: isThermal ? '2mm' : '3mm',
                  marginBottom: isThermal ? '3mm' : '5mm',
                }}
              >
                {[
                  { label: 'عدد المنتجات المعدودة' },
                  { label: 'ملاحظات عامة' },
                ].map((field) => (
                  <div
                    key={field.label}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '2.5mm',
                      padding: isThermal ? '2mm' : '3mm',
                      background: '#fff',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, color: '#64748b' }}>
                      {field.label}
                    </p>
                    <div
                      style={{
                        marginTop: isThermal ? '4mm' : '6mm',
                        borderBottom: '1px solid #94a3b8',
                        minHeight: isThermal ? '5mm' : '7mm',
                      }}
                      aria-label={`${field.label} — خانة يدوية`}
                    />
                  </div>
                ))}
              </div>

              <FactoryPrintSectionTitle
                title={`مكونات الـ BOM (لكل وحدة منتج)${includeStock ? ' — مع رصيد النظام' : ''}`}
                accent={accent}
              />
              <FactoryPrintTable
                brandAccent={accent}
                printSettings={ps}
                dense={isThermal}
                columns={bomColumns}
                rows={card.lines.map((line, index) => ({
                  key: `${card.productId}-${line.itemCode}-${index}`,
                  cells: {
                    idx: index + 1,
                    location: (
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{line.locationCode || '—'}</span>
                    ),
                    name: line.itemName || '—',
                    unit: line.unit || '—',
                    bomQty: (
                      <FactoryPrintTableAccentValue accent={accent}>{formatQty(line.qtyPerUnit)}</FactoryPrintTableAccentValue>
                    ),
                    ...(includeStock
                      ? {
                          stock: formatQty(line.stockQty),
                          available: formatQty(line.availableQty),
                        }
                      : {}),
                  },
                }))}
              />
            </FactoryPrintShell>
          </div>
        ))}
      </div>
    );
  },
);

ProductBomCountCardPrint.displayName = 'ProductBomCountCardPrint';

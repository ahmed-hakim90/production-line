import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import { itemTypeLabel } from '../lib/stockLabels';
import { movementFateLabel, movementPathLabel } from '../lib/itemMovementTrace';
import type { InventoryItemType, StockItemBalance, StockTransaction } from '../types';

export type ItemCardBomLine = {
  itemCode: string;
  itemName: string;
  unit: string;
  qtyPerUnit: number;
  stockQty?: number;
};

export type ItemCardPrintModel = {
  itemType: InventoryItemType;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit?: string;
  category?: string;
  warehouseName?: string;
  balances: Array<Pick<StockItemBalance, 'warehouseId' | 'quantity' | 'availableQty' | 'reservedQty' | 'minStock'> & {
    warehouseName: string;
  }>;
  bomLines: ItemCardBomLine[];
  movements: StockTransaction[];
};

type Props = {
  card: ItemCardPrintModel | null;
  printSettings?: PrintTemplateSettings;
  printedAt?: string;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });

export const ItemCardPrint = React.forwardRef<HTMLDivElement, Props>(
  ({ card, printSettings, printedAt }, ref) => {
    if (!card) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'itemCard');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const when = printedAt || new Date().toLocaleString('ar-EG');
    const totalQty = card.balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const showBalances = doc.isFieldVisible('balances');
    const showBom = doc.isFieldVisible('bom');
    const showMovements = doc.isFieldVisible('movements');
    const showCategory = doc.isFieldVisible('category');
    const showWarehouse = doc.isFieldVisible('warehouse');
    const showBomStock = card.bomLines.some((line) => line.stockQty != null);

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={doc.headerText || card.itemName}
        documentType="كارت الصنف"
        printDate={when}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        paperWidth="210mm"
        minHeight="297mm"
        padding="10mm 12mm"
        fontFamily={font.fontFamily}
        fontSize={font.fontSize}
        extraLines={doc.customLines}
        metaCards={[
          { label: 'الكود', value: card.itemCode || '—' },
          { label: 'النوع', value: itemTypeLabel(card.itemType) },
          { label: 'الوحدة', value: card.unit || '—' },
          ...(showCategory ? [{ label: 'التصنيف', value: card.category || '—' }] : []),
          ...(showWarehouse && card.warehouseName
            ? [{ label: 'المخزن', value: card.warehouseName }]
            : []),
        ]}
        kpis={[
          { label: 'إجمالي الرصيد', value: fmt(totalQty), tone: 'indigo' as const },
          { label: 'عدد المخازن', value: card.balances.length },
          { label: 'مكونات BOM', value: card.bomLines.length },
          { label: 'الحركات', value: card.movements.length },
        ]}
      >
        {doc.headerText ? (
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>{card.itemName}</p>
        ) : null}

        {showBalances ? (
          <>
            <FactoryPrintSectionTitle title="الأرصدة حسب المخزن" />
            {card.balances.length === 0 ? (
              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 11 }}>لا يوجد رصيد لهذا الصنف.</p>
            ) : (
              <FactoryPrintTable
                brandAccent={accent}
                printSettings={ps}
                columns={[
                  { key: 'warehouse', header: 'المخزن' },
                  { key: 'qty', header: 'الرصيد', width: '14%', align: 'center' },
                  { key: 'reserved', header: 'محجوز', width: '14%', align: 'center' },
                  { key: 'available', header: 'متاح', width: '14%', align: 'center' },
                  { key: 'min', header: 'الحد الأدنى', width: '14%', align: 'center' },
                ]}
                rows={card.balances.map((row) => ({
                  key: `${row.warehouseId}-${row.warehouseName}`,
                  cells: {
                    warehouse: row.warehouseName,
                    qty: fmt(Number(row.quantity || 0)),
                    reserved: fmt(Number(row.reservedQty || 0)),
                    available: fmt(Number(row.availableQty ?? row.quantity ?? 0)),
                    min: fmt(Number(row.minStock || 0)),
                  },
                }))}
              />
            )}
          </>
        ) : null}

        {showBom ? (
          <>
            <FactoryPrintSectionTitle title="المكونات (BOM)" />
            {card.bomLines.length === 0 ? (
              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 11 }}>لا توجد مكونات مرتبطة بهذا الصنف.</p>
            ) : (
              <FactoryPrintTable
                brandAccent={accent}
                printSettings={ps}
                columns={[
                  { key: 'code', header: 'كود المكون', width: '18%' },
                  { key: 'name', header: 'اسم المكون' },
                  { key: 'qty', header: 'الكمية / وحدة', width: '16%', align: 'center' },
                  { key: 'unit', header: 'الوحدة', width: '12%', align: 'center' },
                  ...(showBomStock
                    ? [{ key: 'stock', header: 'رصيد المخزن', width: '14%', align: 'center' as const }]
                    : []),
                ]}
                rows={card.bomLines.map((line, index) => ({
                  key: `${line.itemCode}-${index}`,
                  cells: {
                    code: line.itemCode || '—',
                    name: line.itemName || '—',
                    qty: fmt(line.qtyPerUnit),
                    unit: line.unit || '—',
                    stock: line.stockQty == null ? '—' : fmt(line.stockQty),
                  },
                }))}
              />
            )}
          </>
        ) : null}

        {showMovements ? (
          <>
            <FactoryPrintSectionTitle title="آخر الحركات" />
            {card.movements.length === 0 ? (
              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 11 }}>لا توجد حركات لهذا الصنف.</p>
            ) : (
              <FactoryPrintTable
                brandAccent={accent}
                printSettings={ps}
                dense
                columns={[
                  { key: 'date', header: 'التاريخ', width: '18%' },
                  { key: 'ref', header: 'المرجع', width: '18%' },
                  { key: 'path', header: 'المسار' },
                  { key: 'qty', header: 'الكمية', width: '12%', align: 'center' },
                  { key: 'fate', header: 'الحالة', width: '16%' },
                ]}
                rows={card.movements.slice(0, 40).map((tx) => ({
                  key: tx.id || `${tx.createdAt}-${tx.referenceNo}`,
                  cells: {
                    date: String(tx.createdAt || '').slice(0, 16).replace('T', ' ') || '—',
                    ref: tx.referenceNo || tx.sourceId || '—',
                    path: movementPathLabel(tx),
                    qty: `${tx.movementType === 'OUT' ? '−' : tx.movementType === 'IN' ? '+' : ''}${fmt(Math.abs(Number(tx.quantity || 0)))}`,
                    fate: movementFateLabel(tx),
                  },
                }))}
              />
            )}
          </>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

ItemCardPrint.displayName = 'ItemCardPrint';

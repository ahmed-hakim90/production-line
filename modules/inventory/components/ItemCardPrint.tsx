import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
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
    const palette = getPrintThemePalette(ps);
    const when = printedAt || new Date().toLocaleString('ar-EG');
    const totalQty = card.balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          width: '210mm',
          minHeight: '297mm',
          margin: '0 auto',
          padding: '10mm',
          background: '#fff',
          color: palette.text,
          fontFamily: 'Tahoma, Arial, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            border: `2px solid ${palette.primary}`,
            borderRadius: '4mm',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: palette.primary,
              color: '#fff',
              padding: '4mm 5mm',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '4mm',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <div style={{ fontSize: '16pt', fontWeight: 800 }}>كارت الصنف</div>
              <div style={{ fontSize: '10pt', opacity: 0.95, marginTop: '1mm' }}>
                {card.itemName}
              </div>
            </div>
            <div style={{ textAlign: 'left', fontSize: '9pt', opacity: 0.95 }}>
              <div>{when}</div>
              {card.warehouseName ? <div>{card.warehouseName}</div> : null}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
            <tbody>
              <tr>
                <td style={labelCell}>الكود</td>
                <td style={valueCell}>{card.itemCode || '—'}</td>
                <td style={labelCell}>النوع</td>
                <td style={valueCell}>{itemTypeLabel(card.itemType)}</td>
              </tr>
              <tr>
                <td style={labelCell}>الوحدة</td>
                <td style={valueCell}>{card.unit || '—'}</td>
                <td style={labelCell}>التصنيف</td>
                <td style={valueCell}>{card.category || '—'}</td>
              </tr>
              <tr>
                <td style={labelCell}>إجمالي الرصيد</td>
                <td style={valueCell} colSpan={3}>{fmt(totalQty)}</td>
              </tr>
            </tbody>
          </table>

          <SectionTitle title="الأرصدة حسب المخزن" color={palette.primary} />
          {card.balances.length === 0 ? (
            <EmptyNote text="لا يوجد رصيد لهذا الصنف." />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>المخزن</th>
                  <th style={thStyle}>الرصيد</th>
                  <th style={thStyle}>محجوز</th>
                  <th style={thStyle}>متاح</th>
                  <th style={thStyle}>الحد الأدنى</th>
                </tr>
              </thead>
              <tbody>
                {card.balances.map((row) => (
                  <tr key={`${row.warehouseId}-${row.warehouseName}`}>
                    <td style={tdStyle}>{row.warehouseName}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{fmt(Number(row.quantity || 0))}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{fmt(Number(row.reservedQty || 0))}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(Number(row.availableQty ?? row.quantity ?? 0))}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{fmt(Number(row.minStock || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <SectionTitle title="المكونات (BOM)" color={palette.primary} />
          {card.bomLines.length === 0 ? (
            <EmptyNote text="لا توجد مكونات مرتبطة بهذا الصنف." />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>كود المكون</th>
                  <th style={thStyle}>اسم المكون</th>
                  <th style={thStyle}>الكمية / وحدة</th>
                  <th style={thStyle}>الوحدة</th>
                  {card.bomLines.some((line) => line.stockQty != null) ? (
                    <th style={thStyle}>رصيد المخزن</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {card.bomLines.map((line, index) => (
                  <tr key={`${line.itemCode}-${index}`}>
                    <td style={tdStyle}>{line.itemCode || '—'}</td>
                    <td style={tdStyle}>{line.itemName || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{fmt(line.qtyPerUnit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{line.unit || '—'}</td>
                    {card.bomLines.some((row) => row.stockQty != null) ? (
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {line.stockQty == null ? '—' : fmt(line.stockQty)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <SectionTitle title="آخر الحركات" color={palette.primary} />
          {card.movements.length === 0 ? (
            <EmptyNote text="لا توجد حركات لهذا الصنف." />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>التاريخ</th>
                  <th style={thStyle}>المرجع</th>
                  <th style={thStyle}>المسار</th>
                  <th style={thStyle}>الكمية</th>
                  <th style={thStyle}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {card.movements.slice(0, 40).map((tx) => (
                  <tr key={tx.id || `${tx.createdAt}-${tx.referenceNo}`}>
                    <td style={tdStyle}>
                      {String(tx.createdAt || '').slice(0, 16).replace('T', ' ') || '—'}
                    </td>
                    <td style={tdStyle}>{tx.referenceNo || tx.sourceId || '—'}</td>
                    <td style={tdStyle}>{movementPathLabel(tx)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {tx.movementType === 'OUT' ? '−' : tx.movementType === 'IN' ? '+' : ''}
                      {fmt(Math.abs(Number(tx.quantity || 0)))}
                    </td>
                    <td style={tdStyle}>{movementFateLabel(tx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  },
);

ItemCardPrint.displayName = 'ItemCardPrint';

const labelCell: React.CSSProperties = {
  padding: '2.5mm 3mm',
  width: '18%',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  fontWeight: 700,
  color: '#475569',
};

const valueCell: React.CSSProperties = {
  padding: '2.5mm 3mm',
  width: '32%',
  borderBottom: '1px solid #e2e8f0',
  fontWeight: 700,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '9pt',
};

const thStyle: React.CSSProperties = {
  padding: '2mm 2.5mm',
  background: '#f1f5f9',
  borderBottom: '1px solid #cbd5e1',
  textAlign: 'right',
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: '2mm 2.5mm',
  borderBottom: '1px solid #e2e8f0',
  textAlign: 'right',
};

const SectionTitle: React.FC<{ title: string; color: string }> = ({ title, color }) => (
  <div
    style={{
      padding: '3mm 4mm 2mm',
      fontWeight: 800,
      fontSize: '11pt',
      color,
      borderTop: '1px solid #e2e8f0',
    }}
  >
    {title}
  </div>
);

const EmptyNote: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ padding: '2mm 4mm 4mm', color: '#64748b', fontSize: '9pt' }}>{text}</div>
);

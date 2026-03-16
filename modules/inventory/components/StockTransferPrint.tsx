import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';

export interface StockTransferPrintData {
  transferNo: string;
  createdAt: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  items?: Array<{
    itemName: string;
    itemCode: string;
    unitLabel: string;
    quantity: number;
    quantityPieces: number;
    unitsPerCarton?: number;
  }>;
  itemName?: string;
  itemCode?: string;
  quantityPieces?: number;
  quantityCartons?: number;
  unitsPerCarton?: number;
  note?: string;
  createdBy: string;
}

export interface StockTransferPrintProps {
  data: StockTransferPrintData | null;
  printSettings?: PrintTemplateSettings;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

const detailRow = (label: string, value: string, even?: boolean) => (
  <tr style={{ background: even ? 'var(--print-row-alt, #f8fafc)' : '#ffffff' }}>
    <td style={{ padding: '3mm 4mm', width: '35%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {label}
    </td>
    <td style={{ padding: '3mm 4mm', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-text, #0f172a)', fontWeight: 700 }}>
      {value}
    </td>
  </tr>
);

const summaryPairRow = (
  leftLabel: string,
  leftValue: string,
  rightLabel?: string,
  rightValue?: string,
  even?: boolean,
) => (
  <tr style={{ background: even ? 'var(--print-row-alt, #f8fafc)' : '#ffffff' }}>
    <td style={{ padding: '3mm 4mm', width: '18%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {leftLabel}
    </td>
    <td style={{ padding: '3mm 4mm', width: '32%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-text, #0f172a)', fontWeight: 700 }}>
      {leftValue}
    </td>
    <td style={{ padding: '3mm 4mm', width: '18%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-muted-text, #475569)', fontWeight: 700 }}>
      {rightLabel || ''}
    </td>
    <td style={{ padding: '3mm 4mm', width: '32%', borderBottom: '1px solid var(--print-border, #e2e8f0)', color: 'var(--print-text, #0f172a)', fontWeight: 700 }}>
      {rightValue || ''}
    </td>
  </tr>
);

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const printedAt = new Date().toLocaleString('ar-EG');
    const transferItems = data.items && data.items.length > 0
      ? data.items
      : (data.itemName
        ? [{
            itemName: data.itemName,
            itemCode: data.itemCode || '—',
            unitLabel: data.quantityCartons != null ? 'كرتونة' : 'قطعة',
            quantity: data.quantityCartons ?? data.quantityPieces ?? 0,
            quantityPieces: data.quantityPieces ?? 0,
            unitsPerCarton: data.unitsPerCarton,
          }]
        : []);
    const totalPieces = transferItems.reduce((sum, item) => sum + Number(item.quantityPieces || 0), 0);
    const totalCartons = transferItems
      .filter((item) => item.unitLabel === 'كرتونة')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalLoosePieces = transferItems
      .filter((item) => item.unitLabel === 'قطعة')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const hasLoosePieces = totalLoosePieces > 0;
    const movementDate = new Date(data.createdAt).toLocaleDateString('ar-EG');
    const transferTitle = `إذن تحويل ${data.fromWarehouseName || 'مخزني'}`;

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: "'Calibri', 'Segoe UI', 'Tahoma', 'Arial', sans-serif",
          width: paper.width,
          minHeight: paper.minHeight,
          padding: isThermal ? '4mm 3mm' : '12mm 15mm',
          background: '#fff',
          color: palette.text,
          ['--print-text' as any]: palette.text,
          ['--print-muted-text' as any]: palette.mutedText,
          ['--print-border' as any]: palette.border,
          ['--print-th-bg' as any]: palette.tableHeaderBg,
          ['--print-th-text' as any]: palette.tableHeaderText,
          ['--print-row-alt' as any]: palette.tableRowAltBg,
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: isThermal ? '3mm' : '8mm', borderBottom: `3px solid ${ps.primaryColor}`, paddingBottom: isThermal ? '2mm' : '6mm' }}>
          {ps.logoUrl && (
            <img src={ps.logoUrl} alt="logo" style={{ maxHeight: isThermal ? '12mm' : '20mm', marginBottom: '2mm', objectFit: 'contain' }} />
          )}
          <h1 style={{ margin: 0, fontSize: isThermal ? '12pt' : '20pt', fontWeight: 900, color: ps.primaryColor }}>
            {ps.headerText}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '10pt' : '18pt', fontWeight: 900, color: palette.mutedText }}>
            {transferTitle}
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: isThermal ? '4mm' : '8mm' }}>
          <tbody>
            {summaryPairRow('رقم التحويلة', data.transferNo, 'تاريخ الحركة', movementDate)}
            {summaryPairRow('من المخزن', data.fromWarehouseName, 'إلى المخزن', data.toWarehouseName, true)}
            {summaryPairRow('عدد الأصناف', transferItems.length.toLocaleString('en-US'), 'المنفذ', data.createdBy)}
            {summaryPairRow('إجمالي الكراتين', totalCartons.toLocaleString('en-US'), hasLoosePieces ? 'إجمالي القطع' : '', hasLoosePieces ? totalLoosePieces.toLocaleString('en-US') : '', true)}
          </tbody>
        </table>

        <div style={{ marginBottom: isThermal ? '4mm' : '8mm' }}>
          <h2 style={{ margin: 0, marginBottom: '3mm', fontSize: isThermal ? '9pt' : '12pt', fontWeight: 900, color: '#0f172a' }}>
            تفاصيل الأصناف
          </h2>
          {transferItems.length === 0 ? (
            <div style={{ border: `1px solid ${palette.border}`, borderRadius: '6px', padding: '4mm', color: palette.mutedText, fontWeight: 700 }}>
              لا توجد أصناف في هذه التحويلة.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: palette.tableHeaderBg, color: palette.tableHeaderText }}>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '20%' }}>كود الصنف</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '8%' }}>م</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '34%' }}>المنتج</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '14%' }}>الوحدة</th>
                  <th style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontSize: isThermal ? '7pt' : '10pt', width: '24%' }}>الكمية</th>
                </tr>
              </thead>
              <tbody>
                {transferItems.map((item, idx) => (
                  <tr key={`${item.itemCode}-${idx}`} style={{ pageBreakInside: 'avoid', background: idx % 2 === 0 ? '#fff' : palette.tableRowAltBg }}>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontFamily: 'monospace' }}>{item.itemCode || '—'}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', fontWeight: 700 }}>{item.itemName}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', textAlign: 'center' }}>{item.unitLabel}</td>
                    <td style={{ border: `1px solid ${palette.border}`, padding: '2.5mm 2mm', textAlign: 'center', fontWeight: 700 }}>
                      {Number(item.quantity || 0).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: isThermal ? '3mm' : '10mm', borderTop: `1px solid ${palette.border}`, paddingTop: '3mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText }}>
            {ps.footerText} — طباعة: {printedAt}
          </p>
        </div>
      </div>
    );
  },
);

StockTransferPrint.displayName = 'StockTransferPrint';

// ─── Share Card — WhatsApp Style ─────────────────────────────────────────

export interface StockTransferShareCardProps {
  data: StockTransferPrintData | null;
  companyName?: string;
  version?: string;
}

export const StockTransferShareCard = React.forwardRef<HTMLDivElement, StockTransferShareCardProps>(
  ({ data, companyName = 'الشركة', version = '' }, ref) => {
    if (!data) return <div ref={ref} />;

    // ── Computed values ──
    const transferItems = data.items && data.items.length > 0
      ? data.items
      : (data.itemName
        ? [{
            itemName: data.itemName,
            itemCode: data.itemCode || '—',
            unitLabel: data.quantityCartons != null ? 'كرتونة' : 'قطعة',
            quantity: data.quantityCartons ?? data.quantityPieces ?? 0,
            quantityPieces: data.quantityPieces ?? 0,
            unitsPerCarton: data.unitsPerCarton,
          }]
        : []);

    const totalCartons = transferItems
      .filter((i) => i.unitLabel === 'كرتونة')
      .reduce((s, i) => s + Number(i.quantity || 0), 0);

    const totalPieces = transferItems
      .reduce((s, i) => s + Number(i.quantityPieces || 0), 0);

    const movementDate = (() => {
      try {
        return new Date(data.createdAt).toLocaleDateString('ar-EG');
      } catch {
        return data.createdAt;
      }
    })();

    // ── Shared inline style helpers ──
    const ACCENT = '#0F6E56'; // teal dark
    const ACCENT_LIGHT = '#E1F5EE'; // teal lightest
    const ACCENT_MID = '#5DCAA5'; // teal mid
    const ACCENT_TEXT = '#085041'; // teal darkest

    const rtl: React.CSSProperties = {
      direction: 'rtl',
      unicodeBidi: 'embed',
      textAlign: 'right',
    };

    const cellStyle = (borderLeft = true): React.CSSProperties => ({
      padding: '8px 10px',
      borderLeft: borderLeft ? '0.5px solid #F1F5F9' : 'none',
      borderBottom: '0.5px solid #F1F5F9',
      ...rtl,
    });

    return (
      <div
        ref={ref}
        id="stock-transfer-share-card"
        style={{
          ...rtl,
          fontFamily: "'Cairo', 'Arial', sans-serif",
          background: '#fff',
          borderRadius: '16px',
          overflow: 'hidden',
          width: '420px',
          border: '0.5px solid #E2E8F0',
          fontSize: '13px',
          color: '#0F172A',
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            background: ACCENT,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...rtl,
          }}
        >
          <div style={rtl}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', ...rtl }}>
              {companyName}
            </div>
            <div style={{ fontSize: '9px', color: '#9FE1CB', marginTop: '2px', ...rtl }}>
              HAKIM PRODUCTION SYSTEM
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '6px',
                ...rtl,
              }}
            >
              إذن تحويل مخزون
            </span>
            <span style={{ fontSize: '10px', color: '#9FE1CB', ...rtl }}>
              {movementDate}
            </span>
          </div>
        </div>

        {/* ── TRANSFER ROUTE ── */}
        <div
          style={{
            padding: '11px 14px',
            borderBottom: '0.5px solid #E2E8F0',
            background: '#F8FAFC',
            ...rtl,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              direction: 'rtl',
            }}
          >
            {/* من */}
            <div
              style={{
                flex: 1,
                background: '#fff',
                border: '0.5px solid #E2E8F0',
                borderRadius: '8px',
                padding: '7px 9px',
                ...rtl,
              }}
            >
              <div style={{ fontSize: '8px', color: '#94A3B8', marginBottom: '3px', ...rtl }}>من المخزن</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', ...rtl }}>
                {data.fromWarehouseName || '—'}
              </div>
            </div>

            {/* Arrow */}
            {/* <svg width="22" height="14" viewBox="0 0 22 14" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 7H18M18 7L13 2M18 7L13 12" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg> */}

            {/* إلى */}
            <div
              style={{
                flex: 1,
                background: ACCENT_LIGHT,
                border: `0.5px solid ${ACCENT_MID}`,
                borderRadius: '8px',
                padding: '7px 9px',
                ...rtl,
              }}
            >
              <div style={{ fontSize: '8px', color: ACCENT, marginBottom: '3px', ...rtl }}>إلى المخزن</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: ACCENT_TEXT, ...rtl }}>
                {data.toWarehouseName || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* ── META 3 COLS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div style={cellStyle(true)}>
            <div style={{ fontSize: '8px', color: '#94A3B8', marginBottom: '3px', ...rtl }}>رقم التحويلة</div>
            <div style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', color: ACCENT, ...rtl }}>
              {data.transferNo}
            </div>
          </div>
          <div style={cellStyle(true)}>
            <div style={{ fontSize: '8px', color: '#94A3B8', marginBottom: '3px', ...rtl }}>المنفذ</div>
            <div style={{ fontSize: '10px', fontWeight: 700, ...rtl }}>{data.createdBy || '—'}</div>
          </div>
          <div style={cellStyle(false)}>
            <div style={{ fontSize: '8px', color: '#94A3B8', marginBottom: '3px', ...rtl }}>عدد الأصناف</div>
            <div style={{ fontSize: '10px', fontWeight: 700, ...rtl }}>
              {transferItems.length} {transferItems.length === 1 ? 'صنف' : 'أصناف'}
            </div>
          </div>
        </div>

        {/* ── KPI 3 COLS ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            borderBottom: '0.5px solid #F1F5F9',
            background: '#F8FAFC',
          }}
        >
          <div style={{ padding: '10px 5px', textAlign: 'center', borderLeft: '0.5px solid #F1F5F9' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: ACCENT, lineHeight: 1, ...rtl }}>
              {totalCartons.toLocaleString('ar-EG')}
            </div>
            <div style={{ fontSize: '8px', color: '#94A3B8', marginTop: '3px', ...rtl }}>إجمالي الكراتين</div>
          </div>
          <div style={{ padding: '10px 5px', textAlign: 'center', borderLeft: '0.5px solid #F1F5F9' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', lineHeight: 1, ...rtl }}>
              {totalPieces.toLocaleString('ar-EG')}
            </div>
            <div style={{ fontSize: '8px', color: '#94A3B8', marginTop: '3px', ...rtl }}>إجمالي القطع</div>
          </div>
          <div style={{ padding: '10px 5px', textAlign: 'center' }}>
            <div style={{ marginTop: '4px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  background: ACCENT_LIGHT,
                  borderRadius: '99px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: ACCENT_TEXT,
                  ...rtl,
                }}
              >
                للاعتماد
              </span>
            </div>
            <div style={{ fontSize: '8px', color: '#94A3B8', marginTop: '3px', ...rtl }}>الحالة</div>
          </div>
        </div>

        {/* ── ITEMS TABLE ── */}
        <div style={{ borderBottom: '0.5px solid #F1F5F9' }}>
          {/* table header label */}
          <div
            style={{
              padding: '7px 12px',
              background: '#F8FAFC',
              borderBottom: '0.5px solid #F1F5F9',
              ...rtl,
            }}
          >
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>تفاصيل الأصناف</span>
          </div>

          {/* column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              padding: '5px 10px',
              background: '#F1F5F9',
              direction: 'rtl',
            }}
          >
            {['المنتج', 'الوحدة', 'كراتين', 'قطع'].map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: '#64748B',
                  textAlign: i === 0 ? 'right' : 'center',
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* item rows */}
          {transferItems.map((item, idx) => (
            <div
              key={`${item.itemCode}-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                padding: '7px 10px',
                borderBottom: idx < transferItems.length - 1 ? '0.5px solid #F8FAFC' : 'none',
                background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                direction: 'rtl',
              }}
            >
              <div style={rtl}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#0F172A', ...rtl }}>
                  {item.itemName}
                </div>
                <div style={{ fontSize: '8px', color: '#94A3B8', fontFamily: 'monospace', ...rtl }}>
                  {item.itemCode}
                </div>
              </div>
              <div style={{ fontSize: '9px', color: '#64748B', textAlign: 'center', paddingTop: '2px' }}>
                {item.unitLabel}
                {item.unitsPerCarton ? `/${item.unitsPerCarton}` : ''}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: ACCENT, textAlign: 'center', paddingTop: '2px' }}>
                {item.unitLabel === 'كرتونة'
                  ? Number(item.quantity || 0).toLocaleString('ar-EG')
                  : '—'}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', textAlign: 'center', paddingTop: '2px' }}>
                {Number(item.quantityPieces || 0).toLocaleString('ar-EG')}
              </div>
            </div>
          ))}

          {/* total row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              padding: '7px 10px',
              background: ACCENT_LIGHT,
              borderTop: `0.5px solid ${ACCENT_MID}`,
              direction: 'rtl',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 700, color: ACCENT_TEXT, ...rtl }}>الإجمالي</div>
            <div />
            <div style={{ fontSize: '11px', fontWeight: 800, color: ACCENT_TEXT, textAlign: 'center' }}>
              {totalCartons.toLocaleString('ar-EG')}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: ACCENT_TEXT, textAlign: 'center' }}>
              {totalPieces.toLocaleString('ar-EG')}
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div
          style={{
            padding: '7px 12px',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...rtl,
          }}
        >
          <span style={{ fontSize: '8px', color: '#94A3B8', ...rtl }}>
            تم الإنشاء آلياً — نظام إدارة المخزون
          </span>
          <span style={{ fontSize: '8px', fontWeight: 700, color: ACCENT }}>
            HAKIM {version}
          </span>
        </div>
      </div>
    );
  },
);

StockTransferShareCard.displayName = 'StockTransferShareCard';


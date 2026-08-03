import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import {
  Factory_IMAGE_PRIMARY,
  Factory_IMAGE_PRIMARY_BADGE_BG,
  Factory_IMAGE_PRIMARY_BADGE_TEXT,
  Factory_IMAGE_PRIMARY_SOFT,
  Factory_TRANSFER_FOOTER_TAGLINE,
} from '@/utils/imageExportTheme';

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
  /** Optional status chip (e.g. للاعتماد / معتمد). */
  statusLabel?: string;
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

function resolveTransferItems(data: StockTransferPrintData) {
  if (data.items && data.items.length > 0) return data.items;
  if (!data.itemName) return [];
  return [
    {
      itemName: data.itemName,
      itemCode: data.itemCode || '—',
      unitLabel: data.quantityCartons != null ? 'كرتونة' : 'قطعة',
      quantity: data.quantityCartons ?? data.quantityPieces ?? 0,
      quantityPieces: data.quantityPieces ?? 0,
      unitsPerCarton: data.unitsPerCarton,
    },
  ];
}

function formatArDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('ar-EG');
  } catch {
    return value;
  }
}

function formatQty(value: number): string {
  return Number(value || 0).toLocaleString('ar-EG');
}

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const palette = getPrintThemePalette(ps);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const printedAt = new Date().toLocaleString('ar-EG');
    const transferItems = resolveTransferItems(data);
    const totalPieces = transferItems.reduce((sum, item) => sum + Number(item.quantityPieces || 0), 0);
    const totalCartons = transferItems
      .filter((item) => item.unitLabel === 'كرتونة')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const movementDate = formatArDate(data.createdAt);
    const cellBorder = `1px solid ${palette.border}`;

    return (
      <div
        ref={ref}
        dir="rtl"
        lang="ar"
        className="arabic-export-root print-report"
        style={{
          fontFamily: "'Cairo', 'Noto Sans Arabic', 'Tahoma', sans-serif",
          width: paper.width,
          minHeight: paper.minHeight,
          padding: isThermal ? '4mm 3mm' : '12mm 14mm',
          background: '#fff',
          color: palette.text,
          fontSize: isThermal ? '8pt' : '11pt',
          lineHeight: 1.55,
          boxSizing: 'border-box',
          letterSpacing: 'normal',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '4mm',
            marginBottom: isThermal ? '3mm' : '6mm',
            paddingBottom: isThermal ? '2mm' : '4mm',
            borderBottom: `2.5px solid ${ps.primaryColor}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {ps.logoUrl ? (
              <img
                src={ps.logoUrl}
                alt=""
                style={{ maxHeight: isThermal ? '10mm' : '16mm', marginBottom: '2mm', objectFit: 'contain' }}
              />
            ) : null}
            <h1 style={{ margin: 0, fontSize: isThermal ? '11pt' : '16pt', fontWeight: 800, color: ps.primaryColor }}>
              {ps.headerText}
            </h1>
            <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 600, color: palette.mutedText }}>
              Factory PRODUCTION SYSTEM
            </p>
          </div>
          <div style={{ textAlign: 'left', flexShrink: 0 }}>
            <div
              style={{
                display: 'inline-block',
                padding: '2mm 3.5mm',
                borderRadius: '6px',
                background: Factory_IMAGE_PRIMARY_BADGE_BG,
                color: Factory_IMAGE_PRIMARY_BADGE_TEXT,
                fontWeight: 800,
                fontSize: isThermal ? '9pt' : '12pt',
              }}
            >
              إذن تحويل مخزون
            </div>
            <p style={{ margin: '2mm 0 0', fontSize: isThermal ? '7pt' : '9pt', color: palette.mutedText }}>
              {printedAt}
            </p>
          </div>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isThermal ? '1fr' : '1fr auto 1fr',
            gap: isThermal ? '2mm' : '3mm',
            alignItems: 'stretch',
            marginBottom: isThermal ? '3mm' : '5mm',
          }}
        >
          <div style={{ border: cellBorder, borderRadius: '6px', padding: '3mm', background: '#f8fafc' }}>
            <p style={{ margin: 0, fontSize: isThermal ? '7pt' : '8pt', fontWeight: 700, color: palette.mutedText }}>من المخزن</p>
            <p style={{ margin: '1.5mm 0 0', fontSize: isThermal ? '9pt' : '12pt', fontWeight: 800 }}>{data.fromWarehouseName || '—'}</p>
          </div>
          {!isThermal && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: ps.primaryColor, fontWeight: 900, fontSize: '14pt' }}>
              ←
            </div>
          )}
          <div style={{ border: cellBorder, borderRadius: '6px', padding: '3mm', background: '#f8fafc' }}>
            <p style={{ margin: 0, fontSize: isThermal ? '7pt' : '8pt', fontWeight: 700, color: palette.mutedText }}>إلى المخزن</p>
            <p style={{ margin: '1.5mm 0 0', fontSize: isThermal ? '9pt' : '12pt', fontWeight: 800 }}>{data.toWarehouseName || '—'}</p>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isThermal ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
            gap: '2mm',
            marginBottom: isThermal ? '3mm' : '5mm',
            border: cellBorder,
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          {[
            { label: 'رقم التحويل', value: data.transferNo },
            { label: 'تاريخ الحركة', value: movementDate },
            { label: 'المنفذ', value: data.createdBy || '—' },
            { label: 'عدد الأصناف', value: formatQty(transferItems.length) },
          ].map((cell, i) => (
            <div
              key={cell.label}
              style={{
                padding: '2.5mm 3mm',
                background: i % 2 === 0 ? '#fff' : '#f8fafc',
                borderLeft: !isThermal && i < 3 ? cellBorder : undefined,
              }}
            >
              <p style={{ margin: 0, fontSize: isThermal ? '6.5pt' : '8pt', fontWeight: 700, color: palette.mutedText }}>{cell.label}</p>
              <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '8pt' : '10.5pt', fontWeight: 800, wordBreak: 'break-word' }}>{cell.value}</p>
            </div>
          ))}
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${data.statusLabel ? 3 : 2}, minmax(0, 1fr))`,
            gap: '2.5mm',
            marginBottom: isThermal ? '3mm' : '5mm',
          }}
        >
          <div style={{ border: cellBorder, borderRadius: '6px', padding: '3mm', borderRight: `3px solid ${ps.primaryColor}` }}>
            <p style={{ margin: 0, fontSize: '8pt', fontWeight: 700, color: palette.mutedText }}>إجمالي الكراتين</p>
            <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '12pt' : '16pt', fontWeight: 900, color: ps.primaryColor }}>{formatQty(totalCartons)}</p>
          </div>
          <div style={{ border: cellBorder, borderRadius: '6px', padding: '3mm', borderRight: '3px solid #94a3b8' }}>
            <p style={{ margin: 0, fontSize: '8pt', fontWeight: 700, color: palette.mutedText }}>إجمالي القطع</p>
            <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '12pt' : '16pt', fontWeight: 900 }}>{formatQty(totalPieces)}</p>
          </div>
          {data.statusLabel ? (
            <div style={{ border: cellBorder, borderRadius: '6px', padding: '3mm', borderRight: '3px solid #059669' }}>
              <p style={{ margin: 0, fontSize: '8pt', fontWeight: 700, color: palette.mutedText }}>الحالة</p>
              <p style={{ margin: '1mm 0 0', fontSize: isThermal ? '11pt' : '14pt', fontWeight: 900, color: '#047857' }}>{data.statusLabel}</p>
            </div>
          ) : null}
        </section>

        <section style={{ marginBottom: isThermal ? '3mm' : '6mm' }}>
          <h2 style={{ margin: '0 0 2.5mm', fontSize: isThermal ? '9pt' : '11pt', fontWeight: 800 }}>تفاصيل الأصناف</h2>
          {transferItems.length === 0 ? (
            <div style={{ border: cellBorder, borderRadius: '6px', padding: '4mm', color: palette.mutedText, fontWeight: 700 }}>
              لا توجد أصناف في هذه التحويلة.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: palette.tableHeaderBg, color: palette.tableHeaderText }}>
                  <th style={{ border: cellBorder, padding: '2mm', width: '8%', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, letterSpacing: 'normal', textTransform: 'none' }}>#</th>
                  <th style={{ border: cellBorder, padding: '2mm', width: '42%', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, letterSpacing: 'normal', textTransform: 'none', textAlign: 'right' }}>الصنف</th>
                  <th style={{ border: cellBorder, padding: '2mm', width: '14%', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, letterSpacing: 'normal', textTransform: 'none' }}>الوحدة</th>
                  <th style={{ border: cellBorder, padding: '2mm', width: '18%', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, letterSpacing: 'normal', textTransform: 'none' }}>الكمية</th>
                  <th style={{ border: cellBorder, padding: '2mm', width: '18%', fontSize: isThermal ? '7pt' : '9pt', fontWeight: 800, letterSpacing: 'normal', textTransform: 'none' }}>قطع</th>
                </tr>
              </thead>
              <tbody>
                {transferItems.map((item, idx) => (
                  <tr key={`${item.itemCode}-${idx}`} style={{ pageBreakInside: 'avoid', background: idx % 2 === 0 ? '#fff' : palette.tableRowAltBg }}>
                    <td style={{ border: cellBorder, padding: '2.2mm 2mm', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ border: cellBorder, padding: '2.2mm 2mm', textAlign: 'right' }}>
                      <div style={{ fontWeight: 800 }}>{item.itemName}</div>
                      <div style={{ marginTop: '0.8mm', fontSize: isThermal ? '6.5pt' : '8.5pt', fontWeight: 700, color: palette.mutedText, fontFamily: 'ui-monospace, monospace' }}>
                        {item.itemCode || '—'}
                      </div>
                    </td>
                    <td style={{ border: cellBorder, padding: '2.2mm 2mm', textAlign: 'center', fontWeight: 700 }}>
                      {item.unitsPerCarton ? `${item.unitLabel} (${item.unitsPerCarton})` : item.unitLabel}
                    </td>
                    <td style={{ border: cellBorder, padding: '2.2mm 2mm', textAlign: 'center', fontWeight: 800, color: ps.primaryColor }}>
                      {formatQty(Number(item.quantity || 0))}
                    </td>
                    <td style={{ border: cellBorder, padding: '2.2mm 2mm', textAlign: 'center', fontWeight: 800 }}>
                      {formatQty(Number(item.quantityPieces || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {data.note?.trim() ? (
          <section style={{ marginBottom: '5mm', border: cellBorder, borderRadius: '6px', padding: '3mm', background: '#f8fafc' }}>
            <p style={{ margin: 0, fontSize: '8pt', fontWeight: 700, color: palette.mutedText }}>ملاحظة</p>
            <p style={{ margin: '1.5mm 0 0', fontWeight: 700 }}>{data.note}</p>
          </section>
        ) : null}

        {!isThermal && (
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '6mm',
              marginTop: '8mm',
              marginBottom: '6mm',
            }}
          >
            {['المنفذ', 'المستلم', 'المعتمد'].map((title) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 8mm', fontSize: '9pt', fontWeight: 800 }}>{title}</p>
                <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '2mm' }}>
                  <p style={{ margin: 0, fontSize: '8pt', color: palette.mutedText }}>الاسم / التوقيع</p>
                </div>
              </div>
            ))}
          </section>
        )}

        <footer style={{ marginTop: isThermal ? '3mm' : '4mm', borderTop: `1px solid ${palette.border}`, paddingTop: '2.5mm', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: isThermal ? '6pt' : '8pt', color: palette.mutedText }}>
            {ps.footerText || Factory_TRANSFER_FOOTER_TAGLINE} — طباعة: {printedAt}
          </p>
        </footer>
      </div>
    );
  },
);

StockTransferPrint.displayName = 'StockTransferPrint';

// ─── Share Card — image / WhatsApp export ───────────────────────────────────

export interface StockTransferShareCardProps {
  data: StockTransferPrintData | null;
  companyName?: string;
  version?: string;
  exportRootId?: string;
}

export const StockTransferShareCard = React.forwardRef<HTMLDivElement, StockTransferShareCardProps>(
  (
    {
      data,
      companyName = 'مؤسسة المغربي للإستيراد',
      version = __APP_VERSION__,
      exportRootId = 'stock-transfer-share-root',
    },
    ref,
  ) => {
    if (!data) return <div ref={ref} />;

    const transferItems = resolveTransferItems(data);
    const totalCartons = transferItems
      .filter((i) => i.unitLabel === 'كرتونة')
      .reduce((s, i) => s + Number(i.quantity || 0), 0);
    const totalPieces = transferItems.reduce((s, i) => s + Number(i.quantityPieces || 0), 0);
    const movementDate = formatArDate(data.createdAt);
    const printNow = new Date().toLocaleString('ar-EG');
    const statusLabel = data.statusLabel?.trim() || '';
    const accent = Factory_IMAGE_PRIMARY;

    return (
      <div
        id={exportRootId}
        ref={ref}
        dir="rtl"
        lang="ar"
        className="print-root print-report arabic-export-root bg-white mx-auto"
        style={{
          fontFamily: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
          fontSize: '13px',
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          width: 640,
          minWidth: 640,
          maxWidth: 640,
          boxSizing: 'border-box',
          padding: '28px 32px',
          flexShrink: 0,
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b-2 pb-3 mb-4" style={{ borderBottomColor: accent }}>
          <div className="min-w-0">
            <h1 className="text-[18px] font-extrabold text-slate-900 leading-tight">{companyName}</h1>
            <p className="mt-0.5 text-[10px] font-semibold" style={{ color: accent }}>
              Factory PRODUCTION SYSTEM
            </p>
          </div>
          <div className="shrink-0 text-left">
            <span
              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-[13px] font-extrabold"
              style={{ background: Factory_IMAGE_PRIMARY_BADGE_BG, color: Factory_IMAGE_PRIMARY_BADGE_TEXT }}
            >
              إذن تحويل مخزون
            </span>
            <p className="mt-1 text-[11px] text-slate-500">{printNow}</p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          <div className="rounded-lg border border-slate-200 px-3 py-2.5" style={{ background: Factory_IMAGE_PRIMARY_SOFT }}>
            <p className="text-[10px] font-bold text-slate-500">من المخزن</p>
            <p className="mt-1 text-[14px] font-extrabold leading-snug text-slate-900">{data.fromWarehouseName || '—'}</p>
          </div>
          <div className="flex items-center justify-center px-1">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-black"
              style={{ background: Factory_IMAGE_PRIMARY_SOFT, color: accent }}
              aria-hidden
            >
              ←
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-500">إلى المخزن</p>
            <p className="mt-1 text-[14px] font-extrabold leading-snug text-slate-900">{data.toWarehouseName || '—'}</p>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200">
          {[
            { label: 'رقم التحويل', value: data.transferNo },
            { label: 'تاريخ الحركة', value: movementDate },
            { label: 'المنفذ', value: data.createdBy || '—' },
          ].map((cell, i) => (
            <div
              key={cell.label}
              className="min-w-0 bg-slate-50 px-3 py-2.5"
              style={{ borderLeft: i < 2 ? '1px solid #e2e8f0' : undefined }}
            >
              <p className="text-[10px] font-bold text-slate-500">{cell.label}</p>
              <p className="mt-1 break-words text-[12px] font-extrabold leading-snug text-slate-900">{cell.value}</p>
            </div>
          ))}
        </section>

        <section className={`mb-4 grid gap-2 ${statusLabel ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {[
            { label: 'إجمالي الكراتين', value: formatQty(totalCartons), color: accent },
            { label: 'إجمالي القطع', value: formatQty(totalPieces), color: '#0f172a' },
            { label: 'عدد الأصناف', value: formatQty(transferItems.length), color: '#0f172a' },
            ...(statusLabel
              ? [{ label: 'الحالة', value: statusLabel, color: '#047857' }]
              : []),
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex min-h-[72px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: kpi.color === accent ? accent : kpi.color === '#047857' ? '#059669' : '#cbd5e1' }} />
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-2.5 text-center">
                <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: kpi.color }}>
                  {kpi.value}
                </p>
                <p className="mt-2 text-[11px] font-bold leading-snug text-slate-500">{kpi.label}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mb-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-[3px] rounded-full" style={{ backgroundColor: accent }} />
            <p className="text-[11px] font-extrabold text-slate-600">تفاصيل الأصناف</p>
          </div>

          {transferItems.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
              لا توجد أصناف في هذه التحويلة.
            </div>
          ) : (
            <table className="w-full border-collapse overflow-hidden rounded-lg text-right" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-100 text-[11px] font-extrabold text-slate-600">
                  <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '9%', letterSpacing: 'normal', textTransform: 'none' }}>#</th>
                  <th className="border border-slate-200 px-2 py-2" style={{ width: '41%', letterSpacing: 'normal', textTransform: 'none' }}>الصنف</th>
                  <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '14%', letterSpacing: 'normal', textTransform: 'none' }}>الوحدة</th>
                  <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '18%', letterSpacing: 'normal', textTransform: 'none' }}>الكمية</th>
                  <th className="border border-slate-200 px-2 py-2 text-center" style={{ width: '18%', letterSpacing: 'normal', textTransform: 'none' }}>قطع</th>
                </tr>
              </thead>
              <tbody>
                {transferItems.map((item, idx) => (
                  <tr key={`${item.itemCode}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[12px] font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-2">
                      <p className="text-[12px] font-extrabold leading-snug text-slate-900">{item.itemName}</p>
                      <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-600">{item.itemCode || '—'}</p>
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-slate-700">
                      {item.unitsPerCarton ? `${item.unitLabel} (${item.unitsPerCarton})` : item.unitLabel}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[13px] font-black tabular-nums" style={{ color: accent }}>
                      {formatQty(Number(item.quantity || 0))}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-[13px] font-black tabular-nums text-slate-900">
                      {formatQty(Number(item.quantityPieces || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {data.note?.trim() ? (
          <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-500">ملاحظة</p>
            <p className="mt-1 text-[12px] font-bold leading-snug text-slate-800">{data.note}</p>
          </section>
        ) : null}

        <section className="mb-4 mt-5 grid grid-cols-3 gap-4">
          {['المنفذ', 'المستلم', 'المعتمد'].map((title) => (
            <div key={title} className="flex flex-col items-center">
              <p className="mb-8 text-[12px] font-extrabold text-slate-700">{title}</p>
              <div className="w-full border-t border-slate-300 pt-1 text-center">
                <p className="text-[10px] text-slate-400">الاسم / التوقيع</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
          <p className="text-[10px] text-slate-400">
            {Factory_TRANSFER_FOOTER_TAGLINE} — {printNow}
          </p>
          <p className="text-[10px] font-bold" style={{ color: accent }}>
            Factory {version}
          </p>
        </footer>
      </div>
    );
  },
);

StockTransferShareCard.displayName = 'StockTransferShareCard';

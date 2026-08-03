import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
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

type TransferItem = NonNullable<StockTransferPrintData['items']>[number];

function resolveTransferItems(data: StockTransferPrintData): TransferItem[] {
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

type PermitLayoutModel = {
  companyName: string;
  accent: string;
  printedAt: string;
  movementDate: string;
  transferItems: TransferItem[];
  totalCartons: number;
  totalPieces: number;
  statusLabel: string;
  footerTagline: string;
  version?: string;
  showVersion?: boolean;
  note?: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  transferNo: string;
  createdBy: string;
};

function buildPermitModel(
  data: StockTransferPrintData,
  options: {
    companyName: string;
    accent: string;
    footerTagline: string;
    version?: string;
    showVersion?: boolean;
  },
): PermitLayoutModel {
  const transferItems = resolveTransferItems(data);
  return {
    companyName: options.companyName,
    accent: options.accent,
    printedAt: new Date().toLocaleString('ar-EG'),
    movementDate: formatArDate(data.createdAt),
    transferItems,
    totalCartons: transferItems
      .filter((i) => i.unitLabel === 'كرتونة')
      .reduce((s, i) => s + Number(i.quantity || 0), 0),
    totalPieces: transferItems.reduce((s, i) => s + Number(i.quantityPieces || 0), 0),
    statusLabel: data.statusLabel?.trim() || '',
    footerTagline: options.footerTagline,
    version: options.version,
    showVersion: options.showVersion,
    note: data.note,
    fromWarehouseName: data.fromWarehouseName || '—',
    toWarehouseName: data.toWarehouseName || '—',
    transferNo: data.transferNo,
    createdBy: data.createdBy || '—',
  };
}

/** Shared visual for print + WhatsApp/PNG — matches factory transfer permit card. */
const StockTransferPermitDocument: React.FC<{
  model: PermitLayoutModel;
  rootId?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: string;
  padding?: string;
}> = ({
  model,
  rootId,
  rootRef,
  width = 640,
  minWidth,
  maxWidth,
  minHeight,
  padding = '28px 32px',
}) => {
  const accent = model.accent;
  const statusLabel = model.statusLabel;

  return (
    <div
      id={rootId}
      ref={rootRef}
      dir="rtl"
      lang="ar"
      className="print-root print-report arabic-export-root bg-white mx-auto"
      style={{
        fontFamily: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
        fontSize: '13px',
        letterSpacing: 'normal',
        wordSpacing: 'normal',
        width,
        minWidth: minWidth ?? width,
        maxWidth: maxWidth ?? width,
        minHeight,
        boxSizing: 'border-box',
        padding,
        flexShrink: 0,
        color: '#0f172a',
      }}
    >
      <header
        className="flex items-start justify-between gap-4 border-b-2 pb-3 mb-4"
        style={{ borderBottomColor: accent }}
      >
        <div className="min-w-0">
          <h1 className="text-[18px] font-extrabold text-slate-900 leading-tight">
            {model.companyName}
          </h1>
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
          <p className="mt-1 text-[11px] text-slate-500">{model.printedAt}</p>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div
          className="rounded-lg border border-slate-200 px-3 py-2.5"
          style={{ background: Factory_IMAGE_PRIMARY_SOFT }}
        >
          <p className="text-[10px] font-bold text-slate-500">من المخزن</p>
          <p className="mt-1 text-[14px] font-extrabold leading-snug text-slate-900">
            {model.fromWarehouseName}
          </p>
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
          <p className="mt-1 text-[14px] font-extrabold leading-snug text-slate-900">
            {model.toWarehouseName}
          </p>
        </div>
      </section>

      <section className="mb-4 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200">
        <div className="min-w-0 bg-slate-50 px-3 py-2.5" style={{ borderLeft: '1px solid #e2e8f0' }}>
          <p className="text-[10px] font-bold text-slate-500">رقم التحويل</p>
          <p className="mt-1 break-words text-[12px] font-extrabold leading-snug text-slate-900">
            {model.transferNo}
          </p>
        </div>
        <div className="min-w-0 bg-slate-50 px-3 py-2.5" style={{ borderLeft: '1px solid #e2e8f0' }}>
          <p className="text-[10px] font-bold text-slate-500">تاريخ الحركة</p>
          <p className="mt-1 text-[12px] font-extrabold leading-snug text-slate-900">{model.movementDate}</p>
          <p className="mt-2 text-[10px] font-bold text-slate-500">المنفذ</p>
          <p className="mt-0.5 break-words text-[12px] font-extrabold leading-snug text-slate-900">
            {model.createdBy}
          </p>
        </div>
        <div className="min-w-0 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">عدد الأصناف</p>
          <p className="mt-1 text-[12px] font-extrabold leading-snug text-slate-900">
            {formatQty(model.transferItems.length)}
          </p>
        </div>
      </section>

      <section className={`mb-4 grid gap-2 ${statusLabel ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {[
          { label: 'إجمالي الكراتين', value: formatQty(model.totalCartons), color: accent, strip: accent },
          { label: 'إجمالي القطع', value: formatQty(model.totalPieces), color: '#0f172a', strip: '#cbd5e1' },
          ...(statusLabel
            ? [{ label: 'الحالة', value: statusLabel, color: '#047857', strip: '#059669' }]
            : []),
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="flex min-h-[72px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          >
            <div className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: kpi.strip }} />
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

        {model.transferItems.length === 0 ? (
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
              {model.transferItems.map((item, idx) => (
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

      {model.note?.trim() ? (
        <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">ملاحظة</p>
          <p className="mt-1 text-[12px] font-bold leading-snug text-slate-800">{model.note}</p>
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
          {model.footerTagline} — طباعة: {model.printedAt}
        </p>
        {model.showVersion !== false && model.version ? (
          <p className="text-[10px] font-bold" style={{ color: accent }}>
            Factory {model.version}
          </p>
        ) : null}
      </footer>
    </div>
  );
};

/** Compact thermal slip — kept separate for 80mm printers. */
const StockTransferThermalPrint: React.FC<{
  data: StockTransferPrintData;
  printSettings: PrintTemplateSettings;
  rootRef?: React.Ref<HTMLDivElement>;
}> = ({ data, printSettings, rootRef }) => {
  const ps = printSettings;
  const printedAt = new Date().toLocaleString('ar-EG');
  const transferItems = resolveTransferItems(data);
  const totalPieces = transferItems.reduce((sum, item) => sum + Number(item.quantityPieces || 0), 0);
  const totalCartons = transferItems
    .filter((item) => item.unitLabel === 'كرتونة')
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const accent = ps.primaryColor || Factory_IMAGE_PRIMARY;

  return (
    <div
      ref={rootRef}
      dir="rtl"
      lang="ar"
      className="arabic-export-root print-report"
      style={{
        fontFamily: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
        width: '80mm',
        padding: '4mm 3mm',
        background: '#fff',
        color: '#0f172a',
        fontSize: '8pt',
        lineHeight: 1.45,
        boxSizing: 'border-box',
        letterSpacing: 'normal',
      }}
    >
      <p style={{ margin: 0, fontWeight: 800, color: accent, fontSize: '10pt' }}>{ps.headerText}</p>
      <p style={{ margin: '1mm 0 2mm', fontWeight: 800 }}>إذن تحويل مخزون</p>
      <p style={{ margin: 0 }}>من: {data.fromWarehouseName}</p>
      <p style={{ margin: '1mm 0 0' }}>إلى: {data.toWarehouseName}</p>
      <p style={{ margin: '1mm 0 0' }}>رقم: {data.transferNo}</p>
      <p style={{ margin: '1mm 0 2mm' }}>كراتين: {formatQty(totalCartons)} — قطع: {formatQty(totalPieces)}</p>
      {transferItems.map((item, idx) => (
        <p key={`${item.itemCode}-${idx}`} style={{ margin: '1mm 0', borderTop: '1px dashed #cbd5e1', paddingTop: '1mm' }}>
          {idx + 1}. {item.itemName} — {formatQty(item.quantity)} {item.unitLabel}
        </p>
      ))}
      <p style={{ margin: '3mm 0 0', fontSize: '6.5pt', color: '#64748b' }}>
        {ps.footerText || Factory_TRANSFER_FOOTER_TAGLINE} — {printedAt}
      </p>
    </div>
  );
};

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const isThermal = ps.paperSize === 'thermal';
    if (isThermal) {
      return <StockTransferThermalPrint data={data} printSettings={ps} rootRef={ref} />;
    }

    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const model = buildPermitModel(data, {
      companyName: String(ps.headerText || 'Sokany-eg').trim() || 'Sokany-eg',
      accent: ps.primaryColor || Factory_IMAGE_PRIMARY,
      footerTagline: String(ps.footerText || '').trim() || Factory_TRANSFER_FOOTER_TAGLINE,
      version: __APP_VERSION__,
      showVersion: true,
    });

    return (
      <StockTransferPermitDocument
        model={model}
        rootRef={ref}
        width={paper.width}
        minWidth={paper.width}
        maxWidth={paper.width}
        minHeight={paper.minHeight}
        padding={ps.paperSize === 'a5' ? '8mm 9mm' : '12mm 14mm'}
      />
    );
  },
);

StockTransferPrint.displayName = 'StockTransferPrint';

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

    const model = buildPermitModel(data, {
      companyName,
      accent: Factory_IMAGE_PRIMARY,
      // Keep export footer aligned with production-report style when sharing.
      footerTagline: Factory_DEFAULT_FOOTER_TAGLINE,
      version,
      showVersion: true,
    });

    return (
      <StockTransferPermitDocument
        model={model}
        rootId={exportRootId}
        rootRef={ref}
        width={640}
        minWidth={640}
        maxWidth={640}
        padding="28px 32px"
      />
    );
  },
);

StockTransferShareCard.displayName = 'StockTransferShareCard';

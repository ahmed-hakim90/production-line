import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import {
  Factory_DEFAULT_FOOTER_TAGLINE,
  Factory_TRANSFER_FOOTER_TAGLINE,
} from '@/utils/imageExportTheme';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import {
  FactoryPrintTable,
  FactoryPrintTableAccentValue,
} from '@/src/components/erp/FactoryPrintTable';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintAccentHex } from '@/utils/printTheme';

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
    locationCode?: string;
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
  /** Print header title — defaults to إذن تحويل مخزون. */
  documentType?: string;
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

/** Resolve registry id for IN/OUT vouchers vs transfer. */
export function resolveStockVoucherPrintDocId(
  documentType?: string,
): 'stockReceipt' | 'stockIssue' | 'stockTransfer' {
  const title = String(documentType || '').trim();
  if (title.includes('منصرف')) return 'stockIssue';
  if (title.includes('إضافة') || title.includes('وارد')) return 'stockReceipt';
  return 'stockTransfer';
}

type PermitLayoutModel = {
  companyName: string;
  accent: string;
  logoUrl?: string;
  printedAt: string;
  movementDate: string;
  transferItems: TransferItem[];
  totalCartons: number;
  totalPieces: number;
  statusLabel: string;
  documentType: string;
  footerTagline: string;
  version?: string;
  showVersion?: boolean;
  showItemCode?: boolean;
  showQuantityPieces?: boolean;
  showUnitsPerCarton?: boolean;
  showSignatures?: boolean;
  extraLines?: string[];
  fontFamily?: string;
  fontSize?: string;
  note?: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  transferNo: string;
  createdBy: string;
  printSettings?: PrintTemplateSettings;
};

function buildPermitModel(
  data: StockTransferPrintData,
  options: {
    companyName: string;
    accent: string;
    logoUrl?: string;
    footerTagline: string;
    version?: string;
    showVersion?: boolean;
    showItemCode?: boolean;
    showQuantityPieces?: boolean;
    showUnitsPerCarton?: boolean;
    showSignatures?: boolean;
    extraLines?: string[];
    fontFamily?: string;
    fontSize?: string;
    printSettings?: PrintTemplateSettings;
  },
): PermitLayoutModel {
  const transferItems = resolveTransferItems(data);
  return {
    companyName: options.companyName,
    accent: options.accent,
    logoUrl: options.logoUrl,
    printedAt: new Date().toLocaleString('ar-EG'),
    movementDate: formatArDate(data.createdAt),
    transferItems,
    totalCartons: transferItems
      .filter((i) => i.unitLabel === 'كرتونة')
      .reduce((s, i) => s + Number(i.quantity || 0), 0),
    totalPieces: transferItems.reduce((s, i) => s + Number(i.quantityPieces || 0), 0),
    statusLabel: data.statusLabel?.trim() || '',
    documentType: data.documentType?.trim() || 'إذن تحويل مخزون',
    footerTagline: options.footerTagline,
    version: options.version,
    showVersion: options.showVersion,
    showItemCode: options.showItemCode !== false,
    showQuantityPieces: options.showQuantityPieces !== false,
    showUnitsPerCarton: options.showUnitsPerCarton !== false,
    showSignatures: options.showSignatures !== false,
    extraLines: options.extraLines ?? [],
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    note: data.note,
    fromWarehouseName: data.fromWarehouseName || '—',
    toWarehouseName: data.toWarehouseName || '—',
    transferNo: data.transferNo,
    createdBy: data.createdBy || '—',
    printSettings: options.printSettings,
  };
}

/** Shared visual for print + WhatsApp/PNG — Factory print engine chrome. */
const StockTransferPermitDocument: React.FC<{
  model: PermitLayoutModel;
  rootId?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: string;
  padding?: string;
  paperWidth?: string;
}> = ({
  model,
  rootId,
  rootRef,
  width = 640,
  minHeight,
  padding = '28px 32px',
  paperWidth,
}) => {
  const accent = model.accent;
  const statusLabel = model.statusLabel;
  const fontFamily = model.fontFamily || "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif";
  const fontSize = model.fontSize || '10pt';

  return (
    <FactoryPrintShell
      ref={rootRef}
      exportRootId={rootId}
      companyName={model.companyName}
      documentType={model.documentType}
      printDate={model.printedAt}
      logoUrl={model.logoUrl}
      brandAccent={accent}
      footerTagline={model.footerTagline}
      version={model.version}
      showVersion={model.showVersion !== false}
      extraLines={model.extraLines}
      fontFamily={fontFamily}
      fontSize={fontSize}
      width={width}
      paperWidth={paperWidth}
      minHeight={minHeight}
      padding={padding}
      metaCards={[
        { label: 'رقم التحويل', value: model.transferNo || '—' },
        { label: 'التاريخ', value: model.movementDate },
        { label: 'من المخزن', value: model.fromWarehouseName },
        { label: 'إلى المخزن', value: model.toWarehouseName },
      ]}
      kpis={[
        { label: 'عدد البنود', value: formatQty(model.transferItems.length), tone: 'indigo' },
        { label: 'إجمالي الكراتين', value: formatQty(model.totalCartons) },
        { label: 'إجمالي القطع', value: formatQty(model.totalPieces) },
        ...(statusLabel
          ? [{ label: 'الحالة', value: statusLabel }]
          : [{ label: 'المنفذ', value: model.createdBy || '—' }]),
      ]}
      signatures={
        model.showSignatures !== false
          ? [{ title: 'المنفذ' }, { title: 'المستلم' }, { title: 'المعتمد' }]
          : undefined
      }
    >
      <section className="mb-3">
        <FactoryPrintSectionTitle title="تفاصيل الأصناف" accent={accent} />

        {model.transferItems.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-bold text-slate-500">
            لا توجد أصناف في هذه التحويلة.
          </div>
        ) : (
          <FactoryPrintTable
            brandAccent={accent}
            printSettings={model.printSettings}
            columns={[
              { key: 'idx', header: '#', width: '9%', align: 'center' },
              {
                key: 'item',
                header: 'الصنف',
                width: model.showQuantityPieces === false ? '59%' : '41%',
              },
              { key: 'unit', header: 'الوحدة', width: '14%', align: 'center' },
              { key: 'qty', header: 'الكمية', width: '18%', align: 'center' },
              ...(model.showQuantityPieces !== false
                ? [{ key: 'pieces', header: 'قطع', width: '18%', align: 'center' as const }]
                : []),
            ]}
            rows={model.transferItems.map((item, idx) => ({
              key: `${item.itemCode}-${idx}`,
              cells: {
                idx: idx + 1,
                item: (
                  <>
                    <p className="text-[12px] font-extrabold leading-snug">{item.itemName}</p>
                    {model.showItemCode !== false ? (
                      <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-600">
                        {item.itemCode || '—'}
                      </p>
                    ) : null}
                    {item.locationCode ? (
                      <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                        رف: {item.locationCode}
                      </p>
                    ) : null}
                  </>
                ),
                unit:
                  model.showUnitsPerCarton !== false && item.unitsPerCarton
                    ? `${item.unitLabel} (${item.unitsPerCarton})`
                    : item.unitLabel,
                qty: (
                  <FactoryPrintTableAccentValue accent={accent} className="text-[13px]">
                    {formatQty(Number(item.quantity || 0))}
                  </FactoryPrintTableAccentValue>
                ),
                pieces: formatQty(Number(item.quantityPieces || 0)),
              },
            }))}
          />
        )}
      </section>

      {model.note?.trim() ? (
        <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">ملاحظة</p>
          <p className="mt-1 text-[12px] font-bold leading-snug text-slate-800">{model.note}</p>
        </section>
      ) : null}
    </FactoryPrintShell>
  );
};

/** إذن إضافة / منصرف — same Factory chrome as production issue (metaCards + table). */
const StockVoucherInOutDocument: React.FC<{
  data: StockTransferPrintData;
  printSettings: PrintTemplateSettings;
  docId: 'stockReceipt' | 'stockIssue';
  rootRef?: React.Ref<HTMLDivElement>;
  rootId?: string;
  width?: number | string;
  paperWidth?: string;
  minHeight?: string;
  padding?: string;
}> = ({
  data,
  printSettings,
  docId,
  rootRef,
  rootId,
  width,
  paperWidth,
  minHeight,
  padding = '10mm 12mm',
}) => {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const doc = resolvePrintDocumentConfig(ps, docId);
  const font = resolvePrintFont(ps);
  const accent = resolvePrintAccentHex(ps.primaryColor);
  const items = resolveTransferItems(data);
  const totalPieces = items.reduce((sum, item) => sum + Number(item.quantityPieces || 0), 0);
  const documentType = data.documentType?.trim()
    || (docId === 'stockIssue' ? 'إذن منصرف' : 'إذن إضافة');
  const printedAt = new Date().toLocaleString('ar-EG');
  const isIssue = docId === 'stockIssue';

  return (
    <FactoryPrintShell
      ref={rootRef}
      exportRootId={rootId}
      companyName={doc.headerText || ps.headerText || 'مخازن الإنتاج'}
      documentType={documentType}
      printDate={printedAt}
      logoUrl={ps.logoUrl}
      brandAccent={accent}
      footerTagline={doc.footerText?.trim() || ps.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
      extraLines={doc.customLines}
      fontFamily={font.fontFamily}
      fontSize={font.fontSize}
      width={width}
      paperWidth={paperWidth}
      minHeight={minHeight}
      padding={padding}
      metaCards={
        doc.isFieldVisible('meta')
          ? [
              { label: 'رقم الإذن', value: data.transferNo || '—' },
              { label: 'التاريخ', value: formatArDate(data.createdAt) },
              {
                label: 'المخزن',
                value: data.fromWarehouseName || '—',
              },
              { label: 'المنفذ', value: data.createdBy || '—' },
            ]
          : undefined
      }
      kpis={
        doc.isFieldVisible('kpis')
          ? [
              { label: 'عدد البنود', value: formatQty(items.length), tone: 'indigo' as const },
              { label: 'إجمالي القطع', value: formatQty(totalPieces) },
              {
                label: isIssue ? 'جهة الصرف' : 'مصدر الوارد',
                value: data.toWarehouseName || '—',
              },
              ...(data.statusLabel
                ? [{ label: 'الحالة', value: data.statusLabel }]
                : []),
            ]
          : undefined
      }
      signatures={
        doc.isFieldVisible('signatures')
          ? [{ title: 'المنفذ' }, { title: 'المستلم' }, { title: 'المعتمد' }]
          : undefined
      }
    >
      {doc.isFieldVisible('lines') ? (
        <>
          <FactoryPrintSectionTitle title={isIssue ? 'بنود المنصرف' : 'بنود الإضافة'} accent={accent} />
          <FactoryPrintTable
            brandAccent={accent}
            printSettings={ps}
            columns={[
              { key: 'idx', header: '#', width: '8%', align: 'center' },
              { key: 'item', header: 'الصنف', width: doc.isFieldVisible('location') ? '36%' : '48%' },
              ...(doc.isFieldVisible('location')
                ? [{ key: 'location', header: 'الرف', width: '16%', align: 'center' as const }]
                : []),
              { key: 'unit', header: 'الوحدة', width: '12%', align: 'center' },
              { key: 'qty', header: 'الكمية', width: '14%', align: 'center' },
              ...(doc.isFieldVisible('quantityPieces')
                ? [{ key: 'pieces', header: 'قطع', width: '14%', align: 'center' as const }]
                : []),
            ]}
            rows={items.map((item, idx) => ({
              key: `${item.itemCode}-${idx}`,
              cells: {
                idx: idx + 1,
                item: (
                  <>
                    <p className="font-extrabold leading-snug">{item.itemName}</p>
                    {doc.isFieldVisible('itemCode') ? (
                      <p className="mt-0.5 font-mono text-[11px] text-slate-600">{item.itemCode || '—'}</p>
                    ) : null}
                  </>
                ),
                location: item.locationCode || '—',
                unit: item.unitLabel,
                qty: formatQty(Number(item.quantity || 0)),
                pieces: formatQty(Number(item.quantityPieces || 0)),
              },
            }))}
          />
        </>
      ) : null}

      {doc.isFieldVisible('notes') && data.note?.trim() ? (
        <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-500">ملاحظة</p>
          <p className="mt-1 text-[12px] font-bold leading-snug text-slate-800">{data.note}</p>
        </section>
      ) : null}
    </FactoryPrintShell>
  );
};

/** Compact thermal slip — FactoryPrintShell dense 80mm. */
const StockTransferThermalPrint: React.FC<{
  data: StockTransferPrintData;
  printSettings: PrintTemplateSettings;
  rootRef?: React.Ref<HTMLDivElement>;
  doc: ReturnType<typeof resolvePrintDocumentConfig>;
}> = ({ data, printSettings, rootRef, doc }) => {
  const printedAt = new Date().toLocaleString('ar-EG');
  const transferItems = resolveTransferItems(data);
  const totalPieces = transferItems.reduce((sum, item) => sum + Number(item.quantityPieces || 0), 0);
  const totalCartons = transferItems
    .filter((item) => item.unitLabel === 'كرتونة')
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const accent = resolvePrintAccentHex(printSettings.primaryColor);
  const font = resolvePrintFont(printSettings);

  return (
    <FactoryPrintShell
      ref={rootRef}
      companyName={doc.headerText || 'الشركة'}
      documentType={data.documentType?.trim() || 'إذن تحويل مخزون'}
      printDate={printedAt}
      logoUrl={printSettings.logoUrl}
      brandAccent={accent}
      footerTagline={doc.footerText || Factory_TRANSFER_FOOTER_TAGLINE}
      showVersion={false}
      extraLines={doc.customLines}
      paperWidth="80mm"
      padding="4mm 3mm"
      dense
      fontFamily={font.fontFamily}
      fontSize={font.denseFontSize}
      metaCards={[
        { label: 'من', value: data.fromWarehouseName || '—' },
        { label: 'إلى', value: data.toWarehouseName || '—' },
        { label: 'رقم', value: data.transferNo },
      ]}
      kpis={[
        { label: 'كراتين', value: formatQty(totalCartons), tone: 'indigo' },
        { label: 'قطع', value: formatQty(totalPieces) },
      ]}
    >
      {transferItems.length === 0 ? (
        <p style={{ margin: 0, fontWeight: 700, color: '#64748b' }}>لا توجد أصناف.</p>
      ) : (
        <FactoryPrintTable
          brandAccent={accent}
          printSettings={printSettings}
          dense
          columns={[
            { key: 'idx', header: '#', width: '10%', align: 'center' },
            { key: 'item', header: 'الصنف', width: '55%' },
            { key: 'qty', header: 'الكمية', width: '35%', align: 'center' },
          ]}
          rows={transferItems.map((item, idx) => ({
            key: `${item.itemCode}-${idx}`,
            cells: {
              idx: idx + 1,
              item: (
                <>
                  {item.itemName}
                  {doc.isFieldVisible('itemCode') ? (
                    <span className="mt-0.5 block font-mono text-[9px] font-bold text-slate-600">
                      {item.itemCode || '—'}
                    </span>
                  ) : null}
                  {item.locationCode ? (
                    <span className="mt-0.5 block text-[9px] font-bold text-slate-500">
                      رف {item.locationCode}
                    </span>
                  ) : null}
                </>
              ),
              qty: (
                <>
                  {formatQty(item.quantity)} {item.unitLabel}
                  {doc.isFieldVisible('quantityPieces')
                    ? ` / ${formatQty(item.quantityPieces)} قطعة`
                    : ''}
                </>
              ),
            },
          }))}
        />
      )}
    </FactoryPrintShell>
  );
};

export const StockTransferPrint = React.forwardRef<HTMLDivElement, StockTransferPrintProps>(
  ({ data, printSettings }, ref) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const docId = resolveStockVoucherPrintDocId(data.documentType);
    const font = resolvePrintFont(ps);
    const isThermal = ps.paperSize === 'thermal';
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;

    if (docId === 'stockReceipt' || docId === 'stockIssue') {
      return (
        <StockVoucherInOutDocument
          data={data}
          printSettings={ps}
          docId={docId}
          rootRef={ref}
          width={paper.width}
          paperWidth={paper.width}
          minHeight={paper.minHeight}
          padding={isThermal ? '4mm 3mm' : ps.paperSize === 'a5' ? '6mm 8mm' : '10mm 12mm'}
        />
      );
    }

    const doc = resolvePrintDocumentConfig(ps, 'stockTransfer');
    if (isThermal) {
      return <StockTransferThermalPrint data={data} printSettings={ps} rootRef={ref} doc={doc} />;
    }

    const model = buildPermitModel(data, {
      companyName: doc.headerText || 'Sokany-eg',
      accent: resolvePrintAccentHex(ps.primaryColor),
      logoUrl: ps.logoUrl,
      footerTagline: doc.footerText || Factory_TRANSFER_FOOTER_TAGLINE,
      version: __APP_VERSION__,
      showVersion: doc.isFieldVisible('version'),
      showItemCode: doc.isFieldVisible('itemCode'),
      showQuantityPieces: doc.isFieldVisible('quantityPieces'),
      showUnitsPerCarton: doc.isFieldVisible('unitsPerCarton'),
      showSignatures: doc.isFieldVisible('signatures'),
      extraLines: doc.customLines,
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      printSettings: ps,
    });

    return (
      <StockTransferPermitDocument
        model={model}
        rootRef={ref}
        width={paper.width}
        paperWidth={paper.width}
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
  printSettings?: PrintTemplateSettings;
}

export const StockTransferShareCard = React.forwardRef<HTMLDivElement, StockTransferShareCardProps>(
  (
    {
      data,
      companyName,
      version = __APP_VERSION__,
      exportRootId = 'stock-transfer-share-root',
      printSettings,
    },
    ref,
  ) => {
    if (!data) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const docId = resolveStockVoucherPrintDocId(data.documentType);

    if (docId === 'stockReceipt' || docId === 'stockIssue') {
      return (
        <StockVoucherInOutDocument
          data={data}
          printSettings={ps}
          docId={docId}
          rootRef={ref}
          rootId={exportRootId}
          width={640}
          padding="28px 32px"
        />
      );
    }

    const doc = resolvePrintDocumentConfig(ps, 'stockTransfer');
    const font = resolvePrintFont(ps);
    const model = buildPermitModel(data, {
      companyName: companyName || doc.headerText || 'مؤسسة المغربي للإستيراد',
      accent: resolvePrintAccentHex(ps.primaryColor),
      logoUrl: ps.logoUrl,
      footerTagline: doc.footerText || Factory_DEFAULT_FOOTER_TAGLINE,
      version,
      showVersion: doc.isFieldVisible('version'),
      showItemCode: doc.isFieldVisible('itemCode'),
      showQuantityPieces: doc.isFieldVisible('quantityPieces'),
      showUnitsPerCarton: doc.isFieldVisible('unitsPerCarton'),
      showSignatures: doc.isFieldVisible('signatures'),
      extraLines: doc.customLines,
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      printSettings: ps,
    });

    return (
      <StockTransferPermitDocument
        model={model}
        rootId={exportRootId}
        rootRef={ref}
        width={640}
        padding="28px 32px"
      />
    );
  },
);

StockTransferShareCard.displayName = 'StockTransferShareCard';

import type { PrintDocumentTypeId, PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintDocumentEntry } from '../../../utils/print/printDocumentRegistry';
import { resolvePrintDocumentConfig } from '../../../utils/print/resolvePrintDocumentConfig';
import type { ItemBarcodeLabel } from '../components/ItemBarcodeLabelPrint';
import type { LocationBarcodeLabel } from '../components/LocationBarcodeLabelPrint';
import { resolveItemLabelCode } from './warehouseScanLookup';

export type BarcodeLabelEngineMode = 'items' | 'locations';

export type BarcodeLabelItemOption = {
  id: string;
  code: string;
  name: string;
  barcode?: string;
};

export type BarcodeLabelLocationOption = {
  id: string;
  code: string;
  rackName?: string;
  shelf?: string;
};

export type BarcodeLabelSizeId =
  | 'a4'
  | '30x20'
  | '40x20'
  | '40x30'
  | '50x30'
  | '60x40'
  | '80x50'
  | 'custom';

export type BarcodeLabelSizePreset = {
  id: BarcodeLabelSizeId;
  labelAr: string;
  widthMm: number;
  heightMm: number;
  layout: 'grid' | 'thermal';
  columns: number;
  /** Suggested for Xprinter / thermal barcode printers */
  thermal?: boolean;
};

export type BarcodeLabelCustomMm = {
  widthMm?: number;
  heightMm?: number;
};

/** Xprinter Stock uses inches (e.g. USER 3.00 in × 4.00 in). */
export function mmToDriverInches(mm: number): string {
  return (Number(mm) / 25.4).toFixed(2);
}

export function formatDriverStockSize(widthMm: number, heightMm: number): string {
  return `${mmToDriverInches(widthMm)} in × ${mmToDriverInches(heightMm)} in`;
}

export function clampThermalLabelMm(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(15, Math.min(120, Math.round(value)));
}

export function clampThermalGapMm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THERMAL_GAP_MM;
  return Math.max(0, Math.min(8, Math.round(value * 10) / 10));
}

export function thermalPageHeightMm(labelHeightMm: number, gapMm?: number): number {
  return Number(labelHeightMm) + clampThermalGapMm(gapMm ?? DEFAULT_THERMAL_GAP_MM);
}

function thermalPreset(
  id: Exclude<BarcodeLabelSizeId, 'a4' | 'custom'>,
  widthMm: number,
  heightMm: number,
): BarcodeLabelSizePreset {
  return {
    id,
    labelAr: `حراري ${widthMm}×${heightMm} مم — ${formatDriverStockSize(widthMm, heightMm)}`,
    widthMm,
    heightMm,
    layout: 'thermal',
    columns: 1,
    thermal: true,
  };
}

export const BARCODE_LABEL_SIZE_PRESETS: readonly BarcodeLabelSizePreset[] = [
  thermalPreset('40x30', 40, 30),
  thermalPreset('50x30', 50, 30),
  thermalPreset('40x20', 40, 20),
  thermalPreset('30x20', 30, 20),
  thermalPreset('60x40', 60, 40),
  thermalPreset('80x50', 80, 50),
  {
    id: 'custom',
    labelAr: 'مخصص — قِس الاستيكر بالمليمتر',
    widthMm: 40,
    heightMm: 30,
    layout: 'thermal',
    columns: 1,
    thermal: true,
  },
  {
    id: 'a4',
    labelAr: 'A4 — عدة ملصقات في الصفحة',
    widthMm: 210,
    heightMm: 297,
    layout: 'grid',
    columns: 2,
  },
];

export const DEFAULT_BARCODE_LABEL_SIZE_ID: BarcodeLabelSizeId = '40x30';
/** Typical die-cut roll gap. Page pitch = label height + gap so copies stay aligned. */
export const DEFAULT_THERMAL_GAP_MM = 2;

/** Print-iframe class: one physical sticker + gap = one CSS page. */
export const THERMAL_BARCODE_LABEL_CLASS = 'thermal-barcode-label';
export const THERMAL_BARCODE_FACE_CLASS = 'thermal-barcode-label-face';

/** Human-readable code on the label (scan value stays original). */
export function formatBarcodeLabelDisplayCode(code: string): string {
  return String(code || '')
    .trim()
    .replace(/[-_/]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveBarcodeLabelSize(
  id?: string | null,
  customMm?: BarcodeLabelCustomMm | null,
): BarcodeLabelSizePreset {
  if (id === 'custom') {
    const widthMm = clampThermalLabelMm(Number(customMm?.widthMm), 40);
    const heightMm = clampThermalLabelMm(Number(customMm?.heightMm), 30);
    return {
      id: 'custom',
      labelAr: `حراري مخصص ${widthMm}×${heightMm} مم — ${formatDriverStockSize(widthMm, heightMm)}`,
      widthMm,
      heightMm,
      layout: 'thermal',
      columns: 1,
      thermal: true,
    };
  }
  const found = BARCODE_LABEL_SIZE_PRESETS.find((row) => row.id === id);
  return found || BARCODE_LABEL_SIZE_PRESETS.find((row) => row.id === DEFAULT_BARCODE_LABEL_SIZE_ID)!;
}

/** @page CSS for browser → Xprinter / thermal (no Bartender needed). */
export function buildBarcodeLabelPageStyle(
  sizeId?: string | null,
  customMm?: BarcodeLabelCustomMm | null,
  gapMm: number = DEFAULT_THERMAL_GAP_MM,
): string {
  const size = resolveBarcodeLabelSize(sizeId, customMm);
  if (size.layout === 'grid') {
    return `
      @page { size: A4 portrait; margin: 8mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      *, *::before, *::after { box-sizing: border-box; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
  }
  const gap = clampThermalGapMm(gapMm);
  const pageHeightMm = thermalPageHeightMm(size.heightMm, gap);
  return `
    @page { size: ${size.widthMm}mm ${pageHeightMm}mm; margin: 0; }
    html, body {
      width: ${size.widthMm}mm;
      margin: 0;
      padding: 0;
      background: #fff;
      font-size: 0;
      line-height: 0;
    }
    *, *::before, *::after { box-sizing: border-box; }
    .${THERMAL_BARCODE_LABEL_CLASS} {
      display: block;
      width: ${size.widthMm}mm;
      height: ${pageHeightMm}mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .${THERMAL_BARCODE_LABEL_CLASS}:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .${THERMAL_BARCODE_FACE_CLASS} {
      display: block;
      width: ${size.widthMm}mm;
      height: ${size.heightMm}mm;
      overflow: hidden;
      font-size: 12px;
      line-height: 1.1;
    }
    @media print {
      html, body {
        width: ${size.widthMm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .${THERMAL_BARCODE_LABEL_CLASS} {
        width: ${size.widthMm}mm !important;
        height: ${pageHeightMm}mm !important;
        max-width: ${size.widthMm}mm !important;
        max-height: ${pageHeightMm}mm !important;
        overflow: hidden !important;
      }
      .${THERMAL_BARCODE_FACE_CLASS} {
        width: ${size.widthMm}mm !important;
        height: ${size.heightMm}mm !important;
        overflow: hidden !important;
      }
      .${THERMAL_BARCODE_LABEL_CLASS} svg,
      .${THERMAL_BARCODE_LABEL_CLASS} img,
      .${THERMAL_BARCODE_LABEL_CLASS} canvas {
        max-width: 100% !important;
        width: 100% !important;
        height: 100% !important;
        display: block !important;
      }
    }
  `;
}

export function expandLabelCopies<T>(labels: T[], copies: number): T[] {
  const n = Math.max(1, Math.min(200, Math.floor(Number(copies) || 1)));
  if (n === 1) return labels;
  const out: T[] = [];
  for (const label of labels) {
    for (let i = 0; i < n; i += 1) out.push(label);
  }
  return out;
}

export function buildItemBarcodeLabels(input: {
  items: BarcodeLabelItemOption[];
  warehouseName?: string;
}): ItemBarcodeLabel[] {
  return input.items
    .map((item) => {
      const barcodeValue = resolveItemLabelCode({
        itemCode: item.code,
        barcode: item.barcode,
      });
      return {
        itemCode: String(item.code || ''),
        itemName: String(item.name || ''),
        barcodeValue,
        warehouseName: input.warehouseName,
      };
    })
    .filter((row) => row.barcodeValue);
}

export function buildLocationBarcodeLabels(input: {
  locations: BarcodeLabelLocationOption[];
  warehouseName?: string;
}): LocationBarcodeLabel[] {
  return input.locations
    .filter((loc) => String(loc.code || '').trim())
    .map((loc) => ({
      locationCode: String(loc.code || ''),
      rackName: loc.rackName,
      shelf: loc.shelf,
      warehouseName: input.warehouseName,
    }));
}

/** Apply session field toggles onto a print template clone for one document type. */
export function withBarcodeLabelFieldOverrides(
  printSettings: PrintTemplateSettings | undefined,
  documentType: Extract<PrintDocumentTypeId, 'itemBarcodeLabel' | 'locationBarcodeLabel'>,
  fields: Record<string, boolean>,
): PrintTemplateSettings {
  const base = { ...DEFAULT_PRINT_TEMPLATE, ...(printSettings || {}) };
  const documents = { ...(base.documents || {}) };
  const current = documents[documentType] || {};
  documents[documentType] = {
    ...current,
    fields: {
      ...(current.fields || {}),
      ...fields,
    },
  };
  return { ...base, documents };
}

export function defaultBarcodeLabelFields(
  documentType: Extract<PrintDocumentTypeId, 'itemBarcodeLabel' | 'locationBarcodeLabel'>,
  printSettings?: PrintTemplateSettings,
): Record<string, boolean> {
  return {
    ...resolvePrintDocumentConfig(printSettings, documentType).fields,
    qrCode: false,
    code128: true,
  };
}

export function barcodeLabelFieldDefs(
  documentType: Extract<PrintDocumentTypeId, 'itemBarcodeLabel' | 'locationBarcodeLabel'>,
) {
  return getPrintDocumentEntry(documentType).fields;
}

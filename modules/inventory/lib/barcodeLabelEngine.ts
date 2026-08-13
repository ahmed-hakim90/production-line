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

/** CSS px at 96dpi — used to size JsBarcode so bars match the sticker, not a fixed pixel strip. */
export function mmToCssPx(mm: number): number {
  return Math.max(8, (Number(mm) * 96) / 25.4);
}

/**
 * Quiet zone each side (mm). Code128 needs a small gap; keep it tiny so the bars
 * still read as full-sticker-width when the operator picks 60×40 / 80×50.
 */
export const THERMAL_BARCODE_QUIET_MM = 1;

export function thermalBarcodeFaceWidthMm(labelWidthMm: number, quietMm = THERMAL_BARCODE_QUIET_MM): number {
  return Math.max(12, Number(labelWidthMm) - quietMm * 2);
}

export type BarcodeLabelLayout = {
  warehouseMm: number;
  nameMm: number;
  codeMm: number;
  /** Fixed bar height. Hidden fields must not stretch this. */
  barcodeHeightMm: number;
  /** Percent of the sticker face. Hiding QR / raising this grows width, not height. */
  barcodeWidthPct: number;
};

export const DEFAULT_BARCODE_LABEL_LAYOUT: BarcodeLabelLayout = {
  warehouseMm: 3.2,
  nameMm: 4.4,
  codeMm: 3.6,
  barcodeHeightMm: 10,
  barcodeWidthPct: 100,
};

function clampTenths(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
}

export function resolveBarcodeLabelLayout(
  partial?: Partial<BarcodeLabelLayout> | null,
): BarcodeLabelLayout {
  const fallback = DEFAULT_BARCODE_LABEL_LAYOUT;
  return {
    warehouseMm: clampTenths(Number(partial?.warehouseMm), 2, 8, fallback.warehouseMm),
    nameMm: clampTenths(Number(partial?.nameMm), 2.5, 10, fallback.nameMm),
    codeMm: clampTenths(Number(partial?.codeMm), 2, 8, fallback.codeMm),
    barcodeHeightMm: clampTenths(Number(partial?.barcodeHeightMm), 6, 24, fallback.barcodeHeightMm),
    barcodeWidthPct: clampTenths(Number(partial?.barcodeWidthPct), 50, 100, fallback.barcodeWidthPct),
  };
}

/**
 * Barcode draw box. Height follows the operator slider (capped so text still fits).
 * Width follows the sticker face × width% and grows when QR is off.
 */
export function resolveThermalBarcodeBox(input: {
  labelWidthMm: number;
  labelHeightMm: number;
  insetMm: number;
  layout?: Partial<BarcodeLabelLayout> | null;
  textBlockMm?: number;
  showQr?: boolean;
}): { rowWidthMm: number; widthMm: number; heightMm: number } {
  const layout = resolveBarcodeLabelLayout(input.layout);
  const faceWidth = thermalBarcodeFaceWidthMm(input.labelWidthMm, input.insetMm);
  const rowWidthMm = Math.max(12, Math.round(faceWidth * (layout.barcodeWidthPct / 100) * 10) / 10);
  const qrMm = input.showQr
    ? Math.min(12, Math.max(6.5, Number(input.labelHeightMm) * 0.3))
    : 0;
  const qrGap = input.showQr ? 1.6 : 0;
  const widthMm = Math.max(12, Math.round((rowWidthMm - qrMm - qrGap) * 10) / 10);
  const usable = Math.max(6, Number(input.labelHeightMm) - input.insetMm * 2);
  const leftover = Math.max(6, usable - Number(input.textBlockMm || 0) - 0.6);
  const heightMm = Math.min(layout.barcodeHeightMm, leftover);
  return { rowWidthMm, widthMm, heightMm };
}

/** Scale JsBarcode module width so generated bars match the sticker width. */
export function scaleJsBarcodeModuleWidth(
  generatedWidthPx: number,
  targetWidthPx: number,
  baseModuleWidth: number,
): number {
  if (!(generatedWidthPx > 0) || !(targetWidthPx > 0) || !(baseModuleWidth > 0)) {
    return Math.max(0.7, baseModuleWidth || 1.4);
  }
  return Math.round(Math.max(0.7, Math.min(6, baseModuleWidth * (targetWidthPx / generatedWidthPx))) * 100) / 100;
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
        display: block !important;
        width: 100% !important;
        min-width: 100% !important;
        max-width: none !important;
        height: 100% !important;
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

export function pickBarcodeLabelOptionsByIds<T extends { id: string }>(
  options: T[],
  selectedIds: readonly string[],
): T[] {
  const allow = new Set(selectedIds.map(String).filter(Boolean));
  if (allow.size === 0) return [];
  return options.filter((row) => allow.has(String(row.id)));
}

export function toggleSelectedBarcodeId(
  ids: readonly string[],
  id: string,
  selected: boolean,
): string[] {
  const key = String(id || '').trim();
  if (!key) return ids.map(String);
  const next = new Set(ids.map(String).filter(Boolean));
  if (selected) next.add(key);
  else next.delete(key);
  return Array.from(next);
}

export function mergeVisibleBarcodeIds(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const next = new Set(selectedIds.map(String).filter(Boolean));
  for (const id of visibleIds) {
    const key = String(id || '').trim();
    if (key) next.add(key);
  }
  return Array.from(next);
}

export function filterBarcodeLabelChoices(
  options: Array<{ value: string; label: string }>,
  query: string,
): Array<{ value: string; label: string }> {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => `${opt.label} ${opt.value}`.toLowerCase().includes(q));
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

export type StoredBarcodeLabelPrefs = {
  sizeId: BarcodeLabelSizeId;
  widthMm: number;
  heightMm: number;
  gapMm: number;
  layout: BarcodeLabelLayout;
  itemFields?: Record<string, boolean>;
  locationFields?: Record<string, boolean>;
};

function sanitizeStoredFieldMap(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 40) continue;
    if (typeof val === 'boolean') out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Parse device-saved barcode print prefs. Rejects unknown paper sizes and non-boolean field flags. */
export function parseStoredBarcodeLabelPrefs(raw: unknown): StoredBarcodeLabelPrefs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = raw as Record<string, unknown>;
  if (!BARCODE_LABEL_SIZE_PRESETS.some((row) => row.id === parsed.sizeId)) return null;
  return {
    sizeId: parsed.sizeId as BarcodeLabelSizeId,
    widthMm: clampThermalLabelMm(Number(parsed.widthMm), 40),
    heightMm: clampThermalLabelMm(Number(parsed.heightMm), 30),
    gapMm: clampThermalGapMm(Number(parsed.gapMm ?? DEFAULT_THERMAL_GAP_MM)),
    layout: resolveBarcodeLabelLayout(parsed.layout as Partial<BarcodeLabelLayout> | undefined),
    itemFields: sanitizeStoredFieldMap(parsed.itemFields),
    locationFields: sanitizeStoredFieldMap(parsed.locationFields),
  };
}

export function mergeBarcodeLabelFields(
  documentType: Extract<PrintDocumentTypeId, 'itemBarcodeLabel' | 'locationBarcodeLabel'>,
  printSettings?: PrintTemplateSettings,
  stored?: Record<string, boolean> | null,
): Record<string, boolean> {
  const defaults = defaultBarcodeLabelFields(documentType, printSettings);
  if (!stored) return defaults;
  const allowed = new Set(barcodeLabelFieldDefs(documentType).map((field) => field.key));
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(stored)) {
    if (allowed.has(key) && typeof value === 'boolean') merged[key] = value;
  }
  return merged;
}

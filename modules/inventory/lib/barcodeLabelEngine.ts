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

export type BarcodeLabelSizeId = 'a4' | '40x30' | '50x30' | '60x40' | '80x50';

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

export const BARCODE_LABEL_SIZE_PRESETS: readonly BarcodeLabelSizePreset[] = [
  {
    id: '40x30',
    labelAr: 'حراري 40×30 مم — Xprinter',
    widthMm: 40,
    heightMm: 30,
    layout: 'thermal',
    columns: 1,
    thermal: true,
  },
  {
    id: '50x30',
    labelAr: 'حراري 50×30 مم',
    widthMm: 50,
    heightMm: 30,
    layout: 'thermal',
    columns: 1,
    thermal: true,
  },
  {
    id: '60x40',
    labelAr: 'حراري 60×40 مم',
    widthMm: 60,
    heightMm: 40,
    layout: 'thermal',
    columns: 1,
    thermal: true,
  },
  {
    id: '80x50',
    labelAr: 'حراري 80×50 مم',
    widthMm: 80,
    heightMm: 50,
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
] as const;

export const DEFAULT_BARCODE_LABEL_SIZE_ID: BarcodeLabelSizeId = '40x30';

/** Human-readable code on the label (scan value stays original). */
export function formatBarcodeLabelDisplayCode(code: string): string {
  return String(code || '')
    .trim()
    .replace(/[-_/]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveBarcodeLabelSize(id?: string | null): BarcodeLabelSizePreset {
  const found = BARCODE_LABEL_SIZE_PRESETS.find((row) => row.id === id);
  return found || BARCODE_LABEL_SIZE_PRESETS.find((row) => row.id === DEFAULT_BARCODE_LABEL_SIZE_ID)!;
}

/** @page CSS for browser → Xprinter / thermal (no Bartender needed). */
export function buildBarcodeLabelPageStyle(sizeId?: string | null): string {
  const size = resolveBarcodeLabelSize(sizeId);
  if (size.layout === 'grid') {
    return `
      @page { size: A4 portrait; margin: 8mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
  }
  return `
    @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
    @media print {
      html, body {
        width: ${size.widthMm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  return { ...resolvePrintDocumentConfig(printSettings, documentType).fields };
}

export function barcodeLabelFieldDefs(
  documentType: Extract<PrintDocumentTypeId, 'itemBarcodeLabel' | 'locationBarcodeLabel'>,
) {
  return getPrintDocumentEntry(documentType).fields;
}

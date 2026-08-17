import type { PrintFontFamily, PrintTemplateSettings } from '../../types';

export const PRINT_FONT_FAMILIES: ReadonlyArray<{
  value: PrintFontFamily;
  labelAr: string;
}> = [
  { value: 'Cairo', labelAr: 'Cairo' },
  { value: 'Tajawal', labelAr: 'Tajawal' },
  { value: 'Noto Sans Arabic', labelAr: 'Noto Sans Arabic' },
  { value: 'IBM Plex Sans Arabic', labelAr: 'IBM Plex Sans Arabic' },
  { value: 'Tahoma', labelAr: 'Tahoma' },
  { value: 'Arial', labelAr: 'Arial' },
];

export const PRINT_FONT_SIZE_MIN = 8;
export const PRINT_FONT_SIZE_MAX = 14;
export const PRINT_FONT_SIZE_DEFAULT = 10;

/** Arabic body leading — tight 1.15 clips mixed AR/EN names on KPI cards. */
export const PRINT_FONT_LINE_HEIGHT = 1.5;
export const PRINT_FONT_LINE_HEIGHT_HEADING = 1.4;
export const PRINT_FONT_LINE_HEIGHT_METRIC = 1.25;

/** Cairo/Tajawal/Noto stacks in index.html stop at 800 — 900 becomes faux-bold. */
export const PRINT_FONT_WEIGHT_BODY = 600;
export const PRINT_FONT_WEIGHT_BOLD = 700;
export const PRINT_FONT_WEIGHT_HEADING = 800;

const FONT_STACKS: Record<PrintFontFamily, string> = {
  Cairo: "'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
  Tajawal: "'Tajawal', 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
  'Noto Sans Arabic': "'Noto Sans Arabic', 'Cairo', Tahoma, sans-serif",
  'IBM Plex Sans Arabic': "'IBM Plex Sans Arabic', 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif",
  Tahoma: "Tahoma, 'Cairo', 'Noto Sans Arabic', Arial, sans-serif",
  Arial: "Arial, Tahoma, 'Cairo', sans-serif",
};

const ALLOWED = new Set<string>(PRINT_FONT_FAMILIES.map((f) => f.value));

export function normalizePrintFontFamily(
  value: string | null | undefined,
): PrintFontFamily {
  if (value && ALLOWED.has(value)) return value as PrintFontFamily;
  return 'Cairo';
}

export function clampPrintFontSizePt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return PRINT_FONT_SIZE_DEFAULT;
  return Math.max(PRINT_FONT_SIZE_MIN, Math.min(PRINT_FONT_SIZE_MAX, Math.round(n)));
}

export function parsePrintFontSizePt(value: string | number | null | undefined): number {
  if (typeof value === 'number') return clampPrintFontSizePt(value);
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return clampPrintFontSizePt(n);
  }
  return PRINT_FONT_SIZE_DEFAULT;
}

export type PrintKpiValueKind = 'metric' | 'code' | 'text';

/**
 * KPI chrome uses a large display size for short numbers.
 * Product names / plan labels must stay at body-like size or they overflow.
 */
export function classifyPrintKpiValue(value: string | number): PrintKpiValueKind {
  if (typeof value === 'number' && Number.isFinite(value)) return 'metric';
  const s = String(value ?? '').trim();
  if (!s || s === '—') return 'text';
  const compact = s.replace(/[\s,]/g, '');
  if (/^[+-]?\d+(\.\d+)?$/.test(compact) && compact.length <= 14) return 'metric';
  if (s.length <= 14 && !/\s/.test(s)) return 'code';
  return 'text';
}

export type PrintFontScale = {
  caption: string;
  label: string;
  body: string;
  meta: string;
  table: string;
  heading: string;
  kpiMetric: string;
  kpiCode: string;
  kpiText: string;
};

export function buildPrintFontScale(fontSizePt: number, dense = false): PrintFontScale {
  const pt = clampPrintFontSizePt(fontSizePt);
  const headingBoost = dense ? 3 : 4;
  const metricBoost = dense ? 4 : 5;
  const codeBoost = dense ? 2 : 3;
  const textBoost = dense ? 0 : 1;
  return {
    caption: `${Math.max(7, pt - 2)}pt`,
    label: `${Math.max(8, pt - 1)}pt`,
    body: `${pt}pt`,
    meta: `${pt + (dense ? 0 : 1)}pt`,
    table: `${pt + (dense ? 0 : 1)}pt`,
    heading: `${pt + headingBoost}pt`,
    kpiMetric: `${pt + metricBoost}pt`,
    kpiCode: `${pt + codeBoost}pt`,
    kpiText: `${pt + textBoost}pt`,
  };
}

export type ResolvedPrintFont = {
  family: PrintFontFamily;
  /** CSS font-family stack */
  fontFamily: string;
  /** Base body size in pt */
  fontSizePt: number;
  /** CSS font-size for regular paper */
  fontSize: string;
  /** Slightly smaller size for thermal / dense layouts */
  denseFontSize: string;
  lineHeight: number;
  scale: PrintFontScale;
  denseScale: PrintFontScale;
};

export function resolvePrintFont(
  printSettings?: Pick<PrintTemplateSettings, 'printFontFamily' | 'printFontSizePt'> | null,
): ResolvedPrintFont {
  const family = normalizePrintFontFamily(printSettings?.printFontFamily);
  const fontSizePt = clampPrintFontSizePt(printSettings?.printFontSizePt);
  const densePt = Math.max(PRINT_FONT_SIZE_MIN - 1, fontSizePt - 2);
  return {
    family,
    fontFamily: FONT_STACKS[family],
    fontSizePt,
    fontSize: `${fontSizePt}pt`,
    denseFontSize: `${densePt}pt`,
    lineHeight: PRINT_FONT_LINE_HEIGHT,
    scale: buildPrintFontScale(fontSizePt, false),
    denseScale: buildPrintFontScale(densePt, true),
  };
}

export function printFontCssVars(input: {
  fontFamily: string;
  fontSize: string;
  lineHeight?: number;
  scale: PrintFontScale;
}): Record<string, string> {
  return {
    '--print-font-family': input.fontFamily,
    '--print-font-size': input.fontSize,
    '--print-line-height': String(input.lineHeight ?? PRINT_FONT_LINE_HEIGHT),
    '--print-heading-size': input.scale.heading,
    '--print-label-size': input.scale.label,
    '--print-meta-size': input.scale.meta,
    '--print-table-size': input.scale.table,
    '--print-caption-size': input.scale.caption,
  };
}

export function resolvePrintKpiTypography(
  value: string | number,
  scale: PrintFontScale,
): {
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
  fontVariantNumeric?: 'tabular-nums';
} {
  const kind = classifyPrintKpiValue(value);
  if (kind === 'metric') {
    return {
      fontSize: scale.kpiMetric,
      fontWeight: PRINT_FONT_WEIGHT_HEADING,
      lineHeight: PRINT_FONT_LINE_HEIGHT_METRIC,
      fontVariantNumeric: 'tabular-nums',
    };
  }
  if (kind === 'code') {
    return {
      fontSize: scale.kpiCode,
      fontWeight: PRINT_FONT_WEIGHT_HEADING,
      lineHeight: PRINT_FONT_LINE_HEIGHT_METRIC,
      fontVariantNumeric: 'tabular-nums',
    };
  }
  return {
    fontSize: scale.kpiText,
    fontWeight: PRINT_FONT_WEIGHT_BOLD,
    lineHeight: PRINT_FONT_LINE_HEIGHT,
  };
}

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
  };
}

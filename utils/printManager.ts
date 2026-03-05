import { useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { RefObject } from 'react';
import type { PrintTemplateSettings } from '../types';
import { DEFAULT_PRINT_TEMPLATE } from './dashboardConfig';

const PAPER_LABELS: Record<string, string> = {
  a4: 'A4',
  a5: 'A5',
  thermal: '80mm',
};

const clampMm = (value: number) => {
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.min(30, value));
};

export const buildGlobalPrintPageStyle = (settings?: PrintTemplateSettings): string => {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...settings };
  const pageSize = PAPER_LABELS[ps.paperSize] ?? 'A4';
  const orientation = ps.orientation === 'landscape' ? 'landscape' : 'portrait';
  const mt = clampMm(ps.marginTopMm);
  const mr = clampMm(ps.marginRightMm);
  const mb = clampMm(ps.marginBottomMm);
  const ml = clampMm(ps.marginLeftMm);
  // Force exact color rendering in print to keep report palettes readable
  // across A4/A5/thermal templates and avoid faded "economy" output.
  const colorAdjust = 'exact';

  return `
    @page {
      size: ${pageSize} ${orientation};
      margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
      }
      body {
        -webkit-print-color-adjust: ${colorAdjust};
        print-color-adjust: ${colorAdjust};
      }
    }
  `;
};

interface UseManagedPrintOptions {
  contentRef: RefObject<HTMLElement | null>;
  printSettings?: PrintTemplateSettings;
  documentTitle?: string;
}

export const useManagedPrint = ({
  contentRef,
  printSettings,
  documentTitle,
}: UseManagedPrintOptions) => {
  const pageStyle = useMemo(
    () => buildGlobalPrintPageStyle(printSettings),
    [printSettings],
  );

  return useReactToPrint({
    contentRef,
    documentTitle,
    pageStyle,
  });
};


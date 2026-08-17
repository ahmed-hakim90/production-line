import { flushSync } from 'react-dom';
import type { PrintTemplateSettings } from '../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../dashboardConfig';
import { PRINT_ENGINE_IFRAME_CSS, PRINT_SURFACE } from './printSurface';

const PAPER_LABELS: Record<string, string> = {
  a4: 'A4',
  a5: 'A5',
  thermal: '80mm',
};

const clampMm = (value: number) => {
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.min(30, value));
};

const PRINT_CSS_VAR_KEYS = [
  '--color-card',
  '--color-bg',
  '--color-border',
  '--color-text',
  '--color-text-muted',
  '--color-surface-hover',
  '--color-primary-hex',
] as const;

function collectPrintCssVars(): string {
  const fallbacks: Record<string, string> = {
    '--color-card': PRINT_SURFACE.card,
    '--color-bg': PRINT_SURFACE.bg,
    '--color-border': PRINT_SURFACE.border,
    '--color-text': PRINT_SURFACE.text,
    '--color-text-muted': PRINT_SURFACE.muted,
    '--color-surface-hover': PRINT_SURFACE.bg,
    '--color-primary-hex': '#1f2937',
  };
  if (typeof document === 'undefined') {
    return Object.entries(fallbacks).map(([k, v]) => `${k}: ${v};`).join(' ');
  }
  const computed = getComputedStyle(document.documentElement);
  return PRINT_CSS_VAR_KEYS.map((key) => {
    const live = computed.getPropertyValue(key).trim();
    return `${key}: ${live || fallbacks[key]};`;
  }).join(' ');
}

export const buildGlobalPrintPageStyle = (settings?: PrintTemplateSettings): string => {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...settings };
  const pageSize = PAPER_LABELS[ps.paperSize] ?? 'A4';
  const orientation = ps.orientation === 'landscape' ? 'landscape' : 'portrait';
  const mt = clampMm(ps.marginTopMm);
  const mr = clampMm(ps.marginRightMm);
  const mb = clampMm(ps.marginBottomMm);
  const ml = clampMm(ps.marginLeftMm);
  const colorAdjust = 'exact';
  const rootVars = collectPrintCssVars();

  return `
    :root, html, body {
      ${rootVars}
      background: ${PRINT_SURFACE.card} !important;
      color: ${PRINT_SURFACE.text} !important;
    }
    @page {
      size: ${pageSize} ${orientation};
      margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
    }
    @media print {
      html, body {
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: ${PRINT_SURFACE.card} !important;
        color: ${PRINT_SURFACE.text} !important;
      }
      body {
        -webkit-print-color-adjust: ${colorAdjust};
        print-color-adjust: ${colorAdjust};
      }
      header {
        display: flex !important;
      }
      .print-root,
      .print-report,
      .arabic-export-root {
        width: 100% !important;
        max-width: none !important;
        min-width: 0 !important;
        margin: 0 !important;
        margin-inline: 0 !important;
        box-sizing: border-box !important;
      }
      .print-root table th,
      .print-root table td,
      .print-report table th,
      .print-report table td {
        padding: 8px !important;
      }
    }
    ${PRINT_ENGINE_IFRAME_CSS}
  `;
};

export function resolvePrintEnginePageStyle(options?: {
  printSettings?: PrintTemplateSettings;
  pageStyle?: string;
}): string {
  return options?.pageStyle || buildGlobalPrintPageStyle(options?.printSettings);
}

/** Wait until React layout is painted, then print the already-mounted engine document. */
export function printAfterPaint(print: () => void): void {
  const fire = () => print();
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(fire, 0);
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(fire);
  });
}

/** Commit print payload synchronously, then print the mounted engine document. */
export function commitAndPrint(update: () => void, print: () => void): void {
  flushSync(update);
  printAfterPaint(print);
}

/**
 * Report Export Utilities — PDF generation & WhatsApp image sharing.
 * Uses html2canvas + jsPDF. Print is handled by react-to-print in components.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PaperSize, PaperOrientation } from '../types';

// ─── Capture options (PNG / PDF / share) ───────────────────────────────────

export interface CaptureOptions {
  /**
   * Inject RTL + Cairo on the cloned document so Arabic exports reliably (html2canvas).
   * Default true.
   */
  cloneRtlAndFonts?: boolean;
  /** Optional fixed canvas width in pixels (narrow cards). */
  width?: number;
  /** Optional window width hint for html2canvas layout. */
  windowWidth?: number;
  /** Optional window height hint for html2canvas clone (avoids clipped/tall captures). */
  windowHeight?: number;
}

const applyRtlFontClone = (clonedDoc: Document) => {
  clonedDoc.documentElement.setAttribute('dir', 'rtl');
  clonedDoc.documentElement.setAttribute('lang', 'ar');
  clonedDoc.documentElement.style.direction = 'rtl';

  /**
   * Do not inject a Google Fonts <link> here — it loads asynchronously and html2canvas
   * rasterizes before the font applies, causing intermittent wrong Arabic/layout.
   * Cairo is preloaded in the real document via ensureCairoLoaded() before capture.
   */
  const style = clonedDoc.createElement('style');
  /* letter-spacing (e.g. Tailwind tracking-*) breaks Arabic cursive joins in html2canvas */
  style.textContent = `
    html, body {
      direction: rtl !important;
    }
    .print-root, .print-report, .arabic-export-root,
    .print-root *, .print-report *, .arabic-export-root * {
      letter-spacing: normal !important;
      word-spacing: normal !important;
      font-variant-ligatures: normal !important;
      font-family: 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif !important;
    }
  `;
  clonedDoc.head.appendChild(style);
};

const ensureCairoLoaded = async () => {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const fonts = (document as Document & { fonts: FontFaceSet }).fonts;
  try {
    await fonts.ready;
    await Promise.all([
      fonts.load("400 13px Cairo"),
      fonts.load("600 13px Cairo"),
      fonts.load("700 18px Cairo"),
    ]);
  } catch {
    /* ignore */
  }
};

/** Min clone viewport width for Hakim print/share cards (matches PrintReportLayout `w-[640px]`). */
const EXPORT_CARD_MIN_WINDOW_WIDTH = 640;

const isWideExportCardRoot = (node: HTMLElement): boolean =>
  node.matches('.print-root, .print-report, .arabic-export-root') ||
  !!node.querySelector('.print-root, .print-report, .arabic-export-root');

const waitForImagesInElement = async (root: HTMLElement, timeoutMs = 4000) => {
  const imgs = [...root.querySelectorAll('img')] as HTMLImageElement[];
  if (!imgs.length) return;

  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const finish = () => resolve();
          if (img.complete && img.naturalWidth > 0) {
            finish();
            return;
          }
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
          setTimeout(finish, timeoutMs);
        }),
    ),
  );

  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (typeof img.decode === 'function') await img.decode();
      } catch {
        /* decode can reject for broken images; capture still proceeds */
      }
    }),
  );
};

/**
 * Lets React commit and the browser paint before html2canvas reads layout.
 * Optional extra delay (ms) after two animation frames — use after heavy state updates.
 */
export const waitForExportPaint = (extraDelayMs = 0): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (extraDelayMs > 0) setTimeout(resolve, extraDelayMs);
        else queueMicrotask(resolve);
      });
    });
  });

// ─── Capture a DOM element as a canvas ──────────────────────────────────────

const capture = async (el: HTMLElement, options?: CaptureOptions) => {
  const { cloneRtlAndFonts = true, width, windowWidth, windowHeight } = options ?? {};

  await ensureCairoLoaded();
  await waitForImagesInElement(el);
  await waitForExportPaint();

  /**
   * html2canvas defaults `windowWidth` to the document width. On phones that is ~360–430px
   * while print cards use fixed widths (e.g. 640px). The clone then lays out like a narrow
   * viewport → squeezed column with large side margins in the PNG. Size the clone from the
   * target element instead (see also StockTransactions share with explicit windowWidth).
   */
  const rect = el.getBoundingClientRect();
  const measuredW = Math.max(1, el.scrollWidth, el.offsetWidth, Math.round(rect.width));
  const measuredH = Math.max(1, el.scrollHeight, el.offsetHeight, Math.round(rect.height));
  const wideCard = isWideExportCardRoot(el);
  const winW =
    windowWidth != null ? windowWidth : width != null ? width : wideCard
      ? Math.max(measuredW, EXPORT_CARD_MIN_WINDOW_WIDTH)
      : measuredW;
  const winH = windowHeight ?? measuredH;

  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    ...(width != null ? { width } : {}),
    windowWidth: winW,
    windowHeight: winH,
    ...(cloneRtlAndFonts
      ? {
          onclone: (clonedDoc: Document) => {
            applyRtlFontClone(clonedDoc);
          },
        }
      : {}),
  });
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg' = 'image/png',
  quality?: number,
): Promise<Blob> =>
  new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b!), type, quality);
  });

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const toSafeFileBaseName = (raw: string) => {
  const cleaned = raw
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || `report-image-${Date.now()}`;
};

const PAPER_PT: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  thermal: [226.77, 841.89],
};

// ─── Export element to PDF (configurable paper & orientation) ────────────────

export interface ExportPDFOptions {
  paperSize?: PaperSize;
  orientation?: PaperOrientation;
  copies?: number;
}

const addCanvasToPdfPages = (
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  pageW: number,
  pageH: number,
  margin: number,
  addNewPageBeforeFirstSlice: boolean,
) => {
  const imgData = canvas.toDataURL('image/png');
  const imgW = canvas.width;
  const imgH = canvas.height;
  const contentW = pageW - margin * 2;
  const ratio = contentW / imgW;
  const scaledH = imgH * ratio;

  if (scaledH + margin * 2 <= pageH) {
    if (addNewPageBeforeFirstSlice) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin, contentW, scaledH);
    return;
  }

  const contentH = pageH - margin * 2;
  let offset = 0;
  let firstSlice = true;
  while (offset < scaledH) {
    if (addNewPageBeforeFirstSlice || !firstSlice) pdf.addPage();
    firstSlice = false;
    const srcY = offset / ratio;
    const srcH = Math.min(contentH / ratio, imgH - srcY);
    const dstH = srcH * ratio;
    const slice = document.createElement('canvas');
    slice.width = imgW;
    slice.height = srcH;
    const ctx = slice.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentW, dstH);
    }
    offset += contentH;
  }
};

export const exportToPDF = async (
  el: HTMLElement,
  fileName: string,
  options?: ExportPDFOptions,
) => {
  const canvas = await capture(el);

  const paperSize = options?.paperSize ?? 'a4';
  const orientation = options?.orientation ?? 'portrait';
  const copies = options?.copies ?? 1;

  const [baseW, baseH] = PAPER_PT[paperSize] || PAPER_PT.a4;
  const pageW = orientation === 'landscape' ? baseH : baseW;
  const pageH = orientation === 'landscape' ? baseW : baseH;
  const m = 20;

  const format = paperSize === 'thermal' ? [baseW, baseH] : paperSize;

  const pdf = new jsPDF({ orientation, unit: 'pt', format });

  for (let c = 0; c < copies; c++) {
    addCanvasToPdfPages(pdf, canvas, pageW, pageH, m, c !== 0);
  }

  pdf.save(`${fileName}.pdf`);
};

export const exportElementsToSinglePDF = async (
  elements: HTMLElement[],
  fileName: string,
  options?: ExportPDFOptions,
) => {
  if (!elements.length) return;

  const paperSize = options?.paperSize ?? 'a4';
  const orientation = options?.orientation ?? 'portrait';
  const copies = options?.copies ?? 1;
  const [baseW, baseH] = PAPER_PT[paperSize] || PAPER_PT.a4;
  const pageW = orientation === 'landscape' ? baseH : baseW;
  const pageH = orientation === 'landscape' ? baseW : baseH;
  const m = 20;
  const format = paperSize === 'thermal' ? [baseW, baseH] : paperSize;

  for (let c = 0; c < copies; c++) {
    let pdf: jsPDF | null = null;
    let hasWrittenPage = false;

    for (let i = 0; i < elements.length; i++) {
      const canvas = await capture(elements[i]);
      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: 'pt', format });
        addCanvasToPdfPages(pdf, canvas, pageW, pageH, m, false);
      } else {
        addCanvasToPdfPages(pdf, canvas, pageW, pageH, m, true);
      }
      hasWrittenPage = true;
    }

    if (pdf && hasWrittenPage) {
      const suffix = copies > 1 ? `-${c + 1}` : '';
      pdf.save(`${fileName}${suffix}.pdf`);
    }
  }
};

// ─── Export element as image (PNG download) ─────────────────────────────────

export const exportAsImage = async (
  el: HTMLElement,
  fileName: string,
  captureOptions?: CaptureOptions,
) => {
  const canvas = await capture(el, captureOptions);
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, `${fileName}.png`);
};

// ─── Share result type ──────────────────────────────────────────────────────

export type ShareResult = {
  method: 'native_share' | 'cancelled' | 'clipboard_and_download' | 'download_only';
  copied: boolean;
};

// ─── Share as image to WhatsApp ─────────────────────────────────────────────

const MOBILE_SHARE_JPEG_QUALITY = 0.97;

export const shareToWhatsApp = async (
  el: HTMLElement,
  title: string,
  captureOptions?: CaptureOptions,
): Promise<ShareResult> => {
  const canvas = await capture(el, captureOptions);
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  const fileBaseName = toSafeFileBaseName(title);

  const tryNativeShare = async (file: File): Promise<ShareResult | null> => {
    if (!navigator.share) return null;
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) return null;
      await navigator.share({ files: [file], title });
      return { method: 'native_share', copied: false };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { method: 'cancelled', copied: false };
      }
      return null;
    }
  };

  const pngFile = new File([pngBlob], `${fileBaseName}.png`, { type: 'image/png' });

  // Mobile: prefer PNG for sharp borders/text; fall back to high-quality JPEG if share target rejects PNG
  if (isMobile()) {
    const pngShare = await tryNativeShare(pngFile);
    if (pngShare) return pngShare;
    const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', MOBILE_SHARE_JPEG_QUALITY);
    const jpgFile = new File([jpgBlob], `${fileBaseName}.jpg`, { type: 'image/jpeg' });
    const jpgShare = await tryNativeShare(jpgFile);
    if (jpgShare) return jpgShare;
  } else {
    const desktopResult = await tryNativeShare(pngFile);
    if (desktopResult) return desktopResult;
  }

  const isMobileDevice = isMobile();
  downloadBlob(pngBlob, `${fileBaseName}.png`);

  let copied = false;

  if (isMobileDevice) {
    setTimeout(() => {
      window.location.href = 'whatsapp://send';
    }, 250);
  } else {
    try {
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob }),
        ]);
        copied = true;
      }
    } catch {
      // Clipboard write not supported
    }
    window.open('https://web.whatsapp.com/', '_blank');
  }

  return { method: copied ? 'clipboard_and_download' : 'download_only', copied };
};

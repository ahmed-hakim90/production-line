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

  const link = clonedDoc.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap';
  clonedDoc.head.appendChild(link);

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

// ─── Capture a DOM element as a canvas ──────────────────────────────────────

const capture = async (el: HTMLElement, options?: CaptureOptions) => {
  const { cloneRtlAndFonts = true, width, windowWidth, windowHeight } = options ?? {};

  await ensureCairoLoaded();

  /**
   * html2canvas defaults `windowWidth` to the document width. On phones that is ~360–430px
   * while print cards use fixed widths (e.g. 640px). The clone then lays out like a narrow
   * viewport → squeezed column with large side margins in the PNG. Size the clone from the
   * target element instead (see also StockTransactions share with explicit windowWidth).
   */
  const rect = el.getBoundingClientRect();
  const measuredW = Math.max(1, el.scrollWidth, el.offsetWidth, Math.round(rect.width));
  const measuredH = Math.max(1, el.scrollHeight, el.offsetHeight, Math.round(rect.height));
  const winW = windowWidth ?? (width != null ? width : measuredW);
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

export const shareToWhatsApp = async (
  el: HTMLElement,
  title: string,
  captureOptions?: CaptureOptions,
): Promise<ShareResult> => {
  const canvas = await capture(el, captureOptions);
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
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

  // Mobile: prefer JPEG for smaller share payload
  if (isMobile()) {
    const mobileFile = new File([jpgBlob], `${fileBaseName}.jpg`, { type: 'image/jpeg' });
    const mobileResult = await tryNativeShare(mobileFile);
    if (mobileResult) return mobileResult;
  } else {
    // Desktop: some browsers support Web Share with files (e.g. Chrome)
    const pngFile = new File([pngBlob], `${fileBaseName}.png`, { type: 'image/png' });
    const desktopResult = await tryNativeShare(pngFile);
    if (desktopResult) return desktopResult;
  }

  const isMobileDevice = isMobile();
  const fileName = `${fileBaseName}.${isMobileDevice ? 'jpg' : 'png'}`;
  const downloadTargetBlob = isMobileDevice ? jpgBlob : pngBlob;
  downloadBlob(downloadTargetBlob, fileName);

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

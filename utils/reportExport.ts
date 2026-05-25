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

/** Options for `shareToWhatsApp`: html2canvas capture + optional plain-text caption (Web Share). */
export type ShareToWhatsAppOptions = CaptureOptions & {
  /**
   * Plain text paired with the image when the OS share sheet supports it
   * (often appears as WhatsApp image caption on Android).
   */
  caption?: string;
};

const applyRtlFontClone = (clonedDoc: Document) => {
  clonedDoc.documentElement.setAttribute('dir', 'ltr');
  clonedDoc.documentElement.setAttribute('lang', 'ar');
  clonedDoc.documentElement.style.direction = 'ltr';

  /**
   * Do not inject a Google Fonts <link> here — it loads asynchronously and html2canvas
   * rasterizes before the font applies, causing intermittent wrong Arabic/layout.
   * Cairo is preloaded in the real document via ensureCairoLoaded() before capture.
   */
  const style = clonedDoc.createElement('style');
  /* letter-spacing (e.g. Tailwind tracking-*) breaks Arabic cursive joins in html2canvas */
  style.textContent = `
    html, body {
      direction: ltr !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
    }
    .print-root, .print-report, .arabic-export-root {
      direction: rtl !important;
    }
    .print-root, .print-report, .arabic-export-root,
    .print-root *, .print-report *, .arabic-export-root * {
      letter-spacing: normal !important;
      word-spacing: normal !important;
      font-variant-ligatures: normal !important;
      font-family: 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif !important;
    }
    /* html2canvas often ignores Tailwind grid at narrow viewport widths */
    .print-report .grid {
      display: grid !important;
    }
    .print-report .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }
    .print-report .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .print-report .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
    .print-report .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
    .print-report .gap-2 { gap: 0.5rem !important; }
    .print-report .flex { display: flex !important; }
    .print-report .rounded-lg { border-radius: 0.5rem !important; }
    .print-report .rounded-md { border-radius: 0.375rem !important; }
    .print-report .border { border-width: 1px !important; border-style: solid !important; }
    .print-report .border-2 { border-width: 2px !important; border-style: solid !important; }
    .print-report .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
    .print-report .border-b-2 { border-bottom-width: 2px !important; border-bottom-style: solid !important; }
    .print-report .border-t { border-top-width: 1px !important; border-top-style: solid !important; }
    .print-report .border-l { border-left-width: 1px !important; border-left-style: solid !important; }
    .print-report .border-slate-100 { border-color: #f1f5f9 !important; }
    .print-report .border-slate-200 { border-color: #e2e8f0 !important; }
    .print-report .bg-slate-50 { background-color: #f8fafc !important; }
    .print-report .bg-white { background-color: #ffffff !important; }
    .print-report .text-slate-400 { color: #94a3b8 !important; }
    .print-report .text-slate-500 { color: #64748b !important; }
    .print-report .text-slate-800 { color: #1e293b !important; }
    .print-report .text-slate-900 { color: #0f172a !important; }
    .print-report .overflow-hidden { overflow: hidden !important; }
    .print-report .shrink-0 { flex-shrink: 0 !important; }
    .print-report .self-stretch { align-self: stretch !important; }
    .print-report .w-\\[3px\\] { width: 3px !important; min-width: 3px !important; }
    .print-report .min-h-\\[5\\.25rem\\] { min-height: 5.25rem !important; }
    .print-report table.erp-table { width: 100% !important; border-collapse: collapse !important; }
    .print-report table.erp-table td { border-bottom: 1px solid #f1f5f9 !important; }
    .arabic-export-root .border-slate-200 { border-color: #e2e8f0 !important; }
    .arabic-export-root .bg-slate-50 { background-color: #f8fafc !important; }
    .arabic-export-root .border-emerald-200 { border-color: #a7f3d0 !important; }
    .arabic-export-root .bg-emerald-50 { background-color: #ecfdf5 !important; }
    .arabic-export-root .border-rose-200 { border-color: #fecdd3 !important; }
    .arabic-export-root .bg-rose-50 { background-color: #fff1f2 !important; }
    .arabic-export-root .border-amber-200 { border-color: #fde68a !important; }
    .arabic-export-root .bg-amber-50 { background-color: #fffbeb !important; }
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

/** Fixed capture width for standard Factory report cards (image output is 1280px at scale 2). */
const STANDARD_REPORT_CAPTURE_WIDTH = 640;

const isStandardReportCardRoot = (node: HTMLElement): boolean =>
  node.matches('.print-report') || !!node.querySelector('.print-report');

/**
 * Prefer the Factory report card root for capture. When the ref sits on an outer
 * share wrapper (variance banner + nested PrintReportLayout), keep the outer node
 * so the full share image is captured.
 */
const resolveStandardReportRoot = (el: HTMLElement): HTMLElement => {
  if (el.matches('.print-report')) {
    const nested = el.querySelector(':scope .print-report');
    if (nested && nested !== el) return el;
    return el;
  }
  const inner = el.querySelector('.print-report');
  return (inner as HTMLElement | null) ?? el;
};

const measureExportElement = (node: HTMLElement) => {
  const rect = node.getBoundingClientRect();
  const candidateWidths = [
    node.scrollWidth,
    node.offsetWidth,
    Math.round(rect.width),
  ];
  const candidateHeights = [
    node.scrollHeight,
    node.offsetHeight,
    Math.round(rect.height),
  ];

  const width = Math.max(1, ...candidateWidths.filter((value) => Number.isFinite(value) && value > 0));
  const height = Math.max(1, ...candidateHeights.filter((value) => Number.isFinite(value) && value > 0));

  return { width, height };
};

const stablePixelWidth = (value: number) => `${Math.ceil(Math.max(1, value))}px`;

const prepareStableCaptureTarget = async (
  source: HTMLElement,
  targetWidth: number,
): Promise<{ target: HTMLElement; heightTarget: HTMLElement; cleanup: () => void }> => {
  const clone = source.cloneNode(true) as HTMLElement;
  const host = document.createElement('div');

  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.zIndex = '0';
  host.style.pointerEvents = 'none';
  host.style.overflow = 'visible';
  host.style.width = stablePixelWidth(targetWidth);
  host.style.maxWidth = 'none';
  host.style.minWidth = stablePixelWidth(targetWidth);
  host.style.background = '#fff';
  host.style.direction = 'ltr';
  host.style.display = 'block';
  host.style.boxSizing = 'border-box';
  host.style.visibility = 'visible';
  host.style.opacity = '1';

  clone.style.display = 'block';
  clone.style.margin = '0';
  clone.style.width = stablePixelWidth(targetWidth);
  clone.style.minWidth = stablePixelWidth(targetWidth);
  clone.style.maxWidth = stablePixelWidth(targetWidth);
  clone.style.boxSizing = 'border-box';
  clone.style.overflow = 'visible';
  clone.style.transform = 'none';
  clone.style.direction = 'rtl';
  clone.style.visibility = 'visible';
  clone.style.opacity = '1';
  clone.setAttribute('dir', 'rtl');
  clone.setAttribute('lang', 'ar');

  host.appendChild(clone);
  document.body.appendChild(host);

  await waitForImagesInElement(clone);
  await waitForExportPaint();

  return {
    target: clone,
    heightTarget: clone,
    cleanup: () => {
      host.remove();
    },
  };
};

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

  const captureRoot = resolveStandardReportRoot(el);
  const isStandardCard = isStandardReportCardRoot(captureRoot);

  await ensureCairoLoaded();
  await waitForImagesInElement(captureRoot);
  await waitForExportPaint();

  /**
   * html2canvas defaults `windowWidth` to the document width. On phones that is ~360–430px
   * while standard report cards are designed as a fixed 640px artifact. Capture those
   * reports at their canonical width every time; other custom cards keep their own width.
   */
  const { width: measuredW, height: measuredH } = measureExportElement(captureRoot);
  const fixedReportW = isStandardCard ? STANDARD_REPORT_CAPTURE_WIDTH : undefined;
  const targetW = fixedReportW ?? measuredW;
  const captureW = width ?? targetW;
  const winW =
    windowWidth ??
    (fixedReportW != null ? STANDARD_REPORT_CAPTURE_WIDTH : Math.max(captureW, targetW));
  const canvasOptions = {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: winW,
    scrollX: 0,
    scrollY: 0,
    ...(cloneRtlAndFonts
      ? {
          onclone: (clonedDoc: Document) => {
            applyRtlFontClone(clonedDoc);
          },
        }
      : {}),
  };

  const stableCapture = await prepareStableCaptureTarget(captureRoot, captureW);
  const { height: stableH } = measureExportElement(stableCapture.heightTarget);
  const winH = windowHeight ?? Math.max(measuredH, stableH);

  try {
    return await html2canvas(stableCapture.target, {
      ...canvasOptions,
      x: 0,
      y: 0,
      width: captureW,
      height: stableH,
      windowHeight: winH,
    });
  } finally {
    stableCapture.cleanup();
  }
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
  /** True when the caption was copied because file+text could not be shared in one call (paste as WhatsApp caption). */
  captionCopied?: boolean;
};

/** Toast / hint text after share when the flow fell back to download or split file+text. */
export function getShareResultFeedbackMessage(
  result: ShareResult,
  options?: { downloadEntityLabel?: string },
): string | null {
  if (result.method === 'cancelled') return null;
  const dl = options?.downloadEntityLabel ?? 'التقرير';

  if (result.method === 'native_share') {
    if (result.captionCopied) {
      return 'تم إرسال الصورة. تم نسخ التفاصيل — الصقها في واتساب كتعليق على الصورة إن لم تُضف تلقائياً.';
    }
    return null;
  }

  if (result.method === 'clipboard_and_download') {
    if (result.captionCopied) {
      return 'تم تحميل الصورة ونسخ التفاصيل — أرفق الصورة من المجلد ثم الصق النص في التعليق.';
    }
    if (result.copied) {
      return 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)';
    }
  }

  if (result.method === 'download_only') {
    return `تم تحميل صورة ${dl} — أرفقها في محادثة واتساب`;
  }

  return null;
}

// ─── Share as image to WhatsApp ─────────────────────────────────────────────

const MOBILE_SHARE_JPEG_QUALITY = 0.97;

export const shareToWhatsApp = async (
  el: HTMLElement,
  title: string,
  options?: ShareToWhatsAppOptions,
): Promise<ShareResult> => {
  const { caption, ...captureOptions } = options ?? {};
  const canvas = await capture(el, captureOptions);
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  const fileBaseName = toSafeFileBaseName(title);

  const tryNativeShare = async (file: File): Promise<ShareResult | null> => {
    if (!navigator.share) return null;
    const trimmedCaption = caption?.trim();
    const shareData: ShareData = { files: [file], title };
    if (trimmedCaption) shareData.text = trimmedCaption;

    const shareFilesOnly = (): ShareData => ({ files: [file], title });

    try {
      /**
       * Android Chrome often reports `canShare({ files, text })` as false even when
       * `share()` succeeds — only bail out when there is no caption to justify a blind try.
       */
      if (navigator.canShare && !navigator.canShare(shareData) && !trimmedCaption) {
        return null;
      }
      await navigator.share(shareData);
      return { method: 'native_share', copied: false };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { method: 'cancelled', copied: false };
      }
      if (!trimmedCaption) return null;
      try {
        const filesOnly = shareFilesOnly();
        if (navigator.canShare && !navigator.canShare(filesOnly)) return null;
        await navigator.share(filesOnly);
        try {
          await navigator.clipboard?.writeText(trimmedCaption);
        } catch {
          /* ignore */
        }
        return { method: 'native_share', copied: true, captionCopied: true };
      } catch {
        return null;
      }
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
  const trimmedCaption = caption?.trim();

  if (isMobileDevice && trimmedCaption) {
    try {
      await navigator.clipboard?.writeText(trimmedCaption);
      copied = true;
    } catch {
      /* ignore */
    }
  }

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

  return {
    method: copied ? 'clipboard_and_download' : 'download_only',
    copied,
    ...(isMobileDevice && trimmedCaption && copied ? { captionCopied: true } : {}),
  };
};

/**
 * Report Export Utilities — PDF generation & WhatsApp image sharing.
 * Uses html2canvas + jsPDF. Print is handled by react-to-print in components.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PaperSize, PaperOrientation } from '../types';

// ─── Capture a DOM element as a canvas ──────────────────────────────────────

const capture = (el: HTMLElement) =>
  html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

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

export const exportToPDF = async (
  el: HTMLElement,
  fileName: string,
  options?: ExportPDFOptions,
) => {
  const canvas = await capture(el);
  const imgData = canvas.toDataURL('image/png');
  const imgW = canvas.width;
  const imgH = canvas.height;

  const paperSize = options?.paperSize ?? 'a4';
  const orientation = options?.orientation ?? 'portrait';
  const copies = options?.copies ?? 1;

  const [baseW, baseH] = PAPER_PT[paperSize] || PAPER_PT.a4;
  const pageW = orientation === 'landscape' ? baseH : baseW;
  const pageH = orientation === 'landscape' ? baseW : baseH;
  const m = 20;

  const format = paperSize === 'thermal' ? [baseW, baseH] : paperSize;

  const pdf = new jsPDF({ orientation, unit: 'pt', format });

  const addPageContent = (isFirst: boolean) => {
    const cw = pageW - m * 2;
    const ratio = cw / imgW;
    const scaledH = imgH * ratio;

    if (!isFirst) pdf.addPage();

    if (scaledH + m * 2 <= pageH) {
      pdf.addImage(imgData, 'PNG', m, m, cw, scaledH);
    } else {
      const contentH = pageH - m * 2;
      let offset = 0;
      let firstSlice = true;
      while (offset < scaledH) {
        if (!firstSlice) pdf.addPage();
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
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', m, m, cw, dstH);
        }
        offset += contentH;
      }
    }
  };

  for (let c = 0; c < copies; c++) {
    addPageContent(c === 0);
  }

  pdf.save(`${fileName}.pdf`);
};

// ─── Export element as image (PNG download) ─────────────────────────────────

export const exportAsImage = async (el: HTMLElement, fileName: string) => {
  const canvas = await capture(el);
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
): Promise<ShareResult> => {
  const canvas = await capture(el);
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const fileBaseName = toSafeFileBaseName(title);

  // ── Step 1 (mobile): Try native file share first ──
  // This is the only reliable way to send image directly to WhatsApp from browser.
  if (isMobile() && navigator.share) {
    const mobileFile = new File([jpgBlob], `${fileBaseName}.jpg`, { type: 'image/jpeg' });
    try {
      if (!navigator.canShare || navigator.canShare({ files: [mobileFile] })) {
        await navigator.share({ files: [mobileFile] });
        return { method: 'native_share', copied: false };
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { method: 'cancelled', copied: false };
      }
    }
  }

  // ── Step 2: Fallback — download image + open WhatsApp ──
  const isMobileDevice = isMobile();
  const fileName = `${fileBaseName}.${isMobileDevice ? 'jpg' : 'png'}`;
  const downloadTargetBlob = isMobileDevice ? jpgBlob : pngBlob;
  downloadBlob(downloadTargetBlob, fileName);

  let copied = false;

  if (isMobileDevice) {
    // Mobile fallback: download first, then open WhatsApp so user can attach quickly.
    // Small delay helps the browser start the download before navigation.
    setTimeout(() => {
      window.location.href = 'whatsapp://send';
    }, 250);
  } else {
    // Desktop: copy image to clipboard so user can paste (Ctrl+V)
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

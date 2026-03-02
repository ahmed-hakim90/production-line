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

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

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
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], `${title}.png`, { type: 'image/png' });

  // ── Step 1: Try Web Share API with file (mobile browsers) ──
  // This opens the OS share picker → user selects WhatsApp → image is sent
  if (isMobile() && navigator.share && navigator.canShare) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title, files: [file] });
        return { method: 'native_share', copied: false };
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { method: 'cancelled', copied: false };
      }
    }
  }

  // ── Step 2: Fallback — download image + open WhatsApp ──
  const fileName = `${title}.png`;
  downloadBlob(blob, fileName);

  let copied = false;

  if (isMobile()) {
    // Mobile fallback: open WhatsApp app directly via intent URL
    // User can then attach the downloaded image from gallery
    window.location.href = `whatsapp://send?text=${encodeURIComponent(title)}`;
  } else {
    // Desktop: copy image to clipboard so user can paste (Ctrl+V)
    try {
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
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

/**
 * Report Export Utilities — PDF generation & WhatsApp image sharing.
 * Uses html2canvas + jsPDF. Print is handled by react-to-print in components.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

// ─── Export element to PDF (A4, multi-page) ─────────────────────────────────

export const exportToPDF = async (el: HTMLElement, fileName: string) => {
  const canvas = await capture(el);
  const imgData = canvas.toDataURL('image/png');
  const imgW = canvas.width;
  const imgH = canvas.height;

  const A4W = 595.28; // pt
  const A4H = 841.89;
  const m = 20; // margin

  const cw = A4W - m * 2;
  const ratio = cw / imgW;
  const scaledH = imgH * ratio;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  if (scaledH + m * 2 <= A4H) {
    pdf.addImage(imgData, 'PNG', m, m, cw, scaledH);
  } else {
    const pageH = A4H - m * 2;
    let offset = 0;
    while (offset < scaledH) {
      if (offset > 0) pdf.addPage();
      const srcY = offset / ratio;
      const srcH = Math.min(pageH / ratio, imgH - srcY);
      const dstH = srcH * ratio;
      const slice = document.createElement('canvas');
      slice.width = imgW;
      slice.height = srcH;
      const ctx = slice.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', m, m, cw, dstH);
      }
      offset += pageH;
    }
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
  method: 'native_share' | 'clipboard_and_download' | 'download_only';
  copied: boolean;
};

// ─── Share as image to WhatsApp ─────────────────────────────────────────────

export const shareToWhatsApp = async (
  el: HTMLElement,
  title: string,
): Promise<ShareResult> => {
  const canvas = await capture(el);

  // Mobile: Use Web Share API with file attachment
  if (navigator.share && navigator.canShare) {
    try {
      const blob = await canvasToBlob(canvas);
      const file = new File([blob], `${title}.png`, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title, files: [file] });
        return { method: 'native_share', copied: false };
      }
    } catch {
      // User cancelled or API unavailable — fall through to desktop fallback
    }
  }

  // Desktop fallback: download + copy to clipboard
  const blob = await canvasToBlob(canvas);
  const fileName = `${title}.png`;

  // 1. Download the image
  downloadBlob(blob, fileName);

  // 2. Try copying the image to clipboard so user can paste in WhatsApp
  let copied = false;
  try {
    if (navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      copied = true;
    }
  } catch {
    // Clipboard write not supported — image was still downloaded
  }

  // 3. Open WhatsApp Web so user can paste the image
  window.open('https://web.whatsapp.com/', '_blank');

  return { method: copied ? 'clipboard_and_download' : 'download_only', copied };
};

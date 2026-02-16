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

// ─── Share as image to WhatsApp ─────────────────────────────────────────────

export const shareToWhatsApp = async (el: HTMLElement, title: string) => {
  const canvas = await capture(el);

  // Try native Web Share API (mobile)
  if (navigator.share && navigator.canShare) {
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    const file = new File([blob], `${title}.png`, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return;
    }
  }

  // Fallback: download image then open WhatsApp
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  window.open(
    `https://wa.me/?text=${encodeURIComponent('Production Report Ready')}`,
    '_blank'
  );
};

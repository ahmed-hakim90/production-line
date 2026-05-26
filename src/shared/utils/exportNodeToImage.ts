import { toBlob } from 'html-to-image';

const waitForFonts = async () => {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await (document as Document & { fonts: FontFaceSet }).fonts.ready;
  } catch {
    /* Capture can still proceed with fallback fonts. */
  }
};

const waitForImages = async (node: HTMLElement, timeoutMs = 4000) => {
  const images = Array.from(node.querySelectorAll('img'));
  if (!images.length) return;

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          const finish = () => resolve();
          if (image.complete && image.naturalWidth > 0) {
            finish();
            return;
          }
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
          setTimeout(finish, timeoutMs);
        }),
    ),
  );

  await Promise.all(
    images.map(async (image) => {
      try {
        if (typeof image.decode === 'function') await image.decode();
      } catch {
        /* Broken images should not block exporting the report card. */
      }
    }),
  );
};

const waitForStablePaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 300);
      });
    });
  });

export async function exportNodeToPng(node: HTMLElement): Promise<Blob> {
  await waitForFonts();
  await waitForImages(node);
  await waitForStablePaint();

  const blob = await toBlob(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
    width: 1080,
    style: {
      transform: 'none',
      direction: 'rtl',
    },
  });

  if (!blob) {
    throw new Error('تعذر إنشاء صورة التقرير.');
  }

  return blob;
}

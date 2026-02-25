const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export interface CompressImageOptions {
  maxWidth?: number;
  quality?: number;
  maxBytes?: number;
}

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر معالجة الصورة'));
    img.src = src;
  });

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('تعذر ضغط الصورة'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });

export const isAllowedImageFile = (file: File): boolean =>
  ALLOWED_MIME_TYPES.has(file.type.toLowerCase());

export async function compressImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  if (!isAllowedImageFile(file)) {
    throw new Error('صيغة الصورة غير مدعومة. المسموح: JPG, JPEG, PNG, WEBP');
  }

  const maxWidth = options.maxWidth ?? 1200;
  const initialQuality = options.quality ?? 0.7;
  const maxBytes = options.maxBytes ?? 500 * 1024;

  const src = await readAsDataUrl(file);
  const image = await loadImage(src);

  const ratio = image.width > maxWidth ? maxWidth / image.width : 1;
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر تجهيز المعالجة للصورة');
  }
  ctx.drawImage(image, 0, 0, width, height);

  // Prefer webp to reduce storage/bandwidth on Spark plan.
  let quality = Math.min(0.9, Math.max(0.45, initialQuality));
  let blob = await canvasToBlob(canvas, 'image/webp', quality);

  for (let i = 0; i < 4 && blob.size > maxBytes; i += 1) {
    quality = Math.max(0.45, quality - 0.08);
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }

  if (blob.size > maxBytes) {
    throw new Error('حجم الصورة بعد الضغط أكبر من 500KB');
  }

  const safeName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
  return new File([blob], `${safeName}.webp`, { type: 'image/webp' });
}


import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import { storage } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { compressImage } from '../../../services/imageCompression';
import { buildTenantStoragePath } from './storagePaths';

export type StorageModule =
  | 'employees'
  | 'products'
  | 'production_batches'
  | 'qc_reports'
  | 'documents'
  | 'repair_jobs'
  | 'quality';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const DEFAULT_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

export interface UploadedFileMeta {
  imageUrl: string;
  storagePath: string;
  createdAt: string;
}

interface UploadImageOptions {
  companyId?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  allowedTypes?: readonly string[];
}

const inFlightUploads = new Map<string, Promise<UploadedFileMeta>>();

const resolveTenantId = (companyId?: string): string => {
  const explicit = companyId?.trim();
  if (explicit) return explicit;
  try {
    return getCurrentTenantId();
  } catch {
    throw new Error('تعذر تحديد الشركة الحالية.');
  }
};

const extensionContentType = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return '';
};

const resolveImageContentType = (file: File, allowedTypes: readonly string[]): string => {
  const type = (file.type || '').toLowerCase();
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type;
  const allowed = new Set(allowedTypes.map((item) => (item === 'image/jpg' ? 'image/jpeg' : item)));
  if (normalized && allowed.has(normalized)) return normalized;
  if (!normalized) {
    const guessed = extensionContentType(file.name);
    if (guessed && allowed.has(guessed)) return guessed;
  }
  throw new Error('صيغة الصورة غير مدعومة. المسموح: JPG و PNG و WEBP.');
};

const assertUploadSize = (file: Blob): void => {
  if (file.size <= 0) throw new Error('الملف فارغ.');
  if (file.size >= MAX_UPLOAD_BYTES) throw new Error('حجم الصورة أكبر من 15 ميجابايت.');
};

const toUserMessage = (error: any): string => {
  const code = error?.code || '';
  if (code.includes('storage/quota-exceeded')) return 'تم تجاوز حصة التخزين (Spark). قلل الحجم أو احذف ملفات قديمة.';
  if (code.includes('storage/canceled')) return 'تم إلغاء الرفع.';
  if (code.includes('storage/retry-limit-exceeded') || code.includes('storage/unknown')) {
    return 'فشل الرفع بسبب الشبكة. حاول مرة أخرى.';
  }
  if (code.includes('storage/unauthorized')) return 'ليس لديك صلاحية رفع الملفات.';
  return error?.message || 'حدث خطأ أثناء رفع الملف.';
};

async function uploadWithRetry(
  path: string,
  file: Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<UploadedFileMeta> {
  if (!storage) {
    throw new Error('Firebase Storage غير مهيأ.');
  }

  const objectRef = storageRef(storage, path);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await uploadBytes(objectRef, file, {
        contentType,
        cacheControl: 'private,max-age=3600',
      });
      onProgress?.(100);
      const imageUrl = await getDownloadURL(objectRef);
      return { imageUrl, storagePath: path, createdAt: new Date().toISOString() };
    } catch (error: any) {
      const code = error?.code || '';
      const canRetry = attempt === 0
        && !code.includes('storage/canceled')
        && !code.includes('storage/unauthorized');
      if (!canRetry) throw error;
    }
  }
  throw new Error('Upload failed');
}

export const storageService = {
  toUserMessage,

  async uploadTenantFile(
    file: File,
    module: StorageModule,
    documentId: string,
    options: UploadImageOptions = {},
  ): Promise<UploadedFileMeta> {
    assertUploadSize(file);
    const contentType = resolveImageContentType(file, options.allowedTypes ?? DEFAULT_IMAGE_TYPES);
    const storagePath = buildTenantStoragePath(
      resolveTenantId(options.companyId),
      module,
      documentId,
      `${Date.now()}_${file.name}`,
    );
    try {
      if (options.signal?.aborted) {
        throw Object.assign(new Error('تم إلغاء الرفع.'), { code: 'storage/canceled' });
      }
      return await uploadWithRetry(storagePath, file, contentType, options.onProgress);
    } catch (error: any) {
      throw new Error(toUserMessage(error));
    }
  },

  async uploadImage(
    file: File,
    module: StorageModule,
    documentId: string,
    options: UploadImageOptions = {},
  ): Promise<UploadedFileMeta> {
    const compressed = await compressImage(file, {
      maxWidth: 1200,
      quality: 0.7,
      maxBytes: 500 * 1024,
    });
    assertUploadSize(compressed);
    const storagePath = buildTenantStoragePath(
      resolveTenantId(options.companyId),
      module,
      documentId,
      `${Date.now()}_${compressed.name}`,
    );
    const fingerprint = `${module}:${documentId}:${file.name}:${file.size}:${file.lastModified}`;

    if (inFlightUploads.has(fingerprint)) {
      return inFlightUploads.get(fingerprint)!;
    }

    const job = (async () => {
      if (options.signal?.aborted) {
        throw Object.assign(new Error('تم إلغاء الرفع.'), { code: 'storage/canceled' });
      }
      return uploadWithRetry(storagePath, compressed, compressed.type || 'image/webp', options.onProgress);
    })();

    inFlightUploads.set(fingerprint, job);
    try {
      return await job;
    } catch (error: any) {
      throw new Error(toUserMessage(error));
    } finally {
      inFlightUploads.delete(fingerprint);
    }
  },

  async deleteFile(fileUrlOrPath: string): Promise<void> {
    if (!storage || !fileUrlOrPath) return;
    const ref = storageRef(storage, fileUrlOrPath);
    await deleteObject(ref);
  },

  async replaceFile(
    oldUrlOrPath: string | undefined,
    newFile: File,
    module: StorageModule,
    documentId: string,
    options: UploadImageOptions = {},
  ): Promise<UploadedFileMeta> {
    const uploaded = await this.uploadImage(newFile, module, documentId, options);
    if (oldUrlOrPath) {
      try {
        await this.deleteFile(oldUrlOrPath);
      } catch {
        // Keep new upload; old cleanup is best-effort.
      }
    }
    return uploaded;
  },
};

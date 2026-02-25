import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';
import { storage } from '../../auth/services/firebase';
import { compressImage } from '../../../services/imageCompression';

export type StorageModule =
  | 'employees'
  | 'products'
  | 'production_batches'
  | 'qc_reports'
  | 'documents';

export interface UploadedFileMeta {
  imageUrl: string;
  storagePath: string;
  createdAt: string;
}

interface UploadImageOptions {
  companyId?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

const inFlightUploads = new Map<string, Promise<UploadedFileMeta>>();

const sanitize = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);

const toStoragePath = (
  module: StorageModule,
  documentId: string,
  fileName: string,
  companyId?: string,
): string => {
  const doc = sanitize(documentId || 'unknown');
  const now = Date.now();
  const safeName = sanitize(fileName || 'image.webp');
  const base = companyId ? `company/${sanitize(companyId)}` : 'company';
  return `${base}/${module}/${doc}/${now}_${safeName}`;
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

const runUploadTask = (task: UploadTask, onProgress?: (percent: number) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (!onProgress || snapshot.totalBytes === 0) return;
        const p = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(p);
      },
      reject,
      resolve,
    );
  });

async function uploadWithRetry(path: string, file: File, onProgress?: (percent: number) => void): Promise<UploadedFileMeta> {
  if (!storage) {
    throw new Error('Firebase Storage غير مهيأ.');
  }

  const ref = storageRef(storage, path);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const task = uploadBytesResumable(ref, file, {
        contentType: file.type || 'image/webp',
        cacheControl: 'public,max-age=86400',
      });
      await runUploadTask(task, onProgress);
      const imageUrl = await getDownloadURL(ref);
      return { imageUrl, storagePath: path, createdAt: new Date().toISOString() };
    } catch (error: any) {
      const code = error?.code || '';
      const canRetry = attempt === 0 && !code.includes('storage/canceled');
      if (!canRetry) throw error;
    }
  }
  throw new Error('Upload failed');
}

export const storageService = {
  toUserMessage,

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
    const storagePath = toStoragePath(module, documentId, compressed.name, options.companyId);
    const fingerprint = `${module}:${documentId}:${file.name}:${file.size}:${file.lastModified}`;

    if (inFlightUploads.has(fingerprint)) {
      return inFlightUploads.get(fingerprint)!;
    }

    const job = (async () => {
      if (options.signal?.aborted) {
        throw Object.assign(new Error('Upload canceled'), { code: 'storage/canceled' });
      }
      return uploadWithRetry(storagePath, compressed, options.onProgress);
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

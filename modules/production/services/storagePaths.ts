const SAFE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);

const sanitizeSegment = (value: string, fallback: string): string => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
};

/** Object file name: one path segment, extension kept when it is an image type. */
export const sanitizeStorageFileName = (fileName: string, fallback = 'image'): string => {
  const baseName = String(fileName || '').split(/[/\\]/).pop() || '';
  const dot = baseName.lastIndexOf('.');
  const rawExt = dot > 0 ? baseName.slice(dot + 1).toLowerCase() : '';
  const ext = SAFE_EXTENSIONS.has(rawExt) ? (rawExt === 'jpeg' ? 'jpg' : rawExt) : '';
  const rawStem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const stem = sanitizeSegment(rawStem, '');
  return `${stem || fallback}${ext ? `.${ext}` : ''}`;
};

/**
 * Preferred Storage object path. Rules allow exactly:
 * company/{tenantId}/{module}/{documentId}/{fileName}
 */
export const buildTenantStoragePath = (
  tenantId: string,
  module: string,
  documentId: string,
  fileName: string,
): string => {
  const tenant = sanitizeSegment(tenantId, '');
  const storageModule = sanitizeSegment(module, '');
  if (!tenant || !storageModule) {
    throw new Error('معرّف الشركة مطلوب لرفع الملف.');
  }
  const document = sanitizeSegment(documentId, 'file');
  const file = sanitizeStorageFileName(fileName);
  return `company/${tenant}/${storageModule}/${document}/${file}`;
};

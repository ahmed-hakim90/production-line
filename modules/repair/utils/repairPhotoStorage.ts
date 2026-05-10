import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';

const sanitizeName = (name: string) => String(name || 'photo').replace(/[^\w.\-]+/g, '_').slice(0, 120);

/** رفع صورة استلام/ورشة — المسار تحت company/repair_jobs حسب قواعد التخزين */
export async function uploadRepairJobPhoto(jobId: string, file: File): Promise<string> {
  if (!isConfigured || !storage) throw new Error('التخزين غير مهيأ.');
  const tenantId = getCurrentTenantId();
  const ts = Date.now();
  const path = `company/repair_jobs/${tenantId}__${jobId}/${ts}_${sanitizeName(file.name)}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(r);
}

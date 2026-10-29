import { getCurrentTenantId } from '../../../lib/currentTenant';
import { storageService } from '../../production/services/storageService';

/** رفع صورة استلام/ورشة تحت company/{tenantId}/repair_jobs/{jobId}/ */
export async function uploadRepairJobPhoto(jobId: string, file: File): Promise<string> {
  const tenantId = getCurrentTenantId();
  const uploaded = await storageService.uploadTenantFile(file, 'repair_jobs', jobId, {
    companyId: tenantId,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  });
  return uploaded.imageUrl;
}

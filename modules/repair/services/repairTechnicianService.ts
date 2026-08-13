import { repairTechnicianOpsCallable } from '../../auth/services/firebase';
import type { RepairJob, RepairJobProduct } from '../types';

const asJob = (value: unknown): RepairJob => value as RepairJob;

export const repairTechnicianService = {
  async claimFromQr(jobId: string): Promise<{ jobId: string; claimed: boolean }> {
    const result = await repairTechnicianOpsCallable({ operation: 'claim_qr', jobId });
    return { jobId: String(result.jobId || jobId), claimed: Boolean(result.claimed) };
  },

  async list(): Promise<RepairJob[]> {
    const result = await repairTechnicianOpsCallable({ operation: 'list' });
    return Array.isArray(result.jobs) ? result.jobs.map(asJob) : [];
  },

  async get(jobId: string): Promise<RepairJob | null> {
    if (!jobId) return null;
    const result = await repairTechnicianOpsCallable({ operation: 'get', jobId });
    return result.job ? asJob(result.job) : null;
  },

  async save(jobId: string, jobProducts: RepairJobProduct[], isServiceOnly: boolean): Promise<RepairJob | null> {
    const result = await repairTechnicianOpsCallable({
      operation: 'save',
      jobId,
      jobProducts: jobProducts as unknown as Array<Record<string, unknown>>,
      isServiceOnly,
    });
    return result.job ? asJob(result.job) : null;
  },

  async changeStatus(jobId: string, status: string, reason?: string, reasonCode?: string): Promise<void> {
    await repairTechnicianOpsCallable({ operation: 'status', jobId, status, reason, reasonCode });
  },

  async addPhoto(jobId: string, url: string): Promise<void> {
    await repairTechnicianOpsCallable({ operation: 'add_photo', jobId, url });
  },

  async getCatalog(jobId: string): Promise<{
    materials: Array<{
      id: string;
      name: string;
      code: string;
      barcode?: string;
      scanKeys?: string[];
      unit: string;
      centerQty: number;
      centralQty: number;
    }>;
    services: Array<{ id: string; name: string; enabled: boolean }>;
  }> {
    const result = await repairTechnicianOpsCallable({ operation: 'catalog', jobId });
    return {
      materials: Array.isArray(result.materials) ? result.materials as Array<{
        id: string; name: string; code: string; barcode?: string; scanKeys?: string[]; unit: string; centerQty: number; centralQty: number;
      }> : [],
      services: Array.isArray(result.services)
        ? result.services as Array<{ id: string; name: string; enabled: boolean }>
        : [],
    };
  },

  async listParts(jobId: string): Promise<Array<{
    id: string;
    name: string;
    code: string;
    unit: string;
    centerQty: number;
    centralQty: number;
  }>> {
    return (await this.getCatalog(jobId)).materials;
  },
};

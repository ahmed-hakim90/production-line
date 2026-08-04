/**
 * Pure helpers for repair job print payloads — keeps print document aligned with live job products.
 */
import type { RepairJob, RepairJobProduct } from '../types';

export const resolveRepairJobPrintProducts = (
  job: RepairJob,
  products?: RepairJobProduct[],
): RepairJobProduct[] => {
  if (Array.isArray(products) && products.length > 0) return products;
  if (Array.isArray(job.jobProducts) && job.jobProducts.length > 0) return job.jobProducts;
  return [{
    itemId: 'item-1',
    productName: String(job.productName || job.deviceBrand || 'منتج'),
    deviceType: job.deviceType,
    deviceBrand: job.deviceBrand,
    deviceModel: job.deviceModel,
    serialNo: job.deviceSerial,
    accessories: job.accessories,
    diagnosis: job.problemDescription,
    estimatedCost: job.estimatedCost,
    finalCost: job.finalCost,
    inWarranty: (job.warranty || 'none') !== 'none',
  }];
};

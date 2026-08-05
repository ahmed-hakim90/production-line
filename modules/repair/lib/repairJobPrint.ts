/**
 * Pure helpers for repair job print payloads — keeps print document aligned with live job products.
 */
import { resolveRepairStatusChip } from './repairStatusChipStyle';
import type { RepairJob, RepairJobProduct } from '../types';

export type RepairPrintStatusMap = Record<string, { label?: string; color?: string } | undefined> | null | undefined;

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

export type RepairProductCardFields = {
  receiptNo: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  serialNo: string;
  diagnosis: string;
  accessories: string;
  branchName: string;
  statusLabel: string;
  statusColor: string;
};

/** Fields for the A5 product tag card stuck on the device after intake. */
export function buildRepairProductCardFields(
  job: RepairJob,
  product: RepairJobProduct,
  branchName?: string,
  statusMap?: RepairPrintStatusMap,
): RepairProductCardFields {
  const statusChip = resolveRepairStatusChip(job.status, statusMap);
  return {
    receiptNo: String(job.receiptNo || ''),
    customerName: String(job.customerName || '—'),
    customerPhone: String(job.customerPhone || '—'),
    productName: String(product.productName || product.deviceBrand || 'منتج'),
    serialNo: String(product.serialNo || '—'),
    diagnosis: String(product.diagnosis || job.problemDescription || '—'),
    accessories: String(product.accessories || job.accessories || '—'),
    branchName: String(branchName || '—'),
    statusLabel: statusChip.label,
    statusColor: statusChip.color,
  };
}

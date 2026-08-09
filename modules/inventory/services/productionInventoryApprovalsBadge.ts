import { componentCompensationService } from './componentCompensationService';
import { disassemblyService } from './disassemblyService';
import { suppliesReceiptService } from './suppliesReceiptService';

/**
 * Aggregate pending approval work for `/inventory/production-approvals`
 * (component compensation + supplies receipt + disassembly).
 */
export async function countPendingProductionInventoryApprovals(): Promise<number> {
  const [compensations, receipts, disassemblies] = await Promise.all([
    componentCompensationService.countAwaitingApproval(),
    suppliesReceiptService.countAwaitingApproval(),
    disassemblyService.countAwaitingApproval(),
  ]);
  return Math.max(0, compensations) + Math.max(0, receipts) + Math.max(0, disassemblies);
}

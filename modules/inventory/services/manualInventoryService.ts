import type { CreateStockMovementInput, TransferRequestLine } from '../types';
import { stockService } from './stockService';
import { transferApprovalService } from './transferApprovalService';

/** Thin facade for manual stock operations (adjustments + transfer requests). */
export const manualInventoryService = {
  async postAdjustment(input: Omit<CreateStockMovementInput, 'movementType' | 'sourceModule'> & {
    adjustmentReason: CreateStockMovementInput['adjustmentReason'];
  }) {
    return stockService.createMovement({
      ...input,
      movementType: 'ADJUSTMENT',
      sourceModule: 'manual_movement',
    });
  },

  async createManualTransferRequest(input: {
    fromWarehouseId: string;
    fromWarehouseName?: string;
    toWarehouseId: string;
    toWarehouseName?: string;
    referenceNo?: string;
    note?: string;
    lines: TransferRequestLine[];
    createdBy: string;
    createdByUserId?: string;
  }) {
    return transferApprovalService.createRequest({
      ...input,
      requestType: 'manual_transfer',
      sourceModule: 'manual_movement',
    });
  },
};

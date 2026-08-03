import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import type { CreateStockMovementInput } from '../types';
import { stockService } from '../services/stockService';
import type { InventoryStockMovePath } from '../../system/lib/operationPathSettings';

export type CreateStockMovementOutput = {
  transactionId: string;
  tenantId: string;
};

/** Post a stock movement/transfer/adjustment and emit STOCK_MOVED. */
export async function createStockMovement(
  input: CreateStockMovementInput,
  context: { path: InventoryStockMovePath },
): Promise<UseCaseResult<CreateStockMovementOutput>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const transactionId = await stockService.createMovement(input, context);
    if (!transactionId) {
      throw new Error('تعذر ترحيل حركة المخزون');
    }

    eventBus.emit(SystemEvents.STOCK_MOVED, {
      module: 'inventory',
      entityType: 'stock_transaction',
      entityId: transactionId,
      action: input.movementType === 'TRANSFER'
        ? 'transfer'
        : input.movementType === 'ADJUSTMENT'
          ? 'adjust'
          : 'move',
      movementType: input.movementType,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      tenantId,
      actor: { userName: input.createdBy },
      description: 'Stock movement posted',
      metadata: {
        itemType: input.itemType,
        itemId: input.itemId,
        referenceNo: input.referenceNo,
      },
    });

    return { transactionId, tenantId };
  });
}

import type { InventoryTransferRequest, StockTransaction } from '../../types';
import type { StockVoucherGroup } from '../../lib/groupStockVouchers';

export const movementLabel: Record<string, string> = {
  IN: 'وارد',
  OUT: 'منصرف',
  TRANSFER: 'تحويل',
  ADJUSTMENT: 'تسوية',
};

export type ApprovedTransferGroup = {
  referenceNo: string;
  createdAt: string;
  createdBy: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: StockTransaction[];
};

export type { StockVoucherGroup };

export type CombinedRow =
  | { kind: 'transaction'; sortAt: number; tx: StockTransaction }
  | { kind: 'voucher'; sortAt: number; group: StockVoucherGroup }
  | { kind: 'approved_transfer'; sortAt: number; group: ApprovedTransferGroup }
  | { kind: 'pending'; sortAt: number; row: InventoryTransferRequest };

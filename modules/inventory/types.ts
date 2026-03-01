export type InventoryItemType = 'finished_good' | 'raw_material';

export type StockMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';

export interface Warehouse {
  id?: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
}

export interface RawMaterial {
  id?: string;
  name: string;
  code: string;
  unit: string;
  minStock: number;
  isActive: boolean;
  createdAt: string;
}

export interface StockItemBalance {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  minStock: number;
  updatedAt: string;
}

export interface StockTransaction {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  movementType: StockMovementType;
  quantity: number;
  note?: string;
  referenceNo?: string;
  relatedTransactionId?: string;
  transferDirection?: 'OUT' | 'IN';
  createdAt: string;
  createdBy: string;
}

export interface StockCountLine {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  expectedQty: number;
  countedQty: number;
}

export interface StockCountSession {
  id?: string;
  warehouseId: string;
  warehouseName: string;
  status: 'open' | 'counted' | 'approved';
  note?: string;
  lines: StockCountLine[];
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface CreateStockMovementInput {
  warehouseId: string;
  toWarehouseId?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  movementType: StockMovementType;
  quantity: number;
  minStock?: number;
  note?: string;
  referenceNo?: string;
  createdBy: string;
  allowNegative?: boolean;
}

export type TransferRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface TransferRequestLine {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  minStock?: number;
}

export interface InventoryTransferRequest {
  id?: string;
  fromWarehouseId: string;
  fromWarehouseName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  referenceNo: string;
  note?: string;
  lines: TransferRequestLine[];
  status: TransferRequestStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

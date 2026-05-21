export type InventoryItemType =
  | 'finished_good'
  | 'raw_material'
  | 'material'
  | 'semi_finished'
  | 'consumable'
  | 'packaging';

export type StockMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';

export type StockSourceModule =
  | 'production_report'
  | 'manual_movement'
  | 'transfer_request'
  | 'stock_count'
  | 'packaging'
  | 'work_order'
  | 'legacy';

export type StockAdjustmentReason =
  | 'count_correction'
  | 'damage'
  | 'missing'
  | 'extra'
  | 'manual_correction';

export type WarehouseRole =
  | 'raw_material'
  | 'decomposed'
  | 'production_wip'
  | 'finished_staging'
  | 'final_product'
  | 'packaging'
  | 'waste'
  | 'general';

export interface Warehouse {
  id?: string;
  name: string;
  code: string;
  isActive: boolean;
  warehouseRole?: WarehouseRole;
  createdAt: string;
  tenantId?: string;
}

export interface RawMaterial {
  id?: string;
  name: string;
  code: string;
  categoryName?: string;
  unit: string;
  minStock: number;
  isActive: boolean;
  tenantId?: string;
  createdAt: string;
}

export interface StockItemBalance {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  warehouseRole?: WarehouseRole;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  reservedQty?: number;
  availableQty?: number;
  unit?: string;
  minStock: number;
  updatedAt: string;
  lastMovementAt?: string;
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
  unit?: string;
  requestQuantity?: number;
  requestUnit?: 'piece' | 'carton' | 'unit';
  unitsPerCarton?: number;
  note?: string;
  referenceNo?: string;
  relatedTransactionId?: string;
  transferDirection?: 'OUT' | 'IN';
  sourceModule?: StockSourceModule;
  sourceId?: string;
  adjustmentReason?: StockAdjustmentReason;
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
  adjustmentReason?: StockAdjustmentReason;
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
  unit?: string;
  requestQuantity?: number;
  requestUnit?: 'piece' | 'carton' | 'unit';
  unitsPerCarton?: number;
  minStock?: number;
  note?: string;
  referenceNo?: string;
  sourceModule?: StockSourceModule;
  sourceId?: string;
  adjustmentReason?: StockAdjustmentReason;
  createdBy: string;
  allowNegative?: boolean;
}

export type TransferRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type TransferRequestType =
  | 'transfer'
  | 'manual_transfer'
  | 'production_entry'
  | 'production_auto_transfer'
  | 'finished_to_final'
  | 'packaging_transfer';

export interface TransferRequestLine {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit?: string;
  requestQuantity?: number;
  requestUnit?: 'piece' | 'carton' | 'unit';
  unitsPerCarton?: number;
  minStock?: number;
}

export interface InventoryTransferRequest {
  id?: string;
  requestType?: TransferRequestType;
  fromWarehouseId: string;
  fromWarehouseName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  referenceNo: string;
  note?: string;
  /** @deprecated Prefer sourceId */
  sourceReportId?: string;
  sourceModule?: StockSourceModule;
  sourceId?: string;
  lines: TransferRequestLine[];
  status: TransferRequestStatus;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  submittedAt?: string;
  firstReviewedAt?: string;
  resolvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  cancelledBy?: string;
  cancelledByUserId?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface InventoryRoutingSettings {
  rawMaterialWarehouseId?: string;
  decomposedWarehouseId?: string;
  productionWipWarehouseId?: string;
  finishedStagingWarehouseId?: string;
  finalProductWarehouseId?: string;
  packagingSourceWarehouseId?: string;
  packagingTargetWarehouseId?: string;
  wasteWarehouseId?: string;
  autoTransferProductionToFinished?: boolean;
  autoTransferFinishedToFinal?: boolean;
  requireApprovalForProductionEntry?: boolean;
  requireApprovalForAutoTransfers?: boolean;
}

export interface ResolvedInventoryRouting {
  rawMaterialWarehouseId: string;
  decomposedWarehouseId: string;
  productionWipWarehouseId: string;
  finishedStagingWarehouseId: string;
  finalProductWarehouseId: string;
  packagingSourceWarehouseId: string;
  packagingTargetWarehouseId: string;
  wasteWarehouseId: string;
  autoTransferProductionToFinished: boolean;
  autoTransferFinishedToFinal: boolean;
  requireApprovalForProductionEntry: boolean;
  requireApprovalForAutoTransfers: boolean;
  allowNegativeDecomposedStock: boolean;
  allowNegativeFinishedTransferStock: boolean;
  enablePackagingStockTransfer: boolean;
}

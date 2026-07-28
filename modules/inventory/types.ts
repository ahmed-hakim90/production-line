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
  | 'production_issue'
  | 'component_compensation'
  | 'component_return'
  | 'disassembly'
  | 'supplies_receipt'
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

export interface WarehouseLocation {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  rackId?: string;
  rackName?: string;
  rackCode?: string;
  rack: string;
  shelfName?: string;
  shelfCode?: string;
  shelf: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  tenantId?: string;
}

export interface WarehouseRack {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  warehouseCode?: string;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt?: string;
  tenantId?: string;
}

export interface WarehouseLocationSettings {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  requireComponentLocation: boolean;
  requireFinishedGoodLocation: boolean;
  autoGenerateLocationCode: boolean;
  allowSuggestedLocationOverride: boolean;
  createdAt: string;
  updatedAt?: string;
  tenantId?: string;
}

export interface StockLocationBalance {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  locationId: string;
  locationCode: string;
  rackId?: string;
  rackName?: string;
  rackCode?: string;
  rack?: string;
  shelfName?: string;
  shelfCode?: string;
  shelf?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  unit?: string;
  minStock: number;
  updatedAt: string;
  lastMovementAt?: string;
  tenantId?: string;
}

export interface DefaultItemLocation {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  locationId: string;
  locationCode: string;
  createdAt: string;
  updatedAt?: string;
  tenantId?: string;
}

export interface StockTransaction {
  id?: string;
  warehouseId: string;
  warehouseName?: string;
  locationId?: string;
  locationCode?: string;
  rackId?: string;
  rackName?: string;
  rackCode?: string;
  shelfName?: string;
  shelfCode?: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  toLocationId?: string;
  toLocationCode?: string;
  toRackId?: string;
  toRackName?: string;
  toRackCode?: string;
  toShelfName?: string;
  toShelfCode?: string;
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
  sourceReportId?: string;
  sourceIssueOrderId?: string;
  sourceWorkOrderId?: string;
  sourcePlanId?: string;
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
  locationId?: string;
  locationCode?: string;
  rackId?: string;
  rackName?: string;
  rackCode?: string;
  shelfName?: string;
  shelfCode?: string;
  toWarehouseId?: string;
  toLocationId?: string;
  toLocationCode?: string;
  toRackId?: string;
  toRackName?: string;
  toRackCode?: string;
  toShelfName?: string;
  toShelfCode?: string;
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
  sourceReportId?: string;
  sourceIssueOrderId?: string;
  sourceWorkOrderId?: string;
  sourcePlanId?: string;
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
  locationId?: string;
  locationCode?: string;
  toLocationId?: string;
  toLocationCode?: string;
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

export type ProductionIssueOrderStatus = 'requested' | 'draft' | 'submitted' | 'issued' | 'rejected' | 'cancelled';
export type ProductionIssueSourceType = 'work_order' | 'production_plan' | 'production_report';
export type ProductionIssueOrigin = 'production_request' | 'warehouse';

export interface ProductionIssueAllocation {
  locationId: string;
  locationCode: string;
  rack?: string;
  shelf?: string;
  quantity: number;
}

export interface ProductionIssueOrderLine {
  materialId: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  qtyPerUnit: number;
  baseRequiredQty: number;
  wastePercent: number;
  plannedWasteQty: number;
  requiredQty: number;
  issuedQty?: number;
  returnedQty?: number;
  compensatedQty?: number;
  actualScrapQty?: number;
  availableQty: number;
  shortageQty: number;
  allocations: ProductionIssueAllocation[];
}

export interface ProductionIssueOrder {
  id?: string;
  referenceNo: string;
  sourceType: ProductionIssueSourceType;
  workOrderId?: string;
  productionPlanId?: string;
  /** When source is a specific production report (past or current). */
  productionReportId?: string;
  productionReportCode?: string;
  productionReportDate?: string;
  productId: string;
  productName: string;
  productCode?: string;
  lineId?: string;
  quantity: number;
  /** FG qty originally requested by production (before materials adjust/approve). */
  requestedQuantity?: number;
  sourceWarehouseId: string;
  sourceWarehouseName?: string;
  status: ProductionIssueOrderStatus;
  origin?: ProductionIssueOrigin;
  lines: ProductionIssueOrderLine[];
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  requestedBy?: string;
  requestedByUserId?: string;
  requestedAt?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  issuedAt?: string;
  issuedBy?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  note?: string;
  /** Snapshot of assemblable capacity when the production request was created. */
  assemblableAtRequest?: number;
  tenantId?: string;
}

export type ProductionIssueShortageKind =
  | 'insufficient_allocation'
  | 'inactive_location'
  | 'stale_balance';

export interface ProductionIssueShortageRow {
  itemName: string;
  itemCode: string;
  unit: string;
  requiredQty: number;
  availableQty: number;
  kind: ProductionIssueShortageKind;
  locationCode?: string;
}

export type ComponentCompensationReason = 'scrap' | 'shortage' | 'damage' | 'correction';
export type ComponentCompensationStatus = 'pending' | 'approved' | 'rejected';
export type ComponentReturnReason = 'unused' | 'over_issue' | 'production_cancelled' | 'correction';

export interface ComponentCompensationRequest {
  id?: string;
  issueOrderId: string;
  /** Issued production issue reference for display (snapshot). */
  issueReferenceNo?: string;
  referenceNo: string;
  reason: ComponentCompensationReason;
  warehouseId: string;
  warehouseName?: string;
  line: ProductionIssueOrderLine;
  quantity: number;
  locationId: string;
  locationCode: string;
  status: ComponentCompensationStatus;
  /** Who initiated: production request screen vs warehouse materials UI. */
  origin?: ProductionIssueOrigin;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  note?: string;
  tenantId?: string;
}

export interface ComponentReturnRecord {
  id?: string;
  issueOrderId: string;
  referenceNo: string;
  warehouseId: string;
  warehouseName?: string;
  locationId: string;
  locationCode: string;
  line: ProductionIssueOrderLine;
  quantity: number;
  reason: ComponentReturnReason;
  returnedBy: string;
  returnedByUserId?: string;
  receivedBy: string;
  receivedByUserId?: string;
  createdAt: string;
  note?: string;
  tenantId?: string;
}

export interface ComponentScrapRecord {
  id?: string;
  issueOrderId: string;
  workOrderId?: string;
  productionPlanId?: string;
  referenceNo: string;
  line: ProductionIssueOrderLine;
  quantity: number;
  reason: ComponentCompensationReason;
  needsCompensation?: boolean;
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  note?: string;
  tenantId?: string;
}

export interface ComponentReturnInput {
  issueOrderId: string;
  warehouseId: string;
  warehouseName?: string;
  locationId: string;
  locationCode: string;
  line: ProductionIssueOrderLine;
  quantity: number;
  reason?: ComponentReturnReason;
  returnedBy?: string;
  returnedByUserId?: string;
  receivedBy?: string;
  receivedByUserId?: string;
  createdBy: string;
  createdByUserId?: string;
  note?: string;
}

export interface DisassemblyLine {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  wasteQty?: number;
  defaultLocationId?: string;
  defaultLocationCode?: string;
  locationId: string;
  locationCode: string;
}

export type DisassemblyOrderStatus = 'draft' | 'submitted' | 'approved' | 'executed' | 'rejected' | 'cancelled';

export interface DisassemblyOrder {
  id?: string;
  referenceNo: string;
  status: DisassemblyOrderStatus;
  sourceWarehouseId: string;
  sourceWarehouseName?: string;
  sourceLocationId?: string;
  sourceLocationCode?: string;
  targetWarehouseId: string;
  targetWarehouseName?: string;
  productId: string;
  productName: string;
  productCode?: string;
  quantity: number;
  lines: DisassemblyLine[];
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  executedAt?: string;
  executedBy?: string;
  executedByUserId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectionReason?: string;
  note?: string;
  tenantId?: string;
}

export interface SuppliesReceiptLine {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  suggestedQty?: number;
  defaultLocationId?: string;
  defaultLocationCode?: string;
  locationId: string;
  locationCode: string;
}

export interface SuppliesReceiptProductGroup {
  productId: string;
  productName: string;
  productCode?: string;
  quantity: number;
  lines: SuppliesReceiptLine[];
}

export type SuppliesReceiptOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'executed'
  | 'rejected'
  | 'cancelled';

export interface SuppliesReceiptOrder {
  id?: string;
  referenceNo: string;
  status: SuppliesReceiptOrderStatus;
  warehouseId: string;
  warehouseName?: string;
  /** رقم أمر التوريد / الحاوية / الشحنة (اختياري). */
  containerRef?: string;
  groups: SuppliesReceiptProductGroup[];
  standaloneLines: SuppliesReceiptLine[];
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  executedAt?: string;
  executedBy?: string;
  executedByUserId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectedByUserId?: string;
  rejectionReason?: string;
  note?: string;
  tenantId?: string;
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
  autoConsumeBomOnProductionReport?: boolean;
  requireIssuedProductionIssueOnReport?: boolean;
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
  /** Direct BOM deduction on report save (off by default; use صرف إنتاج separately). */
  autoConsumeBomOnProductionReport: boolean;
  /** Finished report requires issued صرف إنتاج before create/post. On by default; does not auto-consume. */
  requireIssuedProductionIssueOnReport: boolean;
  allowNegativeDecomposedStock: boolean;
  allowNegativeFinishedTransferStock: boolean;
  enablePackagingStockTransfer: boolean;
}

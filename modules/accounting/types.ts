export type AccountingAccountType =
  "asset" | "liability" | "equity" | "revenue" | "expense" | "contra_revenue";

export interface AccountingAccount {
  id?: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountingAccountType;
  parentCode?: string | null;
  allowPosting: boolean;
  isActive: boolean;
  notes?: string;
  systemSeed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountingJournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId?: string | null;
  costObjectType?: "production_report" | "work_order" | "repair_job" | null;
  costObjectId?: string | null;
  productId?: string | null;
  workOrderId?: string | null;
  description?: string;
}

export interface AccountingJournalEntry {
  id?: string;
  tenantId: string;
  branchId?: string;
  costCenterId?: string;
  source: string;
  sourceId?: string;
  referenceNo: string;
  date?: string;
  period?: string;
  description?: string;
  status: "posted" | "reversed";
  lines: AccountingJournalLine[];
  totalDebit: number;
  totalCredit: number;
  postedAt?: string;
  createdAt?: string;
  createdByName?: string;
  reversalJournalId?: string;
  /** نوع مصروف خزينة صيانة عند source=repair_treasury_manual */
  expenseType?: string;
}

export interface AccountingSettings {
  tenantId: string;
  currency: string;
  fiscalYearStartMonth: number;
  decimalPlaces: number;
  inventoryValuationMethod: "weighted_average" | "fifo" | "standard";
  autoPostInventory: boolean;
  requireCostCenter: boolean;
  allowManualJournals: boolean;
}

export interface AccountingPeriod {
  id?: string;
  tenantId: string;
  period: string;
  status: "open" | "closed";
  updatedAt?: string;
}

export interface InventoryValuationRow {
  id: string;
  warehouseId: string;
  warehouseName: string;
  itemType: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  unitCost: number;
  value: number;
  costKnown: boolean;
}

export interface InventoryValuationResult {
  rows: InventoryValuationRow[];
  warehouses: Array<{
    warehouseId: string;
    warehouseName: string;
    quantity: number;
    value: number;
    lines: number;
    unknownCostLines: number;
  }>;
  totalValue: number;
  unknownCostLines: number;
  asOf: string;
}

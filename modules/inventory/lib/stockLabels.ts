import type { InventoryItemType, StockSourceModule, TransferRequestType, WarehouseRole } from '../types';

export const WAREHOUSE_ROLE_LABELS: Record<WarehouseRole, string> = {
  general: 'عام',
  raw_material: 'مواد خام',
  decomposed: 'مفكك',
  production_wip: 'WIP',
  finished_staging: 'تم الصنع',
  final_product: 'منتج تام',
  packaging: 'تغليف',
  waste: 'هالك',
};

export const SOURCE_MODULE_LABELS: Record<StockSourceModule, string> = {
  production_report: 'تقرير إنتاج',
  manual_movement: 'حركة يدوية',
  transfer_request: 'طلب تحويل',
  stock_count: 'جرد',
  packaging: 'تغليف',
  work_order: 'أمر شغل',
  legacy: 'قديم',
};

export function sourceModuleLabel(value?: StockSourceModule | string): string {
  if (!value) return 'قديم';
  return SOURCE_MODULE_LABELS[value as StockSourceModule] ?? value;
}

export function itemTypeLabel(value: InventoryItemType): string {
  const map: Record<InventoryItemType, string> = {
    finished_good: 'منتج نهائي',
    raw_material: 'مادة خام',
    material: 'مادة تصنيع',
    semi_finished: 'نصف مصنع',
    consumable: 'مستهلكات',
    packaging: 'تغليف',
  };
  return map[value] ?? value;
}

export function transferRequestTypeLabel(value?: TransferRequestType | string): string {
  const t = value || 'manual_transfer';
  const map: Record<string, string> = {
    transfer: 'تحويل يدوي',
    manual_transfer: 'تحويل يدوي',
    production_entry: 'إدخال إنتاج',
    production_auto_transfer: 'تحويل إنتاج تلقائي',
    finished_to_final: 'تام → منتج تام',
    packaging_transfer: 'تحويل تغليف',
  };
  return map[t] ?? t;
}

export function balanceKey(warehouseId: string, itemType: string, itemId: string): string {
  return `${warehouseId}__${itemType}__${itemId}`;
}

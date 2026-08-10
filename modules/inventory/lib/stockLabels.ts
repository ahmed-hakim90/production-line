import type { InventoryItemType, StockSourceModule, TransferRequestType, WarehouseRole } from '../types';

export const WAREHOUSE_ROLE_LABELS: Record<WarehouseRole, string> = {
  general: 'عام',
  raw_material: 'مواد خام',
  decomposed: 'مفكك / مستلزم إنتاج',
  production_floor: 'صالة الإنتاج',
  production_wip: 'تم الإنتاج — تحت التسليم',
  finished_staging: 'بانتظار التغليف',
  final_product: 'منتج تام',
  packaging: 'تغليف',
  waste: 'هالك',
  spare_parts_central: 'قطع غيار (مركزي)',
  maintenance_center: 'مخزن مركز صيانة',
  repair_customer_custody: 'عهدة أجهزة العملاء',
  repair_unrepairable: 'غير قابل للإصلاح',
};

export const SOURCE_MODULE_LABELS: Record<StockSourceModule, string> = {
  production_report: 'تقرير إنتاج',
  manual_movement: 'حركة يدوية',
  transfer_request: 'طلب تحويل',
  stock_count: 'جرد',
  packaging: 'تغليف',
  work_order: 'أمر شغل',
  production_issue: 'صرف إنتاج',
  component_compensation: 'تعويض مكون',
  component_return: 'مرتجع مكون',
  disassembly: 'تفكيك',
  supplies_receipt: 'استلام مستلزمات',
  department_consumable_issue: 'صرف مستهلكات قسم',
  department_consumable_return: 'مرتجع مستهلكات قسم',
  spare_parts_replenishment: 'تموين قطع غيار للمراكز',
  spare_parts_purchase: 'فاتورة شراء قطع غيار',
  repair_spare_issue: 'صرف قطع غيار صيانة',
  repair_spare_return: 'مرتجع قطع غيار صيانة',
  repair_customer_custody: 'عهدة أجهزة العملاء',
  repair_unrepairable: 'غير قابل للإصلاح',
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
    production_auto_transfer: 'ترحيل إلى تم الإنتاج',
    production_handover: 'استلام تغليف (تحت التسليم)',
    finished_to_final: 'تم الإنتاج → منتج تام',
    packaging_transfer: 'تحويل تغليف',
  };
  return map[t] ?? t;
}

export function balanceKey(warehouseId: string, itemType: string, itemId: string): string {
  return `${warehouseId}__${itemType}__${itemId}`;
}

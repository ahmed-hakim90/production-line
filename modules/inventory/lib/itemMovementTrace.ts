import type { StockTransaction } from '../types';
import { sourceModuleLabel } from './stockLabels';

export type ConsumableOption = {
  id: string;
  name: string;
  code: string;
  unit: string;
  /** Purchase cost per base unit — used for issue cost snapshots and reports. */
  purchaseCost?: number;
};

/** Materials eligible for product BOM — exclude department consumables. */
export function isBomEligibleMaterialType(type: string | undefined | null): boolean {
  return type !== 'consumable';
}

export function movementPathLabel(tx: Pick<
  StockTransaction,
  | 'movementType'
  | 'warehouseName'
  | 'warehouseId'
  | 'locationCode'
  | 'toWarehouseName'
  | 'toWarehouseId'
  | 'toLocationCode'
  | 'departmentName'
>): string {
  const fromWh = String(tx.warehouseName || tx.warehouseId || '').trim() || '—';
  const fromLoc = String(tx.locationCode || '').trim();
  const from = fromLoc ? `${fromWh} / ${fromLoc}` : fromWh;
  const toWh = String(tx.toWarehouseName || tx.toWarehouseId || '').trim();
  const toLoc = String(tx.toLocationCode || '').trim();
  const to = toWh ? (toLoc ? `${toWh} / ${toLoc}` : toWh) : '';
  const dept = String(tx.departmentName || '').trim();

  if (tx.movementType === 'IN') {
    return `وارد إلى ${from}`;
  }
  if (tx.movementType === 'TRANSFER' || (tx.movementType === 'OUT' && to)) {
    return `من ${from} → إلى ${to || '—'}`;
  }
  if (tx.movementType === 'OUT' && dept) {
    return `من ${from} → قسم ${dept}`;
  }
  if (tx.movementType === 'OUT') {
    return `صادر من ${from}`;
  }
  if (tx.movementType === 'ADJUSTMENT') {
    return `تسوية في ${from}`;
  }
  return from;
}

export function movementFateLabel(tx: Pick<
  StockTransaction,
  'movementType' | 'sourceModule' | 'departmentName'
>): string {
  const module = String(tx.sourceModule || '').trim();
  if (module === 'department_consumable_issue') return 'مصروف لقسم';
  if (module === 'department_consumable_return') return 'مرتجع من قسم';
  if (module === 'supplies_receipt') return 'وارد استلام';
  if (module === 'production_issue') return 'صرف إنتاج';
  if (module === 'component_return') return 'مرتجع مكون';
  if (module === 'component_compensation') return 'تعويض مكون';
  if (module === 'stock_count') return 'جرد';
  if (module === 'transfer_request') return 'تحويل';
  if (module === 'spare_parts_replenishment') return 'تموين قطع غيار';
  if (module === 'repair_spare_issue') return 'صرف قطعة صيانة';
  if (module === 'repair_spare_return') return 'مرتجع قطعة صيانة';
  if (module === 'repair_customer_custody') return 'عهدة عميل';
  if (module === 'repair_unrepairable') return 'غير قابل للإصلاح';
  if (module === 'repair_sales_invoice') return 'فاتورة قطع غيار';
  if (module === 'disassembly') return 'تفكيك';
  if (module === 'packaging') return 'تغليف';
  if (module === 'production_report') return 'إنتاج';
  if (module === 'manual_movement') return 'حركة يدوية';
  if (tx.movementType === 'IN') return 'وارد';
  if (tx.movementType === 'OUT') return 'صادر';
  if (tx.movementType === 'TRANSFER') return 'تحويل';
  if (tx.movementType === 'ADJUSTMENT') return 'تسوية / هالك';
  return sourceModuleLabel(tx.sourceModule);
}

export function suggestConsumableCode(name: string): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const prefix = String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9\u0600-\u06FF]/g, '');
  const safe = prefix && /^[A-Z0-9]/.test(prefix) ? prefix.slice(0, 4) : 'CNS';
  return `${safe}-${stamp}`;
}

/** Catalog list for defined department consumables — sorted + search by name/code/unit. */
export function filterConsumableCatalog(
  items: ConsumableOption[],
  search: string,
  unitLabelFn?: (unit: string) => string,
): ConsumableOption[] {
  const rows = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, 'ar') || a.code.localeCompare(b.code, 'ar'));
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const unitLabel = unitLabelFn?.(row.unit) || '';
    return (
      row.name.toLowerCase().includes(q)
      || row.code.toLowerCase().includes(q)
      || row.unit.toLowerCase().includes(q)
      || unitLabel.toLowerCase().includes(q)
    );
  });
}

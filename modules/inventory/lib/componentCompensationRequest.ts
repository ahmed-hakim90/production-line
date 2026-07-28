import type { ProductionIssueOrder, ProductionIssueOrderLine } from '../types';

export type CompensationLocationPick = {
  locationId: string;
  locationCode: string;
};

/** Prefer the original issue allocation location for compensatory OUT. */
export function resolveCompensationLocationFromIssuedLine(
  line: Pick<ProductionIssueOrderLine, 'allocations'> | null | undefined,
): CompensationLocationPick | null {
  const allocation = (line?.allocations || []).find(
    (row) => String(row.locationId || '').trim() && Number(row.quantity || 0) > 0,
  );
  if (!allocation) return null;
  return {
    locationId: String(allocation.locationId).trim(),
    locationCode: String(allocation.locationCode || '').trim() || String(allocation.locationId).trim(),
  };
}

export function assertCanRequestCompensation(input: {
  order: Pick<ProductionIssueOrder, 'id' | 'status' | 'lines' | 'sourceWarehouseId'> | null | undefined;
  itemType: string;
  itemId: string;
  quantity: number;
}): {
  line: ProductionIssueOrderLine;
  location: CompensationLocationPick;
} {
  const order = input.order;
  if (!order?.id) throw new Error('أمر الصرف غير موجود.');
  if (order.status !== 'issued') {
    throw new Error('الصرف التعويضي يكون على إذن صرف إنتاج تم ترحيله فقط.');
  }
  if (!(Number(input.quantity) > 0)) {
    throw new Error('كمية التعويض يجب أن تكون أكبر من صفر.');
  }
  const line = (order.lines || []).find(
    (row) => row.itemType === input.itemType && row.itemId === input.itemId,
  );
  if (!line) throw new Error('المكون غير موجود على أمر الصرف المحدد.');
  const location = resolveCompensationLocationFromIssuedLine(line);
  if (!location?.locationId) {
    throw new Error('لا يوجد لوكيشن صرف أصلي على هذا البند — راجع المستلزم.');
  }
  if (!String(order.sourceWarehouseId || '').trim()) {
    throw new Error('أمر الصرف بلا مخزن مصدر.');
  }
  return { line, location };
}

import React, { useEffect } from 'react';
import { useStockAvailabilityPreview } from '../hooks/useStockAvailabilityPreview';
import type { InventoryItemType } from '../types';
import { formatNumber } from '../../../utils/calculations';

type Props = {
  warehouseId: string;
  itemType: InventoryItemType;
  itemId: string;
  className?: string;
};

/** Live balance hint: on-hand, reserved, and available (quantity − reservedQty). */
export const StockAvailabilityHint: React.FC<Props> = ({
  warehouseId,
  itemType,
  itemId,
  className = '',
}) => {
  const { loading, available, reserved, onHand, load } = useStockAvailabilityPreview();

  useEffect(() => {
    if (!warehouseId || !itemId) return;
    void load(warehouseId, itemType, itemId);
  }, [warehouseId, itemType, itemId, load]);

  if (!warehouseId || !itemId) return null;

  return (
    <p className={`text-[11px] font-semibold text-[var(--color-text-muted)] ${className}`}>
      {loading ? 'جاري تحميل الرصيد...' : (
        <>
          الرصيد: <span className="text-[var(--color-text)]">{formatNumber(onHand ?? 0)}</span>
          {' · '}محجوز: <span className="text-[var(--color-text)]">{formatNumber(reserved)}</span>
          {' · '}المتاح: <span className="text-[var(--color-text)]">{formatNumber(available ?? 0)}</span>
        </>
      )}
    </p>
  );
};

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

/** Live balance hint (reserved stock placeholder = 0). */
export const StockAvailabilityHint: React.FC<Props> = ({
  warehouseId,
  itemType,
  itemId,
  className = '',
}) => {
  const { loading, available, load } = useStockAvailabilityPreview();

  useEffect(() => {
    if (!warehouseId || !itemId) return;
    void load(warehouseId, itemType, itemId);
  }, [warehouseId, itemType, itemId, load]);

  if (!warehouseId || !itemId) return null;

  return (
    <p className={`text-[11px] font-semibold text-slate-500 ${className}`}>
      {loading ? 'جاري تحميل الرصيد...' : (
        <>
          الرصيد الحالي: <span className="text-slate-800">{formatNumber(available ?? 0)}</span>
          {' · '}المتاح: <span className="text-slate-800">{formatNumber(available ?? 0)}</span>
        </>
      )}
    </p>
  );
};

import { useCallback, useState } from 'react';
import { stockService } from '../services/stockService';
import type { InventoryItemType } from '../types';

export function useStockAvailabilityPreview() {
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<number | null>(null);

  const load = useCallback(async (
    warehouseId: string,
    itemType: InventoryItemType,
    itemId: string,
  ) => {
    if (!warehouseId || !itemId) {
      setAvailable(null);
      return 0;
    }
    setLoading(true);
    try {
      const qty = await stockService.getBalance(warehouseId, itemType, itemId);
      setAvailable(qty);
      return qty;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, available, reserved: 0, load };
}

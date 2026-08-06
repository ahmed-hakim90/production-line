import { useCallback, useState } from 'react';
import { stockService } from '../services/stockService';
import type { InventoryItemType } from '../types';

export function useStockAvailabilityPreview() {
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<number | null>(null);
  const [reserved, setReserved] = useState(0);
  const [onHand, setOnHand] = useState<number | null>(null);

  const load = useCallback(async (
    warehouseId: string,
    itemType: InventoryItemType,
    itemId: string,
  ) => {
    if (!warehouseId || !itemId) {
      setAvailable(null);
      setReserved(0);
      setOnHand(null);
      return 0;
    }
    setLoading(true);
    try {
      const balance = await stockService.getBalanceDetail(warehouseId, itemType, itemId);
      const quantity = Number(balance.quantity || 0);
      const reservedQty = Math.max(0, Number(balance.reservedQty || 0));
      const availableQty = Math.max(0, quantity - reservedQty);
      setOnHand(quantity);
      setReserved(reservedQty);
      setAvailable(availableQty);
      return availableQty;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, available, reserved, onHand, load };
}

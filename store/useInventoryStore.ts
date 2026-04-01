import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import type { StockItemBalance } from '../modules/inventory/types';

type InventoryState = {
  stockBalances: StockItemBalance[];
  syncFromLegacyStore: () => void;
};

export const useInventoryStore = create<InventoryState>((set) => ({
  stockBalances: [],
  syncFromLegacyStore: () => {
    const state = useAppStore.getState() as unknown as { stockBalances?: StockItemBalance[] };
    set({
      stockBalances: state.stockBalances ?? [],
    });
  },
}));

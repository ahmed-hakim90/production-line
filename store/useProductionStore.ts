import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import type { ProductionLine, Product, ProductionReport, WorkOrder } from '../types';

type ProductionState = {
  productionLines: ProductionLine[];
  products: Product[];
  productionReports: ProductionReport[];
  workOrders: WorkOrder[];
  syncFromLegacyStore: () => void;
};

export const useProductionStore = create<ProductionState>((set) => ({
  productionLines: [],
  products: [],
  productionReports: [],
  workOrders: [],
  syncFromLegacyStore: () => {
    const state = useAppStore.getState();
    set({
      productionLines: state.productionLines,
      products: state.products,
      productionReports: state.productionReports,
      workOrders: state.workOrders,
    });
  },
}));

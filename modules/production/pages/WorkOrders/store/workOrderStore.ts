import { create } from 'zustand';

import type { WorkOrder } from '../../../../../types';

export interface WorkOrderStore {
  orders: Record<string, WorkOrder>;
  setOrders: (orders: WorkOrder[]) => void;
  upsertOrders: (orders: WorkOrder[]) => void;
  updateOrder: (id: string, patch: Partial<WorkOrder>) => void;
  selectedOrderId: string | null;
  setSelectedOrder: (id: string | null) => void;
  clear: () => void;
}

const toOrderMap = (orders: WorkOrder[]): Record<string, WorkOrder> => {
  const entries = orders
    .filter((order): order is WorkOrder & { id: string } => Boolean(order.id))
    .map((order) => [order.id, order] as const);

  return Object.fromEntries(entries);
};

export const useWorkOrderStore = create<WorkOrderStore>((set) => ({
  orders: {},
  selectedOrderId: null,

  setOrders: (orders) => {
    set({ orders: toOrderMap(orders) });
  },

  upsertOrders: (orders) => {
    const nextOrders = toOrderMap(orders);
    set((state) => ({
      orders: {
        ...state.orders,
        ...nextOrders,
      },
    }));
  },

  updateOrder: (id, patch) => {
    if (!id) return;
    set((state) => {
      const current = state.orders[id];
      if (!current) return state;
      return {
        orders: {
          ...state.orders,
          [id]: {
            ...current,
            ...patch,
            id,
          },
        },
      };
    });
  },

  setSelectedOrder: (id) => {
    set({ selectedOrderId: id });
  },

  clear: () => {
    set({
      orders: {},
      selectedOrderId: null,
    });
  },
}));

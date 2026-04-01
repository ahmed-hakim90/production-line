import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import type { CostCenter, CostCenterValue, CostAllocation } from '../types';

type CostsState = {
  costCenters: CostCenter[];
  costCenterValues: CostCenterValue[];
  costAllocations: CostAllocation[];
  syncFromLegacyStore: () => void;
};

export const useCostsStore = create<CostsState>((set) => ({
  costCenters: [],
  costCenterValues: [],
  costAllocations: [],
  syncFromLegacyStore: () => {
    const state = useAppStore.getState();
    set({
      costCenters: state.costCenters,
      costCenterValues: state.costCenterValues,
      costAllocations: state.costAllocations,
    });
  },
}));

import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import type { RepairJob } from '../modules/repair/types';

type RepairState = {
  repairJobs: RepairJob[];
  syncFromLegacyStore: () => void;
};

export const useRepairStore = create<RepairState>((set) => ({
  repairJobs: [],
  syncFromLegacyStore: () => {
    const state = useAppStore.getState();
    set({
      repairJobs: (state as unknown as { repairJobs?: RepairJob[] }).repairJobs ?? [],
    });
  },
}));

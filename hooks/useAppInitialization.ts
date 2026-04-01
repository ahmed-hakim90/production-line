import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { useProductionStore } from '../store/useProductionStore';
import { useInventoryStore } from '../store/useInventoryStore';
import { useRepairStore } from '../store/useRepairStore';
import { useCostsStore } from '../store/useCostsStore';

export function useAppInitialization() {
  const initializeApp = useAppStore((s) => s.initializeApp);

  return useCallback(async () => {
    await Promise.all([
      initializeApp(),
    ]);

    useAuthStore.getState().syncFromLegacyStore();
    useProductionStore.getState().syncFromLegacyStore();
    useInventoryStore.getState().syncFromLegacyStore();
    useRepairStore.getState().syncFromLegacyStore();
    useCostsStore.getState().syncFromLegacyStore();
  }, [initializeApp]);
}

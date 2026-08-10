import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/Toast';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useProductionStore } from '@/store/useProductionStore';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useRepairStore } from '@/store/useRepairStore';
import { useCostsStore } from '@/store/useCostsStore';

type AppContentRefreshContextValue = {
  contentRefreshing: boolean;
  contentKey: number;
  refreshPageContent: () => Promise<void>;
};

const AppContentRefreshContext = createContext<AppContentRefreshContextValue | null>(null);

export function AppContentRefreshProvider({ children }: { children: React.ReactNode }) {
  const [contentRefreshing, setContentRefreshing] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const inFlightRef = useRef(false);
  const loadAppData = useAppStore((s) => s._loadAppData);

  const refreshPageContent = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setContentRefreshing(true);
    try {
      await loadAppData();
      useAuthStore.getState().syncFromLegacyStore();
      useProductionStore.getState().syncFromLegacyStore();
      useInventoryStore.getState().syncFromLegacyStore();
      useRepairStore.getState().syncFromLegacyStore();
      useCostsStore.getState().syncFromLegacyStore();
      setContentKey((key) => key + 1);
    } catch {
      toast.error('تعذر تحديث الصفحة. حاول مرة أخرى.');
    } finally {
      setContentRefreshing(false);
      inFlightRef.current = false;
    }
  }, [loadAppData]);

  const value = useMemo(
    () => ({ contentRefreshing, contentKey, refreshPageContent }),
    [contentRefreshing, contentKey, refreshPageContent],
  );

  return (
    <AppContentRefreshContext.Provider value={value}>
      {children}
    </AppContentRefreshContext.Provider>
  );
}

export function useAppContentRefresh(): AppContentRefreshContextValue {
  const ctx = useContext(AppContentRefreshContext);
  if (!ctx) {
    return {
      contentRefreshing: false,
      contentKey: 0,
      refreshPageContent: async () => {
        /* no-op outside layout */
      },
    };
  }
  return ctx;
}

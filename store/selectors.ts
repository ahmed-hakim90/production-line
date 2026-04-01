import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './useAppStore';
import { useAuthStore } from './useAuthStore';

export const useDashboardSlice = () =>
  useAppStore(useShallow((s) => ({
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    _rawEmployees: s._rawEmployees,
    workOrders: s.workOrders,
    liveProduction: s.liveProduction,
    productionPlans: s.productionPlans,
    planReports: s.planReports,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    assets: s.assets,
    assetDepreciations: s.assetDepreciations,
    laborSettings: s.laborSettings,
    lineProductConfigs: s.lineProductConfigs,
    systemSettings: s.systemSettings,
  })));

export const useAuthUiSlice = () =>
  useAuthStore(useShallow((s) => ({
    isAuthenticated: s.isAuthenticated,
    isPendingApproval: s.isPendingApproval,
    loading: s.loading,
  })));

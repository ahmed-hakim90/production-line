import { create } from 'zustand';
import { useAppStore } from './useAppStore';

type AuthStoreState = {
  isAuthenticated: boolean;
  isPendingApproval: boolean;
  loading: boolean;
  uid: string | null;
  syncFromLegacyStore: () => void;
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  isAuthenticated: false,
  isPendingApproval: false,
  loading: true,
  uid: null,
  syncFromLegacyStore: () => {
    const state = useAppStore.getState();
    set({
      isAuthenticated: state.isAuthenticated,
      isPendingApproval: state.isPendingApproval,
      loading: state.loading,
      uid: state.uid,
    });
  },
}));

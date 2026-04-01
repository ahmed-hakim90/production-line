import { create } from 'zustand';

type UIState = {
  isSidebarCollapsed: boolean;
  activeTab: string;
  openModals: Record<string, boolean>;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: string) => void;
  openModal: (modalKey: string) => void;
  closeModal: (modalKey: string) => void;
  resetUi: () => void;
};

const initialUiState = {
  isSidebarCollapsed: false,
  activeTab: 'dashboard',
  openModals: {},
} as const;

export const useUIStore = create<UIState>((set) => ({
  ...initialUiState,
  setSidebarCollapsed: (value) => set({ isSidebarCollapsed: value }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  openModal: (modalKey) => set((state) => ({
    openModals: { ...state.openModals, [modalKey]: true },
  })),
  closeModal: (modalKey) => set((state) => ({
    openModals: { ...state.openModals, [modalKey]: false },
  })),
  resetUi: () => set(initialUiState),
}));

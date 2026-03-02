import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ModalOpenPayload = Record<string, unknown> | undefined;

type ModalOpener = (payload?: ModalOpenPayload) => void;

type ManagedModalState = {
  isOpen: boolean;
  payload?: ModalOpenPayload;
};

type GlobalModalManagerValue = {
  registerModalOpener: (modalKey: string, opener: ModalOpener) => () => void;
  registerManagedModal: (modalKey: string) => () => void;
  openModal: (modalKey: string, payload?: ModalOpenPayload) => boolean;
  closeModal: (modalKey: string) => void;
  hasModalOpener: (modalKey: string) => boolean;
  hasModalTarget: (modalKey: string) => boolean;
  getManagedModalState: (modalKey: string) => ManagedModalState;
};

const GlobalModalManagerContext = createContext<GlobalModalManagerValue | null>(null);

export const GlobalModalManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const openersRef = useRef<Map<string, ModalOpener>>(new Map());
  const managedRef = useRef<Map<string, number>>(new Map());
  const [managedStates, setManagedStates] = useState<Record<string, ManagedModalState>>({});

  const registerModalOpener = useCallback((modalKey: string, opener: ModalOpener) => {
    if (!modalKey || typeof opener !== 'function') return () => {};
    openersRef.current.set(modalKey, opener);
    return () => {
      const current = openersRef.current.get(modalKey);
      if (current === opener) openersRef.current.delete(modalKey);
    };
  }, []);

  const registerManagedModal = useCallback((modalKey: string) => {
    if (!modalKey) return () => {};
    const current = managedRef.current.get(modalKey) || 0;
    managedRef.current.set(modalKey, current + 1);
    return () => {
      const before = managedRef.current.get(modalKey) || 0;
      if (before <= 1) {
        managedRef.current.delete(modalKey);
      } else {
        managedRef.current.set(modalKey, before - 1);
      }
    };
  }, []);

  const openModal = useCallback((modalKey: string, payload?: ModalOpenPayload) => {
    const opener = openersRef.current.get(modalKey);
    if (opener) {
      opener(payload);
      return true;
    }
    if (managedRef.current.has(modalKey)) {
      setManagedStates((prev) => ({
        ...prev,
        [modalKey]: { isOpen: true, payload },
      }));
      return true;
    }
    return false;
  }, []);

  const closeModal = useCallback((modalKey: string) => {
    setManagedStates((prev) => ({
      ...prev,
      [modalKey]: { ...(prev[modalKey] || {}), isOpen: false },
    }));
  }, []);

  const hasModalOpener = useCallback((modalKey: string) => {
    return openersRef.current.has(modalKey);
  }, []);

  const hasModalTarget = useCallback((modalKey: string) => {
    return openersRef.current.has(modalKey) || managedRef.current.has(modalKey);
  }, []);

  const getManagedModalState = useCallback((modalKey: string): ManagedModalState => {
    return managedStates[modalKey] || { isOpen: false };
  }, [managedStates]);

  const value = useMemo<GlobalModalManagerValue>(() => ({
    registerModalOpener,
    registerManagedModal,
    openModal,
    closeModal,
    hasModalOpener,
    hasModalTarget,
    getManagedModalState,
  }), [registerModalOpener, registerManagedModal, openModal, closeModal, hasModalOpener, hasModalTarget, getManagedModalState]);

  return (
    <GlobalModalManagerContext.Provider value={value}>
      {children}
    </GlobalModalManagerContext.Provider>
  );
};

export const useGlobalModalManager = (): GlobalModalManagerValue => {
  const ctx = useContext(GlobalModalManagerContext);
  if (!ctx) {
    throw new Error('useGlobalModalManager must be used within GlobalModalManagerProvider');
  }
  return ctx;
};

export const useManagedModalController = (modalKey: string) => {
  const manager = useGlobalModalManager();

  React.useEffect(() => {
    if (!modalKey) return;
    return manager.registerManagedModal(modalKey);
  }, [manager, modalKey]);

  const state = manager.getManagedModalState(modalKey);
  const close = React.useCallback(() => manager.closeModal(modalKey), [manager, modalKey]);
  const open = React.useCallback((payload?: ModalOpenPayload) => manager.openModal(modalKey, payload), [manager, modalKey]);

  return {
    isOpen: state.isOpen,
    payload: state.payload,
    open,
    close,
  };
};


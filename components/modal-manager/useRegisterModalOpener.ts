import { useEffect } from 'react';
import { useGlobalModalManager } from './GlobalModalManager';

type ModalOpenPayload = Record<string, unknown> | undefined;

type ModalOpener = (payload?: ModalOpenPayload) => void;

export const useRegisterModalOpener = (modalKey: string, opener: ModalOpener) => {
  const { registerModalOpener } = useGlobalModalManager();

  useEffect(() => {
    if (!modalKey) return;
    return registerModalOpener(modalKey, opener);
  }, [modalKey, opener, registerModalOpener]);
};


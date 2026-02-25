import { registerAuditListener } from '@/modules/system/audit';

let initialized = false;
let cleanupFns: Array<() => void> = [];

export const registerSystemEventListeners = (): (() => void) => {
  if (initialized) {
    return () => {};
  }

  initialized = true;
  cleanupFns = [registerAuditListener()];

  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
    cleanupFns = [];
    initialized = false;
  };
};

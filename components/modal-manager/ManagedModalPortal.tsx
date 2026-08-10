import React from 'react';
import { createPortal } from 'react-dom';
import { getPortalContainer } from '@/lib/portalRoot';

type Props = {
  children: React.ReactNode;
  /** When false, render nothing (keeps callers simple). Default true. */
  open?: boolean;
};

/**
 * Mount overlays into `#erp-modal-root` so they sit above page chrome
 * and are never trapped by ModuleOpsPageShell / toolbar stacking contexts.
 */
export const ManagedModalPortal: React.FC<Props> = ({ children, open = true }) => {
  if (!open) return null;
  if (typeof document === 'undefined') return null;
  const container = getPortalContainer();
  if (!container) return <>{children}</>;
  return createPortal(
    <div className="pointer-events-auto">{children}</div>,
    container,
  );
};

export default ManagedModalPortal;

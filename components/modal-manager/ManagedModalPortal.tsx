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
 *
 * The host layer uses the shared modal z-index so Select/Popover/Dropdown
 * (floating z) always paint above every managed modal, regardless of the
 * child's local `z-50` / `z-[300]` / `z-[1000]` class.
 */
export const ManagedModalPortal: React.FC<Props> = ({ children, open = true }) => {
  if (!open) return null;
  if (typeof document === 'undefined') return null;
  const container = getPortalContainer();
  if (!container) return <>{children}</>;
  return createPortal(
    <div className="erp-managed-modal-layer">{children}</div>,
    container,
  );
};

export default ManagedModalPortal;

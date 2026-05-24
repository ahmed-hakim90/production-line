/**
 * Portal mount target for overlays (modals, command palette).
 *
 * Tailwind is configured with `important: "#root"`, so utilities only apply
 * inside `#root`. Portals must not use `document.body` or `#erp-modal-root`
 * when that node sits outside `#root`.
 */
export function getPortalContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('root');
}

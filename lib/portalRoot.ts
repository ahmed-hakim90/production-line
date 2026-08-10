/**
 * Portal mount target for overlays (modals, command palette, Radix portals).
 *
 * Tailwind uses `important: "#root"`, so portals must stay under `#root`.
 * Prefer `#erp-modal-root` (fixed, z-index 10060) so overlays sit above
 * topbar / page chrome and are never trapped by page stacking contexts.
 */
export function getPortalContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return (
    document.getElementById('erp-modal-root')
    ?? document.getElementById('root')
  );
}

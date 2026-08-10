/**
 * Overlay stacking contract (inside `#erp-modal-root`, z-index 10060).
 *
 * Modal shells (Dialog / Sheet / ManagedModalPortal / .erp-modal-overlay)
 * must stay below floating menus (Select / Popover / Dropdown / Tooltip),
 * otherwise options render behind the modal and look "empty".
 */
export const OVERLAY_Z = {
  /** Full-screen modal shells and backdrops */
  modal: 10050,
  /** Portaled Select / Popover / Dropdown / Tooltip menus */
  floating: 10100,
  /** Toasts above menus while a modal is open */
  toast: 10200,
} as const;

/** Tailwind class for modal shells portaled into `#erp-modal-root`. */
export const MODAL_SHELL_Z_CLASS = 'z-[10050]' as const;

/** Tailwind class for floating menus portaled into `#erp-modal-root`. */
export const FLOATING_MENU_Z_CLASS = 'z-[10100]' as const;

/** True when an event target is inside a Radix floating layer (Select/Popover/Dropdown/Tooltip). */
export function isRadixFloatingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as Element;
  return Boolean(
    el.closest(
      [
        '[data-radix-select-content]',
        '[data-radix-popper-content-wrapper]',
        '[data-radix-dropdown-menu-content]',
        '[data-radix-dropdown-menu-sub-content]',
        '[data-radix-popover-content]',
        '[data-radix-tooltip-content]',
      ].join(','),
    ),
  );
}

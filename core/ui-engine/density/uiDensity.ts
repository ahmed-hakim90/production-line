export type UiDensityMode = 'comfortable' | 'compact';

const STORAGE_KEY = 'erp_ui_density_v1';

export function readUiDensity(): UiDensityMode {
  if (typeof window === 'undefined') return 'comfortable';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'compact' || raw === 'comfortable') return raw;
  } catch {
    /* ignore */
  }
  return 'comfortable';
}

export function writeUiDensity(mode: UiDensityMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Applies --density-scale, --page-shell-gap, and base font size on the document root. */
export function applyUiDensity(mode: UiDensityMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'compact') {
    root.style.setProperty('--density-scale', '0.92');
    root.style.setProperty('--page-shell-gap', '0.75rem');
    root.style.setProperty('--layout-main-padding-y', '0.75rem');
    root.style.setProperty('--font-size-base', '12px');
    root.style.setProperty('--font-size-sm', '11px');
    root.style.setProperty('--font-size-xs', '10px');
    root.dataset.uiDensity = 'compact';
  } else {
    root.style.setProperty('--density-scale', '1');
    root.style.setProperty('--page-shell-gap', '1rem');
    root.style.setProperty('--layout-main-padding-y', '1rem');
    root.style.setProperty('--font-size-base', '13px');
    root.style.setProperty('--font-size-sm', '12px');
    root.style.setProperty('--font-size-xs', '11px');
    root.dataset.uiDensity = 'comfortable';
  }
}

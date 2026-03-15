import type { ThemeSettings } from '../types';
import { DEFAULT_THEME } from './dashboardConfig';

function hexToRgbString(hex: string): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return '36 48 143';
  return `${parseInt(match[1], 16)} ${parseInt(match[2], 16)} ${parseInt(match[3], 16)}`;
}

// Lighten a hex color slightly (for backgrounds derived from primary)
function hexLighten(hex: string, amount = 0.92): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return '#f8fafc';
  const r = Math.round(parseInt(match[1], 16) * (1 - amount) + 255 * amount);
  const g = Math.round(parseInt(match[2], 16) * (1 - amount) + 255 * amount);
  const b = Math.round(parseInt(match[3], 16) * (1 - amount) + 255 * amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function applyTheme(theme?: ThemeSettings): void {
  const t = { ...DEFAULT_THEME, ...theme };
  const root = document.documentElement;

  const isDark =
    t.darkMode === 'dark' ||
    (t.darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // ── Semantic color tokens (used by Tailwind utilities) ────────────────────
  root.style.setProperty('--color-primary',   hexToRgbString(t.primaryColor));
  root.style.setProperty('--color-secondary', hexToRgbString(t.secondaryColor));
  root.style.setProperty('--color-success',   hexToRgbString(t.successColor));
  root.style.setProperty('--color-warning',   hexToRgbString(t.warningColor));
  root.style.setProperty('--color-danger',    hexToRgbString(t.dangerColor));
  root.style.setProperty('--color-background', t.backgroundColor);
  // Hex aliases for components that consume direct CSS colors.
  root.style.setProperty('--color-primary-hex', t.primaryColor);
  root.style.setProperty('--color-secondary-hex', t.secondaryColor);
  root.style.setProperty('--color-success-hex', t.successColor);
  root.style.setProperty('--color-warning-hex', t.warningColor);
  root.style.setProperty('--color-danger-hex', t.dangerColor);
  if (t.cssVars) {
    Object.entries(t.cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }

  // ── Layout surface variables (used by sidebar, topbar, cards, borders) ────
  if (isDark) {
    root.style.setProperty('--color-bg',           '#020617');
    root.style.setProperty('--color-card',         '#0f172a');
    root.style.setProperty('--color-border',       '#1e293b');
    root.style.setProperty('--color-text',         '#e2e8f0');
    root.style.setProperty('--color-text-muted',   '#94a3b8');
    root.style.setProperty('--color-sidebar-bg',   '#0f172a');
    root.style.setProperty('--color-sidebar-text', '#94a3b8');
  } else {
    const bgColor = t.backgroundColor || '#f8fafc';
    root.style.setProperty('--color-bg',           bgColor);
    root.style.setProperty('--color-card',         '#ffffff');
    root.style.setProperty('--color-border',       '#e2e8f0');
    root.style.setProperty('--color-text',         t.textColor      || '#1a1a1a');
    root.style.setProperty('--color-text-muted',   t.mutedTextColor || '#8d99a6');
    root.style.setProperty('--color-sidebar-bg',   '#ffffff');
    root.style.setProperty('--color-sidebar-text', '#334155');
  }

  // ── Typography & spacing ──────────────────────────────────────────────────
  const fontStack = `'${t.baseFontFamily}', 'Noto Sans Arabic', sans-serif`;
  root.style.setProperty('--font-family-base',   fontStack);
  root.style.setProperty('--font-size-base',     `${t.baseFontSize}px`);
  root.style.setProperty('--density-scale',      t.density === 'compact' ? '0.8' : '1');

  // ── Border radius scale (all derived from one setting) ───────────────────
  const br = Number(t.borderRadius ?? 6);
  root.style.setProperty('--border-radius-sm',   `${Math.max(2, Math.round(br * 0.6))}px`);
  root.style.setProperty('--border-radius-base', `${br}px`);
  root.style.setProperty('--border-radius-lg',   `${Math.round(br * 1.4)}px`);
  root.style.setProperty('--border-radius-xl',   `${Math.round(br * 2)}px`);

  // ── Dark class ────────────────────────────────────────────────────────────
  root.classList.toggle('dark', isDark);
  document.body.style.backgroundColor = isDark ? '#020617' : t.backgroundColor;
}

let autoCleanup: (() => void) | null = null;

export function setupAutoThemeListener(theme?: ThemeSettings): void {
  if (autoCleanup) { autoCleanup(); autoCleanup = null; }
  const t = { ...DEFAULT_THEME, ...theme };
  if (t.darkMode !== 'auto') return;

  const mq      = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    document.documentElement.classList.toggle('dark', e.matches);
    document.body.style.backgroundColor = e.matches ? '#020617' : t.backgroundColor;
  };
  mq.addEventListener('change', handler);
  autoCleanup = () => mq.removeEventListener('change', handler);
}

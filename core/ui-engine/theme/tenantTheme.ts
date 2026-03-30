import { doc, getDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';

export type TenantThemePreset = 'indigo-pro' | 'light' | 'dark' | 'factory' | 'custom';

export interface TenantTheme {
  preset: TenantThemePreset;
  primaryColor: string;
  logo?: string;
  backgroundStyle?: string;
  sidebarStyle?: string;
  colorBg: string;
  colorCard: string;
  colorBorder: string;
  colorText: string;
  colorSidebarBg: string;
  colorSidebarText: string;
}

const THEME_STORAGE_KEY = 'tenant_theme_cache_v1';

function toRgbChannels(color: string, fallback = '79 70 229'): string {
  const value = color.trim();
  if (!value) return fallback;

  // Already in CSS channel format (e.g. "168 0 8")
  if (/^\d+\s+\d+\s+\d+$/.test(value)) return value;

  // Hex format (#rrggbb or #rgb)
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[\da-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }
  if (/^[\da-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `${r} ${g} ${b}`;
  }

  // rgb(r, g, b) format
  const rgbMatch = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) return `${rgbMatch[1]} ${rgbMatch[2]} ${rgbMatch[3]}`;

  return fallback;
}

/** Normalize theme primary/surface colors to #rrggbb for HSL conversion. */
function colorToHex(color: string, fallback = '#4F46E5'): string {
  const value = color.trim();
  if (!value) return fallback;
  if (value.startsWith('#')) {
    const h = value.slice(1);
    if (/^[\da-fA-F]{6}$/.test(h)) return `#${h.toLowerCase()}`;
    if (/^[\da-fA-F]{3}$/.test(h)) {
      return `#${[...h].map((ch) => ch + ch).join('')}`.toLowerCase();
    }
  }
  const ch = toRgbChannels(value, '79 70 229');
  const [r, g, b] = ch.split(/\s+/).map((n) => Number(n));
  if ([r, g, b].some((n) => Number.isNaN(n))) return fallback;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = colorToHex(color, '');
  const h = hex.startsWith('#') ? hex.slice(1) : '';
  if (!/^[\da-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHslTriplet(r: number, g: number, b: number): string {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hexToHslTriplet(hex: string, fallback = '239 84% 60%'): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  return rgbToHslTriplet(rgb.r, rgb.g, rgb.b);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function primaryForegroundHsl(primaryHex: string): string {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return '0 0% 100%';
  return relativeLuminance(rgb.r, rgb.g, rgb.b) > 0.55 ? '222 47% 11%' : '0 0% 98%';
}

function accentFromPrimary(primaryHex: string): { accent: string; accentFg: string } {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) {
    return { accent: '239 84% 97%', accentFg: '239 84% 30%' };
  }
  const triplet = rgbToHslTriplet(rgb.r, rgb.g, rgb.b);
  const [hStr, sPart, lPart] = triplet.split(' ');
  const h = Number(hStr);
  const s = Number.parseInt(sPart, 10);
  const l = Number.parseInt(lPart, 10);
  const accentL = Math.min(l + 38, 96);
  const accentS = Math.min(Math.max(s, 32), 88);
  const accent = `${Math.round(h)} ${accentS}% ${accentL}%`;
  const accentFg = `${Math.round(h)} ${Math.min(s + 12, 90)}% ${Math.max(l - 28, 18)}%`;
  return { accent, accentFg };
}

/** Keep shadcn hsl(var(--*)) tokens aligned with ERP semantic colors. */
function applyShadcnTokensFromTheme(theme: TenantTheme, root: HTMLElement) {
  const isDark = theme.preset === 'dark';
  const bgHex = colorToHex(theme.colorBg, '#f8fafc');
  const textHex = colorToHex(theme.colorText, '#0f172a');
  const cardHex = colorToHex(theme.colorCard, '#ffffff');
  const borderHex = colorToHex(theme.colorBorder, '#e2e8f0');
  const primaryHex = colorToHex(theme.primaryColor, '#4F46E5');

  root.style.setProperty('--background', hexToHslTriplet(bgHex));
  root.style.setProperty('--foreground', hexToHslTriplet(textHex));
  root.style.setProperty('--card', hexToHslTriplet(cardHex));
  root.style.setProperty('--card-foreground', hexToHslTriplet(textHex));
  root.style.setProperty('--popover', hexToHslTriplet(cardHex));
  root.style.setProperty('--popover-foreground', hexToHslTriplet(textHex));
  root.style.setProperty('--border', hexToHslTriplet(borderHex));
  root.style.setProperty('--input', hexToHslTriplet(borderHex));

  const pHsl = hexToHslTriplet(primaryHex);
  root.style.setProperty('--primary', pHsl);
  root.style.setProperty('--ring', pHsl);
  root.style.setProperty('--primary-foreground', primaryForegroundHsl(primaryHex));

  const { accent, accentFg } = accentFromPrimary(primaryHex);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-foreground', accentFg);

  if (isDark) {
    root.style.setProperty('--muted', '217 33% 17%');
    root.style.setProperty('--muted-foreground', '215 20% 68%');
    root.style.setProperty('--secondary', '217 33% 17%');
    root.style.setProperty('--secondary-foreground', '210 40% 98%');
    root.style.setProperty('--destructive', '0 63% 31%');
    root.style.setProperty('--destructive-foreground', '210 40% 98%');
  } else {
    const rgb = hexToRgb(bgHex);
    if (rgb) {
      const muted = rgbToHslTriplet(
        Math.round(rgb.r * 0.94 + 255 * 0.06),
        Math.round(rgb.g * 0.94 + 255 * 0.06),
        Math.round(rgb.b * 0.94 + 255 * 0.06),
      );
      root.style.setProperty('--muted', muted);
    } else {
      root.style.setProperty('--muted', '210 40% 96%');
    }
    root.style.setProperty('--muted-foreground', '215 16% 42%');
    root.style.setProperty('--secondary', '240 5% 96%');
    root.style.setProperty('--secondary-foreground', '240 6% 10%');
    root.style.setProperty('--destructive', '0 84% 60%');
    root.style.setProperty('--destructive-foreground', '0 0% 98%');
  }
}

/**
 * Default tenant appearance presets. To change the app-wide default before login / without DB:
 * adjust `:root` in `src/index.css` (ERP + shadcn tokens) and keep `indigo-pro` here aligned, or
 * point `loadTenantTheme` / Firestore `tenants/{id}.theme` at a preset or custom partial theme.
 */
const PRESETS: Record<Exclude<TenantThemePreset, 'custom'>, TenantTheme> = {
  'indigo-pro': {
    preset: 'indigo-pro',
    primaryColor: '#4F46E5',
    colorBg: '#F8FAFC',
    colorCard: '#ffffff',
    colorBorder: '#e2e8f0',
    colorText: '#0f172a',
    colorSidebarBg: '#ffffff',
    colorSidebarText: '#334155',
  },
  light: {
    preset: 'light',
    primaryColor: '#4F46E5',
    colorBg: '#F8FAFC',
    colorCard: '#ffffff',
    colorBorder: '#e2e8f0',
    colorText: '#0f172a',
    colorSidebarBg: '#ffffff',
    colorSidebarText: '#334155',
  },
  dark: {
    preset: 'dark',
    primaryColor: '#60a5fa',
    colorBg: '#020617',
    colorCard: '#0f172a',
    colorBorder: '#1e293b',
    colorText: '#e2e8f0',
    colorSidebarBg: '#0f172a',
    colorSidebarText: '#cbd5e1',
  },
  factory: {
    preset: 'factory',
    primaryColor: '#0f766e',
    colorBg: '#f0fdfa',
    colorCard: '#ffffff',
    colorBorder: '#99f6e4',
    colorText: '#134e4a',
    colorSidebarBg: '#115e59',
    colorSidebarText: '#ccfbf1',
    backgroundStyle: 'factory-grid',
    sidebarStyle: 'factory',
  },
};

export function resolveTheme(theme?: Partial<TenantTheme> | null): TenantTheme {
  if (!theme) {
    return PRESETS['indigo-pro'];
  }

  const preset = theme.preset && theme.preset !== 'custom' ? theme.preset : 'indigo-pro';
  return {
    ...PRESETS[preset],
    ...theme,
    preset: theme.preset ?? preset,
  } as TenantTheme;
}

export function readCachedTenantTheme(): TenantTheme | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TenantTheme> | null;
    return resolveTheme(parsed);
  } catch (error) {
    console.error('Failed to read cached tenant theme:', error);
    return null;
  }
}

export function cacheTenantTheme(theme: TenantTheme) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch (error) {
    console.error('Failed to cache tenant theme:', error);
  }
}

export function applyTenantTheme(theme: TenantTheme) {
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.colorBg);
  root.style.setProperty('--color-card', theme.colorCard);
  root.style.setProperty('--color-border', theme.colorBorder);
  root.style.setProperty('--color-text', theme.colorText);
  root.style.setProperty('--color-primary', toRgbChannels(theme.primaryColor));
  root.style.setProperty('--color-secondary', '99 102 241');
  root.style.setProperty('--color-success', '5 150 105');
  root.style.setProperty('--color-warning', '217 119 6');
  root.style.setProperty('--color-danger', '220 38 38');
  root.style.setProperty('--color-primary-hex', theme.primaryColor);
  root.style.setProperty('--color-secondary-hex', '#6366F1');
  root.style.setProperty('--color-success-hex', '#059669');
  root.style.setProperty('--color-warning-hex', '#D97706');
  root.style.setProperty('--color-danger-hex', '#DC2626');
  root.style.setProperty('--color-background', theme.colorBg);
  root.style.setProperty('--color-sidebar-bg', theme.colorSidebarBg);
  root.style.setProperty('--color-sidebar-text', theme.colorSidebarText);
  root.style.setProperty('--tenant-logo', theme.logo ?? '');
  root.style.setProperty('--tenant-background-style', theme.backgroundStyle ?? '');
  root.style.setProperty('--tenant-sidebar-style', theme.sidebarStyle ?? '');

  root.style.setProperty(
    '--color-surface-hover',
    theme.preset === 'dark' ? '#334155' : '#f0f2f5',
  );

  root.classList.toggle('dark', theme.preset === 'dark');
  applyShadcnTokensFromTheme(theme, root);
}

export async function loadTenantTheme(tenantId?: string | null): Promise<TenantTheme> {
  if (!tenantId || !isConfigured) {
    return PRESETS['indigo-pro'];
  }

  try {
    const ref = doc(db, 'tenants', tenantId);
    const snapshot = await getDoc(ref);
    const data = snapshot.data() as { theme?: Partial<TenantTheme> } | undefined;
    return resolveTheme(data?.theme ?? null);
  } catch (error) {
    console.error('Failed to load tenant theme:', error);
    return PRESETS['indigo-pro'];
  }
}

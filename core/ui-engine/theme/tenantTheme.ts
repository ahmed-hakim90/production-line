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

  root.classList.toggle('dark', theme.preset === 'dark');
}

export async function loadTenantTheme(tenantId?: string | null): Promise<TenantTheme> {
  if (!tenantId || !isConfigured) {
    return PRESETS['indigo-pro'];
  }

  try {
    const ref = doc(db, 'tenants', tenantId, 'theme');
    const snapshot = await getDoc(ref);
    return resolveTheme(snapshot.data() as Partial<TenantTheme> | null);
  } catch (error) {
    console.error('Failed to load tenant theme:', error);
    return PRESETS['indigo-pro'];
  }
}

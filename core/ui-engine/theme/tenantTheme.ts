import { doc, getDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';

export type TenantThemePreset = 'light' | 'dark' | 'factory' | 'custom';

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

const PRESETS: Record<Exclude<TenantThemePreset, 'custom'>, TenantTheme> = {
  light: {
    preset: 'light',
    primaryColor: '#a80008',
    colorBg: '#f8fafc',
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
    return PRESETS.light;
  }

  const preset = theme.preset && theme.preset !== 'custom' ? theme.preset : 'light';
  return {
    ...PRESETS[preset],
    ...theme,
    preset: theme.preset ?? preset,
  } as TenantTheme;
}

export function applyTenantTheme(theme: TenantTheme) {
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.colorBg);
  root.style.setProperty('--color-card', theme.colorCard);
  root.style.setProperty('--color-border', theme.colorBorder);
  root.style.setProperty('--color-text', theme.colorText);
  root.style.setProperty('--color-primary', theme.primaryColor);
  root.style.setProperty('--color-sidebar-bg', theme.colorSidebarBg);
  root.style.setProperty('--color-sidebar-text', theme.colorSidebarText);
  root.style.setProperty('--tenant-logo', theme.logo ?? '');
  root.style.setProperty('--tenant-background-style', theme.backgroundStyle ?? '');
  root.style.setProperty('--tenant-sidebar-style', theme.sidebarStyle ?? '');

  root.classList.toggle('dark', theme.preset === 'dark');
}

export async function loadTenantTheme(tenantId?: string | null): Promise<TenantTheme> {
  if (!tenantId || !isConfigured) {
    return PRESETS.light;
  }

  try {
    const ref = doc(db, 'tenants', tenantId, 'theme');
    const snapshot = await getDoc(ref);
    return resolveTheme(snapshot.data() as Partial<TenantTheme> | null);
  } catch (error) {
    console.error('Failed to load tenant theme:', error);
    return PRESETS.light;
  }
}

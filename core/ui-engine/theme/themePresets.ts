/**
 * Ready-made appearance presets with harmonized palettes.
 * Each preset sets primary + secondary + tinted surfaces + text, and clears
 * sticky `cssVars` so shadcn tokens recompute from the new primary.
 */
import type { ThemeSettings } from '@/types';

export type ThemePresetOption = {
  id: string;
  name: string;
  description: string;
  colors: { primary: string; bg: string; card: string };
  swatches: [string, string, string];
  partialTheme: Partial<ThemeSettings>;
};

/** Stable operational semantics across light/dark brand themes. */
const SEMANTIC = {
  successColor: '#059669',
  warningColor: '#D97706',
  dangerColor: '#DC2626',
} as const;

type Hsl = { h: number; s: number; l: number };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim();
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[\da-fA-F]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  if (/^[\da-fA-F]{3}$/.test(h)) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
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
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function mixHex(a: string, b: string, amount: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  if (!A || !B) return a;
  const t = clamp(amount, 0, 1);
  return toHex(
    A.r * (1 - t) + B.r * t,
    A.g * (1 - t) + B.g * t,
    A.b * (1 - t) + B.b * t,
  );
}

/** Soft chip tint for preset cards (same family as primary). */
export function softAccentFromPrimary(primary: string): string {
  const hsl = hexToHsl(primary);
  if (!hsl) return mixHex(primary, '#ffffff', 0.82);
  return hslToHex(hsl.h, clamp(hsl.s * 0.45, 18, 48), 90);
}

/** Page background: cool neutral with a light primary wash. */
export function tintedBackgroundFromPrimary(primary: string, isDark = false): string {
  if (isDark) return '#020617';
  const hsl = hexToHsl(primary);
  if (!hsl) return '#F8FAFC';
  return hslToHex(hsl.h, clamp(hsl.s * 0.14, 8, 22), 97.6);
}

/** Secondary = same hue, slightly lighter — pairs with primary buttons/links. */
export function secondaryFromPrimary(primary: string, isDark = false): string {
  const hsl = hexToHsl(primary);
  if (!hsl) return isDark ? '#93C5FD' : '#6366F1';
  if (isDark) {
    return hslToHex(hsl.h, clamp(hsl.s, 40, 85), clamp(hsl.l + 10, 55, 78));
  }
  return hslToHex(hsl.h, clamp(hsl.s * 0.85, 45, 78), clamp(hsl.l + 10, 42, 62));
}

type PresetBuildInput = {
  id: string;
  name: string;
  description: string;
  primary: string;
  dark?: boolean;
  sidebarIconStyle?: ThemeSettings['sidebarIconStyle'];
  /** Optional override when auto-tint is too strong/weak. */
  backgroundColor?: string;
  cardColor?: string;
};

function buildPreset(input: PresetBuildInput): ThemePresetOption {
  const isDark = input.dark === true;
  const primary = input.primary;
  const bg =
    input.backgroundColor
    ?? tintedBackgroundFromPrimary(primary, isDark);
  const soft = softAccentFromPrimary(primary);
  const card = input.cardColor ?? (isDark ? '#0f172a' : '#ffffff');
  const secondary = secondaryFromPrimary(primary, isDark);

  return {
    id: input.id,
    name: input.name,
    description: input.description,
    colors: { primary, bg, card },
    swatches: isDark ? [bg, card, primary] : [bg, soft, primary],
    partialTheme: {
      primaryColor: primary,
      secondaryColor: secondary,
      ...SEMANTIC,
      backgroundColor: bg,
      textColor: isDark ? '#e2e8f0' : '#0f172a',
      mutedTextColor: isDark ? '#94a3b8' : '#64748b',
      darkMode: isDark ? 'dark' : 'light',
      sidebarIconStyle: input.sidebarIconStyle ?? (isDark ? 'primary' : 'primary'),
      // Clear sticky shadcn overrides from a previous preset (e.g. Indigo Pro).
      cssVars: {},
    },
  };
}

/**
 * Curated ERP themes: shared surface logic, distinct brand accents,
 * stable success/warning/danger for operators.
 */
export const THEME_PRESETS: ThemePresetOption[] = [
  buildPreset({
    id: 'indigo-pro',
    name: 'Indigo Pro ⭐',
    description: 'الثيم الافتراضي الرسمي',
    primary: '#4F46E5',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'royal_blue',
    name: 'أزرق ملكي',
    description: 'أنيق ومحترف',
    primary: '#1D4ED8',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'sky_blue',
    name: 'سماوي نقي',
    description: 'هادئ ومريح',
    primary: '#0284C7',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'erpnext_espresso',
    name: 'ERPNext أزرق',
    description: 'أزرق تشغيلي واضح',
    primary: '#2490EF',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'erpnext_indigo',
    name: 'نيلي عميق',
    description: 'نيلي داكن محترف',
    primary: '#4338CA',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'teal_factory',
    name: 'تيل صناعي',
    description: 'ثيم المصنع',
    primary: '#0F766E',
    sidebarIconStyle: 'colorful',
  }),
  buildPreset({
    id: 'emerald_pro',
    name: 'أخضر زمردي',
    description: 'مناسب للمصانع',
    primary: '#047857',
    sidebarIconStyle: 'colorful',
  }),
  buildPreset({
    id: 'classic_red',
    name: 'كلاسيك أحمر',
    description: 'هوية المؤسسة',
    primary: '#B91C1C',
    sidebarIconStyle: 'colorful',
  }),
  buildPreset({
    id: 'amber_gold',
    name: 'ذهبي احترافي',
    description: 'دافئ ومميز',
    primary: '#B45309',
    sidebarIconStyle: 'colorful',
  }),
  buildPreset({
    id: 'violet_modern',
    name: 'بنفسجي عصري',
    description: 'تصميم حديث',
    primary: '#7C3AED',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'rose_elegant',
    name: 'وردي أنيق',
    description: 'راقٍ وعصري',
    primary: '#DB2777',
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'dark_navy',
    name: 'داكن ليلي',
    description: 'للعمل الليلي',
    primary: '#60A5FA',
    dark: true,
    sidebarIconStyle: 'primary',
  }),
  buildPreset({
    id: 'dark_emerald',
    name: 'داكن أخضر',
    description: 'داكن مميز',
    primary: '#34D399',
    dark: true,
    sidebarIconStyle: 'muted',
  }),
];

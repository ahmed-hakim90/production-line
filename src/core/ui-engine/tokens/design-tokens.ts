// ─── Color Palette ───────────────────────────────────────────────────────────

export const colors = {
  primary: {
    DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
    50:  '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#24308f',
    600: '#1e2877',
    700: '#19215f',
    800: '#131a4a',
    900: '#0e1338',
  },
  secondary: {
    DEFAULT: '#64748b',
    50:  '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    danger:  '#ef4444',
    info:    '#3b82f6',
  },
  surface: {
    light:    '#ffffff',
    lightAlt: '#f6f7f8',
    dark:     '#0f172a',
    darkAlt:  '#1e293b',
  },
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    base: "'Cairo', 'Noto Sans Arabic', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs:   ['0.75rem',  { lineHeight: '1rem' }],
    sm:   ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['0.875rem', { lineHeight: '1.5rem' }],
    lg:   ['1.125rem', { lineHeight: '1.75rem' }],
    xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem',  { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
  },
  fontWeight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
    black:    900,
  },
} as const;

// ─── Spacing & Sizing ────────────────────────────────────────────────────────

export const spacing = {
  px: '1px',
  0:   '0',
  0.5: '0.125rem',
  1:   '0.25rem',
  1.5: '0.375rem',
  2:   '0.5rem',
  2.5: '0.625rem',
  3:   '0.75rem',
  4:   '1rem',
  5:   '1.25rem',
  6:   '1.5rem',
  8:   '2rem',
  10:  '2.5rem',
  12:  '3rem',
  16:  '4rem',
  20:  '5rem',
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────

export const radii = {
  none: '0',
  sm:   '0.375rem',
  md:   '0.5rem',
  lg:   '0.75rem',
  xl:   '1rem',
  '2xl': '1.25rem',
  full: '9999px',
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadows = {
  sm:    '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md:    '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg:    '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl:    '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none:  'none',
  primary: '0 4px 14px 0 rgba(36, 48, 143, 0.2)',
  success: '0 4px 14px 0 rgba(16, 185, 129, 0.2)',
  danger:  '0 4px 14px 0 rgba(239, 68, 68, 0.2)',
} as const;

// ─── Transitions ─────────────────────────────────────────────────────────────

export const transitions = {
  fast:   'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow:   'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ─── Z-Index Scale ───────────────────────────────────────────────────────────

export const zIndex = {
  base:      0,
  dropdown:  10,
  sticky:    20,
  header:    30,
  overlay:   40,
  sidebar:   50,
  modal:     60,
  popover:   70,
  toast:     80,
} as const;

// ─── Breakpoints ─────────────────────────────────────────────────────────────

export const breakpoints = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl': '1536px',
} as const;

// ─── Component-specific tokens ───────────────────────────────────────────────

export const components = {
  sidebar: {
    width:          '16rem',
    collapsedWidth: '72px',
  },
  header: {
    height:   '5rem',
    heightSm: '4rem',
  },
  input: {
    height:   '2.75rem',
    heightSm: '2.25rem',
    heightLg: '3rem',
  },
  card: {
    padding:    '1.5rem',
    paddingSm:  '1rem',
  },
  table: {
    rowHeight: '3.5rem',
    headerHeight: '3rem',
  },
} as const;

// ─── Aggregated token map ────────────────────────────────────────────────────

export const designTokens = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  components,
} as const;

export type DesignTokens = typeof designTokens;

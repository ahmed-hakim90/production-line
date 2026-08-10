/**
 * Theme-aware chart / SVG color helpers.
 * Prefer CSS vars so dashboards follow tenant theme + chart palette.
 */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const;

export const CHART_GRID_STROKE = 'var(--color-border)';
export const CHART_AXIS_FILL = 'var(--color-text-muted)';
export const CHART_MUTED = 'var(--color-text-muted)';

export const CHART_SUCCESS = 'var(--color-success-hex)';
export const CHART_WARNING = 'var(--color-warning-hex)';
export const CHART_DANGER = 'var(--color-danger-hex)';
export const CHART_PRIMARY = 'var(--color-primary-hex)';

/** Efficiency / health score → semantic theme color. */
export function chartScoreColor(value: number): string {
  if (value >= 80) return CHART_SUCCESS;
  if (value >= 60) return CHART_WARNING;
  if (value >= 40) return 'var(--chart-3)';
  return CHART_DANGER;
}

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Semantic layers (surfaces): page bg → `--color-bg` / `--color-background`;
 * cards → `--color-card`; borders → `--color-border`; body → `--color-text`; muted → `--color-text-muted`.
 * Spacing follows `--page-shell-gap` (tied to UI density).
 */

export type PageShellMaxWidth = 'default' | 'full' | 'narrow';

export interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  /** Extra width control when not using the default AppLayout max-width wrapper. */
  maxWidth?: PageShellMaxWidth;
}

const maxWidthClass: Record<PageShellMaxWidth, string> = {
  /** AppLayout already applies theme `contentMaxWidth` — default is full width inside that wrapper. */
  default: 'w-full min-w-0',
  full: 'w-full max-w-none min-w-0',
  /** Prefer theme content width; avoid hard-coded Tailwind max-w on authenticated pages. */
  narrow: 'w-full max-w-[min(100%,var(--content-max-width,56rem))] mx-auto min-w-0',
};

/**
 * Vertical rhythm wrapper for internal pages: use as the outermost child inside the main content area
 * (below optional `PageHeader`). Gap scales with `--page-shell-gap` / `--density-scale`.
 */
export const PageShell: React.FC<PageShellProps> = ({ children, className, maxWidth = 'default' }) => (
  <div
    className={cn(
      'erp-page-shell flex flex-col min-w-0',
      maxWidthClass[maxWidth],
      className,
    )}
    style={{ gap: 'var(--page-shell-gap, 1rem)' }}
  >
    {children}
  </div>
);

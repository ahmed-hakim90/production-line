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
  /** AppLayout already constrains to max-w-screen-2xl — default is a no-op width class. */
  default: 'w-full min-w-0',
  full: 'w-full max-w-none min-w-0',
  narrow: 'w-full max-w-4xl mx-auto min-w-0',
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

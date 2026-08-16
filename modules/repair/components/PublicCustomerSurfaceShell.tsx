import React from 'react';
import { BrandMark } from '@/components/system-ui/BrandMark';
import { PRODUCT_BRAND } from '@/lib/productBrand';
import { cn } from '@/lib/utils';

type PublicCustomerSurfaceShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Narrow login / single-form pages. */
  narrow?: boolean;
  contentClassName?: string;
  dir?: 'rtl' | 'ltr';
};

/**
 * Chrome for public customer surfaces (`/portal`, `/track`).
 * Intentionally not ModuleOpsPageShell — staff ERP navigation must stay out.
 */
export const PublicCustomerSurfaceShell: React.FC<PublicCustomerSurfaceShellProps> = ({
  title,
  subtitle,
  actions,
  children,
  footer,
  narrow = false,
  contentClassName,
  dir = 'rtl',
}) => {
  const widthClass = narrow ? 'max-w-md' : 'max-w-5xl';
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]" dir={dir}>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <div className={cn('mx-auto flex items-center justify-between gap-3 px-4 py-3', widthClass, contentClassName)}>
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size={36} decorative />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">{PRODUCT_BRAND.name}</p>
              <h1 className="truncate text-sm font-bold">{title}</h1>
              {subtitle ? (
                <p className="truncate text-xs text-[var(--color-text-muted)]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <main
        className={cn(
          'mx-auto px-4 py-5',
          widthClass,
          footer && 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]',
          contentClassName,
        )}
      >
        {children}
      </main>
      {footer}
    </div>
  );
};

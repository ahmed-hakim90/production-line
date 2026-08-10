import React from 'react';
import { tenantHomePath, tenantSlugFromPathname } from '@/lib/tenantPaths';
import { resolvePreferredTenantHomePath } from '@/lib/navigationRecovery';

export type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  /** Explicit tenant home href; otherwise derived from `/t/:tenantSlug` or preferred slug. */
  homeHref?: string;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  retryKey: number;
};

/**
 * Catches render errors in a route subtree and shows an Arabic recovery UI
 * instead of a white screen. Does not expose stack traces to users.
 */
export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(): Partial<RouteErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Operator-facing UI stays generic; details stay in the console for support.
    console.error('[RouteErrorBoundary]', error?.message || error, info?.componentStack);
  }

  private resolveHomeHref(): string {
    const fromProp = (this.props.homeHref || '').trim();
    if (fromProp) return fromProp;
    if (typeof window !== 'undefined') {
      const slug = tenantSlugFromPathname(window.location.pathname);
      if (slug) return tenantHomePath(slug);
    }
    return resolvePreferredTenantHomePath();
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      retryKey: prev.retryKey + 1,
    }));
  };

  private handleGoHome = (): void => {
    const href = this.resolveHomeHref();
    if (typeof window !== 'undefined') {
      window.location.assign(href);
      return;
    }
    this.handleRetry();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-[50vh] flex items-center justify-center p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm p-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger))]/30">
              <span className="material-icons-round text-[rgb(var(--color-danger))] dark:text-[rgb(var(--color-danger))] text-3xl" aria-hidden>
                error_outline
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[var(--color-text)]">تعذّر عرض هذه الصفحة</h2>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                حدث خطأ أثناء تحميل المحتوى. يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-center">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <span className="material-icons-round text-base" aria-hidden>
                  refresh
                </span>
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-card)]"
              >
                <span className="material-icons-round text-base" aria-hidden>
                  home
                </span>
                الصفحة الرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

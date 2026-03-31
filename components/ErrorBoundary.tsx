import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-6">
          <div className="max-w-md w-full rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800 p-8 text-center space-y-4">
            <span className="material-icons-round text-rose-500 text-5xl">error_outline</span>
            <h2 className="text-lg font-bold text-rose-700 dark:text-rose-300">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {this.state.error?.message || 'يرجى إعادة تحميل الصفحة أو التواصل مع الدعم الفني.'}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

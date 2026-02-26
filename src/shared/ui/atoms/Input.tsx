import React, { forwardRef } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: string;
  size?: InputSize;
  fullWidth?: boolean;
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-9 text-xs px-3',
  md: 'h-11 text-sm px-4',
  lg: 'h-12 text-base px-4',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, icon, size = 'md', fullWidth = true, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-')}` : undefined);
    const hasError = Boolean(error);

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-lg pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full rounded-xl border bg-slate-50 dark:bg-slate-800 font-medium transition-all',
              'outline-none focus:ring-2 focus:bg-white dark:focus:bg-slate-800',
              hasError
                ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500 focus:ring-rose-500/20'
                : 'border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-primary/20 hover:border-slate-300 dark:hover:border-slate-600',
              'text-slate-700 dark:text-slate-200 placeholder-slate-400',
              icon ? 'pr-10' : '',
              sizeClasses[size],
              className,
            ].filter(Boolean).join(' ')}
            {...props}
          />
        </div>
        {(hint || error) && (
          <p className={`mt-1.5 text-xs font-medium ${hasError ? 'text-rose-500' : 'text-slate-400'}`}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

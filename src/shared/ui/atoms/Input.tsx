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
  sm: 'h-8 text-[12px] px-2.5',
  md: 'h-9 text-[13px] px-3',
  lg: 'h-10 text-[13.5px] px-3.5',
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
            className="block text-[11.5px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 material-icons-round text-[var(--color-text-muted)] text-[16px] pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full rounded-[var(--border-radius-base)] border font-medium transition-all',
              'bg-[#f8f9fa] outline-none',
              'focus:bg-white focus:ring-2',
              hasError
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                : 'border-[var(--color-border)] focus:border-primary focus:ring-primary/12 hover:border-primary/40',
              'text-[var(--color-text)] placeholder-[var(--color-text-muted)]',
              icon ? 'pr-9' : '',
              sizeClasses[size],
              className,
            ].filter(Boolean).join(' ')}
            {...props}
          />
        </div>
        {(hint || error) && (
          <p className={`mt-1 text-[11.5px] font-medium ${hasError ? 'text-rose-500' : 'text-[var(--color-text-muted)]'}`}>
            {error || hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

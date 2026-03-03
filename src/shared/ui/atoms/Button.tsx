import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-primary text-white hover:opacity-90',
  secondary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  outline:   'border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] hover:bg-[#f0f2f5]',
  ghost:     'text-[var(--color-text-muted)] hover:bg-[#f0f2f5] hover:text-[var(--color-text)]',
  danger:    'bg-rose-500 text-white hover:bg-rose-600',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-[11.5px] gap-1',
  md: 'px-3.5 py-2 text-[13px] gap-1.5',
  lg: 'px-5 py-2.5 text-[14px] gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'start',
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      className={[
        'rounded-[var(--border-radius-base)] font-semibold transition-colors inline-flex items-center justify-center',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ].filter(Boolean).join(' ')}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <span className="material-icons-round animate-spin text-[1em]">progress_activity</span>
      )}
      {!loading && icon && iconPosition === 'start' && (
        <span className="material-icons-round text-[1.1em]">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'end' && (
        <span className="material-icons-round text-[1.1em]">{icon}</span>
      )}
    </button>
  );
};

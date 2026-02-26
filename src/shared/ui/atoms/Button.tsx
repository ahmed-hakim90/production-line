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
  primary:   'bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20',
  secondary: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20',
  outline:   'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
  ghost:     'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
  danger:    'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
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
        'rounded-lg font-bold transition-all inline-flex items-center justify-center',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-60 cursor-not-allowed' : '',
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

import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  pulse?: boolean;
  dot?: boolean;
  icon?: string;
}

/* ERPNext-style: background tint + matching border */
const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50  text-amber-700  border border-amber-200',
  danger:  'bg-rose-50   text-rose-700   border border-rose-200',
  info:    'bg-blue-50   text-blue-700   border border-blue-200',
  neutral: 'bg-[#f0f2f5] text-[var(--color-text-muted)] border border-[var(--color-border)]',
};

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-rose-500',
  info:    'bg-blue-500',
  neutral: 'bg-[var(--color-text-muted)]',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-px   text-[10px]',
  md: 'px-2   py-0.5  text-[11px]',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  pulse = false,
  dot = true,
  icon,
}) => (
  <span
    className={[
      'inline-flex items-center gap-1 rounded font-semibold',
      variantClasses[variant],
      sizeClasses[size],
    ].join(' ')}
  >
    {icon && <span className="material-icons-round text-[1em]">{icon}</span>}
    {dot && !icon && (
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[variant]} ${pulse ? 'animate-pulse' : ''}`} />
    )}
    {children}
  </span>
);

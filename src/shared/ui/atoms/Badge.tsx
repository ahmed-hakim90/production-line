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

const bgClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger:  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  info:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-rose-500',
  info:    'bg-blue-500',
  neutral: 'bg-slate-400',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
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
      'inline-flex items-center gap-1.5 rounded-full font-bold',
      bgClasses[variant],
      sizeClasses[size],
    ].join(' ')}
  >
    {icon && <span className="material-icons-round text-[1em]">{icon}</span>}
    {dot && !icon && (
      <span className={`w-1.5 h-1.5 rounded-full ${dotClasses[variant]} ${pulse ? 'animate-pulse' : ''}`} />
    )}
    {children}
  </span>
);

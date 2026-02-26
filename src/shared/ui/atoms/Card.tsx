import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  noPadding?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  actions,
  noPadding = false,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={[
      'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden',
      onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : '',
      className,
    ].filter(Boolean).join(' ')}
  >
    {(title || actions) && (
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold truncate">{title}</h3>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-6'}>{children}</div>
  </div>
);

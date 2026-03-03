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
      'bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden',
      onClick ? 'cursor-pointer hover:border-primary/30 transition-colors' : '',
      className,
    ].filter(Boolean).join(' ')}
    style={{ boxShadow: 'var(--shadow-card)' }}
  >
    {(title || actions) && (
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[#f8f9fa]">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-4'}>{children}</div>
  </div>
);

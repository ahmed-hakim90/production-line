import * as React from 'react';
import { cn } from '@/lib/utils';

const variantStyles: Record<'info' | 'error' | 'success', string> = {
  info: 'border-blue-200 bg-[#eff6ff] text-[#1e40af]',
  error: 'border-rose-200 bg-[#fff1f2] text-[#9f1239]',
  success: 'border-emerald-200 bg-[#f0fdf4] text-[#166534]',
};

type AuthAlertProps = {
  variant: 'info' | 'error' | 'success';
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  role?: 'alert' | 'status';
};

/** Inline alerts for auth flows; colors aligned with legacy erp-alert + shadcn-style borders. */
export function AuthAlert({ variant, icon, children, className, role }: AuthAlertProps) {
  return (
    <div
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--border-radius-base)] border px-3.5 py-2.5 text-[12.5px] font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {icon ? <span className="material-icons-round mt-0.5 shrink-0 text-[17px] opacity-90">{icon}</span> : null}
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
    </div>
  );
}

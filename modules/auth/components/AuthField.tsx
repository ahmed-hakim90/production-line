import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type AuthFieldProps = {
  id: string;
  label: string;
  icon: string;
  hint?: React.ReactNode;
  /** When set, the hint wrapper gets this id (for aria-describedby). */
  hintId?: string;
  className?: string;
  inputClassName?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<typeof Input>, 'id'>;

/**
 * Label + icon + input row matching legacy erp-auth-field layout (icon on physical right).
 */
export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ id, label, icon, hint, hintId, className, inputClassName, children, ...inputProps }, ref) => (
    <div className={cn('mb-4 space-y-1.5', className)}>
      <Label
        htmlFor={id}
        className="text-xs font-semibold text-[var(--color-text)]"
      >
        {label}
      </Label>
      <div className="relative">
        <span
          className="material-icons-round pointer-events-none absolute right-2.5 top-1/2 z-[1] -translate-y-1/2 text-[17px] text-[var(--color-text-muted)]"
          aria-hidden
        >
          {icon}
        </span>
        {children ?? (
          <Input
            ref={ref}
            id={id}
            className={cn(
              'h-[38px] border-[var(--color-border)] bg-[var(--color-card)] pe-10 ps-2.5 text-[13px] text-[var(--color-text)] shadow-none',
              'focus-visible:border-[rgb(var(--color-primary))] focus-visible:ring-[rgb(var(--color-primary)/0.1)]',
              inputClassName,
            )}
            {...inputProps}
          />
        )}
      </div>
      {hint ? (
        <div
          id={hintId}
          className="mt-1.5 text-[11px] leading-snug text-[var(--color-text-muted)] [&_span]:font-semibold [&_span]:text-[var(--color-text)]"
        >
          {hint}
        </div>
      ) : null}
    </div>
  ),
);
AuthField.displayName = 'AuthField';

type AuthPasswordFieldProps = Omit<AuthFieldProps, 'children' | 'type'> & {
  showPassword: boolean;
  onTogglePassword: () => void;
};

export const AuthPasswordField = React.forwardRef<HTMLInputElement, AuthPasswordFieldProps>(
  ({ id, label, icon, hint, hintId, className, inputClassName, showPassword, onTogglePassword, ...inputProps }, ref) => (
    <div className={cn('mb-4 space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs font-semibold text-[var(--color-text)]">
        {label}
      </Label>
      <div className="relative">
        <span
          className="material-icons-round pointer-events-none absolute right-2.5 top-1/2 z-[1] -translate-y-1/2 text-[17px] text-[var(--color-text-muted)]"
          aria-hidden
        >
          {icon}
        </span>
        <Input
          ref={ref}
          id={id}
          type={showPassword ? 'text' : 'password'}
          className={cn(
            'h-[38px] border-[var(--color-border)] bg-[var(--color-card)] pe-10 ps-10 text-[13px] text-[var(--color-text)] shadow-none',
            'focus-visible:border-[rgb(var(--color-primary))] focus-visible:ring-[rgb(var(--color-primary)/0.1)]',
            inputClassName,
          )}
          {...inputProps}
        />
        <button
          type="button"
          className="absolute left-2.5 top-1/2 z-[1] flex -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          onClick={onTogglePassword}
          tabIndex={-1}
          aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          <span className="material-icons-round text-[19px]">
            {showPassword ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {hint ? (
        <div id={hintId} className="mt-1.5 text-[11px] leading-snug text-[var(--color-text-muted)]">
          {hint}
        </div>
      ) : null}
    </div>
  ),
);
AuthPasswordField.displayName = 'AuthPasswordField';

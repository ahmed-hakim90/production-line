import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  children: React.ReactNode;
  error?: string;
  description?: string;
  className?: string;
  required?: boolean;
}

/**
 * Unified label + optional description + control slot + error (RTL-friendly).
 * Wire `aria-describedby` on the control to `${id}-desc` / `${id}-err` when needed.
 */
export function FormField({
  id,
  label,
  children,
  error,
  description,
  className,
  required,
}: FormFieldProps) {
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive ms-0.5" aria-hidden>*</span> : null}
      </Label>
      {description ? (
        <p id={descId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

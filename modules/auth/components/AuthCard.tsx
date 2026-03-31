import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type AuthCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

/** Auth column card; keeps ERP surface tokens alongside shadcn Card. */
export function AuthCard({ title, description, children, className }: AuthCardProps) {
  return (
    <Card
      className={cn(
        'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] shadow-sm',
        'rounded-[var(--border-radius-lg,8px)]',
        className,
      )}
    >
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-lg font-bold tracking-tight text-[var(--color-text)]">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-[13px] text-[var(--color-text-muted)]">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}


import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  Factory,
  Package,
  Circle,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Button as UiButton } from '@/components/ui/button';
import {
  Card as UiCard,
  CardContent as UiCardContent,
  CardHeader as UiCardHeader,
  CardTitle as UiCardTitle,
} from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const KPI_ICON_MAP: Record<string, LucideIcon> = {
  analytics: BarChart3,
  bar_chart: BarChart3,
  bolt: Zap,
  category: Boxes,
  delete_sweep: Trash2,
  factory: Factory,
  groups: Users,
  inventory_2: Package,
  inventory: Package,
  production_quantity_limits: Factory,
};

function renderKpiIcon(icon: string, className?: string) {
  const Lucide = KPI_ICON_MAP[icon];
  if (Lucide) return <Lucide size={20} className={className} />;
  return <Circle size={20} className={className} />;
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, onClick }) => (
  <UiCard
    onClick={onClick}
    className={`bg-[var(--color-card)] rounded-[var(--border-radius-xl,12px)] border border-[var(--color-border)] overflow-hidden ring-1 ring-slate-900/[0.04] dark:ring-white/10 ${onClick ? 'cursor-pointer hover:border-primary/30 hover:shadow-md transition-shadow' : ''} ${className}`}
    style={{ boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.08))' }}
  >
    {title && (
      <UiCardHeader className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
        <UiCardTitle className="text-[13.5px] font-semibold text-[var(--color-text)]">{title}</UiCardTitle>
      </UiCardHeader>
    )}
    <UiCardContent className="p-4">{children}</UiCardContent>
  </UiCard>
);

interface KPIBoxProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  trendUp?: boolean;
  colorClass?: string;
  unit?: string;
}

export const KPIBox: React.FC<KPIBoxProps> = ({ label, value, icon, trend, trendUp, colorClass = 'bg-primary/10 text-primary', unit }) => (
  <div
    className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-xl,12px)] border border-[var(--color-border)] ring-1 ring-slate-900/[0.04] dark:ring-white/10 flex items-center gap-3.5 min-h-[108px] h-full"
    style={{ boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.08))' }}
  >
    <div className={`w-11 h-11 ${colorClass} rounded-[var(--border-radius-lg,8px)] flex items-center justify-center shrink-0`}>
      {renderKpiIcon(icon)}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[11.5px] text-[var(--color-text-muted)] mb-0.5 font-medium leading-tight">{label}</p>
      <h3 className="text-[18px] font-bold flex items-baseline gap-1 leading-tight text-[var(--color-text)]">
        {value}
        {unit && <span className="text-[11px] font-normal text-[var(--color-text-muted)]">{unit}</span>}
      </h3>
      {trend && (
        <div className={`flex items-center gap-0.5 text-[11px] mt-0.5 font-semibold ${trendUp ? 'text-emerald-600' : 'text-rose-500'}`}>
          {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{trend}</span>
        </div>
      )}
    </div>
  </div>
);

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant, color, pulse }) => {
  const resolvedVariant: NonNullable<BadgeProps['variant']> = variant ?? (
    color === 'green' ? 'success'
      : color === 'yellow' ? 'warning'
      : color === 'red' ? 'danger'
      : color === 'blue' ? 'info'
      : 'neutral'
  );
  const styles: Record<NonNullable<BadgeProps['variant']>, string> = {
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-blue-50 text-blue-700 border border-blue-200',
    neutral: 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
  };
  const dotStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-blue-500',
    neutral: 'bg-[var(--color-text-muted)]',
  };
  return (
    <UiBadge className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold', styles[resolvedVariant])}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotStyles[resolvedVariant], pulse && 'animate-pulse')} />
      {children}
    </UiBadge>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number; type?: 'card' | 'table' | 'detail' }> = ({ rows = 4, type = 'card' }) => {
  if (type === 'detail') {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-[var(--color-border)]/60" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3 bg-[var(--color-border)]/60" />
            <Skeleton className="h-3 w-1/4 bg-[var(--color-border)]/60" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <Skeleton className="h-3 w-2/3 mb-2 bg-[var(--color-border)]/60" />
              <Skeleton className="h-6 w-1/2 bg-[var(--color-border)]/60" />
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] h-48">
          <Skeleton className="h-3 w-1/4 mb-3 bg-[var(--color-border)]/60" />
          <Skeleton className="h-full opacity-50 bg-[var(--color-border)]/60" />
        </div>
      </div>
    );
  }
  if (type === 'table') {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-4 flex-1 bg-[var(--color-border)]/60" />
            <Skeleton className="h-4 w-16 bg-[var(--color-border)]/60" />
            <Skeleton className="h-4 w-12 bg-[var(--color-border)]/60" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <Skeleton className="h-4 w-2/3 mb-3 bg-[var(--color-border)]/60" />
          <Skeleton className="h-3 w-1/2 mb-2 bg-[var(--color-border)]/60" />
          <Skeleton className="h-3 w-full mb-1.5 bg-[var(--color-border)]/60" />
          <Skeleton className="h-3 w-4/5 bg-[var(--color-border)]/60" />
        </div>
      ))}
    </div>
  );
};

type LegacyButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'default';
type LegacyButtonSize = 'sm' | 'default' | 'lg' | 'icon';

interface LegacyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LegacyButtonVariant;
  size?: LegacyButtonSize;
}

export const Button: React.FC<LegacyButtonProps> = ({
  children,
  variant = 'primary',
  size = 'default',
  className = '',
  ...props
}) => {
  const mappedVariant = variant === 'danger'
    ? 'destructive'
    : variant === 'outline'
      ? 'outline'
      : variant === 'ghost'
        ? 'ghost'
        : variant === 'secondary'
          ? 'secondary'
          : 'default';

  const legacyVariantClasses = {
    primary: 'bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary)/0.9)]',
    default: 'bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary)/0.9)]',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline: '',
    ghost: '',
    danger: 'bg-[#D85A30] text-white hover:bg-[#BF4D28]',
  };

  return (
    <UiButton
      variant={mappedVariant}
      size={size}
      className={cn('text-[13px] font-semibold', legacyVariantClasses[variant], className)}
      {...props}
    >
      {children}
    </UiButton>
  );
};

// ─── Searchable Select ────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  className = '',
}) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('shared.selectPlaceholder');
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value]
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <UiButton
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between h-10 text-[13px] font-medium border-[var(--color-border)] bg-[var(--color-bg)] hover:border-primary/30',
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Search className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
            <span className="truncate text-[var(--color-text)]">{selectedLabel || resolvedPlaceholder}</span>
          </span>
          <span className="flex items-center gap-1">
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t('shared.clearSelection')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange('');
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <X className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
          </span>
        </UiButton>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={resolvedPlaceholder} />
          <CommandList>
            <CommandEmpty>{t('shared.noResults')}</CommandEmpty>
            <CommandGroup>
              {options.map((opt, idx) => (
                <CommandItem
                  key={opt.value || `opt-${idx}`}
                  // cmdk filters by `value`; include id so items stay unique when labels repeat (e.g. product names).
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => handleSelect(opt.value)}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

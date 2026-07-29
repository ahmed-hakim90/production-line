import { useMemo, useState, type ReactNode } from 'react';
import { Search, Plus, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export interface FilterOption {
  value: string;
  label: string;
}

/** Unified filter definition (preferred going forward). */
export interface FilterDef {
  key: string;
  label: string;
  placeholder?: string;
  options?: FilterOption[];
  type?: 'select' | 'date' | 'month';
  width?: string;
  /** When true, shows an empty chip ready to pick without opening Add filter. */
  defaultVisible?: boolean;
}

/** @deprecated Prefer FilterDef — kept for backward compatibility. */
export interface QuickFilter {
  key: string;
  placeholder: string;
  options: FilterOption[];
  width?: string;
}

/** @deprecated Prefer FilterDef — kept for backward compatibility. */
export interface AdvancedFilter {
  key: string;
  label: string;
  placeholder: string;
  options?: FilterOption[];
  width?: string;
  type?: 'select' | 'date' | 'month';
}

export interface PeriodOption {
  label: string;
  value: string;
}

interface SmartFilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  periods?: PeriodOption[];
  activePeriod?: string;
  onPeriodChange?: (value: string) => void;
  /** Preferred: unified filter list. */
  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  /** @deprecated Maps to filters with defaultVisible: true */
  quickFilters?: QuickFilter[];
  quickFilterValues?: Record<string, string>;
  onQuickFilterChange?: (key: string, value: string) => void;
  /** @deprecated Maps to filters with defaultVisible: false */
  advancedFilters?: AdvancedFilter[];
  advancedFilterValues?: Record<string, string>;
  onAdvancedFilterChange?: (key: string, value: string) => void;
  /** Only render when a real apply/reload is needed. */
  onApply?: () => void;
  applyLabel?: string;
  extra?: ReactNode;
  className?: string;
}

function isActiveValue(value: string | undefined, type?: FilterDef['type']): boolean {
  if (value == null || value === '') return false;
  if (type === 'date' || type === 'month') return value !== '';
  return value !== 'all';
}

function emptyValueFor(type?: FilterDef['type']): string {
  return type === 'date' || type === 'month' ? '' : 'all';
}

function resolveFilters(
  filters: FilterDef[] | undefined,
  quickFilters: QuickFilter[],
  advancedFilters: AdvancedFilter[],
): FilterDef[] {
  if (filters && filters.length > 0) return filters;

  const fromQuick: FilterDef[] = quickFilters.map((filter) => ({
    key: filter.key,
    label: filter.placeholder,
    placeholder: filter.placeholder,
    options: filter.options,
    type: 'select' as const,
    width: filter.width,
    defaultVisible: true,
  }));

  const fromAdvanced: FilterDef[] = advancedFilters.map((filter) => ({
    key: filter.key,
    label: filter.label,
    placeholder: filter.placeholder,
    options: filter.options,
    type: filter.type ?? 'select',
    width: filter.width,
    defaultVisible: false,
  }));

  return [...fromQuick, ...fromAdvanced];
}

function displayValueLabel(filter: FilterDef, value: string): string {
  if (filter.type === 'date' || filter.type === 'month') return value;
  return filter.options?.find((option) => option.value === value)?.label ?? value;
}

export function SmartFilterBar({
  searchPlaceholder,
  searchValue = '',
  onSearchChange,
  periods,
  activePeriod,
  onPeriodChange,
  filters,
  filterValues,
  onFilterChange,
  quickFilters = [],
  quickFilterValues = {},
  onQuickFilterChange,
  advancedFilters = [],
  advancedFilterValues = {},
  onAdvancedFilterChange,
  onApply,
  applyLabel,
  extra,
  className,
}: SmartFilterBarProps) {
  const { t } = useTranslation();
  const { dir } = useAppDirection();
  const [addOpen, setAddOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [manuallyVisible, setManuallyVisible] = useState<Set<string>>(() => new Set());
  const [addQuery, setAddQuery] = useState('');

  const resolvedSearchPlaceholder = searchPlaceholder ?? t('erpComponents.smartFilterBar.searchPlaceholder');
  const resolvedApplyLabel = applyLabel ?? t('erpComponents.smartFilterBar.applyLabel');

  const allFilters = useMemo(
    () => resolveFilters(filters, quickFilters, advancedFilters),
    [filters, quickFilters, advancedFilters],
  );

  const getValue = (key: string): string => {
    if (filterValues && key in filterValues) return filterValues[key] ?? '';
    if (key in quickFilterValues) return quickFilterValues[key] ?? 'all';
    if (key in advancedFilterValues) return advancedFilterValues[key] ?? '';
    const filter = allFilters.find((item) => item.key === key);
    return emptyValueFor(filter?.type);
  };

  const setValue = (key: string, value: string) => {
    if (onFilterChange) {
      onFilterChange(key, value);
      return;
    }
    if (quickFilters.some((filter) => filter.key === key)) {
      onQuickFilterChange?.(key, value);
      return;
    }
    if (advancedFilters.some((filter) => filter.key === key)) {
      onAdvancedFilterChange?.(key, value);
      return;
    }
    // Unified filters list without dedicated maps — try both handlers
    onQuickFilterChange?.(key, value);
    onAdvancedFilterChange?.(key, value);
  };

  const visibleFilters = allFilters.filter((filter) => {
    const value = getValue(filter.key);
    if (isActiveValue(value, filter.type)) return true;
    if (filter.defaultVisible) return true;
    if (manuallyVisible.has(filter.key)) return true;
    return false;
  });

  const availableToAdd = allFilters.filter((filter) => !visibleFilters.some((item) => item.key === filter.key));

  const filteredAvailable = addQuery.trim()
    ? availableToAdd.filter((filter) =>
        filter.label.toLowerCase().includes(addQuery.trim().toLowerCase())
        || (filter.placeholder ?? '').toLowerCase().includes(addQuery.trim().toLowerCase()),
      )
    : availableToAdd;

  const showAddSearch = allFilters.length > 8;

  const activeCount = allFilters.filter((filter) => isActiveValue(getValue(filter.key), filter.type)).length;

  const handleClearFilter = (key: string) => {
    const filter = allFilters.find((item) => item.key === key);
    setValue(key, emptyValueFor(filter?.type));
    setManuallyVisible((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (editingKey === key) setEditingKey(null);
  };

  const handleClearAll = () => {
    allFilters.forEach((filter) => setValue(filter.key, emptyValueFor(filter.type)));
    onSearchChange?.('');
    if (periods && periods.length > 0) {
      onPeriodChange?.(periods[0].value);
    }
    setManuallyVisible(new Set());
    setEditingKey(null);
  };

  const handleAddFilter = (key: string) => {
    setManuallyVisible((prev) => new Set(prev).add(key));
    setEditingKey(key);
    setAddOpen(false);
    setAddQuery('');
  };

  const renderEditor = (filter: FilterDef, compact = false) => {
    const value = getValue(filter.key);
    const widthClass = filter.width ?? (compact ? 'w-[160px]' : 'w-[140px]');

    if (filter.type === 'date' || filter.type === 'month') {
      return (
        <input
          type={filter.type === 'month' ? 'month' : 'date'}
          value={value}
          onChange={(event) => setValue(filter.key, event.target.value)}
          className={cn(
            'h-[34px] rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-text)]',
            widthClass,
          )}
        />
      );
    }

    return (
      <Select value={value || 'all'} onValueChange={(next) => setValue(filter.key, next)}>
        <SelectTrigger className={cn('h-[34px] border-[var(--color-border)] text-sm', widthClass)}>
          <SelectValue placeholder={filter.placeholder ?? filter.label} />
        </SelectTrigger>
        <SelectContent dir={dir}>
          <SelectItem value="all">{filter.placeholder ?? filter.label}</SelectItem>
          {(filter.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div
      dir={dir}
      className={cn(
        'mb-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        {onSearchChange != null && (
          <div className="relative min-w-[160px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="h-[34px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] ps-9 pe-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
        )}

        {periods && periods.length > 0 && (
          <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)]">
            {periods.map((period) => (
              <button
                key={period.value}
                type="button"
                onClick={() => onPeriodChange?.(period.value)}
                className={cn(
                  'h-[34px] whitespace-nowrap border-none px-3 text-xs transition-colors',
                  activePeriod === period.value
                    ? 'bg-indigo-600 font-medium text-white'
                    : 'bg-transparent text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-slate-900/40',
                )}
              >
                {period.label}
              </button>
            ))}
          </div>
        )}

        {allFilters.length > 0 && (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm',
                  availableToAdd.length === 0
                    ? 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('erpComponents.smartFilterBar.addFilter')}
                {activeCount > 0 && (
                  <span className="min-w-[16px] rounded-full bg-indigo-600 px-1.5 py-px text-center text-[10px] leading-none text-white">
                    {activeCount}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2" dir={dir}>
              <div className="mb-2 px-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                {t('erpComponents.smartFilterBar.availableFilters')}
              </div>
              {showAddSearch && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={addQuery}
                    onChange={(event) => setAddQuery(event.target.value)}
                    placeholder={resolvedSearchPlaceholder}
                    className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] ps-8 pe-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
              )}
              {filteredAvailable.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">
                  {t('erpComponents.smartFilterBar.noMoreFilters')}
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto">
                  {filteredAvailable.map((filter) => (
                    <li key={filter.key}>
                      <button
                        type="button"
                        onClick={() => handleAddFilter(filter.key)}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-start text-sm text-[var(--color-text)] hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {filter.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {allFilters.some((filter) => isActiveValue(getValue(filter.key), filter.type)) && (
                <div className="mt-2 border-t border-[var(--color-border)] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleClearAll();
                      setAddOpen(false);
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-start text-xs text-[var(--color-text-muted)] hover:bg-slate-50 hover:text-[var(--color-text)]"
                  >
                    {t('erpComponents.smartFilterBar.clearAll')}
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        {extra}

        {onApply != null && (
          <Button
            type="button"
            onClick={onApply}
            className="ms-auto flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Search className="h-3.5 w-3.5" />
            {resolvedApplyLabel}
          </Button>
        )}
      </div>

      {visibleFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] px-3 py-2">
          <span className="flex-shrink-0 text-[11px] text-[var(--color-text-muted)]">
            {t('erpComponents.smartFilterBar.activeFilters')}
          </span>
          {visibleFilters.map((filter) => {
            const value = getValue(filter.key);
            const active = isActiveValue(value, filter.type);
            const editing = editingKey === filter.key;

            if (editing) {
              return (
                <div
                  key={filter.key}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2 py-1"
                >
                  <span className="text-[11px] font-medium text-indigo-600">{filter.label}</span>
                  {renderEditor(filter, true)}
                  <button
                    type="button"
                    onClick={() => setEditingKey(null)}
                    className="rounded p-0.5 text-indigo-400 hover:text-indigo-700"
                    aria-label="done"
                  >
                    <ChevronDown className="h-3 w-3 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClearFilter(filter.key)}
                    className="rounded p-0.5 text-indigo-400 hover:text-indigo-700"
                    aria-label="clear"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            }

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setEditingKey(filter.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors',
                  active
                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    : 'border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-indigo-300 hover:text-indigo-600',
                )}
              >
                <span className={active ? 'text-indigo-500' : undefined}>{filter.label}</span>
                {active ? (
                  <>
                    <span>:</span>
                    <span className="font-medium">{displayValueLabel(filter, value)}</span>
                  </>
                ) : (
                  <span className="opacity-60">…</span>
                )}
                {active && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleClearFilter(filter.key);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        handleClearFilter(filter.key);
                      }
                    }}
                    className="ms-0.5 leading-none text-indigo-400 hover:text-indigo-700"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearAll}
              className="ms-auto h-auto p-0 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {t('erpComponents.smartFilterBar.clearAll')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

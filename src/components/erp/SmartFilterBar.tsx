import { useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export interface FilterOption {
  value: string;
  label: string;
}

export interface QuickFilter {
  key: string;
  placeholder: string;
  options: FilterOption[];
  width?: string;
}

export interface AdvancedFilter {
  key: string;
  label: string;
  placeholder: string;
  options: FilterOption[];
  width?: string;
  type?: 'select' | 'date';
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
  quickFilters?: QuickFilter[];
  quickFilterValues?: Record<string, string>;
  onQuickFilterChange?: (key: string, value: string) => void;
  advancedFilters?: AdvancedFilter[];
  advancedFilterValues?: Record<string, string>;
  onAdvancedFilterChange?: (key: string, value: string) => void;
  onApply?: () => void;
  applyLabel?: string;
  extra?: ReactNode;
  className?: string;
}

export function SmartFilterBar({
  searchPlaceholder,
  searchValue = '',
  onSearchChange,
  periods,
  activePeriod,
  onPeriodChange,
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
  const [expanded, setExpanded] = useState(false);
  const { dir } = useAppDirection();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('erpComponents.smartFilterBar.searchPlaceholder');
  const resolvedApplyLabel = applyLabel ?? t('erpComponents.smartFilterBar.applyLabel');

  const activeAdvancedCount = advancedFilters.filter((filter) => {
    const value = advancedFilterValues[filter.key];
    return value && value !== '' && value !== 'all';
  }).length;

  const activeTags: { key: string; label: string; filterLabel: string }[] = [
    ...quickFilters
      .filter((filter) => {
        const value = quickFilterValues[filter.key];
        return value && value !== '' && value !== 'all';
      })
      .map((filter) => ({
        key: filter.key,
        label: filter.options.find((option) => option.value === quickFilterValues[filter.key])?.label ?? quickFilterValues[filter.key] ?? '',
        filterLabel: filter.placeholder,
      })),
    ...advancedFilters
      .filter((filter) => {
        const value = advancedFilterValues[filter.key];
        return value && value !== '' && value !== 'all';
      })
      .map((filter) => ({
        key: filter.key,
        label: filter.options.find((option) => option.value === advancedFilterValues[filter.key])?.label
          ?? advancedFilterValues[filter.key]
          ?? '',
        filterLabel: filter.label,
      })),
  ];

  const handleClearTag = (key: string) => {
    if (quickFilters.some((filter) => filter.key === key)) {
      onQuickFilterChange?.(key, 'all');
      return;
    }
    onAdvancedFilterChange?.(key, 'all');
  };

  const handleClearAll = () => {
    quickFilters.forEach((filter) => onQuickFilterChange?.(filter.key, 'all'));
    advancedFilters.forEach((filter) => {
      onAdvancedFilterChange?.(filter.key, filter.type === 'date' ? '' : 'all');
    });
    onSearchChange?.('');
    if (periods && periods.length > 0) {
      onPeriodChange?.(periods[0].value);
    }
  };

  return (
    <div
      dir={dir}
      className={cn(
        'mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        {onSearchChange != null && (
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="h-[34px] w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
        )}

        {periods && periods.length > 0 && (
          <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-slate-200">
            {periods.map((period) => (
              <button
                key={period.value}
                type="button"
                onClick={() => onPeriodChange?.(period.value)}
                className={cn(
                  'h-[34px] whitespace-nowrap border-none px-3 text-xs transition-colors',
                  activePeriod === period.value
                    ? 'bg-[#4F46E5] font-medium text-white'
                    : 'bg-transparent text-slate-500 hover:bg-slate-50',
                )}
              >
                {period.label}
              </button>
            ))}
          </div>
        )}

        {quickFilters.map((filter) => (
          <Select
            key={filter.key}
            value={quickFilterValues[filter.key] ?? 'all'}
            onValueChange={(value) => onQuickFilterChange?.(filter.key, value)}
          >
            <SelectTrigger className={cn('h-[34px] border-slate-200 text-sm', filter.width ?? 'w-[130px]')}>
              <SelectValue placeholder={filter.placeholder} />
            </SelectTrigger>
            <SelectContent dir={dir}>
              <SelectItem value="all">{filter.placeholder}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {advancedFilters.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              'flex h-[34px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm transition-colors',
              expanded || activeAdvancedCount > 0
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t('erpComponents.smartFilterBar.advancedFilters')}
            {activeAdvancedCount > 0 && (
              <span className="min-w-[16px] rounded-full bg-[#4F46E5] px-1.5 py-px text-center text-[10px] leading-none text-white">
                {activeAdvancedCount}
              </span>
            )}
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}

        {extra}
        <div className="min-w-0 flex-1" />

        <button
          type="button"
          onClick={onApply}
          className="flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#4338CA]"
        >
          <Search className="h-3.5 w-3.5" />
          {resolvedApplyLabel}
        </button>
      </div>

      {expanded && advancedFilters.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2">
          {advancedFilters.map((filter) => (
            <div key={filter.key} className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-400">{filter.label}</label>
              {filter.type === 'date' ? (
                <input
                  type="date"
                  value={advancedFilterValues[filter.key] ?? ''}
                  onChange={(event) => onAdvancedFilterChange?.(filter.key, event.target.value)}
                  className={cn(
                    'h-[34px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600',
                    filter.width ?? 'w-[130px]',
                  )}
                />
              ) : (
                <Select
                  value={advancedFilterValues[filter.key] ?? 'all'}
                  onValueChange={(value) => onAdvancedFilterChange?.(filter.key, value)}
                >
                  <SelectTrigger className={cn('h-[34px] border-slate-200 bg-white text-sm', filter.width ?? 'w-[130px]')}>
                    <SelectValue placeholder={filter.placeholder} />
                  </SelectTrigger>
                  <SelectContent dir={dir}>
                    <SelectItem value="all">{filter.placeholder}</SelectItem>
                    {filter.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          <div className="flex-1" />
          <button
            type="button"
            onClick={handleClearAll}
            className="h-[34px] flex-shrink-0 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 transition-colors hover:bg-white"
          >
            {t('erpComponents.smartFilterBar.clearAll')}
          </button>
        </div>
      )}

      {activeTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2">
          <span className="flex-shrink-0 text-[11px] text-slate-400">{t('erpComponents.smartFilterBar.activeFilters')}</span>
          {activeTags.map((tag) => (
            <span key={tag.key} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
              <span className="text-indigo-500">{tag.filterLabel}:</span>
              <span>{tag.label}</span>
              <button
                type="button"
                onClick={() => handleClearTag(tag.key)}
                className="ml-0.5 leading-none text-indigo-400 hover:text-indigo-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleClearAll}
            className="mr-auto text-[11px] text-slate-400 hover:text-slate-600"
          >
            {t('erpComponents.smartFilterBar.clearAll')}
          </button>
        </div>
      )}
    </div>
  );
}

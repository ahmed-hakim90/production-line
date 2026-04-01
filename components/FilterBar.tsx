/**
 * ERPNext-style Filter Bar Component
 *
 * Use inside the `toolbarContent` prop of DataTable / SelectableTable, OR
 * as a standalone bar above a custom table.
 *
 * Example (standalone above table):
 *   <FilterBar
 *     search={{ value: search, onChange: setSearch, placeholder: 'بحث...' }}
 *     dateSegment={{ value: period, onChange: setPeriod, options: ['today','week','month'] }}
 *     dateRange={{ start: startDate, end: endDate, onStartChange: setStart, onEndChange: setEnd, onApply: fetchData }}
 *     selects={[
 *       { value: lineId, onChange: setLineId, options: lines.map(l => ({ label: l.name, value: l.id })), placeholder: 'كل الخطوط' },
 *     ]}
 *     onClear={handleClear}
 *     activeCount={activeFilterCount}
 *   />
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FilterSelectOption { label: string; value: string; }

export interface FilterBarProps {
  /** Built-in quick-text search */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  /** Segmented date quick-select buttons */
  dateSegment?: {
    options: { label: string; value: string }[];
    value: string;
    onChange: (v: string) => void;
  };
  /** Date range (from / to) */
  dateRange?: {
    start: string;
    end: string;
    onStartChange: (v: string) => void;
    onEndChange: (v: string) => void;
    onApply?: () => void;
    loading?: boolean;
  };
  /** Dropdown select filters */
  selects?: {
    value: string;
    onChange: (v: string) => void;
    options: FilterSelectOption[];
    placeholder?: string;
    minWidth?: number;
    hidden?: boolean;
  }[];
  /** Number of active filters (drives clear button visibility) */
  activeCount?: number;
  onClear?: () => void;
  /** Extra content appended after all controls */
  extra?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  search,
  dateSegment,
  dateRange,
  selects,
  activeCount = 0,
  onClear,
  extra,
}) => {
  const { t } = useTranslation();
  const visibleSelects = selects?.filter((s) => !s.hidden) ?? [];

  return (
    <div className="erp-filter-bar">
      <div className="flex flex-wrap items-center gap-2 w-full">
        {search && (
          <div className="erp-search-input erp-search-input--table">
            <Search className="text-[var(--color-text-muted)]" style={{ width: 15, height: 15, flexShrink: 0 }} />
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? t('filter.searchPlaceholder')}
              className="!border-0 !bg-transparent !shadow-none !ring-0 focus-visible:!ring-0"
            />
            {search.value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => search.onChange('')}
                className="h-5 w-5 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X style={{ width: 14, height: 14 }} />
              </Button>
            )}
          </div>
        )}

        {visibleSelects.map((sel, i) => (
          <Select
            key={i}
            value={sel.value || '__all__'}
            onValueChange={(value) => sel.onChange(value === '__all__' ? '' : value)}
          >
            <SelectTrigger
              className={`erp-filter-select${sel.value ? ' active' : ''}`}
              style={{ minWidth: sel.minWidth ?? 130 }}
            >
              <SelectValue placeholder={sel.placeholder ?? t('filter.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {sel.placeholder && <SelectItem value="__all__">{sel.placeholder}</SelectItem>}
              {sel.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {(dateSegment || dateRange || extra || (activeCount > 0 && onClear)) && (
        <div className="flex flex-wrap items-center gap-2 w-full">
          {dateSegment && (
            <div className="erp-date-seg">
              {dateSegment.options.map((opt) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  key={opt.value}
                  className={`erp-date-seg-btn${dateSegment.value === opt.value ? ' active' : ''}`}
                  onClick={() => dateSegment.onChange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          )}

          {dateRange && (
            <>
              <div className="erp-filter-date">
                <span className="erp-filter-label">{t('filter.from')}</span>
                <input type="date" value={dateRange.start} onChange={(e) => dateRange.onStartChange(e.target.value)} />
              </div>
              <div className="erp-filter-date">
                <span className="erp-filter-label">{t('filter.to')}</span>
                <input type="date" value={dateRange.end} onChange={(e) => dateRange.onEndChange(e.target.value)} />
              </div>
              {dateRange.onApply && (
                <Button type="button" className="erp-filter-apply" onClick={dateRange.onApply}>
                  {dateRange.loading
                    ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                    : <Search style={{ width: 14, height: 14 }} />
                  }
                  {t('filter.apply')}
                </Button>
              )}
            </>
          )}

          {extra}

          {activeCount > 0 && onClear && (
            <button className="erp-filter-clear" onClick={onClear} type="button">
              <X style={{ width: 13, height: 13 }} />
              {t('filter.clearCount', { count: activeCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

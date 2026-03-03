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
  const hasSep = (dateRange || selects?.some((s) => !s.hidden)) && (search || dateSegment);

  return (
    <div className="erp-filter-bar" style={{ flexWrap: 'wrap' }}>
      {/* Quick text search */}
      {search && (
        <div className="erp-search-input" style={{ minWidth: 200, maxWidth: 280 }}>
          <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 15, flexShrink: 0 }}>search</span>
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'بحث...'}
          />
          {search.value && (
            <button
              onClick={() => search.onChange('')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}
            >
              <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
            </button>
          )}
        </div>
      )}

      {/* Date segmented control */}
      {dateSegment && (
        <div className="erp-date-seg">
          {dateSegment.options.map((opt) => (
            <button
              key={opt.value}
              className={`erp-date-seg-btn${dateSegment.value === opt.value ? ' active' : ''}`}
              onClick={() => dateSegment.onChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Date range */}
      {dateRange && (
        <>
          <div className="erp-filter-date">
            <span className="erp-filter-label">من</span>
            <input type="date" value={dateRange.start} onChange={(e) => dateRange.onStartChange(e.target.value)} />
          </div>
          <div className="erp-filter-date">
            <span className="erp-filter-label">إلى</span>
            <input type="date" value={dateRange.end} onChange={(e) => dateRange.onEndChange(e.target.value)} />
          </div>
          {dateRange.onApply && (
            <button className="erp-filter-apply" onClick={dateRange.onApply}>
              {dateRange.loading
                ? <span className="material-icons-round" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>refresh</span>
                : <span className="material-icons-round" style={{ fontSize: 14 }}>search</span>
              }
              عرض
            </button>
          )}
        </>
      )}

      {/* Separator */}
      {hasSep && selects && selects.filter((s) => !s.hidden).length > 0 && (
        <div className="erp-filter-sep" />
      )}

      {/* Dropdown selects */}
      {selects?.filter((s) => !s.hidden).map((sel, i) => (
        <select
          key={i}
          className={`erp-filter-select${sel.value ? ' active' : ''}`}
          value={sel.value}
          onChange={(e) => sel.onChange(e.target.value)}
          style={{ minWidth: sel.minWidth ?? 130 }}
        >
          {sel.placeholder && <option value="">{sel.placeholder}</option>}
          {sel.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}

      {/* Extra content */}
      {extra}

      {/* Clear filters */}
      {activeCount > 0 && onClear && (
        <button className="erp-filter-clear" onClick={onClear}>
          <span className="material-icons-round" style={{ fontSize: 13 }}>close</span>
          مسح ({activeCount})
        </button>
      )}
    </div>
  );
};

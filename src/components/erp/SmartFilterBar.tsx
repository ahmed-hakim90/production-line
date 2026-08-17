import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, X, ChevronDown, Pin, Trash2, Check } from 'lucide-react';
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
import {
  createFavoriteId,
  deleteFavorite,
  getPinnedFavorite,
  loadFavorites,
  setFavoritePinned,
  upsertFavorite,
  type FilterFavorite,
  type FilterFavoriteSnapshot,
} from './filterFavoritesStorage';

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
  /** Stable page key for local favorites (e.g. materials-list). */
  pageId?: string;
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
  pageId,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [menuEditingKey, setMenuEditingKey] = useState<string | null>(null);
  const [manuallyVisible, setManuallyVisible] = useState<Set<string>>(() => new Set());
  const [menuQuery, setMenuQuery] = useState('');
  const [favorites, setFavorites] = useState<FilterFavorite[]>([]);
  const [saveName, setSaveName] = useState('');
  const [savePinned, setSavePinned] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const pinnedAppliedRef = useRef(false);

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
    onQuickFilterChange?.(key, value);
    onAdvancedFilterChange?.(key, value);
  };

  const buildSnapshot = (): FilterFavoriteSnapshot => {
    const values: Record<string, string> = {};
    allFilters.forEach((filter) => {
      values[filter.key] = getValue(filter.key);
    });
    const visibleKeys = allFilters
      .filter((filter) => {
        const value = getValue(filter.key);
        if (isActiveValue(value, filter.type)) return true;
        if (filter.defaultVisible) return true;
        if (manuallyVisible.has(filter.key)) return true;
        return false;
      })
      .map((filter) => filter.key);

    return {
      search: searchValue ?? '',
      period: activePeriod,
      values,
      visibleKeys,
    };
  };

  const applySnapshot = (snapshot: FilterFavoriteSnapshot) => {
    onSearchChange?.(snapshot.search ?? '');
    if (snapshot.period != null && periods && periods.length > 0) {
      onPeriodChange?.(snapshot.period);
    }
    Object.entries(snapshot.values ?? {}).forEach(([key, value]) => {
      setValue(key, value);
    });
    setManuallyVisible(new Set(snapshot.visibleKeys ?? []));
    setEditingKey(null);
    setMenuEditingKey(null);
  };

  useEffect(() => {
    if (!pageId) {
      setFavorites([]);
      return;
    }
    setFavorites(loadFavorites(pageId));
  }, [pageId]);

  useEffect(() => {
    pinnedAppliedRef.current = false;
  }, [pageId]);

  useEffect(() => {
    if (!pageId || pinnedAppliedRef.current) return;
    const pinned = getPinnedFavorite(pageId);
    if (!pinned) {
      pinnedAppliedRef.current = true;
      return;
    }
    pinnedAppliedRef.current = true;
    applySnapshot(pinned.snapshot);
    // Intentionally run once per pageId mount for default favorite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const menuFilters = menuQuery.trim()
    ? allFilters.filter((filter) =>
        filter.label.toLowerCase().includes(menuQuery.trim().toLowerCase())
        || (filter.placeholder ?? '').toLowerCase().includes(menuQuery.trim().toLowerCase()),
      )
    : allFilters;

  const showMenuSearch = allFilters.length > 8;
  const activeCount = allFilters.filter((filter) => isActiveValue(getValue(filter.key), filter.type)).length;
  const showFilterMenu = allFilters.length > 0 || Boolean(pageId);

  const handleClearFilter = (key: string) => {
    const filter = allFilters.find((item) => item.key === key);
    setValue(key, emptyValueFor(filter?.type));
    setManuallyVisible((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (editingKey === key) setEditingKey(null);
    if (menuEditingKey === key) setMenuEditingKey(null);
  };

  const handleClearAll = () => {
    allFilters.forEach((filter) => setValue(filter.key, emptyValueFor(filter.type)));
    onSearchChange?.('');
    if (periods && periods.length > 0) {
      onPeriodChange?.(periods[0].value);
    }
    setManuallyVisible(new Set());
    setEditingKey(null);
    setMenuEditingKey(null);
  };

  const handleActivateFilter = (key: string) => {
    setManuallyVisible((prev) => new Set(prev).add(key));
    setMenuEditingKey(key);
    setEditingKey(key);
  };

  const handleSaveFavorite = () => {
    if (!pageId) return;
    const name = saveName.trim();
    if (!name) return;
    const favorite: FilterFavorite = {
      id: createFavoriteId(),
      name,
      pinned: savePinned,
      createdAt: Date.now(),
      snapshot: buildSnapshot(),
    };
    const next = upsertFavorite(pageId, favorite);
    setFavorites(next);
    setSaveName('');
    setSavePinned(false);
    setShowSaveForm(false);
  };

  const handleApplyFavorite = (favorite: FilterFavorite) => {
    applySnapshot(favorite.snapshot);
    setMenuOpen(false);
  };

  const handleTogglePin = (favorite: FilterFavorite) => {
    if (!pageId) return;
    setFavorites(setFavoritePinned(pageId, favorite.id, !favorite.pinned));
  };

  const handleDeleteFavorite = (favoriteId: string) => {
    if (!pageId) return;
    setFavorites(deleteFavorite(pageId, favoriteId));
  };

  const renderEditor = (filter: FilterDef, compact = false) => {
    const value = getValue(filter.key);
    const widthClass = filter.width ?? (compact ? 'w-[160px]' : 'w-full min-w-[140px]');

    if (filter.type === 'date' || filter.type === 'month') {
      return (
        <input
          type={filter.type === 'month' ? 'month' : 'date'}
          value={value}
          onChange={(event) => setValue(filter.key, event.target.value)}
          className={cn(
            'h-[var(--control-height)] rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-text)]',
            widthClass,
          )}
        />
      );
    }

    return (
      <Select value={value || 'all'} onValueChange={(next) => setValue(filter.key, next)}>
        <SelectTrigger className={cn('h-[var(--control-height)] border-[var(--color-border)] bg-[var(--color-card)] text-sm', widthClass)}>
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

  const renderMenuOptions = (filter: FilterDef) => {
    if (filter.type === 'date' || filter.type === 'month') {
      return (
        <div className="px-2 pb-2 pt-1">
          {renderEditor(filter, false)}
        </div>
      );
    }

    const value = getValue(filter.key);
    const options: FilterOption[] = [
      { value: 'all', label: filter.placeholder ?? filter.label },
      ...(filter.options ?? []),
    ];

    return (
      <ul className="ms-2 mb-1 max-h-44 overflow-y-auto border-s border-[var(--color-border)] ps-1">
        {options.map((option) => {
          const selected = (value || 'all') === option.value;
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => {
                  if (option.value === 'all') {
                    handleClearFilter(filter.key);
                  } else {
                    setManuallyVisible((prev) => new Set(prev).add(filter.key));
                    setValue(filter.key, option.value);
                  }
                  setMenuEditingKey(null);
                  setMenuOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-[rgb(var(--color-primary)/0.06)] hover:text-[rgb(var(--color-primary))]',
                  selected && 'bg-[rgb(var(--color-primary)/0.08)] font-medium text-[rgb(var(--color-primary))]',
                )}
              >
                <span className="truncate">{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5 flex-shrink-0" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  const filterMenu = (
    <Popover
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) {
          setMenuQuery('');
          setMenuEditingKey(null);
          setShowSaveForm(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="filter"
          className={cn(
            'flex h-full min-h-0 flex-shrink-0 items-center gap-1 rounded-[var(--border-radius-base)] border-0 px-2 shadow-none hover:bg-[rgb(var(--color-primary)/0.06)]',
            activeCount > 0 ? 'text-[rgb(var(--color-primary))]' : 'text-[var(--color-text-muted)]',
          )}
          aria-label={t('erpComponents.smartFilterBar.filters')}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-180')} />
          {activeCount > 0 && (
            <span className="min-w-[16px] rounded-full bg-[rgb(var(--color-primary))] px-1.5 py-px text-center text-[10px] leading-none text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" dir={dir}>
        <div className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {t('erpComponents.smartFilterBar.filters')}
        </div>

        {allFilters.length > 0 && (
          <div className="p-2">
            {showMenuSearch && (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  value={menuQuery}
                  onChange={(event) => setMenuQuery(event.target.value)}
                  placeholder={resolvedSearchPlaceholder}
                  className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] ps-8 pe-2 text-xs focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary)/0.35)]"
                />
              </div>
            )}
            {menuFilters.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">
                {t('erpComponents.smartFilterBar.noMoreFilters')}
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {menuFilters.map((filter) => {
                  const value = getValue(filter.key);
                  const active = isActiveValue(value, filter.type);
                  const expanded = menuEditingKey === filter.key;
                  return (
                    <li key={filter.key} className="mb-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (expanded) {
                            setMenuEditingKey(null);
                            return;
                          }
                          handleActivateFilter(filter.key);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-[rgb(var(--color-primary)/0.06)] hover:text-[rgb(var(--color-primary))]',
                          active && 'bg-[rgb(var(--color-primary)/0.08)] text-[rgb(var(--color-primary))]',
                        )}
                      >
                        <span className="truncate">{filter.label}</span>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                          {active ? (
                            <span className="max-w-[100px] truncate font-medium text-[rgb(var(--color-primary))]">
                              {displayValueLabel(filter, value)}
                            </span>
                          ) : null}
                          {active ? <Check className="h-3.5 w-3.5 text-[rgb(var(--color-primary))]" /> : null}
                          <ChevronDown className={cn('h-3 w-3', expanded && 'rotate-180')} />
                        </span>
                      </button>
                      {expanded && renderMenuOptions(filter)}
                    </li>
                  );
                })}
              </ul>
            )}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  handleClearAll();
                  setMenuOpen(false);
                }}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-start text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                {t('erpComponents.smartFilterBar.clearAll')}
              </button>
            )}
          </div>
        )}

        {pageId && (
          <div className="border-t border-[var(--color-border)]">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {t('erpComponents.smartFilterBar.favorites')}
            </div>
            <div className="p-2 pt-0">
              {favorites.length === 0 && !showSaveForm ? (
                <p className="px-2 py-2 text-center text-xs text-[var(--color-text-muted)]">
                  {t('erpComponents.smartFilterBar.noFavorites')}
                </p>
              ) : (
                <ul className="mb-2 max-h-40 overflow-y-auto">
                  {favorites.map((favorite) => (
                    <li
                      key={favorite.id}
                      className="group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--color-surface-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleApplyFavorite(favorite)}
                        className="min-w-0 flex-1 truncate rounded px-1 py-1.5 text-start text-sm hover:text-[rgb(var(--color-primary))]"
                        title={t('erpComponents.smartFilterBar.applyFavorite')}
                      >
                        {favorite.pinned && (
                          <Pin className="me-1 inline h-3 w-3 fill-[rgb(var(--color-primary))] text-[rgb(var(--color-primary))]" />
                        )}
                        {favorite.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePin(favorite)}
                        className={cn(
                          'rounded p-1 text-[var(--color-text-muted)] hover:bg-[rgb(var(--color-primary)/0.06)] hover:text-[rgb(var(--color-primary))]',
                          favorite.pinned && 'text-[rgb(var(--color-primary))]',
                        )}
                        title={t('erpComponents.smartFilterBar.pinDefault')}
                      >
                        <Pin className={cn('h-3.5 w-3.5', favorite.pinned && 'fill-current')} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFavorite(favorite.id)}
                        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[rgb(var(--color-danger)/0.1)] hover:text-[rgb(var(--color-danger))]"
                        title={t('erpComponents.smartFilterBar.deleteFavorite')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {showSaveForm ? (
                <div className="space-y-2 rounded-md border border-[var(--color-border)] p-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder={t('erpComponents.smartFilterBar.favoriteName')}
                    className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary)/0.35)]"
                    autoFocus
                  />
                  <label className="flex items-center gap-2 text-xs text-[var(--color-text)]">
                    <input
                      type="checkbox"
                      checked={savePinned}
                      onChange={(event) => setSavePinned(event.target.checked)}
                      className="rounded border-[var(--color-border)]"
                    />
                    {t('erpComponents.smartFilterBar.pinDefault')}
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={handleSaveFavorite}
                      disabled={!saveName.trim()}
                    >
                      {t('erpComponents.smartFilterBar.saveCurrent')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowSaveForm(false);
                        setSaveName('');
                        setSavePinned(false);
                      }}
                    >
                      {t('erpComponents.smartFilterBar.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSaveForm(true)}
                  className="w-full rounded-md px-2 py-1.5 text-start text-xs font-medium text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.06)]"
                >
                  {t('erpComponents.smartFilterBar.saveCurrent')}
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  const activeFacets = allFilters.filter((filter) => isActiveValue(getValue(filter.key), filter.type));

  const renderFacetChip = (filter: FilterDef) => {
    const value = getValue(filter.key);
    const chipClass =
      'inline-flex h-[var(--control-height-sm)] max-w-[220px] items-center gap-1 truncate rounded-none border-0 bg-transparent px-2.5 text-start text-[var(--font-size-xs)] text-[rgb(var(--color-primary))] shadow-none hover:bg-[rgb(var(--color-primary)/0.08)] focus:ring-0';

    const clearButton = (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleClearFilter(filter.key);
        }}
        className="flex h-[var(--control-height-sm)] items-center border-s border-[rgb(var(--color-primary)/0.2)] px-1.5 text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.12)]"
        aria-label={t('erpComponents.smartFilterBar.clearFilter')}
      >
        <X className="h-3 w-3" />
      </button>
    );

    const chipShellClass =
      'inline-flex h-[var(--control-height-sm)] max-w-full items-center overflow-hidden rounded-[var(--border-radius-base)] border border-[rgb(var(--color-primary)/0.18)] bg-[rgb(var(--color-primary)/0.08)] text-[var(--font-size-xs)] text-[rgb(var(--color-primary))]';

    // Dates: open native picker directly from the chip (no intermediate box).
    if (filter.type === 'date' || filter.type === 'month') {
      return (
        <div key={filter.key} className={chipShellClass}>
          <label className={cn(chipClass, 'relative cursor-pointer')}>
            <span className="truncate opacity-80">{filter.label}</span>
            <span className="opacity-50">:</span>
            <span className="truncate font-semibold">{displayValueLabel(filter, value)}</span>
            <input
              type={filter.type === 'month' ? 'month' : 'date'}
              value={value}
              onChange={(event) => setValue(filter.key, event.target.value)}
              onClick={(event) => {
                const input = event.currentTarget;
                try {
                  input.showPicker?.();
                } catch {
                  // Older browsers fall back to default date UI.
                }
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={filter.label}
            />
          </label>
          {clearButton}
        </div>
      );
    }

    // Selects: chip itself is the select trigger — list opens immediately.
    return (
      <div key={filter.key} className={chipShellClass}>
        <Select
          value={value || 'all'}
          onValueChange={(next) => {
            if (next === 'all') {
              handleClearFilter(filter.key);
              return;
            }
            setValue(filter.key, next);
          }}
          open={editingKey === filter.key}
          onOpenChange={(open) => setEditingKey(open ? filter.key : null)}
        >
          <SelectTrigger
            className={cn(chipClass, '[&>svg]:hidden')}
            title={`${filter.label}: ${displayValueLabel(filter, value)}`}
          >
            <span className="truncate opacity-80">{filter.label}</span>
            <span className="opacity-50">:</span>
            <span className="truncate font-semibold">{displayValueLabel(filter, value)}</span>
          </SelectTrigger>
          <SelectContent dir={dir} align="start" className="min-w-[10rem]">
            <SelectItem value="all">{filter.placeholder ?? filter.label}</SelectItem>
            {(filter.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clearButton}
      </div>
    );
  };

  const showSearchControl = onSearchChange != null || showFilterMenu;
  const hasTrailingActions = Boolean((periods && periods.length > 0) || extra || onApply != null);

  return (
    <div dir={dir} className="erp-smart-filter">
      {/*
        Primary row: search + filter menu | period seg | actions
        Active facets render on a second row so heights/radii stay aligned.
      */}
      <div
        className={cn(
          'flex flex-col gap-[var(--filter-bar-gap)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] px-[var(--filter-bar-pad-x)] py-[var(--filter-bar-pad-y)] mb-4',
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-[var(--filter-bar-gap)]">
          {showSearchControl && (
            <div className="erp-search-input erp-search-input--table min-h-[var(--control-height)]">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" aria-hidden />
              {onSearchChange != null ? (
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  placeholder={resolvedSearchPlaceholder}
                  autoComplete="off"
                  className="min-w-[120px] flex-1"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text-muted)]">
                  {t('erpComponents.smartFilterBar.filters')}
                </span>
              )}
              {showFilterMenu ? filterMenu : null}
            </div>
          )}

          {hasTrailingActions && (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-[var(--filter-bar-gap)] ms-auto">
              {periods && periods.length > 0 && (
                <div className="erp-date-seg" role="group">
                  {periods.map((period) => (
                    <button
                      key={period.value}
                      type="button"
                      onClick={() => onPeriodChange?.(period.value)}
                      className={cn('erp-date-seg-btn', activePeriod === period.value && 'active')}
                      aria-pressed={activePeriod === period.value}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
              )}

              {extra}

              {onApply != null && (
                <Button
                  type="button"
                  onClick={onApply}
                  bare
                  size="filter"
                  className="flex-shrink-0 bg-[rgb(var(--color-primary))] px-4 text-white hover:bg-[rgb(var(--color-primary-hover))]"
                >
                  {resolvedApplyLabel}
                </Button>
              )}
            </div>
          )}
        </div>

        {activeFacets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFacets.map((filter) => renderFacetChip(filter))}
          </div>
        )}
      </div>
    </div>
  );
}

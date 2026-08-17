import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn, getRootPortalContainer } from '@/lib/utils';
import { FLOATING_MENU_Z_CLASS } from '@/lib/overlayStack';
import { toEnglishDigits } from '@/lib/englishDigits';
import { findItemOptionByCode, type TransferItemOption } from '../utils/transferFormShared';

export type VoucherItemComboboxOption = {
  value: string;
  /** Display label (name + available) — no system code. */
  label: string;
  /** Extra searchable text (code / barcode); not shown as primary label. */
  searchText?: string;
};

export type VoucherItemComboboxProps = {
  options: VoucherItemComboboxOption[];
  catalog: TransferItemOption[];
  value: string;
  onChange: (itemId: string) => void;
  /** Called after a selection so parent can move focus (shelf / qty). */
  onSelected?: (itemId: string) => void;
  /**
   * Grid navigation when the dropdown is closed.
   * Return true if the event was handled (parent moves focus).
   */
  onGridKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

function normalizeQuery(raw: string): string {
  return toEnglishDigits(String(raw || '')).trim().toLowerCase();
}

type ListBoxStyle = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Single field for voucher lines: type-to-search, barcode Enter, dropdown pick.
 * List shows name + availability only; codes stay in search matching only.
 * Dropdown is portaled + fixed so parent overflow-hidden cannot clip it.
 */
export const VoucherItemCombobox = forwardRef<HTMLInputElement, VoucherItemComboboxProps>(
  function VoucherItemCombobox(
    {
      options,
      catalog,
      value,
      onChange,
      onSelected,
      onGridKeyDown,
      placeholder = 'ابحث بالاسم أو امسح الكود',
      disabled = false,
      className = '',
      id,
    },
    ref,
  ) {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef(0);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const [listStyle, setListStyle] = useState<ListBoxStyle | null>(null);

    const selectedLabel = useMemo(
      () => options.find((o) => o.value === value)?.label ?? '',
      [options, value],
    );

    useEffect(() => {
      if (!open) setQuery('');
    }, [open, value]);

    const filtered = useMemo(() => {
      const q = normalizeQuery(query);
      if (!q) return options.slice(0, 80);
      return options
        .filter((opt) => {
          const hay = normalizeQuery(`${opt.label} ${opt.searchText || ''} ${opt.value}`);
          return hay.includes(q);
        })
        .slice(0, 80);
    }, [options, query]);

    const moveHighlight = useCallback((next: number) => {
      const max = Math.max(0, filtered.length - 1);
      const clamped = Math.max(0, Math.min(next, max));
      highlightRef.current = clamped;
      setHighlight(clamped);
    }, [filtered.length]);

    // Reset highlight only when the search query changes — not when opening via arrows.
    useEffect(() => {
      highlightRef.current = 0;
      setHighlight(0);
    }, [query]);

    // Keep highlight in range when the filtered list shrinks.
    useEffect(() => {
      if (highlightRef.current > Math.max(0, filtered.length - 1)) {
        moveHighlight(Math.max(0, filtered.length - 1));
      }
    }, [filtered.length, moveHighlight]);

    useEffect(() => {
      if (!open || !listRef.current) return;
      const el = listRef.current.querySelector<HTMLElement>(
        `[data-voucher-opt-index="${highlight}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    }, [highlight, open, filtered.length]);

    const updateListPosition = useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
      const spaceAbove = rect.top - gap - 12;
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, Math.min(256, preferBelow ? spaceBelow : spaceAbove));
      const top = preferBelow
        ? rect.bottom + gap
        : Math.max(8, rect.top - gap - maxHeight);
      setListStyle({
        top,
        left: rect.left,
        width: Math.max(rect.width, 200),
        maxHeight,
      });
    }, []);

    useLayoutEffect(() => {
      if (!open || disabled) {
        setListStyle(null);
        return;
      }
      updateListPosition();
      const onReposition = () => updateListPosition();
      window.addEventListener('resize', onReposition);
      window.addEventListener('scroll', onReposition, true);
      return () => {
        window.removeEventListener('resize', onReposition);
        window.removeEventListener('scroll', onReposition, true);
      };
    }, [open, disabled, filtered.length, updateListPosition]);

    const commit = useCallback(
      (itemId: string) => {
        if (!itemId) return;
        onChange(itemId);
        setOpen(false);
        setQuery('');
        onSelected?.(itemId);
      },
      [onChange, onSelected],
    );

    const tryExactCode = useCallback(
      (raw: string): boolean => {
        const matched = findItemOptionByCode(catalog, raw);
        if (!matched) return false;
        commit(matched.id);
        return true;
      },
      [catalog, commit],
    );

    useEffect(() => {
      const onDocPointer = (event: MouseEvent) => {
        const target = event.target as Node;
        if (rootRef.current?.contains(target)) return;
        if (listRef.current?.contains(target)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', onDocPointer);
      return () => document.removeEventListener('mousedown', onDocPointer);
    }, []);

    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const openList = useCallback(() => {
      if (disabled) return;
      setOpen(true);
      const selectedIdx = value
        ? filtered.findIndex((opt) => opt.value === value)
        : -1;
      moveHighlight(selectedIdx >= 0 ? selectedIdx : highlightRef.current);
    }, [disabled, filtered, moveHighlight, value]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === 'ArrowDown' || e.key === 'Down') {
          if (!open && onGridKeyDown?.(e)) return;
          e.preventDefault();
          e.stopPropagation();
          if (!open) {
            setOpen(true);
            moveHighlight(0);
            return;
          }
          moveHighlight(highlightRef.current + 1);
          return;
        }

        if (e.key === 'ArrowUp' || e.key === 'Up') {
          if (!open && onGridKeyDown?.(e)) return;
          e.preventDefault();
          e.stopPropagation();
          if (!open) {
            setOpen(true);
            moveHighlight(Math.max(0, filtered.length - 1));
            return;
          }
          moveHighlight(highlightRef.current - 1);
          return;
        }

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Left' || e.key === 'Right') && !open) {
          if (onGridKeyDown?.(e)) return;
        }

        if (e.key === 'Home' && open) {
          e.preventDefault();
          e.stopPropagation();
          moveHighlight(0);
          return;
        }

        if (e.key === 'End' && open) {
          e.preventDefault();
          e.stopPropagation();
          moveHighlight(filtered.length - 1);
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          setQuery('');
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const typed = open ? query : '';
          if (typed && tryExactCode(typed)) return;
          if (filtered.length > 0) {
            const pick = filtered[Math.min(highlightRef.current, filtered.length - 1)];
            if (pick) commit(pick.value);
          }
        }
      },
      [commit, disabled, filtered, moveHighlight, onGridKeyDown, open, query, tryExactCode],
    );

    const portalTarget = getRootPortalContainer() ?? (typeof document !== 'undefined' ? document.body : null);

    const listbox =
      open && !disabled && listStyle && portalTarget
        ? createPortal(
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              dir="rtl"
              style={{
                position: 'fixed',
                top: listStyle.top,
                left: listStyle.left,
                width: listStyle.width,
                maxHeight: listStyle.maxHeight,
                zIndex: 10100,
                margin: 0,
                padding: 0,
                overflow: 'auto',
                listStyle: 'none',
                borderRadius: 'var(--border-radius-base, 12px)',
                border: '1px solid var(--color-border, #e5e7eb)',
                backgroundColor: 'var(--color-card, #ffffff)',
                color: 'var(--color-text, #0f172a)',
                boxShadow: 'var(--shadow-dropdown, 0 4px 12px rgba(0,0,0,0.12))',
              }}
              className={cn(FLOATING_MENU_Z_CLASS, 'erp-surface')}
            >
              {filtered.length === 0 ? (
                <div
                  className="px-3 py-2.5 text-[12px]"
                  style={{ color: 'var(--color-text-muted, #64748b)' }}
                >
                  لا نتائج
                </div>
              ) : (
                filtered.map((opt, idx) => {
                  const active = idx === highlight;
                  return (
                    <button
                      key={opt.value || `opt-${idx}`}
                      id={`${listId}-opt-${idx}`}
                      type="button"
                      role="option"
                      data-voucher-opt-index={idx}
                      aria-selected={active}
                      style={{
                        display: 'block',
                        width: '100%',
                        margin: 0,
                        padding: '10px 12px',
                        border: 0,
                        borderBottom:
                          idx < filtered.length - 1
                            ? '1px solid var(--color-border, #e5e7eb)'
                            : 0,
                        backgroundColor: active ? 'rgba(79, 70, 229, 0.14)' : 'transparent',
                        color: 'inherit',
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: active ? 700 : 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        lineHeight: 1.45,
                      }}
                      className="hover:bg-[rgb(var(--color-primary)/0.08)]"
                      onMouseEnter={() => moveHighlight(idx)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        commit(opt.value);
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })
              )}
            </div>,
            portalTarget,
          )
        : null;

    return (
      <div ref={rootRef} className={cn('relative w-full', className)}>
        <div className="relative">
          <span
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-3 text-[var(--color-text-muted)]"
            aria-hidden
          >
            <span className="material-icons-round text-[18px]">qr_code_scanner</span>
          </span>
          <input
            ref={setRefs}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && filtered[highlight]
                ? `${listId}-opt-${highlight}`
                : undefined
            }
            disabled={disabled}
            autoComplete="off"
            className={cn(
              'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] pe-10 ps-3 py-2.5 text-[13px] min-h-[42px]',
              'bg-[var(--color-bg)] text-[var(--color-text)] outline-none',
              'focus:border-[rgb(var(--color-primary))] focus:bg-[var(--color-card)]',
              'focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.12)] transition-all font-medium',
              disabled && 'opacity-70 cursor-not-allowed',
            )}
            placeholder={placeholder}
            value={open ? query : selectedLabel}
            onFocus={() => {
              if (disabled) return;
              openList();
              setQuery('');
            }}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setOpen(true);
              if (value) onChange('');
              if (next.trim()) tryExactCode(next);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {listbox}
      </div>
    );
  },
);

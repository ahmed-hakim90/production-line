
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-[var(--color-card)] rounded-[var(--border-radius-lg,8px)] border border-[var(--color-border)] overflow-hidden ${onClick ? 'cursor-pointer hover:border-primary/30 hover:shadow-md transition-shadow' : ''} ${className}`}
    style={{ boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.08))' }}
  >
    {title && (
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">{title}</h3>
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
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
    className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg,8px)] border border-[var(--color-border)] flex items-center gap-3.5"
    style={{ boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.08))' }}
  >
    <div className={`w-10 h-10 ${colorClass} rounded-[var(--border-radius-base,6px)] flex items-center justify-center shrink-0`}>
      <span className="material-icons-round text-[20px]">{icon}</span>
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[11.5px] text-[var(--color-text-muted)] mb-0.5 font-medium leading-tight">{label}</p>
      <h3 className="text-[18px] font-bold flex items-baseline gap-1 leading-tight text-[var(--color-text)]">
        {value}
        {unit && <span className="text-[11px] font-normal text-[var(--color-text-muted)]">{unit}</span>}
      </h3>
      {trend && (
        <div className={`flex items-center gap-0.5 text-[11px] mt-0.5 font-semibold ${trendUp ? 'text-emerald-600' : 'text-rose-500'}`}>
          <span className="material-icons-round text-[12px]">{trendUp ? 'trending_up' : 'trending_down'}</span>
          <span>{trend}</span>
        </div>
      )}
    </div>
  </div>
);

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', pulse }) => {
  const styles = {
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger:  'bg-rose-50 text-rose-700 border border-rose-200',
    info:    'bg-blue-50 text-blue-700 border border-blue-200',
    neutral: 'bg-[#f0f2f5] text-[var(--color-text-muted)] border border-[var(--color-border)]',
  };
  const dotStyles = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger:  'bg-rose-500',
    info:    'bg-blue-500',
    neutral: 'bg-[var(--color-text-muted)]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${styles[variant]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles[variant]} ${pulse ? 'animate-pulse' : ''}`} />
      {children}
    </span>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number; type?: 'card' | 'table' | 'detail' }> = ({ rows = 4, type = 'card' }) => {
  const skeletonBase = 'bg-[#e8eaed] rounded animate-pulse';
  if (type === 'detail') {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 ${skeletonBase} rounded-[var(--border-radius-lg)]`} />
          <div className="flex-1 space-y-2">
            <div className={`h-4 ${skeletonBase} w-1/3`} />
            <div className={`h-3 ${skeletonBase} w-1/4`} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <div className={`h-3 ${skeletonBase} w-2/3 mb-2`} />
              <div className={`h-6 ${skeletonBase} w-1/2`} />
            </div>
          ))}
        </div>
        <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] h-48">
          <div className={`h-3 ${skeletonBase} w-1/4 mb-3`} />
          <div className={`h-full ${skeletonBase} opacity-50`} />
        </div>
      </div>
    );
  }
  if (type === 'table') {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className={`h-4 ${skeletonBase} flex-1`} />
            <div className={`h-4 ${skeletonBase} w-16`} />
            <div className={`h-4 ${skeletonBase} w-12`} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className={`h-4 ${skeletonBase} w-2/3 mb-3`} />
          <div className={`h-3 ${skeletonBase} w-1/2 mb-2`} />
          <div className={`h-3 ${skeletonBase} w-full mb-1.5`} />
          <div className={`h-3 ${skeletonBase} w-4/5`} />
        </div>
      ))}
    </div>
  );
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' }> = ({ children, variant = 'primary', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[var(--border-radius-base,6px)] text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:   'bg-primary text-white hover:bg-primary/90',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline:   'border border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-card)] hover:bg-[#f0f2f5]',
    ghost:     'text-[var(--color-text-muted)] hover:bg-[#f0f2f5] hover:text-[var(--color-text)]',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
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
  placeholder = 'اختر...',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = !!containerRef.current?.contains(target);
      const insideMenu = !!menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    // On mobile, focusing while input is still readOnly may block keyboard.
    // Focus again after render so the soft keyboard opens reliably.
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const placeTop = spaceAbove > spaceBelow;

      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        maxHeight: Math.max(120, Math.min(320, placeTop ? spaceAbove - 8 : spaceBelow - 8)),
        ...(placeTop
          ? { top: rect.top - 4, transform: 'translateY(-100%)' }
          : { top: rect.bottom + 4 }),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const handleInputFocus = () => {
    setOpen(true);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={[
          'w-full border rounded-[var(--border-radius-base)] text-[13px] font-medium transition-all flex items-center gap-2 cursor-text',
          open
            ? 'border-primary ring-2 ring-primary/15 bg-[var(--color-card)]'
            : 'border-[var(--color-border)] bg-[#f8f9fa] hover:border-primary/30',
        ].join(' ')}
        onClick={() => { setOpen(true); }}
      >
        <span className="material-icons-round text-[var(--color-text-muted)] text-[18px] pr-3 pl-1 shrink-0">search</span>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none outline-none py-2 pl-3 text-[13px] text-[var(--color-text)] placeholder-[var(--color-text-muted)] min-w-0"
          placeholder={placeholder}
          value={open ? query : selectedLabel}
          readOnly={!open}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
          >
            <span className="material-icons-round text-[15px]">close</span>
          </button>
        )}
        <span className={`material-icons-round text-[var(--color-text-muted)] text-[18px] ml-2 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ ...menuStyle, boxShadow: 'var(--shadow-dropdown)' }}
          className="erp-dropdown"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-[12.5px] text-[var(--color-text-muted)] text-center">لا توجد نتائج</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`erp-dropdown-item${opt.value === value ? ' selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.value === value && (
                  <span className="material-icons-round text-[rgb(var(--color-primary))] text-[14px] shrink-0">check</span>
                )}
                <span className="truncate">{opt.label}</span>
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
